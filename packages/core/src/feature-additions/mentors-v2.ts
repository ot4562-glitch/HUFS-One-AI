/** #344 — mentor similarity reranking (no AI calls in this module). */
import type {FeatureAdditions as C} from '@hufs-one/contracts';
import {conflictingIds,jaccard,safeIntersection,verifySemanticProposals,verifySource,
  type FeatureMode} from './source-policy.js';

export type MentorReason = {kind:'MAJOR'|'JOB'|'APPROVED_EXPERIENCE'|'MODEL_EVIDENCE';codes:readonly string[]};
export type MentorMatch = {
  mentorId:string; ruleScore:number; finalScore:number;
  reasons:readonly MentorReason[];
  mode:'RULE_ONLY'|'AI_RERANKED';
  sourceRevisionId:string;
};
export type MentorRankReport = {
  items:readonly MentorMatch[];candidateCount:number;
  sourceScope:'VERIFIED'|'SYNTHETIC';modelOutcome:'NOT_REQUESTED'|'ACCEPTED'|'REJECTED';
};
/**
 * Callers only pass a consented, sanitized preference and cleared mentor cards.
 * Model input/approval/cost is owned by the AI team. Invalid proposals cannot
 * change candidate identity or make unsupported explanations.
 */
export function rankMentorsV2(input:{
  preference:C.MentorPreference;
  catalog:readonly C.MentorCard[];
  mode?:FeatureMode;
  rerank?:{proposals:readonly C.SemanticProposal[];inputDigest:string;modelApproved:boolean};
}):MentorRankReport {
  const {preference,catalog}=input;
  const mode=input.mode??'LIVE';
  const dims=[
    {weight:0.35,used:preference.majorCodes.length>0},
    {weight:0.35,used:preference.jobCodes.length>0},
    {weight:0.30,used:preference.ownerApprovedTopics.length>0},
  ];
  const den=dims.filter(d=>d.used).reduce((sum,d)=>sum+d.weight,0);
  // Every copy of a repeated mentor ID is quarantined: a later revoked or
  // inactive copy must not be hidden by an earlier approved one.
  const conflicts=conflictingIds(catalog);
  const candidates=catalog.filter(m=>{
    if (conflicts.has(m.id)) return false;
    return m.active && verifySource(m.source,preference.asOf,mode).usable
      && (!preference.language||m.languages.includes(preference.language))
      && (!preference.campus||m.campuses.includes(preference.campus));
  }).map(m=>{
    const majors=safeIntersection(preference.majorCodes,m.majorCodes);
    const jobs=safeIntersection(preference.jobCodes,m.jobCodes);
    const experience=safeIntersection(preference.ownerApprovedTopics,m.experienceTopics);
    const score=den ? (
      (preference.majorCodes.length?0.35*jaccard(preference.majorCodes,m.majorCodes):0)
      +(preference.jobCodes.length?0.35*jaccard(preference.jobCodes,m.jobCodes):0)
      +(preference.ownerApprovedTopics.length?0.30*jaccard(preference.ownerApprovedTopics,m.experienceTopics):0)
    )/den : 0;
    const reasons:MentorReason[]=[];
    if (majors.length) reasons.push({kind:'MAJOR',codes:majors});
    if (jobs.length) reasons.push({kind:'JOB',codes:jobs});
    if (experience.length) reasons.push({kind:'APPROVED_EXPERIENCE',codes:experience});
    return {mentorId:m.id,ruleScore:score,finalScore:score,reasons,
      sourceRevisionId:m.source.revisionId,mode:'RULE_ONLY' as const};
  }).sort((a,b)=>b.ruleScore-a.ruleScore||a.mentorId.localeCompare(b.mentorId,'en'));
  // Semantic candidates must be from the top 15 within a bounded, rights-cleared set.
  const allowed=candidates.filter(m=>m.reasons.some(r=>r.codes.length>0)
    || (catalog.find(c=>c.id===m.mentorId)?.publicEvidenceRefs.length??0)>0).slice(0,15);
  const evidence=new Map(allowed.map(m=>[m.mentorId,[
    ...m.reasons.flatMap(r=>r.codes),
    ...((catalog.find(c=>c.id===m.mentorId)?.publicEvidenceRefs)??[]),
  ] as readonly string[]]));
  const requested=input.rerank!==undefined;
  const verified=requested&&input.rerank!.modelApproved
    ? verifySemanticProposals(evidence,input.rerank!.proposals,input.rerank!.inputDigest,{requireCompleteSet:true})
    : new Map<string,{score:number;evidenceCodes:readonly string[]}>();
  // To avoid a partially validated model ranking moving the rest silently,
  // accept only a complete set for the 15 candidate rerank window.
  const accepted=allowed.length>0 && verified.size===allowed.length
    && requested && input.rerank!.modelApproved;
  const enriched=candidates.map(c=>{
    const s=accepted?verified.get(c.mentorId):undefined;
    const finalScore=s ? 0.60*c.ruleScore+0.40*s.score : c.ruleScore;
    return s
      ? {...c,finalScore,mode:'AI_RERANKED' as const,reasons:[
        ...c.reasons,{kind:'MODEL_EVIDENCE' as const,codes:s.evidenceCodes}]}
      : c;
  });
  // Unreranked entries retain the baseline score: AI cannot invent candidates
  // or defeat hard campus/language/source filters.
  enriched.sort((a,b)=>b.finalScore-a.finalScore||a.mentorId.localeCompare(b.mentorId,'en'));
  return {items:enriched,candidateCount:candidates.length,
    sourceScope:mode==='SYNTHETIC'?'SYNTHETIC':'VERIFIED',
    modelOutcome:!requested?'NOT_REQUESTED':accepted?'ACCEPTED':'REJECTED'};
}
