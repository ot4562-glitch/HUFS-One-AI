import {createHash} from 'node:crypto';
import {z} from 'zod';
import {SourceSpanVNextSchema} from '@hufs-one/contracts';
import type {SourceSpanVNext} from '@hufs-one/contracts';
import {normalizeOcrEvidence} from '../../../../../packages/ai/src/ocr-evidence.js';
import type {parseOcrResponse} from '../../../../../packages/ai/src/clova-wire.js';
import {PDF_RENDER_LIMITS} from '../../../../../packages/ai/src/pdf-renderer.js';
import type {PdfRendererIdentity} from '../../../../../packages/ai/src/pdf-renderer.js';
import type {SourceImageBinding} from './source-image-evidence.js';

const Token=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/),Sha=z.string().regex(/^[a-f0-9]{64}$/);
const Coordinate=z.number().finite().min(-14400).max(14400);
const Box=z.tuple([Coordinate,Coordinate,Coordinate,Coordinate]);
const Matrix=z.tuple([z.number().finite(),z.number().finite(),z.number().finite(),
  z.number().finite(),z.number().finite(),z.number().finite()]);
const Geometry=z.strictObject({width:z.number().int().min(1).max(2240),height:z.number().int().min(1).max(2240),
  mediaBox:Box,cropBox:Box,rotation:z.literal(0),userUnit:z.literal(1)});
const Renderer=z.strictObject({id:z.literal('poppler-pdf-v1'),
  version:z.string().min(1).max(128).regex(/^[\x21-\x7e]+$/),artifactSha256:Sha,policyVersion:Token});
const Page=Geometry.extend({pageIndex:z.number().int().min(0).max(PDF_RENDER_LIMITS.pages-1),
  assetId:Token,rasterSha256:Sha,rasterByteLength:z.number().int().min(1).max(PDF_RENDER_LIMITS.pageBytes),
  format:z.literal('png'),rasterToPageNorm:Matrix,rasterToPdfPoints:Matrix,
  ocrFields:z.array(z.unknown()).min(1).max(2000)}).strict();
const Bundle=z.strictObject({version:z.literal('source-pdf-v1'),sourceId:Token,sourceRevisionId:Token,
  permissionRef:Token,originalSha256:Sha,originalByteLength:z.number().int().min(1).max(PDF_RENDER_LIMITS.originalBytes),
  renderer:Renderer,pageCount:z.number().int().min(1).max(PDF_RENDER_LIMITS.pages),
  transformVersion:z.literal('pdf-full-page-v1'),reviewState:z.literal('NEEDS_REVIEW'),
  transformReceiptId:Token,externalAiReceiptId:Token,processingPolicyVersion:Token,
  pages:z.array(Page).min(1).max(PDF_RENDER_LIMITS.pages)});
export type SourcePdfEvidence=z.infer<typeof Bundle>&{renderer:PdfRendererIdentity};
export interface SourcePdfRaster {
  pageIndex:number;assetId:string;rasterSha256:string;bytes:Uint8Array;width:number;height:number;
}
type ImageSpan=Extract<SourceSpanVNext,{kind:'IMAGE'}>;
function denied():never {throw new Error('Source PDF evidence requires review');}

/** Supported v1: the complete unrotated MediaBox, equal CropBox, UserUnit=1.
 * bboxNorm uses the ORIGINAL page's top-left origin and y-down axes.
 * The second matrix separately maps raster pixels to PDF native points, including
 * the MediaBox offset and y flip. A PDF transform is never raster identity. */
