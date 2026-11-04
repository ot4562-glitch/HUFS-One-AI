import {
  OpportunityRevisionComparisonResponseSchema, compareReviewedOpportunityRevisionClaims,
  type OpportunityComparisonRevision, type OpportunityRevisionComparisonResponse,
} from '@hufs-one/contracts';
import type {RevisionPort} from '../features/revisions/RevisionComparison.js';

/**
 * Dev-only #119 stand-in: hand-shaped SYNTHETIC correction pairs for a few demo postings
 * (extended, cancelled, eligibility changed, still under review). Field states and change kinds are
 * computed by the contract's own compareReviewedOpportunityRevisionClaims and the whole response is
 * schema-checked, so the screen sees exactly what the real wire could carry. Never in a production build.
 */
const sha = (c: string) => c.repeat(64);
const rev = (id: string, opportunityId: string, captured: string, claims: OpportunityComparisonRevision['claims'], c: string): OpportunityComparisonRevision => ({
  revisionId: id, sourceId: `SYN-SRC-${opportunityId}`, opportunityId,
  capturedAt: captured, checkedAt: captured, verifiedAt: captured,
  contentSha256: sha(c), dataMode: 'SYNTHETIC', deliveryMode: 'VERIFIED_CACHE', claims,
});
const ev = (n: string) => [`EV-SYN-REV-${n}`];
const enrolled = [{field: 'enrollment', operator: 'EQ', value: 'ENROLLED'}] as const;

const PAIRS: Record<string, {before: OpportunityComparisonRevision; after: OpportunityComparisonRevision} | {reason: 'REVISION_NOT_REVIEWED'}> = {
  // 마감 연장 11/27 → 12/02
  'SYN-OPP-002': {
    before: rev('SYN-REV-002-r1', 'SYN-OPP-002', '2026-11-05T01:00:00.000Z', [
      {field: 'DEADLINE', value: {kind: 'FIXED', at: '2026-11-27T00:00:00.000Z'}, evidenceRefs: ev('002-1')},
      {field: 'STATUS', value: 'OPEN', evidenceRefs: ev('002-2')},
    ], 'a'),
    after: rev('SYN-REV-002-r2', 'SYN-OPP-002', '2026-11-18T01:00:00.000Z', [
      {field: 'DEADLINE', value: {kind: 'FIXED', at: '2026-12-02T00:00:00.000Z'}, evidenceRefs: ev('002-3')},
      {field: 'STATUS', value: 'OPEN', evidenceRefs: ev('002-4')},
    ], 'b'),
  },
  // 모집 취소
  'SYN-OPP-008': {
    before: rev('SYN-REV-008-r1', 'SYN-OPP-008', '2026-11-08T01:00:00.000Z', [
      {field: 'STATUS', value: 'OPEN', evidenceRefs: ev('008-1')},
    ], 'c'),
    after: rev('SYN-REV-008-r2', 'SYN-OPP-008', '2026-11-19T01:00:00.000Z', [
      {field: 'STATUS', value: 'CANCELLED', evidenceRefs: ev('008-2')},
    ], 'd'),
  },
  // 지원 조건 변경 (재학생만 → 재학·졸업생)
  'SYN-OPP-021': {
    before: rev('SYN-REV-021-r1', 'SYN-OPP-021', '2026-11-10T01:00:00.000Z', [
      {field: 'ELIGIBILITY', value: [...enrolled], evidenceRefs: ev('021-1')},
    ], 'e'),
    after: rev('SYN-REV-021-r2', 'SYN-OPP-021', '2026-11-17T01:00:00.000Z', [
      {field: 'ELIGIBILITY', value: [{field: 'enrollment', operator: 'IN', value: ['ENROLLED', 'GRADUATED']}], evidenceRefs: ev('021-2')},
    ], 'f'),
  },
  // 새 판본 미검수
  'SYN-OPP-029': {reason: 'REVISION_NOT_REVIEWED'},
};

export function syntheticRevisionPort(options: {delayMs?: number} = {}): RevisionPort {
  const delay = options.delayMs ?? 150;
  return {
    async forOpportunity(opportunityId, asOf, signal) {
      await new Promise<void>((resolve, reject) => {
        if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
        const t = setTimeout(resolve, delay);
        signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, {once: true});
      });
      const p = PAIRS[opportunityId];
      if (!p) return null;
      if ('reason' in p) {
        return OpportunityRevisionComparisonResponseSchema.parse({
          state: 'NEEDS_REVIEW', reason: p.reason, opportunityId, asOf,
          beforeRevisionId: `SYN-REV-${opportunityId.slice(-3)}-r1`, afterRevisionId: `SYN-REV-${opportunityId.slice(-3)}-r2`,
        });
      }
      const {comparisons, changes} = compareReviewedOpportunityRevisionClaims(p.before, p.after);
      const res: OpportunityRevisionComparisonResponse = OpportunityRevisionComparisonResponseSchema.parse({
        state: 'READY', opportunityId, asOf, beforeRevisionId: p.before.revisionId, afterRevisionId: p.after.revisionId,
        before: p.before, after: p.after, comparisons, changes,
      });
      return res;
    },
  };
}
