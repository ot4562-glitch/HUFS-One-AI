import {describe, expect, it} from 'vitest';
import {AcademicAuditVNextSchema} from '@hufs-one/contracts';
import {buildAcademicLedger, type LedgerAttempt, type LedgerRequirement} from './ledger.js';
import {
  buildAcademicPlan,
  MAX_ALLOCATION_STATES,
  type AcademicPlanRequest,
  type SectionMeeting,
  type TermPlan,
  type VerifiedSection,
} from './plan.js';

/** Integer credit units only. 1 unit = 0.5학점, so 3학점 is 6 units. */
const CREDIT_3 = 6;
const CREDIT_18 = 36;
const AS_OF = '2026-11-01T00:00:00.000Z';
const PLAN_TERM = '2027-1';
const CAP_REF = 'SYN-SEMESTER-CAP';
const CATALOG_REF = 'SYN-CATALOG-2027-1';
const VERIFIED = '2026-10-15T00:00:00.000Z';

const attempt = (
  attemptToken:string,
  canonicalCourseId:string,
  over:Partial<LedgerAttempt> = {},
):LedgerAttempt => ({
  attemptToken,
  canonicalCourseId,
  creditUnits:CREDIT_3,
  ledger:'PLANNED',
  areaIds:[],
  recognition:'RECOGNIZED',
  term:PLAN_TERM,
  ...over,
});

const planned = (courseId:string, over:Partial<LedgerAttempt> = {}) => attempt(`${courseId}-P`, courseId, over);

const at = (day:SectionMeeting['day'], hour:number, hours = 1):SectionMeeting => ({
  day, startMinute:hour * 60, endMinute:(hour + hours) * 60,
});

const section = (
  canonicalCourseId:string,
  sectionId:string,
  meetings:readonly SectionMeeting[],
  over:Partial<VerifiedSection> = {},
):VerifiedSection => ({
  canonicalCourseId,
  sectionId,
  term:PLAN_TERM,
  meetings,
  evidenceRefs:[CATALOG_REF],
  verifiedAt:VERIFIED,
  ...over,
});

/** One section per course, each in its own hour, so no timetable issue appears. */
const separateSections = (courseIds:readonly string[]):VerifiedSection[] =>
  courseIds.map((courseId, index) => section(courseId, `${courseId}-01`, [at('TUE', 8 + index)]));

const request = (
  attempts:readonly LedgerAttempt[],
  termPlan:Partial<TermPlan> = {},
  over:Partial<AcademicPlanRequest> = {},
  requirements:readonly LedgerRequirement[] = [],
):AcademicPlanRequest => ({
  asOf:AS_OF,
  rulePackVersion:'SYN-PACK-1',
  rulePackState:'APPROVED',
  attempts,
  requirements,
  termPlan:{
    term:PLAN_TERM,
    creditCapUnits:CREDIT_18,
    capEvidenceRefs:[CAP_REF],
    sections:separateSections([...new Set(attempts
      .filter(row => row.term === PLAN_TERM && row.ledger !== 'EARNED')
      .map(row => row.canonicalCourseId))]),
    ...termPlan,
  },
  ...over,
});

const codes = (audit:ReturnType<typeof buildAcademicPlan>) => audit.planIssues.map(issue => issue.code);

const seven = ['SYN-P1', 'SYN-P2', 'SYN-P3', 'SYN-P4', 'SYN-P5', 'SYN-P6', 'SYN-P7'];

