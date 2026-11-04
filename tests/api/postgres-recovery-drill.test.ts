import {describe,expect,it,vi} from 'vitest';
import {createPostgresRecoveryDrill,RecoveryDrillError} from '../../apps/api/src/db/postgres-recovery-drill.js';

const endpoint=(database:string)=>({database,role:'SYN_BACKUP_OPERATOR',address:'127.0.0.1',port:55448,requireTls:false,bypassRls:true,credentialsRef:'SYN-CREDENTIALS'});
const plan=()=>({version:1 as const,drillId:'SYN-DRILL',approvalRef:'SYN-APPROVAL',source:endpoint('hufs_recovery_source_test'),
  target:endpoint('hufs_recovery_target_test'),transferPolicySha256:'a'.repeat(64),maxArchiveBytes:1048576,timeoutMs:10000});
function fixture(){
  const value=plan(),state={approved:true,objects:0,peers:0,others:0,members:0,mismatch:false,wrongRole:false,unsupported:0};
  const client=(target:boolean)=>{
    const query=vi.fn(async(sql:string)=>{
      if(sql.includes('current_database() AS database'))return {rows:[{database:target?value.target.database:value.source.database,
        role:state.wrongRole?'SYN-WRONG':value.source.role,session_role:value.source.role,address:'127.0.0.1',port:55448,version:180006,encoding:'UTF8',
        rolsuper:false,rolcreaterole:false,rolcreatedb:false,rolbypassrls:true,tls:false,datcollate:'C',datctype:'C',owned:true}]};
      if(sql.includes(' AS objects'))return {rows:[{objects:state.objects,peers:state.peers,others:state.others,members:state.members}]};
      if(sql.includes('pg_try_advisory_lock'))return {rows:[{acquired:true}]};
      if(sql.includes('pg_export_snapshot'))return {rows:[{snapshot:'00000003-00000001-1',at:'2026-11-04T00:00:00.000Z'}]};
      if(sql.includes('FROM pg_extension'))return {rows:[{n:state.unsupported}]};
      if(sql.includes('c.relname AS name'))return {rows:[{name:'SYN_RECORDS',kind:'r'}]};
      if(sql.includes('WITH objects'))return {rows:[{kind:'relation',name:'SYN_RECORDS',digest:'b'.repeat(64)}]};
      if(sql.includes('SELECT h FROM'))return {rows:[{h:(target&&state.mismatch?'d':'c').repeat(64)}]};
      return {rows:[]};
    });return {query,release:vi.fn()};
  };
  const source=client(false),target=client(true),sourcePool={connect:vi.fn(async()=>source)},targetPool={connect:vi.fn(async()=>target)};
  const approval={authorize:vi.fn(async()=>({allowed:state.approved,receipt:'SYN-APPROVAL-RECEIPT'})),revalidate:vi.fn(async()=>state.approved)};
  const transfer={run:vi.fn(async(_input:Parameters<Parameters<typeof createPostgresRecoveryDrill>[0]['transfer']['run']>[0])=>({sha256:'a'.repeat(64),bytes:4096}))};
  const open=()=>createPostgresRecoveryDrill({plan:value,source:sourcePool,target:targetPool,transfer,approval});
  return {value,state,source,target,sourcePool,targetPool,approval,transfer,open};
}
describe('explicit isolated PostgreSQL recovery drill',()=>{
  it('does not connect, obtain credentials or transfer without independent authorization',async()=>{
    const source={connect:vi.fn()},target={connect:vi.fn()},transfer={run:vi.fn()};
    const drill=createPostgresRecoveryDrill({plan:plan(),source,target,transfer});
    expect(source.connect).not.toHaveBeenCalled();expect(target.connect).not.toHaveBeenCalled();
    await expect(drill.run()).rejects.toMatchObject({code:'APPROVAL_REQUIRED'});
    expect(source.connect).not.toHaveBeenCalled();expect(target.connect).not.toHaveBeenCalled();expect(transfer.run).not.toHaveBeenCalled();
  });
  it('rejects the same database even when a different role is claimed',()=>{
    const value=plan();value.target={...value.source,role:'SYN_OTHER_ROLE'};
    expect(()=>createPostgresRecoveryDrill({plan:value,source:{connect:vi.fn()},target:{connect:vi.fn()},transfer:{run:vi.fn()}})).toThrow();
  });
  it('binds snapshot/fingerprints and returns only a quarantined logical verification receipt',async()=>{
    const f=fixture(),result=await f.open().run();expect(result).toMatchObject({state:'VERIFIED_QUARANTINED',retainedBackup:false,
      ownershipAndAclRestored:false,currentErasureStateReconciled:false,tableCount:1,rowCount:1,archiveBytes:4096,release:'RELEASE_BLOCKED'});
    expect(f.transfer.run.mock.calls[0]?.[0].snapshot).toBe('00000003-00000001-1');
    expect(JSON.stringify(result)).not.toMatch(/SYN_RECORDS|credentialsRef|password|SYN_BACKUP_OPERATOR/);
    expect(f.source.query.mock.calls.some(([sql])=>sql==='ROLLBACK')).toBe(true);expect(f.target.release).toHaveBeenCalledWith(expect.any(Error));
  });
  it('denies occupied, public-connect, shared-role or mismatched targets before export',async()=>{
    for(const key of ['objects','peers','others','members'] as const){const f=fixture();f.state[key]=1;
      await expect(f.open().run()).rejects.toMatchObject({code:'TARGET_NOT_FRESH_ISOLATED'});expect(f.transfer.run).not.toHaveBeenCalled();}
    const f=fixture();f.state.wrongRole=true;await expect(f.open().run()).rejects.toMatchObject({code:'TARGET_BINDING_DENIED'});
    expect(f.transfer.run).not.toHaveBeenCalled();
  });
  it('does not attest changed data, unsupported source objects or a late permission withdrawal',async()=>{
    const f=fixture();f.state.mismatch=true;await expect(f.open().run()).rejects.toMatchObject({code:'RESTORE_MISMATCH'});
    const g=fixture();g.state.unsupported=1;await expect(g.open().run()).rejects.toMatchObject({code:'DRILL_UNAVAILABLE'});expect(g.transfer.run).not.toHaveBeenCalled();
    const h=fixture();h.transfer.run.mockImplementation(async()=>{h.state.approved=false;return {sha256:'a'.repeat(64),bytes:4096};});
    await expect(h.open().run()).rejects.toMatchObject({code:'APPROVAL_REVOKED'});
  });
  it('reserves in-process ownership before asynchronous approval and releases a denied request',async()=>{
    const f=fixture();let resolve!:(value:{allowed:boolean;receipt:string})=>void;
    f.approval.authorize.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));const drill=f.open(),running=drill.run();
    await expect(drill.run()).rejects.toMatchObject({code:'DRILL_BUSY'});resolve({allowed:false,receipt:'SYN-NO'});
    await expect(running).rejects.toMatchObject({code:'APPROVAL_REQUIRED'});expect(f.sourcePool.connect).not.toHaveBeenCalled();
  });
  it('aborts a pending transfer at the deadline and does not free a fence after an unconfirmed native stop',async()=>{
    const f=fixture();f.value.timeoutMs=100;f.transfer.run.mockImplementation(async input=>new Promise((_resolve,reject)=>{
      input.signal.addEventListener('abort',()=>reject(new RecoveryDrillError('TRANSFER_ABORTED')),{once:true});
    }));await expect(f.open().run()).rejects.toMatchObject({code:'TRANSFER_ABORTED'});expect(f.target.release).toHaveBeenCalled();
    const g=fixture();g.transfer.run.mockRejectedValue(new RecoveryDrillError('STOP_UNCONFIRMED'));const blocked=g.open();
    await expect(blocked.run()).rejects.toMatchObject({code:'STOP_UNCONFIRMED'});
    expect(g.target.release).not.toHaveBeenCalled();expect(g.target.query.mock.calls.some(([sql])=>sql.includes('pg_advisory_unlock'))).toBe(false);
    await expect(blocked.run()).rejects.toMatchObject({code:'DRILL_BUSY'});
  });
});
