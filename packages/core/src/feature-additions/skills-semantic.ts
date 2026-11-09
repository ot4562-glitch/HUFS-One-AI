/** #347 — code-based semantic link candidates between official requirement sentences and
 * owner-approved experience text. A skill-concept lexicon plus character-bigram cosine; no model
 * call. Output is a SemanticProposal set for `reviewSkillMatchProposals`, so every link stays
 * NEEDS_OWNER_REVIEW and can never turn a row into SUPPORTED_BY_EVIDENCE on its own. */
import {createHash} from 'node:crypto';
import type {FeatureAdditions as C} from '@hufs-one/contracts';
import {compareSkillsV2,reviewSkillMatchProposals,type RequirementEvidenceRow} from './skills-v2.js';
import {verifySource,type FeatureMode} from './source-policy.js';

export const SKILL_MATCH_MODEL_VERSION='skill-lexicon-bigram-v1';
/** Protected traits never take part in matching: such a requirement is excluded, such words are removed.
 * Context forms only, so "서버 장애 대응" (an outage) and "나이키" (a brand) are not traits. */
const PROTECTED=/성별|남성|여성|남녀|나이\s*(?:제한|무관|이하|이상|미만|초과|우대)|연령|만\s*\d{1,2}\s*세|국적|장애인|장애\s*(?:여부|유무|등급|우대)|학력|출신|종교|혼인|결혼|임신|외모/g;
/** What may follow a two-letter Korean term: a particle, a light verb, or a role/team suffix.
 * "예산 집행 경험" and "개발자" count; "학생회 집행부" and "방송 편성표" do not. */
const TERM_FOLLOW=/^(?:$|[^\p{L}\p{N}]|은|는|이|가|을|를|에|의|도|와|과|로|으로|및|하|한|할|했|해|됨|된|등|업무|경험|능력|역량|활동|안|서|자|진|팀|생)/u;
/** Skill concepts; a requirement is covered by the share of its concepts the experience also shows. */
const CONCEPTS:Readonly<Record<string,readonly string[]>>={
  DATA:['데이터','통계','엑셀','excel','파이썬','python','태블로','tableau','조회수','매출'],
  ANALYSIS:['분석','해석','측정'],
  VISUAL:['시각화','차트','그래프','대시보드'],
  DATABASE:['데이터베이스','sql','mysql','쿼리'],
  DOC:['보고서','리포트','제안서','기획서','문서','보도자료'],
  SURVEY:['설문','응답','문항'],
  RESEARCH:['조사','리서치','연구','자료'],
  TRADE:['무역','수출','수입','통관','물류'],
  SALES:['협상','영업','바이어','세일즈'],
  LANGUAGE:['영어','중국어','일본어','외국어','어학','toeic','toefl','hsk'],
  TRANSLATION:['번역','통역','용어집'],
  INTERNATIONAL:['해외','국제','글로벌','교환학생','현지'],
  MARKET:['시장','진출'],
  STRATEGY:['전략'],
  MARKETING:['마케팅','홍보','캠페인','광고','sns','인스타그램'],
  BRAND:['브랜드','메시지'],
  CONTENT:['콘텐츠','영상','유튜브','편집','촬영','블로그'],
  PLANNING:['기획','운영'],
  EVENT:['행사','특강','축제','박람회','캠프','컨퍼런스'],
  DEV:['개발','프로그래밍','코딩','react','node','javascript','웹사이트','프론트엔드','백엔드'],
  SERVER:['api','서버','배포'],
  CLOUD:['aws','클라우드','인프라','도커','리눅스'],
  CODE_COLLAB:['git','github','코드 리뷰','코드리뷰','협업'],
  UX_RESEARCH:['인터뷰','사용자'],
  PROTOTYPE:['프로토타입','사용성','피그마','figma'],
  PRESENTATION:['발표','프레젠테이션'],
  HIRING:['채용','면접','모집','부원'],
  EDUCATION:['교육','멘토링','멘토','튜터','과외','강의','학습자'],
  LABOR_LAW:['노무','법령','법률','근로기준'],
  FINANCE:['재무','재무제표','투자','주식','금융'],
  BUDGET:['예산','결산','회계','세무','집행','편성'],
  POLICY:['정책','공공','행정','제도'],
  CUSTOMER:['고객','응대','상담'],
};
const LATIN=/^[a-z0-9.\s]+$/;
const norm=(s:string)=>s.normalize('NFKC').toLocaleLowerCase('ko').replace(PROTECTED,' ').replace(/\s+/g,' ').trim();
const ALL_TERMS=Object.values(CONCEPTS).flat().filter(t=>!LATIN.test(t)&&t.length>=2);
/** A two-letter Korean term must start a word (or follow another lexicon term, "데이터분석") and end at
 * TERM_FOLLOW; longer Korean terms are specific enough to match inside a word. */