describe('buildAcademicPlan CREDIT-07 credit cap', () => {
  it('CREDIT-07 flags 21학점 planned against an 18학점 cap and leaves the ledger unchanged', () => {
    const attempts = [attempt('SYN-E-1', 'SYN-E', {ledger:'EARNED', term:'2025-1'}), ...seven.map(id => planned(id))];
    const input = request(attempts);
    const audit = buildAcademicPlan(input);
    expect(AcademicAuditVNextSchema.safeParse(audit).success).toBe(true);
    expect(audit.planIssues).toEqual([{
      code:'CREDIT_CAP_EXCEEDED',
      reasonCode:'EXCEEDS_APPROVED_LIMIT',
      courseRefs:seven,
      evidenceRefs:[CAP_REF],
    }]);

    const {termPlan:_plan, ...ledgerOnly} = input;
    const ledger = buildAcademicLedger(ledgerOnly);
    expect({...audit, planIssues:[], caveats:[]}).toEqual({...ledger, caveats:[]});
    expect(audit.plannedCreditUnits).toBe(7 * CREDIT_3);
    expect(audit.earnedCreditUnits).toBe(CREDIT_3);
  });

  it('accepts a plan exactly at the cap', () => {
    const six = seven.slice(0, 6);
    expect(buildAcademicPlan(request(six.map(id => planned(id)))).planIssues).toEqual([]);
  });

  it('counts in-progress courses of the same term toward the cap', () => {
    const attempts = [...seven.slice(0, 6).map(id => planned(id)), planned('SYN-IP', {ledger:'IN_PROGRESS'})];
    expect(codes(buildAcademicPlan(request(attempts)))).toEqual(['CREDIT_CAP_EXCEEDED']);
  });

  it('ignores other terms and officially excluded rows', () => {
    const attempts = [
      ...seven.slice(0, 6).map(id => planned(id)),
      planned('SYN-LATER', {term:'2027-2'}),
      planned('SYN-DROPPED', {recognition:'EXCLUDED'}),
    ];
    expect(buildAcademicPlan(request(attempts)).planIssues).toEqual([]);
  });

  it('holds the cap blocker for review when the rule pack is not approved', () => {
    const audit = buildAcademicPlan(request(seven.map(id => planned(id)), {}, {rulePackState:'DRAFT'}));
    expect(audit.planIssues).toEqual([{code:'NEEDS_REVIEW', reasonCode:'UNKNOWN', courseRefs:seven, evidenceRefs:[CAP_REF]}]);
    expect(audit.state).toBe('NEEDS_REVIEW');
    expect(audit.caveats.some(text => text.includes('held for review'))).toBe(true);
  });

  it('holds a course planned twice in one term for review and counts it once', () => {
    const attempts = [planned('SYN-A'), attempt('SYN-A-P2', 'SYN-A')];
    const audit = buildAcademicPlan(request(attempts, {creditCapUnits:CREDIT_3}));
    expect(audit.planIssues).toEqual([{code:'NEEDS_REVIEW', reasonCode:'UNKNOWN', courseRefs:['SYN-A'], evidenceRefs:[]}]);
  });
});

