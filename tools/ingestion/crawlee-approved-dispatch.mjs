/**
 * #445: Crawlee BasicCrawler dispatches only operator-registered source jobs.
 * It DOES NOT fetch pages: the existing approved durable executor handles
 * exact-URL, DNS/IP-pinned transport, bytes, rights and DRAFT persistence.
 *
 * The NCP-private factory supplies the real Crawlee BasicCrawler constructor
 * and a NCP-private requestQueue. No default/global crawler queue is opened.
 * Crawlee retries are off: source_ingest_jobs already owns idempotency/recovery.
 */
import {isIP} from 'node:net';

const Ref=/^[A-Za-z0-9_.:@-]{1,128}$/;
function deny(){throw new Error('APPROVED_SOURCE_DISPATCH_BLOCKED');}
function checkSource(item){
  if(!item||typeof item!=='object'||!Ref.test(item.actorRef)
    ||!Ref.test(item.sourceId)||!Ref.test(item.permissionRef)
    ||typeof item.canonicalUrl!=='string')deny();
  let u;
  try{u=new URL(item.canonicalUrl);}catch{deny();}
  const h=u.hostname.toLowerCase();
  if(u.protocol!=='https:'||u.username||u.password||u.hash||u.port
    ||isIP(h)!==0||h==='localhost'||h.endsWith('.localhost')
    ||h.endsWith('.local')||h.endsWith('.internal')||h.endsWith('.test')
    ||h.endsWith('.invalid')||!h.includes('.')
    ||u.searchParams.has('redirect')||u.href!==item.canonicalUrl)deny();
  return Object.freeze({actorRef:item.actorRef,sourceId:item.sourceId,
    permissionRef:item.permissionRef,canonicalUrl:u.href});
}
const keyFor=s=>JSON.stringify([s.sourceId,s.permissionRef,s.actorRef]);

export async function dispatchApprovedCrawleeSources({
  sources,BasicCrawler,requestQueue,authority,executor,now=()=>new Date().toISOString(),
}){
  if(!Array.isArray(sources)||sources.length===0||sources.length>16
    ||typeof BasicCrawler!=='function'||!requestQueue
    ||typeof requestQueue.addRequest!=='function'
    ||typeof authority?.mayProcess!=='function'
    ||typeof executor?.execute!=='function'||typeof now!=='function')deny();
  const entries=sources.map(checkSource),byKey=new Map(),byUrl=new Set();
  for(const s of entries){
    const key=keyFor(s);
    if(byKey.has(key)||byUrl.has(s.canonicalUrl))deny();
    byKey.set(key,s);byUrl.add(s.canonicalUrl);
  }
  const permitted=async s=>{
    const at=now();
    if(typeof at!=='string'||!Number.isFinite(Date.parse(at))
      ||await authority.mayProcess({actorRef:s.actorRef,sourceId:s.sourceId,
        permissionRef:s.permissionRef,now:at})!==true)deny();
  };
  // Reject incomplete/expired rights before any request enters Crawlee's queue.
  for(const s of entries)await permitted(s);
  const completed=new Set(),failures=[];
  const crawler=new BasicCrawler({
    requestQueue,maxConcurrency:1,minConcurrency:1,maxRequestsPerCrawl:entries.length,
    maxRequestRetries:0,maxSessionRotations:0,useSessionPool:false,
    requestHandlerTimeoutSecs:120,
    async requestHandler({request}){
      const job=byKey.get(request?.uniqueKey);
      // Reject a stale queue item, modified URL, or replay before executor IO.
      if(!job||request.url!==job.canonicalUrl||completed.has(request.uniqueKey))deny();
      await permitted(job);
      const out=await executor.execute({sourceId:job.sourceId,
        permissionRef:job.permissionRef,actorRef:job.actorRef});
      if(!out||!['NEW_DRAFT','CHANGED_DRAFT','NOT_MODIFIED'].includes(out.kind)
        ||typeof out.revisionId!=='string'||!out.revisionId)deny();
      // Persisted DRAFT does not imply publication. A late rights revocation
      // blocks the successful refresh report (never activates the revision).
      await permitted(job);
      completed.add(request.uniqueKey);
    },
    async failedRequestHandler(){
      // Do not report source URLs, errors or original content in public logs.
      failures.push('FAILED');
    },
  });
  await crawler.run(entries.map(s=>({url:s.canonicalUrl,uniqueKey:keyFor(s)})));
  if(failures.length||completed.size!==entries.length)deny();
  return {state:'DRAFT_REFRESH_COMPLETE',handled:completed.size,activeRevisions:0};
}

/**
 * Adapts the approved per-run dispatcher to the existing #445 refresh CLI
 * worker contract. The private factory still owns SQL pools and the Crawlee
 * RequestQueue. Calling close twice is safe; no global registry is created.
 */
export function createApprovedCrawleeRefreshWorker(config){
  let state='NEW';
  return {
    async runOnce(){
      if(state!=='NEW')deny();
      state='USED';
      return dispatchApprovedCrawleeSources(config);
    },
    async close(){
      if(state==='CLOSED')return;
      state='CLOSED';
      if(config&&typeof config.closeQueue==='function')await config.closeQueue();
    },
  };
}
