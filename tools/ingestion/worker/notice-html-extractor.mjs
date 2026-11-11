/** #445: bounded, entirely offline Cheerio notice/detail adapter.
 * It receives ONLY bytes already fetched by the existing rights/pinned-egress
 * source executor. It never fetches, resolves URLs, or marks a source approved.
 * Site-specific root selectors must be independently reviewed in NCP.
 */
import {createHash} from 'node:crypto';
import {isIP} from 'node:net';
import {load} from 'cheerio';

const MAX_BYTES=256*1024,MAX_LINES=200,MAX_LINE=20_000;
const ROOT=/^(?:body|main|article|#[A-Za-z0-9_-]{1,50}|\.[A-Za-z0-9_-]{1,50})$/;
function refused(){throw new Error('NOTICE_DETAIL_REQUIRES_REVIEW');}
const text=value=>String(value??'').replace(/\u00a0/g,' ')
  .normalize('NFC').replace(/\s+/gu,' ').trim();
function sourceUrl(value){
  let url;
  try{url=new URL(value);}catch{refused();}
  if(url.href!==value||url.protocol!=='https:'||url.username||url.password
    ||url.hash||url.port||!url.hostname.includes('.')||url.hostname.endsWith('.')
    ||url.hostname.endsWith('.internal')||url.hostname.endsWith('.local')
    ||url.hostname.endsWith('.invalid')||isIP(url.hostname)!==0)refused();
}
/** Content-only proposals, never publication or applicant eligibility.
 * Source SHA is original bytes; IDs are ordinal evidence paragraphs.
 */
export function parseApprovedNoticeHtmlDraft({content,contentType,canonicalUrl,
  rootSelector='body'}){
  if(!(content instanceof Uint8Array)||content.byteLength<1
    ||content.byteLength>MAX_BYTES||contentType.split(';')[0]?.trim().toLowerCase()!=='text/html'
    ||typeof rootSelector!=='string'||!ROOT.test(rootSelector))refused();
  sourceUrl(canonicalUrl);
  let html;
  try{html=new TextDecoder('utf-8',{fatal:true}).decode(content);}catch{refused();}
  if(html.includes('\u0000'))refused();
  const markup=html.replace(/^\uFEFF?\s*<!doctype html\s*>/i,'');
  if(/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(markup)
    ||/<(?:script|style|template)\b/i.test(html)
      &&!/<\/(?:script|style|template)\s*>/i.test(html))
    refused();
  const $=load(html,{xmlMode:false});
  $('script,style,iframe,object,embed,svg,template,noscript,form,textarea,input,button').remove();
  const root=$(rootSelector);
  if(root.length!==1)refused();
  const lines=[];
  root.find('h1,h2,h3,p,li,dt,dd,tr').each((_i,node)=>{
    const element=$(node);
    if(element.parents('tr').length)return;
    if(node.tagName==='p'&&element.parents('li').length)return;
    let value='';
    if(node.tagName==='tr'){
      const cells=element.children('th,td').toArray().map(cell=>text($(cell).text())).filter(Boolean);
      if(cells.length>1)value=cells[0]+': '+cells.slice(1).join(' ');
      else value=cells.join(' ');
    }else value=text(element.text());
    if(!value)return;
    if(value.length>MAX_LINE||lines.length>=MAX_LINES)refused();
    const isTitle=/^h[1-3]$/.test(node.tagName)&&!/^제목\s*[:：]/u.test(value);
    lines.push({id:'p'+(lines.length+1),text:isTitle?'제목: '+value:value});
  });
  if(!lines.length)refused();
  const originalSha256=createHash('sha256').update(content).digest('hex');
  return Object.freeze({reviewState:'NEEDS_REVIEW',sourceUrl:canonicalUrl,
    originalSha256,paragraphs:Object.freeze(lines.map(value=>Object.freeze(value)))});
}
/** Compatible with the existing SourceContentExtractor port; the operator
 * still supplies the trusted source policy, revision ledger and review gate. */
export function createCheerioApprovedNoticeExtractor({rootSelector='body'}={}){
  return {extract:async({content,contentType,canonicalUrl})=>
    parseApprovedNoticeHtmlDraft({content,contentType,canonicalUrl,rootSelector}).paragraphs};
}
