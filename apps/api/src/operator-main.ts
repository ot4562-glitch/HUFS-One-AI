/** Operator-invoked INTERNAL real-PostgreSQL acceptance process.
 *
 * --plan never imports private configuration or opens a socket.
 * --apply is deliberately restricted to localhost and explicitly reviewed
 * role-based TLS/Google adapters; it is NOT a public production release.
 */
import {lstatSync,realpathSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {prepareOperatorPostgres,startOperatorPostgres} from './operator-postgres-runtime.js';
import type {OperatorPostgresInputs} from './operator-postgres-runtime.js';

const usage='Usage: node dist/apps/api/src/operator-main.js --plan | --apply';
const args=process.argv.slice(2);
if(args.length!==1||!['--plan','--apply'].includes(args[0]!))
  throw new Error(usage);
if(args[0]==='--plan'){
  process.stdout.write('PLAN ONLY: private operator runtime, seven restricted TLS PostgreSQL roles, Google OIDC, localhost HTTP. No network, cloud, migration, file read or deployment. RELEASE_BLOCKED.\n');
}else{
  if(process.platform!=='linux'||process.env.HUFS_OPERATOR_MODE!=='loopback-acceptance'
    ||process.env.HUFS_OPERATOR_ACK!=='INTERNAL_ONLY_NOT_RELEASE'
    ||process.env.APP_ENV==='production'||process.env.NODE_ENV==='production')
    throw new Error('Internal operator acceptance only; public production is RELEASE_BLOCKED');
  const name=process.env.HUFS_OPERATOR_CONFIG_MODULE;
  if(!name||!isAbsolute(name)||!name.endsWith('.mjs')
    ||!name.startsWith('/etc/hufs-one/private/'))
    throw new Error('Use a separately provisioned private operator adapter');
  const stat=lstatSync(name);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==0||stat.mode&0o022
    ||realpathSync(name)!==name)
    throw new Error('Operator adapter permissions or path refused');
  const port=Number(process.env.HUFS_OPERATOR_LOOPBACK_PORT??'3000');
  if(!Number.isSafeInteger(port)||port<1024||port>65535)
    throw new Error('Invalid loopback port');
  const module=await import(pathToFileURL(name).href) as {
    createOperatorConfig?:()=>Promise<OperatorPostgresInputs>|OperatorPostgresInputs;
  };
  if(typeof module.createOperatorConfig!=='function')
    throw new Error('Private operator configuration factory required');
  const prepared=prepareOperatorPostgres(await module.createOperatorConfig());
  const server=await startOperatorPostgres({prepared,host:'127.0.0.1',port});
  process.stdout.write('HUFS internal PostgreSQL/OIDC acceptance API listening on 127.0.0.1 only; RELEASE_BLOCKED.\n');
  let stopping=false;
  const stop=()=>{
    if(stopping)return;
    stopping=true;
    void server.close().then(()=>{process.exitCode=0;},()=>{process.exitCode=1;});
  };
  process.once('SIGTERM',stop);
  process.once('SIGINT',stop);
}
