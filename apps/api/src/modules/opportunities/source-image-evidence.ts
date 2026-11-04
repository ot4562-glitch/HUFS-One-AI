import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {SourceSpanVNext} from '@hufs-one/contracts';
import {normalizeOcrEvidence} from '../../../../../packages/ai/src/ocr-evidence.js';
import type {parseOcrResponse} from '../../../../../packages/ai/src/clova-wire.js';

const Token=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const Sha=z.string().regex(/^[a-f0-9]{64}$/);
const Bundle=z.strictObject({
  version:z.literal('source-image-v1'),sourceId:Token,sourceRevisionId:Token,
  permissionRef:Token,assetId:Token,originalSha256:Sha,rasterSha256:Sha,
  format:z.enum(['png','jpeg']),width:z.number().int().min(1).max(2240),
  height:z.number().int().min(1).max(2240),
  transformVersion:z.literal('raster-identity-v1'),reviewState:z.literal('NEEDS_REVIEW'),
  transformReceiptId:Token,externalAiReceiptId:Token,processingPolicyVersion:Token,
  ocrFields:z.array(z.unknown()).min(1).max(2000),
}).refine(v=>v.width*v.height<=4_000_000&&v.rasterSha256 === v.originalSha256);
export type SourceImageEvidence=z.infer<typeof Bundle>;
export type ImageSourceSpan=Extract<SourceSpanVNext,{kind:'IMAGE'}>;
export type SourceImageBinding={
  sourceId:string;revisionId:string;permissionRef:string;originalSha256:string;
};
export function imageEvidenceHash(evidence:SourceImageEvidence):string{
  return createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
}

/** Retained extraction evidence, never an approval. No image bytes are returned.
 * Identity-only raster v1 has one page and identical original/raster hashes.
 * Full provider fields/vertices are retained so independent reviewers can attest
 * the exact OCR/bbox bundle, not merely the extracted paragraph hash. */
export function parseSourceImageEvidence(raw:unknown,binding:SourceImageBinding){
  try{
    if(Buffer.byteLength(JSON.stringify(raw),'utf8')>500_000)throw Error();
    const parsed=Bundle.parse(raw);
    if(parsed.sourceId !== binding.sourceId||parsed.sourceRevisionId !== binding.revisionId
      ||parsed.permissionRef !== binding.permissionRef||parsed.originalSha256 !== binding.originalSha256)throw Error();
    const normalized=normalizeOcrEvidence({
      bytes:new Uint8Array(),sourceRevisionId:parsed.sourceRevisionId,assetId:parsed.assetId,
      originalSha256:parsed.originalSha256,format:parsed.format,width:parsed.width,height:parsed.height,
      transformVersion:parsed.transformVersion,
    },{reviewState:'NEEDS_REVIEW',lines:parsed.ocrFields} as ReturnType<typeof parseOcrResponse>);
    if(normalized.lines.length>200)throw Error();
    const evidence:SourceImageEvidence={...parsed,ocrFields:normalized.fields};
    const paragraphs=normalized.lines.map(line=>({id:line.id,text:line.span.quote}));
    const spans=normalized.lines.map(line=>{
      if(line.span.kind !== 'IMAGE')throw Error();
      return line.span;
    });
    if(Buffer.byteLength(JSON.stringify(evidence),'utf8')>500_000
      ||Buffer.byteLength(JSON.stringify(paragraphs),'utf8')>500_000)throw Error();
    return {evidence,paragraphs,spans,sha256:imageEvidenceHash(evidence)};
  }catch{throw new Error('Source image evidence requires review');}
}
