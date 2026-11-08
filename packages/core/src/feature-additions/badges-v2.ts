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
  requirements:readonly BadgeRequirementState[]};
export type BadgePreparationReport={
  badgeId:string;sourceRevisionId:string;
  status:'READY_TO_REQUEST_REVIEW'|'IN_PROGRESS'|'UNKNOWN';
  groups:readonly BadgeGroupState[];
  /** Only an issuer-verified credential can be used to display a granted badge. */
  issuedCredential:null;
  requiredNextTopics:readonly string[];
};
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
    return {id:g.id,join:g.join,state:g.join==='ALL'?aggregateAnd(states):aggregateOr(states),
      requirements};
  });
  const overall=aggregateAnd(groups.map(g=>g.state));
  const requiredNextTopics=[...new Set(groups.filter(g=>g.state!=='MET').flatMap(g=>
    g.requirements.filter(r=>r.state==='DOCUMENTS_NEEDED').map(r=>r.topicCode)))].sort();
  return {...base,status:overall==='MET'?'READY_TO_REQUEST_REVIEW':
    overall==='NOT_MET'?'IN_PROGRESS':'UNKNOWN',groups,requiredNextTopics};
}
