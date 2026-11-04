import {createHash} from 'node:crypto';
import {PNG} from 'pngjs';
import {describe,expect,it,vi} from 'vitest';
import {buildOcrRequest,parseOcrResponse} from '../../packages/ai/src/clova-wire.js';
import {normalizeOcrEvidence} from '../../packages/ai/src/ocr-evidence.js';
import {decodeApprovedRaster} from '../../packages/ai/src/raster.js';
import {createApprovedPdfExtractor} from '../../apps/api/src/modules/opportunities/approved-pdf-extractor.js';
import {parseSourcePdfEvidence} from '../../apps/api/src/modules/opportunities/source-pdf-evidence.js';
import {createApprovedDurableSourceExecutor} from '../../apps/api/src/modules/opportunities/source-ingestion-durable.js';

const sha=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const sourceId='SYN-PDF',permissionRef='SYN-PDF-PERM',url='https://synthetic.example.edu/poster.pdf';
const epoch=Date.parse('2026-11-05T00:00:00.000Z');
const identity={id:'poppler-pdf-v1' as const,version:'26.05.0',artifactSha256:'c'.repeat(64),policyVersion:'SYN-RENDER-POLICY'};
function pdfBytes(){
  const streams=['0 0 0 rg 30 300 60 80 re f','0 0 0 rg 200 120 120 60 re f'];
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [10 20 210 420] /CropBox [10 20 210 420] /Contents 4 0 R >>',
    '<< /Length '+streams[0]!.length+' >>\nstream\n'+streams[0]+'\nendstream',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /CropBox [0 0 400 200] /Contents 6 0 R >>',
    '<< /Length '+streams[1]!.length+' >>\nstream\n'+streams[1]+'\nendstream'];
  let text='%PDF-1.7\n';const offsets:number[]=[];
  objects.forEach((body,i)=>{offsets.push(Buffer.byteLength(text));text+=(i+1)+' 0 obj\n'+body+'\nendobj\n';});
  const xref=Buffer.byteLength(text);text+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n';
  for(const offset of offsets)text+=String(offset).padStart(10,'0')+' 00000 n \n';
  return Buffer.from(text+'trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
}
const original=pdfBytes();
function raster(pageIndex:number){
  const width=pageIndex===0?20:40,height=pageIndex===0?40:20;
  const png=new PNG({width,height});png.data.fill(255);
  const rect=pageIndex===0?[2,4,8,12]:[20,2,32,8];
  for(let y=rect[1]!;y<rect[3]!;y++)for(let x=rect[0]!;x<rect[2]!;x++){
    const offset=(y*width+x)*4;png.data[offset]=0;png.data[offset+1]=0;png.data[offset+2]=0;
  }
  const bytes=PNG.sync.write(png),box:[number,number,number,number]=pageIndex===0?[10,20,210,420]:[0,0,400,200];
  return {pageIndex,bytes,format:'png' as const,rasterSha256:sha(bytes),mediaBox:box,cropBox:[...box] as [number,number,number,number],rotation:0 as const,userUnit:1 as const};
}
function candidate(media:ReturnType<typeof decodeApprovedRaster>){
  const index=media.width===20?0:1,requestId='00000000-0000-4000-8000-00000000000'+(index+1);
  const request=buildOcrRequest(media,requestId,epoch);
  const vertices=index===0?[{x:2,y:4},{x:8,y:4},{x:8,y:12},{x:2,y:12}]
    :[{x:20,y:2},{x:32,y:2},{x:32,y:8},{x:20,y:8}];
  return normalizeOcrEvidence(media,parseOcrResponse(request.context,{version:'V2',requestId,images:[{
    name:'image',inferResult:'SUCCESS',fields:[{inferText:'SYNTHETIC PAGE '+(index+1),inferConfidence:.9,type:'NORMAL',
      lineBreak:true,boundingPoly:{vertices}}],
  }]}));
}
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(reason?:unknown)=>void;
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function processing(options:{enabled?:boolean;noRenderer?:boolean;noOcr?:boolean;timeoutMs?:number}={}){
  let allowed=true,sourceAllowed=true,at=epoch+10_000,patch:(receipt:any)=>any=x=>x;
  const authority={authorize:vi.fn(async(request:any)=>{
    if(!allowed)return null;const {now:_now,...binding}=request;
    return patch({...binding,receiptId:'SYN-'+request.purpose,policyVersion:'SYN-PDF-PROCESSING',
      reviewedBy:'SYN-INDEPENDENT',reviewedAt:new Date(epoch-60_000).toISOString(),
      startsAt:new Date(epoch).toISOString(),expiresAt:new Date(epoch+3600_000).toISOString(),revokedAt:null});
  })};
  const renderer={render:vi.fn(async(input:any)=>{await input.revalidate();return {
    originalSha256:input.originalSha256,renderer:{...identity},pageCount:2,pages:[raster(0),raster(1)],
  };})};
  const decode=vi.fn(async(bytes:Uint8Array,binding:any)=>decodeApprovedRaster(bytes,binding));
  const ocr={readCandidate:vi.fn(async(input:any)=>{await input.revalidate();return candidate(input.media);})};
  const input={actorRef:'SYN-OPERATOR',sourceId,sourceRevisionId:'SYN-PDF-REV',permissionRef,
    assetId:'SYN-PDF-ASSET',originalSha256:sha(original),canonicalUrl:url,content:original,contentType:'application/pdf',
    assertSourceRights:async()=>{if(!sourceAllowed)throw new Error('Source revoked');}};
  const adapter=createApprovedPdfExtractor({authority,rendererIdentity:identity,decode,now:()=>new Date(at).toISOString(),
    enabled:options.enabled??true,...(options.noRenderer?{}:{renderer}),...(options.noOcr?{}:{ocr}),
    ...(options.timeoutMs===undefined?{}:{timeoutMs:options.timeoutMs})});
  return {adapter,input,authority,renderer,decode,ocr,revoke:()=>{allowed=false;},revokeSource:()=>{sourceAllowed=false;},
    advance:(value:number)=>{at=value;},patch:(value:(receipt:any)=>any)=>{patch=value;}};
}
function durable(pdfExtractor:any){
  let tick=0,head:any=null;const now=()=>new Date(epoch+tick++*1000).toISOString();
  const writer={append:vi.fn(async(value:any)=>{const r=value.revision;head={revision_id:r.revisionId,original_sha256:r.originalSha256,
    content_sha256:r.contentSha256,fetched_at:r.fetchedAt,permission_ref:permissionRef,media_kind:r.mediaKind,
    has_image_evidence:true,has_pdf_evidence:true,etag:null,last_modified:null};return null;}),
    observeUnchanged:vi.fn(async()=>{}),storeHttpValidators:vi.fn(async()=>{})};
  const readerPool={connect:async()=>({query:async()=>({rows:head?[head]:[]}),release:()=>{}})};
  const textExtractor={extract:vi.fn(async()=>{throw new Error('Text cannot receive PDF');})};
  const rights={resolve:vi.fn(async()=>({sourceId,permissionRef,canonicalUrl:url,status:'APPROVED',policyVersion:'SYN-RIGHTS',
    reviewedBy:'SYN-INDEPENDENT',reviewedAt:new Date(epoch-60_000).toISOString(),
    allowedPurposes:new Set(['COLLECT','STORE','EXTERNAL_TRANSFER'])}))};
  const executor=createApprovedDurableSourceExecutor({policies:new Map([[sourceId,{sourceId,permissionRef,canonicalUrl:url,
    approvedOrigin:'https://synthetic.example.edu',sourceClass:'LICENSED_EXTERNAL',provenance:'REAL_APPROVED',rightsReviewed:true}]]),
    rights,egress:{resolveAddresses:async()=>['8.8.8.8'],requestPinned:async()=>new Response(new Uint8Array(original),{headers:{'content-type':'application/pdf'}})},
    extractor:textExtractor,pdfExtractor,readerPool,writer,now} as any);
  return {executor,writer,textExtractor,rights,setHead:(value:any)=>{head=value;}};
}
describe('bounded approved PDF extraction and durable ingestion',()=>{
  it('renders all pages, validates real PNG hashes, and produces review-pending PDF evidence with private rasters',async()=>{
    const x=processing(),result=await x.adapter.extract(x.input);
    const parsed=parseSourcePdfEvidence(result.evidence,{sourceId,revisionId:x.input.sourceRevisionId,permissionRef,originalSha256:sha(original)});
    expect(parsed.evidence.reviewState).toBe('NEEDS_REVIEW');expect(parsed.evidence.pages).toHaveLength(2);
    expect(parsed.spans.map(s=>[s.pageIndex,s.originalSha256,s.transformVersion])).toEqual([
      [0,sha(original),'pdf-full-page-v1'],[1,sha(original),'pdf-full-page-v1'],
    ]);
    expect(x.renderer.render).toHaveBeenCalledOnce();expect(x.ocr.readCandidate).toHaveBeenCalledTimes(2);
    for(const [i,call] of x.ocr.readCandidate.mock.calls.entries()){
      expect(call[0].media.originalSha256).toBe(sha(raster(i).bytes));expect(call[0].media.originalSha256).not.toBe(sha(original));
      expect(result.rasters[i]?.bytes).toEqual(raster(i).bytes);expect(parsed.evidence.pages[i]?.rasterSha256).toBe(sha(result.rasters[i]!.bytes));
    }
    await result.revalidate();
  });
  it('routes authorized PDF ingestion into the durable draft writer and skips rendering identical retained originals',async()=>{
    const x=processing(),job=durable(x.adapter);
    const first=await job.executor.execute({sourceId,permissionRef,actorRef:'SYN-OPERATOR'});
    expect(first.kind).toBe('NEW_DRAFT');expect(job.textExtractor.extract).not.toHaveBeenCalled();
    const stored=job.writer.append.mock.calls[0]![0];
    expect(stored.revision).toMatchObject({mediaKind:'PDF',status:'NEEDS_REVIEW',originalSha256:sha(original)});
    expect(stored.pdfEvidence.version).toBe('source-pdf-v1');expect(stored.pdfRasters).toHaveLength(2);
    const repeat=await job.executor.execute({sourceId,permissionRef,actorRef:'SYN-OPERATOR'});
    expect(repeat).toEqual({kind:'NOT_MODIFIED',revisionId:first.revisionId});
    expect(x.renderer.render).toHaveBeenCalledOnce();expect(job.writer.append).toHaveBeenCalledOnce();
  });
});


