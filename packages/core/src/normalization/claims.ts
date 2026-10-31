import {ISODateTimeSchema, TopicCodeSchema, type TopicCode} from '@hufs-one/contracts';
import {byCodeUnit} from './dedupe.js';

/** TEXT evidence span: structural subset of contracts vNext `SourceSpanVNext` (kind 'TEXT'). */
export interface ClaimTextSpan {
  kind:'TEXT';
  sourceRevisionId:string;
  paragraphId:string;
  startCodePoint:number;
  endCodePoint:number;
  quote:string;
}
/** Any non-TEXT span (e.g. IMAGE) — the core cannot verify it and therefore never trusts it. */
export interface ClaimOtherSpan {kind:string; sourceRevisionId:string}

/** Structural subset of contracts vNext `VerifiedClaimVNext` (TASK-18, PR #33). */
export interface ClaimRecord {
  claimId:string;
  sourceRevisionId:string;
  field:string;
  value:string|number|boolean;
  state:'CANDIDATE'|'NEEDS_REVIEW'|'VERIFIED'|'REJECTED'|'STALE';
  dateKind?:'APPLY'|'STUDENT'|'ADMIN'|'EVENT';
  /** When the reviewer verified it. Must be ≤ asOf: a later verification was unknown at asOf. */
  claimCheckedAt?:string;
  /** Who verified it. Reviewer authority itself is checked by the API, not here. */
  reviewerId?:string;
  evidence:readonly (ClaimTextSpan|ClaimOtherSpan)[];
}

export interface ResolveClaimOptions {
  currentRevisionId:string;
  asOf:string;
  /** Trusted paragraphs of the current revision; every TEXT span must quote them exactly. */
  paragraphs:readonly {revisionId:string; paragraphId:string; text:string}[];
}

export type ClaimRejection =
  | 'NOT_VERIFIED'|'OTHER_REVISION'|'WRONG_DATE_KIND'|'BAD_VALUE'
  | 'NO_REVIEWER'|'CHECKED_AFTER_ASOF'|'BAD_CHECK_TIME'|'NO_EVIDENCE'|'EVIDENCE_MISMATCH'|'UNVERIFIABLE_EVIDENCE';

/** Which date kind may fill which deadline field. EVENT dates never fill a deadline (A05.1). */
const DATE_FIELDS = {
  applyClosesAt:'APPLY',
  studentDeadline:'STUDENT',
  adminReportDeadline:'ADMIN',
} as const;
export type DeadlineField = keyof typeof DATE_FIELDS;

export interface ResolvedDates {
  dates:Partial<Record<DeadlineField, string>>;
  /** Fields with two different VERIFIED values on the same revision: left unset, needs review. */
  conflicts:DeadlineField[];
  /** Deadline claims not used, with the first failing reason (sorted by claimId). */
  ignored:{claimId:string; reason:ClaimRejection}[];
}

/** Same check as contracts vNext `matchesTextSpan`: exact Unicode code-point slice of a trusted paragraph. */
function spanMatches(span:ClaimTextSpan, paragraphs:ResolveClaimOptions['paragraphs']):boolean {
  const p = paragraphs.find(x => x.revisionId === span.sourceRevisionId && x.paragraphId === span.paragraphId);
  if (!p || !Number.isInteger(span.startCodePoint) || !Number.isInteger(span.endCodePoint) || span.startCodePoint < 0 || span.startCodePoint >= span.endCodePoint) return false;
  const cps = Array.from(p.text);
  return span.endCodePoint <= cps.length && cps.slice(span.startCodePoint, span.endCodePoint).join('') === span.quote;
}