function hasKoreanTerm(t:string,term:string):boolean{
  if(term.length>2)return t.includes(term);
  for(let at=t.indexOf(term);at>=0;at=t.indexOf(term,at+1)){
    const before=t.slice(0,at);
    const starts=at===0||/[^\p{L}\p{N}]$/u.test(before)||ALL_TERMS.some(w=>w!==term&&before.endsWith(w));
    if(starts&&TERM_FOLLOW.test(t.slice(at+term.length)))return true;
  }
  return false;
}
function conceptsOf(text:string):Set<string>{
  const t=norm(text),out=new Set<string>();
  for(const [concept,terms] of Object.entries(CONCEPTS))
    if(terms.some(term=>LATIN.test(term)?new RegExp('(^|[^a-z])'+term.replace('.','\\.')+'([^a-z]|$)').test(t):hasKoreanTerm(t,term)))
      out.add(concept);
  return out;
}
function bigrams(text:string):Map<string,number>{
  const out=new Map<string,number>();
  for(const w of norm(text).replace(/[^\p{L}\p{N}\s]/gu,' ').split(' '))
    for(let i=0;i<w.length-1;i++){const g=w.slice(i,i+2);out.set(g,(out.get(g)||0)+1);}
  return out;
}
function cosine(a:Map<string,number>,b:Map<string,number>):number{
  let dot=0,na=0,nb=0;
  for(const [g,v] of a){na+=v*v;dot+=v*(b.get(g)||0);}
  for(const v of b.values())nb+=v*v;
  return na&&nb?dot/Math.sqrt(na*nb):0;
}
export interface SkillMatchScore{requirementId:string;experienceId:string;score:number;sharedConcepts:readonly string[];}
/** 0.8 × share of the requirement's concepts shown by the experience + 0.2 × bigram cosine. */
export function scoreSkillMatch(requirement:string,experience:string):{score:number;sharedConcepts:string[]}{
  const rc=conceptsOf(requirement),ec=conceptsOf(experience);
  const shared=[...rc].filter(c=>ec.has(c)).sort();
  const cos=cosine(bigrams(requirement),bigrams(experience));
  const score=rc.size?0.8*shared.length/rc.size+0.2*cos:cos;
  return {score:Math.round(score*1000)/1000,sharedConcepts:shared};
}
/** Binds proposals to exactly these requirement and experience texts, the experiences' approved
 * versions and this scorer version: re-approving the same text as a new version changes the digest. */
export function skillMatchInputDigest(requirements:readonly {id:string;label:string}[],
  experiences:readonly {id:string;text:string}[],
  versions:readonly {id:string;version:string;approved:boolean}[]=[]):string{
  const canonical=JSON.stringify([SKILL_MATCH_MODEL_VERSION,
    [...requirements].map(r=>[r.id,r.label]).sort(),[...experiences].map(e=>[e.id,e.text]).sort(),
    [...versions].map(v=>[v.id,v.version,v.approved]).sort()]);
  return createHash('sha256').update(canonical).digest('hex');
}
/** IDs used by more than one row. Two editions under one ID (e.g. approved + revoked) are never
 * resolved by order: every row with that ID leaves the semantic path, as in #383. */
