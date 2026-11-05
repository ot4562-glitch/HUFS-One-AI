import {describe, expect, it} from 'vitest';
import {OwnerMajorWhatIfReadySchema, OwnerMajorWhatIfBlockedSchema} from '@hufs-one/contracts';
import type {DoubleMajorAttempt, MajorRulePack, OverlapRule} from './double-major.js';
import {buildMajorWhatIf, MAJOR_WHAT_IF_CORE_VERSION, type MajorWhatIfRequest, type MajorWhatIfResult, type ProgramEnrollment,
  type ProgramOffer, type WhatIfProjection, type WhatIfScenario} from './major-what-if.js';

/**
 * Synthetic only. 1 unit = 0.5학점, so a 3학점 course is 6 units. Every expected figure below is a
 * literal worked out by hand from the attempts and packs, not output of the code under test.
 *
 * Earned courses: A1 A2 (area A), S1 (area A in A packs, area B in B packs = shared by A and B),
 * B1 (area B), C1 (area C), G1 (no program area). B2 is in progress (area B).
 * Unique earned total = 6 courses x 6 = 36 units. The primary total is 260 units, so 224 remain.
 */
const AS_OF = '2026-11-01T00:00:00.000Z';
const course = (canonicalCourseId:string, over:Partial<DoubleMajorAttempt> = {}):DoubleMajorAttempt => ({
  attemptToken:`${canonicalCourseId}-T`, canonicalCourseId, creditUnits:6, ledger:'EARNED', recognition:'RECOGNIZED', term:'2025-2', ...over,
});
const ATTEMPTS:DoubleMajorAttempt[] = [
  course('SYN-A1'), course('SYN-A2'), course('SYN-S1'), course('SYN-B1'), course('SYN-C1'), course('SYN-G1'),
  course('SYN-B2', {ledger:'IN_PROGRESS', term:'2026-2'}),
];
const total = (id:string) => ({id, kind:'CREDIT_TOTAL' as const, requiredCreditUnits:260, evidenceRefs:['EV-SYN-TOTAL']});
const A_AREAS = {'SYN-A1':['SYN-AREA-A'], 'SYN-A2':['SYN-AREA-A'], 'SYN-S1':['SYN-AREA-A']};
const primaryA = (version:string, majorId:string, required:number, state:MajorRulePack['rulePackState'] = 'APPROVED'):MajorRulePack => ({
  rulePackVersion:version, rulePackState:state, courseAreas:A_AREAS,
  requirements:[total('SYN-A-TOTAL'),
    {id:majorId, kind:'CATEGORY_MINIMUM', areaId:'SYN-AREA-A', requiredCreditUnits:required, evidenceRefs:['EV-SYN-A']},
    {id:'SYN-A-REQ', kind:'REQUIRED_COURSE', canonicalCourseId:'SYN-A1', evidenceRefs:['EV-SYN-A']}],
});
const doubleB = (state:MajorRulePack['rulePackState'] = 'APPROVED', overlapRule?:OverlapRule):MajorRulePack & {overlapRule?:OverlapRule} => ({
  rulePackVersion:'SYN-B-DM-1', rulePackState:state,
  courseAreas:{'SYN-B1':['SYN-AREA-B'], 'SYN-B2':['SYN-AREA-B'], 'SYN-S1':['SYN-AREA-B']},
  requirements:[
    {id:'SYN-B-MAJOR', kind:'CATEGORY_MINIMUM', areaId:'SYN-AREA-B', requiredCreditUnits:12, evidenceRefs:['EV-SYN-B']},
    {id:'SYN-B-REQ', kind:'REQUIRED_COURSE', canonicalCourseId:'SYN-B2', evidenceRefs:['EV-SYN-B']}],
  ...(overlapRule ? {overlapRule} : {}),
});
const packC = (version:string, prefix:string, state:MajorRulePack['rulePackState'] = 'APPROVED'):MajorRulePack => ({
  rulePackVersion:version, rulePackState:state, courseAreas:{'SYN-C1':['SYN-AREA-C']},
  requirements:[
    {id:`${prefix}-MAJOR`, kind:'CATEGORY_MINIMUM', areaId:'SYN-AREA-C', requiredCreditUnits:6, evidenceRefs:['EV-SYN-C']},
    {id:`${prefix}-REQ`, kind:'REQUIRED_COURSE', canonicalCourseId:'SYN-C2', evidenceRefs:['EV-SYN-C']}],
});
const primaryD:MajorRulePack = {
  rulePackVersion:'SYN-D-DM-1', rulePackState:'APPROVED', courseAreas:{},
  requirements:[total('SYN-D-TOTAL'),
    {id:'SYN-D-MAJOR', kind:'CATEGORY_MINIMUM', areaId:'SYN-AREA-D', requiredCreditUnits:6, evidenceRefs:['EV-SYN-D']}],
};

