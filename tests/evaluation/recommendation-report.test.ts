import {describe,expect,it} from 'vitest';
import {buildReviewPackage} from '../../packages/core/src/evaluation/review-package.js';
import {emptyReviewLedger} from '../../packages/core/src/evaluation/review-ledger.js';
import {recommendationReport,eligibilityMetrics} from '../../packages/core/src/evaluation/recommendation-report.js';
import {compareRankers,compareTop3Quality} from '../../packages/core/src/opportunities/evaluation.js';
import {DEMO_AS_OF,DEMO_OPPORTUNITIES,DEMO_PUBLISHED_AT,DEMO_SPLIT} from '../../packages/core/src/opportunities/demo-corpus.js';
import {DEMO_LABELS,DEMO_STUDENTS} from '../../packages/core/src/opportunities/demo-profiles.js';
import {RANK_CONFIG_V1} from '../../packages/core/src/opportunities/rank.js';
import {hashCanonical} from '../../packages/core/src/evaluation/canonical.js';
const packet=()=>buildReviewPackage({targetCommit:'f'.repeat(40)}),now='2026-11-21T12:00:00.000Z';
describe('fixed split and fair recommendation comparisons',()=>{
  it('reports absent independent gold as NOT_RUN with null quality, not zero accuracy or 200 self labels',()=>{
    const p=packet(),r=recommendationReport(p,emptyReviewLedger(p),{now});
    expect(r.referenceKind).toBe('INDEPENDENT');expect(r.independentHumanLabelled).toBe(0);
    for(const split of r.splits){
      expect(split.qualityState).toBe('NOT_RUN');expect(split.comparison).toBeNull();
      expect(split.eligibility).toBeNull();expect(split.codePlusLlm.status).toBe('NOT_RUN');
    }
  });
  it('reuses the source split and exact existing metrics in explicitly marked owner-draft reference mode',()=>{
    const p=packet(),r=recommendationReport(p,emptyReviewLedger(p),{now,reference:'TRACK_OWNER_SELF'});
    expect(r.referenceKind).toBe('TRACK_OWNER_SELF');expect(r.independentHumanLabelled).toBe(0);
    const profiles=DEMO_STUDENTS.map(s=>({profileId:s.subject,profile:s.profile,labels:DEMO_LABELS[s.subject]}));
    for(const split of r.splits){
      const expected=DEMO_OPPORTUNITIES.filter(o=>split.partition==='ALL'||DEMO_SPLIT[o.id]===split.partition);
      expect(split.opportunityIds).toEqual(expected.map(o=>o.id).sort());
      expect(split.comparison).toEqual(compareRankers(profiles,expected,{asOf:DEMO_AS_OF,publishedAtBySnapshotId:DEMO_PUBLISHED_AT,config:RANK_CONFIG_V1}));
      expect(split.qualityState).toBe('TRACK_OWNER_SELF_REFERENCE_ONLY');expect(split.eligibility).toBeNull();
    }
    expect(r.splits.map((s:any)=>s.opportunityIds.length)).toEqual([20,20,40]);
  });
  it('uses the same immutable ranker and visible candidate membership for code-plus-enrichment',()=>{
    const p=packet();
    const observation={schemaVersion:'rank-enrichment-observation-v1',packageSha256:p.packageSha256,targetCommit:p.targetCommit,
      provenance:'SYNTHETIC_PROTOCOL',rankConfigSha256:hashCanonical(RANK_CONFIG_V1),observationId:'SYN-PROTOCOL-1',
      measured:{latencyMs:[12,18],inputTokens:20,outputTokens:10,billedKrw:null,errors:0},
      patches:DEMO_OPPORTUNITIES.map(o=>({opportunityId:o.id,topicCodes:[...o.topicCodes],
        evidenceIds:[p.cases.find(c=>c.opportunityId===o.id)!.evidence[0]!.evidenceId]}))};
    const result=recommendationReport(p,emptyReviewLedger(p),{now,reference:'TRACK_OWNER_SELF',enrichment:observation});
    expect(result.rankConfigSha256).toBe(observation.rankConfigSha256);
    for(const split of result.splits){
      expect(split.codePlusLlm.status).toBe('SYNTHETIC_PROTOCOL');
      expect(split.codePlusLlm.candidateSetMatches).toBe(true);
      expect(split.codePlusLlm.comparison).toEqual(split.comparison);
    }
    const bad=structuredClone(observation);(bad.patches[0] as any).conditions=[];
    expect(()=>recommendationReport(p,emptyReviewLedger(p),{now,enrichment:bad})).toThrow();
    bad.patches[0]=observation.patches[0]!;bad.rankConfigSha256='a'.repeat(64);
    expect(()=>recommendationReport(p,emptyReviewLedger(p),{now,enrichment:bad})).toThrow();
  });
  const opts={asOf:DEMO_AS_OF,publishedAtBySnapshotId:DEMO_PUBLISHED_AT,config:RANK_CONFIG_V1};
  const plain=DEMO_STUDENTS.map(s=>({profileId:s.subject,profile:s.profile}));
  const splitOpportunities=(partition:string)=>DEMO_OPPORTUNITIES.filter(o=>partition==='ALL'||DEMO_SPLIT[o.id]===partition);
  it('#10: with 0 independent gold the label-free top-3 quality is reported while every accuracy stays null',()=>{
    const p=packet(),r=recommendationReport(p,emptyReviewLedger(p),{now});
    expect(r.independentHumanLabelled).toBe(0);expect(r.humanAcceptance).toBe('NOT_ESTABLISHED');
    for(const split of r.splits){
      expect(split.qualityState).toBe('NOT_RUN');expect(split.comparison).toBeNull();expect(split.eligibility).toBeNull();
      expect(split.top3Quality).toEqual(compareTop3Quality(plain,splitOpportunities(split.partition),opts));
      expect(split.top3Quality.profiles).toHaveLength(5);
      expect(JSON.stringify(split.top3Quality)).not.toMatch(/p3|ndcg|precision/i);
      // No bound provider observation: the third arm is not run and reports nothing.
      expect(split.codePlusLlm).toMatchObject({status:'NOT_RUN',reason:'NO_BOUND_PROVIDER_OBSERVATION',comparison:null,top3Quality:null,measurement:null});
    }
  });
  it('#10: with 0 independent gold a bound synthetic enrichment reports top-3 quality for the third arm only, no accuracy',()=>{
    const p=packet();
    const observation={schemaVersion:'rank-enrichment-observation-v1',packageSha256:p.packageSha256,targetCommit:p.targetCommit,
      provenance:'SYNTHETIC_PROTOCOL',rankConfigSha256:hashCanonical(RANK_CONFIG_V1),observationId:'SYN-PROTOCOL-2',
      measured:{latencyMs:[12,18],inputTokens:20,outputTokens:10,billedKrw:null,errors:0},
      patches:DEMO_OPPORTUNITIES.map(o=>({opportunityId:o.id,topicCodes:[...o.topicCodes],
        evidenceIds:[p.cases.find(c=>c.opportunityId===o.id)!.evidence[0]!.evidenceId]}))};
    const r=recommendationReport(p,emptyReviewLedger(p),{now,enrichment:observation});
    expect(r.referenceKind).toBe('INDEPENDENT');expect(r.humanAcceptance).toBe('NOT_ESTABLISHED');
    for(const split of r.splits){
      expect(split.comparison).toBeNull();expect(split.eligibility).toBeNull();
      expect(split.codePlusLlm.status).toBe('SYNTHETIC_PROTOCOL');expect(split.codePlusLlm.comparison).toBeNull();
      expect(split.codePlusLlm.top3Quality).toEqual(compareTop3Quality(plain,splitOpportunities(split.partition),opts));
      expect(split.codePlusLlm.measurement?.evidence).toBe('IMPORTED_OBSERVATION_NOT_PROVIDER_OR_HUMAN_ACCEPTANCE');
    }
  });
  it('counts definite false eligibility and unsupported ELIGIBLE separately from UNKNOWN and missing coverage',()=>{
    const r=eligibilityMetrics({a:'ELIGIBLE',b:'ELIGIBLE',c:'UNKNOWN',d:'INELIGIBLE'},
      {a:'INELIGIBLE',b:'UNKNOWN',c:'ELIGIBLE',d:'INELIGIBLE',e:'ELIGIBLE'});
    expect(r.falseEligible).toEqual(['a']);expect(r.unsupportedEligible).toEqual(['b']);
    expect(r.falseOrUnsupportedEligible).toEqual(['a','b']);
    expect(r.unknown).toEqual(['c']);expect(r.predictionCoverage).toMatchObject({num:4,den:5,value:.8});
    expect(r.conditionPrecision).toMatchObject({num:1,den:1,value:1});
    expect(r.conditionRecall).toMatchObject({num:1,den:2,value:.5});
  });
  it('keeps empty precision/recall denominators unavailable',()=>{
    const r=eligibilityMetrics({a:'UNKNOWN'},{a:'UNKNOWN'});
    expect(r.conditionPrecision.value).toBeNull();expect(r.conditionRecall.value).toBeNull();
  });
});
