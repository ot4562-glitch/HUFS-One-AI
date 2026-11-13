import {expect} from 'vitest';
import type {Pool} from 'pg';
import {createHash} from 'node:crypto';
import {PostgresRecognitionPrivateAssets} from '../../apps/api/src/modules/profiles/recognition-private-assets-postgres.js';
import {PostgresSelfAccountStore} from '../../apps/api/src/modules/profiles/self-account-postgres.js';
import {PostgresOwnerWorkspaceStore} from '../../apps/api/src/modules/profiles/self-workspace-postgres.js';
import {createMaskedRecognitionPng} from '../../apps/api/src/modules/recognition-private-preview.js';
import {createProofReview,redactProofReview} from '../../packages/core/src/feature-additions/proof-review.js';
import {recognitionRule} from '../../packages/core/src/feature-additions/v2.fixtures.js';
import {PROOF_OCR_CASES} from '../../packages/core/src/feature-additions/proof-ocr.fixtures.js';

export async function proveRecognitionPrivateAssets(admin:Pool,owner:Pool){
  const actorId='SYN-ORIGINAL-OWNER',otherActor='SYN-ORIGINAL-OTHER',activityId='SYN-ORIGINAL-ACTIVITY';
  const pool={connect:async()=>{const c=await owner.connect();return {query:async(sql:string,params:readonly unknown[]=[])=>({rows:(await c.query(sql,[...params])).rows}),release:()=>c.release()};}};
  const now=()=>new Date().toISOString(),expiresAt=new Date(Date.now()+120_000).toISOString();let epoch=1,rights=true;
  const accounts=new PostgresSelfAccountStore(pool,{mayAccess:async()=>true});
  const choices={personalStorage:true,teamReview:false,externalAi:false,ncpStorage:false,presentation:false};
  await accounts.putConsents(actorId,{expectedVersion:0,choices});await accounts.putConsents(otherActor,{expectedVersion:0,choices});
  const original=createMaskedRecognitionPng({width:4,height:3,rgba:new Uint8Array(48).fill(80)},[]).png;
  const sha256=createHash('sha256').update(original).digest('hex');
  const changed=createMaskedRecognitionPng({width:4,height:3,rgba:new Uint8Array(48).fill(81)},[]).png;
  const allowedHashes=new Set([sha256,createHash('sha256').update(changed).digest('hex')]);
  const authority={grant:async(i:{actorId:string;activityId:string})=>({actorId:i.actorId,activityId:i.activityId,
    storageConsentVersion:i.actorId===actorId?epoch:1,consentVersion:'SYN-CONSENT',rightsVersion:'SYN-RIGHTS',expiresAt}),
    revalidate:async()=>rights,mayErase:async()=>rights};
  const inspector={inspect:async(i:{sha256:string;mimeType:string})=>{
    expect(allowedHashes.has(i.sha256)).toBe(true);return {state:'CLEAN',sha256:i.sha256,mimeType:i.mimeType,receiptId:'SYN-SCAN',
      inspectorVersion:'SYN-ONLY-KNOWN-FIXTURE',inspectedAt:now(),expiresAt};
  }};
  const assets=new PostgresRecognitionPrivateAssets(pool,authority,inspector,now);
  const command=async(n:number)=>({actorId,activityId,requestId:`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,
    contextVersion:(await assets.policy({actorId,activityId})).contextVersion,mimeType:'image/png' as const,bytes:original});
  const firstCommand=await command(1),first=await assets.intake(firstCommand);
  expect(first).toMatchObject({activityId,sha256,provenance:'OWNER_UPLOADED_UNVERIFIED',modelInputAllowed:false,officiallyRecognized:false});
  expect(await assets.intake(firstCommand)).toEqual(first);
  await expect(assets.intake({...firstCommand,bytes:changed})).rejects.toThrow('request changed');
  expect((await assets.list({actorId,activityId})).items).toEqual([first]);
  expect((await assets.readOriginal({...first,actorId})).bytes).toEqual(original);
  expect((await assets.list({actorId:otherActor,activityId})).items).toEqual([]);
  await expect(assets.readOriginal({...first,actorId:otherActor})).rejects.toThrow();
  await expect(assets.erase({...first,actorId:otherActor})).rejects.toThrow();
  const c=await owner.connect();try{
    await c.query('BEGIN');await c.query("SELECT set_config('hufs.self_actor',$1,true)",[otherActor]);
    expect((await c.query('SELECT asset_id FROM api_self_recognition_assets WHERE actor_id=$1',[actorId])).rows).toEqual([]);
    await expect(c.query("UPDATE api_self_recognition_assets SET state='ERASED'")).rejects.toThrow();
    await c.query('ROLLBACK');
  }finally{c.release();}
  // Consent withdrawal before any OCR must erase bytes AND enqueue a job.
  await accounts.putConsents(actorId,{expectedVersion:1,choices:{...choices,personalStorage:false}});epoch=2;
  expect((await admin.query('SELECT state,raw_bytes,original_sha256,mime_type,inspection_receipt FROM api_self_recognition_assets WHERE actor_id=$1',[actorId])).rows)
    .toEqual([{state:'ERASED',raw_bytes:null,original_sha256:null,mime_type:null,inspection_receipt:null}]);
  expect((await admin.query('SELECT operation,status FROM api_self_proof_cleanup WHERE actor_id=$1 AND asset_id=$2',[actorId,first.assetId])).rows)
    .toEqual([{operation:'PURGE_DOCUMENT',status:'PENDING'}]);
  await expect(assets.readOriginal({...first,actorId})).rejects.toThrow();
  expect(await assets.erase({...first,actorId})).toMatchObject({state:'ERASURE_PENDING',originalErased:true});
  await accounts.putConsents(actorId,{expectedVersion:2,choices});epoch=3;
  await expect(assets.intake(firstCommand)).rejects.toThrow();
  await expect(assets.intake({...firstCommand,contextVersion:(await assets.policy({actorId,activityId})).contextVersion})).rejects.toThrow();
  // A stale grant is rejected by the SQL consent epoch, even when the external
  // authority incorrectly continues returning true from revalidate.
  epoch=1;await expect(assets.intake({...firstCommand,requestId:'00000000-0000-4000-8000-000000000002'})).rejects.toThrow();epoch=3;
  const second=await assets.intake(await command(2));
  const workspaces=new PostgresOwnerWorkspaceStore(pool,{mayOperate:async()=>true},now);
  const fixture=PROOF_OCR_CASES.find(x=>x.id==='cert')!;
  const value=createProofReview({proofId:second.proofId,assetId:second.assetId,assetVersion:second.assetVersion,assetSha256:second.sha256,
    activityId,scopeVersion:'a'.repeat(64),storageConsentVersion:3,expiresAt,evidencePage:0,rule:recognitionRule(),asOf:now(),
    lines:fixture.lines,claimed:fixture.claimed!});
  const saved=await workspaces.create({actorId,itemId:second.proofId,value});
  // The existing proof redaction path must erase the new original in the SAME transaction.
  await workspaces.update({actorId,kind:'RECOGNITION_PROOF',itemId:second.proofId,expectedVersion:saved.version,
    value:redactProofReview(value,{action:'REQUEST_DELETE',asOf:now()})});
  expect((await admin.query('SELECT state,raw_bytes FROM api_self_recognition_assets WHERE actor_id=$1 AND asset_id=$2',[actorId,second.assetId])).rows)
    .toEqual([{state:'ERASED',raw_bytes:null}]);
  // Direct asset erasure destroys an existing candidate, not just its original.
  const third=await assets.intake(await command(3));
  await workspaces.create({actorId,itemId:third.proofId,value:{...value,proofId:third.proofId,assetId:third.assetId}});
  await assets.erase({...third,actorId});
  expect(await workspaces.read({actorId,kind:'RECOGNITION_PROOF',itemId:third.proofId})).toBeNull();
  expect((await admin.query('SELECT status FROM api_self_proof_cleanup WHERE actor_id=$1 AND asset_id=$2',[actorId,third.assetId])).rows)
    .toEqual([{status:'PENDING'}]);
  for(let n=4;n<=13;n++)await assets.intake(await command(n));
  await expect(assets.intake(await command(14))).rejects.toThrow('storage limit');
  rights=false;await expect(assets.list({actorId,activityId})).rejects.toThrow();rights=true;
  // Any further consent version update invalidates old upload requests without
  // reviving withdrawn originals. Uninterrupted storage may read surviving files.
  await accounts.putConsents(actorId,{expectedVersion:3,choices:{...choices,teamReview:true}});epoch=4;
  expect((await assets.list({actorId,activityId})).items).toHaveLength(10);
  await accounts.putConsents(actorId,{expectedVersion:4,choices:{...choices,personalStorage:false}});epoch=5;
  expect((await admin.query("SELECT count(*)::int AS live FROM api_self_recognition_assets WHERE actor_id=$1 AND state='LIVE'",[actorId])).rows)
    .toEqual([{live:0}]);
  expect((await admin.query('SELECT count(*)::int AS jobs FROM api_self_proof_cleanup WHERE actor_id=$1',[actorId])).rows[0]?.jobs).toBe(13);
}
