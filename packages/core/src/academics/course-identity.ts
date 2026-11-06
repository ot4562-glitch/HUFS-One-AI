import {AcademicAuditVNextSchema, type AcademicAuditVNext} from '@hufs-one/contracts';
import {
  assertId, assertUnits, buildAcademicLedger, termKey,
  type AcademicLedgerRequest, type LedgerAttempt, type LedgerRecognition, type LedgerSlot,
} from './ledger.js';

/**
 * Credit ledger for transcripts whose course codes are not all confirmed (#11).
 *
 * Each row says which kind it is. A RESOLVED row has a confirmed canonical course id and goes to
 * the ordinary ledger unchanged. A NEEDS_REVIEW row has only the source row's opaque token: no
 * course id, no areas. It is never given a placeholder id, never counted, and never dropped
 * silently. It is listed, and every requirement row it could change is held for review.
 *
 * Which rows count as unresolved comes from the caller. The API does not send them yet:
 * see COURSE_IDENTITY_API_CONNECTION.
 * Pure: no clock, network, or randomness.
 */

/** The API adapters still require a canonical course id on every row (#276/#282). */
export const COURSE_IDENTITY_API_CONNECTION = 'NOT_CONNECTED' as const;

export type ResolvedLedgerAttempt = LedgerAttempt & {identity:'RESOLVED'};

/** A source row whose course code or equivalence is not confirmed. */
export interface UnresolvedLedgerAttempt {
  identity:'NEEDS_REVIEW';
  /** Opaque token of the source row. Not a course id. */
  attemptToken:string;
  creditUnits:number;
  ledger:LedgerSlot;
  recognition:LedgerRecognition;
  term?:string;
  supersedesAttemptToken?:string;
  retakeApprovalRef?:string;
}

export type IdentifiedLedgerAttempt = ResolvedLedgerAttempt | UnresolvedLedgerAttempt;

export interface IdentifiedLedgerRequest extends Omit<AcademicLedgerRequest, 'attempts'> {
  attempts:readonly IdentifiedLedgerAttempt[];
}

export interface UnresolvedCourseSummary {
  /** Unresolved rows, in input order. */
  attemptTokens:string[];
  /** Resolved rows joined to an unresolved row by a retake link, in input order. */
  linkedAttemptTokens:string[];
  /** Requirement rows an unresolved row could change, in request order. */
  affectedRequirementIds:string[];
}

export interface IdentifiedLedgerResult {
  audit:AcademicAuditVNext;
  unresolved:UnresolvedCourseSummary;
}

const UNRESOLVED_KEYS = new Set([
  'identity', 'attemptToken', 'creditUnits', 'ledger', 'recognition', 'term', 'supersedesAttemptToken', 'retakeApprovalRef',
]);
const MAX_EXCLUDED = 150;

function checkUnresolved(row:UnresolvedLedgerAttempt):void {
  assertId(row.attemptToken, 'attemptToken');
  if ('canonicalCourseId' in row) {
    throw new TypeError(`unresolved attempt ${row.attemptToken} must not carry canonicalCourseId; a placeholder course id is refused`);
  }
  if ('areaIds' in row) {
    throw new TypeError(`unresolved attempt ${row.attemptToken} must not carry areaIds; areas come from a confirmed course`);
  }
  for (const key of Object.keys(row)) {
    if (!UNRESOLVED_KEYS.has(key)) throw new TypeError(`unresolved attempt ${row.attemptToken} has unknown field ${key}`);
  }
  assertUnits(row.creditUnits, `creditUnits of ${row.attemptToken}`);
  if (row.ledger !== 'EARNED' && row.ledger !== 'IN_PROGRESS' && row.ledger !== 'PLANNED') {
    throw new TypeError(`${row.attemptToken} has no ledger slot`);
  }
  if (row.recognition !== 'RECOGNIZED' && row.recognition !== 'PENDING' && row.recognition !== 'EXCLUDED') {
    throw new TypeError(`${row.attemptToken} has no recognition`);
  }
  if (row.term !== undefined) termKey(row.term);
  if (row.supersedesAttemptToken !== undefined) assertId(row.supersedesAttemptToken, 'supersedesAttemptToken');
  if (row.retakeApprovalRef !== undefined) assertId(row.retakeApprovalRef, 'retakeApprovalRef');
}

/**
 * The ordinary ledger over RESOLVED rows, plus a list of NEEDS_REVIEW rows and what they hold.
 *
 * - Credits and areas come from RESOLVED rows only. Nothing is added for an unresolved row.
 * - An unresolved row could be any course, including one already on the transcript. So when it is
 *   RECOGNIZED, or a retake link touches it, every requirement row that reads attempts is held
 *   as NEEDS_REVIEW. The counted numbers stay, but SATISFIED or UNSATISFIED is not confirmed.
 * - An unresolved PENDING or EXCLUDED row with no retake link cannot change any requirement row in
 *   the ordinary ledger, whatever course it turns out to be. Rows keep their state.
 * - A resolved row that an unresolved row claims to supersede stays counted. A resolved row that
 *   claims to supersede an unresolved row is held, as the ordinary ledger holds a retake whose
 *   target it cannot see.
 * - With any unresolved row the audit is never READY.
 */
