import {z} from 'zod';
import {TopicCodeSchema} from '../topics/index.js';
import {EligibilityConditionSchema} from '../corpus/index.js';

/** #123 Synthetic-only recruiting. These are NOT real HUFS organizations,
 * HUFS administrator grants, admissions, messages, or application workflows. */
const Iso=z.iso.datetime({offset:true});
const ClubId=z.string().regex(/^SYN-CLUB-[0-9]{3}$/);
const PosterId=z.string().regex(/^SYN-POSTER-CLUB-[0-9]{3}$/);
const State=z.enum(['DRAFT','REVIEW_PENDING','APPROVED','REJECTED','EXPIRED','REVOKED']);
export const ClubDemoCategorySchema=z.enum([
  'LANGUAGE','INTERNATIONAL','IT_AI','ACADEMIC','CULTURE_ART',
  'VOLUNTEER','SPORTS','CAREER','MEDIA','MUSIC',
]);
export const ClubDemoActivitySchema=z.enum([
  'STUDY','PROJECT','DEBATE','PERFORMANCE','VOLUNTEERING',
  'MATCH','TRIP','NETWORKING','CREATION','MENTORING',
]);
export const SyntheticClubPostSchema=z.strictObject({
  id:ClubId,clubName:z.string().startsWith('가상동아리 ').max(90),
  summary:z.string().min(1).max(400),
  category:ClubDemoCategorySchema,campus:z.enum(['SEOUL','GLOBAL','BOTH']),
  topicCodes:z.array(TopicCodeSchema).max(12),
  activities:z.array(ClubDemoActivitySchema).max(10),
  conditions:z.array(EligibilityConditionSchema).max(20),
  state:State,createdAt:Iso,updatedAt:Iso,approvedAt:Iso.optional(),
  recruitOpensAt:Iso.optional(),recruitClosesAt:Iso.optional(),
  posterAssetId:PosterId,dataMode:z.literal('SYNTHETIC'),
});
const Fact=z.union([z.string().min(1).max(100),z.number().finite(),
  z.boolean(),z.array(z.string().min(1).max(100)).max(10)]);
const Field=z.enum(['enrollment','campus','major','cohort','degree','time','teamRole','certification']);
export const SyntheticClubProfileSchema=z.strictObject({
  interestTopics:z.array(TopicCodeSchema).max(12),
  approvedExperienceTopics:z.array(TopicCodeSchema).max(12),
  desiredActivities:z.array(ClubDemoActivitySchema).max(10),
  campus:z.enum(['SEOUL','GLOBAL']).optional(),
  facts:z.partialRecord(Field,Fact),
});
export const SyntheticClubCardSchema=z.strictObject({
  post:SyntheticClubPostSchema,
  lifecycle:z.enum(['UPCOMING','OPEN','CLOSED','OPEN_NO_DEADLINE']),
  eligibility:z.enum(['ELIGIBLE','INELIGIBLE','UNKNOWN']),
  reasons:z.array(z.strictObject({
    code:z.enum(['INTEREST_MATCH','EXPERIENCE_MATCH','ACTIVITY_MATCH','CAMPUS_MATCH',
      'CHECK_NEEDED','DEADLINE_UNKNOWN','NO_PERSONAL_MATCH']),
    text:z.string().min(1).max(400),
  })).max(10),
  evidenceRefs:z.array(z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/)).max(20),
});
const approvedAtSnapshot=(post:z.infer<typeof SyntheticClubPostSchema>,asOf:string):boolean=>
  post.state==='APPROVED'&&post.approvedAt!==undefined
  &&Date.parse(post.createdAt)<=Date.parse(asOf)
  &&Date.parse(post.updatedAt)<=Date.parse(asOf)
  &&Date.parse(post.approvedAt)<=Date.parse(asOf)
  &&Date.parse(post.approvedAt)>=Date.parse(post.updatedAt)
  &&Date.parse(post.updatedAt)>=Date.parse(post.createdAt);

export const SyntheticClubBoardResponseSchema=z.strictObject({
  mode:z.literal('SYNTHETIC_DEMO'),
  approvalNotice:z.literal('가상 관리자 승인(시연)'),
  applicationNotice:z.literal('실제 지원 불가'),
  asOf:Iso,configVersion:z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/),
  items:z.array(SyntheticClubCardSchema).max(100),
  recommendedIds:z.array(ClubId).max(3),
}).superRefine((board,ctx)=>{
  const ids=board.items.map(item=>item.post.id);
  if(new Set(ids).size!==ids.length)ctx.addIssue({code:'custom',message:'Duplicate club'});
  if(new Set(board.recommendedIds).size!==board.recommendedIds.length)
    ctx.addIssue({code:'custom',message:'Duplicate featured club'});
  for(const [i,item] of board.items.entries()){
    if(!approvedAtSnapshot(item.post,board.asOf)){
      ctx.addIssue({code:'custom',path:['items',i],message:'Unreviewed or future club content'});
    }
  }
  for(const id of board.recommendedIds){
    const item=board.items.find(x=>x.post.id===id);
    if(!item||item.lifecycle==='CLOSED'||item.eligibility==='INELIGIBLE')
      ctx.addIssue({code:'custom',path:['recommendedIds'],message:'Invalid featured club'});
  }
});
export const SyntheticClubDetailResponseSchema=z.strictObject({
  mode:z.literal('SYNTHETIC_DEMO'),
  approvalNotice:z.literal('가상 관리자 승인(시연)'),
  applicationNotice:z.literal('실제 지원 불가'),
  asOf:Iso,item:SyntheticClubCardSchema,
}).superRefine((detail,ctx)=>{
  if(!approvedAtSnapshot(detail.item.post,detail.asOf))
    ctx.addIssue({code:'custom',path:['item'],message:'Unreviewed or future club detail'});
});
export const SyntheticClubDecisionRequestSchema=z.strictObject({
  expectedVersion:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER-1),
  decision:z.enum(['APPROVE','REJECT','REVOKE']),
});
export const SyntheticClubDecisionResponseSchema=z.strictObject({
  id:ClubId,version:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  state:State,mode:z.literal('SYNTHETIC_DEMO'),
  approvalNotice:z.literal('가상 관리자 승인(시연)'),
});
export type SyntheticClubPost=z.infer<typeof SyntheticClubPostSchema>;
export type SyntheticClubProfile=z.infer<typeof SyntheticClubProfileSchema>;
export type SyntheticClubBoardResponse=z.infer<typeof SyntheticClubBoardResponseSchema>;
export type SyntheticClubDecisionRequest=z.infer<typeof SyntheticClubDecisionRequestSchema>;
export type SyntheticClubDecisionResponse=z.infer<typeof SyntheticClubDecisionResponseSchema>;
