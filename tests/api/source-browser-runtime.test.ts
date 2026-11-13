import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const memory=vi.hoisted(()=>({nodes:new Map<string,{bytes:Buffer;dir:boolean;uid:number;mode:number;nlink:number;target?:string}>()}));
vi.mock('node:fs/promises',()=>{
  const record=(p:unknown)=>{const r=memory.nodes.get(String(p));if(!r)throw Error('PRIVATE-PATH');return r;};
  const stat=(p:unknown)=>{const r=record(p);return {uid:r.uid,mode:r.mode,nlink:r.nlink,size:r.bytes.length,ino:1,dev:1,
    isFile:()=>!r.dir&&r.target===undefined,isDirectory:()=>r.dir,isSymbolicLink:()=>r.target!==undefined};};
  return {lstat:async(p:unknown)=>stat(p),readdir:async(p:unknown)=>[...memory.nodes.keys()]
    .filter(k=>k.startsWith(String(p)+'/')).map(k=>k.slice(String(p).length+1)).filter(k=>!k.includes('/')),
    readlink:async(p:unknown)=>record(p).target,
    open:async(p:unknown)=>({stat:async()=>stat(p),close:async()=>{},
      read:async(b:Buffer,o:number,n:number,pos:number)=>{const bytes=record(p).bytes.subarray(pos,pos+n);bytes.copy(b,o);return {bytesRead:bytes.length};}}),
  };
});
import {verifySourceBrowserRuntime,buildSourceBrowserLaunchOptions} from '../../apps/api/src/modules/opportunities/source-browser-runtime.js';
const root='/opt/hufs-one-source-browser/rootfs',wrapper='/usr/local/libexec/hufs-one-source-browser';
const hash=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
const platform=Object.getOwnPropertyDescriptor(process,'platform')!,uid=Object.getOwnPropertyDescriptor(process,'getuid');
const elf=Buffer.from('\x7fELFSYNTHETIC');
const paths=['dev','proc','tmp','usr','usr/lib','usr/lib/chromium','usr/lib/chromium/chromium'];
function config(extra:unknown[][]=[]){return {wrapperSha256:hash('SYNTHETIC-WRAPPER'),bwrapSha256:hash(elf),
  rootfsSha256:hash(JSON.stringify([...paths.map(p=>p.endsWith('/chromium')&&p.includes('/lib/chromium/')
    ?['F',p,0o755,elf.length,hash(elf)]:['D',p,0o755]),...extra].sort((a,b)=>String(a[1])<String(b[1])?-1:1))),
  chromiumVersion:'130.0.1.2',policyVersion:'SYN-BROWSER-1'};}
beforeEach(()=>{
  Object.defineProperty(process,'platform',{value:'linux',configurable:true});
  Object.defineProperty(process,'getuid',{value:()=>1000,configurable:true});
  memory.nodes.clear();
  for(const p of ['/','/usr','/usr/bin','/usr/local','/usr/local/libexec','/opt','/opt/hufs-one-source-browser',root])
    memory.nodes.set(p,{bytes:Buffer.alloc(0),dir:true,uid:0,mode:0o755,nlink:1});
  for(const p of paths)memory.nodes.set(root+'/'+p,{bytes:p==='usr/lib/chromium/chromium'?elf:Buffer.alloc(0),
    dir:p!=='usr/lib/chromium/chromium',uid:0,mode:0o755,nlink:1});
  memory.nodes.set(wrapper,{bytes:Buffer.from('SYNTHETIC-WRAPPER'),dir:false,uid:0,mode:0o755,nlink:1});
  memory.nodes.set('/usr/bin/bwrap',{bytes:elf,dir:false,uid:0,mode:0o755,nlink:1});
});
afterEach(()=>{Object.defineProperty(process,'platform',platform);
  if(uid)Object.defineProperty(process,'getuid',uid);else delete (process as {getuid?:unknown}).getuid;});
