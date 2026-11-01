import {randomUUID} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {PostgresSourceIngestionQueue} from
  '../../apps/api/src/modules/opportunities/source-ingestion-queue-postgres.js';
import type {ReviewerSqlPool} from
  '../../apps/api/src/modules/auth/reviewer-postgres.js';

/** Deterministic two-session SQL stub: transaction locks end on COMMIT,
 * session advisory locks survive COMMIT and a pooled connection release. */
function database(count=2){
  const jobs=Array.from({length:count},(_,i)=>({
    job_id:randomUUID(),actor_ref:'SYN-OPERATOR',source_id:'SYN-SOURCE-'+i,
    permission_ref:'SYN-RIGHTS',request_key:'SYN-REQUEST-'+i,
    state:'PENDING',attempt_count:0,lease_token:null as string|null,
    lease_until:0,outcome_revision_id:null as string|null,
  }));
  let elapsedMs=0,sessionOwner:number|null=null,sessionNo=0;
  let activeConnections=0,peakConnections=0;
  let failClaim=false,failUnlock=false;
  const issued:string[]=[],released:Array<{id:number;error?:Error}>=[];
  const pool:ReviewerSqlPool={
    connect:async()=>{
      const id=++sessionNo;
      activeConnections++;
      peakConnections=Math.max(peakConnections,activeConnections);
      return {
        async query(sql:string,params:readonly unknown[]=[]){
          issued.push(sql);
          if(sql.includes('pg_try_advisory_lock(')){
            const acquired=sessionOwner===null||sessionOwner===id;
            if(acquired)sessionOwner=id;
            return {rows:[{acquired}]};
          }
          if(sql.includes('pg_advisory_unlock(')){
            const unlocked=!failUnlock&&sessionOwner===id;
            if(unlocked)sessionOwner=null;
            return {rows:[{unlocked}]};
          }
          if(sql.includes('pg_try_advisory_xact_lock')){
            if(failClaim){failClaim=false;throw new Error('synthetic DB claim failure');}
            return {rows:[{acquired:true}]};
          }
          if(sql.includes("UPDATE source_ingest_jobs SET state='NEEDS_REVIEW'")){
            for(const job of jobs)if(job.state==='LEASED'&&job.lease_until<=elapsedMs){
              job.state='NEEDS_REVIEW';job.lease_token=null;job.lease_until=0;
            }
            return {rows:[]};
          }
          if(sql.includes("WHERE state='LEASED' AND lease_until>")){
            return {rows:jobs.filter(j=>j.state==='LEASED'&&j.lease_until>elapsedMs)
              .map(j=>({job_id:j.job_id})).slice(0,1)};
          }
          if(sql.includes("WHERE state='PENDING'")&&sql.includes('FOR UPDATE')){
            return {rows:jobs.filter(j=>j.state==='PENDING').slice(0,1).map(j=>({
              job_id:j.job_id,actor_ref:j.actor_ref,source_id:j.source_id,
              permission_ref:j.permission_ref,request_key:j.request_key,
            }))};
          }
          if(sql.includes("SET state='LEASED'")){
            const job=jobs.find(j=>j.job_id===params[0]&&j.state==='PENDING');
            if(!job||job.attempt_count!==0)return {rows:[]};
            job.state='LEASED';job.attempt_count++;job.lease_token=String(params[1]);
            job.lease_until=elapsedMs+30_000;
            return {rows:[{job_id:job.job_id,actor_ref:job.actor_ref,
              source_id:job.source_id,permission_ref:job.permission_ref,
              request_key:job.request_key,lease_token:job.lease_token}]};
          }
          if(sql.includes('outcome_revision_id=$4')){
            const job=jobs.find(j=>j.job_id===params[0]
              &&j.lease_token===params[1]&&j.state==='LEASED'
              &&j.lease_until>elapsedMs);
            if(!job)return {rows:[]};
            job.state=String(params[2]);job.lease_token=null;job.lease_until=0;
            job.outcome_revision_id=params[3]===null?null:String(params[3]);
            return {rows:[{job_id:job.job_id}]};
          }
          return {rows:[]};
        },
        release(error?:Error){
          activeConnections--;
          released.push({id,...(error?{error}:{})});
          // A failed SQL unlock must evict the poisoned session, not return it
          // with a held advisory lock to the pool.
          if(error&&sessionOwner===id)sessionOwner=null;
        },
      };
    },
  };
  return {pool,jobs,issued,released,owner:()=>sessionOwner,
    activeConnections:()=>activeConnections,peakConnections:()=>peakConnections,
    advance:(ms:number)=>{elapsedMs+=ms;},
    failNextClaim:()=>{failClaim=true;},
    failNextUnlock:()=>{failUnlock=true;},
    clock:()=>new Date(Date.parse('2026-11-01T00:00:00Z')+elapsedMs).toISOString()};
}
const authority={mayProcess:async()=>true};
function deferred(){
  let resolve!:()=>void;
  const promise=new Promise<void>(r=>{resolve=r;});
  return {promise,resolve};
}
describe('source queue: one global executor across process instances',()=>{
  it('does not start a second external execution when an old lease expires but its executor is still alive',async()=>{
    const db=database(),started=deferred(),resume=deferred(),calls:string[]=[];
    const first=new PostgresSourceIngestionQueue(db.pool,authority,{
      execute:async({sourceId})=>{
        calls.push(sourceId);started.resolve();await resume.promise;
        return {kind:'NEW_DRAFT',revisionId:'SYN-REV-1'};
      },
    },db.clock);
    const second=new PostgresSourceIngestionQueue(db.pool,authority,{
      execute:async({sourceId})=>{
        calls.push(sourceId);return {kind:'NEW_DRAFT',revisionId:'SYN-REV-2'};
      },
    },db.clock);
    const running=first.runOne();
    await started.promise;
    // Simulate a stalled remote transport outliving its 30-second lease.
    db.advance(31_000);
    const other=await second.runOne();
    resume.resolve();
    await expect(running).rejects.toThrow('Source lease lost');
    expect(other).toEqual({state:'IDLE'});
    expect(calls).toEqual(['SYN-SOURCE-0']);
    expect(db.jobs[1]?.state).toBe('PENDING');
    // After the first executor exits, recovery quarantines its uncertain
    // result and only then runs the next queued task.
    expect((await second.runOne()).state).toBe('NEW_DRAFT');
    expect(calls).toEqual(['SYN-SOURCE-0','SYN-SOURCE-1']);
    expect(db.jobs[0]?.state).toBe('NEEDS_REVIEW');
    expect(db.jobs[0]?.attempt_count).toBe(1);
  });
  it('holds a session advisory lock across executor IO, then releases it for the next instance',async()=>{
    const db=database(),calls:string[]=[];
    const executor={execute:async({sourceId}:{sourceId:string})=>{
      calls.push(sourceId);return {kind:'NEW_DRAFT' as const,revisionId:'SYN-REV'};
    }};
    const a=new PostgresSourceIngestionQueue(db.pool,authority,executor,db.clock);
    const b=new PostgresSourceIngestionQueue(db.pool,authority,executor,db.clock);
    expect((await a.runOne()).state).toBe('NEW_DRAFT');
    expect(db.owner()).toBeNull();
    expect((await b.runOne()).state).toBe('NEW_DRAFT');
    expect(db.owner()).toBeNull();
    expect(calls).toEqual(['SYN-SOURCE-0','SYN-SOURCE-1']);
    expect(db.peakConnections()).toBe(1);
    expect(db.activeConnections()).toBe(0);
    expect(db.issued.filter(sql=>sql.includes('pg_try_advisory_lock('))).toHaveLength(2);
    expect(db.issued.filter(sql=>sql.includes('pg_advisory_unlock('))).toHaveLength(2);
  });
  it('releases the global session guard if claiming fails, without running the executor',async()=>{
    const db=database(1),calls:string[]=[];
    const q=new PostgresSourceIngestionQueue(db.pool,authority,{
      execute:async()=>{calls.push('executed');return {kind:'NEW_DRAFT',revisionId:'SYN-REV'};},
    },db.clock);
    db.failNextClaim();
    await expect(q.runOne()).rejects.toThrow('synthetic DB claim failure');
    expect(db.issued).toContain('ROLLBACK');
    expect(db.owner()).toBeNull();
    expect(calls).toEqual([]);
    expect((await q.runOne()).state).toBe('NEW_DRAFT');
  });
  it('quarantines a job when its actor loses rights during execution and frees the session guard',async()=>{
    const db=database(1);
    let allowed=true;
    const q=new PostgresSourceIngestionQueue(db.pool,{
      mayProcess:async()=>allowed,
    },{
      execute:async()=>{
        allowed=false;
        return {kind:'NEW_DRAFT',revisionId:'SYN-REV'};
      },
    },db.clock);
    expect(await q.runOne()).toEqual({jobId:db.jobs[0]!.job_id,state:'BLOCKED_RIGHTS'});
    expect(db.jobs[0]?.state).toBe('BLOCKED_RIGHTS');
    expect(db.jobs[0]?.outcome_revision_id).toBeNull();
    expect(db.owner()).toBeNull();
    expect(db.activeConnections()).toBe(0);
  });
  it('quarantines an ambiguous executor failure without rerunning the same source',async()=>{
    const db=database(1);
    let executions=0;
    const q=new PostgresSourceIngestionQueue(db.pool,authority,{
      execute:async()=>{
        executions++;
        throw new Error('synthetic unknown completion');
      },
    },db.clock);
    expect((await q.runOne()).state).toBe('NEEDS_REVIEW');
    expect((await q.runOne()).state).toBe('IDLE');
    expect(executions).toBe(1);
    expect(db.jobs[0]?.attempt_count).toBe(1);
    expect(db.jobs[0]?.state).toBe('NEEDS_REVIEW');
    expect(db.owner()).toBeNull();
  });
  it('evicts a pooled connection instead of preserving an orphan session lock after failed unlock',async()=>{
    const db=database(1);
    const q=new PostgresSourceIngestionQueue(db.pool,authority,{
      execute:async()=>({kind:'NOT_MODIFIED',revisionId:'SYN-REV'}),
    },db.clock);
    db.failNextUnlock();
    await expect(q.runOne()).rejects.toThrow('Source queue global lock release failed');
    expect(db.released.some(x=>x.error instanceof Error)).toBe(true);
    expect(db.owner()).toBeNull();
  });
});
