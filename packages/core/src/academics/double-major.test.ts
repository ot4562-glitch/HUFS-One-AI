import {describe, expect, it} from 'vitest';
import {AcademicAuditVNextSchema} from '@hufs-one/contracts';
import {buildDoubleMajorAudit, type DoubleMajorAttempt, type DoubleMajorRequest, type MajorRulePack} from './double-major.js';
import {buildAcademicLedger, type LedgerRequirement} from './ledger.js';

/** Synthetic only. 1 unit = 0.5학점, so a 3학점 course is 6 units. */
const AS_OF = '2026-11-01T00:00:00.000Z';
const course = (canonicalCourseId:string, over:Partial<DoubleMajorAttempt> = {}):DoubleMajorAttempt => ({
  attemptToken:`${canonicalCourseId}-T`, canonicalCourseId, creditUnits:6, ledger:'EARNED', recognition:'RECOGNIZED', term:'2025-2', ...over,
});

/** P = primary only, D = double major only, S = shared by both, G = general education. */
const ATTEMPTS:DoubleMajorAttempt[] = [
  course('SYN-P1', {term:'2025-1'}), course('SYN-P2'), course('SYN-D1', {term:'2025-1'}),
  course('SYN-D2', {ledger:'IN_PROGRESS', term:'2026-2'}), course('SYN-S1'), course('SYN-G1'),
];

const PRIMARY:MajorRulePack = {
  rulePackVersion:'SYN-PRIMARY-1', rulePackState:'APPROVED',
  requirements:[
    {id:'SYN-P-TOTAL', kind:'CREDIT_TOTAL', requiredCreditUnits:260, evidenceRefs:['SYN-EV-P']},
    {id:'SYN-P-MAJOR-MIN', kind:'CATEGORY_MINIMUM', areaId:'SYN-P-MAJOR', requiredCreditUnits:12, evidenceRefs:['SYN-EV-P']},
    {id:'SYN-P-REQ', kind:'REQUIRED_COURSE', canonicalCourseId:'SYN-P1', evidenceRefs:['SYN-EV-P']},
  ],
  courseAreas:{'SYN-P1':['SYN-P-MAJOR'], 'SYN-P2':['SYN-P-MAJOR'], 'SYN-S1':['SYN-P-MAJOR'], 'SYN-G1':['SYN-GEN']},
};

const DOUBLE:MajorRulePack = {
  rulePackVersion:'SYN-DOUBLE-1', rulePackState:'APPROVED',
  requirements:[
    {id:'SYN-D-MAJOR-MIN', kind:'CATEGORY_MINIMUM', areaId:'SYN-D-MAJOR', requiredCreditUnits:12, evidenceRefs:['SYN-EV-D']},
    {id:'SYN-D-REQ', kind:'REQUIRED_COURSE', canonicalCourseId:'SYN-D1', evidenceRefs:['SYN-EV-D']},
    {id:'SYN-D-ONE-OF', kind:'K_OF_N', courseIds:['SYN-S1', 'SYN-D2', 'SYN-D3'], k:1, evidenceRefs:['SYN-EV-D']},
  ],
  courseAreas:{'SYN-D1':['SYN-D-MAJOR'], 'SYN-D2':['SYN-D-MAJOR'], 'SYN-S1':['SYN-D-MAJOR']},
};

const request = (doubleMajor:DoubleMajorRequest['doubleMajor'], over:Partial<DoubleMajorRequest> = {}):DoubleMajorRequest =>
  ({asOf:AS_OF, attempts:ATTEMPTS, primary:PRIMARY, doubleMajor, ...over});
const selected = (pack:Partial<DoubleMajorRequest['doubleMajor'] & {status:'SELECTED'}>['pack'] = DOUBLE) =>
  ({status:'SELECTED' as const, ...(pack ? {pack} : {})});
const stateOf = (audit:{requirements:{requirementId:string; state:string}[]}) =>
  Object.fromEntries(audit.requirements.map(row => [row.requirementId, row.state]));

