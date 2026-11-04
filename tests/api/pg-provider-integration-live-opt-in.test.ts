/** Real loopback HTTP + separate Node processes + disposable PostgreSQL only. */
import {readFileSync} from 'node:fs';
import {fork,type ChildProcess} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {PostgresAiBudgetLedger} from '../../apps/api/src/modules/ai/budget-postgres.js';
import {PostgresProviderResults} from '../../apps/api/src/modules/ai/provider-results-postgres.js';
import {HufsApiClient} from '../../apps/web/src/integrations/api-client.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';

const RUN=process.env.HUFS_PG_PROVIDER_INTEGRATION_LIVE==='1';
type TestServer={child:ChildProcess;calls:string[];stop:()=>Promise<void>;base:string};
const pools:Pool[]=[],servers:TestServer[]=[];
let admin:Pool,budget:Pool,results:Pool,urls:Record<string,string>,policy:Record<string,unknown>;
const phase='SYN-PROVIDER-HTTP',password=randomBytes(24).toString('hex');
const origin='https://synthetic-provider.example.test';
const migrations=['20261031_google_auth.sql','20261031_beta_admission.sql','20261031_auth_attempt_windows.sql',
  '20261031_temporal_evidence.sql','20261101_source_review.sql','20261105_source_image_evidence.sql','20261101_verified_source_rights.sql',
  '20261101_self_account.sql','20261103_ai_budget.sql','20261103_ai_provider_inputs.sql','20261103_ai_provider_results.sql'];
const adapter=(pool:Pool):ReviewerSqlPool=>({connect:async()=>{const c=await pool.connect();return {
  query:async(sql,args=[])=>({rows:(await c.query(sql,[...args])).rows}),release:()=>c.release()};}});
