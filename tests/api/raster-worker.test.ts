import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,readFile,writeFile,copyFile,rm,realpath,lstat,stat} from 'node:fs/promises';
import {join,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import ts from 'typescript';
import {PNG} from 'pngjs';
import jpeg from 'jpeg-js';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {createRasterWorkerDecoder,RasterWorkerError} from '../../packages/ai/src/raster-worker.js';

const root=fileURLToPath(new URL('../..',import.meta.url)),local=join(root,'local_only');
let fixture:string,entry:URL;
const pause=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
function png(){const p=new PNG({width:24,height:16});p.data.fill(127);return PNG.sync.write(p);}
function binding(bytes:Uint8Array){return {sourceRevisionId:'SYN-REV',assetId:'SYN-ASSET',originalSha256:createHash('sha256').update(bytes).digest('hex')};}
async function helper(name:string,code:string){const path=join(fixture,name+'.mjs');await writeFile(path,code);return createRasterWorkerDecoder({entrypoint:pathToFileURL(path)});}
beforeAll(async()=>{
  await mkdir(local,{recursive:true});fixture=await mkdtemp(join(local,'raster-worker-test-'));
  await writeFile(join(fixture,'package.json'),'{"type":"module"}');
  await mkdir(join(fixture,'dist/packages/ai/src'),{recursive:true});await mkdir(join(fixture,'infra/ai'),{recursive:true});
  const code=await readFile(join(root,'packages/ai/src/raster.ts'),'utf8');
  await writeFile(join(fixture,'dist/packages/ai/src/raster.js'),ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText);
  const wrapper=await readFile(join(root,'packages/ai/src/raster-worker.ts'),'utf8');
  await writeFile(join(fixture,'dist/packages/ai/src/raster-worker.js'),ts.transpileModule(wrapper,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText);
  await copyFile(join(root,'infra/ai/raster-worker.mjs'),join(fixture,'infra/ai/raster-worker.mjs'));
  entry=pathToFileURL(join(fixture,'infra/ai/raster-worker.mjs'));
});
afterAll(async()=>{
  if(!fixture)return;
  // Fresh owned synthetic directory only; every decoder settles after termination.
  const base=await realpath(local),target=await realpath(fixture);
  if(!target.startsWith(base+sep)||!(await lstat(fixture)).isDirectory()||(await lstat(fixture)).isSymbolicLink())throw Error('Unsafe synthetic fixture cleanup');
  await rm(target,{recursive:true});
});

describe('killable synthetic raster workers',()=>{
  it('resolves the default helper from the compiled dist module layout',async()=>{
    const module=await import(/* @vite-ignore */pathToFileURL(join(fixture,'dist/packages/ai/src/raster-worker.js')).href),bytes=png();
    expect(await module.decodeRasterInWorker(bytes,binding(bytes),{timeoutMs:10000})).toMatchObject({width:24,height:16,format:'png'});
  });
  it.each(['png','jpeg'] as const)('fully decodes %s in an isolated real worker',async format=>{
    const bytes=format==='png'?png():jpeg.encode({width:24,height:16,data:Buffer.alloc(24*16*4,127)},75).data;
    const result=await createRasterWorkerDecoder({entrypoint:entry})(bytes,binding(bytes),{timeoutMs:10000});
    expect(result).toMatchObject({...binding(bytes),format,width:24,height:16,transformVersion:'raster-identity-v1'});
    expect(result.bytes).toEqual(bytes);expect(result.bytes).not.toBe(bytes);
  });
  it('copies bytes before awaiting worker startup',async()=>{const bytes=png(),original=Buffer.from(bytes),work=createRasterWorkerDecoder({entrypoint:entry})(bytes,binding(bytes),{timeoutMs:10000});bytes.fill(0);expect((await work).bytes).toEqual(original);});
  it('rejects an aborted request before spawning',async()=>{const c=new AbortController();c.abort();const bytes=png();await expect(createRasterWorkerDecoder({entrypoint:new URL('file:///does-not-exist.mjs')})(bytes,binding(bytes),{signal:c.signal})).rejects.toThrow(RasterWorkerError);});
  it.each([0,-1,20001,NaN,Infinity])('rejects timeout %s',async timeoutMs=>{const bytes=png();await expect(createRasterWorkerDecoder({entrypoint:entry})(bytes,binding(bytes),{timeoutMs})).rejects.toThrow(RasterWorkerError);});
  it('rejects oversized input before making a copy or spawning',async()=>{const bytes=Buffer.alloc(5*1024*1024+1);await expect(createRasterWorkerDecoder({entrypoint:entry})(bytes,binding(bytes))).rejects.toThrow(RasterWorkerError);});
  it('rejects corrupt pixels and mismatched original SHA',async()=>{const bytes=png();bytes[29]=bytes[29]!^1;const decode=createRasterWorkerDecoder({entrypoint:entry});await expect(decode(bytes,binding(bytes),{timeoutMs:10000})).rejects.toThrow(RasterWorkerError);await expect(decode(png(),binding(bytes))).rejects.toThrow(RasterWorkerError);});
  it('terminates CPU-bound work on deadline while the caller event loop runs',async()=>{
    const marker=join(fixture,'timeout-alive'),decode=await helper('timeout',`import {writeFileSync} from 'node:fs';while(true){writeFileSync(${JSON.stringify(marker)},'alive');}`);
    const bytes=png();let ticked=false;setTimeout(()=>{ticked=true;},10);
    await expect(decode(bytes,binding(bytes),{timeoutMs:500})).rejects.toThrow(RasterWorkerError);expect(ticked).toBe(true);
    const before=(await stat(marker)).mtimeMs;await pause(80);expect((await stat(marker)).mtimeMs).toBe(before);
  });
  it('terminates CPU-bound work on abort',async()=>{
    const marker=join(fixture,'abort-alive'),decode=await helper('abort',`import {writeFileSync} from 'node:fs';while(true){writeFileSync(${JSON.stringify(marker)},'alive');}`),c=new AbortController(),bytes=png();
    const pending=decode(bytes,binding(bytes),{signal:c.signal,timeoutMs:10000});
    // Wait for this real worker to start before exercising cancellation.
    for(let i=0;i<100;i++){try{await stat(marker);break;}catch{await pause(10);}}
    c.abort();await expect(pending).rejects.toThrow(RasterWorkerError);
    const before=(await stat(marker)).mtimeMs;await pause(80);expect((await stat(marker)).mtimeMs).toBe(before);
  });
  it.each(['missing','badIdentity','badHash','dimensions','extra','workerError','exit'] as const)('rejects %s worker output and shuts down',async kind=>{
    const bytes=png(),meta={...binding(bytes),format:'png',width:24,height:16,transformVersion:'raster-identity-v1'};
    if(kind==='badIdentity')meta.assetId='OTHER';if(kind==='badHash')meta.originalSha256='0'.repeat(64);if(kind==='dimensions')meta.width=2241;
    const payload=kind==='missing'?{ok:true}:kind==='extra'?{ok:true,metadata:{...meta,extra:'unexpected'}}:{ok:true,metadata:meta};
    const code=kind==='workerError'?`throw Error('private worker error');`:kind==='exit'?`process.exit(0);`:`import {parentPort} from 'node:worker_threads';parentPort.postMessage(${JSON.stringify(payload)});setInterval(()=>{},1000);`;
    const decode=await helper('bad-'+kind,code);await expect(decode(bytes,binding(bytes),{timeoutMs:10000})).rejects.toThrow(RasterWorkerError);
  });
  it('starts workers with no inherited application secrets',async()=>{
    const bytes=png(),meta={...binding(bytes),format:'png',width:24,height:16,transformVersion:'raster-identity-v1'};
    const decode=await helper('environment',`import {parentPort,resourceLimits} from 'node:worker_threads';if(Object.keys(process.env).length||process.execArgv.length||resourceLimits.maxOldGenerationSizeMb>128||resourceLimits.maxYoungGenerationSizeMb>16||resourceLimits.stackSizeMb>4)throw Error('missing isolation');parentPort.postMessage({ok:true,metadata:${JSON.stringify(meta)}});`);
    expect((await decode(bytes,binding(bytes),{timeoutMs:10000})).width).toBe(24);
  });
});
