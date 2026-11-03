import {createHash} from 'node:crypto';
import {PNG} from 'pngjs';
import {describe,expect,it} from 'vitest';
import {matchesImageSpan,SourceSpanVNextSchema} from '@hufs-one/contracts';
import {buildOcrRequest,parseOcrResponse} from '../../packages/ai/src/clova-wire.js';
import {decodeApprovedRaster} from '../../packages/ai/src/raster.js';
import {normalizeOcrEvidence,OcrEvidenceError} from '../../packages/ai/src/ocr-evidence.js';

const bytes=PNG.sync.write(new PNG({width:100,height:80}));
const media=decodeApprovedRaster(bytes,{sourceRevisionId:'synthetic-rev',assetId:'synthetic-asset',originalSha256:createHash('sha256').update(bytes).digest('hex')});
const requestId='00000000-0000-4000-8000-000000000001';
function response(){return {version:'V2',requestId,images:[{name:'image',inferResult:'SUCCESS',fields:[
  {inferText:'학생 신청',inferConfidence:0.95,type:'NORMAL',lineBreak:false,boundingPoly:{vertices:[{x:2,y:4},{x:30,y:4},{x:30,y:12},{x:2,y:12}]}},
  {inferText:'11월 5일',inferConfidence:0.88,type:'NORMAL',lineBreak:true,boundingPoly:{vertices:[{x:35,y:4},{x:70,y:4},{x:70,y:12},{x:35,y:12}]}},
  {inferText:'* 관리자 제출 11월 6일',inferConfidence:0.7,type:'NORMAL',lineBreak:false,boundingPoly:{vertices:[{x:2,y:50},{x:90,y:50},{x:90,y:55},{x:2,y:55}]}},
]}]};}
function parsed(){return parseOcrResponse(buildOcrRequest(media,requestId,1).context,response());}

describe('synthetic provider field evidence normalization (not OCR accuracy)',()=>{
  it('groups only explicit provider lineBreak while preserving each field',()=>{
    const input=parsed(),result=normalizeOcrEvidence(media,input);
    expect(result.reviewState).toBe('NEEDS_REVIEW');
    expect(result.fields).toEqual(input.lines);
    expect(result.lines.map(l=>l.text)).toEqual(['학생 신청 11월 5일','* 관리자 제출 11월 6일']);
    expect(result.lines[0]).toMatchObject({fieldIds:['ocr-1','ocr-2'],bboxNorm:[0.02,0.05,0.7,0.15],confidence:0.88});
    expect(result.lines[1]).toMatchObject({fieldIds:['ocr-3'],confidence:0.7});
    expect(result).not.toHaveProperty('studentDeadline');
    expect(result).not.toHaveProperty('table');
  });
  it('emits contract-valid IMAGE spans referencing original field ids',()=>{
    const result=normalizeOcrEvidence(media,parsed()),span=result.lines[0]!.span;
    expect(SourceSpanVNextSchema.safeParse(span).success).toBe(true);
    expect(matchesImageSpan(span,{revisionId:media.sourceRevisionId,assetId:media.assetId,originalSha256:media.originalSha256,
      pageCount:1,transformVersion:media.transformVersion,ocrLines:result.fields})).toBe(true);
  });
  it('retains text whitespace, Unicode, geometry and subpixel small-text coordinates',()=>{
    const raw=response();raw.images[0]!.fields[0]!.inferText='  합성 🧪 각주  ';
    raw.images[0]!.fields[0]!.boundingPoly.vertices=[{x:1.1,y:2.1},{x:9.2,y:2.1},{x:9.2,y:2.8},{x:1.1,y:2.8}];
    const fields=parseOcrResponse(buildOcrRequest(media,requestId,1).context,raw);
    const result=normalizeOcrEvidence(media,fields);
    expect(result.fields[0]!.text).toBe('  합성 🧪 각주  ');
    expect(result.fields[0]!.vertices).toEqual(raw.images[0]!.fields[0]!.boundingPoly.vertices);
    expect(result.lines[0]!.text).toBe('  합성 🧪 각주   11월 5일');
    // The common IMAGE span contract trims its quote; fields/line text are lossless.
    expect(result.lines[0]!.span.quote).toBe('합성 🧪 각주   11월 5일');
  });
  it('snapshots fields against later caller mutation',()=>{const input=parsed(),result=normalizeOcrEvidence(media,input);input.lines[0]!.vertices[0]!.x=99;input.lines[0]!.text='mutated';expect(result.fields[0]!.text).toBe('학생 신청');expect(result.fields[0]!.vertices[0]!.x).toBe(2);});
  it.each(['absentVertices','bbox','page','revision','asset','hash','transform','duplicate','engine','empty','confidence','review','overlongLine'] as const)('rejects %s instead of inventing evidence',kind=>{
    const input:any=parsed(),f=input.lines[0];
    if(kind==='absentVertices')delete f.vertices;
    if(kind==='bbox')f.bboxNorm=[0,0,1,1];
    if(kind==='page')f.pageIndex=1;
    if(kind==='revision')f.sourceRevisionId='other';
    if(kind==='asset')f.assetId='other';
    if(kind==='hash')f.originalSha256='0'.repeat(64);
    if(kind==='transform')f.transformVersion='rotated';
    if(kind==='duplicate')input.lines[1].id=f.id;
    if(kind==='engine')f.extractionEngine='HUMAN';
    if(kind==='empty')f.text=' ';
    if(kind==='confidence')f.confidence=NaN;
    if(kind==='review')input.reviewState='VERIFIED';
    if(kind==='overlongLine')input.lines=Array.from({length:61},(_,i)=>({...f,id:'field-'+i,lineBreak:false}));
    expect(()=>normalizeOcrEvidence(media,input)).toThrow(OcrEvidenceError);
  });
});