function repeatedIds(rows:readonly {id:string}[]):Set<string>{
  const seen=new Set<string>(),twice=new Set<string>();
  for(const r of rows)(seen.has(r.id)?twice:seen).add(r.id);
  return twice;
}
export interface SkillMatchOptions{minScore?:number;maxPerRequirement?:number;}
export function proposeSkillMatches(input:{
  requirements:readonly C.JobRequirement[];
  /** Approved experiences only, with their server-side sanitized description. */
  experiences:readonly C.ExperienceEvidence[];texts:readonly {id:string;text:string}[];
}&SkillMatchOptions):{proposals:C.SemanticProposal[];inputDigest:string;scores:SkillMatchScore[];
  excludedRequirementIds:string[];excludedExperienceIds:string[]}{
  const {minScore=0.55,maxPerRequirement=3}=input;
  const reqTwice=repeatedIds(input.requirements);
  const expTwice=new Set([...repeatedIds(input.experiences),...repeatedIds(input.texts)]);
  const usable=input.experiences.filter(e=>e.approved&&!expTwice.has(e.id));
  const approved=new Set(usable.map(e=>e.id));
  const texts=input.texts.filter(t=>approved.has(t.id));
  const requirements=input.requirements.filter(r=>!reqTwice.has(r.id));
  const inputDigest=skillMatchInputDigest(requirements,texts,usable);
  const excludedRequirementIds:string[]=[...reqTwice].sort(),proposals:C.SemanticProposal[]=[],scores:SkillMatchScore[]=[];
  for(const req of requirements){
    if(new RegExp(PROTECTED.source).test(req.label)){excludedRequirementIds.push(req.id);continue;}
    const ranked=texts.map(t=>({requirementId:req.id,experienceId:t.id,...scoreSkillMatch(req.label,t.text)}))
      .filter(s=>s.score>=minScore&&s.sharedConcepts.length>0)
      .sort((a,b)=>b.score-a.score||a.experienceId.localeCompare(b.experienceId,'en')).slice(0,maxPerRequirement);
    scores.push(...ranked);
    if(ranked.length)proposals.push({candidateId:req.id,score:ranked[0]!.score,modelVersion:SKILL_MATCH_MODEL_VERSION,
      inputDigest,evidenceCodes:ranked.map(s=>req.id+'::'+s.experienceId)});
  }
  return {proposals,inputDigest,scores,excludedRequirementIds,excludedExperienceIds:[...expTwice].sort()};
}
export type SkillGapCandidateRow=RequirementEvidenceRow&{
  /** Code-proposed links awaiting the owner's review; never counted as evidence. */
  candidateExperienceIds:readonly string[];
};
/** Rule crosswalk first; with `semantic` on, proposals that pass `reviewSkillMatchProposals`
 * attach as candidates and move EVIDENCE_MISSING / UNMAPPED rows to NEEDS_REVIEW, never to SUPPORTED. */
export function compareSkillsWithCandidates(input:{
  requirements:readonly C.JobRequirement[];experiences:readonly C.ExperienceEvidence[];
  crosswalk:readonly C.TopicCrosswalk[];texts:readonly {id:string;text:string}[];
  asOf:string;mode?:FeatureMode;semantic:boolean;
}&SkillMatchOptions):{rows:SkillGapCandidateRow[];rankingMode:'RULE_ONLY'|'AI_ASSISTED';excludedRequirementIds:string[]}{
  const rules=compareSkillsV2(input);
  if(!input.semantic)return {rows:rules.map(r=>({...r,candidateExperienceIds:[]})),rankingMode:'RULE_ONLY',excludedRequirementIds:[]};
  // A requirement whose official source or span fails verification gets no candidates either.
  const verified=input.requirements.filter(r=>verifySource(r.source,input.asOf,input.mode).usable
    &&r.source.evidenceSpanIds.includes(r.sourceSpanId));
  // Repeated IDs are judged on the whole input: a revoked twin of a verified row still quarantines the ID.
  const reqTwice=repeatedIds(input.requirements);
  const proposed=proposeSkillMatches({...input,requirements:verified.filter(r=>!reqTwice.has(r.id))});
  const blocked=new Set(proposed.excludedExperienceIds);
  const reviewed=reviewSkillMatchProposals({requirements:verified.filter(r=>!reqTwice.has(r.id)),
    experiences:input.experiences.filter(e=>!blocked.has(e.id)),
    proposals:proposed.proposals,inputDigest:proposed.inputDigest});
  const rows=rules.map(row=>{
    if(reqTwice.has(row.requirementId))return {...row,candidateExperienceIds:[]};
    const ids=[...new Set(reviewed.filter(r=>r.requirementId===row.requirementId&&!blocked.has(r.experienceId))
      .map(r=>r.experienceId))]
      .filter(id=>!row.ownerEvidenceIds.includes(id)).sort();
    const reopen=ids.length&&(row.status==='EVIDENCE_MISSING'||row.status==='UNMAPPED');
    return {...row,candidateExperienceIds:ids,...(reopen?{status:'NEEDS_REVIEW' as const,interpretation:'UNKNOWN' as const}:{})};
  });
  return {rows,rankingMode:'AI_ASSISTED',
    excludedRequirementIds:[...new Set([...reqTwice,...proposed.excludedRequirementIds])].sort()};
}
