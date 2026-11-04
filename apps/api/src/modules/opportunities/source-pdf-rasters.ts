import {createHash} from 'node:crypto';
import {decodeApprovedRaster} from '../../../../../packages/ai/src/raster.js';
import {PDF_RENDER_LIMITS} from '../../../../../packages/ai/src/pdf-renderer.js';
import type {SourcePdfEvidence,SourcePdfRaster} from './source-pdf-evidence.js';

/** Private bounded storage validation. Copies every byte before any caller await.
 * This verifies retained bytes/geometry, never rendering, source rights or human approval. */
export function validatePdfRasters(
  original:Uint8Array,evidence:SourcePdfEvidence,raw:readonly SourcePdfRaster[]|undefined,
):SourcePdfRaster[]{
  try{
    if(!(original instanceof Uint8Array)||!original.byteLength||original.byteLength>PDF_RENDER_LIMITS.originalBytes
      ||original.byteLength!==evidence.originalByteLength
      ||Buffer.from(original.subarray(0,5)).toString('ascii')!=='%PDF-'
      ||createHash('sha256').update(original).digest('hex')!==evidence.originalSha256
      ||!Array.isArray(raw)||raw.length!==evidence.pageCount||raw.length>PDF_RENDER_LIMITS.pages)
      throw Error();
    let total=original.byteLength;
    return raw.map((r,index)=>{
      const page=evidence.pages[index];
      if(!page||!r||r.pageIndex!==index||r.pageIndex!==page.pageIndex||r.assetId!==page.assetId
        ||r.rasterSha256!==page.rasterSha256||r.width!==page.width||r.height!==page.height
        ||!(r.bytes instanceof Uint8Array)||!r.bytes.byteLength||r.bytes.byteLength>PDF_RENDER_LIMITS.pageBytes
        ||r.bytes.byteLength!==page.rasterByteLength)throw Error();
      const bytes=Buffer.from(r.bytes);total+=bytes.byteLength;
      if(total>PDF_RENDER_LIMITS.totalBytes)throw Error();
      const decoded=decodeApprovedRaster(bytes,{sourceRevisionId:evidence.sourceRevisionId,
        assetId:page.assetId,originalSha256:page.rasterSha256});
      if(decoded.format!=='png'||decoded.width!==page.width||decoded.height!==page.height)throw Error();
      return {pageIndex:index,assetId:page.assetId,rasterSha256:page.rasterSha256,
        bytes,width:page.width,height:page.height};
    });
  }catch{throw new Error('Source PDF raster integrity failure');}
}
