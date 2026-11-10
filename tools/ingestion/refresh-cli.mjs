/**
 * #445: non-privileged, one-shot data refresh service entrypoint.
 *
 * No collection occurs until the NCP-only root-owned private operator factory
 * creates a rights-scoped source worker. This file never contains source URLs,
 * tokens, collected bytes, or any synthetic-as-real fallback.
 */
import {lstat,realpath} from 'node:fs/promises';
import {dirname,isAbsolute,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const PRIVATE_ROOT='/etc/hufs-one/private';
export function refreshFactoryPath(raw){
  if(typeof raw!=='string'||!raw.startsWith(PRIVATE_ROOT+'/')
    ||!isAbsolute(raw)||resolve(raw)!==raw||!raw.endsWith('.mjs')
    ||raw.includes('\0')||raw.includes('..'))
    throw new Error('CONFIGURATION_REQUIRED: private refresh factory');
  return raw;
}
async function assertTrustedFactory(path){
  let current=path,leaf=true;
  for(;;){
    const stat=await lstat(current);
    if(stat.isSymbolicLink()||stat.uid!==0||(stat.mode&0o022)!==0
      ||(leaf?(!stat.isFile()||stat.nlink!==1):!stat.isDirectory()))
      throw new Error('CONFIGURATION_REQUIRED: trusted refresh factory');
    if(current==='/')break;
    current=dirname(current);leaf=false;
  }
  if(await realpath(path)!==path)
    throw new Error('CONFIGURATION_REQUIRED: canonical refresh factory');
}
export async function refreshCli(args,env=process.env){
  if(args.length===1&&args[0]==='--plan'){
    return {state:'PLAN_ONLY',worker:'NON_ROOT',sourceRegistry:'NCP_PRIVATE_ONLY',
      realSourcesLoaded:0,externalRequests:0,requiresPrivateFactory:true};
  }
  if(args.length!==1||args[0]!=='--apply')
    throw new Error('Use --plan or --apply');
  if(process.platform!=='linux'||typeof process.getuid!=='function'||process.getuid()===0)
    throw new Error('CONFIGURATION_REQUIRED: non-root Linux worker');
  const path=refreshFactoryPath(env.HUFS_NCP_REFRESH_FACTORY);
  await assertTrustedFactory(path);
  let module;
  try{module=await import(pathToFileURL(path).href);}
  catch{throw new Error('CONFIGURATION_REQUIRED: refresh factory not available');}
  if(typeof module.createRefreshWorker!=='function')
    throw new Error('CONFIGURATION_REQUIRED: missing createRefreshWorker');
  let worker;
  try{
    worker=await module.createRefreshWorker();
    if(typeof worker?.runOnce!=='function'||typeof worker?.close!=='function')
      throw new Error('Invalid refresh worker');
    // Operator factory must wire Crawlee with approved sources, rights,
    // pinned egress and the existing durable PostgreSQL review queue.
    await worker.runOnce();
  }finally{
    try{await worker?.close?.();}catch{/* worker failure stays fail-closed */}
  }
  return {state:'RUN_COMPLETE',externalDataReturned:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  refreshCli(process.argv.slice(2)).then(value=>{
    process.stdout.write(JSON.stringify(value)+'\n');
  }).catch(()=>{
    // Do not leak config, original text, URLs or credentials into journald.
    process.stdout.write(JSON.stringify({state:'BLOCKED',code:'CONFIGURATION_OR_RUNTIME_FAILURE'})+'\n');
    process.exitCode=1;
  });
}
