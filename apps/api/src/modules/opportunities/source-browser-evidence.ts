import {createHash} from 'node:crypto';
import {z} from 'zod';
import {SourceBrowserRuntimeSchema} from './source-browser-runtime.js';
import {hashRevisionParagraphs,type RevisionParagraph} from './revision-ledger.js';

const Ref=z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/);
const Sha=z.string().regex(/^[a-f0-9]{64}$/);
const Url=z.string().url().max(1000).refine(raw=>{
  const u=new URL(raw);return u.href===raw&&u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&!u.port;
});
const Root=z.string().regex(/^(?:body|main|article|#[A-Za-z0-9_-]{1,50}|\.[A-Za-z0-9_-]{1,50})$/);
export const SourceBrowserRendererSchema=SourceBrowserRuntimeSchema.extend({id:z.literal('crawlee-playwright-v1')});
export const SourceBrowserResourceSchema=z.strictObject({sourceId:Ref,revisionId:Ref,permissionRef:Ref,
  rightsReceiptId:Ref,
  canonicalUrl:Url,originalSha256:Sha,byteLength:z.number().int().min(1).max(256*1024),
  kind:z.enum(['SCRIPT','STYLE','JSON','IMAGE']),
});
export const SourceBrowserEvidenceSchema=z.strictObject({
  version:z.literal('source-browser-v1'),sourceId:Ref,sourceRevisionId:Ref,permissionRef:Ref,
  canonicalUrl:Url,originalSha256:Sha,originalByteLength:z.number().int().min(1).max(256*1024),
  domSha256:Sha,domByteLength:z.number().int().min(1).max(256*1024),paragraphsSha256:Sha,
  renderingSha256:Sha,renderer:SourceBrowserRendererSchema,rootSelector:Root,
  capturedAt:z.iso.datetime({offset:true}),reviewState:z.literal('NEEDS_REVIEW'),
  resources:z.array(SourceBrowserResourceSchema).max(16),
});
export type SourceBrowserEvidence=z.infer<typeof SourceBrowserEvidenceSchema>;
export type SourceBrowserRenderer=z.infer<typeof SourceBrowserRendererSchema>;
export type SourceBrowserResource=z.infer<typeof SourceBrowserResourceSchema>;
export interface SourceBrowserBinding {
  sourceId:string;revisionId:string;permissionRef:string;originalSha256:string;originalByteLength:number;asOf:string;
  expectedRenderer?:SourceBrowserRenderer;
}
const Paragraphs=z.array(z.strictObject({id:Ref,text:z.string().min(1).max(20000)})).min(1).max(200);
const sha=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
function denied():never{throw new Error('Source browser evidence requires review');}
function inspectDom(bytes:Uint8Array){
  if(!(bytes instanceof Uint8Array)||bytes.byteLength<1||bytes.byteLength>256*1024)denied();
  if(new TextDecoder('utf-8',{fatal:true}).decode(bytes).includes('\0'))denied();
}
function renderingSha(e:Pick<SourceBrowserEvidence,'canonicalUrl'|'domSha256'|'paragraphsSha256'|'renderer'|'rootSelector'|'resources'>){
  return sha(JSON.stringify({canonicalUrl:e.canonicalUrl,domSha256:e.domSha256,paragraphsSha256:e.paragraphsSha256,
    renderer:e.renderer,rootSelector:e.rootSelector,resources:e.resources}));
}
function normalize(raw:unknown):SourceBrowserEvidence{
  const e=SourceBrowserEvidenceSchema.parse(raw);
  e.resources.sort((a,b)=>a.canonicalUrl<b.canonicalUrl?-1:a.canonicalUrl>b.canonicalUrl?1:0);
  if(new Set(e.resources.map(r=>r.canonicalUrl)).size!==e.resources.length
    ||e.resources.reduce((sum,r)=>sum+r.byteLength,0)>1024*1024)denied();
  return e;
}

/** Private candidate proof only: never school authority or an approved revision. */
export function buildSourceBrowserEvidence(input:Omit<SourceBrowserEvidence,
  'version'|'originalSha256'|'originalByteLength'|'domSha256'|'domByteLength'|'paragraphsSha256'|'renderingSha256'|'reviewState'>
  &{originalBytes:Uint8Array;domBytes:Uint8Array;paragraphs:readonly RevisionParagraph[]}):SourceBrowserEvidence{
  try{
    inspectDom(input.domBytes);
    if(!(input.originalBytes instanceof Uint8Array)||!input.originalBytes.byteLength||input.originalBytes.byteLength>256*1024)denied();
    const paragraphs=Paragraphs.parse(input.paragraphs);
    if(new Set(paragraphs.map(p=>p.id)).size!==paragraphs.length)denied();
    const e=normalize({version:'source-browser-v1',sourceId:input.sourceId,sourceRevisionId:input.sourceRevisionId,
      permissionRef:input.permissionRef,canonicalUrl:input.canonicalUrl,originalSha256:sha(input.originalBytes),
      originalByteLength:input.originalBytes.byteLength,domSha256:sha(input.domBytes),domByteLength:input.domBytes.byteLength,
      paragraphsSha256:hashRevisionParagraphs(paragraphs),renderingSha256:'0'.repeat(64),renderer:input.renderer,
      rootSelector:input.rootSelector,capturedAt:input.capturedAt,reviewState:'NEEDS_REVIEW',resources:input.resources});
    e.renderingSha256=renderingSha(e);return e;
  }catch{denied();}
}

/** Revalidate retained DOM bytes and paragraphs independently of renderer code.
 * Source bytes remain separately hashed/stored by the immutable source writer. */
export function parseSourceBrowserEvidence(raw:unknown,rawDom:Uint8Array,rawParagraphs:readonly RevisionParagraph[],binding:SourceBrowserBinding){
  try{
    if(Buffer.byteLength(JSON.stringify(raw),'utf8')>500000)denied();
    const e=normalize(raw),domBytes=Buffer.from(rawDom),paragraphs=Paragraphs.parse(rawParagraphs);
    inspectDom(domBytes);const at=Date.parse(z.iso.datetime({offset:true}).parse(binding.asOf));
    if(e.sourceId!==binding.sourceId||e.sourceRevisionId!==binding.revisionId||e.permissionRef!==binding.permissionRef
      ||e.originalSha256!==binding.originalSha256||e.originalByteLength!==binding.originalByteLength
      ||e.domByteLength!==domBytes.byteLength||e.domSha256!==sha(domBytes)
      ||new Set(paragraphs.map(p=>p.id)).size!==paragraphs.length
      ||e.paragraphsSha256!==hashRevisionParagraphs(paragraphs)||e.renderingSha256!==renderingSha(e)
      ||Date.parse(e.capturedAt)>at
      ||(binding.expectedRenderer&&JSON.stringify(e.renderer)!==JSON.stringify(SourceBrowserRendererSchema.parse(binding.expectedRenderer))))denied();
    return {evidence:e,sha256:sha(JSON.stringify(e)),domBytes,paragraphs};
  }catch{denied();}
}
