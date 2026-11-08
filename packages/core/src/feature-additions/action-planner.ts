/**
 * Additional *actionable* output for #343, #347, #349.
 * Complements eligibility-v2, skills-v2 and badges-v2 with concrete
 * preparation steps/approved opportunity IDs. It does NOT grant scholarships,
 * certify ability or award school badges.
 */
import type {FeatureAdditions as C} from '@hufs-one/contracts';
import type {ScholarshipReport} from './scholarships-v2.js';
import type {RequirementEvidenceRow} from './skills-v2.js';
import type {BadgePreparationReport} from './badges-v2.js';
import {parseAsOf,safeIntersection,verifySource,type FeatureMode} from './source-policy.js';

export type ScholarshipPreparationAction={
  id:string;
  kind:'VERIFY_STUDENT_FACT'|'REVIEW_UNMET_REQUIREMENT'|'CHECK_RULE_SOURCE';
  factKey:string;
  conditionId:string;
  sourceSpanId:string;
  reason:'MISSING_OR_UNVERIFIED'|'VERIFIED_UNMET'|'RULE_UNVERIFIED';
  officialAward:false;
};
export type ScholarshipPreparation={
  scholarshipId:string;
  sourceRevisionId:string;
  actions:readonly ScholarshipPreparationAction[];
  applicationWindow:ScholarshipReport['applicationWindow'];
  officialAward:false;
};
export function planScholarshipPreparation(input:{
  policy:C.ScholarshipPolicy;
  report:ScholarshipReport;
}):ScholarshipPreparation {
  const {policy,report}=input;
  if(policy.id!==report.scholarshipId
    ||policy.source.revisionId!==report.ruleRevisionId)
    throw new RangeError('STALE_SCHOLARSHIP_REPORT');
  const base={scholarshipId:policy.id,sourceRevisionId:policy.source.revisionId,
    applicationWindow:report.applicationWindow,officialAward:false as const};
  const conditions=new Map(policy.groups.flatMap(g=>g.conditions.map(c=>[c.id,c] as const)));
  if(conditions.size!==policy.groups.flatMap(g=>g.conditions).length)
    throw new RangeError('DUPLICATE_SCHOLARSHIP_RULE');
  const actions:ScholarshipPreparationAction[]=[];
  if(!report.groups.length){
    for(const condition of conditions.values()){
      if(!condition.required) continue;
      actions.push({id:'scholarship:'+condition.id,kind:'CHECK_RULE_SOURCE',
        factKey:condition.factKey,conditionId:condition.id,
        sourceSpanId:condition.sourceSpanId,reason:'RULE_UNVERIFIED',officialAward:false});
    }
  }
  for(const group of report.groups){
    if(group.state==='MET') continue;
    for(const check of group.conditions){
      if(!check.required||check.state==='MET') continue;
      const rule=conditions.get(check.id);
      if(!rule||rule.factKey!==check.factKey||rule.sourceSpanId!==check.evidenceSpanId)
        throw new RangeError('STALE_SCHOLARSHIP_REPORT');
      const kind=check.state==='NOT_MET'
        ?'REVIEW_UNMET_REQUIREMENT' as const
        :check.reason==='SOURCE_SPAN_NOT_APPROVED'
          ?'CHECK_RULE_SOURCE' as const:'VERIFY_STUDENT_FACT' as const;
      actions.push({id:'scholarship:'+check.id,kind,factKey:check.factKey,
        conditionId:check.id,sourceSpanId:check.evidenceSpanId,
        reason:kind==='REVIEW_UNMET_REQUIREMENT'?'VERIFIED_UNMET':
          kind==='CHECK_RULE_SOURCE'?'RULE_UNVERIFIED':'MISSING_OR_UNVERIFIED',
        officialAward:false});
    }
  }
  actions.sort((a,b)=>a.id.localeCompare(b.id,'en'));
  return {...base,actions};
}

export type OpportunityAction={
  /** issue 347 checks only evidence coverage; issue 349 checks badge preparation. */
  issue:347|349;
  targetId:string;
  opportunityId:string;
  matchedTopicCodes:readonly string[];
  sourceRevisionId:string;
  deadlineAt?:string;
  eligibility:'MET'|'UNKNOWN';
  reviewFlag:'CHECK_OFFICIAL_APPLICATION'|'CHECK_PERSONAL_ELIGIBILITY';
  /** An interesting opportunity never guarantees required evidence or award. */
  guaranteedOutcome:false;
};
export type OpportunityActionSummary={
  issue:347|349;
  suggestions:readonly OpportunityAction[];
  noVerifiedMatchingOptionFor:readonly string[];
  scope:'APPROVED_OWNER_CATALOG';
};
/**
 * The server must supply an actor-permitted catalog snapshot. Unknown eligibility
 * may be shown clearly for independent verification; NOT_MET is never offered.
 */
