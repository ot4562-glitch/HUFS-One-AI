import {createHash} from 'node:crypto';
import {PNG} from 'pngjs';
import {describe,expect,it} from 'vitest';
import {parseSourcePdfEvidence,pdfPageTransforms} from '../../apps/api/src/modules/opportunities/source-pdf-evidence.js';

const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const binding={sourceId:'SYN-PDF',revisionId:'SYN-PDF-REV',permissionRef:'SYN-PERMISSION',originalSha256:'a'.repeat(64)};
function page(index:number){
  const width=index===0?20:40,height=index===0?40:20;
  const png=new PNG({width,height});png.data.fill(255);const bytes=PNG.sync.write(png),rasterSha256=sha(bytes);
  const assetId='SYN-PDF-PAGE-'+index;
  const mediaBox=index===0?[10,20,210,420]:[0,0,400,200];
  const vertices=index===0?[{x:2,y:4},{x:8,y:4},{x:8,y:12},{x:2,y:12}]
    :[{x:20,y:2},{x:32,y:2},{x:32,y:8},{x:20,y:8}];
  const bboxNorm=index===0?[.1,.1,.4,.3]:[.5,.1,.8,.4];
  return {pageIndex:index,assetId,rasterSha256,rasterByteLength:bytes.length,format:'png',width,height,
    mediaBox,cropBox:[...mediaBox],rotation:0,userUnit:1,
    rasterToPageNorm:[1/width,0,0,1/height,0,0],
    rasterToPdfPoints:[(mediaBox[2]!-mediaBox[0]!)/width,0,0,-(mediaBox[3]!-mediaBox[1]!)/height,mediaBox[0],mediaBox[3]],
    ocrFields:[{id:'SYN-FIELD',text:index===0?'합성 첫 페이지':'합성 둘째 페이지',pageIndex:0,
      sourceRevisionId:binding.revisionId,assetId,originalSha256:rasterSha256,transformVersion:'raster-identity-v1',
      extractionEngine:'CLOVA_OCR_GENERAL',bboxNorm,vertices,lineBreak:true,confidence:.9}]};
}
function bundle(){return {version:'source-pdf-v1',sourceId:binding.sourceId,sourceRevisionId:binding.revisionId,
  permissionRef:binding.permissionRef,originalSha256:binding.originalSha256,originalByteLength:500,
  renderer:{id:'poppler-pdf-v1',version:'26.05.0',artifactSha256:'c'.repeat(64),policyVersion:'SYN-PDF-RENDER-1'},
  pageCount:2,transformVersion:'pdf-full-page-v1',reviewState:'NEEDS_REVIEW',
  transformReceiptId:'SYN-TRANSFORM',externalAiReceiptId:'SYN-EXTERNAL',processingPolicyVersion:'SYN-PROCESSING-1',
  pages:[page(0),page(1)]};}
