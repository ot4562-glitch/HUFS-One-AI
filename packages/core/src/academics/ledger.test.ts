import {describe, expect, it} from 'vitest';
import {AcademicAuditVNextSchema} from '@hufs-one/contracts';
import {buildAcademicLedger, type AcademicLedgerRequest, type LedgerAttempt, type LedgerRequirement} from './ledger.js';

/** Integer credit units only. 1 unit = 0.5학점, so 3학점 is 6 units. */
const HALF = 1;
const CREDIT_3 = 6;
const CREDIT_6 = 12;
const CREDIT_9 = 18;
const CREDIT_12 = 24;
const AS_OF = '2026-11-01T00:00:00.000Z';
const RETAKE = {
  supersedesAttemptToken:'SYN-X-1',
  retakeApprovalRef:'SYN-RETAKE-APPROVAL-1',
  term:'2025-2',
} as const;

const attempt = (
  attemptToken:string,
  canonicalCourseId:string,
  over:Partial<LedgerAttempt> = {},
):LedgerAttempt => ({
  attemptToken,
  canonicalCourseId,
  creditUnits:CREDIT_3,
  ledger:'EARNED',
  areaIds:[],
  recognition:'RECOGNIZED',
  term:'2025-1',
  ...over,
});

const base = (
  attempts:readonly LedgerAttempt[],
  requirements:readonly LedgerRequirement[] = [],
  over:Partial<AcademicLedgerRequest> = {},
):AcademicLedgerRequest => ({
  asOf:AS_OF,
  rulePackVersion:'SYN-PACK-1',
  rulePackState:'APPROVED',
  attempts,
  requirements,
  ...over,
});

const requirement = (id:string):LedgerRequirement => ({
  id, kind:'K_OF_N', courseIds:['SYN-A', 'SYN-B', 'SYN-C'], k:2, evidenceRefs:[`SYN-EVIDENCE-${id}`],
});

