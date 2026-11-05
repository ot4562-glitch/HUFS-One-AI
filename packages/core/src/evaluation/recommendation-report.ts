import {z} from 'zod';
import type {Opportunity} from '@hufs-one/contracts';
import {DEMO_AS_OF,DEMO_OPPORTUNITIES,DEMO_PUBLISHED_AT,DEMO_SPLIT} from '../opportunities/demo-corpus.js';
import {DEMO_LABELS,DEMO_STUDENTS} from '../opportunities/demo-profiles.js';
import {compareRankers,eligibilityAgreement,type GoldEligibility,type LabelSet,type RelevanceLabel} from '../opportunities/evaluation.js';
import {evaluateOpportunity} from '../opportunities/evaluate.js';
import {composeFeed} from '../opportunities/feed.js';
import {RANK_CONFIG_V1} from '../opportunities/rank.js';
import {onlyKnownTopics} from '../normalization/topics.js';
import {canonicalJson,hashCanonical} from './canonical.js';
import {validateReviewPackage,type ReviewPackage} from './review-package.js';
import {inspectReviewLedger,type ReviewerAuthority} from './review-ledger.js';

const Sha=z.string().regex(/^[a-f0-9]{64}$/),Id=z.string().regex(/^[A-Za-z0-9_.:@-]{1,160}$/);
export const RankEnrichmentObservationSchema=z.strictObject({
  schemaVersion:z.literal('rank-enrichment-observation-v1'),packageSha256:Sha,
  targetCommit:z.string().regex(/^[a-f0-9]{40}$/),provenance:z.enum(['SYNTHETIC_PROTOCOL','IMPORTED_UNVERIFIED']),
  rankConfigSha256:Sha,observationId:Id,
  measured:z.strictObject({latencyMs:z.array(z.number().finite().min(0)).min(1).max(10_000),
    inputTokens:z.number().int().min(0).nullable(),outputTokens:z.number().int().min(0).nullable(),
    billedKrw:z.number().finite().min(0).nullable(),errors:z.number().int().min(0)}),
  patches:z.array(z.strictObject({opportunityId:Id,topicCodes:z.array(z.string()).max(24),
    evidenceIds:z.array(Id).min(1).max(30)})).length(40),
});
export function ratio(num:number,den:number){return {num,den,value:den===0?null:Math.round(num/den*1e6)/1e6};}
export function distribution(values:readonly number[]){
  if(values.some(v=>!Number.isFinite(v)||v<0))throw new Error('Invalid observation');
  const sorted=[...values].sort((a,b)=>a-b);
  return {count:sorted.length,p50:sorted.length?sorted[Math.ceil(sorted.length*.5)-1]!:null,
    p95:sorted.length?sorted[Math.ceil(sorted.length*.95)-1]!:null,
    max:sorted.at(-1)??null,minimum50Samples:sorted.length>=50};
}
/** UNKNOWN gold does not authorize a definite ELIGIBLE. Report that separately
 * from definite contradiction; neither class is hidden by ordinary accuracy. */
export function eligibilityMetrics(predicted:Readonly<Record<string,GoldEligibility>>,gold:Readonly<Record<string,GoldEligibility>>){
  const base=eligibilityAgreement(predicted,gold),ids=Object.keys(gold).sort();
  const unsupportedEligible=ids.filter(id=>gold[id]==='UNKNOWN'&&predicted[id]==='ELIGIBLE');
  return {...base,conditionPrecision:ratio(base.conditionPrecision.num,base.conditionPrecision.den),
    conditionRecall:ratio(base.conditionRecall.num,base.conditionRecall.den),unsupportedEligible,
    falseOrUnsupportedEligible:[...base.falseEligible,...unsupportedEligible].sort(),
    predictionCoverage:ratio(ids.filter(id=>predicted[id]!==undefined).length,ids.length)};
}
function enriched(packet:ReviewPackage,raw:unknown){
  const value=RankEnrichmentObservationSchema.parse(raw);
  if(value.packageSha256!==packet.packageSha256||value.targetCommit!==packet.targetCommit
    ||value.rankConfigSha256!==hashCanonical(RANK_CONFIG_V1))throw new Error('Enrichment scope changed');
  const byId=new Map(value.patches.map(p=>[p.opportunityId,p]));
  if(byId.size!==40)throw new Error('Duplicate enrichment input');
  const opportunities=DEMO_OPPORTUNITIES.map(o=>{
    const patch=byId.get(o.id),reviewCase=packet.cases.find(c=>c.opportunityId===o.id)!;
    if(!patch||new Set(patch.topicCodes).size!==patch.topicCodes.length
      ||onlyKnownTopics(patch.topicCodes).length!==patch.topicCodes.length
      ||new Set(patch.evidenceIds).size!==patch.evidenceIds.length
      ||patch.evidenceIds.some(id=>!reviewCase.evidence.some(e=>e.evidenceId===id)))throw new Error('Unbound enrichment features');
    return {...structuredClone(o),topicCodes:onlyKnownTopics(patch.topicCodes)};
  });
  return {value,opportunities};
}
/** Evaluation only: candidate topic features never update production source,
 * eligibility, claims or labels. The same ranker/config and filtering are used. */
