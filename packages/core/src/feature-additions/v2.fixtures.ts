/** Reproducible, exclusively fictional samples. No actual student or HUFS rule. */
import type {FeatureAdditions as C} from '@hufs-one/contracts';

export const FIXED_NOW='2026-11-08T12:00:00+09:00';
export const OPENED='2026-01-01T00:00:00+09:00';
export const VERIFIED_AT='2026-11-01T12:00:00+09:00';
export function source(revisionId='source-r1'):C.FeatureSource {
  return {sourceId:'fictional-source',revisionId,status:'VERIFIED',rights:'CLEARED',
    verifiedAt:VERIFIED_AT,effectiveFrom:OPENED,evidenceSpanIds:['span-1','span-2','span-3']};
}
export function condition(overrides:Partial<C.FeatureCondition>={}):C.FeatureCondition {
  return {id:'grade-rule',factKey:'gpa',op:'NUM_GTE',expected:3.5,
    sourceSpanId:'span-1',required:true,...overrides};
}
export function scholarship(overrides:Partial<C.ScholarshipPolicy>={}):C.ScholarshipPolicy{
  return {id:'fictional-scholarship',academicTerm:'2026-2',source:source(),
    opensAt:'2026-10-01T00:00:00+09:00',closesAt:'2026-12-01T00:00:00+09:00',
    groups:[{id:'required',join:'ALL',conditions:[condition()]}],...overrides};
}
export function fact(
  value:number|string|boolean=3.5,
  overrides:Partial<C.FeatureVerifiedFact>={},
):C.FeatureVerifiedFact {
  return {key:'gpa',value,provenance:'SOURCE_VERIFIED',
    observedAt:'2026-11-02T00:00:00+09:00',
    sourceRevisionId:'transcript-r1',...overrides};
}
export const FACT_REVISIONS=new Set(['transcript-r1']);
export function mentor(id:string, overrides:Partial<C.MentorCard>={}):C.MentorCard{
  return {id,source:source(),active:true,majorCodes:['ECON'],
    jobCodes:['ANALYST'],experienceTopics:['DATA'],languages:['ko'],
    campuses:['SEOUL'],publicEvidenceRefs:['public-project'],...overrides};
}
export function mentorPreference(overrides:Partial<C.MentorPreference>={}):C.MentorPreference{
  return {majorCodes:['ECON'],jobCodes:['ANALYST'],ownerApprovedTopics:['DATA'],
    language:'ko',campus:'SEOUL',asOf:FIXED_NOW,...overrides};
}
export function agency(id:string,overrides:Partial<C.CounselingService>={}):C.CounselingService {
  return {id,source:source(),active:true,purposeCodes:['CAREER'],relatedPurposeCodes:[],
    campuses:['SEOUL'],languages:['ko'],audienceCodes:['STUDENT'],
    officialUrl:'https://example.org/counseling',...overrides};
}
export function recognitionRule(
  overrides:Partial<C.ActivityRecognitionRule>={},
):C.ActivityRecognitionRule{
  return {id:'recognition-1',source:source(),eligibleKinds:['VOLUNTEER'],
    documentGroups:[{id:'required-docs',join:'ALL',kinds:['CERTIFICATE','REPORT']}],
    officialApplicationUrl:'https://example.org/official',...overrides};
}
export function proof(kind:string,overrides:Partial<C.ActivityProof>={}):C.ActivityProof {
  return {id:'proof-'+kind,activityId:'A1',kind,ownerReviewed:true,sourceState:'PRESENT',
    issuedAt:'2026-11-01T12:00:00+09:00',...overrides};
}
export function requirement(
  id='req',overrides:Partial<C.JobRequirement>={},
):C.JobRequirement {
  return {id,label:'Fictional official skill requirement',
    topicCodes:['STATISTICS'],sourceSpanId:'span-1',source:source(),...overrides};
}
export function experience(
  id='experience',overrides:Partial<C.ExperienceEvidence>={},
):C.ExperienceEvidence{
  return {id,approved:true,topicCodes:['DATA_ANALYTICS'],version:'exp-r1',
    evidenceSpanIds:['exp-span'],...overrides};
}
export function crosswalk(overrides:Partial<C.TopicCrosswalk>={}):C.TopicCrosswalk{
  return {id:'topic-crosswalk-1',officialRequirementTopic:'STATISTICS',
    oneAiTopic:'DATA_ANALYTICS',source:source(),...overrides};
}
export function badge(overrides:Partial<C.BadgeDefinition>={}):C.BadgeDefinition {
  return {id:'badge-1',source:source(),
    groups:[{id:'core',join:'ALL',requirements:[{id:'req-data',topicCode:'DATA_ANALYTICS',
      minimumDistinctActivities:2}]}],officialIssuerUrl:'https://example.org/badges',
    ...overrides};
}
export function badgeEvidence(id:string,overrides:Partial<C.BadgeEvidence>={}):C.BadgeEvidence{
  return {id,activityId:id,topicCodes:['DATA_ANALYTICS'],
    date:'2026-10-01T00:00:00+09:00',ownerApproved:true,officialVerified:false,
    ...overrides};
}
export function learning(id:string,overrides:Partial<C.LearningProgram>={}):C.LearningProgram{
  return {id,source:source(),active:true,goalTags:['STATISTICS'],
    courseCodes:['ECO201'],topicCodes:['DATA_ANALYTICS'],
    eligibleCampuses:['SEOUL'],term:'2026-2',capacity:'OPEN',requiredCourseCodes:[],
    deadlineAt:'2026-11-30T23:59:00+09:00',applicationUrl:'https://example.org/study',
    ...overrides};
}
export function learningPreference(overrides:Partial<C.LearningPreference>={}):C.LearningPreference{
  return {goalTags:['STATISTICS'],courseCodes:['ECO201'],topicCodes:['DATA_ANALYTICS'],
    campus:'SEOUL',term:'2026-2',asOf:FIXED_NOW,...overrides};
}
export function opportunity(id:string,overrides:Partial<C.OpportunityCatalogItem>={}):C.OpportunityCatalogItem {
  return {id,title:'Fictional activity '+id,summary:'Data and economics',
    category:'INTERNSHIP',campus:'SEOUL',topicCodes:['DATA_ANALYTICS'],
    eligibility:'UNKNOWN',source:source(),permitted:true,...overrides};
}
export function query(overrides:Partial<C.OpportunityQuery>={}):C.OpportunityQuery {
  return {sort:'TITLE',asOf:FIXED_NOW,pageSize:20,...overrides};
}
export function stat(id='statistics-1',overrides:Partial<C.EmploymentAggregate>={}):C.EmploymentAggregate{
  return {id,source:source(),year:2026,populationId:'respondents',
    metricId:'employment-rate',groupId:'department-1',
    numerator:60,denominator:100,publicApproved:true,
    publicationPolicy:{minimumPositiveCell:5,allowPublishedZero:false,aggregationAllowed:false},
    ...overrides};
}
export function guide(overrides:Partial<C.InternationalGuide>={}):C.InternationalGuide{
  return {id:'international-guide-1',topicCode:'ENROLLMENT',
    campuses:['SEOUL'],terms:['2026-2'],audienceCodes:['INTERNATIONAL_STUDENT'],
    source:source(),translations:{
      ko:{text:'승인된 가상의 한국어 안내',review:'HUMAN_VERIFIED',
        basedOnRevisionId:'source-r1',translationVersion:'ko-r1'},
      en:{text:'Unreviewed translation',review:'MACHINE_DRAFT',
        basedOnRevisionId:'source-r1',translationVersion:'en-r1'},
      zh:{text:'人工审阅的虚构示例',review:'HUMAN_VERIFIED',
        basedOnRevisionId:'source-r1',translationVersion:'zh-r1'},
    },steps:[{id:'step-1',order:1,documentCodes:['APPLICATION'],
      officeCode:'INTERNATIONAL_OFFICE',sourceSpanId:'span-1'}],...overrides};
}
