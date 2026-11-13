import {z} from 'zod';
const Id=z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/),Iso=z.iso.datetime({offset:true});
const Hash=z.string().regex(/^[a-f0-9]{64}$/);
export const ProofReviewFieldNameSchema=z.enum(['ISSUER','PERIOD_START','PERIOD_END','ISSUED_ON','HOURS','AWARD_TITLE']);
export const ProofReviewFlagSchema=z.enum(['NOT_A_PROOF_DOCUMENT','KIND_UNCLEAR','LOW_OCR_CONFIDENCE',
  'ISSUER_NOT_FOUND','ISSUER_MISMATCH','ISSUER_UNCERTAIN','PERIOD_NOT_FOUND','PERIOD_MISMATCH','MULTIPLE_PERIODS',
  'ISSUED_BEFORE_END','CONTAINS_PERSONAL_DATA','ISSUED_IN_FUTURE']);
const BBox=z.tuple([z.number().min(0).max(1),z.number().min(0).max(1),z.number().min(0).max(1),z.number().min(0).max(1)])
  .refine(b=>b[0]<b[2]&&b[1]<b[3]);
export const ProofReviewCandidateSchema=z.strictObject({
  proposedKind:z.enum(['CERTIFICATE','PARTICIPATION_PROOF','REPORT','AWARD_PROOF','OTHER','UNKNOWN']),
  confidence:z.number().finite().min(0).max(1),
  fields:z.array(z.strictObject({name:ProofReviewFieldNameSchema,value:z.string().trim().min(1).max(160),
    quote:z.string().trim().min(1).max(160),lineId:Id,bboxNorm:BBox,confidence:z.number().finite().min(0).max(1)})).max(6)
    .refine(fields=>new Set(fields.map(f=>f.name)).size===fields.length),
  flags:z.array(ProofReviewFlagSchema).max(12).refine(flags=>new Set(flags).size===flags.length),
  maskedLineCount:z.number().int().min(0).max(500),personalDataLineCount:z.number().int().min(0).max(500),
  kindEvidenceLineIds:z.array(Id).max(500).refine(ids=>new Set(ids).size===ids.length),
});
const identity={kind:z.literal('RECOGNITION_PROOF'),dataMode:z.literal('OWNER_CONSENTED'),
  proofId:Id,activityId:Id,assetId:Id,assetVersion:Id,scopeVersion:Hash,
  storageConsentVersion:z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  officiallyRecognized:z.literal(false),modelInputAllowed:z.literal(false)};
const binding={...identity,assetSha256:Hash,ruleId:Id,ruleRevisionId:Id,asOf:Iso,expiresAt:Iso,
  evidencePage:z.number().int().min(0).max(50),candidate:ProofReviewCandidateSchema};
