import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {dispatchApprovedCrawleeSources} from './crawlee-approved-dispatch.mjs';

const source={actorRef:'SYN-OPERATOR',sourceId:'SYN-SOURCE',
  permissionRef:'SYN-PERMISSION',canonicalUrl:'https://example.org/notices/synthetic'};
function fixture(){
  let rights=true,forceFailure=false;
  const requests=[],calls=[];
  let settings;
  class BasicCrawler {
    constructor(options){settings=options;}
    async run(seeds){
      for(const s of seeds){
        requests.push(s);
        try{
          await settings.requestHandler({request:forceFailure?{...s,url:'https://evil.example.org/'}:s});
        }catch(error){await settings.failedRequestHandler({request:s},error);}
      }
      return {};
    }
  }
  const requestQueue={addRequest:async()=>{}};
  const authority={mayProcess:async input=>(calls.push(['rights',input.sourceId]),rights)};
  const executor={execute:async input=>(calls.push(['executor',input.sourceId]),
    {kind:'NEW_DRAFT',revisionId:'SYN-REVISION'})};
  const run=(sources=[source])=>dispatchApprovedCrawleeSources({
    sources,BasicCrawler,requestQueue,authority,executor,
    now:()=> '2026-11-10T10:00:00Z',
  });
  return {run,requests,calls,get settings(){return settings;},
    block:()=>{rights=false;},fail:()=>{forceFailure=true;}};
}
describe('#445 approved durable executor with Crawlee BasicCrawler',()=>{
  it('delegates only approved requests to existing durable executor',async()=>{
    const f=fixture();
    assert.deepEqual(await f.run(),{state:'DRAFT_REFRESH_COMPLETE',handled:1,activeRevisions:0});
    assert.deepEqual(f.calls.map(x=>x[0]),['rights','rights','executor','rights']);
    assert.deepEqual(f.requests,[{url:source.canonicalUrl,
      uniqueKey:JSON.stringify([source.sourceId,source.permissionRef,source.actorRef])}]);
    assert.equal(f.settings.requestQueue.addRequest instanceof Function,true);
    assert.equal(f.settings.maxConcurrency,1);
    assert.equal(f.settings.maxRequestRetries,0);
    assert.equal(f.settings.useSessionPool,false);
  });
  it('blocks absent source rights before Crawlee starts',async()=>{
    const f=fixture();f.block();
    await assert.rejects(f.run(),/APPROVED_SOURCE_DISPATCH_BLOCKED/);
    assert.equal(f.settings,undefined);assert.equal(f.requests.length,0);
  });
  it('never dispatches a changed queued URL',async()=>{
    const f=fixture();f.fail();
    await assert.rejects(f.run(),/APPROVED_SOURCE_DISPATCH_BLOCKED/);
    assert.equal(f.calls.some(x=>x[0]==='executor'),false);
  });
  it('refuses duplicate registry identities, URLs, and unsafe authority',async()=>{
    for(const entries of [
      [source,source],
      [source,{...source,sourceId:'SYN-OTHER'}],
      [{...source,canonicalUrl:'http://example.org/path'}],
      [{...source,canonicalUrl:'https://127.0.0.1/admin'}],
      [{...source,canonicalUrl:'https://example.internal/private'}],
      [{...source,canonicalUrl:'https://foo.example.org/?redirect=evil'}],
      [{...source,canonicalUrl:'https://admin:pw@example.org/'}],
      [],
    ]) {
      const f=fixture();
      await assert.rejects(f.run(entries),/APPROVED_SOURCE_DISPATCH_BLOCKED/);
      assert.equal(f.settings,undefined);
    }
  });
  it('rejects an unknown source in an existing queue without fetching it',async()=>{
    const f=fixture();
    f.fail();
    await assert.rejects(f.run(),/APPROVED_SOURCE_DISPATCH_BLOCKED/);
    assert.equal(f.requests.length,1);
    assert.equal(f.calls.some(x=>x[0]==='executor'),false);
  });
});
