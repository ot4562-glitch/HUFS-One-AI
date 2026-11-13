import {afterEach,it,expect,vi} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {closedRepository} from '../../apps/api/src/repository.js';
import {recognitionRule,FIXED_NOW} from '../../packages/core/src/feature-additions/v2.fixtures.js';
import {PROOF_OCR_CASES} from '../../packages/core/src/feature-additions/proof-ocr.fixtures.js';
import {WorkspaceConflict} from '../../apps/api/src/modules/profiles/self-workspace-postgres.js';
import type {FeatureAdditions as V} from '@hufs-one/contracts';
import {confirmProofReview} from '../../packages/core/src/feature-additions/proof-review.js';
const origin='https://synthetic.invalid',actor={role:'BETA' as const,actorId:'SYN-PROOF-OWNER',sessionIdHash:'H'.repeat(32),
  csrfToken:'C'.repeat(32),betaAllowed:true,sessionExpiresAt:'2026-12-01T00:00:00Z',schoolMailProofExpiresAt:'2026-12-01T00:00:00Z'};
const apps:ReturnType<typeof createIntegratedApi>[]=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(a=>a.close()));});
function setup(connected=true){
  let now=FIXED_NOW,rights=true,actorId=actor.actorId,blocked=false,scope='SYN-CONSENT',stored:any=null;
  const rule=recognitionRule({documentGroups:[{id:'g1',join:'ALL',kinds:['CERTIFICATE']}]});
  const activity={id:'SYN-ACTIVITY',kind:'VOLUNTEER',endedAt:'2026-06-20T00:00:00Z'};
  const manualProofs:V.ActivityProof[]=[];
  const source={read:async()=>({kind:'RECOGNITION',receipt:{actorId,sourceVersion:'SYN-SOURCE',consentVersion:scope,
    rightsVersion:'SYN-RIGHTS',expiresAt:'2026-11-30T00:00:00Z'},cases:[{rule,activity,proofs:manualProofs}]}),revalidate:async()=>rights};
  const documents={list:async()=>({actorId,activityId:activity.id,consentVersion:scope,rightsVersion:'SYN-ASSET-RIGHTS',
    expiresAt:'2026-11-30T00:00:00Z',storageConsentVersion:1,ocrAllowed:true,assets:[{assetId:'SYN-ASSET',assetVersion:'SYN-ASSET-V1',assetSha256:'b'.repeat(64)}]}),
    extract:vi.fn(async()=>({evidencePage:0,lines:PROOF_OCR_CASES[0]!.lines,claimed:PROOF_OCR_CASES[0]!.claimed})),
    revalidate:async()=>rights};
  const store={list:async()=>({items:stored?[stored]:[],nextCursor:null}),read:async()=>stored,
    create:async(i:any)=>{if(stored)throw new WorkspaceConflict();stored={itemId:i.itemId,value:i.value,version:1,updatedAt:now};return stored;},
    update:async(i:any)=>{if(stored?.version!==i.expectedVersion)throw new WorkspaceConflict();
      stored={...stored,value:i.value,version:stored.version+1};if(!('candidate' in stored.value))blocked=true;return stored;}};
  const cleanup={list:async()=>[],find:async()=>stored&&!('candidate' in stored.value)?{state:'PENDING' as const,receiptId:null}:null,
    blockedProofIds:async()=>[],acknowledge:async()=>true,isAssetBlocked:async()=>blocked};
  const app=createIntegratedApi({allowedOrigin:origin,repository:closedRepository,now:()=>now,
    auth:{verifySession:async()=>({...actor,actorId}),revokeSession:async()=>{}},
    ownerInsights:{source,quota:{consume:async()=>true},...(connected?{proofReviews:{store,documents,cleanup}}:{})}});apps.push(app);
  const base='/api/owner/features/v2/recognition/'+activity.id+'/proofs';
  const page=()=>app.inject({url:base});
  const post=(path:string,payload:Record<string,unknown>)=>app.inject({method:'POST',url:base+path,headers:{origin,'x-csrf-token':actor.csrfToken},payload});
  const extract=async()=>{const p=(await page()).json();const item=p.items[0];return post('/SYN-ASSET/extract',{expectedVersion:item.version,contextVersion:item.contextVersion});};
  return {app,page,post,extract,source,documents,cleanup,store,rule,manualProofs,stored:()=>stored,setNow:(v:string)=>{now=v;},revoke:()=>{rights=false;},
    changeActor:()=>{actorId='SYN-OTHER';},changeConsent:()=>{scope='SYN-NEW-CONSENT';},block:()=>{blocked=true;}};
}
it('uses current file/rule context, explicit masking and CAS, and feeds only owner-reviewed preparation',async()=>{
  const h=setup(),p=await h.page();expect(p.statusCode,p.body).toBe(200);expect(p.json().items[0].state).toBe('AVAILABLE');
  expect(h.documents.extract).not.toHaveBeenCalled();const extracted=await h.extract();expect(extracted.statusCode,extracted.body).toBe(200);
  const item=extracted.json().item;expect(item.review.state).toBe('NEEDS_REVIEW');expect(item.review.modelInputAllowed).toBe(false);
  const change={expectedVersion:item.version,contextVersion:item.contextVersion,maskingConfirmed:true,acceptedFieldNames:['ISSUER']};
  const confirmed=await h.post('/'+item.proofId+'/confirm',change);expect(confirmed.statusCode,confirmed.body).toBe(200);
  expect(confirmed.json().item.review.candidate.fields.map((f:any)=>f.name)).toEqual(['ISSUER']);
  expect((await h.page()).json().preparation).toMatchObject({status:'READY_FOR_OFFICIAL_REVIEW',officiallyRecognized:false});
  expect((await h.post('/'+item.proofId+'/confirm',change)).statusCode).toBe(409);
});
it('retains authorized manual proofs when OCR is unavailable while refusing extraction',async()=>{
  const h=setup(),list=h.documents.list;h.documents.list=async()=>({...await list(),ocrAllowed:false});
  h.manualProofs.push({id:'SYN-MANUAL-PROOF',activityId:'SYN-ACTIVITY',kind:'CERTIFICATE',ownerReviewed:true,sourceState:'PRESENT'});
  expect((await h.page()).json().preparation).toMatchObject({status:'READY_FOR_OFFICIAL_REVIEW',checkedProofIds:['SYN-MANUAL-PROOF']});
  const insights=await h.app.inject({url:'/api/owner/features/v2/insights/RECOGNITION'});
  expect(insights.statusCode,insights.body).toBe(200);expect(insights.json().result.reports[0].status).toBe('READY_FOR_OFFICIAL_REVIEW');
  expect((await h.extract()).statusCode).toBe(403);expect(h.documents.extract).not.toHaveBeenCalled();
});
it('rejects stale source/consent bindings and clears old fields on rule change or expiry',async()=>{
  const h=setup(),item=(await h.extract()).json().item;
  h.changeConsent();expect((await h.post('/'+item.proofId+'/confirm',{expectedVersion:item.version,contextVersion:item.contextVersion,
    maskingConfirmed:true,acceptedFieldNames:[]})).statusCode).toBe(409);
  const stale=(await h.page()).json().items[0];expect(stale.state).toBe('STALE');expect(stale.review).toBeNull();
  h.setNow('2026-12-01T00:00:01Z');expect((await h.page()).statusCode).not.toBe(200);
});
it('does not extend an existing candidate lease when a later catalogue read has a longer lease',async()=>{
  const h=setup();await h.extract();const list=h.documents.list,source=h.source.read;
  h.documents.list=async()=>({...await list(),expiresAt:'2026-12-15T00:00:00Z'});
  h.source.read=async()=>{const value=await source();return {...value,receipt:{...value.receipt,expiresAt:'2026-12-15T00:00:00Z'}};};
  expect((await h.page()).json().items[0]).toMatchObject({state:'CURRENT',expiresAt:'2026-11-30T00:00:00.000Z'});
});
it('withholds a late page if document withdrawal is queued during final provider revalidation',async()=>{
  const h=setup();await h.extract();let checks=0;
  h.documents.revalidate=async()=>{if(++checks===2)h.block();return true;};
  const response=await h.page();expect(response.statusCode,response.body).toBe(403);
  expect(response.body).not.toContain('가상미래교육재단');
});
it('withholds old candidate fields when its own lease expires during a newer catalogue lease',async()=>{
  const h=setup();await h.extract();const list=h.documents.list,source=h.source.read;let checks=0;
  h.documents.list=async()=>({...await list(),expiresAt:'2026-12-15T00:00:00Z'});
  h.source.read=async()=>{const value=await source();return {...value,receipt:{...value.receipt,expiresAt:'2026-12-15T00:00:00Z'}};};
  h.documents.revalidate=async()=>{if(++checks===2)h.setNow('2026-11-30T00:00:01Z');return true;};
  const response=await h.page();expect(response.statusCode,response.body).toBe(403);expect(response.body).not.toContain('가상미래교육재단');
});
it('does not acknowledge a queued redaction when its durable outbox job is missing',async()=>{
  const h=setup(),item=(await h.extract()).json().item;h.cleanup.find=async()=>null;
  const response=await h.post('/'+item.proofId+'/redact',{expectedVersion:item.version,scopeVersion:item.recordScopeVersion,action:'REQUEST_DELETE'});
  expect(response.statusCode,response.body).toBe(503);
});
it('withholds an available/manual preparation page if its lease expires in the final outbox read',async()=>{
  const h=setup();let checks=0;h.cleanup.isAssetBlocked=async()=>{if(++checks===2)h.setNow('2026-11-30T00:00:01Z');return false;};
  h.manualProofs.push({id:'SYN-MANUAL',activityId:'SYN-ACTIVITY',kind:'CERTIFICATE',ownerReviewed:true,sourceState:'PRESENT'});
  const response=await h.page();expect(response.statusCode,response.body).toBe(403);
  expect(response.body).not.toContain('SYN-MANUAL');
});
it('withholds confirmation if a shorter catalogue lease expires during final stored-state verification',async()=>{
  const h=setup(),item=(await h.extract()).json().item,list=h.documents.list,read=h.store.read;
  h.documents.list=async()=>({...await list(),expiresAt:'2026-11-09T00:00:00Z'});
  h.store.read=async()=>{h.setNow('2026-11-09T00:00:01Z');return read();};
  const response=await h.post('/'+item.proofId+'/confirm',{expectedVersion:1,contextVersion:item.contextVersion,
    maskingConfirmed:true,acceptedFieldNames:['ISSUER']});
  expect(response.statusCode,response.body).toBe(403);expect(response.body).not.toContain('가상미래교육재단');
});
it('does not redisplay excluded fields when another tab confirms during final GET revalidation',async()=>{
  const h=setup(),item=(await h.extract()).json().item;let checks=0;
  h.documents.revalidate=async()=>{if(++checks===2)await h.store.update({expectedVersion:item.version,
    value:confirmProofReview(item.review,{rule:h.rule,scopeVersion:item.recordScopeVersion,asOf:FIXED_NOW,maskingConfirmed:true,acceptedFieldNames:['ISSUER']})});return true;};
  const response=await h.page();expect(response.statusCode,response.body).toBe(409);
  expect(response.body).not.toContain('2026-03-02');expect(h.stored().version).toBe(2);
});
it('does not return version-zero availability after a concurrent extraction creates the candidate',async()=>{
  const h=setup();let checks=0;h.documents.revalidate=async()=>{if(++checks===2)expect((await h.extract()).statusCode).toBe(200);return true;};
  const response=await h.page();expect(response.statusCode,response.body).toBe(409);expect(h.stored().version).toBe(1);
});
it('redacts after rule expiry and cannot re-extract a rejected or withdrawn asset',async()=>{
  const h=setup(),item=(await h.extract()).json().item;h.rule.source.status='REVOKED';
  const removed=await h.post('/'+item.proofId+'/redact',{expectedVersion:item.version,scopeVersion:item.recordScopeVersion,action:'WITHDRAW'});
  expect(removed.statusCode,removed.body).toBe(200);expect(removed.json().item.review).toMatchObject({state:'WITHDRAWN',cleanupState:'PENDING'});
  expect(JSON.stringify(h.stored())).not.toContain('가상미래교육재단');expect('candidate' in h.stored().value).toBe(false);
  expect((await h.page()).json().items[0].state).toBe('REDACTED');expect((await h.extract()).statusCode).not.toBe(200);
});
it('can request deletion before OCR without calling extraction and leaves external cleanup unacknowledged',async()=>{
  const h=setup(),item=(await h.page()).json().items[0];h.rule.source.status='REVOKED';
  const removed=await h.post('/'+item.proofId+'/redact',{expectedVersion:0,scopeVersion:item.contextVersion,action:'REQUEST_DELETE'});
  expect(removed.statusCode,removed.body).toBe(200);expect(removed.json().item.review).toMatchObject({state:'DELETION_PENDING'});
  expect(h.documents.extract).not.toHaveBeenCalled();
});
it('rechecks expiry/rights and blocked assets after asynchronous OCR, without storing late output',async()=>{
  for(const mode of ['REVOKE','EXPIRE','BLOCK','ACTOR'] as const){
    const h=setup();h.documents.extract.mockImplementationOnce(async()=>{if(mode==='REVOKE')h.revoke();
      if(mode==='EXPIRE')h.setNow('2026-11-30T00:00:01Z');if(mode==='BLOCK')h.block();if(mode==='ACTOR')h.changeActor();
      return {evidencePage:0,lines:PROOF_OCR_CASES[0]!.lines,claimed:PROOF_OCR_CASES[0]!.claimed};});
    expect((await h.extract()).statusCode).not.toBe(200);expect(h.stored()).toBeNull();
  }
});
it('does not invent a proof service and requires authenticated Origin/CSRF mutation',async()=>{
  const h=setup(false);expect((await h.page()).json()).toEqual({state:'NOT_CONNECTED'});
  const live=setup(),item=(await live.page()).json().items[0];
  expect((await live.app.inject({method:'POST',url:'/api/owner/features/v2/recognition/SYN-ACTIVITY/proofs/SYN-ASSET/extract',
    payload:{expectedVersion:0,contextVersion:item.contextVersion}})).statusCode).toBe(403);
});
