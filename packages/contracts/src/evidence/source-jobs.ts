import {z} from 'zod';
const Ref=z.string().regex(/^[A-Za-z0-9_.:@-]{1,128}$/),Time=z.iso.datetime({offset:true});
export const SourceJobScopeSchema=z.strictObject({sourceId:Ref,permissionRef:Ref});
export const SourceJobEnqueueSchema=SourceJobScopeSchema.extend({requestKey:Ref});
export const SourceJobAcceptedSchema=z.strictObject({jobId:z.uuid(),created:z.boolean()});
/** Operator metadata only. No actor, request key, lease token, URL or raw input.
 * Operator review concerns an uncertain job completion, not source approval:
 * NEW_DRAFT/CHANGED_DRAFT still require independent SourceReview. */
export const SourceJobStatusSchema=z.strictObject({
  jobId:z.uuid(),sourceId:Ref,
  state:z.enum(['PENDING','LEASED','NEW_DRAFT','CHANGED_DRAFT','UNCHANGED','BLOCKED_RIGHTS','NEEDS_REVIEW','CANCELLED']),
  attemptCount:z.number().int().min(0).max(1),queuedAt:Time,updatedAt:Time,observedAt:Time,
  leaseUntil:Time.optional(),outcomeRevisionId:Ref.optional(),
  lastErrorCode:z.enum(['SOURCE_FAILURE','UNKNOWN_COMPLETION','RIGHTS_DENIED']).optional(),requiresOperatorReview:z.boolean(),
}).superRefine((v,ctx)=>{
  const completed=['NEW_DRAFT','CHANGED_DRAFT','UNCHANGED'].includes(v.state);
  const invalid=Date.parse(v.queuedAt)>Date.parse(v.updatedAt)||Date.parse(v.updatedAt)>Date.parse(v.observedAt)
    ||(v.state==='LEASED')!==(v.leaseUntil!==undefined)||completed!==(v.outcomeRevisionId!==undefined)
    ||v.state==='PENDING'&&v.attemptCount!==0
    ||!['PENDING','CANCELLED'].includes(v.state)&&v.attemptCount!==1
    ||v.state==='NEEDS_REVIEW'&&(!v.requiresOperatorReview||!['SOURCE_FAILURE','UNKNOWN_COMPLETION'].includes(v.lastErrorCode??''))
    ||v.state==='BLOCKED_RIGHTS'&&v.lastErrorCode!=='RIGHTS_DENIED'
    ||!['NEEDS_REVIEW','BLOCKED_RIGHTS'].includes(v.state)&&v.lastErrorCode!==undefined
    ||!['LEASED','NEEDS_REVIEW'].includes(v.state)&&v.requiresOperatorReview;
  if(invalid)ctx.addIssue({code:'custom',message:'Inconsistent source job status'});
});
export type SourceJobStatus=z.infer<typeof SourceJobStatusSchema>;
