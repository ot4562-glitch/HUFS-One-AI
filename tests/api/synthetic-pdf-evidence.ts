/** Invented PDF/page/OCR protocol fixtures. PNGs are synthetic test doubles,
 * not evidence that an external renderer/provider or a human approved a PDF. */
import {createHash} from 'node:crypto';
import {PNG} from 'pngjs';
import {buildOcrRequest,parseOcrResponse} from '../../packages/ai/src/clova-wire.js';
import {normalizeOcrEvidence} from '../../packages/ai/src/ocr-evidence.js';
import {parseSourcePdfEvidence} from '../../apps/api/src/modules/opportunities/source-pdf-evidence.js';

export const pdfHash=(input:Uint8Array|string)=>createHash('sha256').update(input).digest('hex');
export const PDF_AT='2026-11-05T00:00:00.000Z',PDF_REVIEW_AT='2026-11-05T00:01:00.000Z';
function inventedPdf(){
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>',
    '<< /Length 51 >>\nstream\nBT /F1 12 Tf 10 50 Td (SYNTHETIC POSTER ONE) Tj ET\nendstream',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
    '<< /Length 51 >>\nstream\nBT /F1 12 Tf 10 50 Td (SYNTHETIC POSTER TWO) Tj ET\nendstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let value='%PDF-1.7\n% Synthetic fixture\n';const offsets=[0];
  objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(value));value+=(i+1)+' 0 obj\n'+object+'\nendobj\n';});
  const xref=Buffer.byteLength(value);value+='xref\n0 8\n0000000000 65535 f \n';
  for(const offset of offsets.slice(1))value+=String(offset).padStart(10,'0')+' 00000 n \n';
  value+='trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
  return Buffer.from(value);
}
export function syntheticPdfEvidence(revisionSuffix=''){
  const sourceId='SYN-PDF-SOURCE',sourceRevisionId='SYN-PDF-REV'+revisionSuffix,permissionRef='SYN-PDF-PERM';
  const originalBytes=inventedPdf(),originalSha256=pdfHash(originalBytes);
  const rasters=[0,1].map(pageIndex=>{
    const png=new PNG({width:16,height:8});png.data.fill(pageIndex?127:255);
    const bytes=PNG.sync.write(png);
    return {pageIndex,assetId:'SYN-PDF-PAGE-'+pageIndex,rasterSha256:pdfHash(bytes),bytes,width:16,height:8};
  });
  const normalized=rasters.map((r,i)=>{
    const media={bytes:r.bytes,sourceRevisionId,assetId:r.assetId,originalSha256:r.rasterSha256,
      format:'png' as const,width:r.width,height:r.height,transformVersion:'raster-identity-v1'};
    const request=buildOcrRequest(media,'00000000-0000-4000-8000-00000000000'+(i+1),Date.parse(PDF_AT));
    return normalizeOcrEvidence(media,parseOcrResponse(request.context,{
      version:'V2',requestId:'00000000-0000-4000-8000-00000000000'+(i+1),images:[{
        name:'image',inferResult:'SUCCESS',fields:[{inferText:'SYNTHETIC POSTER '+(i?'TWO':'ONE'),
          inferConfidence:.9,type:'NORMAL',lineBreak:true,
          boundingPoly:{vertices:[{x:0,y:0},{x:4,y:0},{x:4,y:2},{x:0,y:2}]}}],
      }],
    }));
  });
  const rawEvidence={
    version:'source-pdf-v1',sourceId,sourceRevisionId,permissionRef,originalSha256,
    originalByteLength:originalBytes.byteLength,
    renderer:{id:'poppler-pdf-v1',version:'synthetic-1',artifactSha256:'a'.repeat(64),policyVersion:'SYN-RENDER-POLICY'},
    pageCount:2,transformVersion:'pdf-full-page-v1',reviewState:'NEEDS_REVIEW',
    transformReceiptId:'SYN-TRANSFORM',externalAiReceiptId:'SYN-EXTERNAL-AI',processingPolicyVersion:'SYN-MEDIA-POLICY',
    pages:rasters.map((r,i)=>({pageIndex:r.pageIndex,assetId:r.assetId,rasterSha256:r.rasterSha256,
      rasterByteLength:r.bytes.byteLength,format:'png',width:r.width,height:r.height,
      mediaBox:[0,0,200,100],cropBox:[0,0,200,100],rotation:0,userUnit:1,
      rasterToPageNorm:[1/16,0,0,1/8,0,0],rasterToPdfPoints:[12.5,0,0,-12.5,0,100],
      ocrFields:normalized[i]!.fields,
    })),
  };
  const canonical=parseSourcePdfEvidence(rawEvidence,{sourceId,revisionId:sourceRevisionId,permissionRef,originalSha256});
  const evidence=canonical.evidence;
  const spans=normalized.map((n,i)=>({...n.lines[0]!.span,originalSha256,pageIndex:i,transformVersion:'pdf-full-page-v1'}));
  const paragraphs=spans.map((span,i)=>({id:'pdf-p'+(i+1)+'-line-1',text:span.quote}));
  const contentSha256=pdfHash(JSON.stringify(paragraphs.map(p=>({id:p.id,text:p.text}))));
  const revision={revisionId:sourceRevisionId,sourceId,permissionRef,originalSha256,contentSha256,
    mediaKind:'PDF',sourceClass:'SYNTHETIC',provenance:'SYNTHETIC',status:'NEEDS_REVIEW',
    changeKind:'NEW',fetchedAt:PDF_AT,lastCheckedAt:PDF_AT,topicCodes:[]};
  return {sourceId,revisionId:sourceRevisionId,permissionRef,originalBytes,originalSha256,evidence,rasters,spans,paragraphs,
    revision,contentSha256,evidenceHash:canonical.sha256,
    input:{revision,paragraphs,originalBytes,permissionReviewed:true,pdfEvidence:evidence,pdfRasters:rasters}};
}
