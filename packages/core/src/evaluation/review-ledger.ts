import {createPublicKey,verify,type KeyObject} from 'node:crypto';
import {z} from 'zod';
import {canonicalJson,hashBytes,hashCanonical,ZERO_HEAD} from './canonical.js';
import {validateAnyReviewPackage as validateReviewPackage,type AnyReviewPackage as ReviewPackage} from './review-protocol.js';
import type {RecommendationReviewCase} from './review-package.js';
import type {MediaReviewCase} from './media-review-package.js';

const Id=z.string().regex(/^[A-Za-z0-9_.:@-]{1,160}$/),Sha=z.string().regex(/^[a-f0-9]{64}$/);
const Head=z.string().regex(/^[a-f0-9]{40}$/),Time=z.iso.datetime({offset:true});
const Note=z.string().trim().min(5).max(2000);
const TextEvidence=z.strictObject({evidenceId:Id,sourceId:Id,sourceRevisionId:Id,originalSha256:Sha,
  span:z.strictObject({kind:z.literal('TEXT'),sourceRevisionId:Id,paragraphId:Id,
    start:z.number().int().min(0),end:z.number().int().min(1),quote:z.string().min(1).max(20_000)})});
const Bbox=z.tuple([z.number().min(0).max(1),z.number().min(0).max(1),z.number().min(0).max(1),z.number().min(0).max(1)])
  .refine(b=>b[0]<b[2]&&b[1]<b[3]);
const ImageEvidence=z.strictObject({evidenceId:Id,sourceId:Id,sourceRevisionId:Id,originalSha256:Sha,
  span:z.strictObject({kind:z.literal('IMAGE'),sourceRevisionId:Id,originalSha256:Sha,pageIndex:z.literal(0),
    bboxNorm:Bbox,quote:z.string().min(1).max(500),coordinateSystem:z.literal('ORIGINAL_TOP_LEFT_NORMALIZED'),
    annotation:z.literal('SYNTHETIC_AUTHORED_REFERENCE')})});
const Evidence=z.union([TextEvidence,ImageEvidence]);
const RecommendationAssessment=z.strictObject({kind:z.literal('RECOMMENDATION'),relevance:z.union([z.literal(0),z.literal(1),z.literal(2)]),
  eligibility:z.enum(['ELIGIBLE','INELIGIBLE','UNKNOWN']),
  conditions:z.array(z.strictObject({evidenceId:Id,outcome:z.enum(['PASS','FAIL','UNKNOWN'])})).max(50)});
const PosterAssessment=z.strictObject({kind:z.literal('POSTER'),eligibility:z.enum(['ELIGIBLE','INELIGIBLE','UNKNOWN']),
  fields:z.array(z.strictObject({evidenceId:Id,value:z.string().max(500).nullable(),bboxNorm:Bbox})).min(1).max(20)});
const Reason=z.enum(['NOT_KNOWN_AT_ASOF','SUPERSEDED','FORKED_CHAIN','NOT_ACTIVE','CANCELLED','UNVERIFIED',
  'RESEARCH_ONLY','FUTURE_PUBLICATION','NOT_YET_VALID','EXPIRED','INVALID_TIME']);
const TemporalAssessment=z.strictObject({kind:z.literal('TEMPORAL'),currentRevisionIds:z.array(Id).max(10),
  quarantined:z.array(z.tuple([Id,Reason])).max(10)});
const Assessment=z.discriminatedUnion('kind',[RecommendationAssessment,PosterAssessment,TemporalAssessment]);
export const ReviewRecordSchema=z.strictObject({reviewId:Id,caseId:Id,caseSha256:Sha,reviewedAt:Time,
  decision:z.enum(['LABELLED','HOLD','NOT_RUN']),assessment:Assessment.nullable(),
  rationale:Note,unknownReason:Note.nullable(),evidence:z.array(Evidence).max(30),reviewEvidenceId:Id,
  amendsReviewId:Id.nullable(),correctionReason:Note.nullable(),
  anchor:z.strictObject({selected:z.boolean(),reason:Note.nullable()})});
export const ReviewPayloadSchema=z.strictObject({schemaVersion:z.literal('review-submission-v1'),gateId:z.literal('D01'),
  submissionId:Id,signatureId:Id,packageSha256:Sha,targetCommit:Head,reviewerId:Id,signedAt:Time,
  expectedLedgerHead:Sha,reviews:z.array(ReviewRecordSchema).min(1).max(200)});
