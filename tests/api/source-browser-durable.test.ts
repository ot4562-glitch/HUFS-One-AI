import {createHash} from 'node:crypto';
import {describe,it,expect,vi} from 'vitest';
import {createApprovedDurableSourceExecutor} from '../../apps/api/src/modules/opportunities/source-ingestion-durable.js';
import {buildSourceBrowserEvidence} from '../../apps/api/src/modules/opportunities/source-browser-evidence.js';
import {syntheticPreflightDraft} from './fixtures/source-refresh-preflight.js';
import {syntheticSourceRuntimeVersion} from './fixtures/source-runtime-version.js';
const canonicalUrl='https://synthetic.example.edu/notice';
const policy={sourceId:'SYN-BROWSER',permissionRef:'SYN-PERM',canonicalUrl,
  approvedOrigin:'https://synthetic.example.edu',sourceClass:'LICENSED_EXTERNAL' as const,
  provenance:'REAL_APPROVED' as const,rightsReviewed:true};
const input={sourceId:policy.sourceId,permissionRef:policy.permissionRef,actorRef:'SYN-OPERATOR'};
const renderer={id:'crawlee-playwright-v1' as const,wrapperSha256:'a'.repeat(64),bwrapSha256:'b'.repeat(64),
  rootfsSha256:'c'.repeat(64),chromiumVersion:'130.0.1.2',policyVersion:'SYN-BROWSER-1'};
