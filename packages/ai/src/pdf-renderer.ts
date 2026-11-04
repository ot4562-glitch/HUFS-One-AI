import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {constants} from 'node:fs';
import {lstat,mkdtemp,open,readdir,readlink,rm,writeFile} from 'node:fs/promises';
import {posix} from 'node:path';
import {z} from 'zod';

/** Private, default-OFF PDF raster boundary. No provider call or approval is created here. */
export type PdfBox=readonly [number,number,number,number];
export interface PdfRendererIdentity {
  id:'poppler-pdf-v1';
  version:string;
  artifactSha256:string;
  policyVersion:string;
}
export interface PdfRenderedPage {
  pageIndex:number;
  bytes:Uint8Array;
  format:'png';
  rasterSha256:string;
  mediaBox:PdfBox;
  cropBox:PdfBox;
  rotation:0;
  userUnit:1;
}
export interface PdfRenderedDocument {
  originalSha256:string;
  renderer:PdfRendererIdentity;
  pageCount:number;
  pages:PdfRenderedPage[];
}
export interface PdfRenderer {
  /** Caller supplies only bounded bytes and current authority; file paths/commands are private configuration. */
  render(input:{
    bytes:Uint8Array;
    originalSha256:string;
    signal:AbortSignal;
    revalidate:()=>Promise<void>;
  }):Promise<PdfRenderedDocument>;
}
export const PDF_RENDER_LIMITS=Object.freeze({
  originalBytes:256*1024,
  pages:4,
  pageBytes:256*1024,
  totalBytes:1024*1024,
  timeoutMs:10_000,
});

const Sha=z.string().regex(/^[a-f0-9]{64}$/);
const Version=z.string().regex(/^\d+\.\d+\.\d+$/);
const Token=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const SafePath=z.string().min(2).max(4096).refine(p=>
  /^\/[A-Za-z0-9_./-]+$/.test(p)&&posix.normalize(p)===p&&!p.endsWith('/')
  &&!p.split('/').some(v=>v==='.'||v==='..'));
const Pinned=z.strictObject({path:SafePath,sha256:Sha});
const Runtime=z.strictObject({
  runtimeRoot:SafePath.refine(p=>p.startsWith('/opt/')||p.startsWith('/app/runtime/')),
  bwrap:Pinned,python:Pinned,pdftoppm:Pinned,worker:Pinned,
  pypdfDirectory:SafePath,pypdfTreeSha256:Sha,runtimeTreeSha256:Sha,
  pythonVersion:Version,pypdfVersion:z.literal('6.21.4'),popplerVersion:Version,policyVersion:Token,
}).refine(r=>r.pypdfDirectory.startsWith(r.runtimeRoot+'/')
  &&r.python.path.startsWith(r.runtimeRoot+'/')
  &&r.pdftoppm.path.startsWith(r.runtimeRoot+'/'));
export type PdfRuntimeConfig=z.infer<typeof Runtime>;
type RendererInput=Parameters<PdfRenderer['render']>[0];
/** Trusted private host dependency. Ordinary application inputs cannot select it.
 * The default below verifies artifacts and runs the packaged worker in bubblewrap. */
export interface PdfRendererHost {
  render(input:RendererInput,runtime:PdfRuntimeConfig):Promise<PdfRenderedDocument>;
}
function denied():never{throw new Error('PDF_RENDERER_UNAVAILABLE');}
const sha=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
const Box=z.tuple([z.number().finite(),z.number().finite(),z.number().finite(),z.number().finite()])
  .refine(b=>b.every(v=>Math.abs(v)<=14400)&&b[0]<b[2]&&b[1]<b[3]
    &&b[2]-b[0]<=14400&&b[3]-b[1]<=14400);
const Identity=z.strictObject({id:z.literal('poppler-pdf-v1'),version:Token,artifactSha256:Sha,policyVersion:Token});
const Page=z.strictObject({pageIndex:z.number().int().min(0).max(3),
  bytes:z.instanceof(Uint8Array),format:z.literal('png'),rasterSha256:Sha,
  mediaBox:Box,cropBox:Box,rotation:z.literal(0),userUnit:z.literal(1)});
