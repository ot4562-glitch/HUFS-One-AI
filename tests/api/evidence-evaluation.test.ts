import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {verifyRetrievalForAi} from
  '../../apps/api/src/modules/opportunities/evidence-verifier.js';
import type {VerifiedRetrievalInput,TrustedImageOrigin,TrustedTextOrigin} from
  '../../apps/api/src/modules/opportunities/evidence-verifier.js';

const ASOF='2026-10-31T00:00:00.000Z',PAST='2026-10-20T00:00:00.000Z';
const FUTURE='2026-11-10T00:00:00.000Z';
const sha=(v:string)=>createHash('sha256').update(v).digest('hex');
const base={
  sourceId:'SYN-EVAL-SOURCE',revisionId:'SYN-EVAL-REV',permissionRef:'SYN-PERM',
  status:'ACTIVE' as const,sourceClass:'SYNTHETIC' as const,
  provenance:'SYNTHETIC' as const,fetchedAt:PAST,lastVerifiedAt:PAST,
};
function packet(span:object){
  return {queryVersion:'query-eval',asOf:ASOF,sourceRevisionIds:['SYN-EVAL-REV'],
    permissionPolicyVersion:'policy-eval',retrievalConfigVersion:'synthetic-eval-v1',
    retrievalState:'READY',evidence:[span]};
}
function input(span:object,original:TrustedTextOrigin|TrustedImageOrigin):VerifiedRetrievalInput{
  return {retrieval:packet(span),trustedOriginals:[original],
    latestRevisionBySource:new Map([[base.sourceId,base.revisionId]]),
    permissionRefs:new Set([base.permissionRef]),
    permissionPolicyVersion:'policy-eval',asOf:ASOF,now:ASOF};
}
const originalText:TrustedTextOrigin={
  ...base,kind:'TEXT',paragraphId:'SYN-EVAL-PARA',text:'가상 공고는 2026년 마감입니다.',
};
const textSpan={
  kind:'TEXT' as const,sourceRevisionId:base.revisionId,paragraphId:'SYN-EVAL-PARA',
  startCodePoint:0,endCodePoint:Array.from(originalText.text).length,quote:originalText.text,
};
const temporalCases:Array<{id:string,expected:boolean,change:(x:VerifiedRetrievalInput)=>VerifiedRetrievalInput}>= [
  {id:'T01 approved exact quote',expected:true,change:x=>x},
  {id:'T02 fetched after replay asOf',expected:false,change:x=>({...x,trustedOriginals:[{...originalText,fetchedAt:FUTURE}]})},
  {id:'T03 published in the future',expected:false,change:x=>({...x,trustedOriginals:[{...originalText,publishedAt:FUTURE}]})},
  {id:'T04 last human verification is future',expected:false,change:x=>({...x,trustedOriginals:[{...originalText,lastVerifiedAt:FUTURE}]})},
  {id:'T05 valid-from after asOf',expected:false,change:x=>({...x,trustedOriginals:[{...originalText,validFrom:FUTURE}]})},
  {id:'T06 validity expired before asOf',expected:false,change:x=>({...x,trustedOriginals:[{...originalText,validUntil:PAST}]})},
  {id:'T07 permission revoked',expected:false,change:x=>({...x,permissionRefs:new Set()})},
  {id:'T08 policy epoch rotated',expected:false,change:x=>({...x,permissionPolicyVersion:'policy-new'})},
  {id:'T09 corrected successor shadows earlier ACTIVE',expected:false,
    change:x=>({...x,latestRevisionBySource:new Map([[base.sourceId,'SYN-REV-NEW']])})},
  {id:'T10 unverified source status',expected:false,
    change:x=>({...x,trustedOriginals:[{...originalText,status:'NEEDS_REVIEW'}]})},
  {id:'T11 unknown actor academic scope',expected:false,
    change:x=>({...x,trustedOriginals:[{...originalText,applicableScope:{campuses:['SEOUL']}}]})},
  {id:'T12 research-only provenance',expected:false,
    change:x=>({...x,trustedOriginals:[{...originalText,provenance:'RESEARCH_ONLY'}]})},
];
function makePoster(index:number){
  const id=String(index).padStart(2,'0');
  const image:TrustedImageOrigin={...base,kind:'IMAGE',
    assetId:'SYN-POSTER-'+id,originalSha256:sha('poster-'+id),
    transformVersion:'synthetic-transform-1',pageCount:2,
    ocrLines:[{id:'OCR-'+id,text:'가상 지원',pageIndex:index%2,
      bboxNorm:[0.2,0.2,0.6,0.4]}],
  };
  const span={
    kind:'IMAGE' as const,sourceRevisionId:base.revisionId,assetId:image.assetId,
    originalSha256:image.originalSha256,pageIndex:index%2,
    bboxNorm:[0.1,0.1,0.8,0.5] as [number,number,number,number],
    ocrLineIds:['OCR-'+id],quote:'가상 지원',
    extractionEngine:'CLOVA_OCR_GENERAL' as const,transformVersion:'synthetic-transform-1',
  };
  return {image,span};
}
const posterCases:Array<{name:string,pass:boolean,
  change:(p:ReturnType<typeof makePoster>)=>VerifiedRetrievalInput}>= [
  {name:'exact page 0',pass:true,change:p=>input(p.span,p.image)},
  {name:'exact page 1',pass:true,change:p=>input(p.span,p.image)},
  {name:'wrong original sha',pass:false,change:p=>input({...p.span,originalSha256:sha('forged')},p.image)},
  {name:'wrong page number',pass:false,change:p=>input({...p.span,pageIndex:1-p.span.pageIndex},p.image)},
  {name:'unknown OCR line',pass:false,change:p=>input({...p.span,ocrLineIds:['OCR-forged']},p.image)},
  {name:'altered OCR quote',pass:false,change:p=>input({...p.span,quote:'가짜 자격'},p.image)},
  {name:'wrong OCR transform',pass:false,change:p=>input({...p.span,transformVersion:'other-v2'},p.image)},
  {name:'bbox excludes line',pass:false,change:p=>input({...p.span,bboxNorm:[0.0,0.0,0.3,0.3]},p.image)},
  {name:'newer corrected head',pass:false,change:p=>{
    const x=input(p.span,p.image);return {...x,latestRevisionBySource:new Map([[base.sourceId,'SYN-NEW']])};}},
  {name:'missing actor permission',pass:false,change:p=>({...input(p.span,p.image),permissionRefs:new Set()})},
  {name:'permission epoch mismatch',pass:false,change:p=>({...input(p.span,p.image),permissionPolicyVersion:'new-v2'})},
  {name:'human verification in future',pass:false,change:p=>input(p.span,{...p.image,lastVerifiedAt:FUTURE})},
  {name:'expired source',pass:false,change:p=>input(p.span,{...p.image,validUntil:PAST})},
  {name:'unverified original',pass:false,change:p=>input(p.span,{...p.image,status:'NEEDS_REVIEW'})},
  {name:'research provenance',pass:false,change:p=>input(p.span,{...p.image,provenance:'RESEARCH_ONLY'})},
  {name:'research-only source class',pass:false,change:p=>input(p.span,{...p.image,sourceClass:'RESEARCH_REFERENCE_ONLY'})},
  {name:'out-of-range bbox',pass:false,change:p=>input({...p.span,bboxNorm:[-0.1,0.1,0.7,0.4]},p.image)},
  {name:'campus withheld',pass:false,change:p=>input(p.span,{...p.image,applicableScope:{campuses:['SEOUL']}})},
  {name:'wrong official cohort',pass:false,change:p=>({...input(p.span,{
    ...p.image,applicableScope:{cohortMin:2023},
  }),actorScope:{cohort:2021}})},
  {name:'forged source revision',pass:false,change:p=>input({...p.span,sourceRevisionId:'SYN-FAKE'},p.image)},
];
describe('TASK-18/21 synthetic evidence evaluation: 12 temporal scenarios',()=>{
  for(const c of temporalCases)it(c.id,()=>{
    const result=verifyRetrievalForAi(c.change(input(textSpan,originalText)));
    expect(result!==null).toBe(c.expected);
  });
  it('keeps denominator explicit: one allowed case and eleven blocked cases',()=>{
    expect(temporalCases).toHaveLength(12);
    expect(temporalCases.filter(x=>x.expected)).toHaveLength(1);
  });
});
describe('TASK-18/21 synthetic poster evaluation: 20 independent fake assets',()=>{
  for(const [i,c] of posterCases.entries())it('P'+String(i+1).padStart(2,'0')+' '+c.name,()=>{
    const fixture=makePoster(i);
    const result=verifyRetrievalForAi(c.change(fixture));
    expect(result!==null).toBe(c.pass);
  });
  it('reports synthetic exactness only; not real OCR, retrieval recall or model accuracy',()=>{
    const results=posterCases.map((c,i)=>verifyRetrievalForAi(c.change(makePoster(i)))!==null);
    const criticalFalseAcceptance=results.filter((value,i)=>value&&!posterCases[i]!.pass).length;
    expect(posterCases).toHaveLength(20);
    expect(criticalFalseAcceptance).toBe(0);
    expect(results.filter(Boolean)).toHaveLength(2);
  });
});
