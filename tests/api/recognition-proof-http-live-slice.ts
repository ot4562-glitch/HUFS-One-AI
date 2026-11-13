import type {Pool} from 'pg';
import {expect} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {closedRepository} from '../../apps/api/src/repository.js';
import {PostgresOwnerWorkspaceStore} from '../../apps/api/src/modules/profiles/self-workspace-postgres.js';
import {PostgresSelfAccountStore} from '../../apps/api/src/modules/profiles/self-account-postgres.js';
import {PostgresRecognitionCleanupOutbox} from '../../apps/api/src/modules/profiles/recognition-cleanup-postgres.js';
import {recognitionRule,FIXED_NOW} from '../../packages/core/src/feature-additions/v2.fixtures.js';
import {PROOF_OCR_CASES} from '../../packages/core/src/feature-additions/proof-ocr.fixtures.js';
export async function proveRecognitionProofHttp(admin:Pool,owner:Pool){
  const actorId='SYN-PROOF-HTTP-OWNER',activityId='SYN-ACTIVITY',assetId='SYN-HTTP-ASSET';
  const pool={connect:async()=>{const c=await owner.connect();return {release:()=>c.release(),query:async(sql:string,params:readonly unknown[]=[])=>({rows:(await c.query(sql,[...params])).rows})};}};
  const accounts=new PostgresSelfAccountStore(pool,{mayAccess:async i=>i.actorId===actorId});
  const store=new PostgresOwnerWorkspaceStore(pool,{mayOperate:async i=>i.actorId===actorId});
  const cleanup=new PostgresRecognitionCleanupOutbox(pool,{mayCleanup:async i=>i.actorId===actorId},()=>FIXED_NOW);
  const choices={personalStorage:true,teamReview:false,externalAi:false,ncpStorage:false,presentation:false};
  await accounts.putConsents(actorId,{expectedVersion:0,choices});
  const rule=recognitionRule({documentGroups:[{id:'SYN-GROUP',join:'ALL',kinds:['CERTIFICATE']}]});
  const source={read:async()=>({kind:'RECOGNITION',receipt:{actorId,sourceVersion:'SYN-SOURCE',consentVersion:'SYN-CONSENT',rightsVersion:'SYN-RIGHT',
    expiresAt:'2026-11-30T00:00:00Z'},cases:[{rule,activity:{id:activityId,kind:'VOLUNTEER'},proofs:[]}]}),revalidate:async()=>true};
  let erased=false;
  const documents={list:async()=>({actorId,activityId,consentVersion:'SYN-CONSENT',storageConsentVersion:1,rightsVersion:'SYN-ASSET-RIGHT',
    expiresAt:'2026-11-30T00:00:00Z',ocrAllowed:true,assets:erased?[]:[{assetId,assetVersion:'SYN-ASSET-V1',assetSha256:'b'.repeat(64)}]}),
    extract:async()=>({evidencePage:0,lines:PROOF_OCR_CASES[0]!.lines,claimed:PROOF_OCR_CASES[0]!.claimed}),revalidate:async()=>true};
  const eraser={erase:async(input:{job:{actorId:string;assetId:string;assetVersion:string;operation:string}})=>{
    erased=true;return {receiptId:'SYN-HTTP-ERASED',actorId,assetId,assetVersion:input.job.assetVersion,operation:input.job.operation,
      erasedAt:FIXED_NOW,erasedComponents:['ORIGINAL_ASSET','OCR_CACHE','DERIVED_FIELDS','MODEL_INPUTS']};},verifyErasure:async()=>erased};
  const origin='https://synthetic.invalid',csrfToken='C'.repeat(32);
  const app=createIntegratedApi({allowedOrigin:origin,repository:closedRepository,now:()=>FIXED_NOW,
    auth:{verifySession:async()=>({actorId,role:'BETA',betaAllowed:true,csrfToken,sessionIdHash:'H'.repeat(32),
      sessionExpiresAt:'2026-12-01T00:00:00Z',schoolMailProofExpiresAt:'2026-12-01T00:00:00Z'}),revokeSession:async()=>{}},
    ownerInsights:{source,quota:{consume:async()=>true},proofReviews:{store,cleanup,documents,eraser}}});
  const base='/api/owner/features/v2/recognition/'+activityId+'/proofs';
  const post=(path:string,payload:Record<string,unknown>)=>app.inject({method:'POST',url:base+path,headers:{origin,'x-csrf-token':csrfToken},payload});
  try{
    const page=await app.inject({url:base});expect(page.statusCode,page.body).toBe(200);const available=page.json().items[0];
    const extracted=await post('/'+assetId+'/extract',{expectedVersion:0,contextVersion:available.contextVersion});expect(extracted.statusCode,extracted.body).toBe(200);
    const draft=extracted.json().item;
    const confirmed=await post('/'+draft.proofId+'/confirm',{expectedVersion:1,contextVersion:draft.contextVersion,maskingConfirmed:true,acceptedFieldNames:['ISSUER']});
    expect(confirmed.statusCode,confirmed.body).toBe(200);
    expect((await app.inject({url:'/api/owner/features/v2/insights/RECOGNITION'})).json().result.reports[0])
      .toMatchObject({status:'READY_FOR_OFFICIAL_REVIEW',officiallyRecognized:false,checkedProofIds:[draft.proofId]});
    const pending=await post('/'+draft.proofId+'/redact',{expectedVersion:2,scopeVersion:draft.recordScopeVersion,action:'REQUEST_DELETE'});
    expect(pending.statusCode,pending.body).toBe(200);expect(pending.json().item.review.state).toBe('DELETION_PENDING');
    const queued=await cleanup.list({actorId,limit:10});expect(queued).toHaveLength(1);
    const done=await post('/'+draft.proofId+'/cleanup',{expectedVersion:3,scopeVersion:draft.recordScopeVersion});
    expect(done.statusCode,done.body).toBe(200);expect(done.json().item).toMatchObject({version:4,review:{state:'DELETED',cleanupState:'ACKNOWLEDGED'}});
    expect(await cleanup.list({actorId,limit:10})).toEqual([]);expect(await cleanup.isAssetBlocked({actorId,assetId})).toBe(true);
    const records=await admin.query('SELECT value_json FROM api_self_workspace_records WHERE actor_id=$1',[actorId]);
    expect(JSON.stringify(records.rows)).not.toContain('가상미래교육재단');
    expect((await app.inject({url:base})).json().items[0].review.state).toBe('DELETED');
    await accounts.putConsents(actorId,{expectedVersion:1,choices:{...choices,personalStorage:false}});
    expect((await app.inject({url:base})).statusCode).toBe(403);
    const batch=await app.inject({method:'POST',url:'/api/owner/features/v2/recognition/cleanup',headers:{origin,'x-csrf-token':csrfToken},payload:{}});
    expect(batch.statusCode,batch.body).toBe(200);expect(batch.json().acknowledged).toBe(1);
  }finally{await app.close();}
}