const CATALOG:ProgramOffer[] = [
  {role:'PRIMARY_MAJOR', programId:'SYN-MAJ-A', degreePath:'DOUBLE_MAJOR', pack:primaryA('SYN-A-DM-1', 'SYN-A-MAJOR-DM', 18)},
  {role:'PRIMARY_MAJOR', programId:'SYN-MAJ-A', degreePath:'MAJOR_DEEPENING', pack:primaryA('SYN-A-MD-1', 'SYN-A-MAJOR-MD', 36)},
  {role:'PRIMARY_MAJOR', programId:'SYN-MAJ-A', degreePath:'MAJOR_DEEPENING_MINOR', pack:primaryA('SYN-A-MM-1', 'SYN-A-MAJOR-MM', 30)},
  {role:'DOUBLE_MAJOR', programId:'SYN-MAJ-B', pack:doubleB()},
  {role:'DOUBLE_MAJOR', programId:'SYN-MAJ-C', pack:packC('SYN-C-DM-1', 'SYN-C')},
  {role:'MINOR', programId:'SYN-MAJ-C', pack:packC('SYN-C-MI-1', 'SYN-CM')},
  {role:'PRIMARY_MAJOR', programId:'SYN-MAJ-D', degreePath:'DOUBLE_MAJOR', pack:primaryD},
];
const A_WITH_B:ProgramEnrollment = {primaryProgramId:'SYN-MAJ-A', secondary:{role:'DOUBLE_MAJOR', programId:'SYN-MAJ-B'}};
const A_ONLY:ProgramEnrollment = {primaryProgramId:'SYN-MAJ-A'};
const run = (scenario:WhatIfScenario, over:Partial<MajorWhatIfRequest> = {}):MajorWhatIfResult =>
  buildMajorWhatIf({asOf:AS_OF, attempts:ATTEMPTS, current:A_WITH_B, scenario, programs:CATALOG, ...over});
const ready = (result:MajorWhatIfResult) => {
  if (result.state !== 'READY') throw new Error(`expected READY, got ${JSON.stringify(result)}`);
  return result;
};
const replace = (programs:ProgramOffer[], version:string, pack:MajorRulePack):ProgramOffer[] =>
  programs.map(offer => (offer.pack.rulePackVersion === version ? {...offer, pack} as ProgramOffer : offer));

