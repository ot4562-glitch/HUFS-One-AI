import {randomUUID} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {PostgresSourceIngestionQueue} from '../../apps/api/src/modules/opportunities/source-ingestion-queue-postgres.js';

const now='2026-11-04T00:00:00.000Z',jobId=randomUUID();
function fixture(){
  const row={job_id:jobId,actor_ref:'SYN-OPERATOR',source_id:'SYN-SOURCE',permission_ref:'SYN-PERM',state:'PENDING',
    attempt_count:0,queued_at:new Date(now),updated_at:new Date(now),observed_at:new Date(now),
    lease_until:null,lease_expired:false,outcome_revision_id:null,last_error_code:null};
  const query=vi.fn(async(sql:string)=>({rows:sql.includes('FROM source_ingest_jobs')?[{...row}]:[]}));
  const pool={connect:vi.fn(async()=>({query,release:()=>{}}))};
  const authority={mayProcess:vi.fn(async()=>true)},executor={execute:vi.fn()};
  const queue=new PostgresSourceIngestionQueue(pool,authority,executor,()=>now);
  const input={jobId,actorRef:row.actor_ref,sourceId:row.source_id,permissionRef:row.permission_ref};
  return {row,query,pool,authority,executor,queue,input};
}
describe('durable source job safe status projection',()=>{
  it('reads exact actor/source/permission status without lease tokens or raw inputs',async()=>{
    const f=fixture(),result=await f.queue.inspect(f.input);
    expect(result).toEqual({jobId,sourceId:'SYN-SOURCE',state:'PENDING',attemptCount:0,queuedAt:now,updatedAt:now,observedAt:now,requiresOperatorReview:false});
    expect(JSON.stringify(result)).not.toMatch(/actor|permission|requestKey|leaseToken/);
    expect(f.query.mock.calls.find(([sql])=>sql.includes('FROM source_ingest_jobs'))?.[0]).toContain('actor_ref=$2');
    expect(f.executor.execute).not.toHaveBeenCalled();
  });
  it('denies source/operator authority before SQL and rechecks after a read',async()=>{
    const f=fixture();f.authority.mayProcess.mockResolvedValue(false);
    expect(await f.queue.inspect(f.input)).toBeNull();expect(f.pool.connect).not.toHaveBeenCalled();
    f.authority.mayProcess.mockResolvedValueOnce(true).mockResolvedValue(false);
    expect(await f.queue.inspect(f.input)).toBeNull();
  });
  it('reports an expired lease as review-required without changing state or retrying it',async()=>{
    const f=fixture();Object.assign(f.row,{state:'LEASED',attempt_count:1,lease_until:new Date('2026-11-03T23:59:59.000Z'),lease_expired:true});
    expect(await f.queue.inspect(f.input)).toMatchObject({state:'LEASED',requiresOperatorReview:true,attemptCount:1,leaseUntil:'2026-11-03T23:59:59.000Z'});
    expect(f.query.mock.calls.some(([sql])=>/UPDATE|INSERT|advisory_lock/.test(sql))).toBe(false);
    expect(f.executor.execute).not.toHaveBeenCalled();
  });
  it('rejects a wrong row identity and inconsistent completed/unknown states',async()=>{
    for(const change of [{actor_ref:'SYN-OTHER'},{permission_ref:'SYN-OTHER'},
      {state:'NEW_DRAFT',attempt_count:1},{state:'NEEDS_REVIEW',attempt_count:1,last_error_code:'secret server error'},
      {state:'PENDING',attempt_count:1},{updated_at:new Date('2026-11-05T00:00:00.000Z')}]){
      const f=fixture();Object.assign(f.row,change);await expect(f.queue.inspect(f.input)).rejects.toThrow();
    }
  });
});
