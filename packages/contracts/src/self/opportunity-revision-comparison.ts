import {z} from 'zod';

const Ref=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const Utc=z.iso.datetime({offset:true});
export const OpportunityRevisionComparisonRequestSchema=z.strictObject({
  beforeRevisionId:Ref,afterRevisionId:Ref,asOf:Utc,
}).refine(v=>v.beforeRevisionId!==v.afterRevisionId,{
  path:['afterRevisionId'],message:'Two distinct revisions are required',
});
const EvidenceRefs=z.array(Ref).min(1).max(30).refine(v=>new Set(v).size===v.length);
const ConditionValue=z.union([
  z.string().min(1).max(128).regex(/^[\p{L}\p{N} _.,:()-]+$/u),
  z.number().finite(),z.boolean(),
  z.array(z.string().min(1).max(128).regex(/^[\p{L}\p{N} _.,:()-]+$/u)).min(1).max(30),
]);
const Deadline=z.discriminatedUnion('kind',[
  z.strictObject({kind:z.literal('FIXED'),at:Utc}),
  z.strictObject({kind:z.literal('ROLLING')}),
  z.strictObject({kind:z.literal('UNKNOWN')}),
]);
/** Structured, reviewed claim values only. No raw paragraphs, originals, model
 * output, personal eligibility decisions, or source URLs belong in this wire. */
export const OpportunityRevisionComparisonClaimSchema=z.discriminatedUnion('field',[
  z.strictObject({field:z.literal('DEADLINE'),value:Deadline,evidenceRefs:EvidenceRefs}),
  z.strictObject({field:z.literal('STATUS'),
    value:z.enum(['OPEN','CLOSED','CANCELLED','UNKNOWN']),evidenceRefs:EvidenceRefs}),
  z.strictObject({field:z.literal('ELIGIBILITY'),value:z.array(z.strictObject({
    field:z.enum(['enrollment','campus','major','cohort','degree','time','teamRole','certification']),
    operator:z.enum(['EQ','IN','NOT_IN','GTE','LTE','EXISTS']),value:ConditionValue,
  })).max(30),evidenceRefs:EvidenceRefs}),
]);
export const OpportunityComparisonRevisionSchema=z.strictObject({
  revisionId:Ref,sourceId:Ref,opportunityId:Ref,
  capturedAt:Utc,checkedAt:Utc,verifiedAt:Utc,
  contentSha256:z.string().regex(/^[a-f0-9]{64}$/),
  dataMode:z.enum(['REAL','SYNTHETIC']),
  deliveryMode:z.enum(['LIVE','VERIFIED_CACHE','REPLAY']),
  claims:z.array(OpportunityRevisionComparisonClaimSchema).min(1).max(3),
}).superRefine((v,ctx)=>{
  if(new Set(v.claims.map(c=>c.field)).size!==v.claims.length)
    ctx.addIssue({code:'custom',path:['claims'],message:'Duplicate claim field'});
  if(Date.parse(v.capturedAt)>Date.parse(v.checkedAt)
    ||Date.parse(v.capturedAt)>Date.parse(v.verifiedAt))
    ctx.addIssue({code:'custom',message:'Observations and review cannot precede capture'});
});
export const OpportunityRevisionComparisonChangeSchema=z.strictObject({
  field:z.enum(['DEADLINE','STATUS','ELIGIBILITY']),
  kind:z.enum(['EXTENDED','SHORTENED','CANCELLED','CHANGED']),
});
export const OpportunityRevisionFieldComparisonSchema=z.strictObject({
  field:z.enum(['DEADLINE','STATUS','ELIGIBILITY']),
  state:z.enum(['CHANGED','UNCHANGED','UNKNOWN']),
});
function comparableClaimValue(claim:z.infer<typeof OpportunityRevisionComparisonClaimSchema>):string {
  if(claim.field!=='ELIGIBILITY')return JSON.stringify(claim.value);
  // Eligibility conditions form a conjunction; their ordering is immaterial.
  // IN/NOT_IN operands are sets, but other operators retain their array order.
  // Build a separate comparison key so reviewed source values stay immutable.
  // Conditions form a logical conjunction: repeated identical predicates must not
  // be reported as changed merely because one revision repeats a predicate.
  return JSON.stringify([...new Set(claim.value.map(condition=>JSON.stringify({
    field:condition.field,operator:condition.operator,
    value:Array.isArray(condition.value)
      &&(condition.operator==='IN'||condition.operator==='NOT_IN')
      ?[...new Set(condition.value)].sort():condition.value,
  })))].sort());
}
/** Missing/unknown claims are epistemic gaps, never evidence that a condition
 * was added or removed. Every supported field carries an explicit state. */
