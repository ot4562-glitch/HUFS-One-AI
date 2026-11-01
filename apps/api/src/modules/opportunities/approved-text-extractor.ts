import type {RevisionParagraph} from './revision-ledger.js';
import type {SourceContentExtractor} from './approved-fetch.js';

const ENC=new TextDecoder('utf-8',{fatal:true});
const ALLOWED=new Set(['text/plain','text/html','application/rss+xml','application/atom+xml']);
const MAX_TEXT=256*1024;
function decodeEntity(entity:string):string{
  switch(entity){case '&amp;':return '&';case '&lt;':return '<';
    case '&gt;':return '>';case '&quot;':return '"';
    case '&apos;':return "'";case '&nbsp;':return ' ';}
  const m=/^&#(x[0-9a-fA-F]+|[0-9]+);$/.exec(entity);
  if(!m)return entity;
  const hex=m[1]!.startsWith('x');
  const code=Number.parseInt(m[1]!.slice(hex?1:0),hex?16:10);
  if(!Number.isInteger(code)||code<32||code>0x10ffff
    ||(code>=0xd800&&code<=0xdfff)
    ||code===0x7f)return entity;
  return String.fromCodePoint(code);
}
function clean(content:string,xml=false):string{
  // The HTML5 declaration has no external subset. XML and all other DTDs
  // remain forbidden; this parser never expands entities or fetches a DTD.
  if(!xml)content=content.replace(/^\s*<!doctype\s+html\s*>/i,'');
  if(/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(content))throw new Error('External entity/DTD is forbidden');
  if(/<script\b/i.test(content)&&!/<\/script\s*>/i.test(content))
    throw new Error('Unterminated active content');
  if(/<style\b/i.test(content)&&!/<\/style\s*>/i.test(content))
    throw new Error('Unterminated active content');
  if(/<template\b/i.test(content)&&!/<\/template\s*>/i.test(content))
    throw new Error('Unterminated active content');
  // Never execute active HTML, include embedded objects, expand external XML
  // entities, import links, or fetch any secondary resource.
  const withoutActive=content
    .replace(/<!--[\s\S]*?-->/g,' ')
    .replace(/<(script|style|template|svg|iframe|object|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ');
  if(xml&&/<\!\[CDATA\[/i.test(withoutActive))throw new Error('Unsupported CDATA');
  const spaced=withoutActive
    .replace(/<\/?(?:p|div|article|section|h[1-6]|li|br|tr|td|th|item|entry|title|description|summary)\b[^>]*>/gi,'\n')
    .replace(/<[^>]*>/g,' ');
  return spaced
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#x[0-9a-fA-F]+|#[0-9]+);/g,decodeEntity)
    .replace(/\r\n?|\u0000/g,'\n')
    .replace(/[\t ]+/g,' ')
    .normalize('NFC');
}
/** Conservative synthetic-testable extractor, with no remote links or
 * JavaScript execution. PDF/image MUST use an independently approved parser,
 * supplied via SourceContentExtractor. No silent OCR or AI fallback. */
export class ApprovedPlainTextExtractor implements SourceContentExtractor{
  async extract(input:{content:Uint8Array;contentType:string;canonicalUrl:string}):Promise<RevisionParagraph[]>{
    const type=input.contentType.split(';')[0]!.trim().toLowerCase();
    if(!ALLOWED.has(type)||input.content.byteLength===0||input.content.byteLength>MAX_TEXT)
      throw new Error('Source extraction not permitted');
    // Recognize a source URL only as an exact configured canonical identifier;
    // never follow links or read user-controlled file paths.
    const source=new URL(input.canonicalUrl);
    if(source.protocol!=='https:'||source.username||source.password||source.hash
      ||source.port)throw new Error('Invalid source origin');
    const raw=ENC.decode(input.content);
    if(type==='text/plain'){
      if(/\u0000/.test(raw))throw new Error('Binary/plaintext confusion');
    }
    const normalized=type==='text/plain'?raw.replace(/\r\n?/g,'\n').normalize('NFC')
      :clean(raw,type!=='text/html');
    if(normalized.length>MAX_TEXT)throw new Error('Unsupported extracted length');
    const lines=normalized.split(/\n+/g).map(x=>x.trim()).filter(Boolean);
    if(!lines.length||lines.length>200||lines.some(x=>x.length>20_000))
      throw new Error('Source paragraphs require independent extraction review');
    return lines.map((text,i)=>({id:'p'+String(i+1),text}));
  }
}
