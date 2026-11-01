import {describe, expect, it} from 'vitest';
import type {LedgerAttempt} from './ledger.js';
import type {VerifiedSection} from './plan.js';
import {simulateStudyPlan, type StudyPlanCheckRequest} from './study-plan.js';

/** Synthetic only. 1 unit = 0.5학점, so 3학점 is 6 units and an 18학점 cap is 36 units. */
const AS_OF = '2026-11-01T00:00:00.000Z';
const TERM = '2027-1';
const CAP_REF = 'SYN-SEMESTER-CAP';

const item = (courseId:string, targetTerm = TERM, planned = true) =>
  ({kind:'STUDY_PLAN', dataMode:'SYNTHETIC', state:'DRAFT', courseId, targetTerm, planned});

const TRANSCRIPT:LedgerAttempt[] = [
  {attemptToken:'SYN-T-A', canonicalCourseId:'SYN-A', creditUnits:6, ledger:'EARNED', areaIds:[], recognition:'RECOGNIZED', term:'2025-2'},
  {attemptToken:'SYN-T-B', canonicalCourseId:'SYN-B', creditUnits:6, ledger:'IN_PROGRESS', areaIds:[], recognition:'RECOGNIZED', term:'2026-2'},
];

const SEVEN = ['SYN-P1', 'SYN-P2', 'SYN-P3', 'SYN-P4', 'SYN-P5', 'SYN-P6', 'SYN-P7'];
const CATALOG:Record<string, number> = Object.fromEntries(
  [...SEVEN, 'SYN-ADV', 'SYN-ADV2', 'SYN-ADV3', 'SYN-X', 'SYN-Y', 'SYN-C', 'SYN-D'].map(id => [id, 6]),
);

/** One verified section per course, each in its own hour, so no timetable issue appears. */
const sections = (courseIds:readonly string[]):VerifiedSection[] => courseIds.map((courseId, index) => ({
  canonicalCourseId:courseId, sectionId:`${courseId}-01`, term:TERM,
  meetings:[{day:'TUE', startMinute:(8 + index) * 60, endMinute:(9 + index) * 60}],
  evidenceRefs:['SYN-CATALOG-2027-1'], verifiedAt:'2026-10-15T00:00:00.000Z',
}));

const request = (studyPlan:unknown[], over:Partial<StudyPlanCheckRequest> = {}):StudyPlanCheckRequest => {
  const termCourses = studyPlan
    .map(raw => raw as ReturnType<typeof item>)
    .filter(raw => raw.planned && raw.targetTerm === TERM)
    .map(raw => raw.courseId);
  return {
    asOf:AS_OF, term:TERM,
    rulePack:{version:'SYN-PACK-1', state:'APPROVED'},
    attempts:TRANSCRIPT,
    studyPlan,
    courseCreditUnits:CATALOG,
    termRules:{creditCapUnits:36, capEvidenceRefs:[CAP_REF]},
    sections:sections([...new Set(termCourses)]),
    versions:{rulePack:'SYN-PACK-1', plan:'SYN-PLAN-V3', catalog:'SYN-CAT-2027-1', transcript:'SYN-TR-V2'},
    ...over,
  };
};