describe('buildAcademicPlan CREDIT-08 prerequisites', () => {
  const rule = {canonicalCourseId:'SYN-B', requiresCourseIds:['SYN-A'], evidenceRefs:['SYN-PREREQ']};
  const requirements:LedgerRequirement[] = [
    {id:'REQ-B', kind:'REQUIRED_COURSE', canonicalCourseId:'SYN-B', evidenceRefs:['SYN-EVIDENCE-B']},
  ];

  it('CREDIT-08 warns on planned B without earned A and does not satisfy B', () => {
    const audit = buildAcademicPlan(request([planned('SYN-B')], {prerequisites:[rule]}, {}, requirements));
    expect(audit.planIssues).toEqual([{
      code:'PREREQUISITE_MISSING',
      reasonCode:'UNMET_OFFICIAL_PREREQUISITE',
      courseRefs:['SYN-B', 'SYN-A'],
      evidenceRefs:['SYN-PREREQ'],
    }]);
    expect(audit.requirements).toEqual([{requirementId:'REQ-B', state:'UNSATISFIED', evidenceRefs:['SYN-EVIDENCE-B']}]);
  });

  it('passes when A is earned and counted', () => {
    const attempts = [attempt('SYN-A-1', 'SYN-A', {ledger:'EARNED', term:'2025-2'}), planned('SYN-B')];
    expect(buildAcademicPlan(request(attempts, {prerequisites:[rule]})).planIssues).toEqual([]);
  });

  it('holds B for review when A is still in progress in an earlier term', () => {
    const attempts = [attempt('SYN-A-1', 'SYN-A', {ledger:'IN_PROGRESS', term:'2026-2'}), planned('SYN-B')];
    expect(buildAcademicPlan(request(attempts, {prerequisites:[rule]})).planIssues).toEqual([{
      code:'NEEDS_REVIEW', reasonCode:'UNKNOWN', courseRefs:['SYN-B', 'SYN-A'], evidenceRefs:['SYN-PREREQ'],
    }]);
  });

  it('holds B for review when the earned A row is itself held', () => {
    const attempts = [attempt('SYN-A-1', 'SYN-A', {ledger:'EARNED', term:'2026-2'}), planned('SYN-B')];
    expect(codes(buildAcademicPlan(request(attempts, {prerequisites:[rule]})))).toEqual(['NEEDS_REVIEW']);
  });

  it('does not treat A planned in the same term as a co-requisite', () => {
    const audit = buildAcademicPlan(request([planned('SYN-A'), planned('SYN-B')], {prerequisites:[rule]}));
    expect(codes(audit)).toEqual(['PREREQUISITE_MISSING']);
  });

  it('treats an officially excluded A as missing', () => {
    const attempts = [
      attempt('SYN-A-1', 'SYN-A', {ledger:'EARNED', term:'2025-1', recognition:'EXCLUDED'}),
      planned('SYN-B'),
    ];
    expect(codes(buildAcademicPlan(request(attempts, {prerequisites:[rule]})))).toEqual(['PREREQUISITE_MISSING']);
  });

  it('lists every missing prerequisite on one issue', () => {
    const both = {...rule, requiresCourseIds:['SYN-A', 'SYN-A2']};
    expect(buildAcademicPlan(request([planned('SYN-B')], {prerequisites:[both]})).planIssues[0]?.courseRefs)
      .toEqual(['SYN-B', 'SYN-A', 'SYN-A2']);
  });

  it('does not check prerequisites of a course already in progress', () => {
    const audit = buildAcademicPlan(request([planned('SYN-B', {ledger:'IN_PROGRESS', term:'2026-2'})], {
      term:'2026-2', prerequisites:[rule], sections:[section('SYN-B', 'B-01', [at('MON', 9)], {term:'2026-2'})],
    }));
    expect(audit.planIssues).toEqual([]);
  });

  it('holds the prerequisite blocker for review when the rule pack is not approved', () => {
    const audit = buildAcademicPlan(request([planned('SYN-B')], {prerequisites:[rule]}, {rulePackState:'NEEDS_REVIEW'}));
    expect(audit.planIssues).toEqual([{code:'NEEDS_REVIEW', reasonCode:'UNKNOWN', courseRefs:['SYN-B', 'SYN-A'], evidenceRefs:['SYN-PREREQ']}]);
  });
});

