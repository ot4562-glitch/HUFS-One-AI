import {createHash} from 'node:crypto';
import type {Pool} from 'pg';
import {expect} from 'vitest';
import {PostgresSourceRevisionWriter} from '../../apps/api/src/modules/opportunities/temporal-writer-postgres.js';
import {hashRevisionParagraphs} from '../../apps/api/src/modules/opportunities/revision-ledger.js';
import {syntheticSourceRuntimeVersion} from './fixtures/source-runtime-version.js';
/** Same synthetic actual-SQL proof on PGlite and disposable native PG. */
export async function proveSourceRuntimeReceipts(admin:Pool,reader:Pool){
  const pool={connect:async()=>{const c=await admin.connect();return {
    query:async(sql:string,params:readonly unknown[]=[])=>({rows:(await c.query(sql,[...params])).rows}),release:()=>c.release(),
  };}};
  const writer=new PostgresSourceRevisionWriter(pool),bytes=Buffer.from('SYNTHETIC runtime evidence');
  const paragraphs=[{id:'p1',text:bytes.toString()}],time=Date.now()-60000,T=(offset:number)=>new Date(time+offset).toISOString();
  const r={sourceId:'SYN-RUNTIME-PG',revisionId:'SYN-RUNTIME-PG-1',permissionRef:'SYN-RUNTIME-PERM',
    originalSha256:createHash('sha256').update(bytes).digest('hex'),contentSha256:hashRevisionParagraphs(paragraphs),
    sourceClass:'SYNTHETIC',provenance:'SYNTHETIC',mediaKind:'TEXT',status:'NEEDS_REVIEW',changeKind:'NEW',
    fetchedAt:T(0),lastCheckedAt:T(0),topicCodes:[]};
  const runtime=syntheticSourceRuntimeVersion().expected;
  await writer.append({revision:r,paragraphs,originalBytes:bytes,permissionReviewed:true,runtimeManifest:runtime});
  for(const [offset,status] of [[1000,200],[2000,304]] as const)
    await writer.observeUnchanged({sourceId:r.sourceId,revisionId:r.revisionId,checkedAt:T(offset),responseStatus:status,
      runtimeManifest:{...runtime,gitSha:status===304?'c'.repeat(40):runtime.gitSha}});
  const receipts=await admin.query('SELECT event_kind,response_status,manifest FROM source_ingest_runtime_receipts WHERE source_id=$1 ORDER BY checked_at',[r.sourceId]);
  expect(receipts.rows.map(row=>[row.event_kind,row.response_status,row.manifest.gitSha]))
    .toEqual([['REVISION',200,runtime.gitSha],['OBSERVATION',200,runtime.gitSha],['OBSERVATION',304,'c'.repeat(40)]]);
  await expect(reader.query('SELECT manifest FROM source_ingest_runtime_receipts')).rejects.toThrow();
  for(const sql of ['UPDATE source_ingest_runtime_receipts SET manifest=manifest',
    'DELETE FROM source_ingest_runtime_receipts','TRUNCATE source_ingest_runtime_receipts'])
    await expect(admin.query(sql)).rejects.toThrow('Immutable source runtime receipt');
  const insert=`INSERT INTO source_ingest_runtime_receipts(source_id,revision_id,checked_at,event_kind,response_status,manifest)
    VALUES($1,$2,$3,$4,$5,$6::jsonb)`;
  const legacy={...r,sourceId:'SYN-RUNTIME-VALIDATION',revisionId:'SYN-RUNTIME-VALIDATION-1'};
  await writer.append({revision:legacy,paragraphs,originalBytes:bytes,permissionReviewed:true});
  for(const manifest of [{}, {...runtime,gitSha:undefined},{...runtime,schemaVersion:1.5},{...runtime,extra:'not-allowed'}])
    await expect(admin.query(insert,[legacy.sourceId,legacy.revisionId,T(0),'REVISION',200,JSON.stringify(manifest)])).rejects.toThrow();
  expect((await admin.query('SELECT count(*)::integer AS n FROM source_ingest_runtime_receipts WHERE source_id=$1',[legacy.sourceId])).rows[0].n).toBe(0);
  await admin.query(insert,[legacy.sourceId,legacy.revisionId,T(0),'REVISION',200,JSON.stringify(runtime)]);
  await expect(admin.query(insert,[r.sourceId,r.revisionId,T(5000),'OBSERVATION',304,JSON.stringify(runtime)]))
    .rejects.toThrow('Source runtime receipt is not bound');
  await expect(admin.query(insert,['SYN-FOREIGN',r.revisionId,T(0),'REVISION',200,JSON.stringify(runtime)]))
    .rejects.toThrow('Source runtime receipt is not bound');
  // A privileged accidental invalid receipt must roll back its observation/head.
  await admin.query(`CREATE FUNCTION synthetic_fail_runtime_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'SYNTHETIC receipt unavailable'; END; $$`);
  await admin.query(`CREATE TRIGGER synthetic_runtime_failure BEFORE INSERT ON source_ingest_runtime_receipts
    FOR EACH ROW EXECUTE FUNCTION synthetic_fail_runtime_receipt()`);
  try{
    await expect(writer.observeUnchanged({sourceId:r.sourceId,revisionId:r.revisionId,checkedAt:T(3000),responseStatus:200,runtimeManifest:runtime}))
      .rejects.toThrow('SYNTHETIC receipt unavailable');
    expect((await admin.query('SELECT count(*)::integer AS n FROM source_check_observations WHERE source_id=$1',[r.sourceId])).rows[0].n).toBe(2);
    const head=(await admin.query('SELECT last_checked_at FROM source_ingest_heads WHERE source_id=$1',[r.sourceId])).rows[0];
    expect(new Date(head.last_checked_at).toISOString()).toBe(T(2000));
    const next={...r,sourceId:'SYN-RUNTIME-ROLLBACK',revisionId:'SYN-RUNTIME-ROLLBACK-1'};
    await expect(writer.append({revision:next,paragraphs,originalBytes:bytes,permissionReviewed:true,runtimeManifest:runtime}))
      .rejects.toThrow('SYNTHETIC receipt unavailable');
    expect((await admin.query('SELECT count(*)::integer AS n FROM source_revisions_vnext WHERE revision_id=$1',[next.revisionId])).rows[0].n).toBe(0);
  }finally{
    await admin.query('DROP TRIGGER synthetic_runtime_failure ON source_ingest_runtime_receipts');
    await admin.query('DROP FUNCTION synthetic_fail_runtime_receipt()');
  }
}
