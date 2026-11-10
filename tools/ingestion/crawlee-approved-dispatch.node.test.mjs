import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {dispatchApprovedCrawleeQueue,createApprovedCrawleeRefreshWorker}
  from './crawlee-approved-dispatch.mjs';

const jobId='00000000-0000-4000-8000-000000000001';
function fixture(outcomes=[{state:'NEW_DRAFT',jobId},{state:'IDLE'}]){
  let options,queued=[],called=0,mutate=null,skip=false;
  class BasicCrawler{
    constructor(value){options=value;}
    async run(seeds){
      for(const seed of seeds){
        const request=mutate?mutate(seed):seed;
        queued.push(request);
        if(skip){await options.onSkippedRequest({request});continue;}
        try{await options.requestHandler({request});}
        catch{await options.failedRequestHandler({request});}
      }
    }
  }
  const queue={runOne:async()=>{const result=outcomes[called]??{state:'IDLE'};called++;return result;}};
  const requestQueue={addRequest:async()=>{}};
  const params={BasicCrawler,requestQueue,queue,maxJobs:3};
  return {params,queued,get called(){return called;},get options(){return options;},
    mutate:fn=>{mutate=fn;},skip:()=>{skip=true;}};
}
describe('#445 Crawlee ticks use the durable PostgreSQL queue, never raw executor',()=>{
  it('runs capped unique virtual ticks; PostgreSQL owns DRAFT and locks',async()=>{
    const f=fixture([{state:'NEW_DRAFT',jobId},{state:'UNCHANGED',jobId},{state:'IDLE'}]);
    const result=await dispatchApprovedCrawleeQueue(f.params);
    assert.deepEqual(result,{state:'BATCH_COMPLETE',processed:2,
      idleObserved:true,activeRevisions:0});
    assert.equal(f.called,3);
    assert.equal(f.options.maxConcurrency,1);
    assert.equal(f.options.maxRequestRetries,0);
    assert.equal(f.options.useSessionPool,false);
    assert.equal(f.options.maxRequestsPerCrawl,3);
    assert.equal(new Set(f.queued.map(r=>r.uniqueKey)).size,3);
    assert.ok(f.queued.every(r=>r.url.startsWith('https://queue.invalid/')
      &&!r.url.includes('SYN-SOURCE')));
  });
  it('does not poll the durable queue again after IDLE (also a busy lease)',async()=>{
    const f=fixture([{state:'IDLE'}]);
    assert.deepEqual(await dispatchApprovedCrawleeQueue(f.params),
      {state:'BATCH_COMPLETE',processed:0,idleObserved:true,activeRevisions:0});
    assert.equal(f.called,1);
  });
  it('fails closed on changed or stale virtual tick before any durable call',async()=>{
    const f=fixture();f.mutate(seed=>({...seed,url:'https://evil.example.org/source'}));
    await assert.rejects(dispatchApprovedCrawleeQueue(f.params),/APPROVED_SOURCE_DISPATCH_BLOCKED/);
    assert.equal(f.called,0);
  });
  it('a denied or uncertain durable job never counts as successful',async()=>{
    for(const state of ['BLOCKED_RIGHTS','NEEDS_REVIEW','CORRUPT']){
      const f=fixture([{state,jobId}]);
      await assert.rejects(dispatchApprovedCrawleeQueue(f.params),
        /APPROVED_SOURCE_DISPATCH_BLOCKED/);
      assert.equal(f.called,1);
    }
    const f=fixture([{state:'NEW_DRAFT',jobId:'bogus'}]);
    await assert.rejects(dispatchApprovedCrawleeQueue(f.params),
      /APPROVED_SOURCE_DISPATCH_BLOCKED/);
  });
  it('failed, skipped or incomplete Crawlee processing is not a successful refresh',async()=>{
    const f=fixture();f.skip();
    await assert.rejects(dispatchApprovedCrawleeQueue(f.params),
      /APPROVED_SOURCE_DISPATCH_BLOCKED/);
    assert.equal(f.called,0);
    const incomplete=fixture();
    incomplete.params.BasicCrawler=class {async run(){/* processed no requests */}};
    await assert.rejects(dispatchApprovedCrawleeQueue(incomplete.params),
      /APPROVED_SOURCE_DISPATCH_BLOCKED/);
  });
  it('requires bounded work, an explicit private queue and a durable runOne',async()=>{
    for(const fields of [
      {maxJobs:0},{maxJobs:17},{queue:{}},{requestQueue:{}},{BasicCrawler:null},
    ]){
      const f=fixture();
      await assert.rejects(dispatchApprovedCrawleeQueue({...f.params,...fields}),
        /APPROVED_SOURCE_DISPATCH_BLOCKED/);
      assert.equal(f.called,0);
    }
  });
  it('one-shot worker closes private queue exactly once',async()=>{
    const f=fixture(),closed=[];
    const worker=createApprovedCrawleeRefreshWorker({...f.params,maxJobs:1,
      closeQueue:async()=>{closed.push('closed');}});
    assert.deepEqual(await worker.runOnce(),{
      state:'BATCH_COMPLETE',processed:1,idleObserved:false,activeRevisions:0,
    });
    await assert.rejects(worker.runOnce(),/APPROVED_SOURCE_DISPATCH_BLOCKED/);
    await worker.close();await worker.close();
    assert.deepEqual(closed,['closed']);
    await assert.rejects(worker.runOnce(),/APPROVED_SOURCE_DISPATCH_BLOCKED/);
    assert.throws(()=>createApprovedCrawleeRefreshWorker(f.params),
      /APPROVED_SOURCE_DISPATCH_BLOCKED/);
  });
});
