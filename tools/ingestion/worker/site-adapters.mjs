/**
 * #445: operator-configured offline adapters for two public board layouts.
 * Reuse the existing approved-pinned-egress/queue: NO fetch, browser launch,
 * source registration, approval, ACTIVE promotion or site-specific rights grant.
 */
import {createHash} from 'node:crypto';
import {isIP} from 'node:net';
import {load} from 'cheerio';

const UTF8=new TextDecoder('utf-8',{fatal:true});
const TAG=/^(?:[a-z][a-z0-9-]*|[.#][a-z][a-z0-9_-]*)(?:\s+(?:[a-z][a-z0-9-]*|[.#][a-z][a-z0-9_-]*)){0,3}$/i;
const ID=/^[A-Za-z0-9_.:-]{1,128}$/;
const VALID_QUERY=/^[A-Za-z0-9_.-]{1,80}$/;
const MAX_ROWS=300,MAX_POSTS=100,MAX_PAGES=40,MAX_ATTACHMENTS=8;
const SAFE_EXT=/\.(?:hwp|hwpx|pdf|docx?|xlsx?|txt)$/i;
const FAMILIES=Object.freeze({
  TABLE_BOARD_V1:{item:'table tbody tr',title:'.title a',date:'time',
    attachment:'.files a',pagination:'nav a'},
  CARD_BOARD_V1:{item:'ul li',title:'h3 a',date:'time',
    attachment:'.attachments a',pagination:'nav a'},
});
function invalid(){throw new Error('PUBLIC_BOARD_CANDIDATES_NOT_APPROVED');}
function config(raw){
  if(!raw||typeof raw!=='object'||!Object.hasOwn(FAMILIES,raw.family)
    ||!ID.test(raw.sourceId)||!Array.isArray(raw.allowPathPrefixes)
    ||raw.allowPathPrefixes.length<1||raw.allowPathPrefixes.length>12
    ||!Array.isArray(raw.allowedQueryKeys)||raw.allowedQueryKeys.length>12
    ||new Set(raw.allowedQueryKeys).size!==raw.allowedQueryKeys.length
    ||raw.allowedQueryKeys.some(k=>!ID.test(k))
    ||!Number.isSafeInteger(raw.limit)||raw.limit<1||raw.limit>MAX_POSTS
    ||typeof raw.rootSelector!=='string'||!TAG.test(raw.rootSelector))invalid();
  const selectors={...FAMILIES[raw.family],...(raw.selectors??{})};
  if(Object.keys(selectors).length!==5
    ||Object.values(selectors).some(value=>typeof value!=='string'||!TAG.test(value)))invalid();
  const prefixes=raw.allowPathPrefixes;
  if(prefixes.some(p=>typeof p!=='string'||!p.startsWith('/')||p.length>200
    ||p.includes('..')||p.includes('//')||p.includes('\\')
    ||p.includes('?')||p.includes('#')||/%(?:00|25|2e|2f|5c)/i.test(p)))invalid();
  let base,origin;
  try{base=new URL(raw.canonicalUrl);origin=new URL(raw.approvedOrigin);}
  catch{invalid();}
  if(base.protocol!=='https:'||base.username||base.password||base.port||base.hash
    ||origin.protocol!=='https:'||origin.username||origin.password||origin.port
    ||origin.hash||origin.search||origin.pathname!=='/'||origin.href!==origin.origin+'/'
    ||base.origin!==origin.origin||isIP(base.hostname)!==0
    ||!base.hostname.includes('.')||base.hostname.endsWith('.')
    ||base.hostname.endsWith('.local')||base.hostname.endsWith('.internal')
    ||base.hostname.endsWith('.invalid')||base.hostname.endsWith('.test'))invalid();
  const policy={...raw,base,origin,prefixes,selectors};
  if(approvedUrl(base.href,policy)!==base.href)invalid();
  return policy;
}
function approvedUrl(raw,policy){
  if(typeof raw!=='string'||!raw||raw.length>2048
    ||/^\s*(?:javascript|data|file|blob|mailto):/i.test(raw)
    ||raw.startsWith('//')||raw.trim()!==raw)return null;
  let u;
  try{u=new URL(raw,policy.base);}catch{return null;}
  if(u.protocol!=='https:'||u.origin!==policy.origin.origin
    ||u.username||u.password||u.port||u.hash||u.href.length>2048)return null;
  if(!policy.prefixes.some(prefix=>prefix==='/'||u.pathname===prefix
    ||u.pathname.startsWith(prefix.endsWith('/')?prefix:prefix+'/')))return null;
  if(/%(?:00|25|2e|2f|5c)/i.test(u.pathname))return null;
  for(const [key,value] of u.searchParams){
    if(!policy.allowedQueryKeys.includes(key)||!VALID_QUERY.test(value)
      ||value.includes('..')||u.searchParams.getAll(key).length>1)return null;
  }
  return u.href;
}
const clean=value=>String(value??'').normalize('NFC').replace(/\s+/gu,' ').trim();
/** Two deliberately different DOM arrangements. Operator selects reviewed
 * root/selectors in the private source policy; no real HUFS URL is bundled.
 */
export function parseApprovedBoardCandidates({content,policy}){
  const p=config(policy);
  if(!(content instanceof Uint8Array)||content.length<1||content.length>256*1024)invalid();
  let html;
  try{html=UTF8.decode(content);}catch{invalid();}
  const stripped=html.replace(/^\uFEFF?\s*<!doctype html\s*>/i,'');
  if(/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(stripped))invalid();
  const $=load(html,{xmlMode:false});
  $('script,style,iframe,object,embed,form,input,textarea,button').remove();
  const root=$(p.rootSelector);
  if(root.length!==1)invalid();
  const rows=root.find(p.selectors.item);
  if(rows.length>MAX_ROWS)invalid();
  const posts=[],seen=new Map();
  rows.each((_i,element)=>{
    const row=$(element);
    const anchors=row.find(p.selectors.title);
    if(anchors.length!==1)return;
    const anchor=anchors.first(),url=approvedUrl(anchor.attr('href'),p);
    const title=clean(anchor.text());
    if(!url||!title||title.length>200)return;
    if(seen.has(url)){
      if(seen.get(url)!==title)invalid();
      return;
    }
    seen.set(url,title);
    if(posts.length>=p.limit)return;
    const dateNodes=row.find(p.selectors.date);
    const postedAtCandidate=dateNodes.length===1?clean(dateNodes.first().text()):'';
    if(postedAtCandidate.length>60)invalid();
    const attachments=[],attachmentSet=new Set();
    row.find(p.selectors.attachment).each((_j,el)=>{
      const att=approvedUrl($(el).attr('href'),p);
      if(!att||!SAFE_EXT.test(new URL(att).pathname)||attachmentSet.has(att))return;
      if(attachments.length>=MAX_ATTACHMENTS)invalid();
      attachmentSet.add(att);
      attachments.push(att);
    });
    posts.push(Object.freeze({
      url,title,postedAtCandidate:postedAtCandidate||null,
      attachmentCandidates:Object.freeze(attachments),
    }));
  });
  const pageLinks=[],pages=new Set();
  root.find(p.selectors.pagination).each((_i,el)=>{
    const next=approvedUrl($(el).attr('href'),p);
    if(!next||next===p.base.href||pages.has(next))return;
    if(pageLinks.length>=MAX_PAGES)invalid();
    pages.add(next);pageLinks.push(next);
  });
  return Object.freeze({
    state:'REVIEW_REQUIRED',family:p.family,sourceId:p.sourceId,
    sourceUrl:p.base.href,originalSha256:createHash('sha256').update(content).digest('hex'),
    scanned:rows.length,hasMoreRows:seen.size>posts.length,
    posts:Object.freeze(posts),paginationCandidates:Object.freeze(pageLinks),
  });
}

/**
 * Reconcile independently captured *review candidates* from multiple listing
 * pages without launching a crawler. Page byte hashes and distinct origins
 * must also be checked against private NCP immutable SourceRevision records.
 * Same URL with conflicting title/attachments is never silently overwritten.
 */
export function reconcileReviewedBoardPages({pages,policy}){
  const p=config(policy);
  if(!Array.isArray(pages)||pages.length<1||pages.length>MAX_PAGES)invalid();
  const pageUrls=new Set(),posts=new Map(),suggested=new Set();
  const sourcePages=[];
  for(const page of pages){
    if(!page||page.state!=='REVIEW_REQUIRED'
      ||page.sourceId!==p.sourceId||page.family!==p.family
      ||typeof page.sourceUrl!=='string'
      ||approvedUrl(page.sourceUrl,p)!==page.sourceUrl
      ||!Array.isArray(page.posts)||page.posts.length>p.limit
      ||!Array.isArray(page.paginationCandidates)
      ||page.paginationCandidates.length>MAX_PAGES
      ||typeof page.originalSha256!=='string'
      ||!/^[a-f0-9]{64}$/.test(page.originalSha256)
      ||pageUrls.has(page.sourceUrl))invalid();
    pageUrls.add(page.sourceUrl);
    sourcePages.push(Object.freeze({url:page.sourceUrl,sha256:page.originalSha256}));
    for(const post of page.posts){
      if(!post||typeof post.url!=='string'
        ||approvedUrl(post.url,p)!==post.url
        ||typeof post.title!=='string'||!post.title||post.title.length>200
        ||post.postedAtCandidate!==null
          &&(typeof post.postedAtCandidate!=='string'
            ||post.postedAtCandidate.length>60)
        ||!Array.isArray(post.attachmentCandidates)
        ||post.attachmentCandidates.length>MAX_ATTACHMENTS)invalid();
      const attachments=post.attachmentCandidates;
      if(attachments.some(att=>typeof att!=='string'
        ||approvedUrl(att,p)!==att||!SAFE_EXT.test(new URL(att).pathname))
        ||new Set(attachments).size!==attachments.length)invalid();
      const previous=posts.get(post.url);
      if(previous){
        if(previous.title!==post.title
          ||previous.postedAtCandidate!==post.postedAtCandidate
          ||JSON.stringify(previous.attachmentCandidates)!==JSON.stringify(attachments))
          invalid();
      }else{
        if(posts.size>=MAX_PAGES*MAX_POSTS)invalid();
        posts.set(post.url,Object.freeze({...post,sourcePage:page.sourceUrl,
          sourcePageSha256:page.originalSha256}));
      }
    }
    for(const candidate of page.paginationCandidates){
      if(typeof candidate!=='string'||approvedUrl(candidate,p)!==candidate)invalid();
      suggested.add(candidate);
    }
  }
  // This is an operator-review-only backlog, NEVER a scheduling/fetch queue.
  const unvisited=[...suggested].filter(url=>!pageUrls.has(url));
  if(unvisited.length>MAX_PAGES)invalid();
  return Object.freeze({state:'REVIEW_REQUIRED',family:p.family,sourceId:p.sourceId,
    scannedPages:sourcePages.length,
    sourcePages:Object.freeze(sourcePages),
    posts:Object.freeze([...posts.values()]),
    unfetchedPageCandidates:Object.freeze(unvisited)});
}
