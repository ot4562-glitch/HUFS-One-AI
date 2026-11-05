import {describe,expect,it} from 'vitest';
import {OwnerFeedResponseSchema,OpportunityExplanationRequestSchema,OpportunityExplanationResponseSchema,RECOMMENDATION_SCORE_DISCLAIMER} from '@hufs-one/contracts';

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
  it.each(['featured','compact','ineligible'] as const)('binds %s explanations to the response rank policy',section=>{
    const card={opportunityId:'SYN-OPP',displayMode:section==='featured'?'FEATURED_LARGE':'COMPACT_LIST',
      title:'가상 공고',eligibility:section==='ineligible'?'INELIGIBLE':'UNKNOWN',
      lifecycle:'OPEN',topics:[],evidenceRefs:[],dataMode:'SYNTHETIC',
      explanation:{opportunityId:'SYN-OPP',relevance:{score:0,level:'GENERAL',label:'일반',
        breakdown:['J','I','S','L','M','F'].map(key=>({key,label:key,points:0,max:0})),
        disclaimer:RECOMMENDATION_SCORE_DISCLAIMER},reasons:[],
        eligibility:{state:section==='ineligible'?'INELIGIBLE':'UNKNOWN',text:'자격 확인',fields:[],evidenceRefs:[]},
        deadline:{kind:'UNKNOWN',text:'마감 미확인'},prioritySelectionCount:0,provenance:'CODE_RULES',rankConfigVersion:'rank-v1.0'}};
    const response={...feed,feed:{...feed.feed,[section]:[card],totalCandidates:section==='ineligible'?0:1}};
    expect(OwnerFeedResponseSchema.safeParse(feed).success).toBe(true);
    expect(OwnerFeedResponseSchema.safeParse(response).success).toBe(true);
    card.explanation.rankConfigVersion='rank-v2.0';
    const result=OwnerFeedResponseSchema.safeParse(response);
    expect(result.success).toBe(false);
    if(!result.success)expect(result.error.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({path:['feed',section,0,'explanation','rankConfigVersion']}),
    ]));
  });
});
