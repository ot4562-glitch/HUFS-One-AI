import {describe,expect,it} from 'vitest';
import {rankMentorsV2} from './mentors-v2.js';
import {compareSkillsV2,reviewSkillMatchProposals} from './skills-v2.js';
import {recommendLearningV2} from './learning-v2.js';
import {FIXED_NOW,source,mentor,mentorPreference,requirement,experience,crosswalk,
  learning,learningPreference} from './v2.fixtures.js';

describe('#344 — explanation-backed mentor ranking for approved experiences',()=>{
  it('moves same-major, same-job, same-project mentor to the top',()=>{
    const r=rankMentorsV2({preference:mentorPreference(),catalog:[
      mentor('unrelated',{majorCodes:['ART'],jobCodes:['DESIGN'],experienceTopics:[]}),
      mentor('related'),
    ]});
    expect(r.items.map(x=>x.mentorId)).toEqual(['related','unrelated']);
    expect(r.items[0]?.ruleScore).toBe(1);
    expect(r.items[0]?.reasons).toEqual([
      {kind:'MAJOR',codes:['ECON']},{kind:'JOB',codes:['ANALYST']},
      {kind:'APPROVED_EXPERIENCE',codes:['DATA']},
    ]);
    expect(r.modelOutcome).toBe('NOT_REQUESTED');
  });
  it('never matches inactive, revoked, or unlicensed mentors',()=>{
    const r=rankMentorsV2({preference:mentorPreference(),catalog:[
      mentor('active'),
      mentor('inactive',{active:false}),
      mentor('revoked',{source:{...source(),status:'REVOKED'}}),
      mentor('blocked',{source:{...source(),rights:'BLOCKED'}}),
    ]});
    expect(r.items.map(x=>x.mentorId)).toEqual(['active']);
  });
  it('does not cross requested campus or language constraints',()=>{
    const r=rankMentorsV2({preference:mentorPreference(),catalog:[
      mentor('correct'),
      mentor('global',{campuses:['GLOBAL']}),
      mentor('english',{languages:['en']}),
    ]});
    expect(r.items.map(x=>x.mentorId)).toEqual(['correct']);
  });
  it('renormalizes if major and job are not shared',()=>{
    const r=rankMentorsV2({preference:mentorPreference({
      majorCodes:[],jobCodes:[]}),catalog:[mentor('similar')]});
    expect(r.items[0]?.ruleScore).toBe(1);
    expect(r.items[0]?.reasons).toEqual([{kind:'APPROVED_EXPERIENCE',codes:['DATA']}]);
  });
  it('produces stable names and no fabricated reason for empty profile',()=>{
    const r=rankMentorsV2({preference:mentorPreference({
      majorCodes:[],jobCodes:[],ownerApprovedTopics:[]}),catalog:[mentor('z'),mentor('a')]});
    expect(r.items.map(x=>x.mentorId)).toEqual(['a','z']);
    expect(r.items.every(x=>x.ruleScore===0&&x.reasons.length===0)).toBe(true);
  });
  it('fails closed when the model is not independently approved',()=>{
    const r=rankMentorsV2({preference:mentorPreference(),
      catalog:[mentor('m')],rerank:{modelApproved:false,inputDigest:'digest-1',
      proposals:[{candidateId:'m',score:1,evidenceCodes:['DATA'],
        inputDigest:'digest-1',modelVersion:'model-v1'}]}});
    expect(r.modelOutcome).toBe('REJECTED');
    expect(r.items[0]?.mode).toBe('RULE_ONLY');
  });
  it('accepts a complete, cited, current semantic proposal set',()=>{
    const r=rankMentorsV2({preference:mentorPreference(),catalog:[
      mentor('m-1'),mentor('m-2',{majorCodes:['ECON'],jobCodes:[],experienceTopics:['DATA']}),
    ],rerank:{modelApproved:true,inputDigest:'digest-1',proposals:[
      {candidateId:'m-1',score:0.95,evidenceCodes:['DATA'],inputDigest:'digest-1',modelVersion:'model-v1'},
      {candidateId:'m-2',score:0.80,evidenceCodes:['public-project'],
        inputDigest:'digest-1',modelVersion:'model-v1'},
    ]}});
    expect(r.modelOutcome).toBe('ACCEPTED');
    expect(r.items.every(x=>x.mode==='AI_RERANKED')).toBe(true);
    expect(r.items[0]?.reasons.some(x=>x.kind==='MODEL_EVIDENCE')).toBe(true);
  });
  it('rejects model hallucinations and partial reranking',()=>{
    const proposals=[{candidateId:'m-1',score:0.99,evidenceCodes:['MADE_UP'],
      inputDigest:'digest-1',modelVersion:'model-v1'}];
    const r=rankMentorsV2({preference:mentorPreference(),catalog:[mentor('m-1')],
      rerank:{modelApproved:true,inputDigest:'digest-1',proposals}});
    expect(r.modelOutcome).toBe('REJECTED');
    expect(r.items[0]?.finalScore).toBe(r.items[0]?.ruleScore);
  });
  it('rejects a model response for a mentor not in the verified catalog',()=>{
    const r=rankMentorsV2({preference:mentorPreference(),catalog:[mentor('m-1')],
      rerank:{modelApproved:true,inputDigest:'digest-1',proposals:[
        {candidateId:'fictional-model-hallucination',score:1,evidenceCodes:['DATA'],
          inputDigest:'digest-1',modelVersion:'model-v1'},
      ]}});
    expect(r.modelOutcome).toBe('REJECTED');
    expect(r.items.map(x=>x.mentorId)).toEqual(['m-1']);
  });
  it('allows synthetic source only in explicit simulation mode',()=>{
    const catalog=[mentor('m',{source:{...source(),status:'SYNTHETIC'}})];
    expect(rankMentorsV2({preference:mentorPreference(),catalog}).items).toHaveLength(0);
    expect(rankMentorsV2({preference:mentorPreference(),catalog,mode:'SYNTHETIC'}).items).toHaveLength(1);
  });
});
describe('#347 — NCS-style requirement-to-experience matching',()=>{
  it('maps official requirement topics via the verified crosswalk',()=>{
    const r=compareSkillsV2({requirements:[requirement()],experiences:[experience()],
      crosswalk:[crosswalk()],asOf:FIXED_NOW});
    expect(r).toMatchObject([{requirementId:'req',status:'SUPPORTED_BY_EVIDENCE',
      ownerEvidenceIds:['experience'],matchedOneAiTopics:['DATA_ANALYTICS'],
      interpretation:'RECORD_MATCH'}]);
  });
  it('never treats lacking recorded experience as lacking actual human ability',()=>{
    const r=compareSkillsV2({requirements:[requirement()],experiences:[],
      crosswalk:[crosswalk()],asOf:FIXED_NOW});
    expect(r[0]?.status).toBe('EVIDENCE_MISSING');
    expect(r[0]?.interpretation).toBe('RECORD_MISSING');
  });
  it('filters unapproved or unsupported evidence',()=>{
    const r=compareSkillsV2({requirements:[requirement()],
      experiences:[experience('not-approved',{approved:false}),
        experience('empty',{evidenceSpanIds:[]})],crosswalk:[crosswalk()],asOf:FIXED_NOW});
    expect(r[0]?.ownerEvidenceIds).toEqual([]);
  });
  it('refuses revoked requirement source and non-cited requirement text',()=>{
    const r=compareSkillsV2({requirements:[
      requirement('revoked',{source:{...source(),status:'REVOKED'}}),
      requirement('invalid-span',{sourceSpanId:'fabricated'}),
    ],experiences:[experience()],crosswalk:[crosswalk()],asOf:FIXED_NOW});
    expect(r.map(x=>x.status)).toEqual(['NEEDS_REVIEW','NEEDS_REVIEW']);
  });
  it('labels an officially uncoded requirement as unmapped',()=>{
    const r=compareSkillsV2({requirements:[requirement('uncoded',{topicCodes:[]})],
      experiences:[],crosswalk:[],asOf:FIXED_NOW});
    expect(r[0]?.status).toBe('UNMAPPED');
  });
  it('does not revive unreviewed crosswalk entries',()=>{
    const r=compareSkillsV2({requirements:[requirement()],
      experiences:[experience()],crosswalk:[crosswalk({
        source:{...source(),status:'NEEDS_REVIEW'}})],asOf:FIXED_NOW});
    expect(r[0]?.status).not.toBe('SUPPORTED_BY_EVIDENCE');
  });
  it('accepts model suggested links only as owner-review tasks',()=>{
    const result=reviewSkillMatchProposals({
      requirements:[requirement()],experiences:[experience()],
      inputDigest:'digest-1',
      proposals:[{candidateId:'req',score:0.85,evidenceCodes:['req::experience'],
        modelVersion:'model-v1',inputDigest:'digest-1'}],
    });
    expect(result).toEqual([{requirementId:'req',experienceId:'experience',
      status:'NEEDS_OWNER_REVIEW',score:0.85}]);
  });
  it('rejects invented model links or unapproved owner experiences',()=>{
    const result=reviewSkillMatchProposals({
      requirements:[requirement()],experiences:[experience('e',{approved:false})],
      inputDigest:'digest-1',
      proposals:[{candidateId:'req',score:1,evidenceCodes:['req::e'],
        modelVersion:'model-v1',inputDigest:'digest-1'}],
    });
    expect(result).toEqual([]);
  });
});
describe('#350 — personalized study-group and tutoring ranking',()=>{
  it('prioritizes matching goals/course/topic and explains each match',()=>{
    const r=recommendLearningV2({preference:learningPreference(),
      programs:[learning('unrelated',{goalTags:['ART'],courseCodes:[],topicCodes:[]}),
        learning('matched')]});
    expect(r.items.map(x=>x.programId)).toEqual(['matched','unrelated']);
    expect(r.items[0]?.relevance).toBe(1);
    expect(r.items[0]?.matches).toEqual([
      {kind:'GOAL',codes:['STATISTICS']},
      {kind:'COURSE_INTEREST',codes:['ECO201']},
      {kind:'TOPIC',codes:['DATA_ANALYTICS']},
    ]);
  });
  it('never incorrectly considers user interest to be verified completed prerequisite',()=>{
    const r=recommendLearningV2({preference:learningPreference(),
      programs:[learning('prereq',{requiredCourseCodes:['ECO201']})]});
    expect(r.items[0]?.eligibility).toBe('UNKNOWN');
    expect(r.items[0]?.hardReasons).toContain('COURSE_ELIGIBILITY_NOT_SHARED');
  });
  it('accepts current verified course facts only when supplied',()=>{
    const r=recommendLearningV2({preference:learningPreference(),
      verifiedCompletedCourses:['ECO201'],
      programs:[learning('prereq',{requiredCourseCodes:['ECO201']})]});
    expect(r.items[0]?.eligibility).toBe('MET');
  });
  it('rejects a missing verified prerequisite',()=>{
    const r=recommendLearningV2({preference:learningPreference(),
      verifiedCompletedCourses:[],
      programs:[learning('prereq',{requiredCourseCodes:['ECO201']})]});
    expect(r.items[0]?.eligibility).toBe('NOT_MET');
    expect(r.items[0]?.hardReasons).toContain('PREREQUISITE_NOT_MET');
  });
  it('filters revoked/inactive programs before ranking',()=>{
    const r=recommendLearningV2({preference:learningPreference(),programs:[
      learning('revoked',{source:{...source(),status:'REVOKED'}}),
      learning('inactive',{active:false}),learning('allowed'),
    ]});
    expect(r.items.map(x=>x.programId)).toEqual(['allowed']);
    expect(r.excludedCount).toBe(2);
  });
  it('does not put full or expired offerings ahead of currently available ones',()=>{
    const r=recommendLearningV2({preference:learningPreference(),programs:[
      learning('full',{capacity:'FULL'}),
      learning('expired',{deadlineAt:'2026-10-01T23:59:00+09:00'}),
      learning('available'),
    ]});
    expect(r.items[0]?.programId).toBe('available');
    expect(r.items.slice(1).every(x=>x.eligibility==='NOT_MET')).toBe(true);
  });
  it('does not assert known eligibility when application capacity is unknown',()=>{
    const r=recommendLearningV2({preference:learningPreference(),programs:[
      learning('unknown',{capacity:'UNKNOWN'}),
    ]});
    expect(r.items[0]?.eligibility).toBe('UNKNOWN');
  });
  it('does not invent a campus/semester when applicant data is not shared',()=>{
    const r=recommendLearningV2({preference:learningPreference({campus:undefined,term:undefined}),
      programs:[learning('not-enough-context')]});
    expect(r.items[0]?.eligibility).toBe('UNKNOWN');
    expect(r.items[0]?.hardReasons).toContain('CAMPUS_NOT_PROVIDED');
    expect(r.items[0]?.hardReasons).toContain('TERM_NOT_PROVIDED');
  });
  it('verifies full candidate rerank evidence before applying model scores',()=>{
    const r=recommendLearningV2({preference:learningPreference(),programs:[learning('matched')],
      ai:{approved:true,inputDigest:'digest-1',proposals:[
        {candidateId:'matched',score:0.8,evidenceCodes:['STATISTICS'],
          modelVersion:'model-v1',inputDigest:'digest-1'},
      ]}});
    expect(r.modelOutcome).toBe('ACCEPTED');
    expect(r.items[0]?.mode).toBe('AI_RERANKED');
  });
  it('falls back to deterministic score if model output is fabricated or stale',()=>{
    const r=recommendLearningV2({preference:learningPreference(),programs:[learning('matched')],
      ai:{approved:true,inputDigest:'digest-1',proposals:[
        {candidateId:'matched',score:1,evidenceCodes:['MADE_UP'],
          modelVersion:'model-v1',inputDigest:'old'},
      ]}});
    expect(r.modelOutcome).toBe('REJECTED');
    expect(r.items[0]?.finalScore).toBe(r.items[0]?.relevance);
  });
  it('does not let a model override a closed intake or not-met course gate',()=>{
    const r=recommendLearningV2({preference:learningPreference(),programs:[
      learning('closed',{capacity:'FULL'}),
      learning('open'),
    ],ai:{approved:true,inputDigest:'digest-1',proposals:[
      {candidateId:'closed',score:1,evidenceCodes:['STATISTICS'],
        modelVersion:'model-v1',inputDigest:'digest-1'},
      {candidateId:'open',score:0.2,evidenceCodes:['STATISTICS'],
        modelVersion:'model-v1',inputDigest:'digest-1'},
    ]}});
    expect(r.items[0]?.programId).toBe('open');
    expect(r.items.find(x=>x.programId==='closed')?.eligibility).toBe('NOT_MET');
  });
});
