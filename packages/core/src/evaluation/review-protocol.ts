import {validateReviewPackage} from './review-package.js';
import {validateMediaReviewPackage,type AnyReviewPackage} from './media-review-package.js';
import {ZERO_HEAD} from './canonical.js';
export type {AnyReviewPackage} from './media-review-package.js';
export function validateAnyReviewPackage(raw:unknown):AnyReviewPackage{
  return (raw as {datasetKind?:unknown})?.datasetKind==='MEDIA_TEMPORAL'?validateMediaReviewPackage(raw):validateReviewPackage(raw);
}
export function emptyAnyReviewTemplate(raw:AnyReviewPackage){
  const p=validateAnyReviewPackage(raw);
  return {schemaVersion:'review-submission-v1',gateId:'D01',submissionId:null,signatureId:null,
    packageSha256:p.packageSha256,targetCommit:p.targetCommit,reviewerId:null,signedAt:null,expectedLedgerHead:ZERO_HEAD,
    reviews:p.cases.map(c=>({reviewId:null,caseId:c.caseId,caseSha256:c.caseSha256,reviewedAt:null,decision:'NOT_RUN',
      assessment:null,rationale:'',unknownReason:null,evidence:[],reviewEvidenceId:null,amendsReviewId:null,
      correctionReason:null,anchor:{selected:false,reason:null}}))};
}
