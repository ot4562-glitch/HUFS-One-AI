/** Synthetic SDK/process harness. Does not prove a Linux sandbox or real render. */
import {test,mock,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const runtimeUrl=new URL('../../../dist/apps/api/src/modules/opportunities/source-browser-runtime.js',import.meta.url);
const realRuntime=await import(runtimeUrl.href);
let launches=0,checks=0,closed=0,mode='',launchOptions,pageOptions,resourceChecks=0,releaseLaunch,teardowns=0;
mock.module(runtimeUrl.href,{namedExports:{...realRuntime,verifySourceBrowserRuntime:async()=>{checks++;}}});
const version='130.0.1.2',browser={version:()=>mode==='version'?'131.0.1.2':version,close:async()=>{
  closed++;if(mode==='hung-close')await new Promise(()=>{});
  if(mode==='reject-close')throw new Error('SYNTHETIC close failure');
}};
mock.module('playwright-core',{namedExports:{chromium:{name:()=> 'chromium',launch:async options=>{
  launches++;launchOptions=options;if(mode==='late')await new Promise(resolve=>{releaseLaunch=resolve;});return browser;
}}}});
const canonicalUrl='https://synthetic.example.edu/notice',frame={};
const original=Buffer.from('<main><script src="/app.js"></script></main>');
const dom='<html><body><main><p>SYNTHETIC rendered notice</p></main></body></html>';
const script=Buffer.from('document.querySelector("main").innerHTML="<p>SYNTHETIC rendered notice</p>"');
const hash=b=>createHash('sha256').update(b).digest('hex');
class FakeCrawler{
  constructor(options){this.options=options;}
  async run(){
    const o=this.options;await o.launchContext.launcher.launch({proxy:{server:'http://127.0.0.1:9999'},
      args:['--no-sandbox'],executablePath:'/UNTRUSTED'});
    pageOptions={proxy:{server:'http://127.0.0.1:9999'}};
    await o.browserPoolOptions.prePageCreateHooks[0]('SYN',{},pageOptions);
    let handle;
    const context={route:async(_glob,handler)=>{handle=handler;},routeWebSocket:async()=>{},on:()=>{}};
    const page={context:()=>context,mainFrame:()=>frame,on:()=>{},url:()=>canonicalUrl,
      waitForSelector:async()=>{},content:async()=>dom};
    await o.preNavigationHooks[0]({page},{});
    const request=async(url,type,navigation)=>{
      let abort=false;
      await handle({request:()=>({url:()=>url,method:()=> 'GET',resourceType:()=>type,frame:()=>frame,
        headers:()=>({}),isNavigationRequest:()=>navigation}),fulfill:async()=>{},abort:async()=>{abort=true;}});
      if(abort)throw new Error('blocked');
    };
    await request(canonicalUrl,'document',true);
    await request(mode==='unknown'?'https://synthetic.example.edu/unknown.js':'https://synthetic.example.edu/app.js','script',false);
    await o.requestHandler({page,request:{url:canonicalUrl}});
  }
  async teardown(){teardowns++;}
}
mock.module('crawlee',{namedExports:{PlaywrightCrawler:FakeCrawler,
  Configuration:class{},MemoryStorage:class{},Log:class{},LogLevel:{OFF:0},
  RequestList:{open:async()=>({teardown:async()=>{teardowns++;}})}}});
const {createApprovedPlaywrightExtractor}=await import('./approved-playwright-extractor.mjs');
const platform=Object.getOwnPropertyDescriptor(process,'platform'),uid=Object.getOwnPropertyDescriptor(process,'getuid');
Object.defineProperty(process,'platform',{value:'linux',configurable:true});
Object.defineProperty(process,'getuid',{value:()=>1000,configurable:true});
after(()=>{Object.defineProperty(process,'platform',platform);if(uid)Object.defineProperty(process,'getuid',uid);else delete process.getuid;});
const runtime={wrapperSha256:'a'.repeat(64),bwrapSha256:'b'.repeat(64),rootfsSha256:'c'.repeat(64),
  chromiumVersion:version,policyVersion:'SYN-BROWSER-1'};
const input={content:original,contentType:'text/html; charset=utf-8',canonicalUrl,
  sourceId:'SYN-SOURCE',sourceRevisionId:'SYN-REV',permissionRef:'SYN-PERM',actorRef:'SYN-OPERATOR',
  originalSha256:hash(original),assertSourceRights:async()=>{}};
async function make(enabled=true){
  launches=checks=closed=resourceChecks=teardowns=0;mode='';releaseLaunch=undefined;
  return createApprovedPlaywrightExtractor({runtime,enabled,now:()=> '2026-11-11T00:00:00Z',resources:{load:async()=>({
    resources:[{bytes:script,contentType:'text/javascript; charset=utf-8',manifest:{sourceId:'SYN-ASSET',revisionId:'SYN-ASSET-REV',
      permissionRef:'SYN-ASSET-PERM',rightsReceiptId:'SYN-RIGHT',canonicalUrl:'https://synthetic.example.edu/app.js',
      kind:'SCRIPT',originalSha256:hash(script),byteLength:script.length}}],
    revalidate:async()=>{resourceChecks++;if(mode==='revoked')throw new Error('SYNTHETIC revoked');},
  })}});
}
test('binds separate raw/DOM proof, validates runtime twice and discards SDK launch mutations',async()=>{
  const adapter=await make(),result=await adapter.extract(input);
  assert.equal(launches,1);assert.equal(checks,2);assert.ok(closed>=1);assert.ok(resourceChecks>=4);
  assert.equal(result.evidence.originalSha256,hash(original));assert.equal(result.evidence.domSha256,hash(Buffer.from(dom)));
  assert.equal(result.paragraphs[0].text,'SYNTHETIC rendered notice');assert.equal(result.evidence.resources.length,1);
  assert.equal(launchOptions.executablePath,realRuntime.SOURCE_BROWSER_WRAPPER);
  assert.equal(launchOptions.chromiumSandbox,true);assert.equal(launchOptions.proxy,undefined);
  assert.ok(!launchOptions.args.includes('--no-sandbox'));assert.equal(pageOptions.proxy,undefined);
  assert.equal(pageOptions.serviceWorkers,'block');assert.equal(pageOptions.acceptDownloads,false);
  await result.revalidate();mode='revoked';await assert.rejects(result.revalidate());
});
test('default off denies rendering before launch',async()=>{
  const adapter=await make(false);await assert.rejects(adapter.extract(input));assert.equal(launches,0);
});
for(const failure of ['version','unknown','revoked'])test(`refuses ${failure} without returning a draft`,async()=>{
  const adapter=await make();mode=failure;await assert.rejects(adapter.extract(input),/Approved browser rendering unavailable/);
  if(failure!=='revoked')assert.ok(closed>=1);
});
test('refuses corrupt originals and private/noncanonical navigation before launch',async()=>{
  const adapter=await make();
  for(const patch of [{content:Buffer.from('changed')},{canonicalUrl:'https://127.0.0.1/notice'},
    {canonicalUrl:'https://metadata.google.internal/notice'},{contentType:'application/javascript'}])
    await assert.rejects(adapter.extract({...input,...patch}));
  assert.equal(launches,0);
});
test('a hung SDK cleanup cannot leave the extractor pending indefinitely',{timeout:2500},async()=>{
  const adapter=await make();mode='hung-close';
  await assert.rejects(adapter.extract(input),/Approved browser rendering unavailable/);
  assert.equal(teardowns,2);
});
test('attempts the remaining cleanup after browser close rejects',async()=>{
  const adapter=await make();mode='reject-close';await assert.rejects(adapter.extract(input));assert.equal(teardowns,2);
});
test('disposes a browser that resolves after the extraction deadline',async()=>{
  const adapter=await make(),controller=new AbortController();mode='late';
  const mocked=mock.method(AbortSignal,'timeout',()=>controller.signal);
  try{
    const pending=adapter.extract(input),rejected=assert.rejects(pending,/Approved browser rendering unavailable/);
    await new Promise(resolve=>setImmediate(resolve));assert.equal(typeof releaseLaunch,'function');
    controller.abort();await rejected;assert.equal(closed,0);
    releaseLaunch();await new Promise(resolve=>setImmediate(resolve));assert.equal(closed,1);assert.equal(teardowns,2);
  }finally{mocked.mock.restore();}
});