export function planEvidenceOpportunities(input:{
  issue:347|349;
  skillRows?:readonly RequirementEvidenceRow[];
  badgeReport?:BadgePreparationReport;
  approvedCatalog:readonly C.OpportunityCatalogItem[];
  asOf:string;
  campus?:string;
  maxPerTarget?:number;
  mode?:FeatureMode;
}):OpportunityActionSummary {
  const at=parseAsOf(input.asOf);
  const limit=input.maxPerTarget??3;
  if(!Number.isSafeInteger(limit)||limit<1||limit>10) throw new RangeError('INVALID_ACTION_LIMIT');
  if(input.issue===347 && !input.skillRows
    ||input.issue===349 && !input.badgeReport)
    throw new RangeError('MISSING_VERIFIED_PREPARATION');
  const targets:{id:string;topics:readonly string[]}[]=input.issue===347
    ?(input.skillRows??[]).filter(r=>r.status==='EVIDENCE_MISSING'
      && r.requiredOneAiTopics.length>0).map(r=>({id:r.requirementId,topics:r.requiredOneAiTopics}))
    :(input.badgeReport?.requiredNextTopics??[]).map(topic=>({id:topic,topics:[topic]}));
  const seen=new Set<string>();
  const counts=new Map<string,number>();
  for(const item of input.approvedCatalog)
    counts.set(item.id,(counts.get(item.id)??0)+1);
  const permitted=input.approvedCatalog.filter(item=>{
    // Reject *all* duplicated catalog IDs instead of selecting one arbitrarily.
    if(counts.get(item.id)!==1 || !item.permitted
      ||!verifySource(item.source,input.asOf,input.mode).usable) return false;
    if(item.publishedAt && parseAsOf(item.publishedAt)>at) return false;
    if(item.deadlineAt && parseAsOf(item.deadlineAt)<=at) return false;
    if(item.eligibility==='NOT_MET') return false;
    if(input.campus&&item.campus&&item.campus!==input.campus) return false;
    return true;
  });
  const unique=permitted;
  const suggestions:OpportunityAction[]=[];
  const noVerifiedMatchingOptionFor:string[]=[];
  for(const target of targets){
    const candidates=unique.flatMap(item=>{
      const overlap=safeIntersection(target.topics,item.topicCodes);
      if(!overlap.length) return [];
      return [{item,overlap}];
    }).sort((a,b)=>{
      const eligible=(r:typeof a)=>r.item.eligibility==='MET'?0:1;
      const dead=(r:typeof a)=>r.item.deadlineAt?parseAsOf(r.item.deadlineAt):Infinity;
      return eligible(a)-eligible(b)||b.overlap.length-a.overlap.length
        ||dead(a)-dead(b)||a.item.id.localeCompare(b.item.id,'en');
    });
    if(!candidates.length){noVerifiedMatchingOptionFor.push(target.id);continue;}
    for(const candidate of candidates.slice(0,limit)){
      const {item,overlap}=candidate;
      const key=input.issue+':'+target.id+':'+item.id;
      if(seen.has(key)) continue;
      seen.add(key);
      const eligibility:'MET'|'UNKNOWN'=item.eligibility==='MET'
        && (!item.campus || (input.campus!==undefined && item.campus===input.campus))
        ?'MET':'UNKNOWN';
      suggestions.push({
        issue:input.issue,targetId:target.id,opportunityId:item.id,
        matchedTopicCodes:overlap,sourceRevisionId:item.source.revisionId,
        ...(item.deadlineAt?{deadlineAt:item.deadlineAt}:{}),
        eligibility,
        reviewFlag:eligibility==='MET'?'CHECK_OFFICIAL_APPLICATION':
          'CHECK_PERSONAL_ELIGIBILITY',
        guaranteedOutcome:false,
      });
    }
  }
  return {issue:input.issue,suggestions,noVerifiedMatchingOptionFor,
    scope:'APPROVED_OWNER_CATALOG'};
}
