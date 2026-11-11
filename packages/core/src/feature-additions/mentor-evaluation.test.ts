import {describe,expect,it} from 'vitest';
import {evaluateMentorRankingAtK,type MentorJudgment} from './mentor-evaluation.js';
import {rankMentorsV2} from './mentors-v2.js';
import {mentor,mentorPreference,source} from './v2.fixtures.js';

const majors=['ECON','CS','BUSINESS','POLSCI','HISTORY'];
const jobs=['ANALYST','ENGINEER','CONSULTANT','DESIGN'];
const topics=['DATA_ANALYTICS','PUBLIC_POLICY','SERVICE_DESIGN'];
// Entirely fictional approved-code samples; no mentor/person/student records.
const syntheticCatalog=Array.from({length:20},(_,i)=>mentor(
  'SYN-MENTOR-'+String(i).padStart(2,'0'),{
    majorCodes:[majors[i%majors.length]!],
    jobCodes:[jobs[Math.floor(i/5)%jobs.length]!],
    experienceTopics:[topics[i%topics.length]!],
    publicEvidenceRefs:['SYN-PUBLIC-EVIDENCE-'+i],
  }));
const scenario=Array.from({length:30},(_,i)=>{
  const major=majors[i%majors.length]!,job=jobs[i%jobs.length]!,
    topic=topics[Math.floor(i/2)%topics.length]!;
  const preference=mentorPreference({
    majorCodes:[major],jobCodes:[job],ownerApprovedTopics:[topic],
  });
  const judgments:MentorJudgment[]=syntheticCatalog.map(m=>{
    const matches=Number(m.majorCodes.includes(major))+Number(m.jobCodes.includes(job))
      +Number(m.experienceTopics.includes(topic));
    const relevance:0|1|2=matches>=2?2:matches===1?1:0;
    return {mentorId:m.id,relevance};
  });
  return {id:'SYN-QUERY-'+String(i).padStart(2,'0'),preference,judgments};
});
describe('#344 independent-labelled ranking metric math (no model provider)',()=>{
  it('a perfectly sorted ranking has nDCG=1 and the expected relevance recall',()=>{
    const result=evaluateMentorRankingAtK({rankedIds:['a','b','c'],
      judgments:[{mentorId:'a',relevance:2},{mentorId:'b',relevance:1},
        {mentorId:'c',relevance:0}],k:3});
    expect(result).toMatchObject({ndcgAtK:1,recallAtK:1,mrrAtK:1,
      retrievedRelevant:2,relevantCandidates:2});
  });
  it('a reversed ranking is worse than one aligned with the judgement oracle',()=>{
    const judgments:MentorJudgment[]=[
      {mentorId:'a',relevance:2},{mentorId:'b',relevance:1},{mentorId:'c',relevance:0},
    ];
    const good=evaluateMentorRankingAtK({rankedIds:['a','b','c'],judgments,k:2});
    const bad=evaluateMentorRankingAtK({rankedIds:['c','b','a'],judgments,k:2});
    expect(good.ndcgAtK).toBe(1);
    expect(bad.ndcgAtK).toBeLessThan(good.ndcgAtK!);
    expect(bad.recallAtK).toBe(0.5);
    expect(bad.mrrAtK).toBe(0.5);
  });
  it('an oracle with no relevant candidate gives null, never a false perfect score',()=>{
    expect(evaluateMentorRankingAtK({rankedIds:['a'],judgments:[
      {mentorId:'a',relevance:0}]})).toMatchObject({
      relevantCandidates:0,ndcgAtK:null,recallAtK:null,mrrAtK:null});
  });
  it.each([
    ['duplicate labels',[{mentorId:'a',relevance:1},{mentorId:'a',relevance:2}],['a']],
    ['out of range grade',[{mentorId:'a',relevance:3}],['a']],
    ['unjudged candidate',[{mentorId:'a',relevance:1}],['model-hallucinated']],
    ['duplicate ranked candidate',[{mentorId:'a',relevance:1}],['a','a']],
  ] as const)('rejects %s rather than silently faking relevance',(_label,judgments,rankedIds)=>{
    expect(()=>evaluateMentorRankingAtK({
      rankedIds,judgments:judgments as unknown as MentorJudgment[],
    })).toThrow();
  });
  it.each([0,21,0.5,NaN])('rejects invalid k=%s',k=>{
    expect(()=>evaluateMentorRankingAtK({
      rankedIds:['a'],judgments:[{mentorId:'a',relevance:1}],k,
    })).toThrow();
  });
});
describe('#344 30 synthetic queries by 20 fictional mentors (not independent human Gold)',()=>{
  it.each(scenario)('$id accepts only the 20 reviewed mentor identities',({preference,judgments})=>{
    const report=rankMentorsV2({preference,catalog:syntheticCatalog});
    expect(report.modelOutcome).toBe('NOT_REQUESTED');
    expect(report.candidateCount).toBe(20);
    expect(report.items).toHaveLength(20);
    expect(new Set(report.items.map(r=>r.mentorId)).size).toBe(20);
    expect(report.items.every(r=>r.mode==='RULE_ONLY'
      &&r.ruleScore>=0&&r.ruleScore<=1&&r.finalScore===r.ruleScore)).toBe(true);
    const metrics=evaluateMentorRankingAtK({
      rankedIds:report.items.map(r=>r.mentorId),judgments,k:5,
    });
    expect(metrics.judgedCandidates).toBe(20);
    expect(metrics.ndcgAtK===null||metrics.ndcgAtK>=0&&metrics.ndcgAtK<=1.000000001).toBe(true);
    expect(metrics.recallAtK===null||metrics.recallAtK>=0&&metrics.recallAtK<=1).toBe(true);
    expect(metrics.mrrAtK===null||metrics.mrrAtK>=0&&metrics.mrrAtK<=1).toBe(true);
    for(const match of report.items){
      const m=syntheticCatalog.find(c=>c.id===match.mentorId)!;
      expect(match.reasons.every(r=>r.codes.every(code=>
        m.majorCodes.includes(code)||m.jobCodes.includes(code)
        ||m.experienceTopics.includes(code)||m.publicEvidenceRefs.includes(code))))
        .toBe(true);
    }
  });
  it('source revocation and language/campus changes remove a mentor from evaluation candidates',()=>{
    const preference=mentorPreference();
    const catalog=[mentor('approved'),mentor('revoked',{
      source:{...source(),rights:'BLOCKED'}}),mentor('other-campus',{campuses:['GLOBAL']}),
      mentor('other-language',{languages:['en']})];
    const result=rankMentorsV2({preference,catalog});
    expect(result.items.map(x=>x.mentorId)).toEqual(['approved']);
    expect(result.items[0]?.sourceRevisionId).toBe('source-r1');
  });
});
