import {describe,expect,it} from 'vitest';
import {
  OwnerStudyPlanCheckRequestSchema,OwnerStudyPlanCheckResponseSchema,
  OwnerPlanCheckUnavailableReasonSchema,
} from '@hufs-one/contracts';

const review={
  state:'NEEDS_REVIEW' as const,
  asOf:'2026-11-01T00:00:00.000Z',
  term:'2026-2',
  versions:{plan:'SYN-PLAN-1'},
  termLoadCreditUnits:0,
  planIssues:[],
  unchecked:[],
  evidenceLinks:[],
  caveats:['NOT_OFFICIAL_REGISTRATION','NOT_GRADUATION_DECISION',
    'RULEPACK_UNVERIFIED'] as const,
  disclosure:{mode:'REDACTED' as const,visibleCourseRefs:[]},
};

describe('A05 #81 plan-check wire privacy and rule gates',()=>{
  it('accepts a no-calculation review state without inventing READY or a cap',()=>{
    expect(OwnerStudyPlanCheckResponseSchema.parse(review)).toEqual(review);
    expect(OwnerPlanCheckUnavailableReasonSchema.parse('CORE_NOT_MERGED')).toBe('CORE_NOT_MERGED');
  });
  it('accepts only a requested term and optional client-observed plan version',()=>{
    expect(OwnerStudyPlanCheckRequestSchema.parse({term:'2026-2'})).toEqual({term:'2026-2'});
    for(const extra of [
      {actorId:'SYN-OTHER'}, {attempts:[{grade:'A'}]},
      {rulePack:{state:'APPROVED'}},{transcript:[]},{sharingGrantVersion:'SYN-GRANT'},
    ])
      expect(OwnerStudyPlanCheckRequestSchema.safeParse({term:'2026-2',...extra}).success)
        .toBe(false);
    expect(OwnerStudyPlanCheckRequestSchema.safeParse({term:'2026-W'}).success).toBe(false);
  });
  it('rejects unsupported READY, official cap and unverified source evidence',()=>{
    const schema=OwnerStudyPlanCheckResponseSchema;
    for(const invalid of [
      {...review,state:'READY'},
      {...review,creditCapUnits:36},
      {...review,versions:{plan:'SYN-PLAN-1',transcript:'SYN-TR-1'},
        state:'READY'},
      {...review,planIssues:[{code:'PREREQUISITE_MISSING',
        reasonCode:'UNMET_OFFICIAL_PREREQUISITE',courseRefs:['SYN-COURSE-A'],
        evidenceRefs:[]}]},
      {...review,unchecked:[{courseId:'SYN-COURSE-B',reason:'CREDITS_UNKNOWN'}]},
      {...review,evidenceLinks:[{evidenceRef:'SYN-EV',href:'http://unsafe.invalid',
        verifiedAt:review.asOf}]},
      {...review,caveats:['RULEPACK_UNVERIFIED']},
    ])expect(schema.safeParse(invalid).success).toBe(false);
  });
  it('does not accept extra transcript rows, grades or attempt tokens in the response',()=>{
    for(const extra of [
      {attemptToken:'SYN-ATTEMPT-1'}, {grade:'A'},
      {excludedAttempts:[{attemptToken:'SYN-ATTEMPT-1'}]},
      {studentId:'SYN-OTHER'},{transcript:[]},{rawLedger:[]},
    ])expect(OwnerStudyPlanCheckResponseSchema.safeParse({...review,...extra}).success)
      .toBe(false);
  });
  it('keeps shared and private course refs within an explicit trusted visibility set',()=>{
    const issue={
      code:'NEEDS_REVIEW',reasonCode:'COURSE_NOT_CONFIRMED',
      courseRefs:['SYN-COURSE-A'],evidenceRefs:[],
    };
    const withOwner={
      ...review,planIssues:[issue],
      disclosure:{mode:'OWNER_VERIFIED',visibleCourseRefs:['SYN-COURSE-A']},
    };
    expect(OwnerStudyPlanCheckResponseSchema.safeParse(withOwner).success).toBe(true);
    expect(OwnerStudyPlanCheckResponseSchema.safeParse({
      ...withOwner,disclosure:{mode:'OWNER_VERIFIED',visibleCourseRefs:['SYN-COURSE-B']},
    }).success).toBe(false);
    expect(OwnerStudyPlanCheckResponseSchema.safeParse({
      ...withOwner,disclosure:{mode:'GRANT_SCOPED',visibleCourseRefs:['SYN-COURSE-A']},
    }).success).toBe(false);
    expect(OwnerStudyPlanCheckResponseSchema.safeParse({
      ...withOwner,disclosure:{mode:'REDACTED',visibleCourseRefs:['SYN-COURSE-A']},
    }).success).toBe(false);
  });
});
