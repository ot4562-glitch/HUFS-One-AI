import {afterEach,describe,expect,it,vi} from 'vitest';
import {compileMigrationPlan} from '../../apps/api/src/db/migration-plan.js';
import {createReviewedMigrationRunner} from '../../apps/api/src/db/reviewed-migrations.js';
import {migrationWorkspace,migrationPlan} from './reviewed-migrations-fixture.js';

const workspaces:Array<Awaited<ReturnType<typeof migrationWorkspace>>>=[];
afterEach(async()=>{await Promise.all(workspaces.splice(0).map(w=>w.close()));});
async function fixture(){
  const workspace=await migrationWorkspace();workspaces.push(workspace);
  const files=[await workspace.put('20990101_a.sql','BEGIN;CREATE TABLE syn_a(id integer);COMMIT;'),
    await workspace.put('20990102_b.sql','BEGIN;CREATE TABLE syn_b(id integer);COMMIT;')];
  const plan=migrationPlan(files),log:string[]=[],rows:Array<Record<string,unknown>>=[];
  const state={exists:false,elevated:false,unknownCommit:false,failSql:false,objects:0,tamper:''};
  let original:{exists:boolean;rows:Array<Record<string,unknown>>;objects:number}|undefined;
  const query=vi.fn(async(sql:string,args:readonly unknown[]=[]):Promise<{rows:Record<string,unknown>[]}> =>{
    log.push(sql);
    if(sql.startsWith('BEGIN'))original={exists:state.exists,rows:structuredClone(rows),objects:state.objects};
    if(sql==='ROLLBACK'&&original){state.exists=original.exists;state.objects=original.objects;rows.splice(0,rows.length,...original.rows);original=undefined;}
    if(sql==='COMMIT'){original=undefined;if(state.unknownCommit)throw new Error('SYN-SECRET-CONNECTION');}
    if(sql.includes('current_database() AS database'))return {rows:[{...plan.target,session_role:plan.target.role,encoding:'UTF8',client_encoding:'UTF8',version:180006,rolsuper:state.elevated,rolcreaterole:false,rolbypassrls:false,tls:false}]};
    if(sql.includes('SELECT c.relkind'))return {rows:state.exists?[{relkind:'r',owner:plan.target.role}]:[]};
    if(sql.includes('ORDER BY position'))return {rows:structuredClone(rows)};
    if(sql.includes(' AS n'))return {rows:[{n:state.objects}]};
    if(sql.includes('pg_try_advisory_xact_lock'))return {rows:[{acquired:true}]};
    if(sql.includes('CREATE TABLE IF NOT EXISTS public.hufs_schema_migrations'))state.exists=true;
    if(sql.includes('CREATE TABLE syn_')&&state.failSql)throw new Error('SYN-SECRET-SQL');
    if(sql.includes('CREATE TABLE syn_'))state.objects++;
    if(sql.includes('CREATE TABLE syn_b')&&state.tamper&&rows[0]){
      if(state.tamper==='plan')rows[0].plan_sha256='0'.repeat(64);else rows[0].applied_at='2026-11-03T00:00:00.000001Z';
    }
    if(sql.includes(' AS at'))return {rows:[{at:'2026-11-04T00:00:00.000001Z'}]};
    if(sql.startsWith('INSERT INTO public.hufs_schema_migrations')){
      const row={position:args[0],path:args[1],sha256:args[2],plan_sha256:args[3],applied_by:plan.target.role,applied_at:args[4]};rows.push(row);return {rows:[{...row}]};
    }
    return {rows:[]};
  });
  const release=vi.fn(),pool={connect:vi.fn(async()=>({peer:{address:plan.target.address,port:plan.target.port},query,querySingle:query,release}))};
  const approval={authorize:vi.fn(async()=>({allowed:true,receipt:'SYN-APPROVAL-RECEIPT'})),revalidate:vi.fn(async()=>true)};
  const open=(authorize=true)=>createReviewedMigrationRunner({workspace:workspace.root,plan,pool,...(authorize?{approval}:{})});
  return {workspace,files,plan,state,log,rows,pool,approval,open,release};
}
describe('reviewed atomic PostgreSQL migrations',()=>{
  it('checks read-only and refuses mutation without independent approval before connecting',async()=>{
    const f=await fixture(),runner=await f.open(false);
    await expect(runner.apply()).rejects.toMatchObject({code:'APPROVAL_REQUIRED',outcome:'NOT_APPLIED'});
    expect(f.pool.connect).not.toHaveBeenCalled();
    expect((await runner.check()).pending).toHaveLength(2);
    expect(f.log[0]).toBe('BEGIN TRANSACTION READ ONLY');expect(f.log.some(sql=>/CREATE TABLE|INSERT INTO/.test(sql))).toBe(false);
  });
  it('pins every file, disallows traversal/duplicate paths and rejects changed bytes',async()=>{
    const f=await fixture();
    await expect(compileMigrationPlan(f.workspace.root,{...f.plan,files:[{...f.files[0],path:'infra/sql/../../private.sql'}]})).rejects.toThrow();
    await expect(compileMigrationPlan(f.workspace.root,{...f.plan,files:[f.files[0],f.files[0]]})).rejects.toThrow();
    await f.workspace.put('20990101_a.sql','SELECT 2;');await expect(f.open()).rejects.toMatchObject({code:'PLAN_DENIED'});
    expect(f.pool.connect).not.toHaveBeenCalled();
  });
  it('applies ordered receipts atomically and repeats only as NO_CHANGE',async()=>{
    const f=await fixture(),runner=await f.open();
    expect((await runner.apply()).state).toBe('APPLIED');expect(f.rows.map(row=>row.path)).toEqual(f.files.map(file=>file.path));
    expect((await runner.apply()).state).toBe('NO_CHANGE');expect(f.rows).toHaveLength(2);
    expect(f.log.filter(sql=>sql.includes('CREATE TABLE syn_'))).toHaveLength(2);
  });
  it('rejects elevated/wrong targets, untracked schema and checksum/order drift',async()=>{
    const f=await fixture(),runner=await f.open();f.state.elevated=true;
    await expect(runner.apply()).rejects.toMatchObject({code:'TARGET_DENIED',outcome:'ROLLED_BACK'});f.state.elevated=false;
    const wrongPeerPlan={...f.plan,target:{...f.plan.target,address:'::1'}};
    const wrongPeerRunner=await createReviewedMigrationRunner({workspace:f.workspace.root,plan:wrongPeerPlan,pool:f.pool});
    await expect(wrongPeerRunner.check()).rejects.toMatchObject({code:'TARGET_DENIED'});
    f.state.objects=1;await expect(runner.apply()).rejects.toMatchObject({code:'UNTRACKED_SCHEMA'});f.state.objects=0;
    await runner.apply();f.rows[0]!.sha256='0'.repeat(64);
    await expect(runner.apply()).rejects.toMatchObject({code:'HISTORY_DRIFT'});
  });
  it('rolls back all pending work on SQL error or approval withdrawal',async()=>{
    const f=await fixture(),runner=await f.open();f.state.failSql=true;
    await expect(runner.apply()).rejects.toMatchObject({code:'SQL_FAILURE',outcome:'ROLLED_BACK'});expect(f.rows).toEqual([]);expect(f.state.exists).toBe(false);
    f.state.failSql=false;let checks=0;f.approval.revalidate.mockImplementation(async()=>++checks<3);
    await expect(runner.apply()).rejects.toMatchObject({code:'APPROVAL_REVOKED',outcome:'ROLLED_BACK'});expect(f.rows).toEqual([]);
  });
  it('treats lost COMMIT acknowledgment as unknown and discards the connection without retrying',async()=>{
    const f=await fixture(),runner=await f.open();f.state.unknownCommit=true;
    await expect(runner.apply()).rejects.toMatchObject({code:'COMMIT_UNCONFIRMED',outcome:'UNKNOWN_COMMIT'});
    expect(f.rows).toHaveLength(2);expect(f.release).toHaveBeenCalledWith(expect.any(Error));
    expect(f.log.filter(sql=>sql==='COMMIT')).toHaveLength(1);
    expect(f.log.join(' ')).not.toContain('SYN-SECRET');
  });
  it('detects prior plan provenance or exact microsecond timestamp edits and restores parser settings per statement',async()=>{
    for(const tamper of ['plan','time']){
      const f=await fixture();f.state.tamper=tamper;
      await expect((await f.open()).apply()).rejects.toMatchObject({code:'HISTORY_DRIFT',outcome:'ROLLED_BACK'});expect(f.rows).toEqual([]);
    }
    const f=await fixture();await (await f.open()).apply();
    for(let i=0;i<f.log.length;i++)if(f.log[i]!.includes('CREATE TABLE syn_'))expect(f.log[i-1]).toContain("standard_conforming_strings='on'");
  });
});
