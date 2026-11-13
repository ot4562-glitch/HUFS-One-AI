import {it,expect} from 'vitest';
import {HufsApiClient} from '../../apps/web/src/integrations/api-client.js';
import {createProofReview,confirmProofReview,redactProofReview} from '../../packages/core/src/feature-additions/proof-review.js';
import {recognitionRule,FIXED_NOW} from '../../packages/core/src/feature-additions/v2.fixtures.js';
import {PROOF_OCR_CASES} from '../../packages/core/src/feature-additions/proof-ocr.fixtures.js';
const rule=recognitionRule(),scope='a'.repeat(64),activityId='SYN-ACTIVITY',proofId='SYN-PROOF',assetId='SYN-ASSET';
const review=createProofReview({proofId,activityId,assetId,assetVersion:'SYN-V1',assetSha256:'b'.repeat(64),scopeVersion:scope,
  storageConsentVersion:1,expiresAt:'2026-11-30T00:00:00Z',evidencePage:0,rule,asOf:FIXED_NOW,lines:PROOF_OCR_CASES[0]!.lines});
const item={proofId,activityId,assetId,assetVersion:'SYN-V1',version:1,state:'CURRENT',contextVersion:scope,recordScopeVersion:scope,
  expiresAt:review.expiresAt,review};
function harness(response:unknown){const calls:{path:string;init:RequestInit}[]=[];
  const client=new HufsApiClient(async(path,init)=>{calls.push({path,init});return new Response(JSON.stringify(path==='/api/auth/csrf'?{csrfToken:'C'.repeat(32)}:response),
    {headers:{'content-type':'application/json'}});});return {client,calls};}
it('reads owner metadata and extracts only through the explicit current-context mutation with fresh CSRF',async()=>{
  const page={state:'READY',activityId,asOf:FIXED_NOW,ruleState:'CURRENT',ocrAllowed:true,ruleRevisionId:rule.source.revisionId,expiresAt:review.expiresAt,preparation:null,items:[item]};
  const h=harness(page);expect(await h.client.owner.getOwnerRecognitionProofs(activityId)).toEqual(page);
  expect(h.calls[0]!.path).toBe('/api/owner/features/v2/recognition/'+activityId+'/proofs');
  const extracted=harness({state:'READY',item}),change={expectedVersion:0,contextVersion:scope};
  await extracted.client.owner.extractOwnerRecognitionProof(activityId,assetId,change);
  expect(extracted.calls.at(-1)).toMatchObject({path:'/api/owner/features/v2/recognition/'+activityId+'/proofs/'+assetId+'/extract',
    init:{method:'POST',body:JSON.stringify(change),headers:{'x-csrf-token':'C'.repeat(32)}}});
});
it('binds confirmation to the requested proof, exact selected fields, scope and CAS acknowledgment',async()=>{
  const confirmed=confirmProofReview(review,{rule,scopeVersion:scope,asOf:FIXED_NOW,maskingConfirmed:true,acceptedFieldNames:['ISSUER']});
  const change={expectedVersion:1,contextVersion:scope,maskingConfirmed:true as const,acceptedFieldNames:['ISSUER' as const]};
  const good={state:'READY',item:{...item,version:2,review:confirmed}};
  expect(await harness(good).client.owner.confirmOwnerRecognitionProof(activityId,proofId,change)).toEqual(good);
  for(const bad of [{...good,item:{...good.item,version:3}},
    {...good,item:{...good.item,contextVersion:'c'.repeat(64),recordScopeVersion:'c'.repeat(64),review:{...confirmed,scopeVersion:'c'.repeat(64)}}},
    {...good,item:{...good.item,review:{...confirmed,candidate:{...confirmed.candidate,fields:[]}}}}])
    await expect(harness(bad).client.owner.confirmOwnerRecognitionProof(activityId,proofId,change)).rejects.toMatchObject({code:'VERSION_CONFLICT'});
});
it('accepts only redacted matching cleanup states and cannot use generic CRUD for proofs',async()=>{
  const redacted=redactProofReview(review,{action:'REQUEST_DELETE',asOf:FIXED_NOW});
  const pending={state:'READY',item:{...item,version:2,state:'REDACTED',contextVersion:null,expiresAt:null,review:redacted}};
  const change={expectedVersion:1,scopeVersion:scope,action:'REQUEST_DELETE' as const};
  expect(await harness(pending).client.owner.redactOwnerRecognitionProof(activityId,proofId,change)).toEqual(pending);
  expect(await harness(pending).client.owner.cleanupOwnerRecognitionProof(activityId,proofId,{expectedVersion:2,scopeVersion:scope})).toEqual(pending);
  const deleted=redactProofReview(redacted,{action:'ACK_DELETE',asOf:FIXED_NOW,removalReceiptId:'SYN-DELETE'});
  const done={state:'READY',item:{...pending.item,version:3,review:deleted}};
  expect(await harness(done).client.owner.cleanupOwnerRecognitionProof(activityId,proofId,{expectedVersion:2,scopeVersion:scope})).toEqual(done);
  const h=harness({});await expect(h.client.owner.listWorkspace('RECOGNITION_PROOF')).rejects.toBeDefined();expect(h.calls).toEqual([]);
});
it('rejects another activity page and a forged cleanup result',async()=>{
  const page={state:'READY',activityId:'SYN-OTHER',asOf:FIXED_NOW,ruleState:'CURRENT',ocrAllowed:true,ruleRevisionId:rule.source.revisionId,
    expiresAt:review.expiresAt,preparation:null,items:[]};
  await expect(harness(page).client.owner.getOwnerRecognitionProofs(activityId)).rejects.toMatchObject({code:'VERSION_CONFLICT'});
  await expect(harness({state:'READY',item}).client.owner.cleanupOwnerRecognitionProof(activityId,proofId,{expectedVersion:1,scopeVersion:scope}))
    .rejects.toMatchObject({code:'VERSION_CONFLICT'});
});
it('requests a bounded post-withdrawal cleanup batch and rejects inconsistent success counts',async()=>{
  const result={state:'READY',attempted:1,acknowledged:1,failed:0,batchLimitReached:true},h=harness(result);
  expect(await h.client.owner.requestOwnerRecognitionCleanup()).toEqual(result);
  expect(h.calls.at(-1)).toMatchObject({path:'/api/owner/features/v2/recognition/cleanup',init:{method:'POST',body:'{}'}});
  await expect(harness({...result,attempted:0}).client.owner.requestOwnerRecognitionCleanup()).rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE'});
});