describe('buildAcademicPlan CREDIT-09 verified sections', () => {
  const pair = [planned('SYN-A'), planned('SYN-B')];

  it('CREDIT-09 reports a conflict when every verified section pair overlaps and invents no section', () => {
    const sections = [
      section('SYN-A', 'A-01', [at('MON', 9, 2)]),
      section('SYN-A', 'A-02', [at('WED', 13, 2)]),
      section('SYN-B', 'B-01', [at('MON', 10), at('WED', 13)], {evidenceRefs:['SYN-CATALOG-B']}),
      section('SYN-B', 'B-02', [at('MON', 9), at('WED', 14)]),
    ];
    const audit = buildAcademicPlan(request(pair, {sections}));
    expect(audit.planIssues).toEqual([{
      code:'TIMETABLE_CONFLICT',
      reasonCode:'ALL_VERIFIED_SECTIONS_OVERLAP',
      courseRefs:['SYN-A', 'SYN-B'],
      evidenceRefs:['SYN-CATALOG-2027-1', 'SYN-CATALOG-B'],
    }]);
    expect(JSON.stringify(audit)).not.toMatch(/A-0[12]|B-0[12]/);
  });

  it('reports nothing when one verified combination fits', () => {
    const sections = [
      section('SYN-A', 'A-01', [at('MON', 9, 2)]),
      section('SYN-B', 'B-01', [at('MON', 10)]),
      section('SYN-B', 'B-02', [at('THU', 9)]),
    ];
    expect(buildAcademicPlan(request(pair, {sections})).planIssues).toEqual([]);
  });

  it('does not count meetings that only touch as an overlap', () => {
    const sections = [section('SYN-A', 'A-01', [at('MON', 9)]), section('SYN-B', 'B-01', [at('MON', 10)])];
    expect(buildAcademicPlan(request(pair, {sections})).planIssues).toEqual([]);
  });

  it('never overlaps a section without fixed meetings', () => {
    const sections = [section('SYN-A', 'A-01', []), section('SYN-B', 'B-01', [at('MON', 9)])];
    expect(buildAcademicPlan(request(pair, {sections})).planIssues).toEqual([]);
  });

  it('finds a three-course conflict that no single pair shows', () => {
    const three = [planned('SYN-A'), planned('SYN-B'), planned('SYN-C')];
    const sections = ['SYN-A', 'SYN-B', 'SYN-C'].flatMap(courseId => [
      section(courseId, `${courseId}-09`, [at('MON', 9)]),
      section(courseId, `${courseId}-10`, [at('MON', 10)]),
    ]);
    expect(buildAcademicPlan(request(three, {sections})).planIssues).toEqual([{
      code:'TIMETABLE_CONFLICT',
      reasonCode:'ALL_VERIFIED_SECTIONS_OVERLAP',
      courseRefs:['SYN-A', 'SYN-B', 'SYN-C'],
      evidenceRefs:[CATALOG_REF],
    }]);
  });

  it('reports the search limit instead of guessing a timetable', () => {
    const courseIds = Array.from({length:11}, (_, index) => `SYN-K${String(index).padStart(2, '0')}`);
    const sections = courseIds.flatMap(courseId => Array.from({length:10}, (_, hour) =>
      section(courseId, `${courseId}-${hour}`, [at('FRI', 8 + hour)])));
    const audit = buildAcademicPlan(request(courseIds.map(id => planned(id, {creditUnits:1})), {sections}));
    expect(MAX_ALLOCATION_STATES).toBe(50_000);
    expect(audit.planIssues).toEqual([{
      code:'SEARCH_LIMIT_REVIEW',
      reasonCode:'ALLOCATION_SEARCH_LIMIT',
      courseRefs:courseIds,
      evidenceRefs:[CATALOG_REF],
    }]);
  });

  it('holds a course for review when it has no verified section', () => {
    const audit = buildAcademicPlan(request(pair, {sections:[section('SYN-A', 'A-01', [at('MON', 9)])]}));
    expect(audit.planIssues).toEqual([{code:'NEEDS_REVIEW', reasonCode:'COURSE_NOT_CONFIRMED', courseRefs:['SYN-B'], evidenceRefs:[]}]);
  });

  it('ignores a section verified after asOf rather than treating it as a conflict', () => {
    const sections = [
      section('SYN-A', 'A-01', [at('MON', 9)]),
      section('SYN-B', 'B-01', [at('MON', 9)], {verifiedAt:'2026-11-02T00:00:00.000Z'}),
    ];
    expect(buildAcademicPlan(request(pair, {sections})).planIssues).toEqual([
      {code:'NEEDS_REVIEW', reasonCode:'COURSE_NOT_CONFIRMED', courseRefs:['SYN-B'], evidenceRefs:[]},
    ]);
  });
});

describe('buildAcademicPlan with more than 20 courses in a term', () => {
  const many = (count:number) => Array.from({length:count}, (_, i) => `SYN-M${String(i + 1).padStart(2, '0')}`);
  const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
  /** One section per course, each in its own day and hour, so no pair overlaps. */
  const spread = (courseIds:readonly string[]) =>
    courseIds.map((courseId, i) => section(courseId, `${courseId}-01`, [at(DAYS[i % 7]!, 8 + Math.floor(i / 7))]));
  const twentyFive = many(25);

  it('splits a long cap and unconfirmed list into issues of at most 20 courses', () => {
    const audit = buildAcademicPlan(request(twentyFive.map(id => planned(id)), {sections:[]}));
    expect(AcademicAuditVNextSchema.safeParse(audit).success).toBe(true);
    expect(audit.planIssues.map(issue => [issue.code, issue.courseRefs])).toEqual([
      ['CREDIT_CAP_EXCEEDED', twentyFive.slice(0, 20)],
      ['CREDIT_CAP_EXCEEDED', twentyFive.slice(20)],
      ['NEEDS_REVIEW', twentyFive.slice(0, 20)],
      ['NEEDS_REVIEW', twentyFive.slice(20)],
    ]);
  });

  it('reports the all-course timetable search as not done instead of a conflict', () => {
    const audit = buildAcademicPlan(request(twentyFive.map(id => planned(id)), {sections:spread(twentyFive)}));
    expect(audit.planIssues.filter(issue => issue.code !== 'CREDIT_CAP_EXCEEDED')).toEqual([
      {code:'SEARCH_LIMIT_REVIEW', reasonCode:'ALLOCATION_SEARCH_LIMIT', courseRefs:twentyFive.slice(0, 20), evidenceRefs:[CATALOG_REF]},
      {code:'SEARCH_LIMIT_REVIEW', reasonCode:'ALLOCATION_SEARCH_LIMIT', courseRefs:twentyFive.slice(20), evidenceRefs:[CATALOG_REF]},
    ]);
  });

  it('still reports each overlapping pair', () => {
    const sections = spread(twentyFive).map(row => (row.canonicalCourseId === 'SYN-M02'
      ? section('SYN-M02', 'SYN-M02-01', [at('MON', 8)]) : row));
    const audit = buildAcademicPlan(request(twentyFive.map(id => planned(id)), {sections}));
    expect(audit.planIssues.filter(issue => issue.code !== 'CREDIT_CAP_EXCEEDED').map(issue => [issue.code, issue.courseRefs]))
      .toEqual([['TIMETABLE_CONFLICT', ['SYN-M01', 'SYN-M02']]]);
  });

  it('refuses more than 60 courses in one term', () => {
    expect(() => buildAcademicPlan(request(many(61).map(id => planned(id)), {sections:[]}))).toThrow(/at most 60/);
  });
});

