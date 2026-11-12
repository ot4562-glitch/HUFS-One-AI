/** #347 — NCS-like requirement/source evidence crosswalk and owner review. */
import {TOPIC_CODES,type FeatureAdditions as C} from '@hufs-one/contracts';
import {conflictingIds,safeIntersection,verifySemanticProposals,verifySource,
  type FeatureMode} from './source-policy.js';
export type RequirementEvidenceRow={
  requirementId:string;sourceSpanId:string;
  status:'SUPPORTED_BY_EVIDENCE'|'EVIDENCE_MISSING'|'UNMAPPED'|'NEEDS_REVIEW';
  ownerEvidenceIds:readonly string[];
  matchedOneAiTopics:readonly string[];
  /** Reviewed official requirement mapping, including when no experience is recorded. */
  requiredOneAiTopics:readonly string[];
  unmappedRequirementTopics:readonly string[];
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
  // Multiple approved mappings within one reviewed taxonomy revision are valid.
  // Conflicting revisions of the SAME official code must not be unioned into
  // an apparently verified mapping. Quarantine the entire disputed code.
  const sourceHeads=new Map<string,Set<string>>();
  const conflictingCrosswalkIds=conflictingIds(input.crosswalk);
  const conflictingRequirements=conflictingIds(input.requirements);
  const conflictingExperiences=conflictingIds(input.experiences);
  for (const x of input.crosswalk) {
    if(conflictingCrosswalkIds.has(x.id)
      ||!verifySource(x.source,input.asOf,input.mode).usable)continue;
    const heads=sourceHeads.get(x.officialRequirementTopic)??new Set<string>();
    heads.add(x.source.sourceId+':'+x.source.revisionId);
    sourceHeads.set(x.officialRequirementTopic,heads);
    const codes=xwalk.get(x.officialRequirementTopic)??new Set<string>();
    codes.add(x.oneAiTopic);xwalk.set(x.officialRequirementTopic,codes);
  }
  const disputed=new Set([...sourceHeads].filter(([,heads])=>heads.size>1)
    .map(([code])=>code));
  for(const code of disputed)xwalk.delete(code);
  return input.requirements.map(req=>{
    const base={requirementId:req.id,sourceSpanId:req.sourceSpanId,
      ownerEvidenceIds:[] as string[],matchedOneAiTopics:[] as string[],
      requiredOneAiTopics:[] as string[],unmappedRequirementTopics:[] as string[]};
    if(conflictingRequirements.has(req.id)
      ||!verifySource(req.source,input.asOf,input.mode).usable
      || !req.source.evidenceSpanIds.includes(req.sourceSpanId)
      || req.topicCodes.some(code=>disputed.has(code)))return {...base,
        status:'NEEDS_REVIEW',interpretation:'UNKNOWN'};
    if (!req.topicCodes.length) return {...base,status:'UNMAPPED',interpretation:'UNKNOWN'};
    // Distinguish an unknown official taxonomy label from a genuinely absent
    // student record: only approved One AI codes or reviewed crosswalks count.
    const oneAiCodes=new Set<string>(TOPIC_CODES);
    const mapped=[...new Set(req.topicCodes.flatMap(c=>[
      ...(oneAiCodes.has(c)?[c]:[]),...(xwalk.get(c)??[]),
    ]))].sort();
    const unmapped=req.topicCodes.filter(c=>!oneAiCodes.has(c)&&!xwalk.has(c)).sort();
    // A partly mapped official requirement remains unresolved even if the
    // student has evidence for one of the mapped subrequirements.
    if (!mapped.length) return {...base,unmappedRequirementTopics:unmapped,
      status:'UNMAPPED',interpretation:'UNKNOWN'};
    const eligible=input.experiences.filter(e=>e.approved
      && !conflictingExperiences.has(e.id) && e.evidenceSpanIds.length>0
      && safeIntersection(e.topicCodes,mapped).length);
    const ids=[...new Set(eligible.map(e=>e.id))].sort();
    const matched=[...new Set(eligible.flatMap(e=>safeIntersection(e.topicCodes,mapped)))].sort();
    return {...base,ownerEvidenceIds:ids,matchedOneAiTopics:matched,requiredOneAiTopics:mapped,
      unmappedRequirementTopics:unmapped,
      status:unmapped.length?'NEEDS_REVIEW':ids.length?'SUPPORTED_BY_EVIDENCE':'EVIDENCE_MISSING',
      interpretation:unmapped.length?'UNKNOWN':ids.length?'RECORD_MATCH':'RECORD_MISSING'};
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