describe('#445 isolated browser runtime before any HTML execution',()=>{
  it('verifies root-owned wrapper, native bubblewrap and entire immutable rootfs',async()=>{
    await expect(verifySourceBrowserRuntime(config())).resolves.toEqual(config());
  });
  it('rejects runtime drift, writable files, wrong owners and native wrappers',async()=>{
    for(const change of [()=>{memory.nodes.get(wrapper)!.bytes=Buffer.from('changed');},
      ()=>{memory.nodes.get(root+'/usr/lib/chromium/chromium')!.mode=0o777;},
      ()=>{memory.nodes.get(root+'/tmp')!.uid=1000;},
      ()=>{memory.nodes.get('/usr/bin/bwrap')!.bytes=Buffer.from('not ELF');}]){
      const snapshot=[...memory.nodes].map(([p,r])=>[p,{...r}] as const);change();
      await expect(verifySourceBrowserRuntime(config())).rejects.toThrow('SOURCE_BROWSER_UNAVAILABLE');
      memory.nodes=new Map(snapshot);
    }
  });
  it('rejects a root or non-Linux browser worker',async()=>{
    Object.defineProperty(process,'getuid',{value:()=>0,configurable:true});
    await expect(verifySourceBrowserRuntime(config())).rejects.toThrow('SOURCE_BROWSER_UNAVAILABLE');
    Object.defineProperty(process,'platform',{value:'win32',configurable:true});
    await expect(verifySourceBrowserRuntime(config())).rejects.toThrow('SOURCE_BROWSER_UNAVAILABLE');
  });
  it('resolves reviewed links inside the rootfs and rejects escape, dangling links and cycles',async()=>{
    const rel='usr/lib/alias.so',node={bytes:Buffer.alloc(0),dir:false,uid:0,mode:0o777,nlink:1,target:'chromium/chromium'};
    memory.nodes.set(root+'/'+rel,node);
    await expect(verifySourceBrowserRuntime(config([['L',rel,node.target]]))).resolves.toBeDefined();
    for(const target of ['../../../etc/passwd','/etc/passwd','alias.so']){
      node.target=target;
      await expect(verifySourceBrowserRuntime(config([['L',rel,target]]))).rejects.toThrow('SOURCE_BROWSER_UNAVAILABLE');
    }
  });
  it('resolves an intermediate symlink before subsequent parent traversal',async()=>{
    const link={bytes:Buffer.alloc(0),dir:false,uid:0,mode:0o777,nlink:1};
    memory.nodes.set(root+'/usr/lib/jump',{...link,target:'/'});
    memory.nodes.set(root+'/usr/lib/alias.so',{...link,target:'jump/../chromium/chromium'});
    await expect(verifySourceBrowserRuntime(config([
      ['L','usr/lib/jump','/'],['L','usr/lib/alias.so','jump/../chromium/chromium'],
    ]))).rejects.toThrow('SOURCE_BROWSER_UNAVAILABLE');
  });
  it('requires the fixed Chromium target to be an executable native file, never a directory',async()=>{
    memory.nodes.get(root+'/usr/lib/chromium/chromium')!.dir=true;
    const rows=paths.map(p=>['D',p,0o755]);
    await expect(verifySourceBrowserRuntime({...config(),rootfsSha256:hash(JSON.stringify(rows))}))
      .rejects.toThrow('SOURCE_BROWSER_UNAVAILABLE');
  });
  it('executes wrapper validation against alternate Chromium switch spellings without launching anything',()=>{
    const script=readFileSync(new URL('../../infra/ncp/launch-source-browser.sh',import.meta.url),'utf8');
    const validation=script.match(/for arg in "\$@"; do[\s\S]*?\ndone/)![0]+'\nprintf ARGS_OK';
    const shell=platform.value==='win32'?'C:\\Program Files\\Git\\bin\\bash.exe':'/bin/sh';
    for(const arg of ['--no-sandbox=1','-no-sandbox','-disable-web-security=1','--disable-setuid-sandbox=x',
      '--allow-file-access-from-files=1','--proxy-server=https://private.invalid','--remote-debugging-port=9222']){
      const result=spawnSync(shell,['-c',validation,'validation',arg],{encoding:'utf8',timeout:5000});
      expect(result.error).toBeUndefined();expect(result.status).toBe(1);expect(result.stdout).not.toContain('ARGS_OK');
    }
  });
  it('builds only the fixed headless namespace wrapper, with Chromium sandbox enabled',()=>{
    const options=buildSourceBrowserLaunchOptions(config());
    expect(options.executablePath).toBe(wrapper);expect(options.chromiumSandbox).toBe(true);
    expect(options.headless).toBe(true);expect(JSON.stringify(options)).not.toContain('--no-sandbox');
    expect(options.env).toEqual({HOME:'/tmp',LANG:'C',LC_ALL:'C'});
  });
  it('separates network/rootfs and never forwards host root, proxy or sandbox-disable options',()=>{
    const script=readFileSync(new URL('../../infra/ncp/launch-source-browser.sh',import.meta.url),'utf8');
    expect(script).toContain('--unshare-all --clearenv');
    expect(script).toContain('--ro-bind /opt/hufs-one-source-browser/rootfs /');
    expect(script).toContain('--proc /proc --dev /dev --tmpfs /tmp');
    expect(script).toContain('/usr/lib/chromium/chromium "$@"');
    expect(script).toContain('*sandbox*|disable-web-security|allow-file-access-from-files');
    expect(script).not.toMatch(/--(?:ro-)?bind\s+\/\s+\/|--share-net|--preserve-fds/);
  });
});
