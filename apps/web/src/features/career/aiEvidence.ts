import {
  OpportunityExplanationResponseSchema,OwnerOpportunityAiProofSchema,
  OwnerProviderReceiptSchema,ProviderStoredJobSchema,
  type OwnerOpportunityAiProof,type OwnerProviderReceipt,
  type ProviderStoredJob,type OpportunityExplanationResponse,
} from '@hufs-one/contracts';

interface ComparisonContext {
  opportunityId:string;sourceRevisionId:string;permissionRef:string;
  rankConfigVersion:string;feedVersion:string;consentVersion:number;asOf:string;
  /** Never show AI evidence for an unverified/synthetic or revoked publication. */
  sourceVerified:boolean;
}
export function verifiedCareerAiComparison(raw:unknown,ruleRaw:unknown,expected:ComparisonContext):OwnerOpportunityAiProof{
  const ai=OwnerOpportunityAiProofSchema.parse(raw),rule=OpportunityExplanationResponseSchema.parse(ruleRaw);
  if(!expected.sourceVerified||ai.state!=='NEEDS_REVIEW'
    ||ai.opportunityId!==expected.opportunityId||rule.opportunityId!==expected.opportunityId
    ||ai.sourceRevisionId!==expected.sourceRevisionId||rule.sourceRevisionId!==expected.sourceRevisionId
    ||ai.permissionRef!==expected.permissionRef
    ||ai.rankConfigVersion!==expected.rankConfigVersion||rule.rankConfigVersion!==expected.rankConfigVersion
    ||ai.feedVersion!==expected.feedVersion
    ||ai.consentVersion!==expected.consentVersion
    ||Date.parse(ai.asOf)!==Date.parse(expected.asOf)
    ||Date.parse(rule.asOf)!==Date.parse(expected.asOf)
    ||rule.evidenceRefs.length===0
    ||ai.evidenceRefs.some(ref=>!rule.evidenceRefs.includes(ref)))
    throw new TypeError('Unbound or unverified AI comparison');
  if(rule.state==='NOT_FEATURED'&&['HIDDEN_BY_USER','NOT_EVALUATED'].includes(rule.reason))
    throw new TypeError('Hidden or unevaluated results cannot be compared');
  return ai;
}
/** Optional read-only receipt projection supplied by the authenticated API;
 * browser UI must never invent cost, tokens, a source or the billing state. */
export function verifiedCareerReceipt(raw:unknown,storedRaw:unknown,
  expected:{jobId:string;task:ProviderStoredJob['candidate']['task']},now=Date.now()):OwnerProviderReceipt{
  const receipt=OwnerProviderReceiptSchema.parse(raw);
  const stored=ProviderStoredJobSchema.parse(storedRaw);
  if(receipt.jobId!==expected.jobId||stored.jobId!==expected.jobId
    ||receipt.task!==expected.task||stored.candidate.task!==expected.task
    ||Date.parse(receipt.expiresAt)<=now
    ||receipt.metrics.promptTokens!==undefined&&receipt.metrics.promptTokens!==stored.candidate.usage.promptTokens
    ||receipt.metrics.completionTokens!==undefined&&receipt.metrics.completionTokens!==stored.candidate.usage.completionTokens
    ||receipt.metrics.totalTokens!==undefined&&receipt.metrics.totalTokens!==stored.candidate.usage.totalTokens)
    throw new TypeError('Receipt does not bind current owner candidate');
  return receipt;
}
