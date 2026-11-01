import {z} from 'zod';

/**
 * Only the owner can record these stages. They are NOT application submission,
 * employer contact, an admissions decision, or a verified eligibility result.
 * Legacy BOOKMARK {state:'SAVED'} rows implicitly start at INTERESTED.
 */
export const BookmarkStageSchema=z.enum([
  'INTERESTED','PREPARING','SUBMITTED_SELF_REPORTED',
  'AWAITING_RESULT','RESULT_RECORDED',
]);
export type BookmarkStage=z.infer<typeof BookmarkStageSchema>;

export const BookmarkOutcomeSchema=z.strictObject({
  provenance:z.literal('USER_ENTERED_UNVERIFIED'),
  result:z.enum(['ACCEPTED','NOT_ACCEPTED','WAITLISTED','WITHDRAWN','OTHER']),
  note:z.string().trim().min(1).max(160).optional(),
});
export type BookmarkOutcome=z.infer<typeof BookmarkOutcomeSchema>;

const Version=z.number().int().min(1).max(Number.MAX_SAFE_INTEGER-1);
/** A PATCH changes only the stage; immutable opportunityId/dataMode are never
 * accepted from the client. The stored version is advanced via owner-only CAS.
 */
export const BookmarkStagePatchSchema=z.strictObject({
  expectedVersion:Version,
  stage:BookmarkStageSchema,
  outcome:BookmarkOutcomeSchema.optional(),
}).superRefine((value,ctx)=>{
  if(value.stage==='RESULT_RECORDED'&&!value.outcome)
    ctx.addIssue({code:'custom',path:['outcome'],message:'Owner result required'});
  if(value.stage!=='RESULT_RECORDED'&&value.outcome)
    ctx.addIssue({code:'custom',path:['outcome'],message:'Only the final stage has an owner result'});
});
export type BookmarkStagePatch=z.infer<typeof BookmarkStagePatchSchema>;

const sequence=BookmarkStageSchema.options;
/** No implicit skipping, backwards motion or duplicate transitions.
 * Terminal results cannot be promoted to an official outcome.
 */
export function isNextBookmarkStage(
  current:BookmarkStage|undefined,next:BookmarkStage,
):boolean{
  const index=sequence.indexOf(current??'INTERESTED');
  return index>=0&&sequence[index+1]===next;
}