describe('retained PDF evidence with explicit original-page transforms',()=>{
  it('keeps the actual page raster proof while rebinding final citations to the original PDF and page',()=>{
    const input=bundle(),result=parseSourcePdfEvidence(input,binding);
    expect(result.evidence.reviewState).toBe('NEEDS_REVIEW');
    expect(result.paragraphs).toEqual([
      {id:'pdf-p1-line-1',text:'합성 첫 페이지'},{id:'pdf-p2-line-1',text:'합성 둘째 페이지'},
    ]);
    expect(result.spans).toEqual([
      {kind:'IMAGE',sourceRevisionId:binding.revisionId,assetId:'SYN-PDF-PAGE-0',originalSha256:binding.originalSha256,
        pageIndex:0,bboxNorm:[.1,.1,.4,.3],ocrLineIds:['SYN-FIELD'],quote:'합성 첫 페이지',
        extractionEngine:'CLOVA_OCR_GENERAL',transformVersion:'pdf-full-page-v1'},
      {kind:'IMAGE',sourceRevisionId:binding.revisionId,assetId:'SYN-PDF-PAGE-1',originalSha256:binding.originalSha256,
        pageIndex:1,bboxNorm:[.5,.1,.8,.4],ocrLineIds:['SYN-FIELD'],quote:'합성 둘째 페이지',
        extractionEngine:'CLOVA_OCR_GENERAL',transformVersion:'pdf-full-page-v1'},
    ]);
    expect(result.evidence.pages[0]?.rasterToPdfPoints).toEqual([10,0,0,-10,10,420]);
    expect(result.evidence.pages[0]?.ocrFields[0]).toMatchObject({originalSha256:input.pages[0]!.rasterSha256,
      pageIndex:0,transformVersion:'raster-identity-v1'});
    expect(result.evidence.pages[0]?.rasterSha256).not.toBe(binding.originalSha256);
    expect(result.sha256).toBe(createHash('sha256').update(JSON.stringify(result.evidence)).digest('hex'));
    input.pages[0]!.ocrFields[0]!.text='late mutation';
    expect(result.paragraphs[0]?.text).toBe('합성 첫 페이지');
  });
  it('reconstructs the same canonical hash after a JSONB-style object-key reordering',()=>{
    const reorder=(value:any):any=>Array.isArray(value)?value.map(reorder)
      :value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([k,v])=>[k,reorder(v)])):value;
    const input=bundle();
    expect(parseSourcePdfEvidence(reorder(input),binding).sha256).toBe(parseSourcePdfEvidence(input,binding).sha256);
  });
  const invalid:Array<[string,(value:any)=>void]>=[
    ['source binding',v=>{v.sourceId='OTHER';}],['revision binding',v=>{v.sourceRevisionId='OTHER';}],
    ['original binding',v=>{v.originalSha256='b'.repeat(64);}],['permission binding',v=>{v.permissionRef='OTHER';}],
    ['self approval',v=>{v.reviewState='APPROVED';}],['identity transform claim',v=>{v.transformVersion='raster-identity-v1';}],
    ['missing page',v=>{v.pages.pop();}],['repeated page index',v=>{v.pages[1].pageIndex=0;}],
    ['reordered pages',v=>{v.pages.reverse();}],['repeated asset',v=>{v.pages[1].assetId=v.pages[0].assetId;}],
    ['rotation',v=>{v.pages[0].rotation=90;}],['crop',v=>{v.pages[0].cropBox[0]=20;}],
    ['UserUnit',v=>{v.pages[0].userUnit=2;}],['invalid box',v=>{v.pages[0].mediaBox[2]=10;v.pages[0].cropBox[2]=10;}],
    ['stretched raster',v=>{v.pages[0].width=40;}],['wrong normalized transform',v=>{v.pages[0].rasterToPageNorm[0]=1;}],
    ['wrong PDF point transform',v=>{v.pages[0].rasterToPdfPoints[5]=0;}],
    ['PDF hash disguised as raster hash',v=>{v.pages[0].ocrFields[0].originalSha256=v.originalSha256;}],
    ['OCR page disguised as PDF page',v=>{v.pages[1].ocrFields[0].pageIndex=1;}],
    ['forged bbox',v=>{v.pages[0].ocrFields[0].bboxNorm=[0,0,.9,.9];}],
    ['oversized original',v=>{v.originalByteLength=256*1024+1;}],
    ['oversized page',v=>{v.pages[0].rasterByteLength=256*1024+1;}],
    ['combined byte envelope',v=>{v.originalByteLength=256*1024;v.pageCount=4;v.pages=[0,1,2,3].map(page);
      for(const p of v.pages)p.rasterByteLength=256*1024;}],
    ['unexpected metadata',v=>{v.pages[0].verified=true;}],
  ];
  it.each(invalid)('refuses %s rather than creating a PDF citation',(_name,mutate)=>{
    const value=bundle();mutate(value);
    expect(()=>parseSourcePdfEvidence(value,binding)).toThrow('Source PDF evidence requires review');
  });
});

describe('PDF native and canonical geometry agreement',()=>{
  it.each([
    {width:20,height:40,mediaBox:[20000,0,20200,400],cropBox:[20000,0,20200,400]},
    {width:20,height:42,mediaBox:[0,0,200,400],cropBox:[0,0,200,400]},
  ])('refuses coordinates or axis distortion outside the native renderer envelope',geometry=>{
    expect(()=>pdfPageTransforms({...geometry,rotation:0,userUnit:1})).toThrow('Source PDF evidence requires review');
  });
});