export function buildLedgerWithCourseIdentity(input:IdentifiedLedgerRequest):IdentifiedLedgerResult {
  if (!Array.isArray(input.attempts)) throw new TypeError('attempts must be an array');
  const resolved:LedgerAttempt[] = [];
  const unresolved:UnresolvedLedgerAttempt[] = [];
  const tokens = new Set<string>();
  for (const row of input.attempts) {
    const identity = (row as {identity?:unknown}).identity;
    if (identity === 'RESOLVED') {
      const {identity:_drop, ...attempt} = row as ResolvedLedgerAttempt;
      resolved.push(attempt);
    } else if (identity === 'NEEDS_REVIEW') {
      checkUnresolved(row as UnresolvedLedgerAttempt);
      unresolved.push(row as UnresolvedLedgerAttempt);
    } else {
      throw new TypeError('every attempt needs identity RESOLVED or NEEDS_REVIEW');
    }
    if (tokens.has(row.attemptToken)) throw new TypeError(`duplicate attempt ${row.attemptToken}`);
    tokens.add(row.attemptToken);
  }

  const base = buildAcademicLedger({...input, attempts:resolved});
  if (unresolved.length === 0) return {audit:base, unresolved:{attemptTokens:[], linkedAttemptTokens:[], affectedRequirementIds:[]}};
  if (base.excludedAttempts.length + unresolved.length > MAX_EXCLUDED) throw new RangeError('too many excluded attempts');

  const unresolvedTokens = new Set(unresolved.map(row => row.attemptToken));
  const linkedUnresolved = new Set<string>();
  const linkedResolved = new Set<string>();
  for (const row of input.attempts) {
    const target = row.supersedesAttemptToken;
    if (target === undefined) continue;
    if (unresolvedTokens.has(row.attemptToken)) {
      linkedUnresolved.add(row.attemptToken);
      if (tokens.has(target) && !unresolvedTokens.has(target)) linkedResolved.add(target);
    }
    if (unresolvedTokens.has(target)) {
      linkedUnresolved.add(target);
      if (!unresolvedTokens.has(row.attemptToken)) linkedResolved.add(row.attemptToken);
    }
  }
  const live = unresolved.some(row => row.recognition === 'RECOGNIZED' || linkedUnresolved.has(row.attemptToken));

  const readsAttempts = new Set(input.requirements.filter(r => r.kind !== 'NON_CREDIT').map(r => r.id));
  const affectedRequirementIds = live ? input.requirements.filter(r => readsAttempts.has(r.id)).map(r => r.id) : [];
  const affected = new Set(affectedRequirementIds);
  const requirements = base.requirements.map(row =>
    affected.has(row.requirementId) && (row.state === 'SATISFIED' || row.state === 'UNSATISFIED')
      ? {...row, state:'NEEDS_REVIEW' as const}
      : row);

  const baseReasons = new Map(base.excludedAttempts.map(row => [row.attemptToken, row.reason]));
  const excludedAttempts = input.attempts.flatMap(row => {
    if (unresolvedTokens.has(row.attemptToken)) return [{attemptToken:row.attemptToken, reason:'NEEDS_REVIEW' as const}];
    const reason = baseReasons.get(row.attemptToken);
    return reason ? [{attemptToken:row.attemptToken, reason}] : [];
  });

  const caveats = [...base.caveats,
    `${unresolved.length} course row(s) have no confirmed course code; they are not counted in any credit or area total.`];
  if (live) caveats.push('Requirement rows those course rows could change are held for review; the numbers shown come from confirmed rows only.');
  if (linkedUnresolved.size > 0) caveats.push('A retake link touches a course row without a confirmed code; the linked attempts are not settled.');

  const parsed = AcademicAuditVNextSchema.safeParse({
    ...base,
    state:base.state === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT_DATA' : 'NEEDS_REVIEW',
    excludedAttempts,
    requirements,
    caveats,
  });
  if (!parsed.success) {
    throw new TypeError(`academic ledger result is not a valid audit: ${parsed.error.issues.map(issue => issue.message).join('; ')}`);
  }
  return {
    audit:parsed.data,
    unresolved:{
      attemptTokens:unresolved.map(row => row.attemptToken),
      linkedAttemptTokens:input.attempts.filter(row => linkedResolved.has(row.attemptToken)).map(row => row.attemptToken),
      affectedRequirementIds,
    },
  };
}
