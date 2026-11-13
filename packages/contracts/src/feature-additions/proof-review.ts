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
  redactedAt:Iso,removalReceiptId:Id.optional()}).superRefine((r,ctx)=>{
  if((r.state==='DELETED')!==(r.removalReceiptId!==undefined))
    ctx.addIssue({code:'custom',message:'Only acknowledged deletion has a removal receipt'});
});
/** No raw OCR, raw file bytes, storage URLs or model authorization in any state. */
export const RecognitionProofReviewSchema=z.discriminatedUnion('state',[Pending,Confirmed,Redacted]).superRefine((r,ctx)=>{
  if('expiresAt' in r&&Date.parse(r.expiresAt)<=Date.parse(r.asOf))
    ctx.addIssue({code:'custom',message:'Proof review lease must follow its snapshot'});
});
export type RecognitionProofReview=z.infer<typeof RecognitionProofReviewSchema>;
