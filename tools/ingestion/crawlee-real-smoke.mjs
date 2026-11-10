/** Real Crawlee 3.18.2 API smoke. No page request, source URL or NCP data. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {BasicCrawler,RequestQueue} from 'crawlee';
import {dispatchApprovedCrawleeQueue} from './crawlee-approved-dispatch.mjs';

const queue=await RequestQueue.open('hufs-synthetic-'+randomUUID());
let calls=0;
try{
  const result=await dispatchApprovedCrawleeQueue({
    BasicCrawler,requestQueue:queue,maxJobs:2,
    queue:{runOne:async()=>{
      calls++;
      return calls===1?{state:'UNCHANGED',
        jobId:'00000000-0000-4000-8000-000000000001'}:{state:'IDLE'};
    }},
  });
  assert.deepEqual(result,{
    state:'BATCH_COMPLETE',processed:1,idleObserved:true,activeRevisions:0,
  });
  assert.equal(calls,2);
  // Actual Crawlee must not invoke a second durable SQL job after a
  // NEEDS_REVIEW/ambiguous outcome, even when the request handler fails.
  const failQueue=await RequestQueue.open('hufs-synthetic-fail-'+randomUUID());
  try{
    let deniedCalls=0;
    await assert.rejects(dispatchApprovedCrawleeQueue({
      BasicCrawler,requestQueue:failQueue,maxJobs:3,
      queue:{runOne:async()=>{
        deniedCalls++;
        return {state:'NEEDS_REVIEW',jobId:'00000000-0000-4000-8000-000000000002'};
      }},
    }),/APPROVED_SOURCE_DISPATCH_BLOCKED/);
    assert.equal(deniedCalls,1);
  }finally{
    await failQueue.drop();
  }
  process.stdout.write('CRAWLEE_REAL_API_SYNTHETIC_PASS\n');
}finally{
  await queue.drop();
}
