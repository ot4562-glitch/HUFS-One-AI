import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {lstat,readFile,realpath} from 'node:fs/promises';
import {isAbsolute,basename,dirname,resolve} from 'node:path';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {z} from 'zod';
import {RecoveryDrillError,RecoveryDrillPlanSchema,recoveryPlanSha256} from './postgres-recovery-drill.js';
import type {RecoveryEndpoint,RecoveryTransfer} from './postgres-recovery-drill.js';

const Pin=z.strictObject({path:z.string().min(1).max(4096).refine(p=>isAbsolute(p)&&!/[\0\r\n]/.test(p)),sha256:z.string().regex(/^[a-f0-9]{64}$/)});
const Policy=z.strictObject({version:z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/),majorVersion:z.number().int().min(18).max(99),dump:Pin,restore:Pin});
export type RecoveryNativePolicy=z.infer<typeof Policy>;
export const recoveryTransferPolicySha256=(v:unknown)=>createHash('sha256').update(JSON.stringify(Policy.parse(v))).digest('hex');
export interface RecoveryCredentialFiles {
  /** Independently scoped existing credential file. Never return passwords or
   * accept a browser file path. Real Windows ACL validation belongs to this port. */
  resolve(input:{endpoint:RecoveryEndpoint;signal:AbortSignal}):Promise<{passFile:string;rootCert?:z.infer<typeof Pin>}>;
  isPrivate(input:{path:string;endpoint:RecoveryEndpoint;signal:AbortSignal}):Promise<boolean>;
}
async function abortable<T>(value:Promise<T>,signal:AbortSignal):Promise<T>{
  if(signal.aborted){void value.catch(()=>{});throw new RecoveryDrillError('TRANSFER_ABORTED');}let stop:()=>void=()=>{};
  try{return await Promise.race([value,new Promise<never>((_,reject)=>{stop=()=>reject(new RecoveryDrillError('TRANSFER_ABORTED'));
    signal.addEventListener('abort',stop,{once:true});if(signal.aborted)stop();})]);}
  finally{signal.removeEventListener('abort',stop);}
}
async function pinFile(raw:z.infer<typeof Pin>,signal:AbortSignal){
  const pin=Pin.parse(raw),path=resolve(pin.path),stat=await lstat(path);
  if(stat.isSymbolicLink()||!stat.isFile()||stat.size>33554432||await realpath(path)!==path)throw new RecoveryDrillError('TOOL_PIN_DENIED');
  const bytes=await readFile(path,{signal});
  if(createHash('sha256').update(bytes).digest('hex')!==pin.sha256)throw new RecoveryDrillError('TOOL_PIN_DENIED');
  return path;
}
/** Fixed native PostgreSQL protocol, not a shell/command runner. No pool,
 * credential access, binary execution or background work on construction. */
