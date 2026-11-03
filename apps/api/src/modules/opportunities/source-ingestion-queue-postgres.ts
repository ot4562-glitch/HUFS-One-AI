import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {SourceJobStatusSchema} from '@hufs-one/contracts';
import type {SourceJobStatus} from '@hufs-one/contracts';
import type {ReviewerSqlPool,ReviewerSqlConnection} from '../auth/reviewer-postgres.js';

const Ref=z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:@-]+$/);
const Request=z.strictObject({
  actorRef:Ref,sourceId:Ref,permissionRef:Ref,requestKey:Ref,
});
const Job=z.object({
  job_id:z.string().uuid(),actor_ref:Ref,source_id:Ref,
  permission_ref:Ref,request_key:Ref,
  lease_token:z.string().uuid(),
});
export interface TrustedSourceIngestionAuthority {
  /** Current server-verified actor, source and purpose grant. No browser input. */
  mayProcess(input:{actorRef:string;sourceId:string;permissionRef:string;now:string}):Promise<boolean>;
}
export interface TrustedDurableSourceExecutor {
  /** Must commit the approved new DRAFT/unchanged check to the immutable PG ledger
   * before resolving. No actual provider transport or background process is created here.
   * The executor rechecks source-rights before and after IO and before its commit. */
  execute(input:{sourceId:string;permissionRef:string;actorRef:string}):Promise<{
    kind:'NEW_DRAFT'|'CHANGED_DRAFT'|'NOT_MODIFIED';revisionId:string;
  }>;
}
export type SourceQueueRunResult =
  | {state:'IDLE'}
  | {state:'NEW_DRAFT'|'CHANGED_DRAFT'|'UNCHANGED'|'BLOCKED_RIGHTS'|'NEEDS_REVIEW';jobId:string};
export class SourceQueueDenied extends Error {constructor(){super('Source rights not approved');}}
export class SourceQueueCapacity extends Error {constructor(){super('Source queue capacity reached');}}
export class SourceQueueConflict extends Error {constructor(){super('Source queue identity conflict');}}

/**
 * One active lease globally, capacity 16, one delivery per idempotency key.
 * A crash/timeout or ambiguous provider result is quarantined for human review;
 * no automatic retry can silently make a second external/paid call.
 * This adapter never schedules a timer and has NO implicit fetch or NCP transport.
 */
export class PostgresSourceIngestionQueue {
  private running=false;
  constructor(
    private readonly pool:ReviewerSqlPool,
    private readonly authority:TrustedSourceIngestionAuthority,
    private readonly executor:TrustedDurableSourceExecutor,
    private readonly now:()=>string=()=>new Date().toISOString(),
  ){}

  private async withTransaction<T>(callback:(c:ReviewerSqlConnection)=>Promise<T>,
    shared?:ReviewerSqlConnection):Promise<T>{
    const c=shared??await this.pool.connect();let open=false;
    try{
      await c.query('BEGIN');open=true;
      await c.query("SET LOCAL lock_timeout='3s'");
      await c.query("SET LOCAL statement_timeout='5s'");
      const result=await callback(c);
      await c.query('COMMIT');open=false;
      return result;
    }catch(e){
      if(open)try{await c.query('ROLLBACK');}catch{/* preserve the failure */}
      throw e;
    }finally{if(!shared)c.release();}
  }
  async enqueue(raw:{actorRef:string;sourceId:string;permissionRef:string;requestKey:string}):
    Promise<{jobId:string;created:boolean}>{
    const input=Request.parse(raw);
    if(!await this.authority.mayProcess({...input,now:this.now()}))
      throw new SourceQueueDenied();
    return this.withTransaction(async c=>{
      // Serialize enqueues across all process instances before capacity and duplicate checks.
      await c.query('SELECT pg_advisory_xact_lock($1::bigint)',[64091001]);
      const exists=await c.query(`SELECT job_id,actor_ref,permission_ref FROM source_ingest_jobs
        WHERE source_id=$1 AND request_key=$2 LIMIT 2`,[input.sourceId,input.requestKey]);
      if(exists.rows.length>1)throw new Error('Duplicate source queue key');
      if(exists.rows.length===1){
        const row=exists.rows[0]!;
        if(row.actor_ref!==input.actorRef||row.permission_ref!==input.permissionRef)
          throw new SourceQueueConflict();
        return {jobId:z.string().uuid().parse(row.job_id),created:false};
      }
      const pending=await c.query(`SELECT count(*)::integer AS count FROM source_ingest_jobs
        WHERE state IN ('PENDING','LEASED')`);
      const count:unknown=pending.rows[0]?.count;
      if(pending.rows.length!==1||typeof count!=='number'||!Number.isInteger(count)||count<0)
        throw new Error('Invalid source queue count');
      if(count>=16)throw new SourceQueueCapacity();
      const jobId=randomUUID();
      const inserted=await c.query(`INSERT INTO source_ingest_jobs
        (job_id,actor_ref,source_id,permission_ref,request_key)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(source_id,request_key) DO NOTHING
        RETURNING job_id`,[jobId,input.actorRef,input.sourceId,input.permissionRef,input.requestKey]);
      if(inserted.rows.length!==1)throw new Error('Concurrent queue conflict');
      return {jobId,created:true};
    });
  }

