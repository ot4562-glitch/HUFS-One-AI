import {z} from 'zod';
import {FeatureAdditions as V} from '@hufs-one/contracts';
import {extractProofCandidate,type ClaimedActivity,type ProofOcrLine} from './proof-ocr.js';
import {classifyProofCandidate} from './recognition-v2.js';
import {parseAsOf,verifySource,type FeatureMode} from './source-policy.js';
type Review=V.RecognitionProofReview;
type Pending=Extract<Review,{state:'NEEDS_REVIEW'}>;
type Confirmed=Extract<Review,{state:'OWNER_CONFIRMED_CANDIDATE'}>;
type FieldName=z.infer<typeof V.ProofReviewFieldNameSchema>;
const Id=z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/),Iso=z.iso.datetime({offset:true});
const Lines=z.array(z.strictObject({id:Id,text:z.string().max(1000),confidence:z.number().finite().min(0).max(1),
  bboxNorm:z.tuple([z.number().min(0).max(1),z.number().min(0).max(1),z.number().min(0).max(1),z.number().min(0).max(1)])
    .refine(b=>b[0]<b[2]&&b[1]<b[3])})).min(1).max(500);
const Claims=z.strictObject({organization:z.string().trim().min(1).max(160).optional(),
  startDate:z.iso.date().optional(),endDate:z.iso.date().optional()});
export const ProofReviewExtractionSchema=z.strictObject({evidencePage:z.number().int().min(0).max(50),lines:Lines,claimed:Claims.optional()});
interface Context{rule:V.ActivityRecognitionRule;scopeVersion:string;asOf:string;mode?:FeatureMode;}
export class ProofReviewStale extends Error{constructor(){super('Proof review authority or state changed');}}
function ruleAt(context:Context){
  V.ActivityRecognitionRuleSchema.parse(context.rule);
  if(!verifySource(context.rule.source,context.asOf,context.mode).usable
    ||(context.rule.applicationEndsAt&&parseAsOf(context.asOf)>parseAsOf(context.rule.applicationEndsAt)))throw new ProofReviewStale();
}
function activeAt(review:Review,context:Context):asserts review is Pending|Confirmed{
  ruleAt(context);
  if(!('candidate' in review)||review.scopeVersion!==context.scopeVersion||review.ruleId!==context.rule.id
    ||review.ruleRevisionId!==context.rule.source.revisionId||parseAsOf(context.asOf)<parseAsOf(review.asOf)
    ||parseAsOf(review.expiresAt)<=parseAsOf(context.asOf))throw new ProofReviewStale();
}
/** Called only with an independently owner/asset/permission-checked OCR snapshot.
 * Parsing here is not authentication; it cannot grant file/OCR rights. */
export function createProofReview(input:{proofId:string;activityId:string;assetId:string;assetVersion:string;assetSha256:string;
  scopeVersion:string;storageConsentVersion:number;expiresAt:string;evidencePage:number;lines:readonly ProofOcrLine[];claimed?:ClaimedActivity}&Context):Pending{
  ruleAt(input);const lines=Lines.parse(input.lines),claimed=Claims.parse(input.claimed??{});
  const extraction=extractProofCandidate(lines,{
    ...(claimed.organization!==undefined?{organization:claimed.organization}:{}),
    ...(claimed.startDate!==undefined?{startDate:claimed.startDate}:{}),
    ...(claimed.endDate!==undefined?{endDate:claimed.endDate}:{}),
  });
  const flags:Pending['candidate']['flags']=[...extraction.flags];
  const issue=extraction.fields.find(f=>f.name==='ISSUED_ON');
  if(issue&&parseAsOf(issue.value+'T00:00:00+09:00')>parseAsOf(input.asOf))flags.push('ISSUED_IN_FUTURE');
  const expiresAt=new Date(Math.min(parseAsOf(Iso.parse(input.expiresAt)),
    input.rule.source.effectiveUntil?parseAsOf(input.rule.source.effectiveUntil):Infinity,
    input.rule.applicationEndsAt?parseAsOf(input.rule.applicationEndsAt):Infinity)).toISOString();
  const result=V.RecognitionProofReviewSchema.parse({kind:'RECOGNITION_PROOF',dataMode:'OWNER_CONSENTED',state:'NEEDS_REVIEW',
    proofId:input.proofId,activityId:input.activityId,assetId:input.assetId,assetVersion:input.assetVersion,
    assetSha256:input.assetSha256,scopeVersion:input.scopeVersion,ruleId:input.rule.id,ruleRevisionId:input.rule.source.revisionId,
    storageConsentVersion:input.storageConsentVersion,
    asOf:input.asOf,expiresAt,evidencePage:input.evidencePage,maskingConfirmed:false,officiallyRecognized:false,modelInputAllowed:false,
    candidate:{proposedKind:extraction.proposedKind,confidence:extraction.confidence,fields:extraction.fields,
      flags,maskedLineCount:extraction.maskedLineIds.length,personalDataLineCount:extraction.personalDataLineIds.length,
      kindEvidenceLineIds:extraction.kindEvidenceLineIds}});
  if(result.state!=='NEEDS_REVIEW')throw new ProofReviewStale();return result;
}
/** Explicit owner review retains only chosen sanitized fields. Holding flags
 * cannot be cleared by masking a field. No model or institutional permission. */
