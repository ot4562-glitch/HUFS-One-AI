import {createHash} from 'node:crypto';
import {describe,it,expect,vi} from 'vitest';
import {createApprovedDurableSourceExecutor} from '../../apps/api/src/modules/opportunities/source-ingestion-durable.js';

const canonicalUrl='https://synthetic.example.edu/notice';
const policy={sourceId:'SYN-ACQUIRE',permissionRef:'SYN-RIGHTS',canonicalUrl,
  approvedOrigin:'https://synthetic.example.edu',sourceClass:'LICENSED_EXTERNAL' as const,
  provenance:'REAL_APPROVED' as const,rightsReviewed:true};
const input={sourceId:policy.sourceId,permissionRef:policy.permissionRef,actorRef:'SYN-OPERATOR'};
const text='합성 원본 안내';
function harness(acquire?:(i:{canonicalUrl:string;request:()=>Promise<Response>})=>Promise<void>,
  response:()=>Response|Promise<Response>=()=>new Response(text,{headers:{'content-type':'text/plain',etag:'"RAW"'}}),conditional=false){
  const acquireFn=acquire?vi.fn(acquire):undefined;
  const requestPinned=vi.fn(async()=>response());
  const append=vi.fn(async(_value:any)=>null),storeHttpValidators=vi.fn(async(_value:any)=>{}),observeUnchanged=vi.fn();
  const service=createApprovedDurableSourceExecutor({policies:new Map([[policy.sourceId,policy]]),
    rights:{resolve:async()=>({...policy,policyVersion:'SYN-v1',reviewedBy:'SYN-REVIEWER',
      reviewedAt:'2026-11-10T00:00:00Z',status:'APPROVED',allowedPurposes:new Set(['COLLECT','STORE'])})},
    egress:{resolveAddresses:async()=>['8.8.8.8'],requestPinned},
    extractor:{extract:async({content})=>[{id:'p1',text:new TextDecoder().decode(content)}]},
    ...(acquireFn?{acquisition:{acquire:acquireFn}}:{}),
    readerPool:{connect:async()=>({query:async()=>({rows:conditional?[{revision_id:'SYN-OLD',
      original_sha256:'a'.repeat(64),content_sha256:'b'.repeat(64),fetched_at:'2026-11-10T00:00:00Z',
      permission_ref:policy.permissionRef,etag:'"OLD"',last_modified:null,media_kind:'TEXT',has_image_evidence:false,has_pdf_evidence:false}]:[]}),release:()=>{}})},
    writer:{append,storeHttpValidators,observeUnchanged},now:()=> '2026-11-11T00:00:00Z',
  });
  return {service,acquireFn,requestPinned,append,storeHttpValidators,observeUnchanged};
}
describe('#445 guarded source acquisition driver',()=>{
  it('uses one real guarded request and preserves original bytes/headers independently of parser reads',async()=>{
    const x=harness(async({canonicalUrl:url,request})=>{
      expect(url).toBe(canonicalUrl);const copy=await request();
      expect(await copy.text()).toBe(text);copy.headers.set('etag','"FORGED"');
    });
    await x.service.execute(input);expect(x.acquireFn).toHaveBeenCalledTimes(1);
    expect(x.requestPinned).toHaveBeenCalledTimes(1);
    expect(x.append.mock.calls[0]![0].originalBytes).toEqual(Buffer.from(text));
    expect(x.append.mock.calls[0]![0].revision.originalSha256).toBe(createHash('sha256').update(text).digest('hex'));
    expect(x.storeHttpValidators.mock.calls[0]![0].etag).toBe('"RAW"');
  });
  it.each(['zero','twice','throws'])('refuses a %s driver without storing a draft',async mode=>{
    const x=harness(async({request})=>{
      if(mode==='zero')return;
      await request();
      if(mode==='throws')throw new Error('SECRET SOURCE ERROR');
      try{await request();}catch{/* even a swallowed second request must fail */}
    });
    await expect(x.service.execute(input)).rejects.toThrow('Approved source acquisition failed');
    expect(x.append).not.toHaveBeenCalled();expect(x.requestPinned.mock.calls.length).toBeLessThanOrEqual(1);
  });
  it('seals the request capability after the driver finishes',async()=>{
    let late!:()=>Promise<Response>;
    const x=harness(async({request})=>{late=request;await request();});
    await x.service.execute(input);await expect(late()).rejects.toThrow();
    expect(x.requestPinned).toHaveBeenCalledTimes(1);
  });
  it('retains original bytes when the crawler mutates the stream chunk it received',async()=>{
    const x=harness(async({request})=>{
      const response=await request(),reader=response.body!.getReader();
      const chunk=await reader.read();expect(new TextDecoder().decode(chunk.value)).toBe(text);
      chunk.value!.fill(0);await reader.cancel();reader.releaseLock();
    });
    await x.service.execute(input);
    expect(x.append.mock.calls[0]![0].originalBytes).toEqual(Buffer.from(text));
  });
  it('discards a late response when a broken driver starts but does not await its request',async()=>{
    let deliver!:(r:Response)=>void;const cancel=vi.fn();
    const x=harness(async({request})=>{void request();await vi.waitFor(()=>expect(deliver).toBeTypeOf('function'));},
      ()=>new Promise(resolve=>{deliver=resolve;}));
    await expect(x.service.execute(input)).rejects.toThrow('Approved source acquisition failed');
    deliver(new Response(new ReadableStream({cancel})));
    await vi.waitFor(()=>expect(cancel).toHaveBeenCalledTimes(1));
    expect(x.append).not.toHaveBeenCalled();
  });
  it('preserves valid conditional 304 with no body or fake fresh revision',async()=>{
    const x=harness(async({request})=>{const r=await request();expect(r.status).toBe(304);expect(r.body).toBeNull();},
      ()=>new Response(null,{status:304}),true);
    await expect(x.service.execute(input)).resolves.toEqual({kind:'NOT_MODIFIED',revisionId:'SYN-OLD'});
    expect(x.acquireFn).toHaveBeenCalledTimes(1);expect(x.append).not.toHaveBeenCalled();
  });
  it('cancels oversized raw bodies before handing them to the acquisition driver',async()=>{
    const cancel=vi.fn(),x=harness(async({request})=>{await request();},()=>new Response(
      new ReadableStream({start(c){c.enqueue(new Uint8Array(256*1024+1));},cancel}),{headers:{'content-type':'text/plain'}}));
    await expect(x.service.execute(input)).rejects.toThrow();expect(cancel).toHaveBeenCalledTimes(1);
    expect(x.append).not.toHaveBeenCalled();
  });
});
