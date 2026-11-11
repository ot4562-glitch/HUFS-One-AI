/** Actual Crawlee HTTP acquisition over the API's one-use pinned capability.
 * No default HTTP client, URL discovery, session, proxy or persistent storage. */
import {randomUUID} from 'node:crypto';
import {isIP} from 'node:net';
import {Readable} from 'node:stream';
import {CheerioCrawler,Configuration,MemoryStorage,RequestQueue,Log,LogLevel} from 'crawlee';

const MAX_BYTES=256*1024;
const MIME=['text/plain','application/rss+xml','application/atom+xml','application/pdf',
  'image/png','image/jpeg','application/hwp+zip','application/vnd.hancom.hwpx',
  'application/x-hwp','application/vnd.hancom.hwp','application/haansofthwp','application/octet-stream'];
function fail(){throw new Error('Approved Crawlee acquisition failed');}
/** Numeric, information-free diagnostics in synthetic CI only. Never echo
 * source URLs, original bytes, SDK messages, private headers or tokens. */
function diagnostic(code){
  if(process.env.CI==='true'&&process.env.HUFS_SYNTHETIC_CRAWLEE_DIAG==='1')
    process.stderr.write('SYNTHETIC_CRAWLEE_STAGE:'+code+'\n');
}
function category(error){
  if(!(error instanceof Error))return 'UNKNOWN';
  if(/mime|content.type/i.test(error.message))return 'MIME';
  if(/status|response/i.test(error.message))return 'RESPONSE';
  if(/stream|body|readable/i.test(error.message))return 'STREAM';
  if(/timeout/i.test(error.message))return 'TIMEOUT';
  if(/request/i.test(error.message))return 'REQUEST';
  return error.name==='TypeError'?'TYPE':'OTHER';
}
function exactUrl(raw){
  let u;try{u=new URL(raw);}catch{fail();}
  if(u.href!==raw||u.protocol!=='https:'||u.port||u.username||u.password||u.hash
    ||!u.hostname.includes('.')||u.hostname.endsWith('.')||u.hostname.endsWith('.local')
    ||u.hostname.endsWith('.localhost')||isIP(u.hostname)!==0||u.hostname.includes(':'))fail();
  return u.href;
}
async function boundedBytes(response){
  if(response.status===304){try{await response.body?.cancel();}catch{}return Buffer.alloc(0);}
  const declared=response.headers.get('content-length');
  if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>MAX_BYTES)){
    try{await response.body?.cancel();}catch{}fail();
  }
  if(!response.body)fail();
  const reader=response.body.getReader(),parts=[];let size=0,complete=false;
  try{
    for(;;){const chunk=await reader.read();if(chunk.done){complete=true;break;}
      size+=chunk.value.byteLength;if(size>MAX_BYTES)fail();parts.push(chunk.value);}
  }finally{
    if(!complete)try{void reader.cancel().catch(()=>{});}catch{}
    reader.releaseLock();
  }
  return Buffer.concat(parts);
}
export function createApprovedCheerioAcquisition(){
  return {async acquire({canonicalUrl,request}){
    const url=exactUrl(canonicalUrl);if(typeof request!=='function')fail();
    const storageClient=new MemoryStorage({persistStorage:false,writeMetadata:false});
    const config=new Configuration({storageClient,persistStorage:false,purgeOnStart:false});
    const queue=await RequestQueue.open('hufs-acquisition-'+randomUUID(),{config});
    let calls=0,handled=false,failed=false;
    const httpClient={
      async sendRequest(){fail();},
      async stream(options){
        if(++calls!==1||String(options.url)!==url||String(options.method??'GET').toUpperCase()!=='GET'
          ||options.body!==undefined||options.proxyUrl||options.cookieJar)fail();
        const headers=new Headers(options.headers);
        if(['cookie','authorization','proxy-authorization'].some(name=>headers.has(name)))fail();
        // This closure, not options supplied by Crawlee, fixes URL, headers,
        // current rights, DNS/IP pin, TLS/SNI and omit-credentials policy.
        const response=await request();
        if(response.redirected||(response.url&&response.url!==url)||![200,304].includes(response.status)){
          try{await response.body?.cancel();}catch{}fail();
        }
        const bytes=await boundedBytes(response);
        return {stream:Readable.from(bytes.length?[bytes]:[]),request:options,url,
          statusCode:response.status,statusMessage:response.statusText,
          headers:Object.fromEntries(response.headers),trailers:{},redirectUrls:[],complete:true,
          downloadProgress:{percent:1,transferred:bytes.length,total:bytes.length},
          uploadProgress:{percent:1,transferred:0,total:0}};
      },
    };
    let crawler;
    try{
      crawler=new CheerioCrawler({requestQueue:queue,httpClient,log:new Log({level:LogLevel.OFF}),
        useSessionPool:false,persistCookiesPerSession:false,retryOnBlocked:false,
        maxRequestsPerCrawl:1,maxRequestRetries:0,maxSessionRotations:0,maxConcurrency:1,
        navigationTimeoutSecs:8,requestHandlerTimeoutSecs:5,additionalMimeTypes:MIME,
        requestHandler:async({request:current,response,body})=>{
          if(current.url!==url){diagnostic('REQ_URL');fail();}
          if(response.url!==url){diagnostic('RESP_URL');fail();}
          if(body===undefined){diagnostic('BODY_MISSING');fail();}
          if(calls!==1){diagnostic('CALL_COUNT');fail();}
          handled=true;
        },failedRequestHandler:async(_ctx,error)=>{failed=true;diagnostic('CRAWLER_FAILED_'+category(error));},
      },config);
      // With an explicitly scoped RequestQueue, Crawlee.run(requests)
      // can choose a default request manager and leave the private queue
      // empty. Seed ONLY this private queue and run it directly.
      await queue.addRequest({url,uniqueKey:randomUUID(),method:'GET'});
      const before=await queue.getInfo();
      diagnostic('QUEUE_BEFORE_'+String(before?.pendingRequestCount));
      await crawler.run();
      const after=await queue.getInfo();
      diagnostic('QUEUE_AFTER_'+String(after?.pendingRequestCount));
      if(failed||!handled||calls!==1){diagnostic('INCOMPLETE_'+Number(calls)+'_'+Number(handled)+'_'+Number(failed));fail();}
    }catch(error){diagnostic('OUTER_CATCH_'+category(error));fail();}
    finally{
      // Storage is per-call memory-only, even when ambient storage env is set.
      // Cleanup failures remain failures; never call a different HTTP client.
      try{await crawler?.teardown();await queue.drop();}catch{fail();}
    }
  }};
}
