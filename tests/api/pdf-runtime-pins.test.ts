import {beforeEach,describe,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
const memory=vi.hoisted(()=>({
  nodes:new Map<string,{kind:'file'|'dir'|'link';bytes:Buffer;mode:number;uid:number;nlink:number;target?:string}>(),
  opened:[] as string[],
}));
vi.mock('node:fs/promises',()=>{
  const record=(path:unknown)=>{const r=memory.nodes.get(String(path));if(!r)throw Error('missing synthetic path');return r;};
  const stat=(path:unknown)=>{const r=record(path);return {uid:r.uid,mode:r.mode,nlink:r.nlink,size:r.bytes.length,ino:1,dev:1,
    isFile:()=>r.kind==='file',isDirectory:()=>r.kind==='dir',isSymbolicLink:()=>r.kind==='link'};};
  return {
    lstat:async(path:unknown)=>stat(path),
    readlink:async(path:unknown)=>record(path).target,
    readdir:async(path:unknown)=>[...memory.nodes.keys()].filter(k=>k.startsWith(String(path)+'/'))
      .map(k=>k.slice(String(path).length+1)).filter(k=>!k.includes('/')),
    open:async(path:unknown)=>{memory.opened.push(String(path));return {
      stat:async()=>stat(path),close:async()=>{},
      read:async(buffer:Buffer,offset:number,length:number,position:number)=>{
        const bytes=record(path).bytes.subarray(position,position+length);bytes.copy(buffer,offset);return {bytesRead:bytes.length,buffer};
      },
    };},
    mkdtemp:async()=>{throw Error('must not execute');},rm:async()=>{},writeFile:async()=>{throw Error('must not execute');},
  };
});
import {verifyPdfRuntime,type PdfRuntimeConfig} from '../../packages/ai/src/pdf-renderer.js';
const sha=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
const elf=(name:string)=>Buffer.from('\x7fELFSYNTHETIC-'+name);
const root='/opt/hufs-pdf';
const entries:Array<[string,'dir'|'file',number,Buffer]>=[
  ['bin','dir',0o755,Buffer.alloc(0)],
  ['bin/pdftoppm','file',0o755,elf('poppler')],
  ['bin/python3','file',0o755,elf('python')],
  ['dev','dir',0o755,Buffer.alloc(0)],
  ['fonts','dir',0o755,Buffer.alloc(0)],
  ['fonts/sample.ttf','file',0o444,Buffer.from('SYNTHETIC-FONT')],
  ['lib','dir',0o755,Buffer.alloc(0)],
  ['lib/libpoppler.so','file',0o644,elf('shared-poppler')],
  ['proc','dir',0o755,Buffer.alloc(0)],
  ['pypdf','dir',0o755,Buffer.alloc(0)],
  ['pypdf/__init__.py','file',0o644,Buffer.from('SYNTHETIC-PACKAGE')],
  ['tmp','dir',0o755,Buffer.alloc(0)],
  ['work','dir',0o755,Buffer.alloc(0)],
  ['worker.py','file',0o444,Buffer.from('SYNTHETIC-MOUNTPOINT')],
];
function golden(extra:unknown[][]=[]){
  const rows:unknown[][]=entries.map(([name,kind,mode,bytes])=>kind==='dir'
    ?['D',name,mode]:['F',name,mode,bytes.length,sha(bytes)]);
  rows.push(...extra);rows.sort((a,b)=>String(a[1])<String(b[1])?-1:1);
  return sha(JSON.stringify(rows));
}
function configuration():PdfRuntimeConfig{
  return {runtimeRoot:root,bwrap:{path:'/usr/bin/bwrap',sha256:sha(elf('bwrap'))},
    python:{path:root+'/bin/python3',sha256:sha(elf('python'))},
    pdftoppm:{path:root+'/bin/pdftoppm',sha256:sha(elf('poppler'))},
    worker:{path:'/app/infra/ai/pdf-render-worker.py',sha256:sha('SYNTHETIC-WORKER')},
    pypdfDirectory:root+'/pypdf',pypdfTreeSha256:sha(JSON.stringify([['__init__.py',sha('SYNTHETIC-PACKAGE')]])),
    runtimeTreeSha256:golden(),pythonVersion:'3.12.14',pypdfVersion:'6.10.0',
    popplerVersion:'26.05.0',policyVersion:'SYN-PDF-POLICY-1'};
}
beforeEach(()=>{
  memory.nodes.clear();memory.opened.length=0;
  for(const path of ['/opt',root,'/usr','/usr/bin','/app','/app/infra','/app/infra/ai'])
    memory.nodes.set(path,{kind:'dir',bytes:Buffer.alloc(0),mode:0o755,uid:0,nlink:1});
  for(const [path,kind,mode,bytes] of entries)
    memory.nodes.set(root+'/'+path,{kind,bytes:Buffer.from(bytes),mode,uid:0,nlink:1});
  memory.nodes.set('/usr/bin/bwrap',{kind:'file',bytes:elf('bwrap'),mode:0o755,uid:0,nlink:1});
  memory.nodes.set('/app/infra/ai/pdf-render-worker.py',{kind:'file',bytes:Buffer.from('SYNTHETIC-WORKER'),mode:0o444,uid:0,nlink:1});
});
describe('private runtime artifact proof',()=>{
  it('verifies a bounded read-only rootfs with all native, package, shared library and font bytes',async()=>{
    await expect(verifyPdfRuntime(configuration())).resolves.toEqual(configuration());
    expect(memory.opened).toContain(root+'/lib/libpoppler.so');expect(memory.opened).toContain(root+'/fonts/sample.ttf');
  });
  it.each(['fonts/sample.ttf','lib/libpoppler.so','pypdf/__init__.py'])('refuses changed %s behind an unchanged executable',async path=>{
    memory.nodes.get(root+'/'+path)!.bytes=Buffer.from('CHANGED-SYNTHETIC-ARTIFACT');
    await expect(verifyPdfRuntime(configuration())).rejects.toThrow('PDF_RENDERER_UNAVAILABLE');
  });
  it('refuses a shell wrapper even when its new hash has been supplied',async()=>{
    const config=configuration(),script=Buffer.from('#!/bin/sh\nexec other-binary');
    memory.nodes.get(config.pdftoppm.path)!.bytes=script;config.pdftoppm.sha256=sha(script);
    await expect(verifyPdfRuntime(config)).rejects.toThrow();
  });
  it.each(['foreign owner','writable ancestor','hardlink','setuid binary','absent mountpoint'])('refuses %s',async variant=>{
    const config=configuration();
    if(variant==='foreign owner')memory.nodes.get(config.worker.path)!.uid=1000;
    if(variant==='writable ancestor')memory.nodes.get('/app/infra')!.mode=0o777;
    if(variant==='hardlink')memory.nodes.get(root+'/lib/libpoppler.so')!.nlink=2;
    if(variant==='setuid binary')memory.nodes.get(config.bwrap.path)!.mode=0o4755;
    if(variant==='absent mountpoint')memory.nodes.delete(root+'/work');
    await expect(verifyPdfRuntime(config)).rejects.toThrow();
  });
  it('accepts a reviewed internal shared-library symlink without reading a host target',async()=>{
    const config=configuration();
    memory.nodes.set(root+'/lib/alias.so',{kind:'link',bytes:Buffer.alloc(0),mode:0o777,uid:0,nlink:1,target:'libpoppler.so'});
    config.runtimeTreeSha256=golden([['L','lib/alias.so','libpoppler.so']]);
    await expect(verifyPdfRuntime(config)).resolves.toEqual(config);
  });
  it('rejects a symlink outside the reviewed tree even if the host target exists',async()=>{
    const config=configuration();
    memory.nodes.set('/etc/passwd',{kind:'file',bytes:Buffer.from('SYNTHETIC-HOST-SENTINEL'),mode:0o644,uid:0,nlink:1});
    memory.nodes.set(root+'/lib/alias.so',{kind:'link',bytes:Buffer.alloc(0),mode:0o777,uid:0,nlink:1,target:'/etc/passwd'});
    config.runtimeTreeSha256=golden([['L','lib/alias.so','/etc/passwd']]);
    await expect(verifyPdfRuntime(config)).rejects.toThrow();
    expect(memory.opened).not.toContain('/etc/passwd');
  });
  it('refuses cyclic links and honours cancellation while traversing the runtime',async()=>{
    const config=configuration();
    memory.nodes.set(root+'/lib/alias.so',{kind:'link',bytes:Buffer.alloc(0),mode:0o777,uid:0,nlink:1,target:'alias.so'});
    config.runtimeTreeSha256=golden([['L','lib/alias.so','alias.so']]);
    await expect(verifyPdfRuntime(config)).rejects.toThrow();
    const control=new AbortController();control.abort();
    await expect(verifyPdfRuntime(configuration(),control.signal)).rejects.toThrow();
  });
});
