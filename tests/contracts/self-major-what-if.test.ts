import {describe,expect,it} from 'vitest';
import {
  OwnerMajorWhatIfRequestSchema,OwnerMajorWhatIfResponseSchema,
  OwnerMajorWhatIfBlockedSchema,OwnerMajorWhatIfScenarioSchema,
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
  it('requires a nonempty explicit reason and the non-official caution',()=>{
    for(const invalid of [
      {...blocked,blockers:[]},
      {...blocked,blockers:['UNKNOWN_REASON']},
      {...blocked,caveat:'OFFICIAL_GRADUATION_DECISION'},
      {...blocked,asOf:'not-a-date'},
    ])expect(OwnerMajorWhatIfResponseSchema.safeParse(invalid).success).toBe(false);
  });
});