const pause=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
function pool(url:string){const p=new Pool({connectionString:url,ssl:false,max:6,connectionTimeoutMillis:3000,statement_timeout:5000});pools.push(p);return p;}
async function start(subject:string,mode='ok'):Promise<TestServer>{
  // fork defaults to no console window (silent pipe/IPC handles only).
  const child=fork(new URL('./fixtures/provider-pg-server.mjs',import.meta.url),[],{
    stdio:['ignore','ignore','ignore','ipc'],env:{PATH:process.env.PATH??'',APP_ENV:'test',NODE_ENV:'test',
      // Each isolated scenario gets its own keyed login attempt bucket. Production rate limits stay active.
      HUFS_SYNTHETIC_PROVIDER_CONFIG:JSON.stringify({urls,phase,policy,digestKey:randomBytes(32).toString('hex'),subject,mode})}});
  const calls:string[]=[];
  child.on('message',(m:any)=>{if(m?.kind==='provider-call')calls.push(m.stage);});
  const port=await new Promise<number>((resolve,reject)=>{
    const timer=setTimeout(()=>{child.kill();reject(Error('Synthetic API startup timed out'));},15000);
    child.once('exit',()=>{clearTimeout(timer);reject(Error('Synthetic API exited before ready'));});
    child.on('message',(m:any)=>{if(m?.kind==='ready'){clearTimeout(timer);resolve(m.port);}});
  });
  let stopped=false;
  const stop=async()=>{if(stopped)return;stopped=true;
    await new Promise<void>(resolve=>{if(child.exitCode!==null){resolve();return;}
      const timer=setTimeout(()=>child.kill(),5000);child.once('exit',()=>{clearTimeout(timer);resolve();});child.send({kind:'stop'});});};
  const base='http://127.0.0.1:'+port;
  const service={child,calls,stop,base};servers.push(service);return service;
}
async function login(s:Awaited<ReturnType<typeof start>>){
  const begun=await fetch(s.base+'/api/auth/google/start?intent=BETA',{redirect:'manual'});
  expect(begun.status).toBe(303);const url=new URL(begun.headers.get('location')!);
  const binding=begun.headers.getSetCookie().find(v=>v.startsWith('__Host-hufs_login='))!.split(';')[0]!;
  const callback=await fetch(s.base+'/api/auth/google/callback?state='+url.searchParams.get('state')
    +'&code=SYN-'+url.searchParams.get('nonce'),{redirect:'manual',headers:{cookie:binding}});
  expect(callback.status).toBe(303);
  const cookie=callback.headers.getSetCookie().find(v=>v.startsWith('__Host-hufs_session='))!.split(';')[0]!;
  const csrf=await fetch(s.base+'/api/auth/csrf',{headers:{cookie}}).then(r=>r.json()) as {csrfToken:string};
  return {cookie,headers:{cookie,origin,'x-csrf-token':csrf.csrfToken}};
}
async function seed(suffix:string){
  const subject='SYN-PROVIDER-'+suffix,actor='google:'+subject,source=subject+'-SOURCE',revision=subject+'-REV',permission=subject+'-PERM',projection=subject+'-INPUT';
  const asOf=new Date(Date.now()-5000).toISOString(),before=new Date(Date.now()-65000).toISOString(),approved=new Date(Date.now()-35000).toISOString(),expires=new Date(Date.now()+3600000).toISOString();
  const sha='d'.repeat(64),packet={packetId:'DOC-PACKET',task:'opportunity_terms',providerInputClass:'SYNTHETIC_CLEARED',
    sourceTokens:[{token:'DOC1',paragraphs:[{id:'p1',text:'Synthetic approved notice'}]}],allowedTopicCodes:[],allowedObjectTokens:[],approvedFacts:[],schemaVersion:'1',promptVersion:'1'};
  await admin.query(`INSERT INTO beta_school_proofs(google_subject,school_email,method,proof_verified_at,proof_expires_at,approved_at,approved_until)
    VALUES($1,$2,'SIGNED_WORKSPACE',$3,$4,$3,$4)`,[subject,subject.toLowerCase()+'@hufs.ac.kr',before,expires]);
  await admin.query(`INSERT INTO source_revisions_vnext(revision_id,source_id,original_sha256,content_sha256,media_kind,source_class,permission_ref,provenance,status,change_kind,fetched_at,last_checked_at,last_verified_at)
    VALUES($1,$2,$3,$3,'TEXT','SYNTHETIC',$4,'SYNTHETIC','ACTIVE','NEW',$5,$5,$5)`,[revision,source,sha,permission,before]);
  await admin.query('INSERT INTO source_ingest_heads(source_id,revision_id,fetched_at,last_checked_at) VALUES($1,$2,$3,$3)',[source,revision,before]);
  await admin.query('INSERT INTO api_self_consents(actor_id,version,choices_json,updated_at) VALUES($1,1,$2,$3)',
    [actor,{personalStorage:true,externalAi:true,teamReview:false,ncpStorage:false,presentation:false},before]);
  await admin.query(`INSERT INTO source_rights_receipts(receipt_id,actor_id,source_id,permission_ref,canonical_url,purposes,reviewed_by,reviewed_at,starts_at,expires_at,policy_version)
    VALUES($1,$2,$3,$4,'https://synthetic.example.test/notice',ARRAY['STORE','EXTERNAL_TRANSFER'],'SYN-INDEPENDENT-OPERATOR',$5,$5,$6,'rights-1')`,[subject+'-RIGHTS',actor,source,permission,before,expires]);
  await admin.query(`INSERT INTO api_ai_provider_inputs(projection_id,actor_id,input_ref,operation,as_of,epoch,policy_version,consent_version,approved_by,approved_at,expires_at,input_class,privacy_review_ref,source_refs,safe_packet)
    VALUES($1,$2,'SYN-INPUT','HCX_007',$3,'epoch-1','input-policy-1','1','SYN-INDEPENDENT-OPERATOR',$4,$5,'SYNTHETIC_CLEARED','SYN-PRIVACY',$6,$7)`,
    [projection,actor,asOf,approved,expires,JSON.stringify([{sourceId:source,revisionId:revision,permissionRef:permission,originalSha256:sha}]),packet]);
  await admin.query(`INSERT INTO api_ai_provider_input_heads VALUES($1,'SYN-INPUT','HCX_007',$2)`,[actor,projection]);
  return {subject,actor,source,revision,permission,projection,asOf,expires};
}
async function execute(s:Awaited<ReturnType<typeof start>>,auth:Awaited<ReturnType<typeof login>>,asOf:string,key:string){
  return fetch(s.base+'/api/ai/opportunity-terms',{method:'POST',headers:{...auth.headers,'content-type':'application/json'},
    body:JSON.stringify({packetRef:'SYN-INPUT',asOf,idempotencyKey:key})});
}
async function get(s:Awaited<ReturnType<typeof start>>,cookie:string,id:string){return fetch(s.base+'/api/ai/jobs/'+id,{headers:{cookie}});}
async function job(actor:string,key:string){return (await admin.query('SELECT * FROM ai_budget_jobs WHERE actor_id=$1 AND idempotency_key=$2',[actor,key])).rows[0];}

