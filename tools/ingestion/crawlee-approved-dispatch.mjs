/**
 * #445 — Crawlee schedules bounded *virtual* ticks only. PostgreSQL's
 * PostgresSourceIngestionQueue.runOne() owns durable claims, rights rechecks,
 * global execution lock, idempotence, egress, DRAFT writes and recovery.
 *
 * Never pass source URLs or call the durable executor directly from Crawlee:
 * that would bypass the source_ingest_jobs ledger. BasicCrawler performs NO
 * HTTP/Playwright navigation in this adapter.
 */
import {randomUUID} from 'node:crypto';

const BLOCKED='APPROVED_SOURCE_DISPATCH_BLOCKED';
const TICK_ORIGIN='https://queue.invalid/hufs-one-ai/tick/';
const COMPLETED=new Set(['NEW_DRAFT','CHANGED_DRAFT','UNCHANGED']);
function deny(){throw new Error(BLOCKED);}

export async function dispatchApprovedCrawleeQueue({
  BasicCrawler,requestQueue,queue,maxJobs=16,
}){
  if(typeof BasicCrawler!=='function'
    ||typeof requestQueue?.addRequest!=='function'
    ||typeof queue?.runOne!=='function'
    ||!Number.isInteger(maxJobs)||maxJobs<1||maxJobs>16)deny();

  // Every invocation uses a new namespace; the factory MUST additionally open
  // an empty, private queue per invocation. An old pending tick fails closed.
  const batchId=randomUUID();
  const seeds=Array.from({length:maxJobs},(_,index)=>({
    url:TICK_ORIGIN+(index+1),uniqueKey:batchId+':'+(index+1),
  }));
  const expected=new Map(seeds.map(seed=>[seed.uniqueKey,seed.url]));
  const seen=new Set();
  let idle=false,processed=0,failures=0;

  const crawler=new BasicCrawler({
    requestQueue,
    maxConcurrency:1,minConcurrency:1,maxRequestsPerCrawl:maxJobs,
    maxRequestRetries:0,maxSessionRotations:0,useSessionPool:false,
    requestHandlerTimeoutSecs:120,
    async requestHandler({request}){
      const key=request?.uniqueKey;
      if(typeof key!=='string'||!expected.has(key)
        ||request.url!==expected.get(key)||seen.has(key))deny();
      seen.add(key);
      if(idle)return; // No further DB calls after the first unavailable lease.
      const result=await queue.runOne();
      if(!result||typeof result.state!=='string')deny();
      if(result.state==='IDLE'){
        idle=true;return;
      }
      // The durable queue itself settles failed/denied jobs to NEEDS_REVIEW or
      // BLOCKED_RIGHTS. Do not convert them into a successful timer run.
      if(!COMPLETED.has(result.state)
        ||typeof result.jobId!=='string'
        ||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.jobId))
        deny();
      processed++;
    },
    async failedRequestHandler(){failures++;},
    async onSkippedRequest(){failures++;},
  });
  await crawler.run(seeds);
  if(failures||seen.size!==seeds.length)deny();
  // IDLE can also mean a global lock is held, not necessarily an empty queue.
  return {state:'BATCH_COMPLETE',processed,idleObserved:idle,activeRevisions:0};
}

/** Fits refresh-cli.mjs runOnce/close without spawning a second queue/worker. */
export function createApprovedCrawleeRefreshWorker(config){
  if(typeof config?.closeQueue!=='function')deny();
  let state='NEW';
  return {
    async runOnce(){
      if(state!=='NEW')deny();
      state='USED';
      return dispatchApprovedCrawleeQueue(config);
    },
    async close(){
      if(state==='CLOSED')return;
      state='CLOSED';
      await config.closeQueue();
    },
  };
}
