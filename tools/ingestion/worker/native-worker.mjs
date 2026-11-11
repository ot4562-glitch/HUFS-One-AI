/**
 * #445 production-ready dependency boundary only. Real source policies,
 * SQL pools, credentials and the operator factory are NCP-private.
 */
import {randomUUID} from 'node:crypto';
import {BasicCrawler,RequestQueue} from 'crawlee';
import {load} from 'cheerio';
import {createApprovedCrawleeRefreshWorker} from '../crawlee-approved-dispatch.mjs';
import {extractReviewedLinkCandidates} from '../approved-link-candidates.mjs';

const ALLOWED_STORAGE='/var/lib/hufs-one-crawler/crawlee';
function fail(){throw new Error('CONFIGURATION_REQUIRED: private Crawlee worker');}
export async function createNativeApprovedQueueWorker({queue,maxJobs=16}){
  if(process.platform!=='linux'||typeof process.getuid!=='function'
    ||process.getuid()===0||process.env.CRAWLEE_STORAGE_DIR!==ALLOWED_STORAGE
    ||typeof queue?.runOne!=='function')fail();
  // Create a NEW private RequestQueue per run. Its generated ID is not an
  // operator URL/source key; only PostgreSQL may select approved source jobs.
  const requestQueue=await RequestQueue.open('hufs-one-run-'+randomUUID());
  return createApprovedCrawleeRefreshWorker({
    BasicCrawler,requestQueue,queue,maxJobs,
    closeQueue:async()=>{await requestQueue.drop();},
  });
}
/** Parse previously authorized and fetched bytes. Not a crawler or URL fetch. */
export function collectCandidatesFromApprovedBytes({
  content,kind,canonicalUrl,approvedOrigin,allowPathPrefixes,limit,
}){
  if(!(content instanceof Uint8Array)||content.byteLength<1||content.byteLength>256*1024
    ||!['HTML','RSS','ATOM','SITEMAP'].includes(kind))fail();
  let text;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(content);}
  catch{fail();}
  // Ordinary HTML5 uses <!doctype html>. Only that exact prologue is safe;
  // external DTD declarations, additional doctypes and XML entities stay blocked.
  const markup=kind==='HTML'
    ?text.replace(/^\uFEFF?\s*<!doctype html\s*>/i,'')
    :text;
  if(/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(markup))fail();
  const $=load(text,{xmlMode:kind!=='HTML'});
  return extractReviewedLinkCandidates({
    $,canonicalUrl,approvedOrigin,allowPathPrefixes,kind,
    ...(limit===undefined?{}:{limit}),
  });
}

// Operator-selected, already-authorized document byte decoders. No fetch,
// credentials, browser, unreviewed source activation or filesystem writes.
export {createApprovedHwpxExtractor,createApprovedLegacyHwpExtractor,
  parseApprovedHwpxDraft,parseApprovedLegacyHwpDraft}
  from './korean-documents.mjs';