const Signature=z.strictObject({algorithm:z.literal('Ed25519'),keyId:Sha,value:z.string().regex(/^[A-Za-z0-9+/]{86}==$/)});
export const SignedReviewSchema=z.strictObject({payload:ReviewPayloadSchema,signature:Signature});
export type ReviewRecord=z.infer<typeof ReviewRecordSchema>;
export type ReviewPayload=z.infer<typeof ReviewPayloadSchema>;
export type SignedReview=z.infer<typeof SignedReviewSchema>;
const Scope=z.strictObject({gateId:z.literal('D01'),packageSha256:Sha,targetCommit:Head});
const Grant=z.strictObject({reviewerId:Id,role:z.enum(['INDEPENDENT_REVIEWER','GOLD_ADJUDICATOR']),
  keyId:Sha,publicKeySpki:z.string().min(1).max(2048),scopes:z.array(Scope).min(1).max(100),
  startsAt:Time,expiresAt:Time,revokedAt:Time.nullable()});
export const AuthorityConfig=z.strictObject({schemaVersion:z.literal('reviewer-authority-v1'),
  environment:z.enum(['HUMAN_REVIEW','SYNTHETIC_TEST']),registryId:Id,approvalEvidenceId:Id,approvedBy:Id,approvedAt:Time,
  reviewers:z.array(Grant).max(100)});
type GrantValue=z.infer<typeof Grant>;
export type ReviewVerification={environment:'HUMAN_REVIEW'|'SYNTHETIC_TEST';role:GrantValue['role'];registrySha256:string;keyId:string};
export interface ReviewerAuthority {
  verify(submission:SignedReview,packet:ReviewPackage,at:string):ReviewVerification;
}
const authorityInstances=new WeakSet<object>();
function fail():never{throw new Error('Independent review validation failed');}
function instant(value:string){const parsed=Time.parse(value);return Date.parse(parsed);}
/** The pin must come from independent private operator configuration, never the
 * submission/export. This does not identify a person merely from a GitHub name.
 * No key generation, production registry or human approval is provided by this module. */
export function createReviewerAuthority(raw:unknown,expectedSha256:string):ReviewerAuthority{
  const parsed=AuthorityConfig.parse(raw);
  if(!Sha.safeParse(expectedSha256).success||hashCanonical(parsed)!==expectedSha256)fail();
  const keys=new Map<string,{grant:GrantValue;key:KeyObject}>();
  const principals=new Set<string>();
  for(const grant of parsed.reviewers){
    const bytes=Buffer.from(grant.publicKeySpki,'base64');
    if(bytes.toString('base64')!==grant.publicKeySpki||hashBytes(bytes)!==grant.keyId
      ||keys.has(grant.keyId)||principals.has(grant.reviewerId)
      ||instant(grant.startsAt)>=instant(grant.expiresAt)||grant.reviewerId===parsed.approvedBy)fail();
    const key=createPublicKey({key:bytes,format:'der',type:'spki'});if(key.asymmetricKeyType!=='ed25519')fail();
    keys.set(grant.keyId,{grant,key});principals.add(grant.reviewerId);
  }
  const authority:ReviewerAuthority={verify(rawSubmission,packet,at){
    const submission=SignedReviewSchema.parse(rawSubmission),p=submission.payload,record=keys.get(submission.signature.keyId);
    if(!record||p.reviewerId!==record.grant.reviewerId||packet.creatorRefs.includes(p.reviewerId))fail();
    const grant=record.grant,now=instant(at),signed=instant(p.signedAt);
    if(instant(parsed.approvedAt)>signed||signed>now||instant(grant.startsAt)>signed
      ||instant(grant.expiresAt)<=now||(grant.revokedAt!==null&&instant(grant.revokedAt)<=now)
      ||!grant.scopes.some(s=>s.gateId===p.gateId&&s.packageSha256===packet.packageSha256&&s.targetCommit===packet.targetCommit)
      ||p.packageSha256!==packet.packageSha256||p.targetCommit!==packet.targetCommit)fail();
    for(const review of p.reviews)if(instant(review.reviewedAt)>signed||instant(review.reviewedAt)<instant(grant.startsAt))fail();
    const signature=Buffer.from(submission.signature.value,'base64');
    if(signature.length!==64||signature.toString('base64')!==submission.signature.value
      ||!verify(null,Buffer.from(canonicalJson(p)),record.key,signature))fail();
    return {environment:parsed.environment,role:grant.role,registrySha256:expectedSha256,keyId:grant.keyId};
  }};
  authorityInstances.add(authority);return Object.freeze(authority);
}
const Entry=z.strictObject({sequence:z.number().int().positive(),previousHash:Sha,importedAt:Time,
  submission:SignedReviewSchema,entryHash:Sha});
