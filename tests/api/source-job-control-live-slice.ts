import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import {expect} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {createPostgresPlatformServices} from '../../apps/api/src/platform-postgres.js';
import {PostgresApprovedSourceRightsResolver} from '../../apps/api/src/modules/opportunities/rights-postgres.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';

/** Runs only after the parent verifies fresh isolated DB and migrations. */
export async function proveSourceJobControlPg(options:{admin:Pool;url:URL;password:string;adapter:(pool:Pool)=>ReviewerSqlPool}){
  const {admin,adapter}=options;
  if(!/^[a-f0-9]{48}$/.test(options.password))throw new Error('Synthetic role credential required');
  await admin.query(`CREATE ROLE hufs_test_source_control LOGIN PASSWORD '${options.password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    GRANT USAGE ON SCHEMA public TO hufs_test_source_control;
    GRANT SELECT,INSERT,UPDATE ON source_ingest_jobs TO hufs_test_source_control;
    GRANT SELECT ON source_rights_receipts,source_rights_revocations TO hufs_test_source_control;`);
  const target=new URL(options.url);target.username='hufs_test_source_control';target.password=options.password;
  const pool=new Pool({connectionString:target.toString(),ssl:false,max:4,connectionTimeoutMillis:3000,statement_timeout:5000});
  let app:ReturnType<typeof createIntegratedApi>|undefined;
  try{
    const actorId='SYN-JOB-OPERATOR',sourceId='SYN-JOB-SOURCE',permissionRef='SYN-JOB-PERM',revisionId='SYN-JOB-DRAFT';
    const before=new Date(Date.now()-60_000).toISOString(),expires=new Date(Date.now()+3_600_000).toISOString(),now=()=>new Date().toISOString();
    await admin.query(`INSERT INTO source_rights_receipts(receipt_id,actor_id,source_id,permission_ref,canonical_url,purposes,reviewed_by,reviewed_at,starts_at,expires_at,policy_version)
      VALUES('SYN-JOB-RIGHTS',$1,$2,$3,'https://synthetic.invalid/ingestion',ARRAY['COLLECT','STORE'],'SYN-INDEPENDENT-OPERATOR',$4,$4,$5,'SYN-JOB-POLICY')`,
    [actorId,sourceId,permissionRef,before,expires]);
    const sql=adapter(pool),resolver=new PostgresApprovedSourceRightsResolver(sql,{actorId,now});
    let operatorAllowed=true,calls=0;
    const token=randomBytes(32).toString('hex'),origin='https://synthetic.invalid';
    const actor={actorId,role:'BETA' as const,sessionIdHash:token,csrfToken:token,betaAllowed:true,sessionExpiresAt:expires,schoolMailProofExpiresAt:expires};
    let identity:typeof actor|null=actor;
    const services=createPostgresPlatformServices({pools:{projections:sql,calendar:sql,personal:sql,evidence:sql},evidenceRights:{resolveFor:async()=>null},now,
      sourceIngestionOperator:{mayManage:async input=>operatorAllowed&&input.actorId===actorId&&input.sourceId===sourceId&&input.permissionRef===permissionRef},
      sourceIngestion:{pool:sql,authority:{mayProcess:async input=>{
        if(input.actorRef!==actorId)return false;const grant=await resolver.resolve(input);
        return grant?.status==='APPROVED'&&grant.allowedPurposes.has('COLLECT')&&grant.allowedPurposes.has('STORE');
      }},executor:{execute:async()=>{
        calls++;await admin.query(`INSERT INTO source_revisions_vnext(revision_id,source_id,original_sha256,content_sha256,media_kind,source_class,
          permission_ref,provenance,status,change_kind,fetched_at,last_checked_at) VALUES($1,$2,repeat('a',64),repeat('b',64),'TEXT','SYNTHETIC',$3,
          'SYNTHETIC','NEEDS_REVIEW','NEW',clock_timestamp(),clock_timestamp())`,[revisionId,sourceId,permissionRef]);
        return {kind:'NEW_DRAFT',revisionId};
      }}}});
    const active=createIntegratedApi({allowedOrigin:origin,...services,now,auth:{verifySession:async()=>identity,revokeSession:async()=>{}}});app=active;
    const headers={origin,'x-csrf-token':token};
    const enqueue=async(requestKey:string)=>active.inject({method:'POST',url:'/api/operator/source-jobs',headers,payload:{sourceId,permissionRef,requestKey}});
    const path=(jobId:string)=>`/api/operator/source-jobs/${jobId}?sourceId=${sourceId}&permissionRef=${permissionRef}`;
    const accepted=await enqueue('SYN-JOB-1');expect(accepted.statusCode,accepted.body).toBe(202);const jobId=accepted.json().jobId;
    const duplicate=await enqueue('SYN-JOB-1');expect(duplicate.statusCode,duplicate.body).toBe(200);expect(duplicate.json()).toEqual({jobId,created:false});
    const pending=await active.inject({url:path(jobId)});expect(pending.statusCode,pending.body).toBe(200);
    expect(pending.json()).toMatchObject({state:'PENDING',attemptCount:0,requiresOperatorReview:false});expect(calls).toBe(0);
    expect(await services.sourceIngestion!.runOne()).toEqual({jobId,state:'NEW_DRAFT'});expect(calls).toBe(1);
    const result=await active.inject({url:path(jobId)});expect(result.statusCode,result.body).toBe(200);
    expect(result.json()).toMatchObject({jobId,state:'NEW_DRAFT',attemptCount:1,outcomeRevisionId:revisionId,requiresOperatorReview:false});
    expect(result.body).not.toMatch(/actor_ref|actorRef|lease_token|leaseToken|requestKey|canonicalUrl/);
    await active.close();app=undefined;
    // The two replacement processes use the built API and no callable worker.
    const childUrl=new URL(target);childUrl.hostname='127.0.0.1';
    for(let restart=0;restart<2;restart++){
      const child=spawn(process.execPath,[fileURLToPath(new URL('./fixtures/source-job-pg-server.mjs',import.meta.url))],{
        windowsHide:true,stdio:['ignore','ignore','ignore','ipc'],env:{SystemRoot:process.env.SystemRoot,PATH:process.env.PATH,
          HUFS_SYN_JOB_FIXTURE:'1',HUFS_SYN_JOB_URL:childUrl.toString(),HUFS_SYN_JOB_TOKEN:token,HUFS_SYN_JOB_EXPIRES:expires}});
      let exited=false;const exit=new Promise<void>(resolve=>child.once('close',()=>{exited=true;resolve();}));
      const ready=new Promise<number>((resolve,reject)=>{child.once('error',()=>reject(new Error('Synthetic source-control launch failed')));
        child.once('close',()=>reject(new Error('Synthetic source-control process exited')));
        child.once('message',(message:any)=>Number.isInteger(message?.port)?resolve(message.port):reject(new Error('Synthetic source-control unavailable')));});
      const timeout=setTimeout(()=>child.kill(),15000);
      try{
        const port=await ready,url=`http://127.0.0.1:${port}${path(jobId)}`;
        expect((await fetch(url,{signal:AbortSignal.timeout(5000)})).status).toBe(401);
        const response=await fetch(url,{headers:{cookie:`synthetic_session=${token}`},signal:AbortSignal.timeout(5000)});
        expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');
        expect(await response.json()).toMatchObject({jobId,state:'NEW_DRAFT',attemptCount:1,outcomeRevisionId:revisionId});
      }finally{if(!exited&&child.connected)child.send('STOP');await exit;clearTimeout(timeout);}
    }
    const resumed=createIntegratedApi({allowedOrigin:origin,...services,now,auth:{verifySession:async()=>identity,revokeSession:async()=>{}}});app=resumed;
    const blocked=await resumed.inject({method:'POST',url:'/api/operator/source-jobs',headers,payload:{sourceId,permissionRef,requestKey:'SYN-JOB-2'}});
    expect(blocked.statusCode,blocked.body).toBe(202);operatorAllowed=false;
    expect(await services.sourceIngestion!.runOne()).toEqual({jobId:blocked.json().jobId,state:'BLOCKED_RIGHTS'});expect(calls).toBe(1);
    expect((await resumed.inject({url:path(jobId)})).statusCode).toBe(403);operatorAllowed=true;
    identity={...actor,actorId:'SYN-FOREIGN'};expect((await resumed.inject({url:path(jobId)})).statusCode).toBe(403);identity=actor;
    const uncertain=await resumed.inject({method:'POST',url:'/api/operator/source-jobs',headers,payload:{sourceId,permissionRef,requestKey:'SYN-JOB-3'}});
    expect(uncertain.statusCode,uncertain.body).toBe(202);const unknownId=uncertain.json().jobId;
    await admin.query(`UPDATE source_ingest_jobs SET state='LEASED',attempt_count=1,lease_token=gen_random_uuid(),
      lease_until=clock_timestamp()-interval '5 seconds',updated_at=clock_timestamp() WHERE job_id=$1`,[unknownId]);
    const expired=await resumed.inject({url:path(unknownId)});expect(expired.statusCode,expired.body).toBe(200);
    expect(expired.json()).toMatchObject({state:'LEASED',requiresOperatorReview:true});
    expect(await services.sourceIngestion!.runOne()).toEqual({state:'IDLE'});expect(calls).toBe(1);
    expect((await resumed.inject({url:path(unknownId)})).json()).toMatchObject({state:'NEEDS_REVIEW',lastErrorCode:'UNKNOWN_COMPLETION',requiresOperatorReview:true});
    await admin.query("INSERT INTO source_rights_revocations(receipt_id,revoked_by,revoked_at,reason_ref) VALUES('SYN-JOB-RIGHTS','SYN-OPERATOR',clock_timestamp(),'SYN-REVOKED')");
    expect((await resumed.inject({url:path(jobId)})).statusCode).toBe(403);
    expect((await resumed.inject({method:'POST',url:'/api/operator/source-jobs',headers,payload:{sourceId,permissionRef,requestKey:'SYN-JOB-4'}})).statusCode).toBe(403);
    await expect(pool.query('SELECT original_bytes FROM source_originals_vnext')).rejects.toMatchObject({code:'42501'});
    expect(calls).toBe(1);
  }finally{await app?.close();await pool.end();}
}