  /** Read-only requester status. Does not claim, recover or retry a job, and
   * never releases a running worker's global lock based on a stale lease. */
  async inspect(raw:{actorRef:string;sourceId:string;permissionRef:string;jobId:string}):Promise<SourceJobStatus|null>{
    const input=z.strictObject({actorRef:Ref,sourceId:Ref,permissionRef:Ref,jobId:z.uuid()}).parse(raw);
    const permission={actorRef:input.actorRef,sourceId:input.sourceId,permissionRef:input.permissionRef};
    if(await this.authority.mayProcess({...permission,now:this.now()})!==true)return null;
    const c=await this.pool.connect();let open=false,result:SourceJobStatus|null=null;
    try{
      await c.query('BEGIN TRANSACTION READ ONLY');open=true;
      await c.query("SET LOCAL statement_timeout='5s'");
      const rows=await c.query(`SELECT job_id,actor_ref,source_id,permission_ref,state,attempt_count,queued_at,updated_at,
        lease_until,outcome_revision_id,last_error_code,clock_timestamp() AS observed_at,
        COALESCE(lease_until<=clock_timestamp(),false) AS lease_expired
        FROM source_ingest_jobs WHERE job_id=$1 AND actor_ref=$2 AND source_id=$3 AND permission_ref=$4 LIMIT 2`,
      [input.jobId,input.actorRef,input.sourceId,input.permissionRef]);
      if(rows.rows.length>1)throw new Error('Ambiguous source queue status');
      const row=rows.rows[0];
      if(row){
        if(row.job_id!==input.jobId||row.actor_ref!==input.actorRef||row.source_id!==input.sourceId||row.permission_ref!==input.permissionRef
          ||typeof row.lease_expired!=='boolean')throw new Error('Source queue status binding mismatch');
        const time=(value:unknown)=>z.iso.datetime({offset:true}).parse(value instanceof Date?value.toISOString():value);
        result=SourceJobStatusSchema.parse({jobId:row.job_id,sourceId:row.source_id,state:row.state,attemptCount:row.attempt_count,
          queuedAt:time(row.queued_at),updatedAt:time(row.updated_at),observedAt:time(row.observed_at),
          ...(row.lease_until===null?{}:{leaseUntil:time(row.lease_until)}),
          ...(row.outcome_revision_id===null?{}:{outcomeRevisionId:row.outcome_revision_id}),
          ...(row.last_error_code===null?{}:{lastErrorCode:row.last_error_code}),
          requiresOperatorReview:row.state==='NEEDS_REVIEW'||row.state==='LEASED'&&row.lease_expired});
      }
      await c.query('COMMIT');open=false;
    }finally{if(open)try{await c.query('ROLLBACK');}catch{/* preserve failure */}c.release();}
    return await this.authority.mayProcess({...permission,now:this.now()})===true?result:null;
  }

  private async claim(c:ReviewerSqlConnection):Promise<z.infer<typeof Job>|null>{
    return this.withTransaction(async c=>{
      // This lock is transaction-scoped. No network work occurs under a DB lock.
      const guard=await c.query('SELECT pg_try_advisory_xact_lock($1::bigint) AS acquired',[64091002]);
      if(guard.rows.length!==1||guard.rows[0]?.acquired!==true)return null;
      // A dead worker's lease is UNKNOWN; never re-run an uncertain provider action.
      await c.query(`UPDATE source_ingest_jobs SET state='NEEDS_REVIEW',
        lease_token=NULL,lease_until=NULL,last_error_code='UNKNOWN_COMPLETION',
        updated_at=clock_timestamp()
        WHERE state='LEASED' AND lease_until<=clock_timestamp()`);
      const busy=await c.query(`SELECT job_id FROM source_ingest_jobs
        WHERE state='LEASED' AND lease_until>clock_timestamp() LIMIT 1`);
      if(busy.rows.length>0)return null;
      const candidates=await c.query(`SELECT job_id,actor_ref,source_id,permission_ref,request_key
        FROM source_ingest_jobs WHERE state='PENDING'
        ORDER BY queued_at,job_id LIMIT 1 FOR UPDATE SKIP LOCKED`);
      if(candidates.rows.length===0)return null;
      if(candidates.rows.length!==1)throw new Error('Unsafe source queue claim');
      const job=candidates.rows[0]!,token=randomUUID();
      const result=await c.query(`UPDATE source_ingest_jobs SET state='LEASED',
        attempt_count=attempt_count+1,lease_token=$2,lease_until=clock_timestamp()+interval '30 seconds',
        updated_at=clock_timestamp() WHERE job_id=$1 AND state='PENDING'
        AND attempt_count=0 RETURNING job_id,actor_ref,source_id,permission_ref,request_key,lease_token`,
      [job.job_id,token]);
      if(result.rows.length!==1)throw new Error('Unsafe source queue lease');
      return Job.parse(result.rows[0]);
    },c);
  }

