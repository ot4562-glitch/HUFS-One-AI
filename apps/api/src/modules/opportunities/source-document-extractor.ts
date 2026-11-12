import {z} from 'zod';
import type {RevisionParagraph} from './revision-ledger.js';

export const KOREAN_DOCUMENT_MIMES:ReadonlyMap<string,'HWP'|'HWPX'>=new Map([
  ['application/hwp+zip','HWPX'],['application/vnd.hancom.hwpx','HWPX'],
  ['application/x-hwp','HWP'],['application/vnd.hancom.hwp','HWP'],['application/haansofthwp','HWP'],
]);
/** Local parser only. No OCR/LLM/network; the caller still verifies rights and
 * retains the original for independent review of omitted controls/layout. */
export interface SourceDocumentExtractor {
  extract(input:{content:Uint8Array;contentType:string;canonicalUrl:string;
    sourceId:string;revisionId:string}):Promise<unknown>;
}
const Id=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const Draft=z.object({
  state:z.literal('NEEDS_REVIEW'),sourceId:Id,revisionId:Id,
  mediaKind:z.enum(['HWP','HWPX']),originalSha256:z.string().regex(/^[a-f0-9]{64}$/),
  completeness:z.literal('TEXT_ONLY_REQUIRES_ORIGINAL_REVIEW'),
  paragraphs:z.array(z.strictObject({id:Id,text:z.string().trim().min(1).max(20000)})).min(1).max(200),
});
export function parseSourceDocumentDraft(value:unknown,binding:{
  sourceId:string;revisionId:string;mediaKind:'HWP'|'HWPX';originalSha256:string;
}):RevisionParagraph[]{
  const d=Draft.parse(value);
  if(d.sourceId!==binding.sourceId||d.revisionId!==binding.revisionId
    ||d.mediaKind!==binding.mediaKind||d.originalSha256!==binding.originalSha256
    ||new Set(d.paragraphs.map(p=>p.id)).size!==d.paragraphs.length
    ||d.paragraphs.some(p=>/<script\b/i.test(p.text)))
    throw new Error('Unbound document extraction draft');
  return d.paragraphs;
}
