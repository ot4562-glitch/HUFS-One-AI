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
    permissionPolicyVersion:'policy-1',asOf:ASOF,now:ASOF,
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
  it('never sends evidence based on an asOf later than trusted server time',()=>{
    const x=scenario(textSpan,[text]);
    x.now='2026-10-20T00:00:00.000Z';
    expect(verifyRetrievalForAi(x)).toBeNull();
  });
  it('rechecks campus, major and cohort against trusted original applicability',()=>{
    const scoped:TrustedTextOrigin={
      ...text,applicableScope:{
        campuses:['SEOUL'],majorCodes:['ECONOMICS'],cohortRange:[2022,2026],
      },
    };
    const x=scenario(textSpan,[scoped]);
    expect(verifyRetrievalForAi(x)).toBeNull();
    const allowed={...x,actorScope:{
      campus:'SEOUL',majorCode:'ECONOMICS',cohort:2024,
    }};
    expect(verifyRetrievalForAi(allowed)?.retrievalState).toBe('READY');
    expect(verifyRetrievalForAi({...allowed,actorScope:{
      campus:'GLOBAL',majorCode:'ECONOMICS',cohort:2024,
    }})).toBeNull();
    expect(verifyRetrievalForAi({...allowed,actorScope:{
      campus:'SEOUL',majorCode:'ECONOMICS',cohort:2021,
    }})).toBeNull();
  });
  it('rechecks source restriction for an independent AI citation: verified graduation, admission, role and cohort',()=>{
    const scoped:TrustedTextOrigin={...text,applicableScope:{
      majorCodes:['ECONOMICS'],majorRoles:['PRIMARY'],
      admissionTypes:['FOREIGN'],graduationTermScope:['2026-2'],
      cohortMax:2014,
    }};
    const x=scenario(textSpan,[scoped]);
    const actorScope={
      majorCode:'ECONOMICS',
      majors:[{code:'ECONOMICS',role:'PRIMARY' as const}],
      admissionType:'FOREIGN',
      graduationTerm:'2026-2',graduationTermVerified:true,cohort:2014,
    };
    expect(verifyRetrievalForAi({...x,actorScope})?.retrievalState).toBe('READY');
    for(const changed of [
      {graduationTermVerified:false},
      {graduationTerm:'2028-1'},
      {graduationTerm:undefined},
      {admissionType:'DOMESTIC'},
      {cohort:2015},
      {majors:[{code:'ECONOMICS',role:'DOUBLE' as const}]},
      {majors:[{code:'OTHER',role:'PRIMARY' as const},{code:'ECONOMICS',role:'DOUBLE' as const}]},
    ])expect(verifyRetrievalForAi({
      ...x,actorScope:{...actorScope,...changed},
    })).toBeNull();
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
describe('#381 duplicate OCR line ids in a trusted image original (synthetic only)',()=>{
  const dup=(lines:TrustedImageOrigin['ocrLines'])=>({...image,ocrLines:lines});
  const good={id:'line-1',text:'지원',pageIndex:0,bboxNorm:[0.2,0.2,0.4,0.3] as const};
  const rest=image.ocrLines.slice(1);
  it.each([
    ['different text','지원 불가',0,[0.2,0.2,0.4,0.3]],
    ['different page','지원',1,[0.2,0.2,0.4,0.3]],
    ['different box','지원',0,[0.6,0.6,0.9,0.9]],
    ['identical copy','지원',0,[0.2,0.2,0.4,0.3]],
  ] as const)('%s: rejected in both line orders',(_label,text,pageIndex,box)=>{
    const other={id:'line-1',text,pageIndex,bboxNorm:box};
    for(const lines of [[other,good,...rest],[good,other,...rest]])
      expect(verifyRetrievalForAi(scenario(imageSpan,[dup(lines)]))).toBeNull();
  });
  it('a duplicate id the span does not cite still makes the original ambiguous',()=>{
    const lines=[...image.ocrLines,{id:'line-3',text:'심사',pageIndex:1,bboxNorm:[0.3,0.3,0.6,0.4] as const}];
    expect(verifyRetrievalForAi(scenario(imageSpan,[dup(lines)]))).toBeNull();
  });
  it('rejects two versions of the same trusted image even if both have individually unique line IDs',()=>{
    const fork:TrustedImageOrigin={...image,ocrLines:[
      {...image.ocrLines[0]!,text:'지원 불가'},
      ...image.ocrLines.slice(1),
    ]};
    for(const originals of [[image,fork],[fork,image],[image,{...image}]])
      expect(verifyRetrievalForAi(scenario(imageSpan,originals))).toBeNull();
  });
  it('rejects duplicate trusted TEXT paragraph identity rather than selecting a convenient quote',()=>{
    const alternate:TrustedTextOrigin={...text,text:'서로 다른 문서 내용'};
    for(const originals of [[text,alternate],[alternate,text],[text,{...text}]])
      expect(verifyRetrievalForAi(scenario(textSpan,originals))).toBeNull();
  });
  it('one ambiguous IMAGE citation rejects the entire mixed TEXT+IMAGE retrieval',()=>{
    const mixed=scenario(imageSpan,[text,image]);
    mixed.retrieval={...envelope(imageSpan),evidence:[textSpan,imageSpan]};
    expect(verifyRetrievalForAi(mixed)?.retrievalState).toBe('READY');
    for(const originals of [
      [text,image,{...image}], [{...image},text,image],
    ])expect(verifyRetrievalForAi({...mixed,trustedOriginals:originals})).toBeNull();
  });
  it('accepts different trusted assets and different paragraph IDs in the same source revision',()=>{
    const distinctImage:TrustedImageOrigin={...image,assetId:'poster-2'};
    const distinctText:TrustedTextOrigin={...text,paragraphId:'p2',text:'다른 문단'};
    expect(verifyRetrievalForAi(scenario(imageSpan,[image,distinctImage,text,distinctText]))
      ?.retrievalState).toBe('READY');
  });
  it('control: unique ids still verify',()=>{
    expect(verifyRetrievalForAi(scenario(imageSpan,[image]))?.retrievalState).toBe('READY');
  });
});
