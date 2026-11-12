/** #445 optional Chromium rootfs, separate from the public API and credentials.
 * Verification never launches Chromium or grants source/collection authority. */
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,open,readdir,readlink} from 'node:fs/promises';
import {posix} from 'node:path';
import {z} from 'zod';

export const SOURCE_BROWSER_WRAPPER='/usr/local/libexec/hufs-one-source-browser';
export const SOURCE_BROWSER_ROOT='/opt/hufs-one-source-browser/rootfs';
const SHA=z.string().regex(/^[a-f0-9]{64}$/);
const Runtime=z.strictObject({wrapperSha256:SHA,bwrapSha256:SHA,rootfsSha256:SHA,
  chromiumVersion:z.string().regex(/^\d{2,3}\.\d+\.\d+\.\d+$/),
  policyVersion:z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/),
});
export {Runtime as SourceBrowserRuntimeSchema};
export type SourceBrowserRuntime=z.infer<typeof Runtime>;
function denied():never{throw new Error('SOURCE_BROWSER_UNAVAILABLE');}
const sha=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');

async function trustedPath(path:string,directory=false){
  let current='';const parts=path.split('/').filter(Boolean);
  for(let i=0;i<parts.length;i++){
    current+='/'+parts[i];const st=await lstat(current);
    if(st.uid!==0||st.isSymbolicLink()||(st.mode&0o022)!==0||(st.mode&0o6000)!==0
      ||(i<parts.length-1||directory?!st.isDirectory():!st.isFile())
      ||(i===parts.length-1&&!directory&&st.nlink!==1))denied();
  }
}
async function fileHash(path:string,cap:number,signal?:AbortSignal){
  const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const before=await file.stat();
    if(!before.isFile()||before.nlink!==1||before.size<0||before.size>cap)denied();
    const hash=createHash('sha256'),buffer=Buffer.alloc(1024*1024);
    let size=0,prefix=Buffer.alloc(0);
    for(;;){
      if(signal?.aborted)denied();
      const {bytesRead}=await file.read(buffer,0,Math.min(buffer.length,cap-size+1),size);
      if(bytesRead===0)break;
      if(size===0)prefix=Buffer.from(buffer.subarray(0,Math.min(bytesRead,4)));
      size+=bytesRead;if(size>cap)denied();hash.update(buffer.subarray(0,bytesRead));
    }
    const after=await file.stat();
    if(size!==before.size||after.size!==before.size||after.ino!==before.ino||after.dev!==before.dev)denied();
    return {hash:hash.digest('hex'),size,prefix};
  }finally{await file.close();}
}
function checkLink(target:string):void{
  if(!target||target.length>4096||target.includes('\0'))denied();
}

/** Stream all reviewed native libraries/fonts/resources, not just a launcher
 * wrapper. Symlinks resolve only inside the future isolated root, never host /. */
export async function verifySourceBrowserRuntime(raw:SourceBrowserRuntime,signal?:AbortSignal):Promise<SourceBrowserRuntime>{
  try{
    if(process.platform!=='linux'||typeof process.getuid!=='function'||process.getuid()===0||signal?.aborted)denied();
    const runtime=Runtime.parse(raw);
    await trustedPath(SOURCE_BROWSER_WRAPPER);await trustedPath('/usr/bin/bwrap');
    await trustedPath(SOURCE_BROWSER_ROOT,true);
    const wrapper=await fileHash(SOURCE_BROWSER_WRAPPER,64*1024,signal);
    const bwrap=await fileHash('/usr/bin/bwrap',16*1024*1024,signal);
    if(wrapper.size<1||wrapper.hash!==runtime.wrapperSha256||bwrap.hash!==runtime.bwrapSha256
      ||bwrap.prefix.toString('hex')!=='7f454c46'
      ||((await lstat(SOURCE_BROWSER_WRAPPER)).mode&0o111)===0
      ||((await lstat('/usr/bin/bwrap')).mode&0o111)===0)denied();
    const entries:unknown[][]=[],known=new Set(['']),directories=new Set(['']),links=new Map<string,string>();
    let count=0,total=0,chromiumVerified=false;
    async function walk(path:string,relative:string,depth:number):Promise<void>{
      if(depth>32)denied();
      for(const name of (await readdir(path)).sort()){
        if(signal?.aborted||!/^[A-Za-z0-9_.+-]+$/.test(name)||++count>30000)denied();
        const child=path+'/'+name,rel=relative+name,st=await lstat(child);known.add(rel);
        if(st.uid!==0)denied();
        if(st.isSymbolicLink()){
          const target=await readlink(child);checkLink(target);links.set(rel,target);entries.push(['L',rel,target]);continue;
        }
        if((st.mode&0o022)!==0||(st.mode&0o6000)!==0)denied();
        if(st.isDirectory()){directories.add(rel);entries.push(['D',rel,st.mode&0o777]);await walk(child,rel+'/',depth+1);}
        else{
          if(!st.isFile()||st.nlink!==1||st.size<0||st.size>512*1024*1024)denied();
          // Empty files are legitimate in a rootfs, but native launch targets are not.
          const proof=await fileHash(child,512*1024*1024,signal);
          total+=proof.size;if(total>2*1024**3)denied();
          if(rel==='usr/lib/chromium/chromium'){
            if(proof.prefix.toString('hex')!=='7f454c46'||(st.mode&0o111)===0)denied();chromiumVerified=true;
          }
          entries.push(['F',rel,st.mode&0o777,proof.size,proof.hash]);
        }
      }
    }
    await walk(SOURCE_BROWSER_ROOT,'',0);
    for(const [relative,target] of links){
      // Resolve in kernel lookup order: a symlink component must be followed
      // before interpreting a later '..'. Lexical normalization is not enough.
      const pending=target.startsWith('/')?target.split('/'):
        [...posix.dirname(relative).split('/').filter(v=>v!=='.'),...target.split('/')];
      const resolved:string[]=[];let hops=0,steps=0;
      while(pending.length){
        if(++steps>10000)denied();const part=pending.shift()!;
        if(!part||part==='.')continue;
        if(part==='..'){if(!resolved.length)denied();resolved.pop();continue;}
        resolved.push(part);const path=resolved.join('/'),replacement=links.get(path);
        if(replacement!==undefined){
          if(++hops>32)denied();resolved.pop();
          if(replacement.startsWith('/'))resolved.length=0;
          pending.unshift(...replacement.split('/'));continue;
        }
        if(!known.has(path)||(pending.length>0&&!directories.has(path)))denied();
      }
      if(!known.has(resolved.join('/')))denied();
    }
    if(!chromiumVerified
      ||sha(JSON.stringify(entries))!==runtime.rootfsSha256)denied();
    for(const mount of ['dev','proc','tmp']){
      const st=await lstat(SOURCE_BROWSER_ROOT+'/'+mount);if(!st.isDirectory()||st.isSymbolicLink())denied();
    }
    if(signal?.aborted)denied();return Object.freeze(runtime);
  }catch{denied();}
}

export function buildSourceBrowserLaunchOptions(raw:SourceBrowserRuntime){
  Runtime.parse(raw); // Shape only: call verifySourceBrowserRuntime immediately before launch.
  return {executablePath:SOURCE_BROWSER_WRAPPER,headless:true,chromiumSandbox:true,
    env:{HOME:'/tmp',LANG:'C',LC_ALL:'C'},args:['--disable-background-networking','--disable-gpu','--no-first-run','--no-default-browser-check']};
}
