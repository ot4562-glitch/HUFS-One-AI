import {describe,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {PNG} from 'pngjs';
import {
  createPopplerPdfRenderer,validateRenderedPdf,buildPdfSandboxCommand,pdfRuntimeIdentity,
  type PdfRuntimeConfig,type PdfRenderedDocument,type PdfRendererHost,
} from '../../packages/ai/src/pdf-renderer.js';
const sha=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const input=Buffer.from('%PDF-1.7\nSYNTHETIC FIXTURE ONLY\n%%EOF');
const raster=PNG.sync.write(new PNG({width:20,height:30}));
const runtime:PdfRuntimeConfig={
  runtimeRoot:'/opt/hufs-pdf',bwrap:{path:'/usr/bin/bwrap',sha256:'a'.repeat(64)},
  python:{path:'/opt/hufs-pdf/bin/python3',sha256:'b'.repeat(64)},
  pdftoppm:{path:'/opt/hufs-pdf/bin/pdftoppm',sha256:'c'.repeat(64)},
  worker:{path:'/app/infra/ai/pdf-render-worker.py',sha256:'d'.repeat(64)},
  pypdfDirectory:'/opt/hufs-pdf/pypdf',pypdfTreeSha256:'e'.repeat(64),runtimeTreeSha256:'f'.repeat(64),
  pythonVersion:'3.12.14',pypdfVersion:'6.21.4',popplerVersion:'26.05.0',
  policyVersion:'SYN-PDF-POLICY-1',
};
function result():PdfRenderedDocument{
  return {originalSha256:sha(input),renderer:pdfRuntimeIdentity(runtime),pageCount:2,
    pages:[0,1].map(pageIndex=>({pageIndex,bytes:Buffer.from(raster),format:'png',
      rasterSha256:sha(raster),mediaBox:[10,20,210,320],cropBox:[10,20,210,320],
      rotation:0,userUnit:1}))};
}
const controller=()=>new AbortController();
describe('bounded private PDF renderer',()=>{
  it('is OFF without running a host or reading private runtime configuration',async()=>{
    const run=vi.fn();const engine=createPopplerPdfRenderer({runtime,host:{render:run}});
    await expect(engine.render({bytes:input,originalSha256:sha(input),signal:controller().signal,revalidate:vi.fn()})).rejects.toThrow('PDF_RENDERER_UNAVAILABLE');
    expect(run).not.toHaveBeenCalled();
  });
  it('copies exact original/page bytes and revalidates around a trusted renderer',async()=>{
    let passed:Uint8Array|undefined;const candidate=result(),rights=vi.fn(async()=>{});
    const host:PdfRendererHost={async render(i){passed=i.bytes;return candidate;}};
    const engine=createPopplerPdfRenderer({enabled:true,runtime,host});
    const output=await engine.render({bytes:input,originalSha256:sha(input),signal:controller().signal,revalidate:rights});
    expect(passed).not.toBe(input);expect(rights.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(output.pages).toHaveLength(2);expect(output.pages[1]!.pageIndex).toBe(1);
    candidate.pages[0]!.bytes.fill(0);expect(sha(output.pages[0]!.bytes)).toBe(sha(raster));
  });
  it.each([
    ['original hash',(v:PdfRenderedDocument)=>{v.originalSha256='f'.repeat(64);}],
    ['renderer hash',(v:PdfRenderedDocument)=>{v.renderer.artifactSha256='f'.repeat(64);}],
    ['page count',(v:PdfRenderedDocument)=>{v.pageCount=3;}],
    ['page order',(v:PdfRenderedDocument)=>{v.pages.reverse();}],
    ['page duplication',(v:PdfRenderedDocument)=>{v.pages[1]!.pageIndex=0;}],
    ['raster hash',(v:PdfRenderedDocument)=>{v.pages[0]!.rasterSha256='f'.repeat(64);}],
    ['rotation',(v:PdfRenderedDocument)=>{(v.pages[0] as any).rotation=90;}],
    ['user unit',(v:PdfRenderedDocument)=>{(v.pages[0] as any).userUnit=2;}],
    ['crop',(v:PdfRenderedDocument)=>{v.pages[0]!.cropBox=[10,20,200,320];}],
    ['degenerate box',(v:PdfRenderedDocument)=>{v.pages[0]!.mediaBox=[10,20,10,320];}],
    ['nonfinite box',(v:PdfRenderedDocument)=>{v.pages[0]!.mediaBox=[0,0,Infinity,320];}],
    ['unknown metadata',(v:PdfRenderedDocument)=>{(v.pages[0] as any).verified=true;}],
    ['untrusted raster bytes',(v:PdfRenderedDocument)=>{v.pages[0]!.bytes=Buffer.from('not PNG');v.pages[0]!.rasterSha256=sha(v.pages[0]!.bytes);}],
  ])('refuses %s before returning page evidence',(_name,mutate)=>{
    const candidate=result();mutate(candidate);
    expect(()=>validateRenderedPdf(candidate,input,pdfRuntimeIdentity(runtime))).toThrow('PDF_RENDERER_UNAVAILABLE');
  });
  it('bounds total PDF plus page bytes, including valid PNG prefix with padding',()=>{
    const candidate=result();candidate.pageCount=4;
    const padded=Buffer.alloc(256*1024);raster.copy(padded);
    candidate.pages=[0,1,2,3].map(pageIndex=>({...candidate.pages[0]!,pageIndex,bytes:padded,rasterSha256:sha(padded)}));
    expect(()=>validateRenderedPdf(candidate,input,pdfRuntimeIdentity(runtime))).toThrow();
  });
  it('refuses altered inputs before invoking the host',async()=>{
    const run=vi.fn();const engine=createPopplerPdfRenderer({enabled:true,runtime,host:{render:run}});
    await expect(engine.render({bytes:input,originalSha256:'f'.repeat(64),signal:controller().signal,revalidate:vi.fn()})).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
  });
  it('refuses lost source authority and late success after abort',async()=>{
    const control=controller();let finish!:(x:PdfRenderedDocument)=>void;
    let started!:()=>void;const begun=new Promise<void>(resolve=>{started=resolve;});
    const engine=createPopplerPdfRenderer({enabled:true,runtime,host:{async render(){started();return new Promise(r=>{finish=r;});}}});
    const pending=engine.render({bytes:input,originalSha256:sha(input),signal:control.signal,revalidate:vi.fn(async()=>{})});
    await begun;control.abort();await expect(pending).rejects.toThrow('PDF_RENDERER_UNAVAILABLE');
    finish(result());await Promise.resolve();
    let calls=0;
    const revoked=createPopplerPdfRenderer({enabled:true,runtime,host:{async render(){return result();}}});
    await expect(revoked.render({bytes:input,originalSha256:sha(input),signal:controller().signal,
      revalidate:async()=>{if(++calls>1)throw Error('private secret detail');}})).rejects.toThrow('PDF_RENDERER_UNAVAILABLE');
  });
  it('uses a fixed isolated command, disables network and shell, and passes no source URL',()=>{
    const command=buildPdfSandboxCommand(runtime,'/tmp/hufs-pdf-test');
    expect(command.file).toBe('/usr/bin/bwrap');
    const mounts=command.args.flatMap((arg,i)=>arg==='--ro-bind'?[command.args.slice(i+1,i+3)]:[]);
    expect(mounts).toEqual([[runtime.runtimeRoot,'/'],[runtime.worker.path,'/worker.py']]);
    expect(command.args).toContain('--unshare-all');expect(command.args).toContain('--clearenv');
    expect(command.args).toContain('--cap-drop');expect(command.args).toContain('--die-with-parent');
    expect(command.args).toContain('-I');expect(command.args).toContain('-S');expect(command.args).toContain('-B');
    expect(command.args).not.toContain('-cropbox');expect(command.args).not.toContain('/bin/sh');
    expect(command.args).toContain('/work/input.pdf');expect(command.args).toContain('/worker.py');
  });
  it('refuses unsafe private configuration and binds policy/tool changes into the artifact identity',()=>{
    expect(()=>buildPdfSandboxCommand({...runtime,runtimeRoot:'/'},'/tmp/hufs-pdf-test')).toThrow();
    expect(()=>pdfRuntimeIdentity({...runtime,pypdfVersion:'6.10.0' as any})).toThrow();
    expect(()=>buildPdfSandboxCommand({...runtime,python:{...runtime.python,path:'/opt/hufs-pdf/../evil'}},'/tmp/hufs-pdf-test')).toThrow();
    expect(pdfRuntimeIdentity({...runtime,policyVersion:'SYN-PDF-POLICY-2'}).artifactSha256).not.toBe(pdfRuntimeIdentity(runtime).artifactSha256);
  });
});