  private async settle(c:ReviewerSqlConnection,job:z.infer<typeof Job>,
    state:'NEW_DRAFT'|'CHANGED_DRAFT'|'UNCHANGED'|'BLOCKED_RIGHTS'|'NEEDS_REVIEW',
    revisionId:string|null=null):Promise<void>{
    const lastError=state==='BLOCKED_RIGHTS'?'RIGHTS_DENIED'
      :state==='NEEDS_REVIEW'?'SOURCE_FAILURE':null;
    const result=await c.query(`UPDATE source_ingest_jobs SET
        state=$3,lease_token=NULL,lease_until=NULL,outcome_revision_id=$4,
        last_error_code=$5,updated_at=clock_timestamp()
        WHERE job_id=$1 AND lease_token=$2 AND state='LEASED'
        AND lease_until>clock_timestamp() RETURNING job_id`,
      [job.job_id,job.lease_token,state,revisionId,lastError]);
    if(result.rows.length!==1)throw new Error('Source lease lost; operator must review');
  }

  async runOne():Promise<SourceQueueRunResult>{
    if(this.running)throw new Error('Source queue permits one worker per process');
    this.running=true;
    let c:ReviewerSqlConnection|undefined;
    let held=false,uncertain=false;
    try{
      // A 30-second durable lease is only a *fencing receipt*, not a mutex:
      // an executor can still be running when its lease expires. Keep one
      // PostgreSQL SESSION advisory lock over the entire execution instead.
      // No row lock or open SQL transaction is held during external IO.
      // Reuse this same connection for short claim/settle transactions so a
      // pool limited to a single connection cannot deadlock.
      c=await this.pool.connect();
      uncertain=true;
      const guard=await c.query(
        'SELECT pg_try_advisory_lock($1::bigint) AS acquired',[64091003]);
      if(guard.rows.length!==1||typeof guard.rows[0]?.acquired!=='boolean')
        throw new Error('Invalid source queue global execution guard');
      uncertain=false;
      if(!guard.rows[0]!.acquired)return {state:'IDLE'};
      held=true;
      const job=await this.claim(c);
      if(!job)return {state:'IDLE'};
      const permission={actorRef:job.actor_ref,sourceId:job.source_id,
        permissionRef:job.permission_ref,now:this.now()};
      try{
        if(!await this.authority.mayProcess(permission)){
          await this.settle(c,job,'BLOCKED_RIGHTS');
          return {jobId:job.job_id,state:'BLOCKED_RIGHTS'};
        }
        const output=await this.executor.execute({
          actorRef:job.actor_ref,sourceId:job.source_id,permissionRef:job.permission_ref,
        });
        if(!['NEW_DRAFT','CHANGED_DRAFT','NOT_MODIFIED'].includes(output.kind)
          ||!Ref.safeParse(output.revisionId).success)
          throw new Error('Executor returned untrusted result');
        if(!await this.authority.mayProcess({...permission,now:this.now()})){
          await this.settle(c,job,'BLOCKED_RIGHTS');
          return {jobId:job.job_id,state:'BLOCKED_RIGHTS'};
        }
        const state=output.kind==='NOT_MODIFIED'?'UNCHANGED':output.kind;
        await this.settle(c,job,state,output.revisionId);
        return {jobId:job.job_id,state};
      }catch(e){
        // A failed handler may have committed a draft. NEVER automatically retry it.
        // A failed acknowledgement is also ambiguous; keep the lease for quarantine.
        if(e instanceof Error&&e.message.startsWith('Source lease lost'))throw e;
        await this.settle(c,job,'NEEDS_REVIEW');
        return {jobId:job.job_id,state:'NEEDS_REVIEW'};
      }
    }finally{
      try{
        if(c){
          if(held){
            try{
              const unlocked=await c.query(
                'SELECT pg_advisory_unlock($1::bigint) AS unlocked',[64091003]);
              if(unlocked.rows.length!==1||unlocked.rows[0]?.unlocked!==true)
                throw new Error('Source queue global lock release failed');
              held=false;
            }catch{
              uncertain=true;
            }
          }
          if(uncertain){
            // PoolClient.release(error) discards a connection that might still
            // own a lock. Never return an uncertain locked session to a pool.
            const error=new Error('Source queue global lock release failed');
            (c as ReviewerSqlConnection & {release(error?:Error):void}).release(error);
            throw error;
          }
          c.release();
        }
      }finally{this.running=false;}
    }
  }
}
