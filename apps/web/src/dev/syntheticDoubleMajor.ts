import {buildDoubleMajorAudit, type DoubleMajorAttempt, type DoubleMajorRequest, type MajorRulePack} from '../../../../packages/core/src/academics/double-major.js';
import type {DoubleMajorPort} from '../features/double-major/DoubleMajorPanel.js';

/**
 * Dev/test-only #144 stand-in: runs the merged pure double-major core (#147) on a hand-shaped SYNTHETIC
 * transcript and rule packs. Not official rules; never in a production build. 1 unit = 0.5학점.
 *
 * Only S01 shares academics in the synthetic corpus, so only S01 gets a transcript, and it is built to
 * match S01's 졸업 요건 현황 summary (95 / 18 / 12학점, rule pack SYN-RULE-DEMO-1, SYN-REQ-MAJOR-CORE 3학점
 * short). The two sections of one screen never describe two different students.
 */
const course = (id: string, ledger: DoubleMajorAttempt['ledger'] = 'EARNED', creditUnits = 6): DoubleMajorAttempt => ({
  attemptToken: `${id}-T`, canonicalCourseId: id, creditUnits, ledger, recognition: 'RECOGNIZED',
  term: ledger === 'EARNED' ? '2025-2' : ledger === 'IN_PROGRESS' ? '2026-2' : '2027-1',
});
const range = (prefix: string, n: number, ledger?: DoubleMajorAttempt['ledger']) =>
  Array.from({length: n}, (_, i) => course(`${prefix}${i + 1}`, ledger));

/** P = primary only, D = double major only, S = shared by both, G = general education. */
const S01_ATTEMPTS: DoubleMajorAttempt[] = [
  ...range('SYN-P', 6), course('SYN-S1'), ...range('SYN-D', 5), ...range('SYN-G', 19), course('SYN-G20', 'EARNED', 4), // 190 earned
  course('SYN-D6', 'IN_PROGRESS'), ...range('SYN-GI', 5, 'IN_PROGRESS'), // 36 in progress
  ...range('SYN-GP', 4, 'PLANNED'), // 24 planned
];
const areas = (ids: readonly string[], area: string) => Object.fromEntries(ids.map(id => [id, [area]]));
const PRIMARY: MajorRulePack = {
  rulePackVersion: 'SYN-RULE-DEMO-1', rulePackState: 'APPROVED',
  requirements: [
    {id: 'SYN-REQ-TOTAL', kind: 'CREDIT_TOTAL', requiredCreditUnits: 260, evidenceRefs: ['EV-SYN-RULE-1']},
    {id: 'SYN-REQ-MAJOR-CORE', kind: 'CATEGORY_MINIMUM', areaId: 'SYN-P-MAJOR', requiredCreditUnits: 48, evidenceRefs: ['EV-SYN-RULE-1']},
    {id: 'SYN-REQ-GRAD-CERT', kind: 'NON_CREDIT', criterionId: 'SYN-GRAD-CERT', verificationMode: 'MANUAL', evidenceRefs: ['EV-SYN-RULE-2']},
  ],
  courseAreas: areas(['SYN-P1', 'SYN-P2', 'SYN-P3', 'SYN-P4', 'SYN-P5', 'SYN-P6', 'SYN-S1'], 'SYN-P-MAJOR'),
};
const DOUBLE: MajorRulePack = {
  rulePackVersion: 'SYN-DOUBLE-DEMO-1', rulePackState: 'APPROVED',
  requirements: [
    {id: 'SYN-DM-MAJOR-MIN', kind: 'CATEGORY_MINIMUM', areaId: 'SYN-D-MAJOR', requiredCreditUnits: 36, evidenceRefs: ['EV-SYN-DM-1']},
    {id: 'SYN-DM-REQ', kind: 'REQUIRED_COURSE', canonicalCourseId: 'SYN-D1', evidenceRefs: ['EV-SYN-DM-1']},
  ],
  courseAreas: areas(['SYN-D1', 'SYN-D2', 'SYN-D3', 'SYN-D4', 'SYN-D5', 'SYN-D6', 'SYN-S1'], 'SYN-D-MAJOR'),
};

/** Every selection the screen must handle; the demo uses SHARED_UNDECIDED for S01. */
export const DOUBLE_MAJOR_CASES = {
  SHARED_UNDECIDED: {status: 'SELECTED', pack: DOUBLE},
  NONE: {status: 'NONE'},
  COVERED: {status: 'SELECTED', pack: {...DOUBLE, overlapRule: {maxSharedCreditUnits: 12, evidenceRefs: ['EV-SYN-DM-OVERLAP']}}},
  UNSET: {status: 'UNSET'},
  RULES_MISSING: {status: 'SELECTED'},
} as const satisfies Record<string, DoubleMajorRequest['doubleMajor']>;
export type DoubleMajorCase = keyof typeof DOUBLE_MAJOR_CASES;

export function syntheticDoubleMajorPort(options: {delayMs?: number; forceCase?: DoubleMajorCase} = {}): DoubleMajorPort {
  const delay = options.delayMs ?? 150;
  return {
    async forContext(ctx, asOf, signal) {
      await new Promise<void>((resolve, reject) => {
        if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
        const t = setTimeout(resolve, delay);
        signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, {once: true});
      });
      if (ctx.demoSubjectId !== 'S01') return null;
      const selection = DOUBLE_MAJOR_CASES[options.forceCase ?? 'SHARED_UNDECIDED'];
      return buildDoubleMajorAudit({asOf, attempts: S01_ATTEMPTS, primary: PRIMARY, doubleMajor: selection});
    },
  };
}
