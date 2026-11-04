import {createHash} from 'node:crypto';
import {z} from 'zod';
import {decodeRasterInWorker} from '../../../../../packages/ai/src/raster-worker.js';
import type {ClovaRaster,parseOcrResponse} from '../../../../../packages/ai/src/clova-wire.js';
import {normalizeOcrEvidence} from '../../../../../packages/ai/src/ocr-evidence.js';
import {PDF_RENDER_LIMITS} from '../../../../../packages/ai/src/pdf-renderer.js';
import type {PdfRenderer,PdfRendererIdentity} from '../../../../../packages/ai/src/pdf-renderer.js';
import type {ApprovedSourceImageOcr,SourceImageExtractorInput} from './approved-image-extractor.js';
import {parseSourcePdfEvidence,pdfPageTransforms,type SourcePdfEvidence,type SourcePdfRaster} from './source-pdf-evidence.js';

const Ref=z.string().regex(/^[A-Za-z0-9_.:@-]{1,128}$/),Token=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const Sha=z.string().regex(/^[a-f0-9]{64}$/),Time=z.iso.datetime({offset:true});
const Identity=z.strictObject({actorRef:Ref,sourceId:Token,sourceRevisionId:Token,permissionRef:Token,
  assetId:Token,originalSha256:Sha,canonicalUrl:z.string().url()});
const RendererIdentity=z.strictObject({id:z.literal('poppler-pdf-v1'),
  version:z.string().min(1).max(128).regex(/^[\x21-\x7e]+$/),artifactSha256:Sha,policyVersion:Token});
const Coordinate=z.number().finite().min(-14400).max(14400);
const Box=z.tuple([Coordinate,Coordinate,Coordinate,Coordinate]);
const Rendered=z.strictObject({originalSha256:Sha,renderer:RendererIdentity,
  pageCount:z.number().int().min(1).max(PDF_RENDER_LIMITS.pages),
  pages:z.array(z.strictObject({pageIndex:z.number().int().min(0).max(PDF_RENDER_LIMITS.pages-1),
    bytes:z.instanceof(Uint8Array),format:z.literal('png'),rasterSha256:Sha,
    mediaBox:Box,cropBox:Box,rotation:z.literal(0),userUnit:z.literal(1)})).min(1).max(PDF_RENDER_LIMITS.pages)});
const Receipt=Identity.omit({assetId:true}).extend({purpose:z.enum(['TRANSFORM','EXTERNAL_AI']),
  contextSha256:Sha,receiptId:Token,policyVersion:Token,reviewedBy:Ref,reviewedAt:Time,
  startsAt:Time,expiresAt:Time,revokedAt:z.null()}).strict();
export type PdfProcessingReceipt=z.infer<typeof Receipt>;
export interface PdfProcessingAuthority {
  /** Private reviewed facts, independent from the submitting actor. The context
   * binds the pinned renderer/policy and, for external OCR, the complete page
   * raster manifest. A browser flag or the renderer's success is not authority. */
  authorize(input:Omit<z.infer<typeof Identity>,'assetId'>&{
    purpose:'TRANSFORM'|'EXTERNAL_AI';contextSha256:string;now:string;
  }):Promise<PdfProcessingReceipt|null>;
}
export interface SourcePdfExtractor {
  extract(input:SourceImageExtractorInput):Promise<{
    evidence:SourcePdfEvidence;rasters:SourcePdfRaster[];revalidate:()=>Promise<void>;
  }>;
}
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const byteHash=(value:Uint8Array)=>createHash('sha256').update(value).digest('hex');
function denied():never {throw new Error('Approved PDF extraction unavailable');}

/** Default OFF. The injected renderer must be the pinned local, bounded adapter;
 * OCR must already own its authority/billing/UNKNOWN_BILLING guard. No network,
 * provider, process, approval receipt or permission is manufactured here. */
