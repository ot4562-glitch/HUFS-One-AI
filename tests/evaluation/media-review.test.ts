import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {buildMediaReviewPackage} from '../../packages/core/src/evaluation/media-review-package.js';
import {buildMediaFixturePack} from '../../packages/core/src/evaluation/media-fixtures.js';
import {mediaComparisonReport} from '../../packages/core/src/evaluation/media-evaluation.js';
import {canonicalJson,hashCanonical} from '../../packages/core/src/evaluation/canonical.js';
import {createReviewerAuthority,emptyReviewLedger,inspectReviewLedger,importSignedReviewBatch} from '../../packages/core/src/evaluation/review-ledger.js';
const now='2026-11-21T12:00:00.000Z',head='f'.repeat(40);
function setup(){
 const packet=buildMediaReviewPackage({targetCommit:head}),keys=generateKeyPairSync('ed25519');
 const spki=keys.publicKey.export({type:'spki',format:'der'}),keyId=createHash('sha256').update(spki).digest('hex');
 const config={schemaVersion:'reviewer-authority-v1',environment:'SYNTHETIC_TEST',registryId:'SYN-MEDIA-AUTH',
  approvedBy:'SYN-INTEGRATOR',approvalEvidenceId:'SYN-PRIVATE-AUTH',approvedAt:'2026-11-21T00:00:00.000Z',
  reviewers:[{reviewerId:'SYN-MEDIA-REVIEWER',role:'INDEPENDENT_REVIEWER',keyId,publicKeySpki:spki.toString('base64'),
   scopes:[{gateId:'D01',packageSha256:packet.packageSha256,targetCommit:head}],startsAt:'2026-11-21T00:00:00.000Z',
   expiresAt:'2026-11-22T00:00:00.000Z',revokedAt:null}]};
 const authority=createReviewerAuthority(config,hashCanonical(config)),ledger=emptyReviewLedger(packet);
 const rows:any[]=packet.cases.map((c:any,index:number)=>({reviewId:'SYN-MEDIA-R-'+index,caseId:c.caseId,caseSha256:c.caseSha256,reviewedAt:now,
  decision:'LABELLED',assessment:c.kind==='POSTER'?{kind:'POSTER',eligibility:c.reference.expected.eligibility,
    fields:c.reference.fields.map((f:any)=>({evidenceId:f.evidenceId,value:f.value,bboxNorm:f.bboxNorm}))}:
    {kind:'TEMPORAL',currentRevisionIds:c.reference.expected.currentRevisionIds,quarantined:c.reference.expected.quarantined},
  rationale:'Synthetic protocol only, not independent reading.',unknownReason:c.kind==='POSTER'&&c.reference.expected.eligibility==='UNKNOWN'?'Unstated fixture requirement.':null,
  evidence:c.evidence,reviewEvidenceId:'SYN-MEDIA-E-'+index,amendsReviewId:null,correctionReason:null,anchor:{selected:false,reason:null}}));
 const signed=(reviews:any[])=>{const payload={schemaVersion:'review-submission-v1',gateId:'D01',submissionId:'SYN-MEDIA-SUB',signatureId:'SYN-MEDIA-SIG',
   packageSha256:packet.packageSha256,targetCommit:head,reviewerId:'SYN-MEDIA-REVIEWER',signedAt:now,expectedLedgerHead:ledger.headHash,reviews};
  return {payload,signature:{algorithm:'Ed25519',keyId,value:sign(null,Buffer.from(canonicalJson(payload)),keys.privateKey).toString('base64')}};};
 return{packet,authority,ledger,rows,signed};
}
describe('separate 20 poster + 12 temporal independent review ledger',()=>{
 it('exports 32 separately scoped cases and zero real human records',()=>{
  const x=setup();expect(x.packet.cases).toHaveLength(32);
  expect(x.packet.cases.filter((c:any)=>c.kind==='POSTER')).toHaveLength(20);
  expect(inspectReviewLedger(x.ledger,x.packet,{now})).toMatchObject({independentHumanLabelled:0,totalCases:32,pendingHumanCases:32});
 });
 it('imports real cryptographic test signatures for all 32 without treating them as human gold',()=>{
  const x=setup(),ledger=importSignedReviewBatch(x.ledger,x.packet,x.signed(x.rows),{authority:x.authority,now});
  expect(inspectReviewLedger(ledger,x.packet,{authority:x.authority,now})).toMatchObject({independentHumanLabelled:0,syntheticSignedCases:32,humanAcceptance:'NOT_ESTABLISHED'});
 });
 it('requires an explicit correction reason for changed value/bbox or temporal truth',()=>{
  const x=setup();x.rows[0].assessment.fields[0].value='CORRECTED BY REVIEWER';
  expect(()=>importSignedReviewBatch(x.ledger,x.packet,x.signed(x.rows),{authority:x.authority,now})).toThrow();
  x.rows[0].correctionReason='Re-read the exact original pixels and corrected the value.';
  expect(()=>importSignedReviewBatch(x.ledger,x.packet,x.signed(x.rows),{authority:x.authority,now})).not.toThrow();
 });
 it('refuses wrong source pixels, missing field decisions and invented revision identity',()=>{
  const x=setup(),wrong=structuredClone(x.rows);wrong[0].evidence[0].span.originalSha256='0'.repeat(64);
  expect(()=>importSignedReviewBatch(x.ledger,x.packet,x.signed(wrong),{authority:x.authority,now})).toThrow();
  const missing=structuredClone(x.rows);missing[0].assessment.fields.pop();
  expect(()=>importSignedReviewBatch(x.ledger,x.packet,x.signed(missing),{authority:x.authority,now})).toThrow();
  const invented=structuredClone(x.rows);invented[20].assessment.currentRevisionIds=['invented'];invented[20].correctionReason='Attempted unbound revision.';
  expect(()=>importSignedReviewBatch(x.ledger,x.packet,x.signed(invented),{authority:x.authority,now})).toThrow();
 });
});
describe('signed media reference consumption',()=>{
 it('keeps test signatures out of independent scoring and consumes corrections only in explicit test-reference mode',()=>{
  const x=setup(),pack=buildMediaFixturePack(),assets=new Map(pack.assets.map(a=>[a.path,a.bytes]));
  const before=x.rows[20],id=x.packet.cases[20]!.reference.id+'-R1';
  before.assessment.currentRevisionIds=[id];before.assessment.quarantined=[];
  before.correctionReason='Synthetic protocol correction tests independent reference consumption, not true gold.';
  const ledger=importSignedReviewBatch(x.ledger,x.packet,x.signed(x.rows),{authority:x.authority,now});
  const independent=mediaComparisonReport(pack.manifest,assets,[],{packet:x.packet,ledger,authority:x.authority,now,reference:'INDEPENDENT'});
  expect(independent.modes[0]!.metrics).toBeNull();expect(independent.referenceKind).toBe('INDEPENDENT_NOT_RUN');
  expect(independent.review.independentHumanLabelled).toBe(0);
  const protocol=mediaComparisonReport(pack.manifest,assets,[],{packet:x.packet,ledger,authority:x.authority,now,reference:'SYNTHETIC_TEST'});
  expect(protocol.referenceKind).toBe('SYNTHETIC_SIGNED_REFERENCE');
  expect(protocol.temporal).toMatchObject({passed:11,total:12,futureLeaks:0});
  expect(protocol.review.independentHumanLabelled).toBe(0);expect(protocol.review.syntheticSignedCases).toBe(32);
 });
});