const Document=z.strictObject({originalSha256:Sha,renderer:Identity,
  pageCount:z.number().int().min(1).max(4),pages:z.array(Page).min(1).max(4)});

export function pdfRuntimeIdentity(raw:PdfRuntimeConfig):PdfRendererIdentity {
  try{
    const r=Runtime.parse(raw);
    return {id:'poppler-pdf-v1',
      version:r.popplerVersion+'.pypdf-'+r.pypdfVersion+'.python-'+r.pythonVersion,
      artifactSha256:sha(JSON.stringify(r)),policyVersion:r.policyVersion};
  }catch{denied();}
}
function checkOriginal(bytes:Uint8Array,expected:string){
  if(!(bytes instanceof Uint8Array)||!bytes.byteLength||bytes.byteLength>PDF_RENDER_LIMITS.originalBytes
    ||!Sha.safeParse(expected).success||sha(bytes)!==expected
    ||!/^%PDF-(?:1\.[0-7]|2\.0)(?:\r|\n)/.test(Buffer.from(bytes).subarray(0,10).toString('ascii')))denied();
}
/** Checks byte binding and bounded full-page geometry. The source extractor still
 * performs a complete trusted PNG decode before OCR. This is not a visual review. */
export function validateRenderedPdf(raw:unknown,original:Uint8Array,expected:PdfRendererIdentity):PdfRenderedDocument {
  try{
    checkOriginal(original,sha(original));
    const d=Document.parse(raw);
    if(d.originalSha256!==sha(original)||JSON.stringify(d.renderer)!==JSON.stringify(Identity.parse(expected))
      ||d.pages.length!==d.pageCount)denied();
    let total=original.byteLength;
    const pages=d.pages.map((p,index)=>{
      const bytes=Buffer.from(p.bytes);
      if(p.pageIndex!==index||bytes.length<33||bytes.length>PDF_RENDER_LIMITS.pageBytes
        ||sha(bytes)!==p.rasterSha256||!p.mediaBox.every((v,i)=>v===p.cropBox[i])
        ||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'
        ||bytes.readUInt32BE(8)!==13||bytes.subarray(12,16).toString('ascii')!=='IHDR')denied();
      const w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20);
      if(w<1||h<1||w>2240||h>2240||w*h>4_000_000)denied();
      const pw=p.mediaBox[2]-p.mediaBox[0],ph=p.mediaBox[3]-p.mediaBox[1];
      if(Math.abs(w-h*pw/ph)>1.01||Math.abs(h-w*ph/pw)>1.01)denied();
      total+=bytes.byteLength;if(total>PDF_RENDER_LIMITS.totalBytes)denied();
      return {...p,bytes};
    });
    return {...d,pages};
  }catch{denied();}
}
export function buildPdfSandboxCommand(raw:PdfRuntimeConfig,stage:string){
  try{
    const r=Runtime.parse(raw);
    if(!/^\/tmp\/hufs-pdf-[A-Za-z0-9_-]+$/.test(stage))denied();
    return {file:r.bwrap.path,args:[
      '--die-with-parent','--new-session','--unshare-all','--clearenv','--cap-drop','ALL',
      '--ro-bind',r.runtimeRoot,'/',
      '--proc','/proc','--dev','/dev','--tmpfs','/tmp',
      '--bind',stage,'/work',
      '--ro-bind',r.worker.path,'/worker.py','--chdir','/work',
      '--setenv','LANG','C','--setenv','LC_ALL','C','--setenv','HOME','/nonexistent',
      r.python.path.slice(r.runtimeRoot.length),'-I','-S','-B','/worker.py',
      '--input','/work/input.pdf','--output','/work',
      '--pdftoppm',r.pdftoppm.path.slice(r.runtimeRoot.length),
      '--pypdf-root',posix.dirname(r.pypdfDirectory.slice(r.runtimeRoot.length)),
      '--python-version',r.pythonVersion,'--pypdf-version',r.pypdfVersion,
      '--poppler-version',r.popplerVersion,
    ]};
  }catch{denied();}
}
async function trustedPath(path:string,directory=false){
  SafePath.parse(path);
  const segments=path.split('/').filter(Boolean);let current='';
  for(let i=0;i<segments.length;i++){
    current+='/'+segments[i];const st=await lstat(current);
    if(st.isSymbolicLink()||st.uid!==0||(st.mode&0o022)!==0
      ||(i<segments.length-1||directory?!st.isDirectory():!st.isFile())
      ||(i===segments.length-1&&!directory&&st.nlink!==1))denied();
  }
}
async function readBounded(path:string,cap:number,privateFile=false):Promise<Buffer>{
  const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const before=await file.stat();
    if(!before.isFile()||before.nlink!==1||before.size<0||before.size>cap
      ||(privateFile&&(before.mode&0o077)!==0))denied();
    const buffer=Buffer.alloc(Math.min(cap+1,before.size+1));
    const {bytesRead}=await file.read(buffer,0,buffer.length,0);
    const after=await file.stat();
    if(bytesRead!==before.size||after.size!==before.size||after.ino!==before.ino||after.dev!==before.dev)denied();
    return buffer.subarray(0,bytesRead);
  }finally{await file.close();}
}
/** Hash all package files, including bytecode if present; no symlink or hardlink
 * is followed. Python -I -S and a fixed pycache prefix exclude other site packages. */
