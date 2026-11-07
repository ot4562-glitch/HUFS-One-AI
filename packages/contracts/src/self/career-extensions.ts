import {z} from 'zod';
import {TopicCodeSchema,InterestTopicsSchema,DesiredJobTopicsSchema} from '../topics/index.js';
import {ExperiencePortfolioSchema} from './experience-portfolio.js';


/**
 * #317: all portfolio data is private to the authenticated owner.
 * A preference is not a sharing grant. There is intentionally no public GET.
 */
export const CareerProfilePresentationSchema=z.strictObject({
  displayName:z.string().trim().min(1).max(40),
  headline:z.string().trim().max(120),
  bio:z.string().trim().max(700),
  visibility:z.literal('PRIVATE'),
  provenance:z.literal('SELF_REPORTED_UNVERIFIED'),
});
export const CareerEntryCategorySchema=z.enum([
  'PROJECT','CLUB','VOLUNTEERING','WORK','INTERNSHIP','CONTEST','CERTIFICATE','EDUCATION','OTHER',
]);
export const CareerEvidenceSchema=z.discriminatedUnion('state',[
  z.strictObject({state:z.literal('OWNER_APPROVED_TOPIC'),topicCodes:z.array(TopicCodeSchema).min(1).max(5),
    experienceId:z.string().regex(/^[A-Za-z0-9_-]{1,90}$/),contentVersion:z.number().int().positive()}),
  z.strictObject({state:z.literal('NOT_CERTIFIED')}),
]);
export const CareerTimelineEntrySchema=z.strictObject({
  itemId:z.string().regex(/^[A-Za-z0-9_-]{1,90}$/),
  title:z.string().trim().min(1).max(120),summary:z.string().trim().max(500),
  role:z.string().trim().max(80).optional(),category:CareerEntryCategorySchema,
  startedOn:z.iso.date().optional(),endedOn:z.iso.date().optional(),
  updatedAt:z.iso.datetime({offset:true}),dataMode:z.enum(['OWNER_CONSENTED','SYNTHETIC']),
  evidence:CareerEvidenceSchema,sourceOpportunityId:z.string().regex(/^[A-Za-z0-9_-]{1,90}$/).optional(),
  certification:z.literal('NOT_INSTITUTION_VERIFIED'),
}).superRefine((v,ctx)=>{
  if(v.startedOn&&v.endedOn&&v.startedOn>v.endedOn)
    ctx.addIssue({code:'custom',path:['endedOn'],message:'Timeline dates out of order'});
  if(v.dataMode!=='OWNER_CONSENTED'&&v.evidence.state==='OWNER_APPROVED_TOPIC')
    ctx.addIssue({code:'custom',path:['evidence'],message:'Synthetic experiences cannot prove owner-approved skills'});
});
export const CareerRoadmapSchema=z.strictObject({
  asOf:z.iso.datetime({offset:true}),coverage:z.literal('PAGE'),complete:z.boolean(),
  strengthTopics:z.array(z.strictObject({topicCode:TopicCodeSchema,
    experienceIds:z.array(z.string().regex(/^[A-Za-z0-9_-]{1,90}$/)).min(1).max(20)})).max(24),
  explorationTopics:z.array(TopicCodeSchema).max(35),
  nextSteps:z.array(z.strictObject({
    topicCode:TopicCodeSchema,kind:z.enum(['PRACTICE_PROJECT','EXPLORE_ACTIVITIES']),
    explanation:z.string().min(1).max(240),
  })).max(35),
  disclaimer:z.literal('현재 페이지의 본인 승인 경험과 관심/희망 직무로 만든 탐색 안내입니다. 전체 역량 인증, 학점, 취업 적격 또는 합격 가능성이 아닙니다.'),
});
export const CareerRoadmapSourceSchema=z.strictObject({
  profile:z.object({value:z.object({interestTopics:InterestTopicsSchema,desiredJobTopics:DesiredJobTopicsSchema})}),
  portfolio:ExperiencePortfolioSchema,
});
export type CareerRoadmap=z.infer<typeof CareerRoadmapSchema>;
export type CareerTimelineEntry=z.infer<typeof CareerTimelineEntrySchema>;
export type CareerProfilePresentation=z.infer<typeof CareerProfilePresentationSchema>;
