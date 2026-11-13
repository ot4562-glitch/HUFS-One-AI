import type {Pool} from 'pg';
import {expect} from 'vitest';
import {PostgresOwnerWorkspaceStore} from '../../apps/api/src/modules/profiles/self-workspace-postgres.js';
import {PostgresSelfAccountStore} from '../../apps/api/src/modules/profiles/self-account-postgres.js';
import {PostgresRecognitionCleanupOutbox,drainProofCleanup} from '../../apps/api/src/modules/profiles/recognition-cleanup-postgres.js';
import {createProofReview,redactProofReview} from '../../packages/core/src/feature-additions/proof-review.js';
import {recognitionRule,FIXED_NOW} from '../../packages/core/src/feature-additions/v2.fixtures.js';
import {PROOF_OCR_CASES} from '../../packages/core/src/feature-additions/proof-ocr.fixtures.js';
export async function proveRecognitionCleanup(admin:Pool,owner:Pool){
  const actorId='SYN-PROOF-SQL-OWNER';
  const pool={connect:async()=>{const c=await owner.connect();return {
    query:async(sql:string,params:readonly unknown[]=[])=>({rows:(await c.query(sql,[...params])).rows}),release:()=>c.release(),
  };}};
  const accounts=new PostgresSelfAccountStore(pool,{mayAccess:async i=>i.actorId===actorId});
  const store=new PostgresOwnerWorkspaceStore(pool,{mayOperate:async i=>i.actorId===actorId});
  const outbox=new PostgresRecognitionCleanupOutbox(pool,{mayCleanup:async i=>i.actorId===actorId},()=>FIXED_NOW);
  const choices={personalStorage:true,teamReview:false,externalAi:false,ncpStorage:false,presentation:false};
  await accounts.putConsents(actorId,{expectedVersion:0,choices});
  const fixture=PROOF_OCR_CASES.find(c=>c.id==='cert')!;
  const value=createProofReview({proofId:'SYN-PROOF',activityId:'SYN-ACTIVITY',assetId:'SYN-ASSET',assetVersion:'SYN-ASSET-R1',
    assetSha256:'b'.repeat(64),scopeVersion:'a'.repeat(64),expiresAt:'2026-11-30T00:00:00Z',evidencePage:0,
    rule:recognitionRule(),asOf:FIXED_NOW,lines:fixture.lines,claimed:fixture.claimed!});
  const created=await store.create({actorId,itemId:'SYN-PROOF',value});expect(created.version).toBe(1);
  const rejected=redactProofReview(value,{action:'REJECT',asOf:FIXED_NOW});
  await store.update({actorId,kind:'RECOGNITION_PROOF',itemId:created.itemId,expectedVersion:1,value:rejected});
  expect((await outbox.list({actorId,limit:10}))).toMatchObject([{operation:'PURGE_EXTRACTION',recordVersion:2}]);
  expect(await outbox.isAssetBlocked({actorId,assetId:'SYN-ASSET'})).toBe(true);
  const stored=await store.read({actorId,kind:'RECOGNITION_PROOF',itemId:created.itemId});
  expect(JSON.stringify(stored)).not.toContain('가상미래교육재단');
  const queue=await admin.query('SELECT * FROM api_self_proof_cleanup WHERE actor_id=$1',[actorId]);
  expect(JSON.stringify(queue.rows)).not.toContain('가상미래교육재단');
  const failed=await drainProofCleanup({actorId,outbox,now:()=>FIXED_NOW,eraser:{erase:async()=>{throw Error('SYN-NOT-CONNECTED');},verifyErasure:async()=>true}});
  expect(failed).toMatchObject({acknowledged:0,failed:1});expect((await outbox.list({actorId,limit:10}))).toHaveLength(1);
  const eraser={erase:async({job}:{job:{actorId:string;assetId:string;assetVersion:string;operation:string}})=>({
    receiptId:'SYN-RECEIPT',actorId:job.actorId,assetId:job.assetId,assetVersion:job.assetVersion,operation:job.operation,
    erasedAt:FIXED_NOW,erasedComponents:['ORIGINAL_ASSET','OCR_CACHE','DERIVED_FIELDS','MODEL_INPUTS']}),verifyErasure:async()=>true};
  expect(await drainProofCleanup({actorId,outbox,now:()=>FIXED_NOW,eraser})).toMatchObject({acknowledged:1,failed:0});
  expect(await outbox.list({actorId,limit:10})).toEqual([]);expect(await outbox.isAssetBlocked({actorId,assetId:'SYN-ASSET'})).toBe(true);
  // Withdrawal enqueues full-document cleanup in the SAME transaction that removes payloads.
  await accounts.putConsents(actorId,{expectedVersion:1,choices:{...choices,personalStorage:false}});
  expect((await admin.query('SELECT count(*)::integer AS n FROM api_self_workspace_records WHERE actor_id=$1',[actorId])).rows[0].n).toBe(0);
  expect(await outbox.list({actorId,limit:10})).toMatchObject([{operation:'PURGE_DOCUMENT'}]);
  const c=await owner.connect();try{
    await c.query('BEGIN');await c.query("SELECT set_config('hufs.self_actor',$1,true)",['SYN-OTHER']);
    expect((await c.query('SELECT * FROM api_self_proof_cleanup WHERE actor_id=$1',[actorId])).rows).toEqual([]);
    await c.query('ROLLBACK');
  }finally{c.release();}
  expect(await drainProofCleanup({actorId,outbox,now:()=>FIXED_NOW,eraser})).toMatchObject({acknowledged:1,failed:0});
  expect(await outbox.list({actorId,limit:10})).toEqual([]);
  // Regrant cannot un-block the old asset; active deletes and ordinary CAS
  // tombstones also retain a purge job without retaining their candidate text.
  await accounts.putConsents(actorId,{expectedVersion:2,choices});
  expect(await outbox.isAssetBlocked({actorId,assetId:'SYN-ASSET'})).toBe(true);
  const second={...value,proofId:'SYN-PROOF-2',assetId:'SYN-ASSET-2',scopeVersion:'c'.repeat(64)};
  await store.create({actorId,itemId:second.proofId,value:second});
  await store.delete({actorId,kind:'RECOGNITION_PROOF',itemId:second.proofId,expectedVersion:1});
  const third={...value,proofId:'SYN-PROOF-3',assetId:'SYN-ASSET-3',scopeVersion:'c'.repeat(64)};
  await store.create({actorId,itemId:third.proofId,value:third});
  await accounts.putConsents(actorId,{expectedVersion:3,choices:{...choices,personalStorage:false}});
  const remaining=await outbox.list({actorId,limit:10});expect(remaining).toHaveLength(2);
  expect(remaining.map(j=>j.operation)).toEqual(['PURGE_DOCUMENT','PURGE_DOCUMENT']);
  expect(await drainProofCleanup({actorId,outbox,now:()=>FIXED_NOW,eraser})).toMatchObject({acknowledged:2,failed:0});
  const locked=await owner.connect();try{
    await locked.query('BEGIN');await locked.query("SELECT set_config('hufs.self_actor',$1,true)",[actorId]);
    await expect(locked.query("UPDATE api_self_proof_cleanup SET receipt_id='SYN-REWRITE' WHERE actor_id=$1",[actorId]))
      .rejects.toThrow();
    await locked.query('ROLLBACK');
  }finally{locked.release();}
}
