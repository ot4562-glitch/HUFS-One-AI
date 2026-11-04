import {afterAll, afterEach, beforeAll, describe, expect, it} from 'vitest';
import {mkdtemp, chmod, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {connect} from 'node:net';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import type {LayaWorker} from '../../packages/ai/src/laya-scheduler';
const {startLayaSupervisor} = await import(new URL('../../infra/laya/laya-supervisor.mjs', import.meta.url).href);
const {buildLayaModules} = await import(new URL('../../infra/laya/laya-build.mjs',import.meta.url).href);
let runtimeDirectory:string;
beforeAll(async()=>{
  runtimeDirectory=await mkdtemp(join(tmpdir(),'hufs-laya-built-'));
  await buildLayaModules(runtimeDirectory);
});
afterAll(async()=>{if(runtimeDirectory) await rm(runtimeDirectory,{recursive:true,force:true});});
const paths: string[] = [];
const services: {close(): Promise<void>}[] = [];
afterEach(async () => {
  for (const service of services.splice(0)) await service.close();
  for (const path of paths.splice(0)) await rm(path, {recursive:true, force:true});
});
async function config() {
  const dir = await mkdtemp(join(tmpdir(),'hufs-laya-supervisor-'));
  paths.push(dir);
  await chmod(dir, 0o700);
  const authority = join(dir, 'authority.mjs');
  const source = `export async function createLayaAuthority() { return {
    isCurrent: job => job.actorId === 'synthetic-owner' && job.permissionRevision === 'grant-1',
    apiPressure: async () => ({p95Ms:100,baselineP95Ms:100,errorRatio:0})
  };}`;
  await writeFile(authority,source,{mode:0o600});
  const pin = (name:string) => ({path:join(dir,name),sha256:'a'.repeat(64)});
  const value = {version:1,enabled:true,runtimeDirectory,socketPath:join(dir,'laya.sock'),authority:{path:authority,sha256:createHash('sha256').update(source).digest('hex')},
    approval:{enabled:true,operatorApprovalId:'synthetic-approval',approvedAt:'2026-11-03T00:00:00.000Z',
      isolation:{cgroupV2:true,cpuMax:'100000 100000',memoryMaxBytes:3*1024**3,networkDenied:true,separateFromApi:true},
      manifest:{model:pin('model'),runtime:pin('runtime'),driver:pin('driver'),artifacts:[],modelRevision:'synthetic-model',configVersion:'synthetic-config',labels:['review'],inputNames:['input'],outputNames:['output']}}};
  const path = join(dir,'config.json');
  await writeFile(path,JSON.stringify(value),{mode:0o600});
  return {path,value,authority};
}
const pressure = {hostCpuPercent:0,cpuPressureAvg10:0,availableBytes:5*1024**3,workerRssBytes:1024,
  apiP95Ms:100,apiBaselineP95Ms:100,apiErrorRatio:0,oom:false};
const fake = ():LayaWorker => ({start:async()=>{},run:async()=>({label:'review',score:0.7,tokenCount:4}),stop(){},onFailure(){}});
// Enabled production supervision depends on Linux ownership/mode and UNIX
// sockets. Windows must keep the same fail-closed guard; Linux CI runs all four.
const linuxIt = it.skipIf(process.platform !== 'linux');
async function request(socketPath:string, value:unknown) {
  return new Promise<Record<string,unknown>>((resolve,reject)=>{
    const socket=connect(socketPath); let result='';
    socket.on('connect',()=>socket.write(JSON.stringify(value)+'\n'));
    socket.on('data',data=>{result+=data.toString();});
    socket.on('end',()=>{try{resolve(JSON.parse(result));}catch(error){reject(error);}});
    socket.on('error',reject);
  });
}
describe('Laya concrete local supervisor',()=>{
  it('runs its real Node CLI in default OFF mode without loading models',async()=>{
    const {stdout}=await promisify(execFile)(process.execPath,[fileURLToPath(new URL('../../infra/laya/laya-supervisor.mjs',import.meta.url))],
      {env:{LAYA_ENABLED:'false'},timeout:5000});
    expect(JSON.parse(stdout)).toMatchObject({state:'OFF',reason:'LAYA_OFF'});
  });
  it('remains OFF without enabling configuration and starts no socket or worker',async()=>{
    let created=0;
    const service=await startLayaSupervisor({env:{},dependencies:{createWorker:()=>{created++;return fake();}}});
    services.push(service);
    expect(service.status()).toMatchObject({state:'OFF'});
    expect(created).toBe(0);
  });
  linuxIt('serves bounded UNIX IPC with mode0600, authoritative rights and graceful cleanup',async()=>{
    const {path,value}=await config();
    const service=await startLayaSupervisor({configPath:path,env:{LAYA_ENABLED:'true'},dependencies:{createWorker:fake,sample:async()=>pressure}});
    services.push(service);
    expect((await stat(value.socketPath)).mode & 0o777).toBe(0o600);
    const job={origin:'INGEST',actorId:'synthetic-owner',sourceId:'source',sourceRevision:'rev-1',modelRevision:'synthetic-model',configVersion:'synthetic-config',permissionRevision:'grant-1',asOf:'2026-11-03T00:00:00.000Z',text:'synthetic'};
    expect(await request(value.socketPath,{operation:'enqueue',job})).toMatchObject({status:'ADVICE',verification:'UNVERIFIED'});
    expect(await request(value.socketPath,{operation:'enqueue',job:{...job,actorId:'other',current:true}})).toMatchObject({reason:'STALE_EPOCH'});
    expect(await request(value.socketPath,{operation:'start',approval:value.approval})).toMatchObject({error:'INVALID_OPERATION'});
    await service.close();
    await expect(stat(value.socketPath)).rejects.toMatchObject({code:'ENOENT'});
  });
  linuxIt('verifies the authoritative permission driver before import or worker creation',async()=>{
    const {path,authority}=await config();
    await writeFile(authority,'throw Error("must not import altered code")');
    let created=0;
    await expect(startLayaSupervisor({configPath:path,env:{LAYA_ENABLED:'true'},dependencies:{createWorker:()=>{created++;return fake();},sample:async()=>pressure}})).rejects.toThrow('AUTHORITY_HASH_MISMATCH');
    expect(created).toBe(0);
  });
  linuxIt('preserves an existing socket path and fails closed for pressure before model startup',async()=>{
    const {path,value}=await config();
    await writeFile(value.socketPath,'preserve-existing-file');
    await expect(startLayaSupervisor({configPath:path,env:{LAYA_ENABLED:'true'},dependencies:{createWorker:fake,sample:async()=>pressure}})).rejects.toThrow('SOCKET_PATH_EXISTS');
    expect(await readFile(value.socketPath,'utf8')).toBe('preserve-existing-file');
  });
  linuxIt('blocks low RAM before worker startup and accepts no client-provided current flag',async()=>{
    const {path,value}=await config();
    let created=0;
    await expect(startLayaSupervisor({configPath:path,env:{LAYA_ENABLED:'true'},dependencies:{createWorker:()=>{created++;return fake();},sample:async()=>({...pressure,availableBytes:1024})}})).rejects.toThrow('LAYA_INITIAL_RESOURCE_GATE');
    expect(created).toBe(0);
    await expect(stat(value.socketPath)).rejects.toMatchObject({code:'ENOENT'});
  });
});
