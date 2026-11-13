import {describe,it,expect,vi} from 'vitest';
import {PostgresSourceRefreshScheduler,createScheduledSourceQueue} from '../../apps/api/src/modules/opportunities/source-refresh-scheduler.js';
import {PostgresSourceIngestionQueue} from '../../apps/api/src/modules/opportunities/source-ingestion-queue-postgres.js';

const now='2026-11-12T00:15:00Z';
const schedule={sourceId:'SYN-SOURCE',permissionRef:'SYN-PERM',actorRef:'SYN-OPERATOR',
  scheduleVersion:'SYN-SCHEDULE-1',anchorAt:'2026-11-12T00:00:00Z',intervalSeconds:600};
function setup(previous:Record<string,unknown>|null=null){
  const query=vi.fn(async(sql:string,_params?:unknown[])=>({rows:sql.includes('FROM source_ingest_jobs')&&previous?
    [{updated_at:'2026-11-11T00:00:00Z',...previous}]:[]}));
  const release=vi.fn(),enqueue=vi.fn(async(_input:unknown)=>({jobId:'SYN-JOB',created:true}));
  const pool={connect:vi.fn(async()=>({query,release}))};
  const scheduler=new PostgresSourceRefreshScheduler(pool,{enqueueInTransaction:async(_connection,input)=>enqueue(input)},()=>now);
  return {scheduler,query,release,enqueue,pool};
}
describe('#445 scheduled refresh over the existing durable queue',()=>{
  it('uses one connection with the real rights-aware queue in a single-slot pool',async()=>{
    let busy=false;
    const query=vi.fn(async(sql:string,params?:unknown[])=>{
      if(sql.includes('count(*)'))return {rows:[{count:0}]};
      if(sql.includes('INSERT INTO source_ingest_jobs'))return {rows:[{job_id:params![0]}]};
      return {rows:[]};
    });
    const release=vi.fn(()=>{busy=false;});
    const pool={connect:vi.fn(async()=>{
      if(busy)throw new Error('single-slot pool would wait for retained connection');
      busy=true;return {query,release};
    })};
    const mayProcess=vi.fn(async()=>true);
    const queue=new PostgresSourceIngestionQueue(pool,{mayProcess},
      {execute:async()=>{throw new Error('scheduler must not execute');}},()=>now);
    const scheduler=new PostgresSourceRefreshScheduler(pool,queue,()=>now);
    await expect(scheduler.enqueueDue([schedule])).resolves.toEqual({queued:1,skipped:0,held:0});
    expect(pool.connect).toHaveBeenCalledOnce();expect(release).toHaveBeenCalledOnce();
    expect(mayProcess).toHaveBeenCalledOnce();
    expect(query.mock.calls.filter(([sql])=>sql==='BEGIN')).toHaveLength(1);
    expect(query.mock.calls.filter(([sql])=>sql==='COMMIT')).toHaveLength(1);
  });
  it('queues the current due window with stable idempotency, without executing a job',async()=>{
    const x=setup();
    expect(await x.scheduler.enqueueDue([schedule])).toEqual({queued:1,skipped:0,held:0});
    expect(x.enqueue).toHaveBeenCalledExactlyOnceWith({sourceId:'SYN-SOURCE',permissionRef:'SYN-PERM',
      actorRef:'SYN-OPERATOR',requestKey:'refresh:SYN-SCHEDULE-1:2026-11-12T00:10:00.000Z'});
    expect(x.query.mock.calls.some(([sql])=>sql.includes('pg_advisory_xact_lock'))).toBe(true);
    expect(x.query.mock.calls.at(-1)![0]).toBe('COMMIT');
    expect(x.release).toHaveBeenCalledOnce();
  });
  it('does not collect before the anchor or retry an already queued time window',async()=>{
    const x=setup({request_key:'refresh:SYN-SCHEDULE-1:2026-11-12T00:10:00.000Z',state:'UNCHANGED'});
    expect(await x.scheduler.enqueueDue([schedule])).toEqual({queued:0,skipped:1,held:0});
    expect(x.enqueue).not.toHaveBeenCalled();
    expect(await setup().scheduler.enqueueDue([{...schedule,anchorAt:'2026-12-01T00:00:00Z'}]))
      .toEqual({queued:0,skipped:1,held:0});
  });
  it.each(['PENDING','LEASED','NEEDS_REVIEW','BLOCKED_RIGHTS','CANCELLED'])
    ('holds %s instead of creating a new retry/paid operation',async state=>{
      const x=setup({request_key:'previous-window',state});
      expect(await x.scheduler.enqueueDue([schedule])).toEqual({queued:0,skipped:0,held:1});
      expect(x.enqueue).not.toHaveBeenCalled();
    });
  it.each(['NEW_DRAFT','CHANGED_DRAFT','UNCHANGED'])('advances after a settled %s only',async state=>{
    const x=setup({request_key:'previous-window',state});
    expect((await x.scheduler.enqueueDue([schedule])).queued).toBe(1);
  });
  it('redacts queue/SQL errors, rolls back and releases the schedule lock',async()=>{
    const x=setup();x.enqueue.mockRejectedValue(new Error('PRIVATE-URL-OR-TOKEN'));
    await expect(x.scheduler.enqueueDue([schedule])).rejects.toThrow('Source refresh scheduling failed');
    expect(x.query.mock.calls.at(-1)![0]).toBe('ROLLBACK');expect(x.release).toHaveBeenCalledOnce();
  });
  it('respects TTL after a recent completion even across a window boundary',async()=>{
    const x=setup({request_key:'previous-window',state:'UNCHANGED',updated_at:'2026-11-12T00:09:00Z'});
    expect(await x.scheduler.enqueueDue([schedule])).toEqual({queued:0,skipped:1,held:0});
    expect(x.enqueue).not.toHaveBeenCalled();
    for(const updated_at of ['invalid','2026-11-13T00:00:00Z']){
      const bad=setup({request_key:'previous-window',state:'UNCHANGED',updated_at});
      expect((await bad.scheduler.enqueueDue([schedule])).held).toBe(1);
      expect(bad.enqueue).not.toHaveBeenCalled();
    }
  });
  it('prepares once under parallel calls and never executes on loader failure',async()=>{
    const x=setup(),loadSchedules=vi.fn(async()=>[schedule]);
    const runOne=vi.fn(async()=>({state:'IDLE' as const}));
    const queue=createScheduledSourceQueue({scheduler:x.scheduler,loadSchedules,queue:{runOne}});
    await Promise.all([queue.runOne(),queue.runOne()]);
    expect(loadSchedules).toHaveBeenCalledOnce();expect(x.enqueue).toHaveBeenCalledOnce();
    expect(runOne).toHaveBeenCalledTimes(2);
    runOne.mockClear();
    const failed=createScheduledSourceQueue({scheduler:x.scheduler,
      loadSchedules:async()=>{throw new Error('PRIVATE-REGISTRY');},queue:{runOne}});
    await expect(failed.runOne()).rejects.toThrow('Source refresh scheduling failed');
    await expect(failed.runOne()).rejects.toThrow('Source refresh scheduling failed');
    expect(runOne).not.toHaveBeenCalled();
  });
  it('rejects duplicate or unbounded configurations before SQL',async()=>{
    for(const schedules of [[schedule,schedule],[{...schedule,intervalSeconds:1}],
      [{...schedule,sourceId:'https://private.invalid'}]]){
      const x=setup();await expect(x.scheduler.enqueueDue(schedules)).rejects.toThrow();
      expect(x.pool.connect).not.toHaveBeenCalled();
    }
  });
});
