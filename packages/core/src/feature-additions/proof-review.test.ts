import {it,expect} from 'vitest';
import {FeatureAdditions as V} from '@hufs-one/contracts';
import {createProofReview,confirmProofReview,redactProofReview,recognitionProofFromReview} from './proof-review.js';
import {recognitionRule,FIXED_NOW} from './v2.fixtures.js';
import {PROOF_OCR_CASES} from './proof-ocr.fixtures.js';
const cert=PROOF_OCR_CASES.find(c=>c.id==='cert')!;
const rule=recognitionRule();
const context={rule,scopeVersion:'a'.repeat(64),asOf:FIXED_NOW};
function candidate(){return createProofReview({proofId:'SYN-PROOF',activityId:'SYN-ACTIVITY',assetId:'SYN-ASSET',
  assetVersion:'SYN-FILE-R1',assetSha256:'b'.repeat(64),scopeVersion:context.scopeVersion,expiresAt:'2026-11-30T00:00:00Z',
  evidencePage:0,rule,asOf:FIXED_NOW,lines:cert.lines,...(cert.claimed?{claimed:cert.claimed}:{})});}
const confirm=(value:ReturnType<typeof candidate>)=>confirmProofReview(value,{...context,maskingConfirmed:true,acceptedFieldNames:['ISSUER']});
it('creates a version-bound review candidate without any raw OCR, identity lines or model/official approval',()=>{
  const raw=candidate(),wire=V.RecognitionProofReviewSchema.parse(raw);
  expect(wire).toMatchObject({state:'NEEDS_REVIEW',ruleRevisionId:rule.source.revisionId,modelInputAllowed:false,officiallyRecognized:false});
  expect(JSON.stringify(wire)).not.toContain('lines');
  expect(recognitionProofFromReview(wire,context)).toBeUndefined();
  const privateCase=PROOF_OCR_CASES.find(c=>c.id==='volunteer')!;
  const privateReview=createProofReview({...raw,rule,asOf:FIXED_NOW,lines:privateCase.lines});
  expect(JSON.stringify(privateReview)).not.toMatch(/홍길동|202312345|2003/);
});
it('requires explicit masking review and retains only selected field values on confirmation',()=>{
  const raw=candidate();
  expect(()=>confirmProofReview(raw,{...context,maskingConfirmed:false,acceptedFieldNames:['ISSUER']})).toThrow();
  expect(()=>confirmProofReview(raw,{...context,maskingConfirmed:true,acceptedFieldNames:['SYN-UNKNOWN']})).toThrow();
  const reviewed=confirm(raw);expect(reviewed.state).toBe('OWNER_CONFIRMED_CANDIDATE');
  if(reviewed.state!=='OWNER_CONFIRMED_CANDIDATE')throw Error();
  expect(reviewed.candidate.fields.map(f=>f.name)).toEqual(['ISSUER']);
  expect(reviewed.modelInputAllowed).toBe(false);expect(reviewed.officiallyRecognized).toBe(false);
  expect(recognitionProofFromReview(reviewed,context)).toMatchObject({id:'SYN-PROOF',activityId:'SYN-ACTIVITY',
    kind:'CERTIFICATE',ownerReviewed:true,sourceState:'PRESENT'});
});
it('keeps ambiguous issuer/period and low confidence held even after owner confirmation',()=>{
  const raw=candidate();if(raw.state!=='NEEDS_REVIEW')throw Error();
  const blocked={...raw,candidate:{...raw.candidate,flags:[...raw.candidate.flags,'ISSUER_UNCERTAIN' as const]}};
  const reviewed=confirm(blocked);expect(reviewed).toMatchObject({state:'OWNER_CONFIRMED_CANDIDATE',heldForReview:true});
  expect(recognitionProofFromReview(reviewed,context)).toBeUndefined();
});
it('keeps a future issue date held even when the owner masks that date field',()=>{
  const raw=candidate(),issue=raw.candidate.fields.find(f=>f.name==='ISSUED_ON')!;
  const lines=cert.lines.map(line=>line.id===issue.lineId?{...line,text:'발급일 2026.12.25'}:line);
  const future=createProofReview({...raw,rule,asOf:FIXED_NOW,lines,...(cert.claimed?{claimed:cert.claimed}:{})});
  const reviewed=confirm(future);
  expect(reviewed.candidate.fields.map(f=>f.name)).toEqual(['ISSUER']);
  expect(reviewed).toMatchObject({heldForReview:true,candidate:{flags:expect.arrayContaining(['ISSUED_IN_FUTURE'])}});
  expect(recognitionProofFromReview(reviewed,context)).toBeUndefined();
});
it('rejects expired, corrected, revoked, wrong-scope and closed-rule confirmations',()=>{
  const raw=candidate();
  for(const patch of [{scopeVersion:'c'.repeat(64)},{asOf:'2026-12-01T00:00:00Z'},
    {rule:{...rule,source:{...rule.source,revisionId:'SYN-CORRECTED'}}},
    {rule:{...rule,source:{...rule.source,status:'REVOKED' as const}}},
    {rule:{...rule,applicationEndsAt:'2026-11-01T00:00:00Z'}}]){
    expect(()=>confirmProofReview(raw,{...context,...patch,maskingConfirmed:true,acceptedFieldNames:[]})).toThrow();
  }
});
it('purges all candidate values on reject/withdraw/delete request and requires an external deletion receipt',()=>{
  const raw=candidate();
  for(const action of ['REJECT','WITHDRAW','REQUEST_DELETE'] as const){
    const redacted=redactProofReview(raw,{action,asOf:FIXED_NOW});
    expect('candidate' in redacted).toBe(false);expect('assetSha256' in redacted).toBe(false);
    for(const field of raw.candidate.fields)expect(JSON.stringify(redacted)).not.toContain(field.value);
    expect(()=>confirmProofReview(redacted,{...context,maskingConfirmed:true,acceptedFieldNames:[]})).toThrow();
    expect(recognitionProofFromReview(redacted,context)).toBeUndefined();
  }
  const pending=redactProofReview(raw,{action:'REQUEST_DELETE',asOf:FIXED_NOW});
  expect(pending.state).toBe('DELETION_PENDING');
  expect(()=>redactProofReview(pending,{action:'ACK_DELETE',asOf:FIXED_NOW})).toThrow();
  expect(redactProofReview(pending,{action:'ACK_DELETE',asOf:FIXED_NOW,removalReceiptId:'SYN-DELETE-RECEIPT'}).state).toBe('DELETED');
  expect(()=>redactProofReview(raw,{action:'ACK_DELETE',asOf:FIXED_NOW,removalReceiptId:'SYN-WRONG'})).toThrow();
});
it('allows cleanup after rule/lease expiry but never revives a terminal document',()=>{
  const raw=candidate(),asOf='2026-12-01T00:00:00Z';
  const withdrawn=redactProofReview(raw,{action:'WITHDRAW',asOf});expect(withdrawn.state).toBe('WITHDRAWN');
  const pending=redactProofReview(withdrawn,{action:'REQUEST_DELETE',asOf});
  const deleted=redactProofReview(pending,{action:'ACK_DELETE',asOf,removalReceiptId:'SYN-DONE'});
  expect(()=>redactProofReview(deleted,{action:'REJECT',asOf})).toThrow();
});
it('validates normalized OCR identity and geometry and refuses creation without a usable rule',()=>{
  const raw=candidate();
  for(const lines of [[...cert.lines,cert.lines[0]!],[{...cert.lines[0]!,bboxNorm:[0.9,0.2,0.1,0.3] as const}]])
    expect(()=>createProofReview({...raw,rule,asOf:FIXED_NOW,lines})).toThrow();
  expect(()=>createProofReview({...raw,rule:{...rule,source:{...rule.source,status:'REVOKED'}},asOf:FIXED_NOW,lines:cert.lines})).toThrow();
});
