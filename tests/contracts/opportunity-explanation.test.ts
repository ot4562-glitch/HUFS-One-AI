import {describe,expect,it} from 'vitest';
import {OpportunityExplanationRequestSchema,OpportunityExplanationResponseSchema} from '@hufs-one/contracts';
const input={asOf:'2026-11-01T00:00:00.000Z',sourceRevisionId:'SYN-REV',rankConfigVersion:'rank-v1.0'};
const result={...input,opportunityId:'SYN-OPP',state:'NOT_FEATURED',reason:'LOW_RELEVANCE',
  notes:['ELIGIBILITY_UNKNOWN'],evidenceRefs:['SYN-EV'],provenance:'CODE_RULES'};
describe('#86 single permitted-candidate explanation contract',()=>{
  it('preserves uncertainty separately from code relevance and accepts an already-featured decision',()=>{
    expect(OpportunityExplanationResponseSchema.parse(result)).toEqual(result);
    expect(OpportunityExplanationResponseSchema.safeParse({...input,opportunityId:'SYN-OPP',
      state:'FEATURED',provenance:'CODE_RULES',evidenceRefs:[]}).success).toBe(true);
  });
  it('rejects browser authority and public private-fact, raw-text, score and count additions',()=>{
    for(const extra of [{actorId:'SYN-OTHER'},{facts:{major:'private'}},{approved:true}])
      expect(OpportunityExplanationRequestSchema.safeParse({...input,...extra}).success).toBe(false);
    for(const extra of [{score:20},{totalCandidates:40},{text:'unreviewed model explanation'},
      {fields:['major']},{otherCandidateIds:['SYN-HIDDEN']}])
      expect(OpportunityExplanationResponseSchema.safeParse({...result,...extra}).success).toBe(false);
  });
  it('does not turn unknown or hidden inputs into a qualification decision',()=>{
    for(const reason of ['HIDDEN_BY_USER','NOT_EVALUATED','ELIGIBILITY_NOT_MET'])
      expect(OpportunityExplanationResponseSchema.safeParse({...result,reason}).success).toBe(false);
    expect(OpportunityExplanationResponseSchema.safeParse({...result,reason:'NOT_EVALUATED',notes:[],evidenceRefs:[]}).success).toBe(true);
  });
});
