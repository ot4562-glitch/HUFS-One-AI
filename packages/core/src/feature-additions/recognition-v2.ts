/** #346 — prepare activity proof without implying institutional recognition. */
import type {FeatureAdditions as C} from '@hufs-one/contracts';
import {aggregateAnd,aggregateOr,conflictingIds,parseAsOf,verifySource,
  type EvidenceState,type FeatureMode} from './source-policy.js';
export type ActivityInfo={id:string;kind:string;endedAt?:string};
export type ProofItem={id:string;state:'PRESENT_SELF_REPORTED'|'MISSING'|'UNKNOWN'};
export type RecognitionGroupResult={id:string;join:'ALL'|'ANY';state:EvidenceState;
  documents:readonly ProofItem[]};
export type RecognitionPreparationReport={
  activityId:string;ruleRevisionId:string;
  status:'READY_FOR_OFFICIAL_REVIEW'|'DOCUMENTS_PENDING'|'CLOSED'|'NOT_APPLICABLE'|'UNKNOWN_RULE';
  groups:readonly RecognitionGroupResult[];
  missingKinds:readonly string[];
  checkedProofIds:readonly string[];
  /** School recognition requires a separately validated issuer receipt. */
  officiallyRecognized:false;
};
export function prepareRecognitionV2(input:{
  rule:C.ActivityRecognitionRule;
  activity:ActivityInfo;
  proofs:readonly C.ActivityProof[];
  asOf:string;
  mode?:FeatureMode;
}):RecognitionPreparationReport {
  const {rule,activity,proofs}=input;
  const at=parseAsOf(input.asOf);
  const base={activityId:activity.id,ruleRevisionId:rule.source.revisionId,
    officiallyRecognized:false as const};
  const blank=(status:RecognitionPreparationReport['status']):RecognitionPreparationReport=>
    ({...base,status,groups:[],missingKinds:[],checkedProofIds:[]});
  if (!verifySource(rule.source,input.asOf,input.mode).usable) return blank('UNKNOWN_RULE');
  if (!rule.eligibleKinds.includes(activity.kind)) return blank('NOT_APPLICABLE');
  if (rule.minActivityEndAt && (!activity.endedAt || parseAsOf(activity.endedAt)>at
    || parseAsOf(activity.endedAt)<parseAsOf(rule.minActivityEndAt))) return blank('UNKNOWN_RULE');
  if (rule.applicationEndsAt&&at>parseAsOf(rule.applicationEndsAt)) return blank('CLOSED');
  const checkedProofIds=new Set<string>();
  // Input order cannot determine which copy of an identity is current.
  // Quarantine removals and other conflicting copies before filtering kinds,
  // activity ownership, review or validity; never revive a convenient copy.
  const conflicts=conflictingIds(proofs);
  const groups=rule.documentGroups.map(group=>{
    const documents=group.kinds.map(kind=>{
      const candidates=proofs.filter(p=>!conflicts.has(p.id)&&p.activityId===activity.id
        && p.kind===kind && p.ownerReviewed && p.sourceState==='PRESENT'
        && (!p.issuedAt||parseAsOf(p.issuedAt)<=at)
        && (!p.expiryAt||parseAsOf(p.expiryAt)>at));
      for(const p of candidates) checkedProofIds.add(p.id);
      return {id:kind,state:candidates.length?'PRESENT_SELF_REPORTED' as const:'MISSING' as const};
    });
    const states:EvidenceState[]=documents.map(d=>d.state==='PRESENT_SELF_REPORTED'?'MET':'NOT_MET');
    return {id:group.id,join:group.join,state:group.join==='ALL'
      ?aggregateAnd(states):aggregateOr(states),documents};
  });
  if(!groups.length) return blank('UNKNOWN_RULE');
  const missingKinds=[...new Set(groups.filter(g=>g.state==='NOT_MET')
    .flatMap(g=>g.documents.filter(d=>d.state==='MISSING').map(d=>d.id)))].sort();
  const status=groups.every(g=>g.state==='MET')
    ?'READY_FOR_OFFICIAL_REVIEW' as const:'DOCUMENTS_PENDING' as const;
  return {...base,status,groups,missingKinds,checkedProofIds:[...checkedProofIds].sort()};
}
/** OCR never directly approves an unreviewed document or creates an asset. */
export function classifyProofCandidate(input:{
  rule:C.ActivityRecognitionRule;assetId:string;proposedKind:string;
  evidencePage?:number;confidence?:number;ownerConfirmed:boolean;
  /** Mandatory for an owner-confirmed proposal; an OCR confidence is never a
   * rights, source-period or official-experience attestation. */
  asOf?:string;mode?:FeatureMode;
}):{assetId:string;status:'OWNER_CONFIRMED_CANDIDATE'|'NEEDS_REVIEW'|'REJECTED';
  documentKind?:string} {
  const rejected={assetId:input.assetId,status:'REJECTED' as const};
  if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(input.assetId)
    || !/^[A-Za-z0-9_.:-]{1,128}$/.test(input.proposedKind)
    || !Number.isSafeInteger(input.evidencePage)||input.evidencePage!<0
    || input.evidencePage!>50
    || !Number.isFinite(input.confidence)||input.confidence!<0||input.confidence!>1)
    return rejected;
  if (!input.rule.documentGroups.some(g=>g.kinds.includes(input.proposedKind)))
    return rejected;
  if (!input.ownerConfirmed) return {assetId:input.assetId,status:'NEEDS_REVIEW'};
  // Confirmation can elevate an OCR guess only to an owner-reviewed candidate,
  // never a proof of institutional issuance. Current source rights/HEAD must
  // be independently verified when this action is requested.
  if (!input.asOf||!verifySource(input.rule.source,input.asOf,input.mode).usable)
    return rejected;
  if(input.rule.applicationEndsAt
    &&parseAsOf(input.asOf)>parseAsOf(input.rule.applicationEndsAt))
    return rejected;
  return {assetId:input.assetId,status:'OWNER_CONFIRMED_CANDIDATE',documentKind:input.proposedKind};
}