export const ReviewLedgerSchema=z.strictObject({schemaVersion:z.literal('independent-review-ledger-v1'),packageSha256:Sha,
  targetCommit:Head,headHash:Sha,entries:z.array(Entry).max(1000)});
export type ReviewLedger=z.infer<typeof ReviewLedgerSchema>;
export function emptyReviewLedger(packet:ReviewPackage):ReviewLedger{
  const p=validateReviewPackage(packet);
  return {schemaVersion:'independent-review-ledger-v1',packageSha256:p.packageSha256,targetCommit:p.targetCommit,headHash:ZERO_HEAD,entries:[]};
}
function validateRecord(record:ReviewRecord,item:RecommendationReviewCase|MediaReviewCase,previous?:{review:ReviewRecord;reviewerId:string},reviewerId?:string,role?:ReviewVerification['role']|'UNVERIFIED_HISTORY'){
  if(record.caseSha256!==item.caseSha256)fail();
  const reference=new Map(item.evidence.map(e=>[e.evidenceId,e])),seen=new Set<string>();
  for(const evidence of record.evidence){
    const expected=reference.get(evidence.evidenceId);
    if(!expected||seen.has(evidence.evidenceId)||canonicalJson(evidence)!==canonicalJson(expected))fail();
    seen.add(evidence.evidenceId);
  }
  if(record.decision==='LABELLED'){
    if(!record.assessment||record.evidence.length===0)fail();
    const assessment=record.assessment;
    if(item.kind==='RECOMMENDATION'){
      if(assessment.kind!=='RECOMMENDATION')fail();
      const ids=assessment.conditions.map(c=>c.evidenceId),expected=item.conditions.map(c=>c.evidenceId).sort();
      if(new Set(ids).size!==ids.length||canonicalJson([...ids].sort())!==canonicalJson(expected)
        ||(assessment.eligibility==='UNKNOWN'&&record.unknownReason===null))fail();
      if(assessment.relevance!==item.draft.relevance&&record.correctionReason===null)fail();
    }else if(item.kind==='POSTER'){
      if(assessment.kind!=='POSTER')fail();
      const expected=item.reference.fields,ids=assessment.fields.map(f=>f.evidenceId);
      if(new Set(ids).size!==ids.length||canonicalJson([...ids].sort())!==canonicalJson(expected.map(f=>f.evidenceId).sort())
        ||expected.some(f=>!seen.has(f.evidenceId))||(assessment.eligibility==='UNKNOWN'&&record.unknownReason===null))fail();
      const changed=assessment.eligibility!==item.reference.expected.eligibility||assessment.fields.some(f=>{
        const original=expected.find(e=>e.evidenceId===f.evidenceId)!;
        return f.value!==original.value||canonicalJson(f.bboxNorm)!==canonicalJson(original.bboxNorm);
      });
      if(changed&&record.correctionReason===null)fail();
    }else{
      if(assessment.kind!=='TEMPORAL')fail();
      const expected=item.reference.revisions.map(r=>r.revision.revisionId).sort();
      const ids=[...assessment.currentRevisionIds,...assessment.quarantined.map(q=>q[0])];
      if(new Set(ids).size!==ids.length||canonicalJson([...ids].sort())!==canonicalJson(expected)
        ||item.evidence.some(e=>!seen.has(e.evidenceId)))fail();
      const reference=item.reference.expected,actual={currentRevisionIds:[...assessment.currentRevisionIds].sort(),
        quarantined:[...assessment.quarantined].sort()};
      if(canonicalJson(actual)!==canonicalJson(reference)&&record.correctionReason===null)fail();
    }
  }else if(record.assessment!==null||record.unknownReason===null)fail();
  if(record.anchor.selected!==Boolean(record.anchor.reason))fail();
  if(previous){
    if(record.amendsReviewId!==previous.review.reviewId||record.correctionReason===null
      ||(previous.reviewerId!==reviewerId&&role!=='GOLD_ADJUDICATOR'&&role!=='UNVERIFIED_HISTORY'))fail();
  }else if(record.amendsReviewId!==null)fail();
}
type CurrentRecord={review:ReviewRecord;reviewerId:string;verification:ReviewVerification|null;submissionId:string};
function validateLedger(raw:unknown,packet:ReviewPackage,context:{authority?:ReviewerAuthority;now:string;requireHistoricalAuthority?:boolean}){
  const p=validateReviewPackage(packet);instant(context.now);
  if(Buffer.byteLength(canonicalJson(raw),'utf8')>10*1024*1024)fail();
  const ledger=ReviewLedgerSchema.parse(raw);if(ledger.packageSha256!==p.packageSha256||ledger.targetCommit!==p.targetCommit)fail();
  const current=new Map<string,CurrentRecord>(),cases=new Map(p.cases.map(c=>[c.caseId,c]));
  const submissions=new Set<string>(),reviews=new Set<string>(),signatures=new Set<string>();let previousHash=ZERO_HEAD,priorTime=-Infinity;
  for(const [index,entry] of ledger.entries.entries()){
    const {entryHash,...body}=entry,payload=entry.submission.payload;
    if(entry.sequence!==index+1||entry.previousHash!==previousHash||entryHash!==hashCanonical(body)
      ||payload.expectedLedgerHead!==previousHash||payload.packageSha256!==p.packageSha256||payload.targetCommit!==p.targetCommit
      ||instant(entry.importedAt)<priorTime||instant(entry.importedAt)>instant(context.now)
      ||instant(payload.signedAt)>instant(entry.importedAt)||submissions.has(payload.submissionId)||signatures.has(payload.signatureId))fail();
    let verification:ReviewVerification|null=null,historical:ReviewVerification|null=null;
    if(context.authority){
      if(!authorityInstances.has(context.authority))fail();
      // A revoked/expired registry makes historical records unauthenticated for
      // the current report; the retained hash-linked history is not rewritten.
      try{historical=context.authority.verify(entry.submission,p,entry.importedAt);}catch{historical=null;}
      try{verification=context.authority.verify(entry.submission,p,context.now);}catch{verification=null;}
    }
    if(context.requireHistoricalAuthority&&!historical)fail();
    const inBatch=new Set<string>();
    for(const row of payload.reviews){
      const item=cases.get(row.caseId);
      if(!item||reviews.has(row.reviewId)||inBatch.has(row.caseId))fail();
      validateRecord(row,item,current.get(row.caseId),payload.reviewerId,historical?.role??'UNVERIFIED_HISTORY');
      current.set(row.caseId,{review:row,reviewerId:payload.reviewerId,verification,submissionId:payload.submissionId});
      reviews.add(row.reviewId);inBatch.add(row.caseId);
    }
    submissions.add(payload.submissionId);signatures.add(payload.signatureId);previousHash=entryHash;priorTime=instant(entry.importedAt);
  }
  if(ledger.headHash!==previousHash)fail();return {ledger,packet:p,current};
}
/** Canonical payload bytes are what the reviewer signs using their own external
 * Ed25519 key. This helper never creates a key or a signature. */
