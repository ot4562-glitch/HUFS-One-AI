/** #350 — learning-program relevance without inventing admission eligibility. */
import type {FeatureAdditions as C} from '@hufs-one/contracts';
import {jaccard,safeIntersection,verifySemanticProposals,verifySource,
  parseAsOf,type FeatureMode} from './source-policy.js';
export type LearningMatch={
  programId:string;sourceRevisionId:string;
  eligibility:'MET'|'NOT_MET'|'UNKNOWN';
  hardReasons:readonly string[];
  relevance:number;finalScore:number;
  matches:readonly {kind:'GOAL'|'COURSE_INTEREST'|'TOPIC'|'MODEL';codes:readonly string[]}[];
  mode:'RULE_ONLY'|'AI_RERANKED';
};
export type LearningRanking={items:readonly LearningMatch[];
  modelOutcome:'NOT_REQUESTED'|'ACCEPTED'|'REJECTED';
  excludedCount:number};
export function recommendLearningV2(input:{
  preference:C.LearningPreference;programs:readonly C.LearningProgram[];
  verifiedCompletedCourses?:readonly string[];
  mode?:FeatureMode;
  ai?:{proposals:readonly C.SemanticProposal[];inputDigest:string;approved:boolean};
}):LearningRanking {
  const at=parseAsOf(input.preference.asOf),p=input.preference;
  let excludedCount=0;
  const seen=new Set<string>();
  const denominator=(p.goalTags.length?0.45:0)+(p.courseCodes.length?0.35:0)
    +(p.topicCodes.length?0.20:0);
  const ranked=input.programs.flatMap(program=>{
    if (seen.has(program.id)) {excludedCount++;return [];}
    seen.add(program.id);
    if(!verifySource(program.source,p.asOf,input.mode).usable || !program.active) {
      excludedCount++;return [];
    }
    const hardReasons:string[]=[];
    let eligibility:'MET'|'NOT_MET'|'UNKNOWN'='MET';
    if (program.term && !p.term) {eligibility='UNKNOWN';hardReasons.push('TERM_NOT_PROVIDED');}
    else if (p.term && program.term!==p.term) {
      eligibility='NOT_MET';hardReasons.push('TERM_MISMATCH');
    }
    if (program.eligibleCampuses.length && !p.campus) {
      if(eligibility==='MET') eligibility='UNKNOWN';
      hardReasons.push('CAMPUS_NOT_PROVIDED');
    } else if (p.campus && program.eligibleCampuses.length
      && !program.eligibleCampuses.includes(p.campus)) {
      eligibility='NOT_MET';hardReasons.push('CAMPUS_MISMATCH');
    }
    if (program.capacity==='FULL') {
      eligibility='NOT_MET';hardReasons.push('CAPACITY_FULL');
    } else if (program.capacity==='UNKNOWN' && eligibility==='MET') {
      eligibility='UNKNOWN';hardReasons.push('CAPACITY_UNVERIFIED');
    }
    if (program.deadlineAt && parseAsOf(program.deadlineAt) <= at) {
      eligibility='NOT_MET';hardReasons.push('APPLICATION_CLOSED');
    }
    if (program.requiredCourseCodes.length && input.verifiedCompletedCourses===undefined) {
      if(eligibility==='MET') eligibility='UNKNOWN';
      hardReasons.push('COURSE_ELIGIBILITY_NOT_SHARED');
    } else if (program.requiredCourseCodes.some(code=>!input.verifiedCompletedCourses?.includes(code))) {
      eligibility='NOT_MET';hardReasons.push('PREREQUISITE_NOT_MET');
    }
    const goals=safeIntersection(p.goalTags,program.goalTags);
    const courses=safeIntersection(p.courseCodes,program.courseCodes);
    const topics=safeIntersection(p.topicCodes,program.topicCodes);
    const relevance=denominator ? (
      (p.goalTags.length?0.45*jaccard(p.goalTags,program.goalTags):0)
      +(p.courseCodes.length?0.35*jaccard(p.courseCodes,program.courseCodes):0)
      +(p.topicCodes.length?0.20*jaccard(p.topicCodes,program.topicCodes):0))/denominator:0;
    const matches:LearningMatch['matches']=[
      ...(goals.length?[{kind:'GOAL' as const,codes:goals}]:[]),
      ...(courses.length?[{kind:'COURSE_INTEREST' as const,codes:courses}]:[]),
      ...(topics.length?[{kind:'TOPIC' as const,codes:topics}]:[]),
    ];
    return [{programId:program.id,sourceRevisionId:program.source.revisionId,
      eligibility,hardReasons,relevance,finalScore:relevance,matches,
      mode:'RULE_ONLY' as const}];
  }).sort((a,b)=>b.relevance-a.relevance||a.programId.localeCompare(b.programId,'en'));
  const candidates=ranked.filter(r=>r.eligibility!=='NOT_MET').slice(0,15);
  const evidence=new Map(candidates.map(r=>[
    r.programId,r.matches.flatMap(m=>m.codes)] as const));
  const proposals=input.ai?.approved
    ?verifySemanticProposals(evidence,input.ai.proposals,input.ai.inputDigest)
    :new Map<string,{score:number;evidenceCodes:readonly string[]}>();
  const accepted=!!input.ai?.approved && candidates.length>0 && proposals.size===candidates.length;
  const result=ranked.map(m=>{
    const proposal=accepted?proposals.get(m.programId):undefined;
    if (!proposal || m.eligibility==='NOT_MET') return m;
    return {...m,mode:'AI_RERANKED' as const,
      finalScore:0.70*m.relevance+0.30*proposal.score,
      matches:[...m.matches,{kind:'MODEL' as const,codes:proposal.evidenceCodes}]};
  });
  const eligRank=(s:LearningMatch['eligibility'])=>s==='MET'?0:s==='UNKNOWN'?1:2;
  result.sort((a,b)=>eligRank(a.eligibility)-eligRank(b.eligibility)
    ||b.finalScore-a.finalScore||a.programId.localeCompare(b.programId,'en'));
  return {items:result,excludedCount,
    modelOutcome:input.ai===undefined?'NOT_REQUESTED':accepted?'ACCEPTED':'REJECTED'};
}
