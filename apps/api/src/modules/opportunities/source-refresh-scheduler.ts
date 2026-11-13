import {z} from 'zod';
import type {ReviewerSqlPool} from '../auth/reviewer-postgres.js';
import type {PostgresSourceIngestionQueue} from './source-ingestion-queue-postgres.js';

const Ref=z.string().min(1).max(96).regex(/^[A-Za-z0-9_.:@-]+$/);
const Schedule=z.strictObject({sourceId:Ref,permissionRef:Ref,actorRef:Ref,
  scheduleVersion:z.string().min(1).max(64).regex(/^[A-Za-z0-9_.-]+$/),
  anchorAt:z.iso.datetime({offset:true}),intervalSeconds:z.number().int().min(300).max(30*86400),
});
export type ApprovedSourceRefreshSchedule=z.infer<typeof Schedule>;
type Queue=Pick<PostgresSourceIngestionQueue,'enqueueInTransaction'>;
const SETTLED=new Set(['NEW_DRAFT','CHANGED_DRAFT','UNCHANGED']);

/** Explicit NCP-private schedule input, never discovered URLs or HTTP fields.
 * Uses the existing job ledger and rights-aware enqueue; no second job engine,
 * migration, timer, source fetch, or implicit retry is introduced.
 * One stable key per UTC interval, including after a crash; missed intervals
 * coalesce into the current window instead of an unbounded catch-up batch. */
export class PostgresSourceRefreshScheduler {
  constructor(private readonly pool:ReviewerSqlPool,private readonly queue:Queue,
    private readonly now:()=>string=()=>new Date().toISOString()){}

  async enqueueDue(raw:readonly ApprovedSourceRefreshSchedule[]):Promise<{queued:number;skipped:number;held:number}>{
    try{
      const schedules=Schedule.array().max(16).parse(raw);
      if(new Set(schedules.map(s=>s.sourceId)).size!==schedules.length)throw new Error();
      const time=Date.parse(z.iso.datetime({offset:true}).parse(this.now()));
      const counts={queued:0,skipped:0,held:0};
      for(const schedule of schedules){
        const anchor=Date.parse(schedule.anchorAt),interval=schedule.intervalSeconds*1000;
        if(time<anchor){counts.skipped++;continue;}
        const due=new Date(anchor+Math.floor((time-anchor)/interval)*interval).toISOString();
        const requestKey='refresh:'+schedule.scheduleVersion+':'+due;
        const c=await this.pool.connect();let open=false;
        try{
          await c.query('BEGIN');open=true;
          await c.query("SET LOCAL lock_timeout='3s'");
          await c.query("SET LOCAL statement_timeout='5s'");
          // The queue also takes its global capacity lock. This lock
          // serializes only schedulers for this source, across process instances.
          await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,64091003))',[schedule.sourceId]);
          const latest=await c.query(`SELECT request_key,state,updated_at FROM source_ingest_jobs
            WHERE source_id=$1 ORDER BY queued_at DESC,job_id DESC LIMIT 1`,[schedule.sourceId]);
          if(latest.rows.length>1)throw new Error();
          const previous=latest.rows[0];
          const updated=previous?.updated_at;
          const updatedTime=updated instanceof Date?updated.getTime():typeof updated==='string'?Date.parse(updated):NaN;
          if(previous?.request_key===requestKey){counts.skipped++;}
          else if(previous&&!SETTLED.has(String(previous.state))){counts.held++;}
          else if(previous&&(!Number.isFinite(updatedTime)||updatedTime>time)){counts.held++;}
          else if(previous&&time-updatedTime<interval){counts.skipped++;}
          else{
            // The queue independently rechecks current actor/source/purpose
            // rights before accepting this key, including on an idempotent replay.
            const result=await this.queue.enqueueInTransaction(c,{actorRef:schedule.actorRef,sourceId:schedule.sourceId,
              permissionRef:schedule.permissionRef,requestKey});
            if(result.created)counts.queued++;else counts.skipped++;
          }
          await c.query('COMMIT');open=false;
        }catch(error){
          if(open)try{await c.query('ROLLBACK');}catch{/* preserve failure */}
          throw error;
        }finally{c.release();}
      }
      return counts;
    }catch{throw new Error('Source refresh scheduling failed');}
  }
}

/** One-shot composition for createNativeApprovedQueueWorker({queue}). The
 * private loader reads current NCP schedules exactly once per worker run.
 * Scheduling failure never falls back to processing or an unguarded fetch. */
export function createScheduledSourceQueue(input:{
  scheduler:PostgresSourceRefreshScheduler;
  loadSchedules:()=>Promise<readonly ApprovedSourceRefreshSchedule[]>;
  queue:Pick<PostgresSourceIngestionQueue,'runOne'>;
}):Pick<PostgresSourceIngestionQueue,'runOne'>{
  let prepared:Promise<unknown>|undefined;
  return {async runOne(){
    prepared??=(async()=>{
      try{await input.scheduler.enqueueDue(await input.loadSchedules());}
      catch{throw new Error('Source refresh scheduling failed');}
    })();
    await prepared;return input.queue.runOne();
  }};
}
