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
  process.stdout.write('CRAWLEE_REAL_API_SYNTHETIC_PASS\n');
}finally{
  await queue.drop();
}
