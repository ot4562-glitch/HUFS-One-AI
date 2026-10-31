import {describe,expect,it} from 'vitest';
import {verifyRetrievalForAi} from
  '../../apps/api/src/modules/opportunities/evidence-verifier.js';
import type {TrustedTextOrigin,TrustedImageOrigin} from
  '../../apps/api/src/modules/opportunities/evidence-verifier.js';

const ASOF='2026-10-31T00:00:00.000Z';
const old='2026-10-20T00:00:00.000Z';
const origin={
  sourceId:'s1',revisionId:'r1',permissionRef:'P-1',
  status:'ACTIVE' as const,sourceClass:'SYNTHETIC' as const,
  provenance:'SYNTHETIC' as const,fetchedAt:old,lastVerifiedAt:old,
};
const text:TrustedTextOrigin={...origin,kind:'TEXT',paragraphId:'p1',text:'안내 😀 지원 자격'};
const image:TrustedImageOrigin={
  ...origin,kind:'IMAGE',assetId:'poster-1',originalSha256:'a'.repeat(64),
  transformVersion:'ocr-transform-1',pageCount:2,
  ocrLines:[
    {id:'line-1',text:'지원',pageIndex:0,bboxNorm:[0.2,0.2,0.4,0.3]},
    {id:'line-2',text:'자격',pageIndex:0,bboxNorm:[0.4,0.2,0.7,0.3]},
    {id:'line-3',text:'심사',pageIndex:1,bboxNorm:[0.3,0.3,0.6,0.4]},
  ],
};
const textSpan={
  kind:'TEXT' as const,sourceRevisionId:'r1',paragraphId:'p1',
  startCodePoint:3,endCodePoint:4,quote:'😀',
};
const imageSpan={
  kind:'IMAGE' as const,sourceRevisionId:'r1',assetId:'poster-1',
  originalSha256:'a'.repeat(64),pageIndex:0,
  bboxNorm:[0.1,0.1,0.8,0.4] as [number,number,number,number],
  ocrLineIds:['line-1','line-2'],quote:'지원 자격',
  extractionEngine:'CLOVA_OCR_GENERAL' as const,
  transformVersion:'ocr-transform-1',
};
function envelope(span:object){
  return {
    queryVersion:'query-1',asOf:ASOF,sourceRevisionIds:['r1'],
    permissionPolicyVersion:'policy-1',
    retrievalConfigVersion:'synthetic-v1',retrievalState:'READY',
    evidence:[span],
  };
}
function scenario(span:object,originals:readonly (TrustedTextOrigin|TrustedImageOrigin)[]){
  return {
    retrieval:envelope(span),trustedOriginals:originals,
    latestRevisionBySource:new Map([['s1','r1']]),
    permissionRefs:new Set(['P-1']),
    permissionPolicyVersion:'policy-1',asOf:ASOF,
  };
}
describe('TASK-21 original- and rights-bound provider evidence (synthetic only)',()=>{
  it('matches Unicode TEXT spans against the exact trusted paragraph',()=>{
    expect(verifyRetrievalForAi(scenario(textSpan,[text]))?.retrievalState).toBe('READY');
    expect(verifyRetrievalForAi(scenario({...textSpan,quote:'가'},[text]))).toBeNull();
  });
  it('requires an image original hash, page, OCR line IDs and exact text',()=>{
    expect(verifyRetrievalForAi(scenario(imageSpan,[image]))?.retrievalState).toBe('READY');
    for(const modified of [
      {...imageSpan,originalSha256:'b'.repeat(64)},
      {...imageSpan,pageIndex:1},
      {...imageSpan,ocrLineIds:['line-9']},
      {...imageSpan,quote:'허위 자격'},
      {...imageSpan,transformVersion:'ocr-transform-2'},
    ])expect(verifyRetrievalForAi(scenario(modified,[image]))).toBeNull();
  });
  it('rejects valid OCR words cited from the wrong normalized image location',()=>{
    for(const modified of [
      {...imageSpan,bboxNorm:[0.01,0.01,0.15,0.15]},
      {...imageSpan,bboxNorm:[0.2,0.2,0.3,0.3]},
    ])expect(verifyRetrievalForAi(scenario(modified,[image]))).toBeNull();
  });
  it('denies old ACTIVE text after an unverified latest revision appears',()=>{
    const x=scenario(textSpan,[text]);
    x.latestRevisionBySource.set('s1','r2');
    expect(verifyRetrievalForAi(x)).toBeNull();
  });
  it('denies revoked permissions or changed policy versions before AI input',()=>{
    const x=scenario(imageSpan,[image]);
    x.permissionRefs.clear();
    expect(verifyRetrievalForAi(x)).toBeNull();
    const y=scenario(textSpan,[text]);
    y.permissionPolicyVersion='policy-revoked';
    expect(verifyRetrievalForAi(y)).toBeNull();
  });
  it('denies non-active, research-only, unverified or future revisions',()=>{
    for(const original of [
      {...text,status:'NEEDS_REVIEW' as const},
      {...text,provenance:'RESEARCH_ONLY' as const},
      {...text,lastVerifiedAt:'2026-11-01T00:00:00.000Z'},
      {...text,fetchedAt:'2026-11-01T00:00:00.000Z'},
      {...text,validUntil:'2026-10-30T00:00:00.000Z'},
    ])expect(verifyRetrievalForAi(scenario(textSpan,[original]))).toBeNull();
  });
  it('never allows failure-state evidence or unlisted extra revision IDs',()=>{
    const x=scenario(textSpan,[text]);
    expect(verifyRetrievalForAi({...x,retrieval:{
      ...envelope(textSpan),retrievalState:'STALE',
    }})).toBeNull();
    expect(verifyRetrievalForAi({...x,retrieval:{
      ...envelope(textSpan),sourceRevisionIds:['r1','r2'],
    }})).toBeNull();
  });
});
