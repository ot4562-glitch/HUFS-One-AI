import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {runApprovedRefreshAlert,refreshAlertCli,refreshAlertInvocation} from './refresh-alert-cli.mjs';

const invocationId='a'.repeat(32),now=()=> '2026-11-12T00:00:00.000Z';
describe('#445 private failure notification',()=>{
  it('plans without loading a notifier, credentials or external service',async()=>{
    assert.deepEqual(await refreshAlertCli(['--plan'],{}),{
      state:'PLAN_ONLY',event:'SOURCE_REFRESH_FAILED',externalRequests:0,
      requiresPrivateFactory:true,
    });
  });
  it('sends one fixed, idempotent event and requires a delivery acknowledgement',async()=>{
    const calls=[];
    const result=await runApprovedRefreshAlert({invocationId,now,
      deliver:async input=>{calls.push(input);return {state:'DELIVERED'};}});
    assert.deepEqual(result,{state:'DELIVERED',externalDataReturned:false});
    assert.equal(calls.length,1);
    assert.deepEqual(Object.keys(calls[0]).sort(),['event','idempotencyKey','occurredAt','signal']);
    assert.equal(calls[0].event,'SOURCE_REFRESH_FAILED');
    assert.equal(calls[0].idempotencyKey,'source-refresh:'+invocationId);
  });
  it('does not report a resolved promise or queued event as delivered',async()=>{
    for(const value of [undefined,{},true,{state:'QUEUED'}]){
      await assert.rejects(runApprovedRefreshAlert({invocationId,now,
        deliver:async()=>value}),error=>error.message==='ALERT_UNCONFIRMED');
    }
  });
  it('redacts delivery failures and bounds a hung notifier without retrying',async()=>{
    await assert.rejects(runApprovedRefreshAlert({invocationId,now,
      deliver:async()=>{throw new Error('PRIVATE-TOKEN-OR-URL');}}),error=>error.message==='ALERT_UNCONFIRMED');
    let calls=0,signal;
    await assert.rejects(runApprovedRefreshAlert({invocationId,now,timeoutMs:5,
      deliver:async input=>{calls++;signal=input.signal;return new Promise(()=>{});}}),/ALERT_UNCONFIRMED/);
    assert.equal(calls,1);assert.equal(signal.aborted,true);
  });
  it('rejects missing or untrusted invocation IDs and time before delivery',async()=>{
    let calls=0;
    for(const id of [undefined,'','https://private.invalid','../../file','a'.repeat(33)])
      await assert.rejects(runApprovedRefreshAlert({invocationId:id,now,
        deliver:async()=>{calls++;return {state:'DELIVERED'};}}));
    await assert.rejects(runApprovedRefreshAlert({invocationId,now:()=> 'invalid',deliver:async()=>{calls++;}}));
    assert.equal(calls,0);
  });
  it('binds only the expected systemd failure unit and invocation on every platform',()=>{
    assert.equal(refreshAlertInvocation({MONITOR_UNIT:'hufs-one-ai-data-refresh.service',MONITOR_INVOCATION_ID:invocationId}),invocationId);
    for(const env of [{},{MONITOR_UNIT:'other.service',MONITOR_INVOCATION_ID:invocationId},
      {MONITOR_UNIT:'hufs-one-ai-data-refresh.service'},
      {MONITOR_UNIT:'hufs-one-ai-data-refresh.service',MONITOR_INVOCATION_ID:'invalid'}])
      assert.throws(()=>refreshAlertInvocation(env),/ALERT_UNCONFIRMED/);
  });
  it('never upgrades an expired notification to success after a late acknowledgement',async()=>{
    let calls=0,signal;
    await assert.rejects(runApprovedRefreshAlert({invocationId,now,timeoutMs:5,
      deliver:async input=>{calls++;signal=input.signal;
        await new Promise(resolve=>setTimeout(resolve,20));return {state:'DELIVERED'};}}),/ALERT_UNCONFIRMED/);
    await new Promise(resolve=>setTimeout(resolve,30));
    assert.equal(calls,1);assert.equal(signal.aborted,true);
  });
  it('does not activate on unknown arguments or a non-NCP host',async()=>{
    await assert.rejects(refreshAlertCli(['--notify','--force'],{}));
    await assert.rejects(refreshAlertCli(['--notify'],{}));
  });
  it('prints only the fixed failure envelope when private configuration is unavailable',()=>{
    const result=spawnSync(process.execPath,[fileURLToPath(new URL('./refresh-alert-cli.mjs',import.meta.url)),'--notify'],
      {encoding:'utf8',timeout:5000,env:{HUFS_NCP_ALERT_FACTORY:'PRIVATE-TOKEN-NOT-A-PATH'}});
    assert.equal(result.status,1);
    assert.deepEqual(JSON.parse(result.stdout),{state:'UNCONFIRMED',code:'ALERT_UNCONFIRMED'});
    assert.equal(result.stderr,'');
    assert.doesNotMatch(result.stdout,/PRIVATE-TOKEN/);
  });
  it('connects failure-only notification to the same non-root service boundary',()=>{
    const service=readFileSync(new URL('../../infra/ncp/hufs-one-ai-data-refresh.service',import.meta.url),'utf8');
    const alert=readFileSync(new URL('../../infra/ncp/hufs-one-ai-data-refresh-alert.service',import.meta.url),'utf8');
    assert.match(service,/^OnFailure=hufs-one-ai-data-refresh-alert\.service$/m);
    assert.match(alert,/^User=hufs-crawler$/m);
    assert.match(alert,/refresh-alert-cli\.mjs --notify$/m);
    assert.match(alert,/^NoNewPrivileges=true$/m);
    assert.match(alert,/^TimeoutStartSec=15s$/m);
    assert.doesNotMatch(alert,/^OnFailure=|^Restart=|--apply|sudo/m);
  });
});
