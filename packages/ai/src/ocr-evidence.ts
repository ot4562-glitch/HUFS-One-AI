import {z} from 'zod';
import {SourceSpanVNextSchema} from '@hufs-one/contracts';
import type {SourceSpanVNext} from '@hufs-one/contracts';
import type {ClovaRaster,parseOcrResponse} from './clova-wire.js';

export class OcrEvidenceError extends Error {
  constructor(){super('OCR_EVIDENCE_REQUIRES_REVIEW');this.name='OcrEvidenceError';}
}
const Token=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const Point=z.strictObject({x:z.number().finite().nonnegative(),y:z.number().finite().nonnegative()});
const Field=z.strictObject({id:Token,text:z.string().min(1).max(20000).refine(s=>s.trim().length>0),
  pageIndex:z.literal(0),sourceRevisionId:Token,assetId:Token,originalSha256:z.string().regex(/^[a-f0-9]{64}$/),
  transformVersion:z.literal('raster-identity-v1'),extractionEngine:z.literal('CLOVA_OCR_GENERAL'),
  bboxNorm:z.tuple([z.number().finite(),z.number().finite(),z.number().finite(),z.number().finite()]),
  vertices:z.array(Point).length(4),lineBreak:z.boolean(),confidence:z.number().finite().min(0).max(1)});
const Input=z.strictObject({reviewState:z.literal('NEEDS_REVIEW'),lines:z.array(Field).min(1).max(2000)});
type OcrField=z.infer<typeof Field>;
type EvidenceLine={id:string;text:string;fieldIds:string[];bboxNorm:[number,number,number,number];confidence:number;span:SourceSpanVNext};
function reject():never{throw new OcrEvidenceError();}

/** Deterministic evidence projection, not layout/semantic/OCR quality detection.
 * Only provider lineBreak joins fields; single ASCII spaces are explicit joining
 * separators. Exact field text/vertices remain in fields and line text; the
 * shared IMAGE span schema trims quote edges. Tables, columns,
 * footnote associations and student/admin deadline meaning remain unknown. */
export function normalizeOcrEvidence(media:ClovaRaster,input:ReturnType<typeof parseOcrResponse>){
  try{
    const parsed=Input.parse(input),fields=parsed.lines;
    if(media.transformVersion!=='raster-identity-v1'||!Number.isInteger(media.width)||!Number.isInteger(media.height)
      ||media.width<1||media.height<1||media.width>2240||media.height>2240||media.width*media.height>4_000_000)reject();
    const ids=new Set<string>();
    for(const field of fields){
      if(ids.has(field.id)||field.sourceRevisionId!==media.sourceRevisionId||field.assetId!==media.assetId
        ||field.originalSha256!==media.originalSha256||field.transformVersion!==media.transformVersion)reject();
      ids.add(field.id);
      const turns=field.vertices.map((a,i)=>{
        const b=field.vertices[(i+1)%4]!,c=field.vertices[(i+2)%4]!;
        if(a.x>media.width||a.y>media.height)reject();
        return (b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
      });
      if(!turns.every(v=>v>0)&&!turns.every(v=>v<0))reject();
      const expected=[Math.min(...field.vertices.map(v=>v.x))/media.width,Math.min(...field.vertices.map(v=>v.y))/media.height,
        Math.max(...field.vertices.map(v=>v.x))/media.width,Math.max(...field.vertices.map(v=>v.y))/media.height];
      if(!expected.every((v,i)=>v===field.bboxNorm[i]))reject();
    }
    const lines:EvidenceLine[]=[],pending:OcrField[]=[];
    function flush(){
      if(!pending.length)return;
      if(pending.length>60)reject();
      const text=pending.map(f=>f.text).join(' '),fieldIds=pending.map(f=>f.id);
      const bboxNorm:[number,number,number,number]=[Math.min(...pending.map(f=>f.bboxNorm[0])),Math.min(...pending.map(f=>f.bboxNorm[1])),
        Math.max(...pending.map(f=>f.bboxNorm[2])),Math.max(...pending.map(f=>f.bboxNorm[3]))];
      const span=SourceSpanVNextSchema.parse({kind:'IMAGE',sourceRevisionId:media.sourceRevisionId,assetId:media.assetId,
        originalSha256:media.originalSha256,pageIndex:0,bboxNorm,ocrLineIds:fieldIds,quote:text,
        extractionEngine:'CLOVA_OCR_GENERAL',transformVersion:media.transformVersion});
      lines.push({id:'ocr-line-'+(lines.length+1),text,fieldIds,bboxNorm,confidence:Math.min(...pending.map(f=>f.confidence)),span});
      pending.length=0;
    }
    for(const field of fields){pending.push(field);if(field.lineBreak)flush();}
    flush();
    return {reviewState:'NEEDS_REVIEW' as const,fields,lines};
  }catch{throw new OcrEvidenceError();}
}