describe.skipIf(!RUN)('REAL Provider integration: BETA HTTP, fake transport, PG and process restart',()=>{
  beforeAll(async()=>{
    const raw=process.env.HUFS_PG_PROVIDER_INTEGRATION_URL;if(!raw)throw Error('Explicit disposable provider DB required');
    const u=new URL(raw);
    if(u.hostname!=='127.0.0.1'||!['5432','55432'].includes(u.port)||u.pathname!=='/hufs_one_provider_integration_test'
      ||u.username!=='hufs_local_admin'||u.search||u.hash)throw Error('Refusing non-disposable Provider DB');
    admin=pool(u.href);
    const count=await admin.query("SELECT (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace)+(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace) AS n");
    if(Number(count.rows[0]?.n)!==0)throw Error('Preserve nonempty Provider DB; no reset permitted');
    if((await admin.query("SELECT 1 FROM pg_roles WHERE rolname LIKE 'hufs_provider_test_%'")).rows.length)throw Error('Preserve existing Provider test roles');
    for(const file of migrations)await admin.query(readFileSync(new URL('../../infra/sql/'+file,import.meta.url),'utf8'));
    urls={};
    for(const role of ['sessions','admission','limiter','authority','budget','results']){
      await admin.query(`CREATE ROLE hufs_provider_test_${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
      await admin.query(`GRANT USAGE ON SCHEMA public TO hufs_provider_test_${role}`);
      const target=new URL(u);target.username='hufs_provider_test_'+role;target.password=password;urls[role]=target.href;
    }
    await admin.query(`GRANT SELECT,INSERT,DELETE ON google_login_attempts TO hufs_provider_test_sessions;
      GRANT SELECT,INSERT,UPDATE ON google_app_sessions TO hufs_provider_test_sessions;
      GRANT SELECT ON beta_school_proofs TO hufs_provider_test_admission;
      GRANT SELECT,INSERT,UPDATE ON auth_attempt_windows TO hufs_provider_test_limiter;
      GRANT SELECT ON api_self_consents,api_ai_provider_inputs,api_ai_provider_input_heads,source_ingest_heads,source_effective_revisions_vnext,source_rights_receipts,source_rights_revocations TO hufs_provider_test_authority;
      GRANT EXECUTE ON FUNCTION ai_budget_reserve(text,text,text,text,bigint),ai_budget_transition(text,uuid,text,text,bigint,text) TO hufs_provider_test_budget;
      GRANT EXECUTE ON FUNCTION ai_provider_result_put(jsonb),ai_provider_result_get(uuid) TO hufs_provider_test_results;`);
    budget=pool(urls.budget!);results=pool(urls.results!);
    await admin.query(`INSERT INTO ai_budget_phases(phase_id,enabled,starts_at,ends_at,max_units,actor_max_units,max_attempts,actor_max_attempts)
      VALUES($1,true,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',1000000,100000,100,20)`,[phase]);
    policy={version:'SYN-PRICE',approvedBy:'SYN-OPERATOR',approvedAt:new Date(Date.now()-120000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),
      inputUnitsPerToken:2,outputUnitsPerToken:3,tokenizerUnits:1,ocrImageUnits:10,maxInputTokens:3500,maxOutputTokens:800,framingTokens:0};
  },30000);
  afterAll(async()=>{await Promise.all(servers.map(s=>s.stop()));await Promise.all(pools.map(p=>p.end()));},15000);

  it('settles once, persists a candidate, restarts the real server and rejects other actors/sessions',async()=>{
    const f=await seed('HAPPY'),s=await start(f.subject),auth=await login(s);
    const response=await execute(s,auth,f.asOf,'KEY-HAPPY');expect(response.status).toBe(202);
    const first=await response.json() as {jobId:string};expect(s.calls).toEqual(['TOKENIZE','INFER']);
    expect(await job(f.actor,'KEY-HAPPY')).toMatchObject({state:'SETTLED',charged_units:'143'});
    const initial=await get(s,auth.cookie,first.jobId);expect(initial.status).toBe(200);
    expect(await initial.json()).toMatchObject({state:'NEEDS_REVIEW',billing:'SETTLED',candidate:{reviewState:'NEEDS_REVIEW'},provenance:'CANDIDATE_CACHE'});
    // Exercise the real BETA browser client on the SAME already authenticated
    // actor/session. No extra login attempts or weakened 429 policy.
    const browser=(srv:TestServer)=>new HufsApiClient(async(path,init)=>{
      const headers:Record<string,string>={cookie:auth.cookie,origin};
      new Headers(init.headers).forEach((value,name)=>{headers[name]=value;});
      return fetch(srv.base+path,{method:init.method??'GET',headers,
        ...(init.body===undefined?{}:{body:String(init.body)}),redirect:'manual'});
    });
    const approved=await browser(s).owner.getApprovedProviderInputs();
    expect(approved).toMatchObject({items:[{inputRef:'SYN-INPUT',operation:'HCX_007',
      task:'opportunity_terms',asOf:f.asOf}]});
    expect(JSON.stringify(approved)).not.toMatch(/safe_packet|media_bytes|privacy_review_ref|source_refs|actor_id/);
    const selection=approved.items[0]!;
    const duplicate=await browser(s).owner.submitApprovedProvider(selection,'opportunity-terms','KEY-HAPPY');
    expect(duplicate).toMatchObject({state:'NEEDS_REVIEW',provenance:'CANDIDATE_CACHE',jobId:first.jobId});
    const current=await browser(s).owner.readApprovedProviderJob(first.jobId,'opportunity-terms');
    expect(current).toMatchObject({billing:'SETTLED',provenance:'CANDIDATE_CACHE',
      candidate:{reviewState:'NEEDS_REVIEW',task:'opportunity_terms'}});
    expect(current.candidate.citations[0]!.quote).toBe('Synthetic approved notice');
    expect(s.calls).toEqual(['TOKENIZE','INFER']);
    await s.stop();const restarted=await start(f.subject);
    expect((await get(restarted,auth.cookie,first.jobId)).status).toBe(200);
    expect(await browser(restarted).owner.readApprovedProviderJob(first.jobId,'opportunity-terms')).toEqual(current);
    expect((await execute(restarted,auth,f.asOf,'KEY-HAPPY')).status).toBe(202);expect(restarted.calls).toEqual([]);
    const otherSession=await login(restarted);expect((await get(restarted,otherSession.cookie,first.jobId)).status).toBe(403);
    await admin.query("INSERT INTO source_rights_revocations(receipt_id,revoked_by,revoked_at,reason_ref) VALUES($1,'SYN-OPERATOR',clock_timestamp(),'SYN-REVOKED')",
      [f.subject+'-RIGHTS']);
    expect(await browser(restarted).owner.getApprovedProviderInputs()).toEqual({items:[]});
    await expect(browser(restarted).owner.readApprovedProviderJob(first.jobId,'opportunity-terms'))
      .rejects.toMatchObject({code:'FORBIDDEN'});
    expect(restarted.calls).toEqual([]);
    await restarted.stop();const b=await seed('OTHER'),other=await start(b.subject),bAuth=await login(other);
    expect((await get(other,bAuth.cookie,first.jobId)).status).toBe(403);await other.stop();
    expect((await admin.query('SELECT count(*)::int AS n FROM ai_budget_jobs WHERE actor_id=$1',[f.actor])).rows[0]?.n).toBe(1);
  },30000);
  it('rejects a changed canonical epoch/payload under the same key and source head replacement',async()=>{
    const f=await seed('EPOCH'),s=await start(f.subject),auth=await login(s);
    const r=await execute(s,auth,f.asOf,'KEY-EPOCH');expect(r.status).toBe(202);const first=await r.json() as {jobId:string};
    await admin.query(`INSERT INTO api_ai_provider_inputs(projection_id,actor_id,input_ref,operation,as_of,epoch,policy_version,consent_version,approved_by,approved_at,expires_at,input_class,privacy_review_ref,source_refs,safe_packet)
      SELECT projection_id||'-NEXT',actor_id,input_ref,operation,as_of,'epoch-2',policy_version,consent_version,approved_by,approved_at,expires_at,input_class,privacy_review_ref,source_refs,jsonb_set(safe_packet,'{packetId}','"DOC-CHANGED"') FROM api_ai_provider_inputs WHERE projection_id=$1`,[f.projection]);
    await admin.query('UPDATE api_ai_provider_input_heads SET projection_id=$2 WHERE actor_id=$1',[f.actor,f.projection+'-NEXT']);
    expect((await get(s,auth.cookie,first.jobId)).status).toBe(403);
    expect((await execute(s,auth,f.asOf,'KEY-EPOCH')).status).toBe(503);expect(s.calls).toHaveLength(2);
    await admin.query(`INSERT INTO source_revisions_vnext(revision_id,source_id,supersedes,original_sha256,content_sha256,media_kind,source_class,permission_ref,provenance,status,change_kind,fetched_at,last_checked_at,last_verified_at)
      VALUES($1,$2,$5,$3,$3,'TEXT','SYNTHETIC',$4,'SYNTHETIC','ACTIVE','CORRECTED',clock_timestamp(),clock_timestamp(),clock_timestamp())`,[f.revision+'-NEW',f.source,'e'.repeat(64),f.permission,f.revision]);
    await admin.query('UPDATE source_ingest_heads SET revision_id=$2 WHERE source_id=$1',[f.source,f.revision+'-NEW']);
    expect((await execute(s,auth,f.asOf,'KEY-NEW-SOURCE')).status).toBe(503);expect(s.calls).toHaveLength(2);await s.stop();
  },30000);
  it.each(['rights','consent'])('refuses persisted reads after current %s withdrawal',async kind=>{
    const f=await seed(kind.toUpperCase()),s=await start(f.subject),auth=await login(s);
    const r=await execute(s,auth,f.asOf,'KEY-WITHDRAW');expect(r.status).toBe(202);const first=await r.json() as {jobId:string};
    if(kind==='rights')await admin.query(`INSERT INTO source_rights_revocations(receipt_id,revoked_by,revoked_at,reason_ref) VALUES($1,'SYN-OPERATOR',clock_timestamp(),'SYN-REVOKED')`,[f.subject+'-RIGHTS']);
    else await admin.query("UPDATE api_self_consents SET choices_json=jsonb_set(choices_json,'{externalAi}','false'),version=version+1,updated_at=clock_timestamp() WHERE actor_id=$1",[f.actor]);
    expect((await get(s,auth.cookie,first.jobId)).status).toBe(403);
    if(kind==='consent')expect((await admin.query('SELECT result_json FROM api_ai_provider_results WHERE job_id=$1',[first.jobId])).rows[0]?.result_json).toBeNull();
    await s.stop();
  },30000);
  it.each(['429','503','timeout'])('keeps %s billing unknown, does not retry and discards late completion',async mode=>{
    const f=await seed('FAIL-'+mode),s=await start(f.subject,mode),auth=await login(s);
    expect((await execute(s,auth,f.asOf,'KEY-FAILURE')).status).toBe(503);
    expect(await job(f.actor,'KEY-FAILURE')).toMatchObject({state:'UNKNOWN_BILLING',charged_units:null});
    const count=s.calls.length;expect((await execute(s,auth,f.asOf,'KEY-FAILURE')).status).toBe(503);expect(s.calls).toHaveLength(count);
    if(mode==='timeout')await pause(1900);
    expect((await admin.query('SELECT count(*)::int AS n FROM api_ai_provider_results WHERE actor_id=$1',[f.actor])).rows[0]?.n).toBe(0);await s.stop();
  },30000);
  it('does not disclose a late result after consent revocation while fake inference is in flight',async()=>{
    const f=await seed('LATE'),s=await start(f.subject,'hold'),auth=await login(s);
    const response=execute(s,auth,f.asOf,'KEY-LATE');
    for(let i=0;i<100&&!s.calls.includes('INFER');i++)await pause(10);
    expect(s.calls).toContain('INFER');
    await admin.query("UPDATE api_self_consents SET choices_json=jsonb_set(choices_json,'{externalAi}','false'),version=version+1,updated_at=clock_timestamp() WHERE actor_id=$1",[f.actor]);
    s.child.send({kind:'release'});expect((await response).status).toBe(503);
    expect((await admin.query('SELECT count(*)::int AS n FROM api_ai_provider_results WHERE actor_id=$1',[f.actor])).rows[0]?.n).toBe(0);await s.stop();
  },30000);
  it('twenty concurrent duplicate HTTP submissions cannot reserve, dispatch or charge twice',async()=>{
    const f=await seed('CONCURRENT-IDEMPOTENT'),s=await start(f.subject),auth=await login(s);
    try{
      const responses=await Promise.all(Array.from({length:20},()=>execute(s,auth,f.asOf,'KEY-CONCURRENT-ONE')));
      // During contention some callers may fail closed, but no caller may
      // bypass the budget gate or mint a distinct job for the same idempotency key.
      expect(responses.every(r=>[202,409,429,503].includes(r.status))).toBe(true);
      const accepted=await Promise.all(responses.filter(r=>r.status===202).map(r=>r.json() as Promise<{jobId:string}>));
      expect(new Set(accepted.map(r=>r.jobId)).size).toBeLessThanOrEqual(1);
      const jobs=await admin.query('SELECT job_id,state,charged_units FROM ai_budget_jobs WHERE actor_id=$1 AND idempotency_key=$2',[f.actor,'KEY-CONCURRENT-ONE']);
      expect(jobs.rows).toHaveLength(1);
      expect(jobs.rows[0]!.state).toBe('SETTLED');
      expect(jobs.rows[0]!.charged_units).toBe('143');
      expect(s.calls.filter(x=>x==='TOKENIZE')).toHaveLength(1);
      expect(s.calls.filter(x=>x==='INFER')).toHaveLength(1);
      const resultRows=await admin.query('SELECT count(*)::int AS n FROM api_ai_provider_results WHERE actor_id=$1',[f.actor]);
      expect(resultRows.rows[0]?.n).toBe(1);
      const again=await execute(s,auth,f.asOf,'KEY-CONCURRENT-ONE');
      expect(again.status).toBe(202);
      expect(s.calls).toHaveLength(2);
    }finally{await s.stop();}
  },60000);

  it('twenty simultaneous requests after consent revocation cause zero provider calls, charges or stored results',async()=>{
    const f=await seed('CONCURRENT-REVOKED'),s=await start(f.subject),auth=await login(s);
    try{
      await admin.query("UPDATE api_self_consents SET choices_json=jsonb_set(choices_json,'{externalAi}','false'),version=version+1,updated_at=clock_timestamp() WHERE actor_id=$1",[f.actor]);
      const responses=await Promise.all(Array.from({length:20},(_,i)=>execute(s,auth,f.asOf,'KEY-REVOKED-'+i)));
      expect(responses.every(r=>r.status!==202)).toBe(true);
      expect(s.calls).toHaveLength(0);
      const jobs=await admin.query('SELECT count(*)::int AS n FROM ai_budget_jobs WHERE actor_id=$1',[f.actor]);
      expect(jobs.rows[0]?.n).toBe(0);
      const results=await admin.query('SELECT count(*)::int AS n FROM api_ai_provider_results WHERE actor_id=$1',[f.actor]);
      expect(results.rows[0]?.n).toBe(0);
    }finally{await s.stop();}
  },60000);

  it('SQL denies pre-SETTLED writes and runtime table/prune access',async()=>{
    const f=await seed('DIRECT'),ledger=new PostgresAiBudgetLedger(adapter(budget)),store=new PostgresProviderResults(adapter(results));
    const hash='a'.repeat(64),row=await ledger.reserve(f.actor,{phaseId:phase,task:'HCX_007',idempotencyKey:'KEY-DIRECT',requestSha256:hash,worstCaseUnits:1});
    const value={jobId:row.jobId,actorId:f.actor,sessionIdHash:'SYN-SESSION-HASH',inputRef:'SYN-INPUT',operation:'HCX_007' as const,
      asOf:f.asOf,phaseId:phase,idempotencyKey:'KEY-DIRECT',requestSha256:hash,inputEpoch:'input-'+createHash('sha256').update(f.projection+'|epoch-1|1').digest('hex'),
      expiresAt:new Date(Date.now()+60000).toISOString(),candidate:{reviewState:'NEEDS_REVIEW'}};
    await expect(store.put(value)).rejects.toThrow('Provider result unavailable');
    const identity={phaseId:phase,jobId:row.jobId,requestSha256:hash};
    for(const action of ['DISPATCHED','UNKNOWN_BILLING'] as const){await ledger.transition(f.actor,{...identity,action});await expect(store.put(value)).rejects.toThrow();}
    await expect(results.query('SELECT result_json FROM api_ai_provider_results')).rejects.toMatchObject({code:'42501'});
    await expect(results.query('SELECT ai_provider_results_prune(1)')).rejects.toMatchObject({code:'42501'});
    await expect(budget.query('SELECT * FROM ai_budget_jobs')).rejects.toMatchObject({code:'42501'});
  });


});
