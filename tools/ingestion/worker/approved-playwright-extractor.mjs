/** Actual Crawlee/Playwright renderer. Default off, private operator only.
 * Chromium receives no network namespace and replays only approved captures. */
import {createHash} from 'node:crypto';
import {isIP} from 'node:net';
import {PlaywrightCrawler,Configuration,MemoryStorage,RequestList,Log,LogLevel} from 'crawlee';
import {chromium} from 'playwright-core';
import {createCapturedBrowserRoutes} from './approved-browser-routes.mjs';
import {parseApprovedNoticeHtmlDraft} from './notice-html-extractor.mjs';
function refused(){throw new Error('Approved browser rendering unavailable');}
const sha=b=>createHash('sha256').update(b).digest('hex');
const ROOT=/^(?:body|main|article|#[A-Za-z0-9_-]{1,50}|\.[A-Za-z0-9_-]{1,50})$/;
async function cleanup(run){
  let timer;
  try{await Promise.race([Promise.resolve().then(run),new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(new Error('Approved browser rendering unavailable')),1000);
  })]);}finally{clearTimeout(timer);}
}
export async function createApprovedPlaywrightExtractor({runtime,resources,rootSelector='main',enabled=false,now=()=>new Date().toISOString()}){
  // Deferred compiled API import preserves offline worker tools before build.
  const {verifySourceBrowserRuntime,buildSourceBrowserLaunchOptions,SourceBrowserRuntimeSchema}=
    await import('../../../dist/apps/api/src/modules/opportunities/source-browser-runtime.js');
  const {buildSourceBrowserEvidence}=await import('../../../dist/apps/api/src/modules/opportunities/source-browser-evidence.js');
  const pinned=SourceBrowserRuntimeSchema.parse(runtime),renderer=Object.freeze({...pinned,id:'crawlee-playwright-v1'});
  if(!ROOT.test(rootSelector)||typeof resources?.load!=='function'||typeof now!=='function')refused();
  return {renderer,async extract(raw){
    const input={...raw};
    let crawler,requestList,browser,timer,stopped=false,output;
    const signal=AbortSignal.timeout(20000);
    async function bounded(run){
      if(signal.aborted||stopped)refused();let abort;
      const timeout=new Promise((_,reject)=>{abort=()=>reject(new Error('Approved browser rendering unavailable'));
        signal.addEventListener('abort',abort,{once:true});});
      try{const value=await Promise.race([Promise.resolve().then(()=>{
        if(signal.aborted||stopped)refused();return run();}),timeout]);
        if(signal.aborted||stopped)refused();return value;
      }finally{signal.removeEventListener('abort',abort);}
    }
    async function recheck(){
      if(signal.aborted||stopped)refused();
      await bounded(()=>input.assertSourceRights());
      if(signal.aborted||stopped)refused();
    }
    try{
      if(enabled!==true||process.platform!=='linux'||typeof process.getuid!=='function'||process.getuid()===0
        ||typeof input.assertSourceRights!=='function'||!(input.content instanceof Uint8Array)
        ||!input.content.length||input.content.length>262144||sha(input.content)!==input.originalSha256
        ||!/^text\/html(?:;\s*charset=(?:utf-8|euc-kr))?$/i.test(input.contentType))refused();
      const url=new URL(input.canonicalUrl);
      if(url.href!==input.canonicalUrl||url.protocol!=='https:'||url.port||url.hash||url.username||url.password
        ||isIP(url.hostname)!==0||url.hostname.includes(':')||!url.hostname.includes('.')||url.hostname.endsWith('.')
        ||/\.(?:local|localhost|internal)$/.test(url.hostname))refused();
      const content=Buffer.from(input.content);await recheck();
      const captured=await bounded(()=>resources.load({actorRef:input.actorRef}));
      const authority=async()=>{await recheck();await bounded(()=>captured.revalidate());await recheck();};
      await authority();await bounded(()=>verifySourceBrowserRuntime(pinned,signal));await authority();
      let launches=0,handled=false,failed=false,routes;
      const launcher={name:()=>chromium.name(),launch:async()=>{
        if(++launches!==1)refused();
        await authority();await bounded(()=>verifySourceBrowserRuntime(pinned,signal));await authority();
        // Intentionally discard Crawlee's proxy/anti-detection option mutation.
        // Only verified fixed runtime options reach the real browser library.
        const launched=await chromium.launch({...buildSourceBrowserLaunchOptions(pinned),timeout:8000,
          handleSIGINT:false,handleSIGTERM:false,handleSIGHUP:false});
        // The extraction may already have timed out while launch was pending.
        // Keep ownership of this late successful result and dispose it here.
        if(stopped||signal.aborted){await cleanup(()=>launched.close());refused();}
        browser=launched;
        if(browser.version()!==pinned.chromiumVersion)refused();
        await authority();return browser;
      }};
      requestList=await RequestList.open(null,[{url:input.canonicalUrl,method:'GET'}]);
      const config=new Configuration({storageClient:new MemoryStorage({persistStorage:false,writeMetadata:false}),
        persistStorage:false,purgeOnStart:false});
      crawler=new PlaywrightCrawler({requestList,log:new Log({level:LogLevel.OFF}),
        launchContext:{launcher,useIncognitoPages:true,launchOptions:buildSourceBrowserLaunchOptions(pinned)},
        browserPoolOptions:{useFingerprints:false,maxOpenPagesPerBrowser:1,retireBrowserAfterPageCount:1,
          prePageCreateHooks:[async(_id,_controller,pageOptions)=>{
            // Override the plugin's merged proxy for this isolated context.
            Object.assign(pageOptions,{proxy:undefined,acceptDownloads:false,serviceWorkers:'block',
              ignoreHTTPSErrors:false,permissions:[],storageState:{cookies:[],origins:[]},
              locale:'en-US',timezoneId:'UTC',viewport:{width:1280,height:720}});
          }]},
        useSessionPool:false,persistCookiesPerSession:false,retryOnBlocked:false,
        maxRequestsPerCrawl:1,maxRequestRetries:0,maxSessionRotations:0,maxConcurrency:1,
        navigationTimeoutSecs:8,requestHandlerTimeoutSecs:5,
        preNavigationHooks:[async({page},gotoOptions)=>{
          await authority();const context=page.context();
          routes=createCapturedBrowserRoutes({canonicalUrl:input.canonicalUrl,content,contentType:input.contentType,
            resources:captured.resources,mainFrame:page.mainFrame()});
          await context.route('**/*',route=>routes.handle(route));
          await context.routeWebSocket('**/*',socket=>{routes.fail();socket.close();});
          context.on('page',popup=>{if(popup!==page){routes.fail();void popup.close().catch(()=>{});}});
          context.on('serviceworker',()=>routes.fail());
          page.on('download',download=>{routes.fail();void download.cancel().catch(()=>{});});
          page.on('pageerror',()=>routes.fail());
          gotoOptions.waitUntil='networkidle';
        }],
        requestHandler:async({page,request})=>{
          if(handled||request.url!==input.canonicalUrl||page.url()!==input.canonicalUrl||!routes)refused();
          await page.waitForSelector(rootSelector,{state:'attached',timeout:2000});
          const domBytes=Buffer.from(await page.content(),'utf8');
          if(!domBytes.length||domBytes.length>262144)refused();
          routes.assertComplete();await authority();routes.assertComplete();
          const draft=parseApprovedNoticeHtmlDraft({content:domBytes,contentType:'text/html; charset=utf-8',
            canonicalUrl:input.canonicalUrl,rootSelector});
          const paragraphs=draft.paragraphs.map(p=>({...p}));
          const evidence=buildSourceBrowserEvidence({sourceId:input.sourceId,sourceRevisionId:input.sourceRevisionId,
            permissionRef:input.permissionRef,canonicalUrl:input.canonicalUrl,originalBytes:content,domBytes,paragraphs,
            renderer,rootSelector,capturedAt:now(),resources:routes.manifests()});
          output={evidence,domBytes,paragraphs,revalidate:async()=>{
            await input.assertSourceRights();await captured.revalidate();await input.assertSourceRights();
          }};handled=true;
        },failedRequestHandler:async()=>{failed=true;},
      },config);
      const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{stopped=true;
        void browser?.close().catch(()=>{});reject(new Error('Approved browser rendering unavailable'));},20000);});
      await bounded(()=>Promise.race([crawler.run(),timeout]));
      if(failed||!handled||launches!==1||!output)refused();
      await authority();routes.assertComplete();return output;
    }catch{refused();}
    finally{
      clearTimeout(timer);stopped=true;
      // Attempt every independent cleanup even when another fails or hangs.
      // Execution has a 20s deadline plus at most 1s of bounded cleanup.
      const results=await Promise.allSettled([
        cleanup(()=>browser?.close()),cleanup(()=>crawler?.teardown()),cleanup(()=>requestList?.teardown()),
      ]);
      if(results.some(r=>r.status==='rejected'))refused();
    }
  }};
}