function rejectReason(c:ClaimRecord, kind:string, opts:ResolveClaimOptions, now:number):ClaimRejection|undefined {
  if (c.state !== 'VERIFIED') return 'NOT_VERIFIED';
  if (c.sourceRevisionId !== opts.currentRevisionId) return 'OTHER_REVISION';
  if (c.dateKind !== kind) return 'WRONG_DATE_KIND';
  if (typeof c.value !== 'string' || !ISODateTimeSchema.safeParse(c.value).success) return 'BAD_VALUE';
  if (!c.reviewerId || c.reviewerId.trim() === '') return 'NO_REVIEWER';
  if (c.claimCheckedAt === undefined || !ISODateTimeSchema.safeParse(c.claimCheckedAt).success) return 'BAD_CHECK_TIME';
  if (Date.parse(c.claimCheckedAt) > now) return 'CHECKED_AFTER_ASOF';
  if (c.evidence.length === 0) return 'NO_EVIDENCE';
  for (const span of c.evidence) {
    if (span.sourceRevisionId !== opts.currentRevisionId) return 'OTHER_REVISION';
    if (span.kind !== 'TEXT') return 'UNVERIFIABLE_EVIDENCE';
    if (!spanMatches(span as ClaimTextSpan, opts.paragraphs)) return 'EVIDENCE_MISMATCH';
  }
  return undefined;
}

/**
 * Deadlines come only from claims that were VERIFIED **at or before asOf** by a named reviewer, on the
 * current revision, with the matching date kind and exact TEXT evidence from that revision.
 * Model confidence (Laya/HCX) is not an input here and can never confirm a date. IMAGE evidence is
 * not trusted by the core; the API must verify it (contracts `matchesImageSpan`) and pass a TEXT span.
 */
export function resolveDeadlineClaims(claims:readonly ClaimRecord[], opts:ResolveClaimOptions):ResolvedDates {
  const now = Date.parse(opts.asOf);
  if (!Number.isFinite(now)) throw new RangeError('asOf must be an ISO datetime');
  const values = new Map<DeadlineField, Set<string>>();
  const ignored:ResolvedDates['ignored'] = [];
  for (const c of claims) {
    const field = c.field as DeadlineField;
    const kind = Object.hasOwn(DATE_FIELDS, field) ? DATE_FIELDS[field] : undefined;
    if (kind === undefined) continue;
    const reason = rejectReason(c, kind, opts, now);
    if (reason) { ignored.push({claimId:c.claimId, reason}); continue; }
    values.set(field, (values.get(field) ?? new Set()).add(new Date(c.value as string).toISOString()));
  }
  const dates:ResolvedDates['dates'] = {};
  const conflicts:DeadlineField[] = [];
  for (const field of Object.keys(DATE_FIELDS) as DeadlineField[]) {
    const set = values.get(field);
    if (!set) continue;
    if (set.size === 1) dates[field] = [...set][0]!;
    else conflicts.push(field);
  }
  return {dates, conflicts, ignored:ignored.sort((a, b) => byCodeUnit(a.claimId, b.claimId))};
}

export interface TopicCandidate {code:unknown; paragraphId:string; quote:string}
export interface TopicCandidateCheck {
  /** Codes that passed: still CANDIDATE — a person/owner approves before they count. */
  accepted:TopicCode[];
  rejected:{code:unknown; reason:'NOT_IN_ENUM'|'NOT_ALLOWED'|'QUOTE_NOT_IN_SOURCE'}[];
}

/**
 * Re-checks AI topic candidates (A06 opportunity_terms / experience_skills) that arrived through the
 * API's validated pipeline: closed enum, allowed list of the packet, and a literal quote in the
 * referenced trusted paragraph. Passing never grants eligibility or verification.
 */
export function checkTopicCandidates(
  candidates:readonly TopicCandidate[],
  allowedTopicCodes:readonly TopicCode[],
  paragraphs:readonly {id:string; text:string}[],
):TopicCandidateCheck {
  const textById = new Map(paragraphs.map(p => [p.id, p.text.normalize('NFC')]));
  const accepted:TopicCode[] = [];
  const rejected:TopicCandidateCheck['rejected'] = [];
  for (const c of candidates) {
    const code = TopicCodeSchema.safeParse(c.code);
    if (!code.success) { rejected.push({code:c.code, reason:'NOT_IN_ENUM'}); continue; }
    if (!allowedTopicCodes.includes(code.data)) { rejected.push({code:c.code, reason:'NOT_ALLOWED'}); continue; }
    const text = textById.get(c.paragraphId);
    const quote = c.quote.normalize('NFC').trim();
    if (!text || quote === '' || !text.includes(quote)) { rejected.push({code:c.code, reason:'QUOTE_NOT_IN_SOURCE'}); continue; }
    if (!accepted.includes(code.data)) accepted.push(code.data);
  }
  return {accepted, rejected};
}
