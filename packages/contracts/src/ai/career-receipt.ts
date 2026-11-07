import {z} from 'zod';
const AiTaskSchema=z.enum(['experience_skills','opportunity_terms','personal_action_brief','graduation_explanation']);

/** #317 strictly display-only server projection. No raw prompt, actor ID,
 * source text, account identity, provider token or unbounded receipt data. */
const Ref=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const Version=z.number().int().positive().max(Number.MAX_SAFE_INTEGER-1);
const Utc=z.iso.datetime({offset:true});
const JobId=z.uuid();
const InputHash=z.string().regex(/^[a-f0-9]{64}$/);
const Metrics=z.strictObject({
  promptTokens:z.number().int().nonnegative().optional(),
  completionTokens:z.number().int().nonnegative().optional(),
  totalTokens:z.number().int().nonnegative().optional(),
  /** Billing and time are omitted unless actually measured by the operator. */
  measuredLatencyMs:z.number().finite().nonnegative().optional(),
  measuredCostKrw:z.number().finite().nonnegative().optional(),
}).superRefine((v,ctx)=>{
  if(v.totalTokens!==undefined&&v.promptTokens!==undefined&&v.completionTokens!==undefined
    &&v.totalTokens!==v.promptTokens+v.completionTokens)
    ctx.addIssue({code:'custom',path:['totalTokens'],message:'Token counts do not add up'});
});
const Base={
  jobId:JobId,runId:JobId,task:AiTaskSchema,provider:Ref,modelRevision:Ref,
  sourceRevisionId:Ref,consentVersion:Version,rightsVersion:Ref,
  asOf:Utc,recordedAt:Utc,expiresAt:Utc,inputSha256:InputHash,
  reviewState:z.literal('NEEDS_REVIEW'),metrics:Metrics,
};
export const OwnerProviderReceiptSchema=z.discriminatedUnion('mode',[
  z.strictObject({...Base,mode:z.literal('LIVE_PROVIDER_RUN'),
    provenance:z.literal('SERVER_RECORDED'),newProviderInvocation:z.literal(true),
    billingState:z.enum(['SETTLED','NOT_MEASURED'])}),
  z.strictObject({...Base,mode:z.literal('CACHED_PREVIOUS_RUN'),
    provenance:z.literal('SERVER_RECORDED'),newProviderInvocation:z.literal(false),
    originalRunId:JobId,billingState:z.literal('NO_NEW_CHARGE')}),
]).superRefine((v,ctx)=>{
  if(Date.parse(v.expiresAt)<=Date.parse(v.recordedAt)
    ||Date.parse(v.asOf)>Date.parse(v.recordedAt))
    ctx.addIssue({code:'custom',path:['expiresAt'],message:'Receipt source/record/TTL chronology invalid'});
  if(v.mode==='CACHED_PREVIOUS_RUN'&&v.originalRunId===v.runId)
    ctx.addIssue({code:'custom',path:['originalRunId'],message:'Cache read needs separate source run'});
  if(v.mode==='LIVE_PROVIDER_RUN'&&v.billingState==='NOT_MEASURED'
    &&v.metrics.measuredCostKrw!==undefined)
    ctx.addIssue({code:'custom',path:['metrics','measuredCostKrw'],message:'Unmeasured bill cannot claim a price'});
  if(v.mode==='CACHED_PREVIOUS_RUN'&&v.metrics.measuredCostKrw!==undefined
    &&v.metrics.measuredCostKrw!==0)
    ctx.addIssue({code:'custom',path:['metrics','measuredCostKrw'],message:'Cache replay cannot create a new charge'});
});
export type OwnerProviderReceipt=z.infer<typeof OwnerProviderReceiptSchema>;

/** An optional candidate is only comparable to rules if it bears the exact
 * owner feed, evidence and source revision. The client never synthesizes it. */
export const OwnerOpportunityAiProofSchema=z.strictObject({
  opportunityId:Ref,sourceRevisionId:Ref,rankConfigVersion:Ref,
  permissionRef:Ref,provider:Ref,modelRevision:Ref,
  feedVersion:z.string().regex(/^[0-9a-f]{64}$/),asOf:Utc,
  consentVersion:Version,jobId:JobId,
  mode:z.enum(['LIVE_PROVIDER_RUN','CACHED_PREVIOUS_RUN']),
  task:z.literal('opportunity_terms'),state:z.literal('NEEDS_REVIEW'),
  interpretation:z.string().min(1).max(600),
  evidenceRefs:z.array(Ref).min(1).max(20).refine(refs=>new Set(refs).size===refs.length),
  caveats:z.array(z.string().min(1).max(180)).max(6),
});
export type OwnerOpportunityAiProof=z.infer<typeof OwnerOpportunityAiProofSchema>;
