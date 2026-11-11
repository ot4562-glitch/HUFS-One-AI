import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {refreshCli,refreshFactoryPath,runApprovedRefreshWorker} from './refresh-cli.mjs';

const base=dirname(fileURLToPath(import.meta.url));
const path=resolve(base,'refresh-cli.mjs');
describe('NCP-only refresh service static and process gates (#445)',()=>{
  it('plan makes no real source, network or credentials available',async()=>{
    assert.deepEqual(await refreshCli(['--plan']),{
      state:'PLAN_ONLY',worker:'NON_ROOT',sourceRegistry:'NCP_PRIVATE_ONLY',
      realSourcesLoaded:0,externalRequests:0,requiresPrivateFactory:true,
    });
  });
  it('rejects untrusted private factory paths',()=>{
    for(const x of [undefined,'./local_only/refresh.mjs','/tmp/factory.mjs',
      '/etc/hufs-one/private/../other.mjs','/etc/hufs-one/private/secret.json',
      '/etc/hufs-one/private/refresh.mjs\0'])
      assert.throws(()=>refreshFactoryPath(x));
    assert.equal(refreshFactoryPath('/etc/hufs-one/private/refresh-factory.mjs'),
      '/etc/hufs-one/private/refresh-factory.mjs');
  });
  it('apply without trusted NCP configuration blocks with no URL or secret logs',()=>{
    const p=spawnSync(process.execPath,[path,'--apply'],
      {encoding:'utf8',env:{...process.env,HUFS_NCP_REFRESH_FACTORY:''},timeout:5000});
    assert.notEqual(p.status,0);
    assert.deepEqual(JSON.parse(p.stdout),{
      state:'BLOCKED',code:'CONFIGURATION_OR_RUNTIME_FAILURE',
    });
  });
  it('reports a bounded completed durable queue batch and closes exactly once',async()=>{
    let closed=0;
    const worker={runOnce:async()=>({state:'BATCH_COMPLETE',processed:2,
      idleObserved:true,activeRevisions:0}),close:async()=>{closed++;}};
    assert.deepEqual(await runApprovedRefreshWorker(worker),
      {state:'RUN_COMPLETE',externalDataReturned:false});
    assert.equal(closed,1);
  });
  it('never reports success on denied, partial or forged batches',async()=>{
    for(const result of [
      undefined,{state:'NEEDS_REVIEW'},{state:'IDLE'},
      {state:'BATCH_COMPLETE',processed:-1,idleObserved:true,activeRevisions:0},
      {state:'BATCH_COMPLETE',processed:17,idleObserved:true,activeRevisions:0},
      {state:'BATCH_COMPLETE',processed:0,idleObserved:false,activeRevisions:0},
      {state:'BATCH_COMPLETE',processed:1,idleObserved:true,activeRevisions:1},
    ]){
      let closed=0;
      await assert.rejects(runApprovedRefreshWorker({
        runOnce:async()=>result,close:async()=>{closed++;},
      }),/REFRESH_FAILED/);
      assert.equal(closed,1);
    }
  });
  it('propagates cleanup errors without leaking private exception messages',async()=>{
    let calls=0;
    for(const broken of ['run','close','missing']){
      await assert.rejects(runApprovedRefreshWorker({
        runOnce:async()=>{calls++;if(broken==='run')throw Error('SECRET_SOURCE');
          return {state:'BATCH_COMPLETE',processed:1,idleObserved:false,activeRevisions:0};},
        ...(broken==='missing'?{}:{close:async()=>{if(broken==='close')throw Error('PRIVATE_URL');}}),
      }),e=>e instanceof Error&&e.message==='REFRESH_FAILED');
    }
    assert.equal(calls,3);
  });
  it('service invokes a non-root worker under flock and timer only triggers service',()=>{
    const service=readFileSync(resolve(base,'../../infra/ncp/hufs-one-ai-data-refresh.service'),'utf8');
    const timer=readFileSync(resolve(base,'../../infra/ncp/hufs-one-ai-data-refresh.timer'),'utf8');
    assert.match(service,/^User=hufs-crawler$/m);
    assert.match(service,/^Group=hufs-crawler$/m);
    assert.match(service,/^Environment=CRAWLEE_STORAGE_DIR=\/var\/lib\/hufs-one-crawler\/crawlee$/m);
    assert.match(service,/ExecStart=\/usr\/bin\/flock -n .*refresh-cli\.mjs --apply/);
    assert.doesNotMatch(service,/^User=root$/m);
    // ConditionPathExists makes missing private configuration silently 'skipped'.
    // A requested refresh must instead fail visibly and never report success.
    assert.doesNotMatch(service,/^ConditionPathExists=/m);
    assert.match(timer,/^Unit=hufs-one-ai-data-refresh\.service$/m);
    assert.match(timer,/^Persistent=true$/m);
    assert.doesNotMatch(timer,/ExecStart=/);
  });
});
