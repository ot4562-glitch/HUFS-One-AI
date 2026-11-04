import {describe,expect,it} from 'vitest';
import {computeOwnerRecommendations} from '../../apps/api/src/modules/opportunities/owner-recommendations.js';
import {projectOpportunityExplanation} from '../../apps/api/src/modules/opportunities/opportunity-explanation-projection.js';
import {OWNER_FEED_AT,ownerOpportunity} from './owner-recommendations-fixture.js';
describe('current owner inputs → existing ranking core → feed and exclusion decision',()=>{
  const opportunities=[ownerOpportunity('SYN-A',['AI_ML']),ownerOpportunity('SYN-B',['TRADE_OVERSEAS'])];
  it('uses changed owner interests and explicit approved experience with the same exclusion report',()=>{
    const first=computeOwnerRecommendations({asOf:OWNER_FEED_AT,interestTopics:['AI_ML'],desiredJobTopics:[],
      approvedExperienceTopics:[],opportunities,publishedAtBySnapshotId:{}});
    expect(first.feed.featured.map(c=>c.opportunityId)).toEqual(['SYN-A']);
    const reason=projectOpportunityExplanation(first.report,{opportunityId:'SYN-B',asOf:OWNER_FEED_AT,
      sourceRevisionId:'SYN-REV-SYN-B',rankConfigVersion:first.rankConfigVersion});
    expect(reason).toMatchObject({state:'NOT_FEATURED',reason:'LOW_RELEVANCE'});
    const second=computeOwnerRecommendations({asOf:OWNER_FEED_AT,interestTopics:[],desiredJobTopics:[],
      approvedExperienceTopics:['TRADE_OVERSEAS'],opportunities,publishedAtBySnapshotId:{}});
    expect(second.feed.featured.map(c=>c.opportunityId)).toEqual(['SYN-B']);
    expect(second.report.featuredIds).toEqual(second.feed.featured.map(c=>c.opportunityId));
    expect(JSON.stringify(second.feed)).not.toContain('displayName');
  });
  it('retains UNKNOWN eligibility and never invents academic facts from owner preferences',()=>{
    const result=computeOwnerRecommendations({asOf:OWNER_FEED_AT,interestTopics:['AI_ML'],desiredJobTopics:[],
      approvedExperienceTopics:[],opportunities:[{...opportunities[0]!,conditions:[{
        field:'cohort',operator:'GTE',value:2024,evidenceId:'SYN-EVIDENCE'}]}],publishedAtBySnapshotId:{}});
    expect(result.feed.featured[0]?.eligibility).toBe('UNKNOWN');
    expect(result.report.featuredIds).toEqual(['SYN-A']);
  });
  it('passes independently verified owner facts to the existing eligibility evaluator',()=>{
    const result=computeOwnerRecommendations({asOf:OWNER_FEED_AT,interestTopics:['AI_ML'],desiredJobTopics:[],
      approvedExperienceTopics:[],verifiedFacts:{cohort:2024},opportunities:[{...opportunities[0]!,conditions:[{
        field:'cohort',operator:'GTE',value:2024,evidenceId:'SYN-EVIDENCE'}]}],publishedAtBySnapshotId:{}});
    expect(result.feed.featured[0]?.eligibility).toBe('ELIGIBLE');
  });
  it('omits future publications from both counts and the explanation report',()=>{
    const result=computeOwnerRecommendations({asOf:OWNER_FEED_AT,interestTopics:['AI_ML'],desiredJobTopics:[],
      approvedExperienceTopics:[],opportunities,publishedAtBySnapshotId:{'SYN-REV-SYN-A':'2026-11-05T00:00:00.000Z'}});
    expect(result.feed.totalCandidates).toBe(1);
    expect([...result.report.featuredIds,...result.report.items.map(i=>i.opportunityId)]).toEqual(['SYN-B']);
  });
});
