import {describe,expect,it} from 'vitest';
import {careerOpportunityLinks} from './opportunity-links.js';
import {OwnerFeedResponseSchema} from '@hufs-one/contracts';
const link=(id:string,mode:'REAL'|'SYNTHETIC',topics:string[],eligibility:'ELIGIBLE'|'UNKNOWN')=>({
  opportunityId:id,displayMode:'COMPACT_LIST',title:id,eligibility,lifecycle:'OPEN',
  topics,evidenceRefs:['source-a'],dataMode:mode,
});
const raw=OwnerFeedResponseSchema.parse({version:'a'.repeat(64),rankConfigVersion:'rules-1',feed:{
  asOf:'2026-11-07T00:00:00Z',featured:[],
  compact:[link('real-1','REAL',['DATA_ANALYTICS'],'UNKNOWN'),
    link('demo-2','SYNTHETIC',['DATA_ANALYTICS'],'ELIGIBLE'),
    link('other-3','REAL',['AI_ML'],'ELIGIBLE')],
  hasMore:true,totalCandidates:15,
}});
describe('#317 owner-only opportunity links are not secret rankings',()=>{
  it('shows only currently visible real matching items and never synthetic fixtures',()=>{
    expect(careerOpportunityLinks(raw,['DATA_ANALYTICS'])).toEqual([{
      id:'real-1',title:'real-1',matchedTopics:['DATA_ANALYTICS'],eligibility:'UNKNOWN',
      evidenceRefs:['source-a'],
    }]);
    expect(careerOpportunityLinks(raw,['AI_ML'])).toHaveLength(1);
  });
  it('rejects fabricated or unbounded responses',()=>{
    expect(()=>careerOpportunityLinks(raw,['DATA_ANALYTICS'],20)).toThrow();
    expect(()=>careerOpportunityLinks({...raw,version:'fake'},['DATA_ANALYTICS'])).toThrow();
  });
});
