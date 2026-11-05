import {describe,expect,it} from 'vitest';
import {FeedResultSchema,OpportunitySchema} from '@hufs-one/contracts';
import {composeFeed} from '../../packages/core/src/opportunities/feed.js';
import type {RecommendationProfile} from '../../packages/core/src/opportunities/evaluate.js';
import {buildDemoScreenView} from '../../apps/web/src/features/demo/sectionView.js';
import snapshot from '../../packages/fixtures/synthetic/demo-snapshot.json';
import {DemoSnapshotSchema} from '@hufs-one/contracts';
const ASOF='2026-11-20T00:00:00.000Z';
const profile:RecommendationProfile={interestTopics:['DATA_ANALYTICS'],desiredJobTopics:[],approvedExperienceTopics:[],
  approvedLanguageCodes:[],officialMajorTopics:[],facts:{enrollment:'ENROLLED'}};
const opp=(id:string)=>OpportunitySchema.parse({id,version:'v1',sourceSnapshotId:'SNAP-'+id,
  title:'Synthetic '+id,organization:'Synthetic '+id,kind:'CONTEST',topicCodes:['DATA_ANALYTICS'],languageCodes:[],
  applyClosesAt:'2026-12-01T00:00:00.000Z',eventSessions:[],actualApplicationRoute:'DEMO_DISABLED',
  conditions:[{field:'enrollment',operator:'EQ',value:'GRADUATED',evidenceId:'EV-SYN-ENROLLMENT'}],
  roleSteps:[],prioritySelection:[],completionRules:[],dataMode:'SYNTHETIC',dataQuality:'COMPLETE'});
const list=(value:unknown)=>(value as {ineligible?:Array<{opportunityId:string;eligibility:string}>}).ineligible;

describe('authorized ineligible feed wire and consumer (#230)',()=>{
  it('serializes the core ineligible list separately from ranked eligible candidates',()=>{
    const result=composeFeed(profile,[opp('SYN-A')],{asOf:ASOF});
    expect(result.ineligible).toHaveLength(1);
    const wire=FeedResultSchema.parse(JSON.parse(JSON.stringify(result.feed)));
    expect(list(wire)?.map(x=>[x.opportunityId,x.eligibility])).toEqual([['SYN-A','INELIGIBLE']]);
    expect(wire.featured).toEqual([]);expect(wire.compact).toEqual([]);expect(wire.totalCandidates).toBe(0);
  });
  it('keeps hidden, duplicate, future and expired candidates out of the additional wire list',()=>{
    const a=opp('SYN-A'),b=opp('SYN-B'),future=opp('SYN-FUTURE'),past=opp('SYN-PAST');
    past.applyClosesAt='2026-11-01T00:00:00.000Z';
    const result=composeFeed(profile,[a,b,b,future,past],{asOf:ASOF,hiddenOpportunityIds:[a.id],
      publishedAtBySnapshotId:{[future.sourceSnapshotId]:'2026-12-01T00:00:00.000Z'}});
    expect(list(result.feed)??[]).toEqual([]);
  });
  it('bounds the wire list to twenty and preserves deterministic selection',()=>{
    const input=Array.from({length:25},(_,i)=>opp('SYN-'+String(i).padStart(3,'0')));
    const a=composeFeed(profile,input,{asOf:ASOF}).feed;
    const b=composeFeed(profile,[...input].reverse(),{asOf:ASOF}).feed;
    expect(list(a)).toHaveLength(20);expect(a).toEqual(b);
  });
  it('renders the server decision only under the same FEED grant and erases it when hidden',()=>{
    const feed=composeFeed(profile,[opp('SYN-A')],{asOf:ASOF}).feed;
    const snap=DemoSnapshotSchema.parse({...snapshot,asOf:ASOF,feed});
    const shown=buildDemoScreenView(snap,['FEED']);
    expect(shown.feed.kind).toBe('SHOW');
    if(shown.feed.kind!=='SHOW')throw new Error('Synthetic FEED grant must be visible');
    expect(list(shown.feed.data)?.map(x=>x.opportunityId)).toEqual(['SYN-A']);
    expect(buildDemoScreenView(snap,[]).feed).toEqual({kind:'HIDDEN'});
  });
  it('continues accepting legacy payloads without the optional field',()=>{
    expect(FeedResultSchema.safeParse({asOf:ASOF,featured:[],compact:[],hasMore:false,totalCandidates:0}).success).toBe(true);
  });
  it('rejects duplicate IDs, invalid placement, wrong verdict and oversized additional wire data',()=>{
    const feed=composeFeed(profile,[opp('SYN-A')],{asOf:ASOF}).feed;
    const card=feed.ineligible![0]!;
    for(const ineligible of [[card,card],[{...card,displayMode:'FEATURED_LARGE'}],
      [{...card,eligibility:'ELIGIBLE'}],Array.from({length:21},(_,i)=>({...card,opportunityId:'SYN-'+i,explanation:undefined}))])
      expect(FeedResultSchema.safeParse({...feed,ineligible}).success).toBe(false);
    expect(FeedResultSchema.safeParse({...feed,compact:[card],totalCandidates:1}).success).toBe(false);
  });
  it('blocks non-synthetic additional cards at the same shared parsing boundary used by REVIEWER API and browser',()=>{
    const feed=composeFeed(profile,[opp('SYN-A')],{asOf:ASOF}).feed;
    const card=feed.ineligible![0]!;
    for(const changed of [{...card,dataMode:'REAL'},{...card,opportunityId:'REAL-CARD',explanation:undefined},
      {...card,evidenceRefs:['EV-REAL-PRIVATE']},
      {...card,explanation:{...card.explanation!,dataMode:'REAL'}},
      {...card,explanation:{...card.explanation!,eligibility:{...card.explanation!.eligibility,
        evidenceRefs:['EV-REAL-PRIVATE']}}}])
      expect(DemoSnapshotSchema.safeParse({...snapshot,asOf:ASOF,
        feed:{...feed,ineligible:[changed]}}).success).toBe(false);
    expect(DemoSnapshotSchema.safeParse({...snapshot,asOf:ASOF,datasetMode:'REAL_CONSENTED',
      feed:{...feed,ineligible:[{...card,dataMode:'REAL',explanation:undefined}]}}).success).toBe(true);
  });
});
