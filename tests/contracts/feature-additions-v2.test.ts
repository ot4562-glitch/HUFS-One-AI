import {describe,expect,it} from 'vitest';
import {FeatureAdditions as S} from '@hufs-one/contracts';
import {
  source,scholarship,mentor,mentorPreference,agency,recognitionRule,proof,
  requirement,experience,crosswalk,badge,badgeEvidence,learning,learningPreference,
  opportunity,query,stat,guide,
} from '../../packages/core/src/feature-additions/v2.fixtures.js';

describe('versioned feature contracts preserve source and actor-independent wire shapes',()=>{
  it('accepts structurally valid verified source metadata',()=>{
    expect(S.FeatureSourceSchema.parse(source()).revisionId).toBe('source-r1');
  });
  it('rejects forged verified-source metadata without evidence',()=>{
    expect(S.FeatureSourceSchema.safeParse({...source(),evidenceSpanIds:[]}).success).toBe(false);
    expect(S.FeatureSourceSchema.safeParse({...source(),verifiedAt:undefined}).success).toBe(false);
  });
  it('rejects backwards effective intervals',()=>{
    expect(S.FeatureSourceSchema.safeParse({...source(),
      effectiveUntil:'2025-12-31T00:00:00+09:00'}).success).toBe(false);
  });
  it('requires valid source status and forbids unnoticed extra sensitive fields',()=>{
    expect(S.FeatureSourceSchema.safeParse({...source(),status:'UNRESTRICTED'}).success).toBe(false);
    expect(S.FeatureSourceSchema.safeParse({...source(),studentId:'private-student'}).success).toBe(false);
  });
  it('accepts a versioned scholarship policy with policy spans and source',()=>{
    expect(S.ScholarshipPolicySchema.parse(scholarship()).groups).toHaveLength(1);
  });
  it('rejects duplicated scholarship condition IDs across rule groups',()=>{
    const p=scholarship();
    expect(S.ScholarshipPolicySchema.safeParse({...p,groups:[...p.groups,...p.groups]})
      .success).toBe(false);
  });
  it('rejects reversed scholarship application windows',()=>{
    expect(S.ScholarshipPolicySchema.safeParse(scholarship({
      opensAt:'2026-12-01T00:00:00+09:00',closesAt:'2026-10-01T00:00:00+09:00',
    })).success).toBe(false);
  });
  it('bounds scholarship evidence values and namespaces',()=>{
    expect(S.FeatureConditionSchema.safeParse({id:'grade-rule',factKey:'gpa',
      op:'UNTRUSTED_SCRIPT',expected:0,sourceSpanId:'span-1',required:true}).success).toBe(false);
    expect(S.FeatureConditionSchema.safeParse({id:'grade-rule',factKey:'student@example.com',
      op:'NUM_GTE',expected:3.5,sourceSpanId:'span-1',required:true}).success).toBe(false);
  });
  it('accepts a finite, source-coded mentor and consented preference shape',()=>{
    expect(S.MentorCardSchema.parse(mentor('ment-1')).majorCodes).toEqual(['ECON']);
    expect(S.MentorPreferenceSchema.parse(mentorPreference()).ownerApprovedTopics).toEqual(['DATA']);
  });
  it('rejects mentor profile extras with contact details',()=>{
    expect(S.MentorCardSchema.safeParse({...mentor('m'),
      phoneNumber:'+82-010-1234-5678'}).success).toBe(false);
  });
  it('refuses semantic scores outside 0..1 and unsigned identifiers',()=>{
    const baseline={candidateId:'ment-1',score:0.5,
      evidenceCodes:['evidence'],modelVersion:'model-v1',inputDigest:'digest-v1'};
    expect(S.SemanticProposalSchema.safeParse(baseline).success).toBe(true);
    expect(S.SemanticProposalSchema.safeParse({...baseline,score:4.5}).success).toBe(false);
    expect(S.SemanticProposalSchema.safeParse({...baseline,inputDigest:'../../secrets'}).success).toBe(false);
  });
  it('accepts verified-campus counseling service without requiring private life histories',()=>{
    expect(S.CounselingServiceSchema.parse(agency('office-1')).id).toBe('office-1');
    expect(S.CounselingServiceSchema.safeParse({...agency('office-1'),diagnosis:'x'})
      .success).toBe(false);
  });
  it('accepts recognition policy and only proof metadata, not file contents',()=>{
    expect(S.ActivityRecognitionRuleSchema.parse(recognitionRule()).documentGroups).toHaveLength(1);
    expect(S.ActivityProofSchema.parse(proof('CERTIFICATE')).ownerReviewed).toBe(true);
    expect(S.ActivityProofSchema.safeParse({...proof('CERTIFICATE'),rawFile:'private-scan'}).success)
      .toBe(false);
  });
  it('rejects empty recognition document alternative groups',()=>{
    const p=recognitionRule();
    expect(S.ActivityRecognitionRuleSchema.safeParse({...p,documentGroups:[
      {id:'empty',join:'ANY',kinds:[]},
    ]}).success).toBe(false);
  });
  it('accepts versioned occupational requirement and owner-approved experience metadata',()=>{
    expect(S.JobRequirementSchema.parse(requirement()).sourceSpanId).toBe('span-1');
    expect(S.ExperienceEvidenceSchema.parse(experience()).approved).toBe(true);
    expect(S.TopicCrosswalkSchema.parse(crosswalk()).oneAiTopic).toBe('DATA_ANALYTICS');
  });
  it('refuses student private narrative hidden in an experience contract',()=>{
    expect(S.ExperienceEvidenceSchema.safeParse({...experience(),
      unrestrictedPersonalText:'my secret project'}).success).toBe(false);
  });
  it('accepts a badge issuer policy and distinct owner evidence metadata',()=>{
    expect(S.BadgeDefinitionSchema.parse(badge()).groups).toHaveLength(1);
    expect(S.BadgeEvidenceSchema.parse(badgeEvidence('A')).ownerApproved).toBe(true);
  });
  it('bounds badge requirements to nonzero positive activity counts',()=>{
    const p=badge();
    const group=p.groups[0]!;
    const req=group.requirements[0]!;
    expect(S.BadgeDefinitionSchema.safeParse({...p,groups:[
      {...group,requirements:[{...req,minimumDistinctActivities:0}]},
    ]}).success).toBe(false);
  });
  it('accepts course-coded tutoring and optional academic preferences',()=>{
    expect(S.LearningProgramSchema.parse(learning('study')).term).toBe('2026-2');
    expect(S.LearningPreferenceSchema.parse(learningPreference()).campus).toBe('SEOUL');
  });
  it('refuses hidden student GPA in a public program catalog item',()=>{
    expect(S.LearningProgramSchema.safeParse({...learning('study'),studentGpa:2.0}).success)
      .toBe(false);
  });
  it('accepts sourced permitted catalog opportunity and bounded search terms',()=>{
    expect(S.OpportunityCatalogItemSchema.parse(opportunity('op-1')).permitted).toBe(true);
    expect(S.OpportunityQuerySchema.parse(query()).pageSize).toBe(20);
  });
  it('rejects unbounded page sizes and arbitrary search keys',()=>{
    expect(S.OpportunityQuerySchema.safeParse(query({pageSize:500})).success).toBe(false);
    expect(S.OpportunityQuerySchema.safeParse({...query(),studentPhone:'private'}).success).toBe(false);
  });
  it('accepts published aggregate policies but never raw student records',()=>{
    expect(S.EmploymentAggregateSchema.parse(stat()).numerator).toBe(60);
    expect(S.EmploymentAggregateSchema.safeParse({...stat(),studentEmail:'private@example.com'})
      .success).toBe(false);
  });
  it('rejects fractional/negative published headcounts',()=>{
    expect(S.EmploymentAggregateSchema.safeParse(stat('bad',{numerator:-1})).success).toBe(false);
    expect(S.EmploymentAggregateSchema.safeParse(stat('bad',{numerator:3.5})).success).toBe(false);
  });
  it('accepts source-bound KO/EN/ZH guide steps and review state',()=>{
    expect(S.InternationalGuideSchema.parse(guide()).translations.zh?.review)
      .toBe('HUMAN_VERIFIED');
  });
  it('refuses unsupported language keys or identity documents',()=>{
    const g=guide();
    expect(S.InternationalGuideSchema.safeParse({...g,translations:{
      ...g.translations,fr:{text:'new',review:'HUMAN_VERIFIED',basedOnRevisionId:'source-r1',
        translationVersion:'fr-r1'},
    }}).success).toBe(false);
    expect(S.InternationalGuideSchema.safeParse({...g,passportNumber:'private'}).success).toBe(false);
  });
});
