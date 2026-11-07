import {
  OwnerOpportunityModerationStatusSchema,OpportunityRevisionComparisonContextResponseSchema,
  OpportunityRevisionComparisonResponseSchema,
  type OwnerOpportunityModerationStatus,type OpportunityRevisionComparisonResponse,
} from '@hufs-one/contracts';

export interface CurrentOpportunityRights{
  opportunityId:string;sourceId:string;sourceRevisionId:string;permissionRef:string;
}
/** A report for a different owner/source/revision must never be used to
 * signal that the current authenticated opportunity was reviewed. */
export function verifiedOwnerReportStatus(raw:unknown,expected:CurrentOpportunityRights):
  OwnerOpportunityModerationStatus {
  const state=OwnerOpportunityModerationStatusSchema.parse(raw);
  if(state.opportunityId!==expected.opportunityId
    ||state.sourceRevisionId!==expected.sourceRevisionId
    ||state.permissionRef!==expected.permissionRef)
    throw new TypeError('Moderation result is not bound to current opportunity rights');
  return state;
}
/** A chronological comparison is visible only when both source revisions are
 * currently authorized and reviewed, and the newer one is exactly the
 * revalidated publication. Unknown fields stay UNKNOWN. */
export function verifiedOwnerRevisionComparison(contextRaw:unknown,responseRaw:unknown,
  expected:CurrentOpportunityRights):OpportunityRevisionComparisonResponse|null{
  const context=OpportunityRevisionComparisonContextResponseSchema.parse(contextRaw);
  if(context.opportunityId!==expected.opportunityId)return null;
  if(!context.available)return null;
  if(context.afterRevisionId!==expected.sourceRevisionId)return null;
  const compare=OpportunityRevisionComparisonResponseSchema.parse(responseRaw);
  if(compare.opportunityId!==expected.opportunityId
    ||compare.beforeRevisionId!==context.beforeRevisionId
    ||compare.afterRevisionId!==context.afterRevisionId
    ||Date.parse(compare.asOf)!==Date.parse(context.asOf))
    throw new TypeError('Revision comparison context changed');
  if(compare.state==='READY'&&(
    compare.before.dataMode!=='REAL'||compare.after.dataMode!=='REAL'
    ||compare.before.sourceId!==expected.sourceId
    ||compare.after.sourceId!==expected.sourceId))
    throw new TypeError('Unapproved or mismatched source in revision comparison');
  return compare;
}