describe('PDF authority, renderer and cancellation boundaries',()=>{
  it('stays OFF without an explicit enable, and does not invent missing ports',async()=>{
    const x=processing(),off=createApprovedPdfExtractor({authority:x.authority,rendererIdentity:identity,
      renderer:x.renderer,ocr:x.ocr,decode:x.decode});
    await expect(off.extract(x.input)).rejects.toThrow('Approved PDF extraction unavailable');
    expect(x.authority.authorize).not.toHaveBeenCalled();expect(x.renderer.render).not.toHaveBeenCalled();
    for(const options of [{enabled:false},{noRenderer:true},{noOcr:true}]){
      const value=processing(options);
      await expect(value.adapter.extract(value.input)).rejects.toThrow('Approved PDF extraction unavailable');
      expect(value.renderer.render).not.toHaveBeenCalled();expect(value.ocr.readCandidate).not.toHaveBeenCalled();
    }
  });
  const invalidInput:Array<[string,(input:any)=>void]>=[
    ['MIME',v=>{v.contentType='text/plain';}],['original SHA',v=>{v.originalSha256='d'.repeat(64);}],
    ['PDF magic',v=>{v.content=Buffer.from('not a PDF');v.originalSha256=sha(v.content);}],
    ['original size',v=>{v.content=Buffer.alloc(256*1024+1);v.content.write('%PDF-1.7\n');v.originalSha256=sha(v.content);}],
    ['credential URL',v=>{v.canonicalUrl='https://user:password@synthetic.example.edu/poster.pdf';}],
  ];
  it.each(invalidInput)('rejects invalid %s before authority or rendering',async(_name,mutate)=>{
    const x=processing(),input={...x.input};mutate(input);
    await expect(x.adapter.extract(input)).rejects.toThrow('Approved PDF extraction unavailable');
    expect(x.authority.authorize).not.toHaveBeenCalled();expect(x.renderer.render).not.toHaveBeenCalled();
  });
  const invalidReceipt:Array<[string,(receipt:any)=>any]>=[
    ['actor',r=>({...r,actorRef:'OTHER'})],['source',r=>({...r,sourceId:'OTHER'})],
    ['revision',r=>({...r,sourceRevisionId:'OTHER'})],['permission',r=>({...r,permissionRef:'OTHER'})],
    ['original',r=>({...r,originalSha256:'d'.repeat(64)})],['URL',r=>({...r,canonicalUrl:url+'?other'})],
    ['purpose',r=>({...r,purpose:'EXTERNAL_AI'})],['context',r=>({...r,contextSha256:'d'.repeat(64)})],
    ['self review',r=>({...r,reviewedBy:'SYN-OPERATOR'})],['revocation',r=>({...r,revokedAt:new Date(epoch).toISOString()})],
    ['not started',r=>({...r,startsAt:new Date(epoch+60_000).toISOString()})],
    ['expired',r=>({...r,expiresAt:new Date(epoch+10_000).toISOString()})],
    ['review after period',r=>({...r,reviewedAt:new Date(epoch+1).toISOString()})],
  ];
  it.each(invalidReceipt)('refuses a %s receipt before rendering',async(_name,patch)=>{
    const x=processing();x.patch(patch);
    await expect(x.adapter.extract(x.input)).rejects.toThrow('Approved PDF extraction unavailable');
    expect(x.renderer.render).not.toHaveBeenCalled();expect(x.ocr.readCandidate).not.toHaveBeenCalled();
  });
  it('requires a separate external-AI receipt bound to the full raster manifest',async()=>{
    const x=processing();x.patch(r=>r.purpose==='EXTERNAL_AI'?null:r);
    await expect(x.adapter.extract(x.input)).rejects.toThrow('Approved PDF extraction unavailable');
    expect(x.renderer.render).toHaveBeenCalledOnce();expect(x.decode).toHaveBeenCalledTimes(2);
    expect(x.ocr.readCandidate).not.toHaveBeenCalled();
    const contexts=x.authority.authorize.mock.calls.map(c=>c[0]);
    expect(contexts.find(r=>r.purpose==='EXTERNAL_AI')?.contextSha256)
      .not.toBe(contexts.find(r=>r.purpose==='TRANSFORM')?.contextSha256);
  });
  const invalidRender:Array<[string,(document:any)=>void]>=[
    ['original binding',d=>{d.originalSha256='d'.repeat(64);}],
    ['renderer artifact',d=>{d.renderer.artifactSha256='d'.repeat(64);}],
    ['renderer version',d=>{d.renderer.version='other';}],
    ['page count',d=>{d.pageCount=3;}],['page order',d=>{d.pages.reverse();}],
    ['repeated page',d=>{d.pages[1].pageIndex=0;}],
    ['crop',d=>{d.pages[0].cropBox[0]=11;}],['rotation',d=>{d.pages[0].rotation=90;}],
    ['UserUnit',d=>{d.pages[0].userUnit=2;}],
    ['raster hash',d=>{d.pages[0].rasterSha256='d'.repeat(64);}],
    ['raster format',d=>{d.pages[0].format='jpeg';}],
    ['page bytes',d=>{d.pages[0].bytes=Buffer.alloc(256*1024+1);d.pages[0].rasterSha256=sha(d.pages[0].bytes);}],
    ['total original plus raster bytes',d=>{
      d.pageCount=4;d.pages=[0,1,2,3].map(i=>({...raster(i),bytes:Buffer.alloc(256*1024),rasterSha256:sha(Buffer.alloc(256*1024))}));
    }],
  ];
  it.each(invalidRender)('rejects %s before external OCR',async(_name,mutate)=>{
    const x=processing(),document={originalSha256:x.input.originalSha256,renderer:{...identity},pageCount:2,pages:[raster(0),raster(1)]};
    mutate(document);x.renderer.render.mockResolvedValueOnce(document);
    await expect(x.adapter.extract(x.input)).rejects.toThrow('Approved PDF extraction unavailable');
    expect(x.ocr.readCandidate).not.toHaveBeenCalled();
  });
  it('validates the first page OCR binding before starting the next paid-operation port',async()=>{
    const x=processing();x.ocr.readCandidate.mockImplementationOnce(async({media})=>{
      const result=candidate(media);result.fields[0]!.sourceRevisionId='OTHER';return result;
    });
    await expect(x.adapter.extract(x.input)).rejects.toThrow('Approved PDF extraction unavailable');
    expect(x.ocr.readCandidate).toHaveBeenCalledOnce();
  });
  it('keeps retained raster bytes independent of decoder-owned input buffers',async()=>{
    const x=processing();x.decode.mockImplementationOnce(async(bytes,binding)=>{
      const media=decodeApprovedRaster(bytes,binding),retained={...media,bytes:Buffer.from(media.bytes)};
      bytes.fill(0);return retained;
    });
    const result=await x.adapter.extract(x.input);
    expect(sha(result.rasters[0]!.bytes)).toBe(result.evidence.pages[0]!.rasterSha256);
  });
  it.each(['source','receipt','replacement'] as const)('stops after the first OCR when %s authority changes',async(kind)=>{
    const x=processing();x.ocr.readCandidate.mockImplementationOnce(async({media})=>{
      const result=candidate(media);
      if(kind==='source')x.revokeSource();else if(kind==='receipt')x.revoke();else x.patch(r=>({...r,receiptId:'SYN-REPLACEMENT'}));
      return result;
    });
    await expect(x.adapter.extract(x.input)).rejects.toThrow('Approved PDF extraction unavailable');
    expect(x.ocr.readCandidate).toHaveBeenCalledOnce();
  });
  it.each(['authority','renderer','decoder','ocr'] as const)('cancels during %s and observes a late rejection',async(stage)=>{
    const x=processing(),controller=new AbortController(),entered=deferred<void>(),gate=deferred<any>();
    const wait=async()=>{entered.resolve();return gate.promise;};
    if(stage==='authority')x.authority.authorize.mockImplementationOnce(wait);
    else if(stage==='renderer')x.renderer.render.mockImplementationOnce(wait);
    else if(stage==='decoder')x.decode.mockImplementationOnce(wait);
    else x.ocr.readCandidate.mockImplementationOnce(wait);
    const result=x.adapter.extract({...x.input,signal:controller.signal});
    const rejected=expect(result).rejects.toThrow('Approved PDF extraction unavailable');
    await entered.promise;controller.abort();await rejected;
    gate.reject(new Error('Late private operation failure'));await new Promise(resolve=>setImmediate(resolve));
    expect(x.ocr.readCandidate).toHaveBeenCalledTimes(stage==='ocr'?1:0);
  });
  it('bounds a stalled renderer and ignores its late successful result',async()=>{
    const x=processing({timeoutMs:20}),gate=deferred<any>(),entered=deferred<void>();
    x.renderer.render.mockImplementationOnce(async()=>{entered.resolve();return gate.promise;});
    const result=x.adapter.extract(x.input);const rejected=expect(result).rejects.toThrow('Approved PDF extraction unavailable');
    await entered.promise;await rejected;
    gate.resolve({originalSha256:x.input.originalSha256,renderer:{...identity},pageCount:2,pages:[raster(0),raster(1)]});
    await new Promise(resolve=>setImmediate(resolve));expect(x.ocr.readCandidate).not.toHaveBeenCalled();
  });
  it('takes an independent original snapshot before awaited authority checks',async()=>{
    const x=processing(),content=Buffer.from(original),input={...x.input,content};
    const operation=x.adapter.extract(input);content.fill(0);input.sourceRevisionId='OTHER';
    const result=await operation;
    expect(x.renderer.render.mock.calls[0]![0].bytes).toEqual(original);
    expect(result.evidence.sourceRevisionId).toBe('SYN-PDF-REV');
  });
  it('keeps post-extraction revocation observable to the durable writer',async()=>{
    const x=processing(),result=await x.adapter.extract(x.input);x.revoke();
    await expect(result.revalidate()).rejects.toThrow('Approved PDF extraction unavailable');
  });
  it('does not send PDF through the text extractor when its private adapter is absent',async()=>{
    const job=durable(undefined);
    await expect(job.executor.execute({sourceId,permissionRef,actorRef:'SYN-OPERATOR'})).rejects.toThrow('Approved PDF extractor unavailable');
    expect(job.textExtractor.extract).not.toHaveBeenCalled();expect(job.writer.append).not.toHaveBeenCalled();
  });
  it('requires source external-transfer rights before PDF rendering',async()=>{
    const x=processing(),job=durable(x.adapter),valid=await job.rights.resolve();
    job.rights.resolve.mockResolvedValue({...valid,allowedPurposes:new Set(['COLLECT','STORE'])});
    await expect(job.executor.execute({sourceId,permissionRef,actorRef:'SYN-OPERATOR'})).rejects.toThrow('Source rights unavailable');
    expect(x.renderer.render).not.toHaveBeenCalled();expect(job.writer.append).not.toHaveBeenCalled();
  });
  it('does not persist a partial PDF after the second page OCR fails',async()=>{
    const x=processing(),job=durable(x.adapter);x.ocr.readCandidate.mockImplementationOnce(async({media})=>candidate(media));
    x.ocr.readCandidate.mockRejectedValueOnce(new Error('Second page unavailable'));
    await expect(job.executor.execute({sourceId,permissionRef,actorRef:'SYN-OPERATOR'})).rejects.toThrow('Approved PDF extraction unavailable');
    expect(x.ocr.readCandidate).toHaveBeenCalledTimes(2);expect(job.writer.append).not.toHaveBeenCalled();
  });
  it('does not trust malformed private raster proof returned by an injected adapter',async()=>{
    const x=processing(),job=durable({extract:async(input:any)=>{
      const result=await x.adapter.extract(input);result.rasters[0]!.bytes.fill(0);return result;
    }});
    await expect(job.executor.execute({sourceId,permissionRef,actorRef:'SYN-OPERATOR'})).rejects.toThrow('PDF raster proof mismatch');
    expect(job.writer.append).not.toHaveBeenCalled();
  });
});