export function pdfPageTransforms(raw:unknown){
  try{
    const page=Geometry.parse(raw),[x0,y0,x1,y1]=page.mediaBox;
    const pageWidth=x1-x0,pageHeight=y1-y0;
    if(pageWidth<=0||pageHeight<=0||pageWidth>14400||pageHeight>14400
      ||page.width*page.height>4_000_000||!page.cropBox.every((n,i)=>n===page.mediaBox[i])
      // Match the native renderer's maximum one-pixel rounding on each axis.
      ||Math.abs(page.width-page.height*pageWidth/pageHeight)>1.01
      ||Math.abs(page.height-page.width*pageHeight/pageWidth)>1.01)denied();
    const rasterToPageNorm:[number,number,number,number,number,number]=[1/page.width,0,0,1/page.height,0,0];
    const rasterToPdfPoints:[number,number,number,number,number,number]=[pageWidth/page.width,0,0,-pageHeight/page.height,x0,y1];
    return {rasterToPageNorm,rasterToPdfPoints};
  }catch{denied();}
}

/** Reconstructs candidate proof from retained raster OCR fields. The private
 * writer/reviewer must additionally check original/page byte lengths, hashes and
 * decoded PNG geometry. This function alone grants no rendering or OCR authority. */
export function parseSourcePdfEvidence(raw:unknown,binding:SourceImageBinding){
  try{
    if(Buffer.byteLength(JSON.stringify(raw),'utf8')>500_000)denied();
    const parsed=Bundle.parse(raw);
    if(parsed.sourceId!==binding.sourceId||parsed.sourceRevisionId!==binding.revisionId
      ||parsed.permissionRef!==binding.permissionRef||parsed.originalSha256!==binding.originalSha256
      ||parsed.pages.length!==parsed.pageCount
      ||parsed.originalByteLength+parsed.pages.reduce((sum,p)=>sum+p.rasterByteLength,0)>PDF_RENDER_LIMITS.totalBytes)denied();
    const assets=new Set<string>(),paragraphs:Array<{id:string;text:string}>=[],spans:ImageSpan[]=[];
    const pages=parsed.pages.map((page,index)=>{
      if(page.pageIndex!==index||assets.has(page.assetId))denied();assets.add(page.assetId);
      const transforms=pdfPageTransforms({width:page.width,height:page.height,mediaBox:page.mediaBox,
        cropBox:page.cropBox,rotation:page.rotation,userUnit:page.userUnit});
      if(!page.rasterToPageNorm.every((n,i)=>n===transforms.rasterToPageNorm[i])
        ||!page.rasterToPdfPoints.every((n,i)=>n===transforms.rasterToPdfPoints[i]))denied();
      // OCR wire proof refers to these actual PNG bytes and page zero, before the
      // explicit full-page PDF mapping below. PDF SHA cannot stand in for PNG SHA.
      const normalized=normalizeOcrEvidence({bytes:new Uint8Array(),sourceRevisionId:parsed.sourceRevisionId,
        assetId:page.assetId,originalSha256:page.rasterSha256,format:'png',width:page.width,height:page.height,
        transformVersion:'raster-identity-v1'},
      {reviewState:'NEEDS_REVIEW',lines:page.ocrFields} as ReturnType<typeof parseOcrResponse>);
      normalized.lines.forEach((line,lineIndex)=>{
        if(line.span.kind!=='IMAGE')denied();
        // For this validated full-page orientation, original-page normalized
        // coordinates equal raster-normalized coordinates; hashes/transforms do not.
        const span=SourceSpanVNextSchema.parse({...line.span,originalSha256:parsed.originalSha256,
          pageIndex:page.pageIndex,transformVersion:'pdf-full-page-v1'});
        if(span.kind!=='IMAGE')denied();
        paragraphs.push({id:'pdf-p'+(page.pageIndex+1)+'-line-'+(lineIndex+1),text:span.quote});spans.push(span);
      });
      return {...page,...transforms,ocrFields:normalized.fields};
    });
    const evidence:SourcePdfEvidence={...parsed,pages};
    if(!paragraphs.length||paragraphs.length>200||Buffer.byteLength(JSON.stringify(paragraphs),'utf8')>500_000
      ||Buffer.byteLength(JSON.stringify(evidence),'utf8')>500_000)denied();
    const sha256=createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
    return {evidence,paragraphs,spans,sha256};
  }catch{denied();}
}
