import {describe,expect,it} from 'vitest';
import {FeatureAdditions as S} from '@hufs-one/contracts';
import {checkScholarship} from '../../packages/core/src/feature-additions/scholarships-v2.js';
import {rankMentorsV2} from '../../packages/core/src/feature-additions/mentors-v2.js';
import {routeCounselingV2} from '../../packages/core/src/feature-additions/counseling-v2.js';
import {prepareRecognitionV2} from '../../packages/core/src/feature-additions/recognition-v2.js';
import {compareSkillsV2} from '../../packages/core/src/feature-additions/skills-v2.js';
import {prepareBadgeV2} from '../../packages/core/src/feature-additions/badges-v2.js';
import {recommendLearningV2} from '../../packages/core/src/feature-additions/learning-v2.js';
import {searchApprovedCatalogV2} from '../../packages/core/src/feature-additions/catalog-v2.js';
import {evaluatePublishedStat} from '../../packages/core/src/feature-additions/employment-v2.js';
import {resolveInternationalGuide} from '../../packages/core/src/feature-additions/international-v2.js';
import {
  FIXED_NOW,FACT_REVISIONS,scholarship,fact,mentor,mentorPreference,
  agency,recognitionRule,proof,requirement,experience,crosswalk,
  badge,badgeEvidence,learning,learningPreference,opportunity,query,stat,guide,
} from '../../packages/core/src/feature-additions/v2.fixtures.js';

describe('ten pure domain implementations serialize into the shared wire contracts',()=>{
  it('#343 scholarship with evidence and immutable null official decision',()=>{
    const report=checkScholarship({policy:scholarship(),verifiedFacts:[fact()],
      authorizedFactRevisions:FACT_REVISIONS,asOf:FIXED_NOW});
    expect(S.ScholarshipReportV2Schema.safeParse(report).success).toBe(true);
    expect(S.ScholarshipReportV2Schema.safeParse({...report,
      officialDecision:'AWARDED'}).success).toBe(false);
  });
  it('#344 ranked mentor explanation matches a strict score and ID contract',()=>{
    const report=rankMentorsV2({preference:mentorPreference(),catalog:[mentor('mentor-1')]});
    expect(S.MentorRankingV2Schema.parse(report).items[0]?.finalScore).toBe(1);
    expect(S.MentorRankingV2Schema.safeParse({...report,
      items:[{...report.items[0],finalScore:1.5}]}).success).toBe(false);
  });
  it('#345 official counseling service route includes applicability unknown states',()=>{
    const report=routeCounselingV2({purposes:['CAREER'],
      services:[agency('agency-1')],asOf:FIXED_NOW});
    expect(S.CounselingGuideV2Schema.parse(report).matches).toHaveLength(1);
    expect(S.CounselingGuideV2Schema.safeParse({...report,
      matches:[{...report.matches[0],officialApplicationUrl:'javascript:alert(1)'}]})
      .success).toBe(false);
  });
  it('#346 proofs remain self-reported and official recognition is always false',()=>{
    const report=prepareRecognitionV2({rule:recognitionRule(),
      activity:{id:'A1',kind:'VOLUNTEER'},proofs:[proof('REPORT')],
      asOf:FIXED_NOW});
    expect(S.RecognitionReportV2Schema.parse(report).officiallyRecognized).toBe(false);
    expect(S.RecognitionReportV2Schema.safeParse({...report,officiallyRecognized:true})
      .success).toBe(false);
  });
  it('#347 occupational requirements do not invent certified personal ability',()=>{
    const report=compareSkillsV2({requirements:[requirement()],
      experiences:[experience()],crosswalk:[crosswalk()],asOf:FIXED_NOW});
    expect(report).toHaveLength(1);
    expect(S.SkillRowV2Schema.parse(report[0]).interpretation).toBe('RECORD_MATCH');
    expect(S.SkillRowV2Schema.safeParse({...report[0],status:'OFFICIALLY_SKILLED'}).success)
      .toBe(false);
  });
  it('#348 requires the HTTP layer to sign opaque pagination cursors',()=>{
    const r=searchApprovedCatalogV2({items:[opportunity('a'),opportunity('b')],
      query:query({pageSize:1}),scopeKey:'owner-1',catalogRevision:'r1'});
    expect(S.SignedCatalogPageV2Schema.safeParse({...r,
      nextCursor:r.nextCursor}).success).toBe(false);
    const wire={...r,nextCursor:'signedopaqueproposal123456789'};
    expect(S.SignedCatalogPageV2Schema.parse(wire).hasMore).toBe(true);
    expect(S.SignedCatalogPageV2Schema.safeParse({...wire,nextCursor:null}).success).toBe(false);
  });
  it('#349 badge readiness has no official issuance receipt',()=>{
    const r=prepareBadgeV2({badge:badge(),evidence:[badgeEvidence('A')],
      asOf:FIXED_NOW});
    expect(S.BadgePreparationV2Schema.parse(r).issuedCredential).toBeNull();
    expect(S.BadgePreparationV2Schema.safeParse({...r,issuedCredential:{credentialId:'fake'}})
      .success).toBe(false);
  });
  it('#350 learning-program ranking returns no enrollment admission claim',()=>{
    const r=recommendLearningV2({preference:learningPreference(),programs:[learning('program-1')]});
    expect(S.LearningRankingV2Schema.parse(r).items[0]?.eligibility).toBe('MET');
    expect(S.LearningRankingV2Schema.safeParse({...r,items:[{
      ...r.items[0],eligibility:'ADMITTED',
    }]}).success).toBe(false);
  });
  it('#351 published rates include only calculated safe numeric claims',()=>{
    const r=evaluatePublishedStat(stat(),FIXED_NOW);
    expect(S.EmploymentValueV2Schema.parse(r).percent).toBe(60);
    expect(S.EmploymentValueV2Schema.safeParse({...r,percent:120}).success).toBe(false);
  });
  it('#352 international guide never implies completed institutional administration',()=>{
    const r=resolveInternationalGuide({guide:guide(),locale:'ko',topicCode:'ENROLLMENT',
      campus:'SEOUL',term:'2026-2',audienceCodes:['INTERNATIONAL_STUDENT'],asOf:FIXED_NOW});
    expect(S.GuideResolutionV2Schema.parse(r).steps).toHaveLength(1);
    expect(S.GuideResolutionV2Schema.safeParse({...r,officialAdministrationComplete:true})
      .success).toBe(false);
  });
  it('requires all result DTOs to reject accidental private/freeform fields',()=>{
    const report=rankMentorsV2({preference:mentorPreference(),catalog:[mentor('mentor-1')]});
    expect(S.MentorRankingV2Schema.safeParse({...report,studentEmail:'private@example.com'})
      .success).toBe(false);
  });
});
