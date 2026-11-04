import {OwnerStudyPlanCheckResponseSchema} from '@hufs-one/contracts';
import {DEMO_AS_OF} from '../../../../packages/core/src/opportunities/index.js';
import type {PlanCheckPort} from '../features/plan-check/PlanCheckPanel.js';

/**
 * Dev/test-only #81 stand-in for POST /api/study-plans/check: hand-shaped SYNTHETIC responses for S01 (the
 * only subject whose academics are shared), schema-checked against the owner contract. No approved rule
 * pack, so no cap and no confirmed warnings — exactly what the contract allows today. Never in a
 * production build.
 */
const TERMS = ['2027-1', '2027-2'] as const;

export function syntheticPlanCheckPort(options: {delayMs?: number} = {}): PlanCheckPort {
  const delay = options.delayMs ?? 150;
  return {
    terms: TERMS,
    async check(ctx, term, signal) {
      await new Promise<void>((resolve, reject) => {
        if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
        const t = setTimeout(resolve, delay);
        signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, {once: true});
      });
      if (ctx.demoSubjectId !== 'S01') return null;
      const asOf = DEMO_AS_OF; // the synthetic corpus pins every snapshot here
      if (term === '2027-2') return null; // no saved plan for that term yet
      return OwnerStudyPlanCheckResponseSchema.parse({
        state: 'NEEDS_REVIEW', asOf, term,
        versions: {plan: 'SYN-PLAN-S01-1', transcript: 'SYN-TR-S01-1'},
        termLoadCreditUnits: 36,
        planIssues: [
          {code: 'NEEDS_REVIEW', courseRefs: ['SYN-C-STAT201'], evidenceRefs: [], reasonCode: 'COURSE_NOT_CONFIRMED'},
        ],
        unchecked: [{courseId: 'SYN-C-ML301', reason: 'CREDITS_UNKNOWN'}],
        evidenceLinks: [],
        caveats: ['NOT_OFFICIAL_REGISTRATION', 'NOT_GRADUATION_DECISION', 'RULEPACK_UNVERIFIED', 'TERM_RULES_UNVERIFIED', 'SECTIONS_UNCONFIRMED'],
        disclosure: {mode: 'OWNER_VERIFIED', visibleCourseRefs: ['SYN-C-STAT201', 'SYN-C-ML301']},
      });
    },
  };
}