const raw=Buffer.from('<main><script>render()</script></main>'),dom=Buffer.from('<main>SYNTHETIC notice</main>');
const hash=(v:Uint8Array)=>createHash('sha256').update(v).digest('hex');
function harness(){
  let head:any=null,active=true,status=200,version='SYN-BROWSER-1';
  const revalidate=vi.fn(async()=>{if(!active)throw new Error('Browser resource revoked');});
  const paragraphs=[{id:'p1',text:'SYNTHETIC notice'}];
  const extract=vi.fn(async(i:any)=>({domBytes:dom,paragraphs,revalidate,
    evidence:buildSourceBrowserEvidence({sourceId:i.sourceId,sourceRevisionId:i.sourceRevisionId,
      permissionRef:i.permissionRef,canonicalUrl,originalBytes:raw,domBytes:dom,paragraphs,
      renderer:{...renderer,policyVersion:version},rootSelector:'main',capturedAt:'2026-11-11T00:00:00Z',resources:[]})}));
  const append=vi.fn(async(v:any)=>{head={revision_id:v.revision.revisionId,original_sha256:hash(raw),
    content_sha256:v.revision.contentSha256,fetched_at:'2026-11-10T00:00:00Z',permission_ref:policy.permissionRef,
    etag:'"SYN"',media_kind:'HTML',browser_rendering_sha256:v.browserEvidence.renderingSha256};return null;});
  const observeUnchanged=vi.fn(),plain=vi.fn();
  const requestPinned=vi.fn(async(_request:any)=>new Response(status===304?null:raw,{status,
    headers:{'content-type':'text/html; charset=euc-kr',etag:'"SYN"'}}));
  const options={policies:new Map([[policy.sourceId,policy]]),
    rights:{resolve:async()=>({...policy,policyVersion:'SYN-v1',reviewedBy:'SYN-REVIEWER',
      reviewedAt:'2026-11-10T00:00:00Z',status:'APPROVED' as const,allowedPurposes:new Set(['COLLECT','STORE'] as const)})},
    egress:{resolveAddresses:async()=>['8.8.8.8'],requestPinned},extractor:{extract:plain},
    browserExtractor:{extract,renderer},preflight:{loadCurrent:async(i:any)=>syntheticPreflightDraft(i)},
    runtimeVersion:syntheticSourceRuntimeVersion(),budget:{reserve:async()=>true},
    readerPool:{connect:async()=>({query:async()=>({rows:head?[head]:[]}),release:()=>{}})},
    writer:{append,observeUnchanged,storeHttpValidators:vi.fn()},now:()=> '2026-11-11T00:00:01Z'};
  return {options,extract,append,plain,revalidate,observeUnchanged,requestPinned,
    revoke:()=>{active=false;},setStatus:(s:number)=>{status=s;},changeRenderer:()=>{version='SYN-BROWSER-2';}};
}
describe('#445 durable browser evidence integration',()=>{
  it('retains raw bytes separately and passes the complete content type to the browser',async()=>{
    const x=harness();await createApprovedDurableSourceExecutor(x.options).execute(input);
    expect(x.plain).not.toHaveBeenCalled();expect(x.extract.mock.calls[0]![0].contentType).toBe('text/html; charset=euc-kr');
    expect(x.append.mock.calls[0]![0]).toMatchObject({originalBytes:raw,browserDomBytes:dom,
      revision:{status:'NEEDS_REVIEW',mediaKind:'HTML'},browserEvidence:{originalSha256:hash(raw),domSha256:hash(dom)}});
    expect(x.revalidate).toHaveBeenCalled();
  });
  it('renders every HTML check, ignores validators and only reuses identical rendering evidence',async()=>{
    const x=harness(),service=createApprovedDurableSourceExecutor(x.options);
    await service.execute(input);expect((await service.execute(input)).kind).toBe('NOT_MODIFIED');
    expect(x.extract).toHaveBeenCalledTimes(2);expect(x.append).toHaveBeenCalledOnce();
    for(const [request] of x.requestPinned.mock.calls as any)
      expect(new Headers(request.init.headers).has('if-none-match')).toBe(false);
    x.setStatus(304);await expect(service.execute(input)).rejects.toThrow('304');
    expect(x.observeUnchanged).toHaveBeenCalledOnce();
  });
  it('rejects an adapter reporting a renderer different from the pinned identity',async()=>{
    const x=harness();x.changeRenderer();
    await expect(createApprovedDurableSourceExecutor(x.options).execute(input)).rejects.toThrow();
    expect(x.append).not.toHaveBeenCalled();
  });
  it('creates a fresh draft after a reviewed renderer deployment changes despite identical raw bytes and text',async()=>{
    const x=harness();await createApprovedDurableSourceExecutor(x.options).execute(input);
    x.changeRenderer();x.options.browserExtractor.renderer={...renderer,policyVersion:'SYN-BROWSER-2'};
    expect((await createApprovedDurableSourceExecutor(x.options).execute(input)).kind).toBe('CHANGED_DRAFT');
    expect(x.append).toHaveBeenCalledTimes(2);expect(x.observeUnchanged).not.toHaveBeenCalled();
  });
  it('does not reuse browser approval when switching back to static extraction',async()=>{
    const x=harness();await createApprovedDurableSourceExecutor(x.options).execute(input);
    x.plain.mockResolvedValue([{id:'p1',text:'SYNTHETIC notice'}]);
    const {browserExtractor:_browser,...staticOptions}=x.options;
    // Static writes have no browser evidence; inspect the resulting draft directly.
    x.append.mockImplementation(async()=>null);
    expect((await createApprovedDurableSourceExecutor(staticOptions).execute(input)).kind).toBe('CHANGED_DRAFT');
    expect(x.observeUnchanged).not.toHaveBeenCalled();
    expect(x.append.mock.calls[1]![0].browserEvidence).toBeUndefined();
  });
  it('rechecks resource authority before recording an unchanged observation',async()=>{
    const x=harness(),service=createApprovedDurableSourceExecutor(x.options);await service.execute(input);x.revoke();
    await expect(service.execute(input)).rejects.toThrow('revoked');expect(x.observeUnchanged).not.toHaveBeenCalled();
  });
  it.each(['preflight','runtimeVersion','budget'] as const)('requires %s even without a crawler acquisition',key=>{
    const x=harness();delete (x.options as any)[key];expect(()=>createApprovedDurableSourceExecutor(x.options)).toThrow();
  });
});
