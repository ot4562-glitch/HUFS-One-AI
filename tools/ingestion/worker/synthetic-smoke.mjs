/** Real Crawlee 3.18.2 API smoke. No page request, source URL or NCP data. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {BasicCrawler,RequestQueue} from 'crawlee';
import {load} from 'cheerio';
import {extractReviewedLinkCandidates} from '../approved-link-candidates.mjs';
import {dispatchApprovedCrawleeQueue} from '../crawlee-approved-dispatch.mjs';
import {collectCandidatesFromApprovedBytes,createNativeApprovedQueueWorker} from './native-worker.mjs';

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
  const candidateOptions={
    canonicalUrl:'https://example.org/notices/1',
    approvedOrigin:'https://example.org/',
    allowPathPrefixes:['/notices','/files'],
  };
  const parsedHtml=load('<main><a href="/notices/2">두 번째 공고</a><a href="https://blocked.example.org/">외부</a></main>');
  assert.deepEqual(extractReviewedLinkCandidates({$:parsedHtml,...candidateOptions}).candidates,[
    {url:'https://example.org/notices/2',type:'DOCUMENT',label:'두 번째 공고'},
  ]);
  const parsedRss=load('<rss><channel><item><link>https://example.org/files/a.pdf</link></item></channel></rss>',{xmlMode:true});
  assert.deepEqual(extractReviewedLinkCandidates({$:parsedRss,...candidateOptions,kind:'RSS'}).candidates,[
    {url:'https://example.org/files/a.pdf',type:'ATTACHMENT'},
  ]);
  const parsedSitemap=load('<urlset><url><loc>https://example.org/notices/3</loc></url></urlset>',{xmlMode:true});
  assert.deepEqual(extractReviewedLinkCandidates({$:parsedSitemap,...candidateOptions,kind:'SITEMAP'}).candidates,[
    {url:'https://example.org/notices/3',type:'DOCUMENT'},
  ]);
  const encoded=new TextEncoder().encode('<div><a href="/notices/9">New</a><a href="https://outside.example/">No</a></div>');
  const fromWorker=collectCandidatesFromApprovedBytes({
    content:encoded,kind:'HTML',...candidateOptions,
  });
  assert.equal(fromWorker.state,'REVIEW_REQUIRED');
  assert.deepEqual(fromWorker.candidates,[{
    url:'https://example.org/notices/9',type:'DOCUMENT',label:'New',
  }]);
  for(const content of [
    new Uint8Array(),new TextEncoder().encode('<!DOCTYPE note [<!ENTITY x SYSTEM "file:///etc/passwd">]><note/>'),
  ]){
    assert.throws(()=>collectCandidatesFromApprovedBytes({content,kind:'HTML',...candidateOptions}),
      /CONFIGURATION_REQUIRED/);
  }
  await assert.rejects(createNativeApprovedQueueWorker({queue:{runOne:async()=>({state:'IDLE'})}}),
    /CONFIGURATION_REQUIRED/);
  process.stdout.write('CRAWLEE_REAL_API_SYNTHETIC_PASS\n');
}finally{
  await queue.drop();
}
