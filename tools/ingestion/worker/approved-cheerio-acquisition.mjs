/** Actual Crawlee HTTP acquisition over the API's one-use pinned capability.
 * No default HTTP client, URL discovery, session, proxy or persistent storage. */
import {isIP} from 'node:net';
import {Readable} from 'node:stream';
import {CheerioCrawler,Configuration,MemoryStorage,RequestList,Log,LogLevel} from 'crawlee';

const MAX_BYTES=256*1024;
const MIME=['text/plain','application/rss+xml','application/atom+xml','application/pdf',
  'image/png','image/jpeg','application/hwp+zip','application/vnd.hancom.hwpx',
  'application/x-hwp','application/vnd.hancom.hwp','application/haansofthwp','application/octet-stream'];
function fail(){throw new Error('Approved Crawlee acquisition failed');}
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
    // A one-element RequestList cannot enqueue discovered links and does
    // not rely on RequestQueue's asynchronous pending scheduling.
    const requestList=await RequestList.open(null,[{url,method:'GET'}]);
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
      crawler=new CheerioCrawler({requestList,httpClient,log:new Log({level:LogLevel.OFF}),
        useSessionPool:false,persistCookiesPerSession:false,retryOnBlocked:false,
        maxRequestsPerCrawl:1,maxRequestRetries:0,maxSessionRotations:0,maxConcurrency:1,
        navigationTimeoutSecs:8,requestHandlerTimeoutSecs:5,additionalMimeTypes:MIME,
        requestHandler:async({request:current,response,body})=>{
          if(current.url!==url||response.url!==url||body===undefined||calls!==1)fail();
          handled=true;
        },failedRequestHandler:async()=>{failed=true;},
      },config);
      await crawler.run();
      if(failed||!handled||calls!==1)fail();
    }catch{fail();}
    finally{
      // Storage is per-call memory-only, even when ambient storage env is set.
      // Cleanup failures remain failures; never call a different HTTP client.
      try{await crawler?.teardown();await requestList.teardown();}catch{fail();}
    }
  }};
}
