import {describe,expect,it} from 'vitest';
import {OwnerFeedResponseSchema,OpportunityExplanationRequestSchema,OpportunityExplanationResponseSchema} from '@hufs-one/contracts';

describe('owner feed snapshot wire boundary',()=>{
  const feed={version:'a'.repeat(64),rankConfigVersion:'rank-v1.0',
    feed:{asOf:'2026-11-04T00:00:00.000Z',featured:[],compact:[],hasMore:false,totalCandidates:0}};
  it('rejects account identity/private fields and invalid opaque versions',()=>{
    for(const extra of [{actorId:'SYN-OWNER'},{profile:{displayName:'SYN-PRIVATE'}},{receipt:'SYN-AUTHORITY'}])
      expect(OwnerFeedResponseSchema.safeParse({...feed,...extra}).success).toBe(false);
    expect(OwnerFeedResponseSchema.safeParse({...feed,version:'not-a-snapshot'}).success).toBe(false);
  });
  it('accepts the optional request snapshot binding without making it an output field',()=>{
    const input={asOf:feed.feed.asOf,sourceRevisionId:'SYN-REV',rankConfigVersion:feed.rankConfigVersion};
    expect(OpportunityExplanationRequestSchema.parse({...input,expectedFeedVersion:feed.version}).expectedFeedVersion).toBe(feed.version);
    const response={...input,opportunityId:'SYN-OPP',state:'FEATURED',evidenceRefs:[],provenance:'CODE_RULES'};
    expect(OpportunityExplanationResponseSchema.safeParse(response).success).toBe(true);
    expect(OpportunityExplanationResponseSchema.safeParse({...response,expectedFeedVersion:feed.version}).success).toBe(false);
  });
});
