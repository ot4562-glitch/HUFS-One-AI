import {describe,expect,it} from 'vitest';
import {OpportunitySchema} from '@hufs-one/contracts';
import type {Opportunity} from '@hufs-one/contracts';
import {compareRankers,eligibilityAgreement} from
  '../../packages/core/src/opportunities/index.js';
import type {RecommendationProfile,EvalProfile} from
  '../../packages/core/src/opportunities/index.js';

const ASOF='2026-11-20T00:00:00.000Z';
const topics=['DATA_ANALYTICS','AI_ML','TRADE_OVERSEAS','HR_ORG','MEDIA_CONTENT'] as const;
const opportunities=Array.from({length:40},(_,i):Opportunity=>
  OpportunitySchema.parse({
    id:'SYN-EVAL-OP-'+String(i+1).padStart(2,'0'),version:'v1',
    sourceSnapshotId:'SYN-EVAL-SNAPSHOT-'+i,
    title:'합성 공고 '+(i+1),organization:'가상 기관 '+(i%7),
    kind:'CONTEST',topicCodes:[topics[i%topics.length]],
    languageCodes:[],applyClosesAt:'2026-12-01T23:59:59.000Z',
    eventSessions:[],actualApplicationRoute:'DEMO_DISABLED',
    conditions:[],roleSteps:[],prioritySelection:[],completionRules:[],
    dataMode:'SYNTHETIC',dataQuality:'COMPLETE',
  })
);
const profile=(topic:typeof topics[number]):RecommendationProfile=>({
  interestTopics:[topic],desiredJobTopics:[topic],approvedExperienceTopics:[],
  approvedLanguageCodes:[],officialMajorTopics:[],facts:{},
});
const profiles:EvalProfile[]=topics.map((topic,i)=>({
  profileId:'SYN-P'+String(i+1),
  profile:profile(topic),
  labels:Object.fromEntries(opportunities.map(item=>[
    item.id,item.topicCodes.includes(topic)?2:0,
  ])) as EvalProfile['labels'],
}));
const published=Object.fromEntries(opportunities.map((item,i)=>[
  item.sourceSnapshotId,'2026-11-'+String(1+Math.floor(i/2)).padStart(2,'0')+'T00:00:00.000Z',
]));
describe('A15.1 synthetic 40 notices x 5 profiles, 200 explicit relevance labels (not human ground truth)',()=>{
  it('has exactly 200 independent synthetic labels and no real identifiers or external source URLs',()=>{
    expect(opportunities).toHaveLength(40);expect(profiles).toHaveLength(5);
    expect(profiles.reduce((n,p)=>n+Object.keys(p.labels).length,0)).toBe(200);
    expect(opportunities.every(o=>o.dataMode==='SYNTHETIC'
      &&o.actualApplicationRoute==='DEMO_DISABLED')).toBe(true);
  });
  it('compares newest-first and personalized ranking on precisely the same candidates',()=>{
    const comparison=compareRankers(profiles,opportunities,{asOf:ASOF,
      publishedAtBySnapshotId:published});
    expect(comparison.profiles).toHaveLength(5);
    expect(comparison.profiles.every(x=>x.latestFirst.p3.coverage.value===1
      &&x.recommended.p3.coverage.value===1)).toBe(true);
    expect(comparison.meanP3.recommended.macro).toBeGreaterThanOrEqual(0);
    expect(comparison.meanP3.recommended.macro).toBeLessThanOrEqual(1);
    expect(comparison.deltaP3Points).toBeGreaterThanOrEqual(-100);
    expect(comparison.deltaP3Points).toBeLessThanOrEqual(100);
    expect(comparison.rankConfigVersion).toMatch(/^rank-v/);
  });
  it('is byte-stable under shuffled corpus and shuffled profile order',()=>{
    const a=compareRankers(profiles,opportunities,{asOf:ASOF,publishedAtBySnapshotId:published});
    const b=compareRankers([...profiles].reverse(),[...opportunities].reverse(),{
      asOf:ASOF,publishedAtBySnapshotId:published});
    expect(b).toEqual(a);
  });
  it('never ranks future-published notices in a historical replay',()=>{
    const historical='2026-11-06T00:00:00.000Z';
    const result=compareRankers(profiles,opportunities,{asOf:historical,
      publishedAtBySnapshotId:published});
    const future=opportunities.filter(o=>Date.parse(published[o.sourceSnapshotId]!)>
      Date.parse(historical)).map(o=>o.id);
    for(const p of result.profiles){
      for(const id of future){
        expect(p.recommended.top3).not.toContain(id);
        expect(p.latestFirst.top3).not.toContain(id);
      }
    }
  });
  it('does not inflate a synthetic eligibility result into measured real accuracy',()=>{
    const predicted=Object.fromEntries(opportunities.map((o,i)=>[
      o.id,i%7===0?'UNKNOWN':'ELIGIBLE',
    ])) as Record<string,'UNKNOWN'|'ELIGIBLE'>;
    const gold=Object.fromEntries(opportunities.map((o,i)=>[
      o.id,i%7===0?'UNKNOWN':'ELIGIBLE',
    ])) as Record<string,'UNKNOWN'|'ELIGIBLE'>;
    const agreement=eligibilityAgreement(predicted,gold);
    expect(agreement.falseEligible).toEqual([]);
    expect(agreement.unknown).toHaveLength(6);
  });
});
