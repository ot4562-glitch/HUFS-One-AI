/**
 * #449 PRE-IMPLEMENTATION DRAFT only. No NCP connection, migration, network IO
 * or authority is established by parsing these shapes.
 * Operational source inventory and bytes MUST stay in NCP, never in this repo.
 */
import {z} from 'zod';
import {OfficialHttpsUrlSchema} from '../feature-additions/official-url.js';

const Id=z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/);
const Sha256=z.string().regex(/^[a-f0-9]{64}$/);
const Iso=z.iso.datetime({offset:true});

export const IngestionStageSchema=z.enum([
  'DISCOVERED','FETCHED','PARSED','NEEDS_REVIEW','APPROVED','ACTIVE','REVOKED','FAILED',
]);
export type IngestionStage=z.infer<typeof IngestionStageSchema>;

export const SourceRegistrationDraftSchema=z.strictObject({
  sourceId:Id,
  canonicalUrl:OfficialHttpsUrlSchema,
  /** Operator-reviewed rights reference, not a permission granted by this schema. */
  permissionRef:Id,
  publisher:z.string().trim().min(1).max(200),
  sourceClass:z.literal('PUBLIC_WEB'),
  observedAt:Iso,
  rights:z.strictObject({
    collect:z.boolean(),store:z.boolean(),search:z.boolean(),
    externalTransfer:z.boolean(),
  }),
});
export type SourceRegistrationDraft=z.infer<typeof SourceRegistrationDraftSchema>;

export const SourceRevisionDraftSchema=z.strictObject({
  schemaVersion:z.literal(1),
  sourceId:Id,revisionId:Id,permissionRef:Id,
  /** An NCP-private opaque object identifier; never real bytes or signed URLs. */
  rawObjectKey:z.string().min(1).max(512)
    .refine(v=>!v.includes('://')&&!v.startsWith('/')&&!v.includes('..')&&!/[\\\x00-\x1f]/.test(v)),
  originalSha256:Sha256,normalizedSha256:Sha256,
  extractedFromOriginalSha256:Sha256,
  ingestedBy:Id,fetchedAt:Iso,
  publishedAt:Iso.optional(),effectiveFrom:Iso.optional(),effectiveUntil:Iso.optional(),
  stage:IngestionStageSchema,
  provenance:z.enum(['SYNTHETIC','REAL_APPROVED']),
  rights:z.strictObject({collect:z.boolean(),store:z.boolean(),search:z.boolean()}),
  review:z.strictObject({
    decision:z.enum(['APPROVED','REJECTED']),
    reviewerId:Id,reviewedAt:Iso,
    originalSha256:Sha256,normalizedSha256:Sha256,
  }).optional(),
}).superRefine((item,ctx)=>{
  if(item.effectiveFrom&&item.effectiveUntil
    &&Date.parse(item.effectiveUntil)<=Date.parse(item.effectiveFrom))
    ctx.addIssue({code:'custom',path:['effectiveUntil'],message:'effective interval invalid'});
  if(item.extractedFromOriginalSha256!==item.originalSha256)
    ctx.addIssue({code:'custom',path:['extractedFromOriginalSha256'],
      message:'extraction must bind the original bytes'});
  if(['APPROVED','ACTIVE'].includes(item.stage)){
    if(!item.review||item.review.decision!=='APPROVED'
      ||item.review.reviewerId===item.ingestedBy
      ||item.review.originalSha256!==item.originalSha256
      ||item.review.normalizedSha256!==item.normalizedSha256
      ||Date.parse(item.review.reviewedAt)<Date.parse(item.fetchedAt))
      ctx.addIssue({code:'custom',path:['review'],message:'independent review required'});
  }
  if(item.stage==='ACTIVE'&&(item.provenance!=='REAL_APPROVED'||!item.rights.search
    ||!item.rights.collect||!item.rights.store))
    ctx.addIssue({code:'custom',path:['stage'],message:'active requires real approved rights'});
});
export type SourceRevisionDraft=z.infer<typeof SourceRevisionDraftSchema>;

/**
 * Exact evidence for a normalized field, never a model-generated attribution.
 * A value without a paragraph span cannot be considered source-verified.
 */
