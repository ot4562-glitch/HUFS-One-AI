import {describe,expect,it,vi} from 'vitest';
import {PostgresSourceIngestionQueue} from '../../apps/api/src/modules/opportunities/source-ingestion-queue-postgres.js';
const input={jobId:'00000000-0000-4000-8000-000000000001',actorRef:'SYN-OPERATOR',
  sourceId:'SYN-SOURCE',permissionRef:'SYN-RIGHTS'};
function fixture(state='PENDING'){
  const row={state,attempts:state==='PENDING'?0:1};
  const query=vi.fn(async(sql:string,args:readonly unknown[]=[])=>{
    if(sql.includes("SET state='CANCELLED'")){
      if(args[0]!==input.jobId||args[1]!==input.actorRef||args[2]!==input.sourceId||
        args[3]!==input.permissionRef||row.state!=='PENDING'||row.attempts!==0)return {rows:[]};
      row.state='CANCELLED';return {rows:[{job_id:input.jobId}]};
    }
    return {rows:[]};
  });
  const release=vi.fn(),pool={connect:vi.fn(async()=>({query,release}))};
  const authority={mayProcess:vi.fn(async()=>true)};
  const executor={execute:vi.fn(async()=>{throw Error('No execution during cancellation');})};
  const make=()=>new PostgresSourceIngestionQueue(pool,authority,executor,()=> '2026-11-04T00:00:00.000Z');
  return {row,query,release,pool,authority,executor,make};
}
describe('durable pending source cancellation',()=>{
  it('cancels only once across instances without starting a worker',async()=>{
    const f=fixture();
    expect(await f.make().cancelPending(input)).toBe(true);
    expect(await f.make().cancelPending(input)).toBe(false);
    expect(f.row).toEqual({state:'CANCELLED',attempts:0});
    expect(f.authority.mayProcess).toHaveBeenCalledWith({actorRef:input.actorRef,
      sourceId:input.sourceId,permissionRef:input.permissionRef,now:'2026-11-04T00:00:00.000Z'});
    expect(f.query).toHaveBeenCalledWith('COMMIT');
    expect(f.executor.execute).not.toHaveBeenCalled();
  });
  it.each(['actorRef','sourceId','permissionRef','jobId'] as const)('does not cancel mismatched %s',async key=>{
    const f=fixture(),value={...input,[key]:key==='jobId'?'00000000-0000-4000-8000-000000000002':'SYN-OTHER'};
    expect(await f.make().cancelPending(value)).toBe(false);
    expect(f.row.state).toBe('PENDING');
  });
  it.each(['LEASED','NEW_DRAFT','CHANGED_DRAFT','UNCHANGED','NEEDS_REVIEW','BLOCKED_RIGHTS','CANCELLED'])
    ('never claims a %s job stopped',async state=>{
      const f=fixture(state);expect(await f.make().cancelPending(input)).toBe(false);
      expect(f.row.state).toBe(state);expect(f.executor.execute).not.toHaveBeenCalled();
    });
  it('refuses denied rights and malformed input before connecting',async()=>{
    const f=fixture();f.authority.mayProcess.mockResolvedValue(false);
    await expect(f.make().cancelPending(input)).rejects.toThrow('Source rights not approved');
    await expect(f.make().cancelPending({...input,jobId:'bad'})).rejects.toThrow();
    expect(f.pool.connect).not.toHaveBeenCalled();
  });
  it('rolls back and releases the connection if the cancel statement fails',async()=>{
    const f=fixture();f.query.mockImplementation(async(sql:string)=>{
      if(sql.includes("SET state='CANCELLED'"))throw Error('Synthetic database failure');
      return {rows:[]};
    });
    await expect(f.make().cancelPending(input)).rejects.toThrow('Synthetic database failure');
    expect(f.query).toHaveBeenCalledWith('ROLLBACK');expect(f.release).toHaveBeenCalledOnce();
    expect(f.executor.execute).not.toHaveBeenCalled();
  });
});