describe('buildAcademicPlan input checks', () => {
  const one = [planned('SYN-A')];

  it('refuses a term that has already ended by asOf', () => {
    expect(() => buildAcademicPlan(request(one, {term:'2026-1'}))).toThrow(/already ended/);
  });

  it('refuses a cap without official evidence or a non-integer cap', () => {
    expect(() => buildAcademicPlan(request(one, {capEvidenceRefs:[]}))).toThrow(/official evidence/);
    expect(() => buildAcademicPlan(request(one, {creditCapUnits:36.5}))).toThrow(/credit unit/);
  });

  it('refuses a malformed prerequisite rule', () => {
    const base = {canonicalCourseId:'SYN-A', requiresCourseIds:['SYN-Z'], evidenceRefs:['SYN-PREREQ']};
    expect(() => buildAcademicPlan(request(one, {prerequisites:[{...base, requiresCourseIds:['SYN-A']}]}))).toThrow(/itself/);
    expect(() => buildAcademicPlan(request(one, {prerequisites:[{...base, evidenceRefs:[]}]}))).toThrow(/official evidence/);
    expect(() => buildAcademicPlan(request(one, {prerequisites:[base, base]}))).toThrow(/duplicate/);
  });

  it('refuses sections for another term, without evidence, or with impossible times', () => {
    expect(() => buildAcademicPlan(request(one, {sections:[section('SYN-A', 'A-01', [at('MON', 9)], {term:'2027-2'})]})))
      .toThrow(/not 2027-1/);
    expect(() => buildAcademicPlan(request(one, {sections:[section('SYN-A', 'A-01', [at('MON', 9)], {evidenceRefs:[]})]})))
      .toThrow(/official evidence/);
    expect(() => buildAcademicPlan(request(one, {sections:[section('SYN-A', 'A-01', [{day:'MON', startMinute:600, endMinute:600}])]})))
      .toThrow(/within one day/);
    expect(() => buildAcademicPlan(request(one, {sections:[section('SYN-A', 'A-01', [{day:'MON', startMinute:1380, endMinute:1500}])]})))
      .toThrow(/within one day/);
  });

  it('returns a contract-valid audit in a stable order', () => {
    const attempts = [...seven.map(id => planned(id)), planned('SYN-B')];
    const input = request(attempts, {
      prerequisites:[{canonicalCourseId:'SYN-B', requiresCourseIds:['SYN-A'], evidenceRefs:['SYN-PREREQ']}],
    });
    const first = buildAcademicPlan(input);
    const reversed = buildAcademicPlan({...input, attempts:[...attempts].reverse()});
    expect(AcademicAuditVNextSchema.safeParse(first).success).toBe(true);
    expect(codes(first)).toEqual(['CREDIT_CAP_EXCEEDED', 'PREREQUISITE_MISSING']);
    expect(reversed.planIssues).toEqual(first.planIssues);
  });
});
