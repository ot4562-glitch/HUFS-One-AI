import {z} from 'zod';
import {TopicCodeSchema} from '../topics/index.js';

const CurrentVersion=z.number().int().min(1).max(Number.MAX_SAFE_INTEGER-1);
const ApprovalVersion=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER-1);
const Topics=z.array(TopicCodeSchema).min(1).max(5).superRefine((topics,ctx)=>{
  if(new Set(topics).size!==topics.length)
    ctx.addIssue({code:'custom',message:'Select each topic only once'});
});
export const ExperienceTagApprovalDeleteSchema=z.strictObject({
  expectedApprovalVersion:ApprovalVersion,
  expectedContentVersion:CurrentVersion,
  expectedConsentVersion:CurrentVersion,
});
export const ExperienceTagApprovalPutSchema=ExperienceTagApprovalDeleteSchema.extend({topics:Topics});
/** Local user selection is separate from content and from AI candidates.
 * ACTIVE means current explicit approval, not a verified career credential
 * or evidence that a recommendation pipeline has consumed these topics.
 */
export const ExperienceTagApprovalSchema=z.discriminatedUnion('state',[
  z.strictObject({state:z.literal('ACTIVE'),version:CurrentVersion,
    contentVersion:CurrentVersion,consentVersion:CurrentVersion,topics:Topics,
    approvedAt:z.iso.datetime({offset:true}),provenance:z.literal('LOCAL_USER_SELECTION')}),
  z.strictObject({state:z.literal('INACTIVE'),version:ApprovalVersion,
    reason:z.enum(['NOT_APPROVED','STALE','REVOKED','CONSENT_REQUIRED','NOT_FOUND'])}),
]);
export type ExperienceTagApproval=z.infer<typeof ExperienceTagApprovalSchema>;
export type ExperienceTagApprovalPut=z.infer<typeof ExperienceTagApprovalPutSchema>;
export type ExperienceTagApprovalDelete=z.infer<typeof ExperienceTagApprovalDeleteSchema>;