export function createNativeRecoveryTransfer(options:{policy:unknown;credentials:RecoveryCredentialFiles;spawn?:typeof spawn}):RecoveryTransfer{
  const policy=Policy.parse(options.policy),policySha=recoveryTransferPolicySha256(policy),launch=options.spawn??spawn;
  const osEnv:NodeJS.ProcessEnv={...(process.env.SystemRoot?{SystemRoot:process.env.SystemRoot}:{}),...(process.env.WINDIR?{WINDIR:process.env.WINDIR}:{}),LANG:'C',LC_ALL:'C'};
  const command=(path:string,args:string[],env:NodeJS.ProcessEnv)=>{
    const child=launch(path,args,{windowsHide:true,shell:false,stdio:['pipe','pipe','pipe'],env:{...osEnv,PATH:dirname(path),...env}});
    let ended=false,error=false;
    child.once('error',()=>{error=true;});
    const closed=new Promise<number|null>(done=>child.once('close',code=>{ended=true;done(error?null:code);}));
    if(!child.stdin||!child.stdout||!child.stderr)throw new RecoveryDrillError('NATIVE_START_FAILED');
    child.stderr.resume();
    return {child,input:child.stdin,output:child.stdout,closed,ended:()=>ended};
  };
  type Job=ReturnType<typeof command>;
  const terminate=async(job:Job)=>{
    const wait=async()=>{let timer:ReturnType<typeof setTimeout>|undefined;
      try{await Promise.race([job.closed,new Promise<void>(done=>{timer=setTimeout(done,2000);})]);}finally{if(timer)clearTimeout(timer);}};
    if(job.ended())return;job.child.kill('SIGTERM');await wait();
    if(!job.ended()){job.child.kill('SIGKILL');await wait();}
    if(!job.ended())throw new RecoveryDrillError('STOP_UNCONFIRMED');
  };
  const version=async(path:string,kind:'dump'|'restore',signal:AbortSignal)=>{
    const job=command(path,['--version'],{});let value='';
    job.output.on('data',chunk=>{value+=chunk.toString('utf8');if(value.length>256)job.child.kill();});job.input.end();
    try{const code=await abortable(job.closed,signal),match=new RegExp(`^pg_${kind} \\(PostgreSQL\\) ([0-9]+)\\.[^\\r\\n]+\\r?\\n?$`).exec(value);
      if(code!==0||!match||Number(match[1])!==policy.majorVersion)throw new RecoveryDrillError('TOOL_VERSION_DENIED');
    }finally{await terminate(job);}
  };
  const environment=async(endpoint:RecoveryEndpoint,signal:AbortSignal)=>{
    const files=await abortable(options.credentials.resolve({endpoint:structuredClone(endpoint),signal}),signal);
    if(!isAbsolute(files.passFile)||/[\0\r\n]/.test(files.passFile)
      ||await abortable(options.credentials.isPrivate({path:files.passFile,endpoint:structuredClone(endpoint),signal}),signal)!==true)throw new RecoveryDrillError('CREDENTIAL_SCOPE_DENIED');
    const stat=await lstat(files.passFile);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>65536||process.platform!=='win32'&&((stat.mode&0o077)!==0||stat.uid!==process.getuid?.()))
      throw new RecoveryDrillError('CREDENTIAL_SCOPE_DENIED');
    const root=endpoint.requireTls?(files.rootCert?await pinFile(files.rootCert,signal):undefined):undefined;
    if(endpoint.requireTls&&!root)throw new RecoveryDrillError('TLS_ROOT_REQUIRED');
    return {PGPASSFILE:files.passFile,PGHOSTADDR:endpoint.address,PGSSLMODE:endpoint.requireTls?'verify-full':'disable',
      PGSSLCERTMODE:'disable',PGCONNECT_TIMEOUT:'3',PGAPPNAME:'hufs-recovery-drill',PGCLIENTENCODING:'UTF8',
      PGOPTIONS:'-c statement_timeout=15000 -c lock_timeout=3000',...(root?{PGSSLROOTCERT:root}:{})};
  };
  const endpointArgs=(e:RecoveryEndpoint)=>[`--host=${e.tlsServerName??e.address}`,`--port=${e.port}`,`--username=${e.role}`,`--dbname=${e.database}`,'--no-password'];
  return {async run(input){
    const plan=RecoveryDrillPlanSchema.parse(input.plan);
    if(input.planSha256!==recoveryPlanSha256(plan)||plan.transferPolicySha256!==policySha||input.signal.aborted
      ||!/^[0-9A-Fa-f-]{1,64}$/.test(input.snapshot))throw new RecoveryDrillError('TRANSFER_POLICY_DENIED');
    const dump=await pinFile(policy.dump,input.signal),restore=await pinFile(policy.restore,input.signal);
    if(!/^pg_dump(?:\.exe)?$/.test(basename(dump))||!/^pg_restore(?:\.exe)?$/.test(basename(restore)))throw new RecoveryDrillError('TOOL_PIN_DENIED');
    await input.authorizeLaunch();await version(dump,'dump',input.signal);await input.authorizeLaunch();await version(restore,'restore',input.signal);
    const sourceEnv=await environment(plan.source,input.signal),targetEnv=await environment(plan.target,input.signal);
    if(input.signal.aborted)throw new RecoveryDrillError('TRANSFER_ABORTED');
    const jobs:Job[]=[];const digest=createHash('sha256');let bytes=0;
    try{
      await input.authorizeLaunch();
      const target=command(restore,[...endpointArgs(plan.target),'--format=custom','--single-transaction','--exit-on-error','--no-owner','--no-privileges','--no-tablespaces'],targetEnv);jobs.push(target);
      await input.authorizeLaunch();
      const source=command(dump,[...endpointArgs(plan.source),'--format=custom','--compress=0',`--snapshot=${input.snapshot}`,'--no-owner','--no-privileges','--no-tablespaces','--lock-wait-timeout=3000'],sourceEnv);jobs.push(source);
      source.input.end();
      const meter=new Transform({transform(chunk:Buffer,_encoding,done){bytes+=chunk.length;
        if(bytes>plan.maxArchiveBytes){done(new RecoveryDrillError('ARCHIVE_BOUND_EXCEEDED'));return;}
        digest.update(chunk);done(null,chunk);
      }});
      await abortable(Promise.all([pipeline(source.output,meter,target.input,{signal:input.signal}),source.closed,target.closed]),input.signal).then(result=>{
        if(result[1]!==0||result[2]!==0||!bytes)throw new RecoveryDrillError('NATIVE_TRANSFER_FAILED');
      });
      return {sha256:digest.digest('hex'),bytes};
    }catch(error){throw error instanceof RecoveryDrillError?error:new RecoveryDrillError('NATIVE_TRANSFER_FAILED');}
    finally{const stopped=await Promise.allSettled(jobs.map(terminate));if(stopped.some(r=>r.status==='rejected'))throw new RecoveryDrillError('STOP_UNCONFIRMED');}
  }};
}