export function confirmProofReview(raw:Review,input:Context&{maskingConfirmed:boolean;acceptedFieldNames:readonly string[]}):Confirmed{
  const review=V.RecognitionProofReviewSchema.parse(raw);activeAt(review,input);
  if(review.state!=='NEEDS_REVIEW'||input.maskingConfirmed!==true)throw new ProofReviewStale();
  const names=z.array(V.ProofReviewFieldNameSchema).max(6).refine(v=>new Set(v).size===v.length).parse(input.acceptedFieldNames);
  const available=new Set(review.candidate.fields.map(f=>f.name));
  if(names.some(name=>!available.has(name)))throw new ProofReviewStale();
  const classified=classifyProofCandidate({rule:input.rule,assetId:review.assetId,proposedKind:review.candidate.proposedKind,
    evidencePage:review.evidencePage,confidence:review.candidate.confidence,ownerConfirmed:true,asOf:input.asOf,
    ...(input.mode?{mode:input.mode}:{})});
  if(classified.status!=='OWNER_CONFIRMED_CANDIDATE'||!classified.documentKind)throw new ProofReviewStale();
  const selected=new Set<FieldName>(names);
  const result=V.RecognitionProofReviewSchema.parse({...review,state:'OWNER_CONFIRMED_CANDIDATE',maskingConfirmed:true,
    documentKind:classified.documentKind,heldForReview:review.candidate.flags.some(f=>f!=='CONTAINS_PERSONAL_DATA'),
    candidate:{...review.candidate,fields:review.candidate.fields.filter(f=>selected.has(f.name))}});
  if(result.state!=='OWNER_CONFIRMED_CANDIDATE')throw new ProofReviewStale();return result;
}
/** Must be guarded by current owner authorization and durable CAS in the caller.
 * Cleanup deliberately does not require a still-valid recognition rule/lease. */
export function redactProofReview(raw:Review,input:{action:'REJECT'|'WITHDRAW'|'REQUEST_DELETE'|'ACK_DELETE'|'ACK_CLEANUP';asOf:string;removalReceiptId?:string}):Review{
  const review=V.RecognitionProofReviewSchema.parse(raw),asOf=Iso.parse(input.asOf);
  if(review.state==='DELETED'||(review.state==='DELETION_PENDING'&&!['REQUEST_DELETE','ACK_DELETE'].includes(input.action))
    ||(input.action==='ACK_DELETE'&&(review.state!=='DELETION_PENDING'||!input.removalReceiptId))
    ||(input.action==='ACK_CLEANUP'&&(!['REJECTED','WITHDRAWN'].includes(review.state)||!input.removalReceiptId
      ||!('cleanupState' in review)||review.cleanupState==='ACKNOWLEDGED')))throw new ProofReviewStale();
  const acknowledged=input.action==='ACK_DELETE'||input.action==='ACK_CLEANUP';
  if(acknowledged)Id.parse(input.removalReceiptId);
  if(!acknowledged&&input.removalReceiptId!==undefined)throw new ProofReviewStale();
  const {kind,dataMode,proofId,activityId,assetId,assetVersion,scopeVersion,storageConsentVersion}=review;
  return V.RecognitionProofReviewSchema.parse({kind,dataMode,proofId,activityId,assetId,assetVersion,scopeVersion,storageConsentVersion,
    state:input.action==='ACK_CLEANUP'?review.state:input.action==='REJECT'?'REJECTED':input.action==='WITHDRAW'?'WITHDRAWN':input.action==='REQUEST_DELETE'?'DELETION_PENDING':'DELETED',
    redactedAt:asOf,officiallyRecognized:false,modelInputAllowed:false,
    cleanupState:acknowledged?'ACKNOWLEDGED':'PENDING',...(acknowledged?{cleanupReceiptId:input.removalReceiptId}:{}),
    ...(input.action==='ACK_DELETE'?{removalReceiptId:input.removalReceiptId}:{})});
}
/** Only current, owner-reviewed, unheld candidates can count as self-reported
 * preparation. It still proves neither issuance nor school recognition. */
export function recognitionProofFromReview(raw:Review,context:Context):V.ActivityProof|undefined{
  try{
    const review=V.RecognitionProofReviewSchema.parse(raw);activeAt(review,context);
    if(review.state!=='OWNER_CONFIRMED_CANDIDATE'||review.heldForReview)return undefined;
    return V.ActivityProofSchema.parse({id:review.proofId,activityId:review.activityId,kind:review.documentKind,
      ownerReviewed:true,sourceState:'PRESENT'});
  }catch{return undefined;}
}