describe('buildMajorWhatIf (#11, #82)', () => {
  it('changes the double major: hand-checked projections and diff', () => {
    const result = ready(run({action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-C'}));
    expect(result.coreVersion).toBe(MAJOR_WHAT_IF_CORE_VERSION);
    // Now: S1 counts for A and B without an overlap rule, so both rows that need it are held and
    // reported MISSING with the figures without S1: A 12 of 18 (missing 6), B 6 of 12 (missing 6).
    expect(result.current).toEqual({
      role:'CURRENT', asOf:AS_OF, enrollment:A_WITH_B, degreePath:'DOUBLE_MAJOR', rulePackVersions:['SYN-A-DM-1', 'SYN-B-DM-1'],
      earnedCreditUnits:36, remainingCreditUnits:224,
      requirements:[
        {requirementId:'SYN-A-TOTAL', state:'MISSING', missingCreditUnits:224},
        {requirementId:'SYN-A-MAJOR-DM', state:'MISSING', missingCreditUnits:6},
        {requirementId:'SYN-A-REQ', state:'SATISFIED'},
        {requirementId:'SYN-B-MAJOR', state:'MISSING', missingCreditUnits:6},
        {requirementId:'SYN-B-REQ', state:'MISSING'},
      ],
      reviewRequirementIds:['SYN-A-MAJOR-DM', 'SYN-B-MAJOR'],
    });
    // With C instead of B, S1 is no longer shared: A has 18 of 18. C1 meets C's 6; C2 was never taken.
    expect(result.hypothetical).toEqual({
      role:'HYPOTHETICAL', asOf:AS_OF, enrollment:{primaryProgramId:'SYN-MAJ-A', secondary:{role:'DOUBLE_MAJOR', programId:'SYN-MAJ-C'}},
      degreePath:'DOUBLE_MAJOR', rulePackVersions:['SYN-A-DM-1', 'SYN-C-DM-1'], earnedCreditUnits:36, remainingCreditUnits:224,
      requirements:[
        {requirementId:'SYN-A-TOTAL', state:'MISSING', missingCreditUnits:224},
        {requirementId:'SYN-A-MAJOR-DM', state:'SATISFIED'},
        {requirementId:'SYN-A-REQ', state:'SATISFIED'},
        {requirementId:'SYN-C-MAJOR', state:'SATISFIED'},
        {requirementId:'SYN-C-REQ', state:'MISSING'},
      ],
      reviewRequirementIds:[],
    });
    expect(result.delta).toEqual([
      {requirementId:'SYN-A-TOTAL', change:'UNCHANGED', evidenceRefs:['EV-SYN-TOTAL']},
      {requirementId:'SYN-A-MAJOR-DM', change:'PROGRESS_CHANGED', evidenceRefs:['EV-SYN-A']},
      {requirementId:'SYN-A-REQ', change:'UNCHANGED', evidenceRefs:['EV-SYN-A']},
      {requirementId:'SYN-B-MAJOR', change:'REMOVED_REQUIREMENT', evidenceRefs:['EV-SYN-B']},
      {requirementId:'SYN-B-REQ', change:'REMOVED_REQUIREMENT', evidenceRefs:['EV-SYN-B']},
      {requirementId:'SYN-C-MAJOR', change:'ALREADY_SATISFIED', evidenceRefs:['EV-SYN-C']},
      {requirementId:'SYN-C-REQ', change:'NEW_REQUIREMENT', evidenceRefs:['EV-SYN-C']},
    ]);
  });

  it('counts only earned credit: an in-progress required course stays MISSING', () => {
    const b = ready(run({action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-C'})).current.requirements.find(r => r.requirementId === 'SYN-B-REQ');
    expect(b).toEqual({requirementId:'SYN-B-REQ', state:'MISSING'});
  });

  it('an attempt the ledger set aside undecided flags every unmet row it could feed (review of #217)', () => {
    // C1 pending recognition: earned total drops to 30 (230 remain). On the C side C1 is C's only area
    // course, so C's area row is 6 short but held for review; the total is held too. A's area row is met
    // (A1 A2 S1 = 18) and stays SATISFIED. C's required C2 was never taken, so C1 cannot decide it.
    const pendingC1 = ATTEMPTS.map(a => (a.canonicalCourseId === 'SYN-C1' ? {...a, recognition:'PENDING' as const} : a));
    const result = ready(run({action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-C'}, {attempts:pendingC1}));
    expect(result.hypothetical.requirements).toEqual([
      {requirementId:'SYN-A-TOTAL', state:'MISSING', missingCreditUnits:230},
      {requirementId:'SYN-A-MAJOR-DM', state:'SATISFIED'},
      {requirementId:'SYN-A-REQ', state:'SATISFIED'},
      {requirementId:'SYN-C-MAJOR', state:'MISSING', missingCreditUnits:6},
      {requirementId:'SYN-C-REQ', state:'MISSING'},
    ]);
    expect(result.hypothetical.reviewRequirementIds).toEqual(['SYN-A-TOTAL', 'SYN-C-MAJOR']);
    // Now (A + B): C1 is in neither pack, so only the total gains a flag next to the two overlap holds.
    expect(result.current.reviewRequirementIds).toEqual(['SYN-A-TOTAL', 'SYN-A-MAJOR-DM', 'SYN-B-MAJOR']);
    // 전공심화 A alone: its area row is 18 short in area A, which pending C1 cannot feed: a plain shortfall.
    const alone = ready(run({action:'REMOVE_DOUBLE_MAJOR'}, {attempts:pendingC1})).hypothetical;
    expect(alone.requirements.find(r => r.requirementId === 'SYN-A-MAJOR-MD')).toEqual({requirementId:'SYN-A-MAJOR-MD', state:'MISSING', missingCreditUnits:18});
    expect(alone.reviewRequirementIds).toEqual(['SYN-A-TOTAL']);
  });

  it('an undecided course flags the required-course and one-of rows that name it, and no others', () => {
    // F names C1 directly (required) and in a one-of list; C1 is pending, so both are unmet but flagged.
    // The one-of row without C1 (G1 or G2: neither taken) is a plain shortfall.
    const packF:MajorRulePack = {rulePackVersion:'SYN-F-DM-1', rulePackState:'APPROVED', courseAreas:{},
      requirements:[
        {id:'SYN-F-REQ-C1', kind:'REQUIRED_COURSE', canonicalCourseId:'SYN-C1', evidenceRefs:['EV-SYN-F']},
        {id:'SYN-F-ONE-OF-C1', kind:'K_OF_N', courseIds:['SYN-C1', 'SYN-F2'], k:1, evidenceRefs:['EV-SYN-F']},
        {id:'SYN-F-ONE-OF-OTHER', kind:'K_OF_N', courseIds:['SYN-G1', 'SYN-G2'], k:2, evidenceRefs:['EV-SYN-F']}]};
    const pendingC1 = ATTEMPTS.map(a => (a.canonicalCourseId === 'SYN-C1' ? {...a, recognition:'PENDING' as const} : a));
    const h = ready(run({action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-F'},
      {attempts:pendingC1, programs:[...CATALOG, {role:'DOUBLE_MAJOR', programId:'SYN-MAJ-F', pack:packF}]})).hypothetical;
    expect(h.requirements.filter(r => r.requirementId.startsWith('SYN-F')).map(r => r.state)).toEqual(['MISSING', 'MISSING', 'MISSING']);
    expect(h.reviewRequirementIds).toEqual(['SYN-A-TOTAL', 'SYN-F-REQ-C1', 'SYN-F-ONE-OF-C1']);
  });

  it.each([
    ['pending recognition', {recognition:'PENDING' as const}, true],
    ['a term not ended by asOf', {term:'2026-2'}, true],
    ['an official exclusion', {recognition:'EXCLUDED' as const}, false],
  ] as const)('composite rows preserve review holds for %s only where the course can contribute', (_label, change, held) => {
    const packF:MajorRulePack = {rulePackVersion:'SYN-F-DM-1', rulePackState:'APPROVED',
      courseAreas:{'SYN-C1':['SYN-AREA-C'], 'SYN-G1':['SYN-AREA-G']},
      requirements:[
        {id:'SYN-F-SPREAD-C1', kind:'AREA_SPREAD', areaIds:['SYN-AREA-C', 'SYN-AREA-G'],
          minAreas:2, requiredCreditUnits:12, evidenceRefs:['EV-SYN-F']},
        {id:'SYN-F-GROUP-C1', kind:'GROUP_CHOICE', groups:[['SYN-C1', 'SYN-G1'], ['SYN-F2']],
          k:1, evidenceRefs:['EV-SYN-F']},
        {id:'SYN-F-SPREAD-OTHER', kind:'AREA_SPREAD', areaIds:['SYN-AREA-F', 'SYN-AREA-H'],
          minAreas:1, requiredCreditUnits:6, evidenceRefs:['EV-SYN-F']},
        {id:'SYN-F-GROUP-OTHER', kind:'GROUP_CHOICE', groups:[['SYN-F2', 'SYN-F3'], ['SYN-H1']],
          k:1, evidenceRefs:['EV-SYN-F']},
      ]};
    const attempts = ATTEMPTS.map(a => (a.canonicalCourseId === 'SYN-C1' ? {...a, ...change} : a));
    const result = ready(run({action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-F'},
      {attempts, programs:[...CATALOG, {role:'DOUBLE_MAJOR', programId:'SYN-MAJ-F', pack:packF}]}));
    const h = result.hypothetical;
    expect(h.requirements.filter(r => r.requirementId.startsWith('SYN-F')).map(r => r.state))
      .toEqual(['MISSING', 'MISSING', 'MISSING', 'MISSING']);
    expect(h.reviewRequirementIds).toEqual(held ? ['SYN-A-TOTAL', 'SYN-F-SPREAD-C1', 'SYN-F-GROUP-C1'] : []);
    // C1 contributes no earned credits while unresolved or excluded, on either side of the scenario.
    expect([result.current.earnedCreditUnits, h.earnedCreditUnits]).toEqual([30, 30]);
    expect(h.remainingCreditUnits).toBe(230);
  });

  it('a term not ended by asOf and an unapproved retake are undecided too; settled exclusions flag nothing', () => {
    const scenario:WhatIfScenario = {action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-C'};
    // A2 "earned" in 2026-2, which has not ended on 2026-11-01: A's area row has A1 + S1 = 12 of 18.
    const unended = ATTEMPTS.map(a => (a.canonicalCourseId === 'SYN-A2' ? {...a, term:'2026-2'} : a));
    const u = ready(run(scenario, {attempts:unended})).hypothetical;
    expect(u.requirements.find(r => r.requirementId === 'SYN-A-MAJOR-DM')).toEqual({requirementId:'SYN-A-MAJOR-DM', state:'MISSING', missingCreditUnits:6});
    expect(u.reviewRequirementIds).toEqual(['SYN-A-TOTAL', 'SYN-A-MAJOR-DM']);
    // A retake of A1 without approval is held; the first A1 still counts, so every A row stays met and
    // only the unmet total is flagged.
    const retake = [...ATTEMPTS, course('SYN-A1', {attemptToken:'SYN-A1-RETAKE', term:'2026-1', supersedesAttemptToken:'SYN-A1-T'})];
    const r = ready(run(scenario, {attempts:retake})).hypothetical;
    expect(r.requirements.filter(x => x.state === 'SATISFIED').map(x => x.requirementId)).toEqual(['SYN-A-MAJOR-DM', 'SYN-A-REQ', 'SYN-C-MAJOR']);
    expect(r.reviewRequirementIds).toEqual(['SYN-A-TOTAL']);
    // An official exclusion is settled: C's area row is a plain shortfall, and nothing is flagged.
    const excluded = ATTEMPTS.map(a => (a.canonicalCourseId === 'SYN-C1' ? {...a, recognition:'EXCLUDED' as const} : a));
    const e = ready(run(scenario, {attempts:excluded})).hypothetical;
    expect(e.requirements.find(x => x.requirementId === 'SYN-C-MAJOR')).toEqual({requirementId:'SYN-C-MAJOR', state:'MISSING', missingCreditUnits:6});
    expect(e.reviewRequirementIds).toEqual([]);
    // A duplicate (the same course in progress and earned) is settled: one counts, no flag.
    const duplicate = [...ATTEMPTS, course('SYN-C1', {attemptToken:'SYN-C1-AGAIN', ledger:'IN_PROGRESS', term:'2026-2'})];
    expect(ready(run(scenario, {attempts:duplicate})).hypothetical.reviewRequirementIds).toEqual([]);
  });

  it('dropping the double major switches the primary to its 전공심화 pack', () => {
    const result = ready(run({action:'REMOVE_DOUBLE_MAJOR'}));
    expect(result.hypothetical.degreePath).toBe('ADVANCED_SINGLE');
    expect(result.hypothetical.rulePackVersions).toEqual(['SYN-A-MD-1']);
    // 전공심화 needs 36 in area A; A1 A2 S1 give 18, so 18 are missing. S1 is not shared any more.
    expect(result.hypothetical.requirements).toEqual([
      {requirementId:'SYN-A-TOTAL', state:'MISSING', missingCreditUnits:224},
      {requirementId:'SYN-A-MAJOR-MD', state:'MISSING', missingCreditUnits:18},
      {requirementId:'SYN-A-REQ', state:'SATISFIED'},
    ]);
    expect(result.delta.map(row => [row.requirementId, row.change])).toEqual([
      ['SYN-A-TOTAL', 'UNCHANGED'], ['SYN-A-MAJOR-DM', 'REMOVED_REQUIREMENT'], ['SYN-A-REQ', 'UNCHANGED'],
      ['SYN-B-MAJOR', 'REMOVED_REQUIREMENT'], ['SYN-B-REQ', 'REMOVED_REQUIREMENT'], ['SYN-A-MAJOR-MD', 'NEW_REQUIREMENT'],
    ]);
  });

  it('adding a double major or a minor uses the primary pack of the new degree path', () => {
    const asDouble = ready(run({action:'ADD_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-C'}, {current:A_ONLY}));
    expect(asDouble.current.rulePackVersions).toEqual(['SYN-A-MD-1']);
    expect(asDouble.hypothetical.rulePackVersions).toEqual(['SYN-A-DM-1', 'SYN-C-DM-1']);
    const asMinor = ready(run({action:'ADD_MINOR', targetMajorId:'SYN-MAJ-C'}, {current:A_ONLY}));
    expect(asMinor.hypothetical.degreePath).toBe('ADVANCED_PLUS_MINOR');
    expect(asMinor.hypothetical.rulePackVersions).toEqual(['SYN-A-MM-1', 'SYN-C-MI-1']);
    // 전공심화+부전공 needs 30 in area A: 18 earned, 12 missing. The minor row is met by C1.
    expect(asMinor.hypothetical.requirements).toEqual([
      {requirementId:'SYN-A-TOTAL', state:'MISSING', missingCreditUnits:224},
      {requirementId:'SYN-A-MAJOR-MM', state:'MISSING', missingCreditUnits:12},
      {requirementId:'SYN-A-REQ', state:'SATISFIED'},
      {requirementId:'SYN-CM-MAJOR', state:'SATISFIED'},
      {requirementId:'SYN-CM-REQ', state:'MISSING'},
    ]);
    const minorNow:ProgramEnrollment = {primaryProgramId:'SYN-MAJ-A', secondary:{role:'MINOR', programId:'SYN-MAJ-C'}};
    expect(ready(run({action:'REMOVE_MINOR'}, {current:minorNow})).hypothetical.rulePackVersions).toEqual(['SYN-A-MD-1']);
  });

  it('changing the primary major keeps the second program and its own pack', () => {
    const result = ready(run({action:'CHANGE_PRIMARY_MAJOR', targetMajorId:'SYN-MAJ-D'}));
    expect(result.hypothetical.rulePackVersions).toEqual(['SYN-D-DM-1', 'SYN-B-DM-1']);
    // D does not use S1, so B's area row has B1 + S1 = 12 of 12 without any overlap question.
    expect(result.hypothetical.requirements).toEqual([
      {requirementId:'SYN-D-TOTAL', state:'MISSING', missingCreditUnits:224},
      {requirementId:'SYN-D-MAJOR', state:'MISSING', missingCreditUnits:6},
      {requirementId:'SYN-B-MAJOR', state:'SATISFIED'},
      {requirementId:'SYN-B-REQ', state:'MISSING'},
    ]);
    expect(result.hypothetical.reviewRequirementIds).toEqual([]);
    expect(result.delta.find(row => row.requirementId === 'SYN-B-MAJOR')!.change).toBe('PROGRESS_CHANGED');
  });

  it('an approved overlap rule decides shared rows; one over its limit does not', () => {
    const covered = replace(CATALOG, 'SYN-B-DM-1', doubleB('APPROVED', {maxSharedCreditUnits:6, evidenceRefs:['EV-SYN-OVERLAP']}));
    const now = ready(run({action:'REMOVE_DOUBLE_MAJOR'}, {programs:covered})).current;
    expect(now.requirements.filter(r => r.state === 'SATISFIED').map(r => r.requirementId)).toEqual(['SYN-A-MAJOR-DM', 'SYN-A-REQ', 'SYN-B-MAJOR']);
    expect(now.reviewRequirementIds).toEqual([]);
    const over = replace(CATALOG, 'SYN-B-DM-1', doubleB('APPROVED', {maxSharedCreditUnits:0, evidenceRefs:['EV-SYN-OVERLAP']}));
    expect(ready(run({action:'REMOVE_DOUBLE_MAJOR'}, {programs:over})).current.reviewRequirementIds).toEqual(['SYN-A-MAJOR-DM', 'SYN-B-MAJOR']);
  });

  it('a non-credit check is MISSING and listed for review', () => {
    const withExam = replace(CATALOG, 'SYN-A-DM-1', {...primaryA('SYN-A-DM-1', 'SYN-A-MAJOR-DM', 18),
      requirements:[...primaryA('SYN-A-DM-1', 'SYN-A-MAJOR-DM', 18).requirements,
        {id:'SYN-A-EXAM', kind:'NON_CREDIT', criterionId:'SYN-EXAM', verificationMode:'OFFICIAL', evidenceRefs:['EV-SYN-A']}]});
    const now = ready(run({action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-C'}, {programs:withExam})).current;
    expect(now.requirements.find(r => r.requirementId === 'SYN-A-EXAM')).toEqual({requirementId:'SYN-A-EXAM', state:'MISSING'});
    expect(now.reviewRequirementIds).toContain('SYN-A-EXAM');
  });

  it('blocks unapproved packs, naming only what is missing', () => {
    const draftTarget = replace(CATALOG, 'SYN-C-DM-1', packC('SYN-C-DM-1', 'SYN-C', 'DRAFT'));
    expect(run({action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-C'}, {programs:draftTarget}))
      .toEqual({state:'BLOCKED_DEPENDENCY', asOf:AS_OF, scenario:{action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-C'},
        blockers:['RULEPACK_NOT_APPROVED'], coreVersion:MAJOR_WHAT_IF_CORE_VERSION});
    // An unapproved pack both sides share is a current-side problem only.
    const draftPrimary = replace(CATALOG, 'SYN-A-DM-1', primaryA('SYN-A-DM-1', 'SYN-A-MAJOR-DM', 18, 'NEEDS_REVIEW'));
    expect(run({action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-C'}, {programs:draftPrimary}))
      .toMatchObject({state:'BLOCKED_DEPENDENCY', blockers:['CURRENT_RULEPACK_NOT_APPROVED']});
    const both = replace(draftTarget, 'SYN-B-DM-1', doubleB('DRAFT'));
    expect(run({action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-C'}, {programs:both}))
      .toMatchObject({blockers:['CURRENT_RULEPACK_NOT_APPROVED', 'RULEPACK_NOT_APPROVED']});
    const noCurrent = CATALOG.filter(offer => offer.pack.rulePackVersion !== 'SYN-B-DM-1');
    expect(run({action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-C'}, {programs:noCurrent}))
      .toMatchObject({blockers:['CURRENT_RULEPACK_NOT_APPROVED']});
  });

  it('refuses changes that do not fit the current programs or that the catalog lacks', () => {
    const unavailable = (scenario:WhatIfScenario, current:ProgramEnrollment = A_WITH_B, programs = CATALOG) =>
      expect(run(scenario, {current, programs})).toMatchObject({state:'BLOCKED_DEPENDENCY', blockers:['TARGET_PROGRAM_UNAVAILABLE']});
    unavailable({action:'ADD_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-C'});
    unavailable({action:'ADD_MINOR', targetMajorId:'SYN-MAJ-C'});
    unavailable({action:'CHANGE_MINOR', targetMajorId:'SYN-MAJ-C'});
    unavailable({action:'REMOVE_MINOR'});
    unavailable({action:'REMOVE_DOUBLE_MAJOR'}, A_ONLY);
    unavailable({action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-B'});
    unavailable({action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-A'});
    unavailable({action:'CHANGE_PRIMARY_MAJOR', targetMajorId:'SYN-MAJ-B'});
    unavailable({action:'CHANGE_PRIMARY_MAJOR', targetMajorId:'SYN-MAJ-A'});
    unavailable({action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-NOWHERE'});
    unavailable({action:'REMOVE_DOUBLE_MAJOR'}, A_WITH_B, CATALOG.filter(offer => offer.pack.rulePackVersion !== 'SYN-A-MD-1'));
    unavailable({action:'ADD_MINOR', targetMajorId:'SYN-MAJ-B'}, A_ONLY);
    const minorNow:ProgramEnrollment = {primaryProgramId:'SYN-MAJ-A', secondary:{role:'MINOR', programId:'SYN-MAJ-C'}};
    unavailable({action:'REMOVE_DOUBLE_MAJOR'}, minorNow);
    unavailable({action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-B'}, minorNow);
  });

  it('a change can move a MISSING row by credits only: still MISSING, more credits short', () => {
    // E uses A1 and A2 (area E). With A + E, A1 and A2 are shared without a rule, so A's area row
    // without them has only S1: 6 of 18, missing 12 (now: missing 6). A's required A1 depends on a
    // shared course, so it is held too. E's own row has A1 + A2 = 12 of 6 with them, 0 without.
    const packE:MajorRulePack = {rulePackVersion:'SYN-E-DM-1', rulePackState:'APPROVED',
      courseAreas:{'SYN-A1':['SYN-AREA-E'], 'SYN-A2':['SYN-AREA-E']},
      requirements:[{id:'SYN-E-MAJOR', kind:'CATEGORY_MINIMUM', areaId:'SYN-AREA-E', requiredCreditUnits:6, evidenceRefs:['EV-SYN-E']}]};
    const result = ready(run({action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-E'},
      {programs:[...CATALOG, {role:'DOUBLE_MAJOR', programId:'SYN-MAJ-E', pack:packE}]}));
    expect(result.hypothetical.requirements).toEqual([
      {requirementId:'SYN-A-TOTAL', state:'MISSING', missingCreditUnits:224},
      {requirementId:'SYN-A-MAJOR-DM', state:'MISSING', missingCreditUnits:12},
      {requirementId:'SYN-A-REQ', state:'MISSING'},
      {requirementId:'SYN-E-MAJOR', state:'MISSING', missingCreditUnits:6},
    ]);
    expect(result.hypothetical.reviewRequirementIds).toEqual(['SYN-A-MAJOR-DM', 'SYN-A-REQ', 'SYN-E-MAJOR']);
    expect(result.delta.map(row => [row.requirementId, row.change])).toEqual([
      ['SYN-A-TOTAL', 'UNCHANGED'], ['SYN-A-MAJOR-DM', 'PROGRESS_CHANGED'], ['SYN-A-REQ', 'PROGRESS_CHANGED'],
      ['SYN-B-MAJOR', 'REMOVED_REQUIREMENT'], ['SYN-B-REQ', 'REMOVED_REQUIREMENT'], ['SYN-E-MAJOR', 'NEW_REQUIREMENT'],
    ]);
  });

  it('refuses malformed input instead of guessing', () => {
    expect(() => run({action:'ADD_DOUBLE_MAJOR'} as unknown as WhatIfScenario)).toThrow(/scenario/);
    expect(() => run({action:'REMOVE_DOUBLE_MAJOR'}, {programs:[...CATALOG, CATALOG[3]!]})).toThrow(/more than once/);
    const clash = replace(CATALOG, 'SYN-C-DM-1', {...packC('SYN-C-DM-1', 'SYN-C'),
      requirements:[{id:'SYN-A-REQ', kind:'REQUIRED_COURSE', canonicalCourseId:'SYN-C2', evidenceRefs:['EV-SYN-C']}]});
    expect(() => run({action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-C'}, {programs:clash})).toThrow(/both the primary and the second/);
    const noTotal = replace(CATALOG, 'SYN-D-DM-1', {...primaryD, requirements:primaryD.requirements.slice(1)});
    expect(() => run({action:'CHANGE_PRIMARY_MAJOR', targetMajorId:'SYN-MAJ-D'}, {programs:noTotal})).toThrow(/CREDIT_TOTAL/);
    const noEvidence = replace(CATALOG, 'SYN-C-DM-1', {...packC('SYN-C-DM-1', 'SYN-C'),
      requirements:[{id:'SYN-C-MAJOR', kind:'CATEGORY_MINIMUM', areaId:'SYN-AREA-C', requiredCreditUnits:6}]});
    expect(() => run({action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-C'}, {programs:noEvidence})).toThrow(/no evidence/);
    expect(() => run({action:'REMOVE_DOUBLE_MAJOR'}, {current:{primaryProgramId:'SYN-MAJ-A', secondary:{role:'DOUBLE_MAJOR', programId:'SYN-MAJ-A'}}}))
      .toThrow(/cannot be the primary/);
  });

  it('names a bad program ID instead of silently mapping unknown degree paths (#231 follow-up)', () => {
    const malformed:ProgramOffer[] = CATALOG.map(offer => offer.role === 'PRIMARY_MAJOR'
      && offer.programId === 'SYN-MAJ-D'
      ? {...offer, degreePath:'UNKNOWN' as never} : offer);
    expect(() => run({action:'CHANGE_PRIMARY_MAJOR',targetMajorId:'SYN-MAJ-D'}, {programs:malformed}))
      .toThrow('Primary pack SYN-MAJ-D needs a supported degree path');
    // A legitimate, canonical contract path must not be downgraded to UNKNOWN.
    const canonical=CATALOG.map(offer => offer.role === 'PRIMARY_MAJOR'
      && offer.programId === 'SYN-MAJ-A'
      && offer.degreePath === 'MAJOR_DEEPENING'
      ? {...offer,degreePath:'ADVANCED_SINGLE' as const} : offer);
    const expected=run({action:'REMOVE_DOUBLE_MAJOR'});
    expect(run({action:'REMOVE_DOUBLE_MAJOR'},{programs:canonical})).toEqual(expected);
  });

  it('undoing a change swaps the two sides, on seeded random transcripts', () => {
    // Metamorphic check that does not re-derive the answer: "drop B" seen from A+B must equal
    // "add B" seen from A alone with the sides swapped, and the same for B→C vs C→B and minors.
    let seed = 20261104;
    const rng = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const pool = ['SYN-A1', 'SYN-A2', 'SYN-S1', 'SYN-B1', 'SYN-B2', 'SYN-C1', 'SYN-C2', 'SYN-G1'];
    const strip = ({role:_role, ...side}:WhatIfProjection) => side;
    const swapped = (forward:MajorWhatIfResult, back:MajorWhatIfResult) => {
      const f = ready(forward), b = ready(back);
      expect(strip(f.hypothetical)).toEqual(strip(b.current));
      expect(strip(f.current)).toEqual(strip(b.hypothetical));
    };
    for (let i = 0; i < 300; i++) {
      const attempts = pool.filter(() => rng() < 0.6).map(id => course(id, rng() < 0.25 ? {ledger:'IN_PROGRESS', term:'2026-2'} : {}));
      const at = (current:ProgramEnrollment, scenario:WhatIfScenario) => run(scenario, {current, attempts});
      const withC:ProgramEnrollment = {primaryProgramId:'SYN-MAJ-A', secondary:{role:'DOUBLE_MAJOR', programId:'SYN-MAJ-C'}};
      const minorC:ProgramEnrollment = {primaryProgramId:'SYN-MAJ-A', secondary:{role:'MINOR', programId:'SYN-MAJ-C'}};
      swapped(at(A_WITH_B, {action:'REMOVE_DOUBLE_MAJOR'}), at(A_ONLY, {action:'ADD_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-B'}));
      swapped(at(A_WITH_B, {action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-C'}), at(withC, {action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-B'}));
      swapped(at(minorC, {action:'REMOVE_MINOR'}), at(A_ONLY, {action:'ADD_MINOR', targetMajorId:'SYN-MAJ-C'}));
      // Independent count: the unique earned total is 6 units per distinct earned course, on both sides.
      const earned = 6 * new Set(attempts.filter(a => a.ledger === 'EARNED').map(a => a.canonicalCourseId)).size;
      const r = ready(at(A_WITH_B, {action:'CHANGE_PRIMARY_MAJOR', targetMajorId:'SYN-MAJ-D'}));
      expect([r.current.earnedCreditUnits, r.hypothetical.earnedCreditUnits]).toEqual([earned, earned]);
      expect(r.current.remainingCreditUnits).toBe(Math.max(0, 260 - earned));
    }
  });

  it('gives the same answer whatever order the catalog and attempts come in', () => {
    const scenario:WhatIfScenario = {action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-C'};
    expect(run(scenario, {programs:[...CATALOG].reverse(), attempts:[...ATTEMPTS].reverse()})).toEqual(run(scenario));
  });

  it('fits the #107 owner contract once the server adds versions, evidence links and approval', () => {
    for (const scenario of [{action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-C'}, {action:'REMOVE_DOUBLE_MAJOR'},
      {action:'CHANGE_PRIMARY_MAJOR', targetMajorId:'SYN-MAJ-D'}] as WhatIfScenario[]) {
      const result = ready(run(scenario));
      const view = ({role, asOf, earnedCreditUnits, remainingCreditUnits, requirements}:typeof result.current, rulePackVersion:string) =>
        ({role, asOf, rulePackVersion, earnedCreditUnits, remainingCreditUnits, requirements});
      const refs = [...new Set(result.delta.flatMap(row => row.evidenceRefs))];
      const versions = {currentRulePack:'SYN-CUR', hypotheticalRulePack:'SYN-HYP', cohort:'SYN-COHORT', overlapPolicy:'SYN-OVERLAP',
        transcriptProjection:'SYN-TR', core:result.coreVersion};
      const wire = OwnerMajorWhatIfReadySchema.safeParse({
        state:'READY', asOf:result.asOf, scenario:result.scenario,
        current:view(result.current, 'SYN-CUR'), hypothetical:view(result.hypothetical, 'SYN-HYP'), delta:result.delta,
        versions, evidenceLinks:refs.map(ref => ({evidenceRef:ref, href:`https://example.test/${ref}`, verifiedAt:AS_OF})),
        approval:{verifiedAt:AS_OF, coreVersion:versions.core, cohortApplicabilityVersion:'SYN-COHORT', currentRulePackVersion:'SYN-CUR',
          hypotheticalRulePackVersion:'SYN-HYP', overlapPolicyVersion:'SYN-OVERLAP', transcriptProjectionVersion:'SYN-TR',
          sourceRightsVersion:'SYN-RIGHTS', ownerConsentVersion:'SYN-CONSENT', officialEvidenceRefs:refs},
        caveat:'HYPOTHETICAL_NOT_OFFICIAL',
      });
      expect(wire.success, JSON.stringify(wire.error?.issues)).toBe(true);
    }
    const blocked = run({action:'REMOVE_MINOR'});
    if (blocked.state !== 'BLOCKED_DEPENDENCY') throw new Error('expected BLOCKED');
    expect(OwnerMajorWhatIfBlockedSchema.safeParse({state:blocked.state, asOf:blocked.asOf, scenario:blocked.scenario,
      blockers:blocked.blockers, caveat:'HYPOTHETICAL_NOT_OFFICIAL'}).success).toBe(true);
  });
});
