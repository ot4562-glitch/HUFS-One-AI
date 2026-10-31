import {ISODateTimeSchema, TopicCodeSchema, type TopicCode} from '@hufs-one/contracts';
import {byCodeUnit} from './dedupe.js';

/** Structural subset of contracts vNext `VerifiedClaimVNext` (TASK-18, PR #33). */
export interface ClaimRecord {
  claimId:string;
  sourceRevisionId:string;
  field:string;
  value:string|number|boolean;
  state:'CANDIDATE'|'NEEDS_REVIEW'|'VERIFIED'|'REJECTED'|'STALE';
  dateKind?:'APPLY'|'STUDENT'|'ADMIN'|'EVENT';
}

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
  /** Claims that were present but not usable (not VERIFIED, wrong revision, wrong kind, bad value). */
  ignoredClaimIds:string[];
}

/**
 * Deadlines come only from VERIFIED claims on the current revision with the matching date kind.
 * Model confidence (Laya/HCX) is not an input here and can never confirm a date.
 */
export function resolveDeadlineClaims(claims:readonly ClaimRecord[], currentRevisionId:string):ResolvedDates {
  const values = new Map<DeadlineField, Set<string>>();
  const ignored:string[] = [];
  for (const c of claims) {
    const field = c.field as DeadlineField;
    const kind = Object.hasOwn(DATE_FIELDS, field) ? DATE_FIELDS[field] : undefined;
    const usable = kind !== undefined && c.state === 'VERIFIED' && c.sourceRevisionId === currentRevisionId &&
      c.dateKind === kind && typeof c.value === 'string' && ISODateTimeSchema.safeParse(c.value).success;
    if (!usable) { if (kind !== undefined) ignored.push(c.claimId); continue; }
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
  return {dates, conflicts, ignoredClaimIds:ignored.sort(byCodeUnit)};
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