export function createApprovedPdfExtractor(options:{
  authority:PdfProcessingAuthority;renderer?:PdfRenderer;rendererIdentity:PdfRendererIdentity;
  ocr?:ApprovedSourceImageOcr;enabled?:boolean;now?:()=>string;timeoutMs?:number;decode?:typeof decodeRasterInWorker;
}):SourcePdfExtractor{
  const authority=options.authority,renderer=options.renderer,ocr=options.ocr,enabled=options.enabled===true;
  const pinned=RendererIdentity.safeParse(options.rendererIdentity);
  const decode=options.decode??decodeRasterInWorker,now=options.now??(()=>new Date().toISOString()),timeout=options.timeoutMs??20_000;
  return {async extract(input){
    try{
      if(!enabled||!renderer||!ocr||!authority||!pinned.success||!Number.isInteger(timeout)||timeout<1||timeout>20_000
        ||input.contentType!=='application/pdf'||!(input.content instanceof Uint8Array)
        ||!input.content.byteLength||input.content.byteLength>PDF_RENDER_LIMITS.originalBytes
        ||typeof input.assertSourceRights!=='function')denied();
      const identity=Identity.parse({actorRef:input.actorRef,sourceId:input.sourceId,sourceRevisionId:input.sourceRevisionId,
        permissionRef:input.permissionRef,assetId:input.assetId,originalSha256:input.originalSha256,canonicalUrl:input.canonicalUrl});
      const content=Buffer.from(input.content),url=new URL(identity.canonicalUrl),sourceRights=input.assertSourceRights;
      if(byteHash(content)!==identity.originalSha256||!/^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/.test(content.toString('ascii',0,9))
        ||url.protocol!=='https:'||url.href!==identity.canonicalUrl||url.username||url.password||url.hash||url.port)denied();
      const rendererIdentity={...pinned.data},signal=AbortSignal.any([AbortSignal.timeout(timeout),...(input.signal?[input.signal]:[])]);
      const transformContext=hash({version:'pdf-processing-v1',renderer:rendererIdentity,limits:PDF_RENDER_LIMITS,originalByteLength:content.byteLength});
      let externalContext:string|undefined;
      const baseline=new Map<'TRANSFORM'|'EXTERNAL_AI',string>();
      async function bounded<T>(run:()=>Promise<T>):Promise<T>{
        if(signal.aborted)denied();let abort!:()=>void;
        const stopped=new Promise<never>((_resolve,reject)=>{abort=()=>reject(new Error('Approved PDF extraction unavailable'));
          signal.addEventListener('abort',abort,{once:true});});
        const operation=Promise.resolve().then(()=>{if(signal.aborted)denied();return run();});
        try{const value=await Promise.race([operation,stopped]);if(signal.aborted)denied();return value;}
        finally{signal.removeEventListener('abort',abort);}
      }
      async function authorize(purpose:'TRANSFORM'|'EXTERNAL_AI'){
        const contextSha256=purpose==='TRANSFORM'?transformContext:externalContext;if(!contextSha256)denied();
        const at=Time.parse(now()),{assetId:_asset,...binding}=identity;
        const raw=await bounded(()=>authority.authorize({...binding,purpose,contextSha256,now:at}));
        const receipt=Receipt.parse(raw),after=Time.parse(now());
        for(const key of Object.keys(binding) as Array<keyof typeof binding>)if(receipt[key]!==binding[key])denied();
        if(receipt.purpose!==purpose||receipt.contextSha256!==contextSha256||receipt.reviewedBy===identity.actorRef
          ||Date.parse(after)<Date.parse(at)||Date.parse(receipt.reviewedAt)>Date.parse(receipt.startsAt)
          ||Date.parse(receipt.startsAt)>Date.parse(at)||Date.parse(receipt.expiresAt)<=Date.parse(after))denied();
        const fingerprint=hash(receipt),previous=baseline.get(purpose);
        if(previous!==undefined&&previous!==fingerprint)denied();baseline.set(purpose,fingerprint);return receipt;
      }
      const renderRevalidate=async()=>{
        try{await bounded(sourceRights);await authorize('TRANSFORM');await bounded(sourceRights);}catch{denied();}
      };
      const revalidate=async()=>{
        try{await renderRevalidate();await authorize('EXTERNAL_AI');await bounded(sourceRights);}catch{denied();}
      };
      await bounded(sourceRights);const transform=await authorize('TRANSFORM');await bounded(sourceRights);
      const rendered=Rendered.parse(await bounded(()=>renderer.render({
        bytes:Buffer.from(content),originalSha256:identity.originalSha256,signal,revalidate:renderRevalidate,
      })));
      if(rendered.originalSha256!==identity.originalSha256||JSON.stringify(rendered.renderer)!==JSON.stringify(rendererIdentity)
        ||rendered.pages.length!==rendered.pageCount
        ||content.byteLength+rendered.pages.reduce((sum,p)=>sum+p.bytes.byteLength,0)>PDF_RENDER_LIMITS.totalBytes)denied();
      const snapshots=rendered.pages.map((page,index)=>{
        const [x0,y0,x1,y1]=page.mediaBox;
        if(page.pageIndex!==index||!page.bytes.byteLength||page.bytes.byteLength>PDF_RENDER_LIMITS.pageBytes
          ||!page.cropBox.every((n,i)=>n===page.mediaBox[i])||x1<=x0||y1<=y0||x1-x0>14400||y1-y0>14400)denied();
        const bytes=Buffer.from(page.bytes);if(byteHash(bytes)!==page.rasterSha256)denied();
        return {...page,bytes};
      });
      await renderRevalidate();
      const prepared:Array<{page:SourcePdfEvidence['pages'][number];media:ClovaRaster;bytes:Buffer}>=[];
      for(const page of snapshots){
        await renderRevalidate();
        const assetId='pdf-page-'+hash({revision:identity.sourceRevisionId,asset:identity.assetId,page:page.pageIndex});
        const media=structuredClone(await bounded(()=>decode(Buffer.from(page.bytes),{
          sourceRevisionId:identity.sourceRevisionId,assetId,originalSha256:page.rasterSha256,
        },{signal,timeoutMs:5000})));
        if(media.sourceRevisionId!==identity.sourceRevisionId||media.assetId!==assetId
          ||media.originalSha256!==page.rasterSha256||media.format!=='png'||media.transformVersion!=='raster-identity-v1'
          ||!(media.bytes instanceof Uint8Array)||byteHash(media.bytes)!==page.rasterSha256)denied();
        const geometry={width:media.width,height:media.height,mediaBox:page.mediaBox,cropBox:page.cropBox,rotation:0 as const,userUnit:1 as const};
        const transforms=pdfPageTransforms(geometry);
        prepared.push({page:{...geometry,pageIndex:page.pageIndex,assetId,rasterSha256:page.rasterSha256,
          rasterByteLength:page.bytes.byteLength,format:'png',...transforms,ocrFields:[]},media,bytes:page.bytes});
      }
      externalContext=hash({transformContext,pages:prepared.map(({page})=>{
        const {ocrFields:_fields,...manifest}=page;return manifest;
      })});
      const external=await authorize('EXTERNAL_AI');await revalidate();
      let paragraphCount=0;
      for(const entry of prepared){
        await revalidate();
        const received=await bounded(()=>ocr.readCandidate({media:{...entry.media,bytes:Buffer.from(entry.media.bytes)},signal,revalidate}));
        if(received.reviewState!=='NEEDS_REVIEW'||!Array.isArray(received.fields)||!received.fields.length||received.fields.length>2000)denied();
        const fields=structuredClone(received.fields);
        if(Buffer.byteLength(JSON.stringify(fields),'utf8')>500_000)denied();
        const normalized=normalizeOcrEvidence(entry.media,
          {reviewState:'NEEDS_REVIEW',lines:fields} as ReturnType<typeof parseOcrResponse>);
        paragraphCount+=normalized.lines.length;if(paragraphCount>200)denied();
        entry.page.ocrFields=normalized.fields;await revalidate();
      }
      const parsed=parseSourcePdfEvidence({version:'source-pdf-v1',sourceId:identity.sourceId,sourceRevisionId:identity.sourceRevisionId,
        permissionRef:identity.permissionRef,originalSha256:identity.originalSha256,originalByteLength:content.byteLength,
        renderer:rendererIdentity,pageCount:rendered.pageCount,transformVersion:'pdf-full-page-v1',reviewState:'NEEDS_REVIEW',
        transformReceiptId:transform.receiptId,externalAiReceiptId:external.receiptId,
        processingPolicyVersion:'pdf-media-'+hash([...baseline]),pages:prepared.map(x=>x.page),
      },{sourceId:identity.sourceId,revisionId:identity.sourceRevisionId,permissionRef:identity.permissionRef,originalSha256:identity.originalSha256});
      const rasters=prepared.map(({page,bytes})=>({pageIndex:page.pageIndex,assetId:page.assetId,rasterSha256:page.rasterSha256,
        width:page.width,height:page.height,bytes:Buffer.from(bytes)}));
      await revalidate();return {evidence:parsed.evidence,rasters,revalidate};
    }catch{denied();}
  }};
}
