// Explicit disposable PostgreSQL 18 fixture. No original data or retained dump.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {readFile,writeFile,mkdtemp,unlink,rmdir} from 'node:fs/promises';
import {join,isAbsolute,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {Pool} from 'pg';
import {createPostgresRecoveryDrill} from '../../../dist/apps/api/src/db/postgres-recovery-drill.js';
import {createNativeRecoveryTransfer,recoveryTransferPolicySha256} from '../../../dist/apps/api/src/db/postgres-recovery-process.js';

if(process.argv[2]!=='--synthetic'||process.env.HUFS_RECOVERY_LIVE!=='1')throw new Error('Explicit synthetic recovery opt-in required');
const raw=process.env.HUFS_RECOVERY_ADMIN_URL??'',url=new URL(raw),bin=process.env.HUFS_RECOVERY_BIN??'';
if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!=='127.0.0.1'||url.pathname!=='/postgres'||url.hash||url.search
  ||!['5432','55448'].includes(url.port||'5432')||!isAbsolute(bin))throw new Error('Isolated recovery PostgreSQL required');
const sourceName='hufs_recovery_source_test',targets=['hufs_recovery_target_test','hufs_recovery_revoked_test','hufs_recovery_limit_test','hufs_recovery_nonempty_test','hufs_recovery_authfail_test'];
const sourceRole='hufs_recovery_source_role',targetRole='hufs_recovery_target_role';
const sourcePassword=randomBytes(24).toString('hex'),targetPassword=randomBytes(24).toString('hex');
const allPools=[],children=[];let folder,passFile,badFile,stage='START',sqlState;
const usePool=target=>{const p=new Pool({connectionString:target.toString(),ssl:false,max:4,connectionTimeoutMillis:3000,statement_timeout:15000});allPools.push(p);return p;};
const admin=usePool(url);
const adapt=pool=>({connect:async()=>{const c=await pool.connect();return {query:async(sql,args=[])=>{
  try{const result=await c.query(sql,[...args]);return {rows:Array.isArray(result)?[]:result.rows};}
  catch(error){sqlState=/^[A-Z0-9]{5}$/.test(error?.code??'')?error.code:undefined;throw error;}
},release:error=>c.release(error)};}});
const rolePool=(database,role,password)=>{const selected=new URL(url);selected.pathname='/'+database;selected.username=role;selected.password=password;return usePool(selected);};
const pins=async name=>{const path=join(bin,name+(process.platform==='win32'?'.exe':''));return {path,sha256:createHash('sha256').update(await readFile(path)).digest('hex')};};
try{
  stage='FRESH_DATABASE_GUARD';const existing=await admin.query('SELECT datname FROM pg_database WHERE datname=ANY($1::text[])',[[sourceName,...targets]]);
  assert.equal(existing.rows.length,0,'Recovery fixture never resets an existing database');
  await admin.query(`CREATE ROLE ${sourceRole} LOGIN PASSWORD '${sourcePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;
    CREATE ROLE ${targetRole} LOGIN PASSWORD '${targetPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;`);
  await admin.query(`CREATE DATABASE ${sourceName} OWNER ${sourceRole}`);
  for(const database of targets){await admin.query(`CREATE DATABASE ${database} OWNER ${targetRole}`);await admin.query(`REVOKE CONNECT ON DATABASE ${database} FROM PUBLIC`);}
  const source=rolePool(sourceName,sourceRole,sourcePassword),targetPools=targets.map(name=>rolePool(name,targetRole,targetPassword));
  stage='SOURCE_SCHEMA';
  for(const name of ['20261101_self_account.sql','20261101_self_workspace.sql'])await source.query(await readFile(new URL('../../../infra/sql/'+name,import.meta.url),'utf8'));
  await source.query(`INSERT INTO api_self_consents(actor_id,version,choices_json) VALUES('SYN-ACTOR',1,
    '{"personalStorage":true,"teamReview":false,"externalAi":false,"ncpStorage":false,"presentation":false}');
    INSERT INTO api_self_profiles(actor_id,version,profile_json) VALUES('SYN-ACTOR',1,'{"displayName":"SYN-SNAPSHOT","interestTopics":["AI_ML"],"desiredJobTopics":[]}');
    CREATE TYPE syn_label AS ENUM('SYN-A','SYN-B');CREATE DOMAIN syn_text AS text CHECK(length(VALUE)>0);
    CREATE TABLE "복구E"(id bigserial PRIMARY KEY,label syn_label,tag syn_text,bytes bytea,at timestamptz);
    INSERT INTO "복구E"(label,tag,bytes,at) VALUES('SYN-A','SYN-NO-REAL-DATA',decode('00ff','hex'),'2026-11-04T00:00:00Z');`);
  folder=await mkdtemp(join(tmpdir(),'hufs-recovery-credentials-'));passFile=join(folder,'synthetic.pgpass');badFile=join(folder,'wrong.pgpass');
  const port=Number(url.port||5432);
  const lines=[`127.0.0.1:${port}:${sourceName}:${sourceRole}:${sourcePassword}`,...targets.map(name=>`127.0.0.1:${port}:${name}:${targetRole}:${targetPassword}`)];
  await writeFile(passFile,lines.join('\n')+'\n',{mode:0o600});await writeFile(badFile,lines.map(line=>line.slice(0,line.lastIndexOf(':')+1)+'SYN-WRONG-PASSWORD').join('\n')+'\n',{mode:0o600});
  const policy={version:'SYN-PG18-NATIVE',majorVersion:18,dump:await pins('pg_dump'),restore:await pins('pg_restore')};
  const credentials={resolve:async({endpoint})=>{
    assert.equal(endpoint.address,'127.0.0.1');assert.ok([sourceName,...targets].includes(endpoint.database));
    assert.equal(endpoint.role,endpoint.database===sourceName?sourceRole:targetRole);
    return {passFile:endpoint.credentialsRef==='SYN-WRONG-CREDENTIALS'?badFile:passFile};
  },isPrivate:async({path})=>path===passFile||path===badFile};
  const native=createNativeRecoveryTransfer({policy,credentials,spawn:(path,args,options)=>{
    const child=spawn(path,args,options),entry={kind:basename(path).replace('.exe',''),version:args.includes('--version'),closed:false};
    child.once('close',()=>{entry.closed=true;});children.push(entry);return child;
  }});
  const endpoint=(database,role,credentialsRef)=>({database,role,address:'127.0.0.1',port,requireTls:false,bypassRls:true,credentialsRef});
  const plan=(index,extra={})=>({version:1,drillId:'SYN-DRILL-'+index,approvalRef:'SYN-INDEPENDENT-OPERATOR',
    source:endpoint(sourceName,sourceRole,'SYN-SOURCE-CREDENTIALS'),target:endpoint(targets[index],targetRole,'SYN-TARGET-CREDENTIALS'),
    maxArchiveBytes:8*1024*1024,timeoutMs:30000,maxTables:64,maxRows:1000,transferPolicySha256:recoveryTransferPolicySha256(policy),...extra});
  let approved=true;
  const approval={authorize:async()=>({allowed:approved,receipt:'SYN-CURRENT-APPROVAL'}),revalidate:async()=>approved};
  const open=(index,transfer=native,extra={})=>createPostgresRecoveryDrill({plan:plan(index,extra),source:adapt(source),target:adapt(targetPools[index]),transfer,approval});
  stage='SNAPSHOT_EXPORT_RESTORE';
  const transfer={run:async input=>{
    // An independent writer changes the live row after snapshot fingerprinting.
    await source.query(`UPDATE api_self_profiles SET profile_json=jsonb_set(profile_json,'{displayName}','"SYN-LATER"'),version=version+1 WHERE actor_id='SYN-ACTOR'`);
    return native.run(input);
  }};
  const result=await open(0,transfer).run();assert.equal(result.state,'VERIFIED_QUARANTINED');assert.equal(result.retainedBackup,false);
  assert.equal(result.currentErasureStateReconciled,false);assert.equal(result.release,'RELEASE_BLOCKED');assert.ok(result.archiveBytes>1024);
  assert.match(result.archiveSha256,/^[a-f0-9]{64}$/);assert.ok(result.tableCount>=5);assert.ok(result.rowCount>=3);
  assert.equal((await targetPools[0].query(`SELECT profile_json->>'displayName' AS value FROM api_self_profiles WHERE actor_id='SYN-ACTOR'`)).rows[0].value,'SYN-SNAPSHOT');
  assert.equal((await source.query(`SELECT profile_json->>'displayName' AS value FROM api_self_profiles WHERE actor_id='SYN-ACTOR'`)).rows[0].value,'SYN-LATER');
  assert.equal((await targetPools[0].query("SELECT relforcerowsecurity FROM pg_class WHERE relname='api_self_profiles'")).rows[0].relforcerowsecurity,true);
  stage='NONEMPTY_TARGET_DENIED';
  await assert.rejects(open(0).run(),error=>error.code==='TARGET_NOT_FRESH_ISOLATED');
  stage='PER_LAUNCH_REVOCATION';let launches=0;const before=children.length;
  await assert.rejects(open(1,{run:input=>native.run({...input,authorizeLaunch:async()=>{
    if(++launches===4)approved=false;await input.authorizeLaunch();
  }})}).run(),error=>error.code==='APPROVAL_REVOKED');approved=true;
  assert.equal(children.slice(before).filter(c=>c.kind==='pg_dump'&&!c.version).length,0);assert.ok(children.every(c=>c.closed));
  stage='BOUNDED_ARCHIVE_ABORT';
  await assert.rejects(open(2,native,{maxArchiveBytes:1024}).run(),error=>['ARCHIVE_BOUND_EXCEEDED','NATIVE_TRANSFER_FAILED'].includes(error.code));
  assert.ok(children.every(c=>c.closed));
  stage='PUBLIC_CONNECT_DENIED';
  await admin.query(`GRANT CONNECT ON DATABASE ${targets[3]} TO PUBLIC`);
  await assert.rejects(open(3).run(),error=>error.code==='TARGET_NOT_FRESH_ISOLATED');
  stage='BAD_CREDENTIAL_AUTH';
  await assert.rejects(open(4,native,{source:endpoint(sourceName,sourceRole,'SYN-WRONG-CREDENTIALS')}).run(),error=>error.code==='NATIVE_TRANSFER_FAILED');
  assert.ok(children.every(c=>c.closed));
  assert.equal((await targetPools[4].query("SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'")).rows[0].n,0);
  stage='UNSUPPORTED_MATERIALIZED_VIEW_DENIED';
  await source.query(`CREATE MATERIALIZED VIEW syn_materialized AS SELECT 'SYN-NO-REAL-DATA'::text AS value`);
  const beforeUnsupported=children.length;
  await assert.rejects(open(4).run(),error=>error.code==='DRILL_UNAVAILABLE');
  assert.equal(children.length,beforeUnsupported);
  await source.query('DROP MATERIALIZED VIEW syn_materialized; CREATE TYPE syn_pair AS (value text)');
  await assert.rejects(open(4).run(),error=>error.code==='DRILL_UNAVAILABLE');
  assert.equal(children.length,beforeUnsupported);
  await source.query('DROP TYPE syn_pair; CREATE COLLATION syn_c (provider=libc,locale=\'C\')');
  await assert.rejects(open(4).run(),error=>error.code==='DRILL_UNAVAILABLE');
  assert.equal(children.length,beforeUnsupported);
  stage='COMPLETE';process.stdout.write(JSON.stringify({state:'PASS',scenario:'SYNTHETIC_LOGICAL_RECOVERY_DRILL',archiveBytes:result.archiveBytes,
    tableCount:result.tableCount,rowCount:result.rowCount,nativeProcesses:children.length,allNativeProcessesClosed:true,retainedBackup:false,release:'RELEASE_BLOCKED'})+'\n');
}catch(error){
  const code=/^[A-Z0-9_]{1,64}$/.test(error?.code??'')?error.code:'FIXTURE_FAILURE';
  process.stderr.write(JSON.stringify({state:'FAIL',stage,code,sqlState,allNativeProcessesClosed:children.every(c=>c.closed)})+'\n');process.exitCode=1;
}finally{
  await Promise.all(allPools.map(p=>p.end()));
  if(passFile)await unlink(passFile);if(badFile)await unlink(badFile);if(folder)await rmdir(folder);
}