export function prepareReviewPayload(raw:unknown,packet:ReviewPackage):ReviewPayload{
  const p=validateReviewPackage(packet),payload=ReviewPayloadSchema.parse(raw);
  if(payload.packageSha256!==p.packageSha256||payload.targetCommit!==p.targetCommit||p.creatorRefs.includes(payload.reviewerId))fail();
  const cases=new Map(p.cases.map(c=>[c.caseId,c])),ids=new Set<string>(),caseIds=new Set<string>();
  for(const row of payload.reviews){
    const item=cases.get(row.caseId);if(!item||ids.has(row.reviewId)||caseIds.has(row.caseId)||instant(row.reviewedAt)>instant(payload.signedAt))fail();
    // Amendment lineage is checked against the retained ledger during import.
    validateRecord({...row,amendsReviewId:null},item);
    ids.add(row.reviewId);caseIds.add(row.caseId);
  }
  return payload;
}
export function importSignedReviewBatch(rawLedger:unknown,rawPacket:ReviewPackage,rawSubmission:unknown,context:{authority?:ReviewerAuthority;now:string}):ReviewLedger{
  const {ledger,packet,current}=validateLedger(rawLedger,rawPacket,{...context,requireHistoricalAuthority:true});
  if(!context.authority||!authorityInstances.has(context.authority))fail();
  const submission=SignedReviewSchema.parse(rawSubmission),payload=prepareReviewPayload(submission.payload,packet);
  const verified=context.authority.verify(submission,packet,context.now);
  const existing=ledger.entries.find(e=>e.submission.payload.submissionId===payload.submissionId);
  if(existing){if(canonicalJson(existing.submission)!==canonicalJson(submission))fail();return ledger;}
  if(payload.expectedLedgerHead!==ledger.headHash||ledger.entries.some(e=>e.submission.payload.signatureId===payload.signatureId))fail();
  const priorIds=new Set(ledger.entries.flatMap(e=>e.submission.payload.reviews.map(r=>r.reviewId)));
  for(const row of payload.reviews){
    if(priorIds.has(row.reviewId))fail();
    validateRecord(row,packet.cases.find(c=>c.caseId===row.caseId)!,current.get(row.caseId),payload.reviewerId,verified.role);
  }
  const previousTime=ledger.entries.at(-1)?.importedAt;
  if(previousTime&&instant(previousTime)>instant(context.now))fail();
  const body={sequence:ledger.entries.length+1,previousHash:ledger.headHash,importedAt:Time.parse(context.now),submission};
  const entry={...body,entryHash:hashCanonical(body)};
  return {...ledger,headHash:entry.entryHash,entries:[...ledger.entries,entry]};
}
export function inspectReviewLedger(rawLedger:unknown,packet:ReviewPackage,context:{authority?:ReviewerAuthority;now:string}){
  const valid=validateLedger(rawLedger,packet,context),human:CurrentRecord[]=[],synthetic:CurrentRecord[]=[],untrusted:CurrentRecord[]=[];
  for(const record of valid.current.values()){
    if(record.verification?.environment==='HUMAN_REVIEW')human.push(record);
    else if(record.verification?.environment==='SYNTHETIC_TEST')synthetic.push(record);
    else untrusted.push(record);
  }
  const labelled=human.filter(r=>r.review.decision==='LABELLED'),testLabelled=synthetic.filter(r=>r.review.decision==='LABELLED');
  const missing=packet.cases.filter(c=>!labelled.some(r=>r.review.caseId===c.caseId)).map(c=>c.caseId);
  return {schemaVersion:'independent-review-report-v1',gateId:'D01',packageSha256:packet.packageSha256,
    targetCommit:packet.targetCommit,ledgerHead:valid.ledger.headHash,totalCases:packet.cases.length,
    independentHumanLabelled:labelled.length,pendingHumanCases:missing.length,missingHumanCaseIds:missing,
    syntheticSignedCases:testLabelled.length,unverifiedCurrentRecords:untrusted.length,
    independentGoldReview:missing.length===0?'SIGNED_LABELS_READY_FOR_ACCEPTANCE':'PENDING',
    humanAcceptance:'NOT_ESTABLISHED',signatureMeaning:'KEY_AUTHORITY_AND_INTEGRITY_ONLY',
    agreements:packet.datasetKind==='RECOMMENDATION'?labelled.filter(r=>r.review.assessment?.kind==='RECOMMENDATION'&&
      r.review.assessment.relevance===packet.cases.find(c=>c.caseId===r.review.caseId)!.draft.relevance).length:null,
    disagreements:packet.datasetKind==='RECOMMENDATION'?labelled.filter(r=>r.review.assessment?.kind==='RECOMMENDATION'&&
      r.review.assessment.relevance!==packet.cases.find(c=>c.caseId===r.review.caseId)!.draft.relevance).length:null,
    anchorCaseIds:labelled.filter(r=>r.review.anchor.selected).map(r=>r.review.caseId).sort(),
    verifiedSyntheticRecords:testLabelled.map(r=>({caseId:r.review.caseId,reviewId:r.review.reviewId,reviewerId:r.reviewerId,
      reviewedAt:r.review.reviewedAt,reviewEvidenceId:r.review.reviewEvidenceId,assessment:r.review.assessment!})),
    verifiedHumanRecords:labelled.map(r=>({caseId:r.review.caseId,reviewId:r.review.reviewId,reviewerId:r.reviewerId,
      reviewedAt:r.review.reviewedAt,reviewEvidenceId:r.review.reviewEvidenceId,assessment:r.review.assessment!})),
  };
}