describe('buildAcademicLedger A08.5 credit units', () => {
  it('CREDIT-01 counts one 3학점 course once toward the total and fully toward each approved area', () => {
    const audit = buildAcademicLedger(base([
      attempt('SYN-X-1', 'SYN-X', {areaIds:['SYN-AREA-A', 'SYN-AREA-B']}),
    ]));
    expect(AcademicAuditVNextSchema.parse(audit)).toEqual(audit);
    expect(audit.earnedCreditUnits).toBe(CREDIT_3);
    expect(audit.projectedUniqueCreditUnits).toBe(CREDIT_3);
    expect(audit.inProgressCreditUnits).toBe(0);
    expect(audit.plannedCreditUnits).toBe(0);
    expect(audit.pendingRecognitionCreditUnits).toBe(0);
    expect(audit.areaProgress).toEqual([
      {areaId:'SYN-AREA-A', earnedCreditUnits:CREDIT_3, projectedCreditUnits:CREDIT_3},
      {areaId:'SYN-AREA-B', earnedCreditUnits:CREDIT_3, projectedCreditUnits:CREDIT_3},
    ]);
    expect(audit.earnedCreditUnits).not.toBe(CREDIT_3 + CREDIT_3);
    expect(audit.asOf).toBe(AS_OF);
    expect(audit.rulePackVersion).toBe('SYN-PACK-1');
  });

  it('CREDIT-02 keeps only the approved retake and excludes the earlier attempt', () => {
    const audit = buildAcademicLedger(base([
      attempt('SYN-X-1', 'SYN-X', {areaIds:['SYN-AREA-A'], term:'2025-1'}),
      attempt('SYN-X-2', 'SYN-X', {areaIds:['SYN-AREA-A'], ...RETAKE}),
    ]));
    expect(audit.earnedCreditUnits).toBe(CREDIT_3);
    expect(audit.projectedUniqueCreditUnits).toBe(CREDIT_3);
    expect(audit.areaProgress).toEqual([
      {areaId:'SYN-AREA-A', earnedCreditUnits:CREDIT_3, projectedCreditUnits:CREDIT_3},
    ]);
    expect(audit.excludedAttempts).toEqual([
      {attemptToken:'SYN-X-1', reason:'RETAKE_SUPERSEDED'},
    ]);
    expect(audit.state).toBe('READY');
  });

  describe('an unverified supersede link never removes earned credit', () => {
    const earned = attempt('SYN-X-1', 'SYN-X', {areaIds:['SYN-AREA-A'], term:'2025-1'});
    const expectEarnedKept = (claimer:LedgerAttempt) => {
      const audit = buildAcademicLedger(base([earned, claimer]));
      expect(audit.earnedCreditUnits).toBe(CREDIT_3);
      expect(audit.areaProgress.find(area => area.areaId === 'SYN-AREA-A')?.earnedCreditUnits).toBe(CREDIT_3);
      expect(audit.excludedAttempts).toEqual([{attemptToken:claimer.attemptToken, reason:'NEEDS_REVIEW'}]);
      expect(audit.state).toBe('NEEDS_REVIEW');
      return audit;
    };

    it('a different course cannot supersede an earned course', () => {
      expectEarnedKept(attempt('SYN-Y-1', 'SYN-Y', {areaIds:['SYN-AREA-A'], ...RETAKE}));
    });

    it('a planned or in-progress attempt of the same course cannot supersede an earned one', () => {
      const planned = expectEarnedKept(attempt('SYN-X-2', 'SYN-X', {...RETAKE, ledger:'PLANNED', term:'2026-2'}));
      expect(planned.plannedCreditUnits).toBe(0);
      const current = expectEarnedKept(attempt('SYN-X-2', 'SYN-X', {...RETAKE, ledger:'IN_PROGRESS', term:'2026-2'}));
      expect(current.inProgressCreditUnits).toBe(0);
    });

    it('a pending or excluded later attempt cannot supersede an earned one', () => {
      const pending = expectEarnedKept(attempt('SYN-X-2', 'SYN-X', {...RETAKE, recognition:'PENDING'}));
      expect(pending.pendingRecognitionCreditUnits).toBe(0);
      expectEarnedKept(attempt('SYN-X-2', 'SYN-X', {...RETAKE, recognition:'EXCLUDED'}));
    });

    it('a retake without an approval reference or a later term is held for review', () => {
      const {retakeApprovalRef: _omit, ...noApproval} = RETAKE;
      expectEarnedKept(attempt('SYN-X-2', 'SYN-X', noApproval));
      expectEarnedKept(attempt('SYN-X-2', 'SYN-X', {...RETAKE, term:'2025-1'}));
      expectEarnedKept(attempt('SYN-X-2', 'SYN-X', {...RETAKE, term:'2024-2'}));
      const {term: _noTerm, ...noTerm} = RETAKE;
      expectEarnedKept(attempt('SYN-X-2', 'SYN-X', noTerm));
    });

    it('two claimers on one earned attempt hold both claimers and keep the original', () => {
      const audit = buildAcademicLedger(base([
        earned,
        attempt('SYN-X-2', 'SYN-X', RETAKE),
        attempt('SYN-X-3', 'SYN-X', {...RETAKE, term:'2026-1'}),
      ]));
      expect(audit.earnedCreditUnits).toBe(CREDIT_3);
      expect(audit.excludedAttempts).toEqual([
        {attemptToken:'SYN-X-2', reason:'NEEDS_REVIEW'},
        {attemptToken:'SYN-X-3', reason:'NEEDS_REVIEW'},
      ]);
      expect(audit.state).toBe('NEEDS_REVIEW');
    });

    it('refuses a malformed term', () => {
      expect(() => buildAcademicLedger(base([attempt('SYN-X-1', 'SYN-X', {term:'2025-3'})]))).toThrow(/term/);
    });
  });

  it('CREDIT-03 keeps a pending exchange out of earned credits and shows 3학점 awaiting recognition', () => {
    const audit = buildAcademicLedger(base([
      attempt('SYN-EX-1', 'SYN-EXCHANGE', {recognition:'PENDING', areaIds:['SYN-AREA-A']}),
    ]));
    expect(audit.earnedCreditUnits).toBe(0);
    expect(audit.inProgressCreditUnits).toBe(0);
    expect(audit.plannedCreditUnits).toBe(0);
    expect(audit.projectedUniqueCreditUnits).toBe(0);
    expect(audit.pendingRecognitionCreditUnits).toBe(CREDIT_3);
    expect(audit.areaProgress).toEqual([]);
    expect(audit.excludedAttempts).toEqual([
      {attemptToken:'SYN-EX-1', reason:'PENDING_RECOGNITION'},
    ]);
  });

  it('CREDIT-04 satisfies 2-of-3 from two earned courses and reports count apart from 6학점', () => {
    const choice = requirement('SYN-REQ-CHOICE');
    const audit = buildAcademicLedger(base([
      attempt('SYN-ATT-A', 'SYN-A'),
      attempt('SYN-ATT-B', 'SYN-B'),
    ], [choice]));
    expect(audit.requirements).toEqual([
      {
        requirementId:'SYN-REQ-CHOICE',
        state:'SATISFIED',
        earnedCreditUnits:CREDIT_6,
        matchedCoursesCount:2,
        requiredCoursesCount:2,
        evidenceRefs:['SYN-EVIDENCE-SYN-REQ-CHOICE'],
      },
    ]);
    expect(audit.earnedCreditUnits).toBe(CREDIT_6);
    expect(audit.state).toBe('READY');
  });

  it('CREDIT-04 does not need the third course, and an in-progress course does not add a match', () => {
    const audit = buildAcademicLedger(base([
      attempt('SYN-ATT-A', 'SYN-A'),
      attempt('SYN-ATT-B', 'SYN-B', {ledger:'IN_PROGRESS'}),
    ], [requirement('SYN-REQ-CHOICE')]));
    expect(audit.requirements[0]).toMatchObject({
      state:'UNSATISFIED',
      matchedCoursesCount:1,
      requiredCoursesCount:2,
      earnedCreditUnits:CREDIT_3,
    });
    expect(audit.earnedCreditUnits).toBe(CREDIT_3);
    expect(audit.inProgressCreditUnits).toBe(CREDIT_3);
  });

  it('CREDIT-05 keeps earned, in-progress, and planned courses on separate ledgers', () => {
    const audit = buildAcademicLedger(base([
      attempt('SYN-E', 'SYN-EARNED', {creditUnits:CREDIT_6, areaIds:['SYN-AREA-E']}),
      attempt('SYN-I', 'SYN-CURRENT', {creditUnits:CREDIT_3, ledger:'IN_PROGRESS', areaIds:['SYN-AREA-I']}),
      attempt('SYN-P', 'SYN-PLAN', {creditUnits:CREDIT_3, ledger:'PLANNED', areaIds:['SYN-AREA-P']}),
    ], [{
      id:'SYN-REQ-TOTAL',
      kind:'CREDIT_TOTAL',
      requiredCreditUnits:CREDIT_12,
      evidenceRefs:['SYN-EVIDENCE-TOTAL'],
    }]));
    expect(audit.earnedCreditUnits).toBe(CREDIT_6);
    expect(audit.inProgressCreditUnits).toBe(CREDIT_3);
    expect(audit.plannedCreditUnits).toBe(CREDIT_3);
    expect(audit.projectedUniqueCreditUnits).toBe(CREDIT_12);
    expect(audit.requirements[0]).toMatchObject({
      state:'UNSATISFIED',
      earnedCreditUnits:CREDIT_6,
      projectedCreditUnits:CREDIT_12,
      remainingCreditUnits:CREDIT_6,
    });
    expect(audit.areaProgress.find(area => area.areaId === 'SYN-AREA-E')).toEqual({
      areaId:'SYN-AREA-E', earnedCreditUnits:CREDIT_6, projectedCreditUnits:CREDIT_6,
    });
    expect(audit.areaProgress.find(area => area.areaId === 'SYN-AREA-P')).toEqual({
      areaId:'SYN-AREA-P', earnedCreditUnits:0, projectedCreditUnits:CREDIT_3,
    });
  });

  it('CREDIT-06 can meet every area minimum and still miss the unique total', () => {
    const category = (id:string, areaId:string):LedgerRequirement => ({
      id, kind:'CATEGORY_MINIMUM', areaId, requiredCreditUnits:CREDIT_3, evidenceRefs:[`SYN-EVIDENCE-${id}`],
    });
    const audit = buildAcademicLedger(base([
      attempt('SYN-ATT-A', 'SYN-A', {areaIds:['SYN-AREA-A']}),
      attempt('SYN-ATT-B', 'SYN-B', {areaIds:['SYN-AREA-B']}),
      attempt('SYN-ATT-C', 'SYN-C', {areaIds:['SYN-AREA-C']}),
    ], [
      category('SYN-REQ-A', 'SYN-AREA-A'),
      category('SYN-REQ-B', 'SYN-AREA-B'),
      category('SYN-REQ-C', 'SYN-AREA-C'),
      {id:'SYN-REQ-TOTAL', kind:'CREDIT_TOTAL', requiredCreditUnits:CREDIT_12, evidenceRefs:['SYN-EVIDENCE-TOTAL']},
    ]));
    expect(audit.earnedCreditUnits).toBe(CREDIT_9);
    expect(audit.requirements.filter(row => row.requirementId !== 'SYN-REQ-TOTAL').map(row => row.state))
      .toEqual(['SATISFIED', 'SATISFIED', 'SATISFIED']);
    expect(audit.requirements.find(row => row.requirementId === 'SYN-REQ-TOTAL')).toMatchObject({
      state:'UNSATISFIED',
      requiredCreditUnits:CREDIT_12,
      earnedCreditUnits:CREDIT_9,
      remainingCreditUnits:CREDIT_3,
    });
    expect(audit.state).toBe('READY');
    expect(audit.caveats[0]).toMatch(/not an official graduation decision/);
    expect(audit.planIssues).toEqual([]);
  });

  it('records 0.5학점 as 1 unit and adds half-credit courses as integers', () => {
    const audit = buildAcademicLedger(base([
      attempt('SYN-HALF-1', 'SYN-HALF-A', {creditUnits:HALF, areaIds:['SYN-AREA-H']}),
      attempt('SYN-HALF-2', 'SYN-HALF-B', {creditUnits:HALF}),
    ]));
    expect(audit.earnedCreditUnits).toBe(2);
    expect(audit.areaProgress).toEqual([
      {areaId:'SYN-AREA-H', earnedCreditUnits:HALF, projectedCreditUnits:HALF},
    ]);
  });

  it('refuses a non-integer unit instead of coercing 0.3', () => {
    expect(() => buildAcademicLedger(base([
      attempt('SYN-BAD', 'SYN-BAD', {creditUnits:0.3}),
    ]))).toThrow(TypeError);
    expect(() => buildAcademicLedger(base([
      attempt('SYN-BAD', 'SYN-BAD', {creditUnits:0.3}),
    ]))).toThrow(/refused 0\.3/);
    expect(() => buildAcademicLedger(base(
      [attempt('SYN-OK', 'SYN-OK')],
      [{id:'SYN-REQ-TOTAL', kind:'CREDIT_TOTAL', requiredCreditUnits:0.3, evidenceRefs:['SYN-EVIDENCE-TOTAL']}],
    ))).toThrow(/refused 0\.3/);
  });

  it('leaves GPA_NOT_COLLECTED unchecked even when evidence is supplied', () => {
    const audit = buildAcademicLedger(base([], [{
      id:'SYN-REQ-GPA',
      kind:'NON_CREDIT',
      criterionId:'SYN-GPA',
      verificationMode:'GPA_NOT_COLLECTED',
      evidenceRefs:['SYN-GPA-PROOF'],
    }]));
    expect(audit.requirements).toEqual([{
      requirementId:'SYN-REQ-GPA',
      state:'NOT_CHECKED',
      notCheckedReason:'GPA_NOT_COLLECTED',
      evidenceRefs:[],
    }]);
    expect(audit.state).toBe('NEEDS_REVIEW');
  });

  describe('an earned row counts only after its term ended by asOf', () => {
    const total:LedgerRequirement = {
      id:'SYN-REQ-TOTAL', kind:'CREDIT_TOTAL', requiredCreditUnits:CREDIT_3, evidenceRefs:['SYN-EVIDENCE-TOTAL'],
    };
    const future = attempt('SYN-F-1', 'SYN-F', {term:'2026-1', areaIds:['SYN-AREA-F']});

    it('holds an earned row from a later term in an earlier replay', () => {
      const audit = buildAcademicLedger(base([future], [total], {asOf:'2024-08-01T00:00:00Z'}));
      expect(audit.earnedCreditUnits).toBe(0);
      expect(audit.areaProgress).toEqual([]);
      expect(audit.excludedAttempts).toEqual([{attemptToken:'SYN-F-1', reason:'NEEDS_REVIEW'}]);
      expect(audit.requirements[0]?.state).toBe('UNSATISFIED');
      expect(audit.state).toBe('NEEDS_REVIEW');
    });

    it('holds the row until the term ends and counts it afterwards', () => {
      const during = buildAcademicLedger(base([future], [total], {asOf:'2026-06-30T14:59:59Z'}));
      expect(during.earnedCreditUnits).toBe(0);
      const after = buildAcademicLedger(base([future], [total], {asOf:'2026-06-30T15:00:00Z'}));
      expect(after.earnedCreditUnits).toBe(CREDIT_3);
      expect(after.requirements[0]?.state).toBe('SATISFIED');
      expect(after.state).toBe('READY');
    });

    it('does not promote an earned row without a term or a planned row to earned', () => {
      const {term: _drop, ...noTerm} = attempt('SYN-U-1', 'SYN-U');
      const audit = buildAcademicLedger(base([
        noTerm,
        attempt('SYN-P-1', 'SYN-P', {ledger:'PLANNED', term:'2024-1'}),
      ], [total]));
      expect(audit.earnedCreditUnits).toBe(0);
      expect(audit.plannedCreditUnits).toBe(CREDIT_3);
      expect(audit.excludedAttempts).toEqual([{attemptToken:'SYN-U-1', reason:'NEEDS_REVIEW'}]);
      expect(audit.requirements[0]?.state).toBe('UNSATISFIED');
      expect(audit.state).toBe('NEEDS_REVIEW');
    });

    it('keeps the original credit when the approved retake has not ended yet', () => {
      const audit = buildAcademicLedger(base([
        attempt('SYN-X-1', 'SYN-X'),
        attempt('SYN-X-2', 'SYN-X', {...RETAKE, term:'2026-2'}),
      ]));
      expect(audit.earnedCreditUnits).toBe(CREDIT_3);
      expect(audit.excludedAttempts).toEqual([{attemptToken:'SYN-X-2', reason:'NEEDS_REVIEW'}]);
    });
  });

  it('does not claim satisfaction when the rule pack is missing or not approved', () => {
    const attempts = [attempt('SYN-X-1', 'SYN-X')];
    const requirements:LedgerRequirement[] = [{
      id:'SYN-REQ-TOTAL', kind:'CREDIT_TOTAL', requiredCreditUnits:CREDIT_3, evidenceRefs:['SYN-EVIDENCE-TOTAL'],
    }];
    const missing = buildAcademicLedger(base(attempts, requirements, {
      rulePackState:'MISSING', rulePackVersion:'SYN-PACK-NONE',
    }));
    const draft = buildAcademicLedger(base(attempts, requirements, {rulePackState:'DRAFT'}));
    expect(missing.state).toBe('INSUFFICIENT_DATA');
    expect(draft.state).toBe('NEEDS_REVIEW');
    expect(missing.earnedCreditUnits).toBe(CREDIT_3);
    expect(draft.earnedCreditUnits).toBe(CREDIT_3);
    expect(missing.requirements[0]?.state).toBe('NEEDS_REVIEW');
    expect(draft.requirements[0]?.state).toBe('NEEDS_REVIEW');
    expect(missing.caveats.join(' ')).toMatch(/graduation is not claimed/);
    expect(draft.caveats.join(' ')).toMatch(/graduation is not claimed/);
  });
});
