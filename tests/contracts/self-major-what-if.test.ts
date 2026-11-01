import {describe,expect,it} from 'vitest';
import {
  OwnerMajorWhatIfRequestSchema,OwnerMajorWhatIfResponseSchema,
  OwnerMajorWhatIfBlockedSchema,OwnerMajorWhatIfScenarioSchema,
  isConsistentMajorWhatIfDelta,
} from '@hufs-one/contracts';

const scenario={action:'CHANGE_PRIMARY_MAJOR' as const,targetMajorId:'SYN-MAJOR-B'};
const blocked={
  state:'BLOCKED_DEPENDENCY' as const,
  asOf:'2026-11-01T00:00:00.000Z',
  scenario,
  blockers:['CALCULATION_CORE_UNAVAILABLE' as const],
  caveat:'HYPOTHETICAL_NOT_OFFICIAL' as const,
};

describe('A05 #82 owner What-if: hypothetical-only and NO unverified result',()=>{
  it('accepts the separate hypothetical action without mutable current student fields',()=>{
    expect(OwnerMajorWhatIfRequestSchema.parse({scenario})).toEqual({scenario});
    const actions=[
      {action:'CHANGE_PRIMARY_MAJOR',targetMajorId:'SYN-MAJOR-B'},
      {action:'ADD_DOUBLE_MAJOR',targetMajorId:'SYN-MAJOR-B'},
      {action:'CHANGE_DOUBLE_MAJOR',targetMajorId:'SYN-MAJOR-B'},
      {action:'REMOVE_DOUBLE_MAJOR'},
      {action:'ADD_MINOR',targetMajorId:'SYN-MAJOR-B'},
      {action:'CHANGE_MINOR',targetMajorId:'SYN-MAJOR-B'},
      {action:'REMOVE_MINOR'},
    ];
    for(const item of actions)
      expect(OwnerMajorWhatIfScenarioSchema.safeParse(item).success).toBe(true);
  });
  it('rejects browser-provided current majors, cohort, raw transcript, RulePack and actor',()=>{
    for(const extra of [
      {actorId:'SYN-OTHER'}, {currentMajor:'SYN-MAJOR-A'},
      {admissionYear:2024}, {transcript:[]},
      {rulePack:{state:'APPROVED'}}, {overlapPolicy:'TRUST_ME'},
      {attemptToken:'SYN-ATTEMPT'}, {grade:'A'},
    ])
      expect(OwnerMajorWhatIfRequestSchema.safeParse({scenario,...extra}).success)
        .toBe(false);
    expect(OwnerMajorWhatIfRequestSchema.safeParse({
      scenario:{action:'REMOVE_DOUBLE_MAJOR',targetMajorId:'SYN-MAJOR-B'},
    }).success).toBe(false);
    expect(OwnerMajorWhatIfRequestSchema.safeParse({
      scenario:{action:'ADD_MINOR'},
    }).success).toBe(false);
  });
  it('reports blockers without generating a hypothetical credit or requirement result',()=>{
    expect(OwnerMajorWhatIfResponseSchema.parse(blocked)).toEqual(blocked);
    const reasons=[
      'RULEPACK_NOT_APPROVED','CURRENT_RULEPACK_NOT_APPROVED',
      'COHORT_NOT_VERIFIED','DUPLICATE_RECOGNITION_UNVERIFIED',
      'SOURCE_RIGHTS_MISSING','OWNER_CONSENT_REQUIRED',
      'TRANSCRIPT_NOT_APPROVED','TARGET_PROGRAM_UNAVAILABLE',
    ];
    for(const reason of reasons)
      expect(OwnerMajorWhatIfBlockedSchema.safeParse({
        ...blocked,blockers:[reason],
      }).success).toBe(true);
  });
  it('rejects blocker states that smuggle a guessed comparison or fake official decision',()=>{
    for(const extra of [
      {delta:[{change:'ALREADY_SATISFIED'}]},
      {current:{earnedCreditUnits:100}},
      {hypothetical:{earnedCreditUnits:130}},
      {versions:{core:'SYN-FAKE'}},
      {approvedBy:'SYN-REVIEWER'},
      {officialResult:'ELIGIBLE'}, {state:'READY'},
      {transcript:[{grade:'A'}]},
    ])expect(OwnerMajorWhatIfResponseSchema.safeParse({
      ...blocked,...extra,
    }).success).toBe(false);
  });
  it('rejects duplicate dependency blockers without any invented calculation',()=>{
    expect(OwnerMajorWhatIfResponseSchema.safeParse({
      ...blocked,blockers:['COHORT_NOT_VERIFIED','COHORT_NOT_VERIFIED'],
    }).success).toBe(false);
  });
  it('checks a complete current-vs-hypothetical requirement diff without calculating credits',()=>{
    const current=[
      {requirementId:'SYN-REQ-1',state:'SATISFIED' as const},
      {requirementId:'SYN-REQ-2',state:'MISSING' as const,missingCreditUnits:6},
      {requirementId:'SYN-REQ-3',state:'MISSING' as const},
    ];
    const hypothetical=[
      {requirementId:'SYN-REQ-1',state:'SATISFIED' as const},
      {requirementId:'SYN-REQ-2',state:'SATISFIED' as const},
      {requirementId:'SYN-REQ-4',state:'MISSING' as const,missingCreditUnits:4},
      {requirementId:'SYN-REQ-5',state:'SATISFIED' as const},
    ];
    const delta=[
      {requirementId:'SYN-REQ-1',change:'UNCHANGED' as const},
      {requirementId:'SYN-REQ-2',change:'PROGRESS_CHANGED' as const},
      {requirementId:'SYN-REQ-3',change:'REMOVED_REQUIREMENT' as const},
      {requirementId:'SYN-REQ-4',change:'NEW_REQUIREMENT' as const},
      {requirementId:'SYN-REQ-5',change:'ALREADY_SATISFIED' as const},
    ];
    const verify=(d:typeof delta,c=current,h=hypothetical)=>
      isConsistentMajorWhatIfDelta({current:c,hypothetical:h,delta:d});
    expect(verify(delta)).toBe(true);
    expect(verify(delta.slice(0,4))).toBe(false); // Missing a requirement
    expect(verify([...delta,delta[0]!])).toBe(false); // Duplicate
    expect(verify([{requirementId:'SYN-UNKNOWN',change:'UNCHANGED'},...delta.slice(1)]
      as typeof delta)).toBe(false); // Invented requirement
    expect(verify(delta.map(x=>x.requirementId==='SYN-REQ-5'
      ?{...x,change:'NEW_REQUIREMENT' as const}:x))).toBe(false);
    expect(verify(delta.map(x=>x.requirementId==='SYN-REQ-2'
      ?{...x,change:'UNCHANGED' as const}:x))).toBe(false);
    expect(verify(delta,current.slice(1))).toBe(false);
    expect(verify(delta,current,[...hypothetical,hypothetical[0]!])).toBe(false);
  });
  it('requires a nonempty explicit reason and the non-official caution',()=>{
    for(const invalid of [
      {...blocked,blockers:[]},
      {...blocked,blockers:['UNKNOWN_REASON']},
      {...blocked,caveat:'OFFICIAL_GRADUATION_DECISION'},
      {...blocked,asOf:'not-a-date'},
    ])expect(OwnerMajorWhatIfResponseSchema.safeParse(invalid).success).toBe(false);
  });
});