export function compareReviewedOpportunityRevisionClaims(
  before:z.infer<typeof OpportunityComparisonRevisionSchema>,
  after:z.infer<typeof OpportunityComparisonRevisionSchema>,
):{comparisons:z.infer<typeof OpportunityRevisionFieldComparisonSchema>[];
  changes:z.infer<typeof OpportunityRevisionComparisonChangeSchema>[]} {
  const comparisons:z.infer<typeof OpportunityRevisionFieldComparisonSchema>[]=[];
  const changes:z.infer<typeof OpportunityRevisionComparisonChangeSchema>[]=[];
  for(const field of ['DEADLINE','STATUS','ELIGIBILITY'] as const){
    const previous=before.claims.find(c=>c.field===field),next=after.claims.find(c=>c.field===field);
    const unknown=(claim:typeof previous)=>!claim
      ||(claim.field==='DEADLINE'&&claim.value.kind==='UNKNOWN')
      ||(claim.field==='STATUS'&&claim.value==='UNKNOWN');
    if(unknown(previous)||unknown(next)){
      comparisons.push({field,state:'UNKNOWN'});continue;
    }
    if(comparableClaimValue(previous!)===comparableClaimValue(next!)){
      comparisons.push({field,state:'UNCHANGED'});continue;
    }
    let kind:z.infer<typeof OpportunityRevisionComparisonChangeSchema>['kind']='CHANGED';
    if(field==='STATUS'&&next?.field==='STATUS'&&next.value==='CANCELLED')kind='CANCELLED';
    if(previous?.field==='DEADLINE'&&next?.field==='DEADLINE'
      &&previous.value.kind==='FIXED'&&next.value.kind==='FIXED'){
      const delta=Date.parse(next.value.at)-Date.parse(previous.value.at);
      if(delta===0){comparisons.push({field,state:'UNCHANGED'});continue;}
      kind=delta>0?'EXTENDED':'SHORTENED';
    }
    comparisons.push({field,state:'CHANGED'});changes.push({field,kind});
  }
  return {comparisons,changes};
}
const Binding={opportunityId:Ref,beforeRevisionId:Ref,afterRevisionId:Ref,asOf:Utc};
export const OpportunityRevisionComparisonResponseSchema=z.discriminatedUnion('state',[
  z.strictObject({...Binding,state:z.literal('READY'),
    before:OpportunityComparisonRevisionSchema,after:OpportunityComparisonRevisionSchema,
    comparisons:z.array(OpportunityRevisionFieldComparisonSchema).length(3),
    changes:z.array(OpportunityRevisionComparisonChangeSchema).max(3),
  }),
  z.strictObject({...Binding,state:z.literal('NEEDS_REVIEW'),
    reason:z.enum(['REVISION_NOT_REVIEWED','REVISION_CONFLICT','REVISION_UNKNOWN']),
  }),
]).superRefine((v,ctx)=>{
  const issue=(message:string)=>ctx.addIssue({code:'custom',message});
  if(v.beforeRevisionId===v.afterRevisionId)issue('Distinct revisions required');
  if(v.state!=='READY')return;
  if(v.before.revisionId!==v.beforeRevisionId||v.after.revisionId!==v.afterRevisionId
    ||v.before.opportunityId!==v.opportunityId||v.after.opportunityId!==v.opportunityId
    ||v.before.sourceId!==v.after.sourceId||v.before.dataMode!==v.after.dataMode)
    issue('Revision binding mismatch');
  if(Date.parse(v.before.capturedAt)>=Date.parse(v.after.capturedAt))
    issue('Revisions must be ordered by capture');
  for(const revision of [v.before,v.after]){
    for(const at of [revision.capturedAt,revision.checkedAt,revision.verifiedAt])
      if(Date.parse(at)>Date.parse(v.asOf))issue('Future revision observation or review');
  }
  if(new Set(v.changes.map(c=>c.field)).size!==v.changes.length)issue('Duplicate change field');
  const derived=compareReviewedOpportunityRevisionClaims(v.before,v.after);
  if(JSON.stringify(derived.comparisons)!==JSON.stringify(v.comparisons)
    ||JSON.stringify(derived.changes)!==JSON.stringify(v.changes))
    issue('Field comparison must match reviewed claim values');
  if(v.before.contentSha256===v.after.contentSha256
    &&derived.comparisons.some(c=>c.state==='CHANGED'))
    issue('Equal source hashes cannot establish contradictory reviewed values');
});
export type OpportunityRevisionComparisonRequest=z.infer<typeof OpportunityRevisionComparisonRequestSchema>;
export type OpportunityRevisionComparisonResponse=z.infer<typeof OpportunityRevisionComparisonResponseSchema>;
export type OpportunityComparisonRevision=z.infer<typeof OpportunityComparisonRevisionSchema>;
export type OpportunityRevisionComparisonClaim=z.infer<typeof OpportunityRevisionComparisonClaimSchema>;
export type OpportunityRevisionComparisonChange=z.infer<typeof OpportunityRevisionComparisonChangeSchema>;
