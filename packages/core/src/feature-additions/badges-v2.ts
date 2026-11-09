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
  const checked=withCrossGroupReuseCheck(groups,badge.groups.map(g=>g.allowActivityReuse===true));
  const overall=aggregateAnd(checked.map(g=>g.state));
  const requiredNextTopics=[...new Set(checked.filter(g=>g.state!=='MET').flatMap(g=>
    g.requirements.filter(r=>r.state==='DOCUMENTS_NEEDED').map(r=>r.topicCode)))].sort();
  return {...base,status:overall==='MET'?'READY_TO_REQUEST_REVIEW':
    overall==='NOT_MET'?'IN_PROGRESS':'UNKNOWN',groups:checked,requiredNextTopics};
}

/** Search budget for the cross-group check; more ANY-group choices than this stay UNKNOWN. */
export const BADGE_CROSS_GROUP_LIMITS={maxChoiceCombinations:256} as const;

/**
 * #349 — can the whole badge be met with each activity counted once, across groups?
 * A group whose issuer rule allows reuse is left out, so its activities may also
 * count elsewhere. An ALL group needs every requirement. An ANY group needs one of
 * its recorded requirements, and every such choice is tried. Returns false when no
 * choice fits or the choices exceed the budget, so the caller abstains.
 */
export function assignableAcrossGroups(groups:readonly {
  join:'ALL'|'ANY';allowActivityReuse:boolean;requirements:readonly BadgeRequirementState[];
}[]):boolean{
  const checked=groups.filter(g=>!g.allowActivityReuse);
  const fixed=checked.filter(g=>g.join==='ALL').flatMap(g=>g.requirements);
  const options=checked.filter(g=>g.join==='ANY')
    .map(g=>g.requirements.filter(r=>r.state==='EVIDENCE_RECORDED'));
  if(options.some(o=>o.length===0)) return false;
  const combinations=options.reduce((n,o)=>n*o.length,1);
  if(combinations>BADGE_CROSS_GROUP_LIMITS.maxChoiceCombinations) return false;
  const pick=(i:number,chosen:BadgeRequirementState[]):boolean=>
    i===options.length?assignableWithoutReuse([...fixed,...chosen])
      :options[i]!.some(r=>pick(i+1,[...chosen,r]));
  return pick(0,[]);
}

/**
 * Within-group reuse is decided above (#380). This adds the check between groups:
 * when every group is met but an activity is a candidate in two groups without
 * reuse permission, the badge is ready only if the activities can be split so no
 * activity counts twice. Otherwise each group sharing such an activity becomes
 * UNKNOWN / ACTIVITY_REUSE_UNVERIFIED. Unshared badges are returned unchanged.
 */
function withCrossGroupReuseCheck(
  groups:readonly BadgeGroupState[],allowReuse:readonly boolean[],
):BadgeGroupState[]{
  if(aggregateAnd(groups.map(g=>g.state))!=='MET') return [...groups];
  const candidates=groups.map((g,i)=>allowReuse[i]?new Set<string>()
    :new Set(g.requirements.filter(r=>r.state==='EVIDENCE_RECORDED').flatMap(r=>r.activityIds)));
  const shared=candidates.map((own,i)=>[...own].some(id=>
    candidates.some((other,j)=>j!==i && other.has(id))));
  if(!shared.includes(true)) return [...groups];
  if(assignableAcrossGroups(groups.map((g,i)=>({join:g.join,
    allowActivityReuse:allowReuse[i]===true,requirements:g.requirements})))) return [...groups];
  return groups.map((g,i)=>shared[i]
    ?{...g,state:'UNKNOWN' as const,reason:'ACTIVITY_REUSE_UNVERIFIED' as const}:g);
}
