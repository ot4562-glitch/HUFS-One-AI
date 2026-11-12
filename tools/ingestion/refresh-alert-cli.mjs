/** #445 failure-only notifier; no source access or implicit collection/retry. */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {refreshFactoryPath,assertTrustedFactory} from './refresh-cli.mjs';

function fail(){throw new Error('ALERT_UNCONFIRMED');}
export function refreshAlertInvocation(env){
  if(env?.MONITOR_UNIT!=='hufs-one-ai-data-refresh.service'
    ||!/^[a-f0-9]{32}$/.test(env?.MONITOR_INVOCATION_ID??''))fail();
  return env.MONITOR_INVOCATION_ID;
}
export async function runApprovedRefreshAlert({deliver,invocationId,
  now=()=>new Date().toISOString(),timeoutMs=5000}){
  let timer;
  const controller=new AbortController();
  try{
    if(typeof deliver!=='function'||typeof invocationId!=='string'
      ||!/^[a-f0-9]{32}$/.test(invocationId)||!Number.isInteger(timeoutMs)
      ||timeoutMs<1||timeoutMs>5000)fail();
    const occurredAt=now();
    if(typeof occurredAt!=='string'||new Date(occurredAt).toISOString()!==occurredAt)fail();
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{
      controller.abort();reject(new Error('ALERT_UNCONFIRMED'));
    },timeoutMs);});
    const outcome=await Promise.race([timeout,Promise.resolve().then(()=>deliver({
      event:'SOURCE_REFRESH_FAILED',idempotencyKey:'source-refresh:'+invocationId,
      occurredAt,signal:controller.signal,
    }))]);
    if(outcome?.state!=='DELIVERED')fail();
    return {state:'DELIVERED',externalDataReturned:false};
  }catch{fail();}
  finally{clearTimeout(timer);controller.abort();}
}

export async function refreshAlertCli(args,env=process.env){
  if(args.length===1&&args[0]==='--plan')return {
    state:'PLAN_ONLY',event:'SOURCE_REFRESH_FAILED',externalRequests:0,requiresPrivateFactory:true,
  };
  if(args.length!==1||args[0]!=='--notify')throw new Error('Use --plan or --notify');
  if(process.platform!=='linux'||typeof process.getuid!=='function'||process.getuid()===0)fail();
  // Supplied by systemd to OnFailure handlers, not guessed from log text or
  // a user-controlled unit name. It is the deduplication key, never printed.
  const invocationId=refreshAlertInvocation(env);
  const path=refreshFactoryPath(env.HUFS_NCP_ALERT_FACTORY);
  await assertTrustedFactory(path);
  let module;
  try{module=await import(pathToFileURL(path).href);}catch{fail();}
  return runApprovedRefreshAlert({invocationId,
    deliver:module.deliverRefreshAlert});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  refreshAlertCli(process.argv.slice(2)).then(value=>{
    process.stdout.write(JSON.stringify(value)+'\n');
  }).catch(()=>{
    process.stdout.write(JSON.stringify({state:'UNCONFIRMED',code:'ALERT_UNCONFIRMED'})+'\n');
    process.exitCode=1;
  });
}
