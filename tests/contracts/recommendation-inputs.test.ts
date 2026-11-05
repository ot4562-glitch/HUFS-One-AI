import {describe,expect,it} from 'vitest';
import * as contracts from '@hufs-one/contracts';
import type {RecommendationProfile} from '../../packages/core/src/opportunities/evaluate.js';
import type {Notice,NoticeStudent} from '../../packages/core/src/notices/notice.js';
type Schema={safeParse:(value:unknown)=>{success:boolean}};
const schema=(name:string):Schema=>{
  const value=(contracts as unknown as Record<string,Schema>)[name];
  expect(value,`${name} must be a common runtime schema`).toBeDefined();return value!;
};
const profile:RecommendationProfile={interestTopics:['DATA_ANALYTICS'],desiredJobTopics:[],approvedExperienceTopics:[],
  approvedLanguageCodes:[],officialMajorTopics:[],facts:{campus:'SEOUL'}};
const student:NoticeStudent={openRequirementIds:null,courseIds:[],interestTopics:[]};
const notice:Notice={id:'SYN-N',sourceSnapshotId:'SYN-R',title:'Synthetic notice',issuer:'Synthetic',
  category:'ACADEMIC',verificationState:'NEEDS_REVIEW',evidenceRefs:[]};
describe('shared recommendation and notice input contracts (#230)',()=>{
  it('shares schemas with actual core consumer types without manufacturing authority',()=>{
    expect(schema('RecommendationProfileInputSchema').safeParse(profile).success).toBe(true);
    expect(schema('NoticeStudentInputSchema').safeParse(student).success).toBe(true);
    expect(schema('NoticeInputSchema').safeParse(notice).success).toBe(true);
  });
  it.each([{actorId:'SYN-FORGED'}, {facts:{unsafe:{nested:true}}}, {interestTopics:['NOT_A_TOPIC']},
    {approvedLanguageCodes:Array(401).fill('EN')}, {facts:{x:Infinity}}])
    ('rejects unsupported private profile input %j',change=>{
      expect(schema('RecommendationProfileInputSchema').safeParse({...profile,...change}).success).toBe(false);
    });
  it.each([{admin:true},{openRequirementIds:'SYN-REQ'},{majors:[{major:'SYN-M',role:'UNREVIEWED'}]},
    {graduationTermVerified:'true'},{courseIds:Array(401).fill('SYN-C')}])
    ('rejects malformed student scope %j',change=>{
      expect(schema('NoticeStudentInputSchema').safeParse({...student,...change}).success).toBe(false);
    });
  it.each([{approved:true},{verificationState:'APPROVED'},{requirementRefs:Array(401).fill('SYN-R')},
    {studentDeadline:'tomorrow'},{topicCodes:['NOT_A_TOPIC']}])
    ('rejects unsupported notice projection %j',change=>{
      expect(schema('NoticeInputSchema').safeParse({...notice,...change}).success).toBe(false);
    });
});