export async function verifyPdfRuntime(raw:PdfRuntimeConfig,signal?:AbortSignal):Promise<PdfRuntimeConfig>{
  try{
    if(process.platform!=='linux'||signal?.aborted)denied();const r=Runtime.parse(raw);
    await trustedPath(r.runtimeRoot,true);
    for(const [i,artifact] of [r.bwrap,r.python,r.pdftoppm,r.worker].entries()){
      await trustedPath(artifact.path);
      const bytes=await readBounded(artifact.path,64*1024*1024),st=await lstat(artifact.path);
      if(!bytes.length||sha(bytes)!==artifact.sha256||(st.mode&0o6000)!==0
        ||(i<3&&(bytes.subarray(0,4).toString('hex')!=='7f454c46'||(st.mode&0o111)===0)))denied();
    }
    // A read-only root filesystem binds shared libraries, fonts, CMaps, Python
    // stdlib and config. Host /usr, /lib and fonts are deliberately not mounted.
    // A hash of an executable wrapper is never accepted as native engine proof.
    const rootEntries:Array<unknown[]>=[],links:Array<[string,string]>=[];
    const knownPaths=new Set<string>(['']);let rootCount=0,rootBytes=0;
    async function runtimeTree(path:string,relative:string,depth:number):Promise<void>{
      if(depth>32)denied();
      for(const name of (await readdir(path)).sort()){
        if(!/^[A-Za-z0-9_.+-]+$/.test(name)||++rootCount>20000)denied();
        if(signal?.aborted)denied();
        const child=path+'/'+name,rel=relative+name,st=await lstat(child);knownPaths.add(rel);
        if(st.uid!==0)denied();
        if(st.isSymbolicLink()){
          const target=await readlink(child);if(!target||target.length>4096||target.includes(String.fromCharCode(0)))denied();
          const stack=target.startsWith('/')?[]:relative.split('/').filter(Boolean);
          for(const component of target.split('/')){
            if(!component||component==='.')continue;
            if(component==='..'){if(!stack.length)denied();stack.pop();}
            else stack.push(component);
          }
          links.push([rel,stack.join('/')]);rootEntries.push(['L',rel,target]);continue;
        }
        if((st.mode&0o022)!==0||(st.mode&0o6000)!==0)denied();
        if(st.isDirectory()){
          rootEntries.push(['D',rel,st.mode&0o777]);await runtimeTree(child,rel+'/',depth+1);
        }else{
          if(!st.isFile()||st.nlink!==1)denied();
          const bytes=await readBounded(child,128*1024*1024);
          rootBytes+=bytes.length;if(rootBytes>512*1024*1024)denied();
          rootEntries.push(['F',rel,st.mode&0o777,bytes.length,sha(bytes)]);
        }
      }
    }
    await runtimeTree(r.runtimeRoot,'',0);
    const linkTargets=new Map(links);
    for(const [_link,target] of links){
      let current=target;const visited=new Set<string>();
      for(let attempt=0;;attempt++){
        if(attempt>32||visited.has(current))denied();visited.add(current);
        const parts=current.split('/').filter(Boolean);let replaced=false;
        for(let length=1;length<=parts.length;length++){
          const prefix=parts.slice(0,length).join('/'),next=linkTargets.get(prefix);
          if(next!==undefined){current=[next,...parts.slice(length)].filter(Boolean).join('/');replaced=true;break;}
        }
        if(!replaced){if(!knownPaths.has(current))denied();break;}
      }
    }
    if(signal?.aborted||sha(JSON.stringify(rootEntries))!==r.runtimeTreeSha256)denied();
    for(const mount of ['proc','dev','tmp','work']){
      const st=await lstat(r.runtimeRoot+'/'+mount);if(!st.isDirectory()||st.isSymbolicLink())denied();
    }
    const workerMount=await lstat(r.runtimeRoot+'/worker.py');
    if(!workerMount.isFile()||workerMount.isSymbolicLink())denied();
    await trustedPath(r.pypdfDirectory,true);
    let files=0,total=0;const entries:Array<[string,string]>=[];
    async function walk(path:string,relative:string,depth:number):Promise<void>{
      if(depth>8)denied();
      for(const name of (await readdir(path)).sort()){
        if(!/^[A-Za-z0-9_.-]+$/.test(name))denied();
        const child=path+'/'+name,rel=relative+name,st=await lstat(child);
        if(st.isSymbolicLink()||st.uid!==0||(st.mode&0o022)!==0)denied();
        if(st.isDirectory())await walk(child,rel+'/',depth+1);
        else{
          if(!st.isFile()||st.nlink!==1||++files>512)denied();
          const bytes=await readBounded(child,4*1024*1024);
          total+=bytes.byteLength;if(total>16*1024*1024)denied();
          entries.push([rel,sha(bytes)]);
        }
      }
    }
    await walk(r.pypdfDirectory,'',0);
    if(!entries.some(([name])=>name==='__init__.py')
      ||sha(JSON.stringify(entries))!==r.pypdfTreeSha256)denied();
    return r;
  }catch{denied();}
}
function execute(command:{file:string;args:string[]},signal:AbortSignal):Promise<Buffer>{
  if(signal.aborted)denied();
  return new Promise((resolve,reject)=>{
    let finished=false,refused=false,size=0,errors=0;const chunks:Buffer[]=[];
    const child=spawn(command.file,command.args,{shell:false,detached:true,cwd:'/tmp',
      env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C'},stdio:['ignore','pipe','pipe']});
    const kill=()=>{refused=true;try{if(child.pid)process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}};
    const done=(ok:boolean)=>{
      if(finished)return;finished=true;signal.removeEventListener('abort',kill);
      if(ok&&!refused&&!signal.aborted)resolve(Buffer.concat(chunks));
      else reject(new Error('PDF_RENDERER_UNAVAILABLE'));
    };
    signal.addEventListener('abort',kill,{once:true});if(signal.aborted)kill();
    child.stdout.on('data',(part:Buffer)=>{size+=part.length;if(size>65536)kill();else chunks.push(Buffer.from(part));});
    child.stderr.on('data',(part:Buffer)=>{errors+=part.length;if(errors>16384)kill();});
    child.once('error',()=>{kill();done(false);});
    child.once('close',code=>done(code===0));
  });
}
const ManifestPage=z.strictObject({pageIndex:z.number().int().min(0).max(3),file:z.string(),
  rasterSha256:Sha,byteLength:z.number().int().positive().max(PDF_RENDER_LIMITS.pageBytes),
  mediaBox:Box,cropBox:Box,rotation:z.literal(0),userUnit:z.literal(1)});
const Manifest=z.strictObject({version:z.literal('pdf-worker-v1'),originalSha256:Sha,
  pythonVersion:Version,pypdfVersion:Version,popplerVersion:Version,
  pageCount:z.number().int().min(1).max(4),pages:z.array(ManifestPage).min(1).max(4)});
const nativeHost:PdfRendererHost={async render(input,runtime){
  const r=await verifyPdfRuntime(runtime,input.signal);
  if(input.signal.aborted)denied();
  await input.revalidate();if(input.signal.aborted)denied();
  const stage=await mkdtemp('/tmp/hufs-pdf-');
  try{
    await writeFile(stage+'/input.pdf',Buffer.from(input.bytes),{flag:'wx',mode:0o400});
    await input.revalidate();if(input.signal.aborted)denied();
    const stdout=await execute(buildPdfSandboxCommand(r,stage),input.signal);
    if(input.signal.aborted)denied();
    const manifest=Manifest.parse(JSON.parse(stdout.toString('utf8')));
    if(manifest.originalSha256!==input.originalSha256||manifest.pythonVersion!==r.pythonVersion
      ||manifest.pypdfVersion!==r.pypdfVersion||manifest.popplerVersion!==r.popplerVersion
      ||manifest.pages.length!==manifest.pageCount)denied();
    const names=(await readdir(stage)).sort();
    const expected=['input.pdf',...manifest.pages.map((_p,i)=>'page-'+i+'.png')].sort();
    if(JSON.stringify(names)!==JSON.stringify(expected)
      ||sha(await readBounded(stage+'/input.pdf',PDF_RENDER_LIMITS.originalBytes,true))!==input.originalSha256)denied();
    const pages:PdfRenderedPage[]=[];
    for(const [i,p] of manifest.pages.entries()){
      if(p.pageIndex!==i||p.file!=='page-'+i+'.png')denied();
      const bytes=await readBounded(stage+'/page-'+i+'.png',PDF_RENDER_LIMITS.pageBytes,true);
      if(bytes.byteLength!==p.byteLength||sha(bytes)!==p.rasterSha256)denied();
      pages.push({pageIndex:i,bytes,format:'png',rasterSha256:p.rasterSha256,
        mediaBox:p.mediaBox,cropBox:p.cropBox,rotation:0,userUnit:1});
    }
    await input.revalidate();if(input.signal.aborted)denied();
    return {originalSha256:manifest.originalSha256,renderer:pdfRuntimeIdentity(r),pageCount:manifest.pageCount,pages};
  }finally{await rm(stage,{recursive:true,force:true});}
}};

/** Actual native renderer is opt-in and never installs tools or weakens host
 * isolation. Missing namespace support, pins, worker or permissions means refusal. */
export function createPopplerPdfRenderer(options:{
  enabled?:boolean;runtime:PdfRuntimeConfig;host?:PdfRendererHost;
}):PdfRenderer{
  const enabled=options.enabled===true,raw=structuredClone(options.runtime);
  const host=options.host??nativeHost,run=host.render.bind(host);
  return {async render(input){
    try{
      if(!enabled||typeof input.revalidate!=='function'||input.signal.aborted)denied();
      const runtime=Runtime.parse(raw),identity=pdfRuntimeIdentity(runtime);
      const bytes=Buffer.from(input.bytes);checkOriginal(bytes,input.originalSha256);
      const signal=AbortSignal.any([input.signal,AbortSignal.timeout(PDF_RENDER_LIMITS.timeoutMs)]);
      async function bounded<T>(operation:()=>Promise<T>):Promise<T>{
        if(signal.aborted)denied();let abort!:()=>void;
        const stopped=new Promise<never>((_r,reject)=>{
          abort=()=>reject(new Error('PDF_RENDERER_UNAVAILABLE'));signal.addEventListener('abort',abort,{once:true});
        });
        try{
          const result=await Promise.race([Promise.resolve().then(()=>{if(signal.aborted)denied();return operation();}),stopped]);
          if(signal.aborted)denied();return result;
        }finally{signal.removeEventListener('abort',abort);}
      }
      const revalidate=()=>bounded(input.revalidate);
      await revalidate();
      const candidate=await bounded(()=>run({bytes:Buffer.from(bytes),originalSha256:input.originalSha256,signal,revalidate},runtime));
      const result=validateRenderedPdf(candidate,bytes,identity);
      await revalidate();return result;
    }catch{denied();}
  }};
}
