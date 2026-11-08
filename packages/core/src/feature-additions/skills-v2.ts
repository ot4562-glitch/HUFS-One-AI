/** #347 — NCS-like requirement/source evidence crosswalk and owner review. */
import {TOPIC_CODES,type FeatureAdditions as C} from '@hufs-one/contracts';
import {safeIntersection,verifySemanticProposals,verifySource,
  type FeatureMode} from './source-policy.js';
export type RequirementEvidenceRow={
  requirementId:string;sourceSpanId:string;
  status:'SUPPORTED_BY_EVIDENCE'|'EVIDENCE_MISSING'|'UNMAPPED'|'NEEDS_REVIEW';
  ownerEvidenceIds:readonly string[];
  matchedOneAiTopics:readonly string[];
  /** An absence of recorded evidence is not evidence of inability. */
  interpretation:'RECORD_MATCH'|'RECORD_MISSING'|'UNKNOWN';
};
export function compareSkillsV2(input:{
  requirements:readonly C.JobRequirement[];
  experiences:readonly C.ExperienceEvidence[];
  crosswalk:readonly C.TopicCrosswalk[];
  asOf:string;mode?:FeatureMode;
}):RequirementEvidenceRow[]{
  const xwalk=new Map<string,Set<string>>();
  for (const x of input.crosswalk) {
    if (!verifySource(x.source,input.asOf,input.mode).usable) continue;
    const codes=xwalk.get(x.officialRequirementTopic)??new Set<string>();
    codes.add(x.oneAiTopic);xwalk.set(x.officialRequirementTopic,codes);
  }
  return input.requirements.map(req=>{
    const base={requirementId:req.id,sourceSpanId:req.sourceSpanId,
      ownerEvidenceIds:[] as string[],matchedOneAiTopics:[] as string[]};
    if(!verifySource(req.source,input.asOf,input.mode).usable
      || !req.source.evidenceSpanIds.includes(req.sourceSpanId)) return {...base,
        status:'NEEDS_REVIEW',interpretation:'UNKNOWN'};
    if (!req.topicCodes.length) return {...base,status:'UNMAPPED',interpretation:'UNKNOWN'};
    // Distinguish an unknown official taxonomy label from a genuinely absent
    // student record: only approved One AI codes or reviewed crosswalks count.
    const oneAiCodes=new Set<string>(TOPIC_CODES);
    const mapped=[...new Set(req.topicCodes.flatMap(c=>[
      ...(oneAiCodes.has(c)?[c]:[]),...(xwalk.get(c)??[]),
    ]))].sort();
    // An unmapped requirement is not evidence that a student lacks capability.
    if (!mapped.length) return {...base,status:'UNMAPPED',interpretation:'UNKNOWN'};
    const eligible=input.experiences.filter(e=>e.approved && e.evidenceSpanIds.length>0
      && safeIntersection(e.topicCodes,mapped).length);
    const ids=[...new Set(eligible.map(e=>e.id))].sort();
    const matched=[...new Set(eligible.flatMap(e=>safeIntersection(e.topicCodes,mapped)))].sort();
    return {...base,ownerEvidenceIds:ids,matchedOneAiTopics:matched,
      status:ids.length?'SUPPORTED_BY_EVIDENCE':'EVIDENCE_MISSING',
      interpretation:ids.length?'RECORD_MATCH':'RECORD_MISSING'};
  });
}
/**
 * The AI team may propose *potential* links, but only known requirement/owner
 * evidence IDs and whitelisted evidence codes can be admitted as review tasks.
 */
export function reviewSkillMatchProposals(input:{
  requirements:readonly C.JobRequirement[];
  experiences:readonly C.ExperienceEvidence[];
  proposals:readonly C.SemanticProposal[];
  inputDigest:string;
}):readonly {requirementId:string;experienceId:string;status:'NEEDS_OWNER_REVIEW';score:number}[]{
  const requirements=new Set(input.requirements.map(r=>r.id));
  const experiences=new Set(input.experiences.filter(e=>e.approved)
    .map(e=>e.id));
  const eligible=new Map<string,readonly string[]>();
  for(const req of requirements)
    eligible.set(req,[...experiences].map(e=>req+'::'+e));
  const verified=verifySemanticProposals(eligible,input.proposals,input.inputDigest);
  const results:{requirementId:string;experienceId:string;status:'NEEDS_OWNER_REVIEW';score:number}[]=[];
  for(const [id,p] of verified) {
    for(const key of p.evidenceCodes) {
      const [requirementId,experienceId]=key.split('::');
      if (requirementId===id && experienceId && experiences.has(experienceId)) results.push({
        requirementId,experienceId,status:'NEEDS_OWNER_REVIEW',score:p.score});
    }
  }
  return results.sort((a,b)=>a.requirementId.localeCompare(b.requirementId,'en')
    ||a.experienceId.localeCompare(b.experienceId,'en'));
}