const Pending=z.strictObject({...binding,state:z.literal('NEEDS_REVIEW'),maskingConfirmed:z.literal(false)});
const Confirmed=z.strictObject({...binding,state:z.literal('OWNER_CONFIRMED_CANDIDATE'),maskingConfirmed:z.literal(true),
  documentKind:Id,heldForReview:z.boolean()}).superRefine((r,ctx)=>{
  if(r.documentKind!==r.candidate.proposedKind||r.documentKind==='UNKNOWN'
    ||r.heldForReview!==r.candidate.flags.some(f=>f!=='CONTAINS_PERSONAL_DATA'))
    ctx.addIssue({code:'custom',message:'Confirmed candidate must retain its review holds'});
});
const Redacted=z.strictObject({...identity,state:z.enum(['REJECTED','WITHDRAWN','DELETION_PENDING','DELETED']),
  redactedAt:Iso,cleanupState:z.enum(['PENDING','ACKNOWLEDGED']),cleanupReceiptId:Id.optional(),removalReceiptId:Id.optional()}).superRefine((r,ctx)=>{
  if((r.state==='DELETED')!==(r.removalReceiptId!==undefined))
    ctx.addIssue({code:'custom',message:'Only acknowledged deletion has a removal receipt'});
  if((r.cleanupState==='ACKNOWLEDGED')!==(r.cleanupReceiptId!==undefined)
    ||r.state==='DELETION_PENDING'&&r.cleanupState!=='PENDING'
    ||r.state==='DELETED'&&(r.cleanupState!=='ACKNOWLEDGED'||r.cleanupReceiptId!==r.removalReceiptId))
    ctx.addIssue({code:'custom',message:'Redaction is distinct from acknowledged external cleanup'});
});
/** No raw OCR, raw file bytes, storage URLs or model authorization in any state. */
export const RecognitionProofReviewSchema=z.discriminatedUnion('state',[Pending,Confirmed,Redacted]).superRefine((r,ctx)=>{
  if('expiresAt' in r&&Date.parse(r.expiresAt)<=Date.parse(r.asOf))
    ctx.addIssue({code:'custom',message:'Proof review lease must follow its snapshot'});
});
export type RecognitionProofReview=z.infer<typeof RecognitionProofReviewSchema>;
export const RecognitionProofExtractSchema=z.strictObject({expectedVersion:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER-1),contextVersion:Hash});
export const RecognitionProofConfirmSchema=z.strictObject({expectedVersion:z.number().int().min(1).max(Number.MAX_SAFE_INTEGER-1),contextVersion:Hash,
  maskingConfirmed:z.literal(true),acceptedFieldNames:z.array(ProofReviewFieldNameSchema).max(6).refine(v=>new Set(v).size===v.length)});
export const RecognitionProofRedactSchema=z.strictObject({expectedVersion:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER-1),scopeVersion:Hash,
  action:z.enum(['REJECT','WITHDRAW','REQUEST_DELETE'])});
export const RecognitionProofCleanupSchema=z.strictObject({expectedVersion:z.number().int().min(1).max(Number.MAX_SAFE_INTEGER-1),scopeVersion:Hash});
export const RecognitionProofItemSchema=z.strictObject({proofId:Id,activityId:Id,assetId:Id,assetVersion:Id,
  version:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),state:z.enum(['AVAILABLE','CURRENT','STALE','REDACTED']),
  contextVersion:Hash.nullable(),recordScopeVersion:Hash.nullable(),expiresAt:Iso.nullable(),review:RecognitionProofReviewSchema.nullable(),
}).superRefine((item,ctx)=>{
  const active=item.review&&'candidate' in item.review;
  if(item.state==='AVAILABLE'&&(item.version!==0||item.review!==null||item.recordScopeVersion!==null||!item.contextVersion||!item.expiresAt)
    ||item.state==='CURRENT'&&(!active||item.version<1||item.recordScopeVersion!==item.contextVersion||!item.expiresAt)
    ||item.state==='STALE'&&(item.review!==null||item.version<1||!item.recordScopeVersion)
    ||item.state==='REDACTED'&&(!item.review||active||item.version<1||item.contextVersion!==null||item.expiresAt!==null)
    ||item.review&&(item.review.proofId!==item.proofId||item.review.activityId!==item.activityId||item.review.assetId!==item.assetId
      ||item.review.assetVersion!==item.assetVersion||item.review.scopeVersion!==item.recordScopeVersion))
    ctx.addIssue({code:'custom',message:'Proof view does not match current stored/source binding'});
});
export type RecognitionProofItem=z.infer<typeof RecognitionProofItemSchema>;
export const RecognitionProofMutationSchema=z.discriminatedUnion('state',[
  z.strictObject({state:z.literal('NOT_CONNECTED')}),z.strictObject({state:z.literal('READY'),item:RecognitionProofItemSchema}),
]);
export const RecognitionCleanupBatchSchema=z.discriminatedUnion('state',[
  z.strictObject({state:z.literal('NOT_CONNECTED')}),
  z.strictObject({state:z.literal('READY'),attempted:z.number().int().min(0).max(1),acknowledged:z.number().int().min(0).max(1),
    failed:z.number().int().min(0).max(1),batchLimitReached:z.boolean()})
    .refine(v=>v.attempted===v.acknowledged+v.failed),
]);
