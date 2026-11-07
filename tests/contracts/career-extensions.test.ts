import {describe,it,expect} from 'vitest';
import {
  CareerProfilePresentationSchema,CareerTimelineEntrySchema,SelfProfileValueSchema,
  OwnerWorkspaceValueSchema,OpportunitySchema,SyntheticClubPostSchema,
} from '@hufs-one/contracts';
import {DEMO_OPPORTUNITIES,DEMO_CLUB_POSTS} from '../../packages/core/src/opportunities/index.js';

describe('#317 career profile, evidence and safe external data',()=>{
  it('rejects public visibility and keeps self-reported credentials unverified',()=>{
    expect(SelfProfileValueSchema.safeParse({
      displayName:'시험',interestTopics:[],desiredJobTopics:[],
      headline:'학생 프로필',bio:'직접 입력한 가상 소개',visibility:'PRIVATE',
    }).success).toBe(true);
    expect(SelfProfileValueSchema.safeParse({
      displayName:'시험',interestTopics:[],desiredJobTopics:[],visibility:'PUBLIC',
    }).success).toBe(false);
    expect(CareerProfilePresentationSchema.safeParse({
      displayName:'시험',headline:'경험',bio:'본인 작성',visibility:'PRIVATE',
      provenance:'SELF_REPORTED_UNVERIFIED',
    }).success).toBe(true);
  });

  it('accepts optional structured timeline fields but rejects impossible chronology',()=>{
    expect(OwnerWorkspaceValueSchema.safeParse({
      kind:'EXPERIENCE',dataMode:'OWNER_CONSENTED',state:'SELF_REPORTED',
      title:'실습',summary:'본인 기재',category:'VOLUNTEERING',
      startedOn:'2026-02-01',endedOn:'2026-08-01',
    }).success).toBe(true);
    expect(OwnerWorkspaceValueSchema.safeParse({
      kind:'EXPERIENCE',dataMode:'OWNER_CONSENTED',state:'SELF_REPORTED',
      title:'실습',summary:'본인 기재',category:'VOLUNTEERING',
      startedOn:'2026-08-01',endedOn:'2026-02-01',
    }).success).toBe(false);
    expect(CareerTimelineEntrySchema.safeParse({
      itemId:'exp-a',title:'가상',summary:'',updatedAt:'2026-11-07T00:00:00Z',
      category:'WORK',dataMode:'SYNTHETIC',certification:'NOT_INSTITUTION_VERIFIED',
      evidence:{state:'OWNER_APPROVED_TOPIC',experienceId:'exp-a',contentVersion:1,topicCodes:['AI_ML']},
    }).success).toBe(false);
  });

  it('distinguishes organization website from source/application and only permits HTTPS',()=>{
    const a=DEMO_OPPORTUNITIES[0]!;
    expect(OpportunitySchema.safeParse({...a,organizationHomepage:'https://example.com/about'}).success).toBe(true);
    expect(OpportunitySchema.safeParse({...a,organizationHomepage:'http://example.com'}).success).toBe(false);
    expect(OpportunitySchema.safeParse({...a,organizationHomepage:'https://localhost/admin'}).success).toBe(false);
    expect(OpportunitySchema.safeParse({...a,organizationHomepage:'https://user:pass@example.com'}).success).toBe(false);
    expect(OpportunitySchema.safeParse({...a,organizationHomepage:'file:///private'}).success).toBe(false);
  });

  it('represents extra-university synthetic clubs without claiming publication permission',()=>{
    const club=DEMO_CLUB_POSTS[0]!;
    expect(SyntheticClubPostSchema.safeParse({...club,organizationScope:'INTERUNIVERSITY'}).success).toBe(true);
    expect(SyntheticClubPostSchema.safeParse({...club,organizationScope:'EXTERNAL'}).success).toBe(true);
    expect(SyntheticClubPostSchema.safeParse({...club,organizationScope:'OFFICIAL_UNIVERSITY'}).success).toBe(false);
  });
});
