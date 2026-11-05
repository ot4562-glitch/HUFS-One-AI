import {lstat,realpath} from 'node:fs/promises';
import {dirname,isAbsolute,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {prepareOperatorPostgres,startOperatorPostgres} from './operator-postgres-runtime.js';
import type {OperatorPostgresInputs,OperatorServer} from './operator-postgres-runtime.js';
import {PROJECT_AUTHORIZATION} from './runtime-policy.js';

const ROOT='/etc/hufs-one/private';
/** A trusted server module supplies actual credentials and provider adapters.
 * Its path is not a URL, command, browser parameter, or repository secret. */
export function productionConfigPath(raw:string|undefined):string{
  if(!raw||!isAbsolute(raw)||!raw.endsWith('.mjs')||raw.includes('\0')
    ||resolve(raw)!==raw||!raw.startsWith(ROOT+'/'))
    throw new Error('CONFIGURATION_REQUIRED: private production factory path');
  return raw;
}
export function productionPort(raw:string|undefined):number{
  if(raw!==undefined&&!/^\d{4,5}$/.test(raw))throw new Error('CONFIGURATION_REQUIRED: loopback port');
  const port=Number(raw??'3000');
  if(!Number.isSafeInteger(port)||port<1024||port>65535)
    throw new Error('CONFIGURATION_REQUIRED: loopback port');
  return port;
}
async function assertTrustedPath(path:string):Promise<void>{
  // No symlink ancestor, writable directory, group/world write, or non-root
  // owner is accepted. Root controls the entire path through module import.
  let current=path,leaf=true;
  for(;;){
    const s=await lstat(current);
    if(s.isSymbolicLink()||s.uid!==0||(s.mode&0o022)!==0
      ||(leaf?(!s.isFile()||s.nlink!==1):!s.isDirectory()))
      throw new Error('CONFIGURATION_REQUIRED: trusted production factory');
    if(current==='/')break;
    leaf=false;current=dirname(current);
  }
  if(await realpath(path)!==path)throw new Error('CONFIGURATION_REQUIRED: canonical factory path');
}

/** Starts only after explicit --apply. The loader's close hook owns ancillary
 * transport resources; every managed SQL pool is closed by the operator server. */
export async function runProductionMain(args:readonly string[],environment:NodeJS.ProcessEnv=process.env):Promise<OperatorServer|null>{
  if(args.length===0||(args.length===1&&args[0]==='--plan')){
    console.log(JSON.stringify({authorization:PROJECT_AUTHORIZATION,mode:'PLAN_ONLY',
      runtime:'production',binding:'127.0.0.1',configuration:'PRIVATE_FACTORY_REQUIRED',
      externalCalls:0,databaseMigrations:0}));
    return null;
  }
  if(args.length!==1||args[0]!=='--apply')throw new Error('Use --plan or --apply');
  if(process.platform!=='linux')throw new Error('CONFIGURATION_REQUIRED: Linux production host');
  const path=productionConfigPath(environment.HUFS_PRODUCTION_CONFIG);
  const port=productionPort(environment.HUFS_API_INTERNAL_PORT);
  await assertTrustedPath(path);
  const module=await import(pathToFileURL(path).href) as {
    createOperatorConfig?:()=>OperatorPostgresInputs|Promise<OperatorPostgresInputs>;
    close?:()=>void|Promise<void>;
  };
  if(typeof module.createOperatorConfig!=='function'||(module.close!==undefined&&typeof module.close!=='function'))
    throw new Error('CONFIGURATION_REQUIRED: createOperatorConfig factory');
  let managed:OperatorServer|undefined;
  try{
    const config=await module.createOperatorConfig();
    const prepared=prepareOperatorPostgres({...config,runtime:'production'});
    managed=await startOperatorPostgres({prepared,host:'127.0.0.1',port});
  }catch{
    if(module.close)try{await module.close();}catch{/* no configuration or secret output */}
    throw new Error('CONFIGURATION_OR_RUNTIME_FAILURE: production startup');
  }
  let closing:Promise<void>|undefined;
  const server=managed;
  return {address:server.address,close(){
    return closing??=(async()=>{
      let failed=false;
      try{await server.close();}catch{failed=true;}
      try{await module.close?.();}catch{failed=true;}
      if(failed)throw new Error('Production shutdown incomplete');
    })();
  }};
}

// Importing this module in tests or another launcher never starts a server.
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  runProductionMain(process.argv.slice(2)).then(server=>{
    if(!server)return;
    console.log(JSON.stringify({authorization:PROJECT_AUTHORIZATION,state:'LISTENING',address:server.address}));
    const stop=()=>{void server.close().catch(()=>{process.exitCode=1;});};
    process.once('SIGTERM',stop);process.once('SIGINT',stop);
  }).catch(()=>{
    console.error('CONFIGURATION_OR_RUNTIME_FAILURE: no production service started');process.exitCode=1;
  });
}
