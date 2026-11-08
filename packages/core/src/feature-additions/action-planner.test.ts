import {describe,expect,it} from 'vitest';
import {checkScholarship} from './scholarships-v2.js';
import {compareSkillsV2} from './skills-v2.js';
import {prepareBadgeV2} from './badges-v2.js';
import {planScholarshipPreparation,planEvidenceOpportunities} from './action-planner.js';
import {
  FIXED_NOW,FACT_REVISIONS,scholarship,fact,condition,source,
  requirement,experience,crosswalk,badge,badgeEvidence,opportunity,
} from './v2.fixtures.js';

const scholarshipRun=(values:ReturnType<typeof fact>[]=[],
  policy=scholarship())=>checkScholarship({policy,verifiedFacts:values,
  authorizedFactRevisions:FACT_REVISIONS,asOf:FIXED_NOW});
const missingRequirement=()=>compareSkillsV2({requirements:[requirement()],
  experiences:[],crosswalk:[crosswalk()],asOf:FIXED_NOW});
describe('#343 actionable scholarship checklist',()=>{
  it('returns no tasks when all verified requirements are met',()=>{
    const policy=scholarship();
    const r=planScholarshipPreparation({policy,report:scholarshipRun([fact()],policy)});
    expect(r.actions).toEqual([]);
    expect(r.officialAward).toBe(false);
  });
  it('lists exactly the unverified academic fact and official clause',()=>{
    const policy=scholarship();
    const r=planScholarshipPreparation({policy,report:scholarshipRun([],policy)});
    expect(r.actions).toMatchObject([{kind:'VERIFY_STUDENT_FACT',
      factKey:'gpa',sourceSpanId:'span-1',officialAward:false}]);
  });
  it('separates verified unmet rules from missing data',()=>{
    const policy=scholarship();
    const r=planScholarshipPreparation({policy,report:scholarshipRun([fact(2.5)],policy)});
    expect(r.actions[0]?.reason).toBe('VERIFIED_UNMET');
    expect(r.actions[0]?.kind).toBe('REVIEW_UNMET_REQUIREMENT');
  });
  it('never pretends revoked school rules imply zero unfinished tasks',()=>{
    const policy=scholarship({source:{...source(),status:'REVOKED'}});
    const r=planScholarshipPreparation({policy,report:scholarshipRun([],policy)});
    expect(r.actions[0]?.kind).toBe('CHECK_RULE_SOURCE');
  });
  it('does not list alternatives when an ANY group is satisfied',()=>{
    const policy=scholarship({groups:[{id:'either',join:'ANY',conditions:[
      condition({id:'gpa'}),condition({id:'major',factKey:'major',
        op:'TEXT_EQ',expected:'ECON',sourceSpanId:'span-2'}),
    ]}]});
    const r=planScholarshipPreparation({policy,
      report:scholarshipRun([fact(3.5)],policy)});
    expect(r.actions).toEqual([]);
  });
  it('refuses a report prepared from a different scholarship revision',()=>{
    const policy=scholarship();
    expect(()=>planScholarshipPreparation({policy,
      report:scholarshipRun([],scholarship({source:source('revision-2')}))}))
      .toThrow('STALE_SCHOLARSHIP_REPORT');
  });
});
describe('#347 career gap evidence-to-opportunity planning',()=>{
  const rows=missingRequirement();
  const matching=()=>opportunity('data-1',{
    title:'Data analysis research internship',
    topicCodes:['DATA_ANALYTICS'],
    eligibility:'MET',
    deadlineAt:'2026-11-15T23:59:00+09:00',
  });
  it('preserves required NCS mapped topic when the student has no experience',()=>{
    expect(rows[0]).toMatchObject({status:'EVIDENCE_MISSING',
      requiredOneAiTopics:['DATA_ANALYTICS'],matchedOneAiTopics:[]});
  });
  it('recommends a verified permitted activity with a cited topic match',()=>{
    const r=planEvidenceOpportunities({issue:347,skillRows:rows,
      approvedCatalog:[matching()],asOf:FIXED_NOW,campus:'SEOUL'});
    expect(r.suggestions).toMatchObject([{issue:347,opportunityId:'data-1',
      targetId:'req',matchedTopicCodes:['DATA_ANALYTICS'],
      eligibility:'MET',guaranteedOutcome:false}]);
    expect(r.noVerifiedMatchingOptionFor).toEqual([]);
  });
  it('does not recommend unrelated or already ineligible activities',()=>{
    const r=planEvidenceOpportunities({issue:347,skillRows:rows,
      approvedCatalog:[
        opportunity('not-related',{topicCodes:['PRODUCT_UX']}),
        opportunity('known-ineligible',{topicCodes:['DATA_ANALYTICS'],eligibility:'NOT_MET'}),
      ],asOf:FIXED_NOW});
    expect(r.suggestions).toEqual([]);
    expect(r.noVerifiedMatchingOptionFor).toEqual(['req']);
  });
  it('filters unauthorized, revoked, future-published, expired, and wrong-campus opportunities',()=>{
    const r=planEvidenceOpportunities({issue:347,skillRows:rows,
      approvedCatalog:[
        matching(),
        opportunity('forbidden',{permitted:false}),
        opportunity('revoked',{source:{...source(),status:'REVOKED'}}),
        opportunity('future',{publishedAt:'2026-12-01T12:00:00+09:00'}),
        opportunity('expired',{deadlineAt:'2026-10-01T12:00:00+09:00'}),
        opportunity('different',{campus:'GLOBAL'}),
      ],asOf:FIXED_NOW,campus:'SEOUL'});
    expect(r.suggestions.map(x=>x.opportunityId)).toEqual(['data-1']);
  });
  it('treats unprovided campus as unknown personal eligibility',()=>{
    const r=planEvidenceOpportunities({issue:347,skillRows:rows,
      approvedCatalog:[matching()],asOf:FIXED_NOW});
    expect(r.suggestions[0]).toMatchObject({
      eligibility:'UNKNOWN',reviewFlag:'CHECK_PERSONAL_ELIGIBILITY'});
  });
  it('rejects duplicate IDs, even when one row has revoked source',()=>{
    const r=planEvidenceOpportunities({issue:347,skillRows:rows,
      approvedCatalog:[matching(),opportunity('data-1',{
        source:{...source(),status:'REVOKED'}})],asOf:FIXED_NOW});
    expect(r.suggestions).toEqual([]);
  });
  it('does not recommend an activity if the approved experience already supports the requirement',()=>{
    const supported=compareSkillsV2({requirements:[requirement()],experiences:[experience()],
      crosswalk:[crosswalk()],asOf:FIXED_NOW});
    expect(planEvidenceOpportunities({issue:347,skillRows:supported,
      approvedCatalog:[matching()],asOf:FIXED_NOW}).suggestions).toEqual([]);
  });
  it('caps number of suggestions for each unmet requirement',()=>{
    const catalog=Array.from({length:8},(_,i)=>opportunity('o-'+i));
    const r=planEvidenceOpportunities({issue:347,skillRows:rows,
      approvedCatalog:catalog,asOf:FIXED_NOW,maxPerTarget:2});
    expect(r.suggestions).toHaveLength(2);
    expect(()=>planEvidenceOpportunities({issue:347,skillRows:rows,
      approvedCatalog:catalog,asOf:FIXED_NOW,maxPerTarget:100})).toThrow('INVALID_ACTION_LIMIT');
  });
});
describe('#349 official open badge requirements and permitted next experiences',()=>{
  it('maps only unmet badge topics to activities without promising an award',()=>{
    const b=badge();
    const prep=prepareBadgeV2({badge:b,evidence:[badgeEvidence('A')],asOf:FIXED_NOW});
    const r=planEvidenceOpportunities({issue:349,badgeReport:prep,
      approvedCatalog:[opportunity('o1')],asOf:FIXED_NOW,campus:'SEOUL'});
    expect(r.suggestions).toMatchObject([{issue:349,opportunityId:'o1',
      targetId:'DATA_ANALYTICS',guaranteedOutcome:false}]);
  });
  it('does not suggest new activities if badge preparation already has enough evidence',()=>{
    const prep=prepareBadgeV2({badge:badge(),
      evidence:[badgeEvidence('A'),badgeEvidence('B')],asOf:FIXED_NOW});
    const r=planEvidenceOpportunities({issue:349,badgeReport:prep,
      approvedCatalog:[opportunity('o1')],asOf:FIXED_NOW});
    expect(r.suggestions).toEqual([]);
  });
  it('never interprets UNKNOWN badge rule as no need for official verification',()=>{
    const prep=prepareBadgeV2({badge:badge({source:{...source(),status:'REVOKED'}}),
      evidence:[],asOf:FIXED_NOW});
    const r=planEvidenceOpportunities({issue:349,badgeReport:prep,
      approvedCatalog:[opportunity('o1')],asOf:FIXED_NOW});
    expect(r.suggestions).toEqual([]);
    expect(prep.status).toBe('UNKNOWN');
  });
});