describe('buildDoubleMajorAudit', () => {
  it('checks the primary major alone when there is no double major', () => {
    const result = buildDoubleMajorAudit(request({status:'NONE'}));
    expect(result.doubleMajor).toEqual({status:'NOT_APPLICABLE'});
    expect(result.overlap.status).toBe('NONE');
    expect(result.primary).toEqual(buildAcademicLedger({
      asOf:AS_OF, rulePackVersion:PRIMARY.rulePackVersion, rulePackState:'APPROVED', requirements:PRIMARY.requirements,
      attempts:ATTEMPTS.map(attempt => ({...attempt, areaIds:PRIMARY.courseAreas[attempt.canonicalCourseId] ?? []})),
    }));
    expect(result.uniqueCredits).toEqual({earnedCreditUnits:30, inProgressCreditUnits:6, plannedCreditUnits:0, projectedCreditUnits:36});
    expect(result.state).toBe('READY');
  });

  it('asks for input when the double major is not entered, and says when its rules are missing', () => {
    const unset = buildDoubleMajorAudit(request({status:'UNSET'}));
    expect(unset).toMatchObject({doubleMajor:{status:'INPUT_REQUIRED'}, state:'NEEDS_REVIEW'});
    expect(buildDoubleMajorAudit(request({status:'SELECTED'})).doubleMajor).toEqual({status:'RULES_MISSING'});
    expect(buildDoubleMajorAudit(request(selected({...DOUBLE, rulePackState:'MISSING'}))).doubleMajor).toEqual({status:'RULES_MISSING'});
  });

  it('checks each major with its own areas and counts a shared course once in the unique total', () => {
    const result = buildDoubleMajorAudit(request(selected()));
    expect(result.doubleMajor.status).toBe('CHECKED');
    const audit = result.doubleMajor.status === 'CHECKED' ? result.doubleMajor.audit : null;
    expect(audit?.areaProgress).toEqual([{areaId:'SYN-D-MAJOR', earnedCreditUnits:12, projectedCreditUnits:18}]);
    expect(result.primary.areaProgress).toEqual([
      {areaId:'SYN-GEN', earnedCreditUnits:6, projectedCreditUnits:6},
      {areaId:'SYN-P-MAJOR', earnedCreditUnits:18, projectedCreditUnits:18},
    ]);
    expect(result.uniqueCredits.earnedCreditUnits).toBe(30);
    expect(result.overlap.sharedCourses).toEqual([
      {courseId:'SYN-S1', ledger:'EARNED', creditUnits:6, primaryAreaIds:['SYN-P-MAJOR'], doubleMajorAreaIds:['SYN-D-MAJOR']},
    ]);
    expect(result.overlap.sharedCreditUnits).toBe(6);
  });

  it('holds only the rows whose result depends on a shared course when no approved rule exists', () => {
    const result = buildDoubleMajorAudit(request(selected()));
    expect(result.overlap).toMatchObject({status:'NO_APPROVED_RULE',
      heldRequirementIds:{primary:[], doubleMajor:['SYN-D-MAJOR-MIN', 'SYN-D-ONE-OF']}});
    // The primary major area is met even without the shared course, so it keeps its result.
    expect(stateOf(result.primary)).toEqual({'SYN-P-TOTAL':'UNSATISFIED', 'SYN-P-MAJOR-MIN':'SATISFIED', 'SYN-P-REQ':'SATISFIED'});
    expect(result.overlap.rowImpacts).toEqual({
      primary:[{requirementId:'SYN-P-MAJOR-MIN', decided:true, metWithShared:true, metWithoutShared:true,
        earnedCreditUnitsWithoutShared:12, remainingCreditUnitsWithoutShared:0, projectedCreditUnitsWithoutShared:12}],
      doubleMajor:[
        {requirementId:'SYN-D-MAJOR-MIN', decided:false, metWithShared:true, metWithoutShared:false,
          earnedCreditUnitsWithoutShared:6, remainingCreditUnitsWithoutShared:6, projectedCreditUnitsWithoutShared:12},
        {requirementId:'SYN-D-ONE-OF', decided:false, metWithShared:true, metWithoutShared:false, matchedCoursesCountWithoutShared:0},
      ],
    });
    const audit = result.doubleMajor.status === 'CHECKED' ? result.doubleMajor.audit : null;
    expect(stateOf(audit!)).toEqual({'SYN-D-MAJOR-MIN':'NEEDS_REVIEW', 'SYN-D-REQ':'SATISFIED', 'SYN-D-ONE-OF':'NEEDS_REVIEW'});
    expect(result.state).toBe('NEEDS_REVIEW');
  });

  it('keeps the rows when an approved overlap rule covers all shared credits', () => {
    const result = buildDoubleMajorAudit(request(selected({...DOUBLE, overlapRule:{maxSharedCreditUnits:6, evidenceRefs:['SYN-EV-OVERLAP']}})));
    expect(result.overlap).toMatchObject({status:'COVERED_BY_APPROVED_RULE', evidenceRefs:['SYN-EV-OVERLAP'],
      heldRequirementIds:{primary:[], doubleMajor:[]}});
    const audit = result.doubleMajor.status === 'CHECKED' ? result.doubleMajor.audit : null;
    expect(stateOf(audit!)).toEqual({'SYN-D-MAJOR-MIN':'SATISFIED', 'SYN-D-REQ':'SATISFIED', 'SYN-D-ONE-OF':'SATISFIED'});
    expect(result.state).toBe('READY');
  });

  it('holds the rows when shared credits exceed the approved limit', () => {
    const result = buildDoubleMajorAudit(request(selected({...DOUBLE, overlapRule:{maxSharedCreditUnits:4, evidenceRefs:['SYN-EV-OVERLAP']}})));
    expect(result.overlap).toMatchObject({status:'OVER_APPROVED_LIMIT',
      heldRequirementIds:{primary:[], doubleMajor:['SYN-D-MAJOR-MIN', 'SYN-D-ONE-OF']}});
    expect(result.state).toBe('NEEDS_REVIEW');
  });

  it('ignores an overlap rule from an unapproved double major pack', () => {
    const result = buildDoubleMajorAudit(request(selected({...DOUBLE, rulePackState:'DRAFT',
      overlapRule:{maxSharedCreditUnits:60, evidenceRefs:['SYN-EV-OVERLAP']}})));
    expect(result.overlap.status).toBe('NO_APPROVED_RULE');
    const audit = result.doubleMajor.status === 'CHECKED' ? result.doubleMajor.audit : null;
    expect(audit?.requirements.every(row => row.state !== 'SATISFIED')).toBe(true);
  });

  it('holds a required course of the double major when that course is shared', () => {
    const pack = {...DOUBLE, requirements:[...DOUBLE.requirements,
      {id:'SYN-D-REQ-S', kind:'REQUIRED_COURSE', canonicalCourseId:'SYN-S1', evidenceRefs:['SYN-EV-D']} as LedgerRequirement]};
    const result = buildDoubleMajorAudit(request(selected(pack)));
    expect(result.overlap.heldRequirementIds.doubleMajor).toContain('SYN-D-REQ-S');
    expect(result.overlap.heldRequirementIds.doubleMajor).not.toContain('SYN-D-REQ');
  });

  it('treats a course one major names as required and the other allocates to an area as shared', () => {
    const pack = {...DOUBLE, requirements:[...DOUBLE.requirements,
      {id:'SYN-D-REQ-P2', kind:'REQUIRED_COURSE', canonicalCourseId:'SYN-P2', evidenceRefs:['SYN-EV-D']} as LedgerRequirement]};
    const result = buildDoubleMajorAudit(request(selected(pack)));
    expect(result.overlap.sharedCourses.map(row => [row.courseId, row.primaryAreaIds, row.doubleMajorAreaIds]))
      .toEqual([['SYN-P2', ['SYN-P-MAJOR'], []], ['SYN-S1', ['SYN-P-MAJOR'], ['SYN-D-MAJOR']]]);
    expect(result.overlap.heldRequirementIds.doubleMajor).toContain('SYN-D-REQ-P2');
    expect(result.overlap.sharedCreditUnits).toBe(12);
    // Without both shared courses the primary major area falls to 6 units, below its 12.
    expect(result.overlap.heldRequirementIds.primary).toEqual(['SYN-P-MAJOR-MIN']);
    const primary = {...PRIMARY, requirements:[...PRIMARY.requirements,
      {id:'SYN-P-REQ-D1', kind:'REQUIRED_COURSE', canonicalCourseId:'SYN-D1', evidenceRefs:['SYN-EV-P']} as LedgerRequirement]};
    const named = buildDoubleMajorAudit(request(selected(), {primary}));
    expect(named.overlap.sharedCourses.map(row => row.courseId)).toEqual(['SYN-D1', 'SYN-S1']);
    expect(named.overlap.heldRequirementIds.primary).toEqual(['SYN-P-REQ-D1']);
  });

  it('holds nothing when a shared course is not yet earned, but reports the figures without it', () => {
    const attempts = ATTEMPTS.map(row => row.canonicalCourseId === 'SYN-S1' ? {...row, ledger:'IN_PROGRESS' as const, term:'2026-2'} : row);
    const result = buildDoubleMajorAudit(request(selected(), {attempts}));
    expect(result.overlap).toMatchObject({status:'NO_APPROVED_RULE', heldRequirementIds:{primary:[], doubleMajor:[]}});
    expect(result.overlap.rowImpacts.doubleMajor[0]).toEqual({requirementId:'SYN-D-MAJOR-MIN', decided:true,
      metWithShared:false, metWithoutShared:false, earnedCreditUnitsWithoutShared:6, remainingCreditUnitsWithoutShared:6,
      projectedCreditUnitsWithoutShared:12});
    expect(result.overlap.rowImpacts.doubleMajor[1]).toEqual({requirementId:'SYN-D-ONE-OF', decided:true,
      metWithShared:false, metWithoutShared:false, matchedCoursesCountWithoutShared:0});
    expect(result.state).toBe('READY');
  });

  it('finds no overlap when no counted course is used by both majors', () => {
    const separate = buildDoubleMajorAudit(request(selected({...DOUBLE,
      courseAreas:{'SYN-D1':['SYN-D-MAJOR'], 'SYN-D2':['SYN-D-MAJOR']},
      requirements:DOUBLE.requirements.filter(row => row.id !== 'SYN-D-ONE-OF')})));
    expect(separate.overlap).toMatchObject({status:'NONE', sharedCourses:[], sharedCreditUnits:0});
    const excluded = buildDoubleMajorAudit(request(selected(), {
      attempts:ATTEMPTS.map(row => row.canonicalCourseId === 'SYN-S1' ? {...row, recognition:'EXCLUDED' as const} : row)}));
    expect(excluded.overlap.sharedCourses).toEqual([]);
  });

  it('returns contract-valid audits for both majors', () => {
    for (const result of [buildDoubleMajorAudit(request(selected())), buildDoubleMajorAudit(request({status:'NONE'}))]) {
      expect(AcademicAuditVNextSchema.safeParse(result.primary).success).toBe(true);
      if (result.doubleMajor.status === 'CHECKED') expect(AcademicAuditVNextSchema.safeParse(result.doubleMajor.audit).success).toBe(true);
    }
  });

  it('refuses inputs outside the model', () => {
    expect(() => buildDoubleMajorAudit(request(selected({...DOUBLE, requirements:[...DOUBLE.requirements,
      {id:'SYN-D-TOTAL', kind:'CREDIT_TOTAL', requiredCreditUnits:84, evidenceRefs:['SYN-EV-D']}]}))))
      .toThrow(/graduation credit total/);
    expect(() => buildDoubleMajorAudit(request(selected({...DOUBLE, rulePackVersion:PRIMARY.rulePackVersion})))).toThrow(/different rule packs/);
    expect(() => buildDoubleMajorAudit(request(selected(), {attempts:[{...ATTEMPTS[0]!, areaIds:['SYN-X']} as DoubleMajorAttempt]})))
      .toThrow(/carries areaIds/);
    expect(() => buildDoubleMajorAudit(request(selected({...DOUBLE, courseAreas:{'SYN-D1':['bad area!']}})))).toThrow(/area of SYN-D1/);
    expect(() => buildDoubleMajorAudit(request(selected({...DOUBLE, overlapRule:{maxSharedCreditUnits:6, evidenceRefs:[]}}))))
      .toThrow(/official evidence/);
  });
});
