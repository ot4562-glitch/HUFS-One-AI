/** #349 — official-rule-driven preparation, not badge issuing. */
import type {FeatureAdditions as C} from '@hufs-one/contracts';
import {aggregateAnd,aggregateOr,parseAsOf,verifySource,
  type EvidenceState,type FeatureMode} from './source-policy.js';
export type BadgeRequirementState={
  id:string;topicCode:string;required:number;observedDistinct:number;
  state:'EVIDENCE_RECORDED'|'DOCUMENTS_NEEDED'|'UNKNOWN';
  activityIds:readonly string[];
  officialEvidenceIds:readonly string[];
};
export type BadgeGroupState={id:string;join:'ALL'|'ANY';state:EvidenceState;
  reason?:'ACTIVITY_REUSE_UNVERIFIED';requirements:readonly BadgeRequirementState[]};
export type BadgePreparationReport={
  badgeId:string;sourceRevisionId:string;
  status:'READY_TO_REQUEST_REVIEW'|'IN_PROGRESS'|'UNKNOWN';
  groups:readonly BadgeGroupState[];
  /** Only an issuer-verified credential can be used to display a granted badge. */
  issuedCredential:null;
  requiredNextTopics:readonly string[];
};
function sharesCandidates(requirements:readonly BadgeRequirementState[]):boolean{
  const seen=new Set<string>();
  for(const r of requirements) {
    if(r.activityIds.some(id=>seen.has(id))) return true;
    for(const id of r.activityIds) seen.add(id);
  }
  return false;
}
/** Search budget for the assignment check; larger inputs stay UNKNOWN. */
export const BADGE_ASSIGNMENT_LIMITS={maxRequiredSlots:200,maxEdges:20000} as const;
/**
 * Can each requirement get `required` distinct activities, with no activity
 * used for two requirements? Bipartite matching with capacities (requirement
 * = required count, activity = 1) by augmenting paths; order independent.
 * Returns false when the budget is exceeded, so the caller abstains.
 */
export function assignableWithoutReuse(requirements:readonly BadgeRequirementState[]):boolean{
  const needed=requirements.reduce((sum,r)=>sum+r.required,0);
  const edges=requirements.reduce((sum,r)=>sum+r.activityIds.length,0);
  if(needed>BADGE_ASSIGNMENT_LIMITS.maxRequiredSlots||edges>BADGE_ASSIGNMENT_LIMITS.maxEdges)
    return false;
  const owner=new Map<string,number>(); // activity -> requirement index
  const load=requirements.map(()=>0);
  // Give requirement `ri` one more activity, re-routing earlier picks if needed.
  const augment=(ri:number,visited:Set<string>):boolean=>{
    for(const act of requirements[ri]!.activityIds) {
      if(visited.has(act)) continue;
      visited.add(act);
      const holder=owner.get(act);
      if(holder===undefined || augment(holder,visited)) {
        if(holder!==undefined) load[holder]!--;
        owner.set(act,ri);load[ri]!++;
        return true;
      }
    }
    return false;
  };
  for(let ri=0;ri<requirements.length;ri++)
    while(load[ri]!<requirements[ri]!.required)
      if(!augment(ri,new Set())) return false;
  return true;
}
export function prepareBadgeV2(input:{
  badge:C.BadgeDefinition;
  evidence:readonly C.BadgeEvidence[];
  asOf:string;mode?:FeatureMode;
}):BadgePreparationReport {
  const {badge,evidence}=input,at=parseAsOf(input.asOf);
  const base={badgeId:badge.id,sourceRevisionId:badge.source.revisionId,
    issuedCredential:null};
  if(!verifySource(badge.source,input.asOf,input.mode).usable)
    return {...base,status:'UNKNOWN',groups:[],requiredNextTopics:[]};
  const groups=badge.groups.map(g=>{
    const requirements=g.requirements.map(r=>{
      const from=r.after?parseAsOf(r.after):-Infinity;
      const until=r.before?parseAsOf(r.before):Infinity;
      if (from>=until||r.minimumDistinctActivities<1) return {
        id:r.id,topicCode:r.topicCode,required:r.minimumDistinctActivities,
        observedDistinct:0,state:'UNKNOWN' as const,
        activityIds:[],officialEvidenceIds:[]};
      const matching=evidence.filter(e=>e.ownerApproved
        && e.topicCodes.includes(r.topicCode) && parseAsOf(e.date)>=from
        && parseAsOf(e.date)<=until && parseAsOf(e.date)<=at);
      const ids=[...new Set(matching.map(e=>e.activityId))].sort();
      const officialIds=[...new Set(matching.filter(e=>e.officialVerified)
        .map(e=>e.id))].sort();
      return {id:r.id,topicCode:r.topicCode,required:r.minimumDistinctActivities,
        observedDistinct:ids.length,activityIds:ids,officialEvidenceIds:officialIds,
        state:ids.length>=r.minimumDistinctActivities
          ?'EVIDENCE_RECORDED' as const:'DOCUMENTS_NEEDED' as const};
    });
    const states:EvidenceState[]=requirements.map(r=>r.state==='EVIDENCE_RECORDED'?'MET'
      :r.state==='DOCUMENTS_NEEDED'?'NOT_MET':'UNKNOWN');
    // Issuer rules determine whether a single activity may satisfy two
    // simultaneous ALL-group requirements. Without explicit permission the
    // group is met only if every requirement can be filled with *different*
    // activities (#380); shared candidates alone are not a reason to abstain.
    const baseState=g.join==='ALL'?aggregateAnd(states):aggregateOr(states);
    const overlapping=g.join==='ALL' && g.allowActivityReuse!==true && baseState==='MET'
      && sharesCandidates(requirements) && !assignableWithoutReuse(requirements);
    return {id:g.id,join:g.join,state:overlapping && baseState==='MET'
      ?'UNKNOWN' as const:baseState,
      ...(overlapping && baseState==='MET'
        ?{reason:'ACTIVITY_REUSE_UNVERIFIED' as const}:{}),requirements};
  });
  const overall=aggregateAnd(groups.map(g=>g.state));
  const requiredNextTopics=[...new Set(groups.filter(g=>g.state!=='MET').flatMap(g=>
    g.requirements.filter(r=>r.state==='DOCUMENTS_NEEDED').map(r=>r.topicCode)))].sort();
  return {...base,status:overall==='MET'?'READY_TO_REQUEST_REVIEW':
    overall==='NOT_MET'?'IN_PROGRESS':'UNKNOWN',groups,requiredNextTopics};
}