export function recommendationReport(packet:ReviewPackage,ledger:unknown,context:{
  now:string;authority?:ReviewerAuthority;reference?:'INDEPENDENT'|'TRACK_OWNER_SELF';enrichment?:unknown;
}){
  const p=validateReviewPackage(packet),review=inspectReviewLedger(ledger,p,context);
  const reference=context.reference??'INDEPENDENT',labels:Record<string,Record<string,RelevanceLabel>>={};
  for(const student of DEMO_STUDENTS)labels[student.subject]={};
  if(reference==='TRACK_OWNER_SELF')for(const student of DEMO_STUDENTS)labels[student.subject]={...DEMO_LABELS[student.subject]};
  else for(const item of review.verifiedHumanRecords){
    if(item.assessment.kind!=='RECOMMENDATION')throw new Error('Wrong review kind');
    const target=p.cases.find(c=>c.caseId===item.caseId)!;labels[target.profileId]![target.opportunityId]=item.assessment.relevance;
  }
  const profiles=DEMO_STUDENTS.map(s=>({profileId:s.subject,profile:structuredClone(s.profile),labels:labels[s.subject]! as LabelSet}));
  const options={asOf:DEMO_AS_OF,publishedAtBySnapshotId:DEMO_PUBLISHED_AT,config:structuredClone(RANK_CONFIG_V1)};
  const patch=context.enrichment===undefined?null:enriched(p,context.enrichment);
  const splits=(['TUNING','REPORT','ALL'] as const).map(partition=>{
    const selected=(opportunities:readonly Opportunity[])=>opportunities.filter(o=>partition==='ALL'||DEMO_SPLIT[o.id]===partition);
    const opportunities=selected(DEMO_OPPORTUNITIES),opportunityIds=opportunities.map(o=>o.id).sort();
    const cases=p.cases.filter(c=>opportunityIds.includes(c.opportunityId)),records=review.verifiedHumanRecords.filter(r=>cases.some(c=>c.caseId===r.caseId));
    const labelCount=profiles.reduce((sum,s)=>sum+opportunityIds.filter(id=>s.labels[id]!==undefined).length,0);
    const qualityState=reference==='TRACK_OWNER_SELF'?'TRACK_OWNER_SELF_REFERENCE_ONLY':labelCount===0?'NOT_RUN':
      labelCount===cases.length?'SIGNED_REFERENCE':'PARTIAL_SIGNED_REFERENCE';
    const comparison=labelCount===0?null:compareRankers(profiles,opportunities,options);
    const predicted:Record<string,GoldEligibility>={},gold:Record<string,GoldEligibility>={};
    let conditionTp=0,conditionPredicted=0,conditionExpected=0,conditionGoldCount=0,predictedUnknown=0;
    for(const student of DEMO_STUDENTS)for(const opportunity of opportunities){
      const id=student.subject+':'+opportunity.id,actual=evaluateOpportunity(student.profile,opportunity,DEMO_AS_OF);
      predicted[id]=actual.eligibility;if(actual.eligibility==='UNKNOWN')predictedUnknown++;
      const record=records.find(r=>r.caseId===id);if(!record)continue;
      if(record.assessment.kind!=='RECOMMENDATION')throw new Error('Wrong review kind');
      gold[id]=record.assessment.eligibility;
      for(const expected of record.assessment.conditions){
        const actualCondition=actual.conditions.find(c=>c.evidenceId===expected.evidenceId)!;
        if(expected.outcome==='UNKNOWN')continue;conditionGoldCount++;
        if(actualCondition.outcome==='FAIL')conditionPredicted++;
        if(expected.outcome==='FAIL')conditionExpected++;
        if(actualCondition.outcome==='FAIL'&&expected.outcome==='FAIL')conditionTp++;
      }
    }
    const eligibility=reference==='INDEPENDENT'&&records.length?{...eligibilityMetrics(predicted,gold),
      conditionFieldPrecision:ratio(conditionTp,conditionPredicted),conditionFieldRecall:ratio(conditionTp,conditionExpected),
      definiteConditionGold:conditionGoldCount}:null;
    let codePlusLlm;
    if(!patch)codePlusLlm={status:'NOT_RUN' as const,reason:'NO_BOUND_PROVIDER_OBSERVATION',comparison:null,measurement:null};
    else{
      const enhanced=selected(patch.opportunities);
      const same=profiles.every(s=>{
        const ids=(items:readonly Opportunity[])=>composeFeed(s.profile,items,options).all.map(r=>r.opportunity.id).sort();
        return canonicalJson(ids(opportunities))===canonicalJson(ids(enhanced));
      });
      if(!same)throw new Error('Evaluation candidate sets differ');
      codePlusLlm={status:patch.value.provenance,candidateSetMatches:true,
        comparison:labelCount===0?null:compareRankers(profiles,enhanced,options),
        measurement:{...patch.value.measured,latency:distribution(patch.value.measured.latencyMs),
          evidence:'IMPORTED_OBSERVATION_NOT_PROVIDER_OR_HUMAN_ACCEPTANCE'}};
    }
    return {partition,opportunityIds,qualityState,labelCoverage:ratio(labelCount,cases.length),
      comparison,eligibility,predictedUnknown,eligibilityPopulation:'ALL_CANONICAL_CASES',
      codePlusLlm};
  });
  return {schemaVersion:'recommendation-evaluation-report-v1',packageSha256:p.packageSha256,
    targetCommit:p.targetCommit,datasetId:p.datasetId,demoAsOf:p.demoAsOf,referenceKind:reference,
    independentHumanLabelled:review.independentHumanLabelled,independentGoldReview:review.independentGoldReview,
    humanAcceptance:'NOT_ESTABLISHED',rankConfigVersion:RANK_CONFIG_V1.version,rankConfigSha256:hashCanonical(RANK_CONFIG_V1),
    splits,warning:'Five synthetic profiles; macro P@3 changes in 1/15 steps. Draft, partial and test references do not establish real accuracy.'};
}