export const FieldEvidenceDraftSchema=z.strictObject({
  sourceId:Id,revisionId:Id,paragraphId:Id,
});
const Evidence=z.array(FieldEvidenceDraftSchema).min(1).max(20);
const FactValue=z.union([z.string().min(1).max(2000),z.number().finite(),z.boolean()]);
export const NormalizedFieldDraftSchema=z.discriminatedUnion('state',[
  z.strictObject({
    state:z.literal('KNOWN'),value:FactValue,
    provenance:z.literal('SOURCE_VERIFIED'),evidence:Evidence,
    observedAt:Iso,
  }),
  z.strictObject({
    state:z.literal('UNKNOWN'),reason:z.string().min(1).max(220),
  }),
  z.strictObject({
    state:z.literal('NOT_APPLICABLE'),reason:z.string().min(1).max(220),
  }),
]);
export type NormalizedFieldDraft=z.infer<typeof NormalizedFieldDraftSchema>;

/** Corrections and revocations are explicit links, not inferred from URLs.
 * A detected deletion does not automatically revoke the last approved version.
 */
export const SourceChangeDraftSchema=z.strictObject({
  sourceId:Id,
  revisionId:Id,
  previousRevisionId:Id,
  kind:z.enum(['CORRECTED','REPLACED','CANCELLED']),
  observedAt:Iso,
  reasonEvidence:Evidence,
}).superRefine((item,ctx)=>{
  if(item.revisionId===item.previousRevisionId)
    ctx.addIssue({code:'custom',path:['previousRevisionId'],
      message:'a change cannot point to itself'});
  if(item.reasonEvidence.some(x=>x.sourceId!==item.sourceId
    ||x.revisionId!==item.revisionId))
    ctx.addIssue({code:'custom',path:['reasonEvidence'],
      message:'change evidence must bind the new source revision'});
});
export type SourceChangeDraft=z.infer<typeof SourceChangeDraftSchema>;

/** A draft normalizer may only claim a verified value from its own revision.
 * This is not an actual persistence or official eligibility decision.
 */
export const NormalizedEvidenceRecordDraftSchema=z.strictObject({
  sourceId:Id,revisionId:Id,
  fields:z.record(Id,NormalizedFieldDraftSchema),
}).superRefine((item,ctx)=>{
  const entries=Object.entries(item.fields);
  if(entries.length<1||entries.length>80)
    ctx.addIssue({code:'custom',path:['fields'],message:'field count out of bounds'});
  for(const [key,value] of entries){
    if(value.state==='KNOWN'&&value.evidence.some(x=>x.sourceId!==item.sourceId
      ||x.revisionId!==item.revisionId))
      ctx.addIssue({code:'custom',path:['fields',key,'evidence'],
        message:'field evidence is not in the claimed source revision'});
  }
});
export type NormalizedEvidenceRecordDraft=z.infer<typeof NormalizedEvidenceRecordDraftSchema>;

/** Offline version comparison only; it cannot authorize a DB migration or activation. */
export const VersionHandshakeDraftSchema=z.strictObject({
  gitSha:z.string().regex(/^[a-f0-9]{40}$/),
  buildSha:z.string().regex(/^[a-f0-9]{64}$/),
  migrationVersion:Id,adapterVersion:Id,datasetRevision:Id,
  schemaVersion:z.number().int().positive(),
});
export type VersionHandshakeDraft=z.infer<typeof VersionHandshakeDraftSchema>;
export function isReaderCompatible(
  envelope:VersionHandshakeDraft,reader:{minSchemaVersion:number;maxSchemaVersion:number},
):boolean{
  if(!Number.isSafeInteger(reader.minSchemaVersion)||!Number.isSafeInteger(reader.maxSchemaVersion)
    ||reader.minSchemaVersion<1||reader.minSchemaVersion>reader.maxSchemaVersion)return false;
  const parsed=VersionHandshakeDraftSchema.safeParse(envelope);
  return parsed.success && parsed.data.schemaVersion>=reader.minSchemaVersion
    && parsed.data.schemaVersion<=reader.maxSchemaVersion;
}
