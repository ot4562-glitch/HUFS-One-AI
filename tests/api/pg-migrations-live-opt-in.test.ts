import {randomBytes} from 'node:crypto';
import {writeFile,unlink} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {createReviewedMigrationRunner,postgresMigrationPool} from '../../apps/api/src/db/reviewed-migrations.js';
import type {MigrationApproval,MigrationPool} from '../../apps/api/src/db/reviewed-migrations.js';
import {migrationWorkspace,migrationPlan} from './reviewed-migrations-fixture.js';
import type {ReviewedMigrationPlan} from '../../apps/api/src/db/migration-plan.js';

const RUN=process.env.HUFS_PG_MIGRATIONS_LIVE==='1',password=randomBytes(24).toString('hex');
let admin:Pool,pool:Pool,url:URL,workspace:Awaited<ReturnType<typeof migrationWorkspace>>;
const approval:MigrationApproval={authorize:async()=>({allowed:true,receipt:'SYN-INDEPENDENT-APPROVAL-RECEIPT'}),revalidate:async()=>true};
const adapt=(pool:Pool,loseCommit=false):MigrationPool=>({connect:async()=>{
  const c=await postgresMigrationPool(pool).connect();return {query:async(sql,args=[])=>{
    const r=await c.query(sql,args);if(loseCommit&&sql==='COMMIT')throw new Error('SYN-LOST-COMMIT-ACK');return r;
  },querySingle:sql=>c.querySingle(sql),release:error=>c.release(error)};
}});
async function cli(plan:ReviewedMigrationPlan,databaseUrl?:string){
  const planPath=join(workspace.root,'plan.json');await writeFile(planPath,JSON.stringify(plan));
  const child=spawn(process.execPath,[fileURLToPath(new URL('../../tools/check_postgres_migration_plan.mjs',import.meta.url)),'--plan',planPath,
    ...(databaseUrl?['--database-env','HUFS_SYN_MIGRATION_URL']:[])],{
    windowsHide:true,stdio:['ignore','pipe','pipe'],env:{SystemRoot:process.env.SystemRoot,PATH:process.env.PATH,
      ...(databaseUrl?{HUFS_SYN_MIGRATION_URL:databaseUrl}:{})}});
  let output='',error='';child.stdout.on('data',chunk=>{output+=chunk;if(output.length>65536)child.kill();});child.stderr.on('data',chunk=>{error+=chunk;if(error.length>65536)child.kill();});
  const timeout=setTimeout(()=>child.kill(),5000);
  try{const code=await new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
    expect(code,error).toBe(0);return {result:JSON.parse(output),output};
  }finally{clearTimeout(timeout);await unlink(planPath);}
}
describe.skipIf(!RUN)('REAL PostgreSQL: pinned reviewed migration transactions',()=>{
  beforeAll(async()=>{
    const raw=process.env.HUFS_PG_MIGRATIONS_URL;if(!raw)throw new Error('Explicit disposable migration DB required');url=new URL(raw);
    if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!=='127.0.0.1'||!['5432','55448'].includes(url.port||'5432')
      ||url.pathname!=='/hufs_one_migration_test'||url.search||url.hash||!url.username)throw new Error('Refusing non-isolated migration database');
    admin=new Pool({connectionString:url.toString(),ssl:false,max:2,connectionTimeoutMillis:3000});
    const existing=await admin.query(`SELECT (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace)+
      (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace) AS n`);
    if(Number(existing.rows[0]?.n)!==0)throw new Error('Migration test needs a fresh empty DB; no reset');
    await admin.query(`CREATE ROLE hufs_test_migrator LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      ALTER DATABASE hufs_one_migration_test OWNER TO hufs_test_migrator;
      ALTER SCHEMA public OWNER TO hufs_test_migrator;`);
    const target=new URL(url);target.username='hufs_test_migrator';target.password=password;
    pool=new Pool({connectionString:target.toString(),ssl:false,max:4,connectionTimeoutMillis:3000});
    workspace=await migrationWorkspace();
  },15000);
  afterAll(async()=>{await pool?.end();await admin?.end();await workspace?.close();},10000);

  it('applies real project SQL, denies stale review, rolls back partial DDL, resolves lost ACK and serializes contenders',async()=>{
    const files=[await workspace.copyProject('20261101_self_account.sql'),await workspace.copyProject('20261101_self_workspace.sql')];
    const base=migrationPlan(files,Number(url.port||5432));
    const open=(plan=base,gate=approval,db=adapt(pool))=>createReviewedMigrationRunner({workspace:workspace.root,plan,pool:db,approval:gate});
    const runner=await open();expect((await runner.check()).pending).toHaveLength(2);
    const guarded=await postgresMigrationPool(pool).connect();
    try{await guarded.query('BEGIN');await expect(guarded.querySingle('SELECT 1; COMMIT;')).rejects.toMatchObject({code:'42601'});await guarded.query('ROLLBACK');}
    finally{guarded.release(new Error('Synthetic single-statement guard proof'));}
    expect((await admin.query("SELECT to_regclass('public.api_self_profiles') AS t")).rows[0]?.t).toBeNull();
    expect((await runner.apply()).state).toBe('APPLIED');expect((await runner.apply()).state).toBe('NO_CHANGE');
    expect((await admin.query('SELECT path FROM hufs_schema_migrations ORDER BY position')).rows.map(r=>r.path)).toEqual(files.map(f=>f.path));
    expect((await admin.query("SELECT relforcerowsecurity FROM pg_class WHERE relname='api_self_profiles'")).rows[0]?.relforcerowsecurity).toBe(true);
    const readUrl=new URL(url);readUrl.username='hufs_test_migrator';readUrl.password=password;
    const checked=await cli(base,readUrl.toString());expect(checked.result).toMatchObject({state:'CHECKED',pending:[],release:'RELEASE_BLOCKED'});
    expect(checked.result.applied).toHaveLength(2);expect(checked.output).not.toContain(password);
    const original=files[0]!;
    const drift=await workspace.put('20261101_self_account.sql','BEGIN;SELECT 1;COMMIT;');
    await expect((await open({...base,files:[drift,files[1]!]})).apply()).rejects.toMatchObject({code:'HISTORY_DRIFT'});
    expect(await workspace.copyProject('20261101_self_account.sql')).toEqual(original);

    const revoked=await workspace.put('20990101_syn.sql','BEGIN;CREATE TABLE syn_revoked(id integer);COMMIT;');let validations=0;
    const withdrawn={...approval,revalidate:async()=>++validations<3};
    await expect((await open({...base,files:[...files,revoked]},withdrawn)).apply()).rejects.toMatchObject({code:'APPROVAL_REVOKED',outcome:'ROLLED_BACK'});
    expect((await admin.query("SELECT to_regclass('public.syn_revoked') AS t")).rows[0]?.t).toBeNull();
    expect((await admin.query('SELECT count(*)::int AS n FROM hufs_schema_migrations')).rows[0]?.n).toBe(2);
    const failed=await workspace.put('20990101_syn.sql','BEGIN;CREATE TABLE syn_failed(id integer);SELECT 1/0;COMMIT;');
    await expect((await open({...base,files:[...files,failed]})).apply()).rejects.toMatchObject({code:'SQL_FAILURE',outcome:'ROLLED_BACK'});
    expect((await admin.query("SELECT to_regclass('public.syn_failed') AS t")).rows[0]?.t).toBeNull();

    // Earlier SQL can change a parser setting through a function, not SET.
    // Every later captured statement must still parse with standard strings;
    // the apparent COMMIT in these bytes must remain data, then fully roll back.
    const settings=await workspace.put('20990110_settings.sql',"BEGIN;CREATE TABLE syn_escape(id integer);CREATE TABLE 한글E(id integer);SELECT set_config('standard_conforming_strings','off',true);COMMIT;");
    const escaped=await workspace.put('20990111_escaped.sql',String.raw`SELECT '\'; SELECT '; COMMIT; --';`+'\nSELECT 1;');
    const stop=await workspace.put('20990112_stop.sql','SELECT 1/0;');
    await expect((await open({...base,files:[...files,settings,escaped,stop]})).apply()).rejects.toMatchObject({code:'SQL_FAILURE',outcome:'ROLLED_BACK'});
    expect((await admin.query("SELECT to_regclass('public.syn_escape') AS t")).rows[0]?.t).toBeNull();
    expect((await admin.query("SELECT to_regclass('public.한글e') AS t")).rows[0]?.t).toBeNull();
    for(const payload of [String.raw`CREATE DOMAIN éE AS text;SELECT éE'\'; COMMIT; --';`,"SELECT $한$'$한$; COMMIT; --';"]){
      const unsafe=await workspace.put('20990113_unsafe.sql',payload);let connections=0;
      await expect(open({...base,files:[...files,unsafe]},approval,{connect:async()=>{connections++;return adapt(pool).connect();}})).rejects.toMatchObject({code:'PLAN_DENIED'});
      expect(connections).toBe(0);
    }

    const originalReceipts=(await admin.query('SELECT plan_sha256,applied_at::text AS at FROM hufs_schema_migrations ORDER BY position')).rows;
    for(const assignment of ["plan_sha256=repeat('0',64)","applied_at=applied_at+interval '0.000001 second'"]){
      const edit=await workspace.put('20990101_syn.sql',`BEGIN;UPDATE public.hufs_schema_migrations SET ${assignment} WHERE position=1;COMMIT;`);
      await expect((await open({...base,files:[...files,edit]})).apply()).rejects.toMatchObject({code:'HISTORY_DRIFT',outcome:'ROLLED_BACK'});
      expect((await admin.query('SELECT plan_sha256,applied_at::text AS at FROM hufs_schema_migrations ORDER BY position')).rows).toEqual(originalReceipts);
    }

    const committed=await workspace.put('20990101_syn.sql','BEGIN;CREATE TABLE syn_committed(id integer);COMMIT;');
    const recovered={...base,files:[...files,committed]};
    await expect((await open(recovered,approval,adapt(pool,true))).apply()).rejects.toMatchObject({code:'COMMIT_UNCONFIRMED',outcome:'UNKNOWN_COMMIT'});
    expect((await (await open(recovered)).check()).pending).toEqual([]);
    expect((await admin.query("SELECT to_regclass('public.syn_committed') AS t")).rows[0]?.t).toBe('syn_committed');

    const serial=await workspace.put('20990102_serial.sql','BEGIN;CREATE TABLE syn_serial(id integer);COMMIT;');
    const next={...base,files:[...recovered.files,serial]};
    let hold!:()=>void,arrived!:()=>void;const barrier=new Promise<void>(resolve=>{hold=resolve;}),ready=new Promise<void>(resolve=>{arrived=resolve;});
    let first=true;const blocking={...approval,revalidate:async()=>{if(first){first=false;arrived();await barrier;}return true;}};
    const running=(await open(next,blocking)).apply();
    try{await Promise.race([ready,running.then(()=>{throw new Error('Synthetic lock barrier was not reached');})]);
      await expect((await open(next)).apply()).rejects.toMatchObject({code:'MIGRATION_BUSY',outcome:'ROLLED_BACK'});}
    finally{hold();await running;}
    expect((await admin.query('SELECT count(*)::int AS n FROM hufs_schema_migrations')).rows[0]?.n).toBe(4);

    // Build-dependent CLI can check real project pins without changing this DB.
    // Use the base plan offline; DB check uses a separate extended temporary plan
    // only in the programmatic tests above, so fixture SQL never enters the repo.
    expect((await cli(base)).result).toMatchObject({state:'PINS_VERIFIED',release:'RELEASE_BLOCKED'});
  },60000);
});
