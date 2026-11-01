import {AcademicAuditVNextSchema, type AcademicAuditVNext} from '@hufs-one/contracts';
import {byCodeUnit} from './ledger.js';

/**
 * Hand-off from the academic audit to the notice core (A07.1, NoticeStudent.openRequirementIds).
 * Returns the requirement ids a notice may link to, or null when academics are unknown.
 * null means "not known", never "nothing open": the notice core then keeps requirement
 * notices with an UNKNOWN badge instead of dropping them to GENERAL.
 * Open = UNSATISFIED, NEEDS_REVIEW, or NOT_CHECKED. A requirement is closed only when it is
 * SATISFIED or officially NOT_APPLICABLE, so an unverified row never hides a notice.
 */
const OPEN:ReadonlySet<AcademicAuditVNext['requirements'][number]['state']> = new Set([
  'UNSATISFIED', 'NEEDS_REVIEW', 'NOT_CHECKED',
]);

export function openRequirementIdsFromAudit(audit:AcademicAuditVNext|null|undefined):string[]|null {
  if (audit === null || audit === undefined) return null;
  const parsed = AcademicAuditVNextSchema.safeParse(audit);
  if (!parsed.success) throw new TypeError('openRequirementIdsFromAudit needs a valid academic audit');
  if (parsed.data.state === 'INSUFFICIENT_DATA') return null;
  return parsed.data.requirements
    .filter(row => OPEN.has(row.state))
    .map(row => row.requirementId)
    .sort(byCodeUnit);
}