describe('simulateStudyPlan', () => {
  it('turns saved plan items into the #62 cap check and reports the term load next to the cap', () => {
    const result = simulateStudyPlan(request(SEVEN.map(id => item(id))));
    expect(result).toMatchObject({
      state:'READY', term:TERM, termLoadCreditUnits:42, creditCapUnits:36, unchecked:[],
      versions:{rulePack:'SYN-PACK-1', plan:'SYN-PLAN-V3', catalog:'SYN-CAT-2027-1', transcript:'SYN-TR-V2'},
    });
    expect(result.planIssues).toEqual([{code:'CREDIT_CAP_EXCEEDED', reasonCode:'EXCEEDS_APPROVED_LIMIT', courseRefs:SEVEN, evidenceRefs:[CAP_REF]}]);
  });

  it('counts only the checked term in the load', () => {
    const result = simulateStudyPlan(request([item('SYN-C'), item('SYN-D', '2027-2')]));
    expect(result.termLoadCreditUnits).toBe(6);
    expect(result.planIssues).toEqual([]);
  });

  it('checks prerequisites against the transcript and earlier planned terms', () => {
    const prerequisites = [
      {canonicalCourseId:'SYN-ADV', requiresCourseIds:['SYN-A'], evidenceRefs:['SYN-PREREQ-1']},
      {canonicalCourseId:'SYN-ADV2', requiresCourseIds:['SYN-B'], evidenceRefs:['SYN-PREREQ-2']},
      {canonicalCourseId:'SYN-ADV3', requiresCourseIds:['SYN-X', 'SYN-Y'], evidenceRefs:['SYN-PREREQ-3']},
    ];
    const plan = [item('SYN-ADV'), item('SYN-ADV2'), item('SYN-ADV3'), item('SYN-X', '2027-2'), item('SYN-Y', '2026-2')];
    const result = simulateStudyPlan(request(plan, {termRules:{creditCapUnits:36, capEvidenceRefs:[CAP_REF], prerequisites}}));
    expect(result.planIssues).toEqual([
      {code:'NEEDS_REVIEW', reasonCode:'UNKNOWN', courseRefs:['SYN-ADV2', 'SYN-B'], evidenceRefs:['SYN-PREREQ-2']},
      {code:'PREREQUISITE_MISSING', reasonCode:'UNMET_OFFICIAL_PREREQUISITE', courseRefs:['SYN-ADV3', 'SYN-X'], evidenceRefs:['SYN-PREREQ-3']},
      {code:'NEEDS_REVIEW', reasonCode:'UNKNOWN', courseRefs:['SYN-ADV3', 'SYN-Y'], evidenceRefs:['SYN-PREREQ-3']},
    ]);
    expect(result.state).toBe('NEEDS_REVIEW');
  });

  it('reports a timetable conflict from verified sections only', () => {
    const clash = ['SYN-C', 'SYN-D'].map(courseId => ({
      canonicalCourseId:courseId, sectionId:`${courseId}-01`, term:TERM,
      meetings:[{day:'MON' as const, startMinute:540, endMinute:660}],
      evidenceRefs:['SYN-CATALOG-2027-1'], verifiedAt:'2026-10-15T00:00:00.000Z',
    }));
    const result = simulateStudyPlan(request([item('SYN-C'), item('SYN-D')], {sections:clash}));
    expect(result.planIssues.map(issue => [issue.code, issue.courseRefs])).toEqual([['TIMETABLE_CONFLICT', ['SYN-C', 'SYN-D']]]);
  });

  it('lists planned courses it could not check and keeps them out of the load', () => {
    const plan = [item('SYN-C'), item('SYN-D', 'UNDECIDED'), item('SYN-P1', '2026-1'), item('SYN-NOT-IN-CATALOG')];
    const result = simulateStudyPlan(request(plan));
    expect(result.unchecked).toEqual([
      {courseId:'SYN-D', reason:'TERM_UNDECIDED'},
      {courseId:'SYN-NOT-IN-CATALOG', reason:'CREDITS_UNKNOWN'},
      {courseId:'SYN-P1', reason:'TERM_ENDED'},
    ]);
    expect(result.termLoadCreditUnits).toBe(6);
    expect(result.state).toBe('NEEDS_REVIEW');
  });

  it('ignores items marked not planned and counts a repeated item once', () => {
    const result = simulateStudyPlan(request([item('SYN-C'), item('SYN-C'), item('SYN-D', TERM, false)]));
    expect(result.termLoadCreditUnits).toBe(6);
    expect(result.planIssues).toEqual([]);
  });

  it('hides the cap and holds warnings for review without an approved rule pack', () => {
    const draft = simulateStudyPlan(request(SEVEN.map(id => item(id)), {rulePack:{version:'SYN-PACK-1', state:'DRAFT'}}));
    expect(draft.creditCapUnits).toBeUndefined();
    expect(draft.planIssues.map(issue => issue.code)).toEqual(['NEEDS_REVIEW']);
    expect(draft.state).toBe('NEEDS_REVIEW');
    const missing = simulateStudyPlan(request(SEVEN.map(id => item(id)), {rulePack:{version:'SYN-PACK-1', state:'MISSING'}}));
    expect(missing.state).toBe('INSUFFICIENT_DATA');
  });

  it('never returns transcript rows, attempt tokens, or grades', () => {
    const text = JSON.stringify(simulateStudyPlan(request(SEVEN.map(id => item(id)))));
    expect(text).not.toMatch(/SYN-T-|PLAN:|attemptToken|excludedAttempts|requirements/);
  });

  it('refuses inputs outside the contract', () => {
    expect(() => simulateStudyPlan(request([item('SYN-C')], {attempts:[{...TRANSCRIPT[0]!, ledger:'PLANNED'}]}))).toThrow(/plans come only from studyPlan/);
    expect(() => simulateStudyPlan(request([{kind:'BOOKMARK', dataMode:'SYNTHETIC', opportunityId:'SYN-OP', state:'SAVED'}]))).toThrow(/not a STUDY_PLAN/);
    expect(() => simulateStudyPlan(request([item('SYN-C')], {term:'2027-S'}))).toThrow(/regular term/);
    expect(() => simulateStudyPlan(request([item('SYN-C')], {term:'2026-1'}))).toThrow(/already ended/);
    expect(() => simulateStudyPlan(request([item('SYN-C')], {courseCreditUnits:{'SYN-C':6.5}}))).toThrow(/credit unit/);
    expect(() => simulateStudyPlan(request([item('SYN-C')], {versions:{plan:'bad version!'}}))).toThrow(/versions.plan/);
  });
});
