import {z} from 'zod';

const Ref=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const Utc=z.iso.datetime({offset:true});
const Base={opportunityId:Ref,sourceRevisionId:Ref,permissionRef:Ref,checkedAt:Utc};
/** Only the current owner's own report status; not all students' reports. */
export const OwnerOpportunityModerationStatusSchema=z.discriminatedUnion('state',[
  z.strictObject({...Base,state:z.literal('NOT_FILED')}),
  z.strictObject({...Base,state:z.literal('UNDER_REVIEW'),reportedAt:Utc}),
  z.strictObject({...Base,state:z.literal('CLOSED_NO_CHANGE'),reportedAt:Utc}),
  z.strictObject({...Base,state:z.literal('SOURCE_WITHDRAWN')}),
  z.strictObject({...Base,state:z.literal('RIGHTS_REVOKED')}),
]).superRefine((value,ctx)=>{
  if('reportedAt' in value&&Date.parse(value.reportedAt)>Date.parse(value.checkedAt))
    ctx.addIssue({code:'custom',path:['reportedAt'],message:'A report cannot be in the future'});
});
export const OwnerOpportunityReportReasonSchema=z.enum([
  'INCORRECT_DEADLINE','INCORRECT_SOURCE','MISLEADING_APPLICATION_ROUTE','RIGHTS_CONCERN',
]);
export const OwnerOpportunityReportInputSchema=z.strictObject({
  opportunityId:Ref,sourceRevisionId:Ref,permissionRef:Ref,
  reason:OwnerOpportunityReportReasonSchema,
});
export type OwnerOpportunityModerationStatus=z.infer<typeof OwnerOpportunityModerationStatusSchema>;
export type OwnerOpportunityReportInput=z.infer<typeof OwnerOpportunityReportInputSchema>;
export type OwnerOpportunityReportReason=z.infer<typeof OwnerOpportunityReportReasonSchema>;
