/**
 * #445: operator-review link candidates extracted from already-read HTML/XML.
 * This function never fetches, follows, registers, approves or stores a source.
 * The caller supplies Crawlee's Cheerio `$` instance. Real source policy and
 * per-URL rights remain in NCP, outside the public repository.
 */
import {isIP} from 'node:net';

const KINDS=new Set(['HTML','RSS','ATOM','SITEMAP']);
const SELECTORS={
  HTML:'a[href]',RSS:'item > link',ATOM:'entry > link[href]',
  SITEMAP:'url > loc',
};
const MAX_SCAN=500,MAX_RESULTS=100;
function invalid(){throw new Error('SOURCE_CANDIDATES_NOT_APPROVED');}
function urlFrom(value,base,origin,prefixes){
  if(typeof value!=='string'||value.trim().length===0||value.length>2048
    ||/^[\s]*(?:javascript|data|mailto|file|blob):/i.test(value))return null;
  let url;
  try{url=new URL(value.trim(),base);}catch{return null;}
  const host=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||url.origin!==origin||url.username||url.password
    ||url.port||isIP(host)!==0||url.hash||!host.includes('.')
    ||host.endsWith('.')||host.endsWith('.internal')||host.endsWith('.local')
    ||host.endsWith('.invalid')||host.endsWith('.test')
    ||host==='localhost'||url.href.length>2048)return null;
  if(!prefixes.some(prefix=>prefix==='/'||url.pathname===prefix
    ||url.pathname.startsWith(prefix.endsWith('/')?prefix:prefix+'/')))return null;
  if(/%(?:2e|2f|5c)/i.test(url.pathname))return null;
  return url.href;
}
/**
 * Cheerio's DOM is parsed under the caller's existing approved content policy.
 * XML must use xmlMode; HTML mode must not run scripts, load images or fetch.
 * Returned candidates are NOT permission to call Crawl/STORE/SEARCH.
 */
export function extractReviewedLinkCandidates({
  $,canonicalUrl,approvedOrigin,allowPathPrefixes,kind='HTML',
  limit=MAX_RESULTS,
}){
  if(typeof $!=='function'||!KINDS.has(kind)
    ||!Array.isArray(allowPathPrefixes)||allowPathPrefixes.length<1
    ||allowPathPrefixes.length>12||!Number.isInteger(limit)
    ||limit<1||limit>MAX_RESULTS)invalid();
  let base,origin;
  try{
    base=new URL(canonicalUrl);origin=new URL(approvedOrigin);
  }catch{invalid();}
  if(base.protocol!=='https:'||base.hash||base.username||base.password||base.port
    ||origin.href!==origin.origin+'/'||base.origin!==origin.origin
    ||isIP(base.hostname)!==0||base.hostname.endsWith('.')
    ||origin.hostname.endsWith('.')||base.hostname.endsWith('.internal')
    ||base.hostname.endsWith('.local')||base.hostname.endsWith('.invalid')
    ||base.hostname.endsWith('.test'))invalid();
  for(const prefix of allowPathPrefixes){
    if(typeof prefix!=='string'||!prefix.startsWith('/')||prefix.includes('?')
      ||prefix.includes('#')||prefix.includes('..')||/%(?:2e|2f|5c)/i.test(prefix)
      ||prefix.includes('\\')||prefix.length>200)invalid();
  }
  const found=[],seen=new Set(),selector=SELECTORS[kind];
  // Bounded extraction: Cheerio's selection is local, never a fetch.
  // No request to the source or an attachment is made here.
  const entries=$(selector);
  if(!entries||typeof entries.each!=='function')invalid();
  let examined=0;
  entries.each((_i,element)=>{
    if(examined++>=MAX_SCAN||found.length>=limit)return false;
    const node=$(element);
    let raw;
    if(kind==='HTML')raw=node.attr('href');
    else if(kind==='ATOM')raw=node.attr('href');
    else raw=node.text();
    const href=urlFrom(raw,base.href,origin.origin,allowPathPrefixes);
    if(!href||seen.has(href))return;
    seen.add(href);
    const pathname=new URL(href).pathname;
    const type=/\.(?:pdf|hwpx?|docx?|xlsx?|png|jpe?g)$/i.test(pathname)
      ?'ATTACHMENT':'DOCUMENT';
    const label=kind==='HTML'?node.text().normalize('NFC').trim().slice(0,200):'';
    found.push(Object.freeze({url:href,type,...(label?{label}:{})}));
  });
  // Returned state is deliberately REVIEW_REQUIRED; no automatic enqueue.
  return Object.freeze({
    state:'REVIEW_REQUIRED',kind,sourceUrl:base.href,
    scanned:Math.min(examined,MAX_SCAN),candidates:Object.freeze(found),
  });
}
