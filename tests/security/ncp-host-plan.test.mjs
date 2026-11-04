import assert from 'node:assert/strict';
import test from 'node:test';
import {createHostBundle} from '../../infra/ncp/setup/02-host-plan.mjs';

const source=()=>({
  network:{mode:'SSH_SYNTHETIC_PREVIEW_ONLY',source_sha:'a'.repeat(40),
    config_sha256:'b'.repeat(64),subnet_no:'12345',access_control_group_no:'67890'},
  server:{ubuntuImageNo:'25495367',serverSpecCode:'s2-g3',
    existingLoginKeyName:'approved-login-key',estimatedHourlyKrw:350,
    approvedBudgetKrw:15000,approvedHours:24},
});
test('one approved, cost-bounded synthetic host plan starts with operator approval OFF',()=>{
  const bundle=createHostBundle(source());
  assert.equal(bundle.mode,'PLAN_ONLY');
  assert.equal(bundle.tfvars.operator_approved,false);
  assert.equal(bundle.tfvars.operator_approval_reference,'');
  assert.equal(bundle.tfvars.request.source_sha,source().network.source_sha);
  assert.match(bundle.expected_approval_sha256,/^[a-f0-9]{64}$/);
  assert.equal(bundle.pending.includes('OWNER_ACCOUNT_AND_COST_APPROVAL'),true);
  assert.equal(bundle.release,'RELEASE_BLOCKED');
  assert.deepEqual(createHostBundle(source()),bundle);
});
test('request hash changes on an independently chosen image or cost',()=>{
  const a=createHostBundle(source());
  const b=source();b.server.ubuntuImageNo='25495368';
  assert.notEqual(createHostBundle(b).expected_approval_sha256,a.expected_approval_sha256);
  b.server.ubuntuImageNo='25495367';b.server.estimatedHourlyKrw=351;
  assert.notEqual(createHostBundle(b).expected_approval_sha256,a.expected_approval_sha256);
});
test('rejects guessed or unsafe host, network, ownership and budget',()=>{
  const variants=[
    x=>{x.network.mode='PRODUCTION';},
    x=>{x.network.subnet_no=x.network.access_control_group_no;},
    x=>{x.network.source_sha='0'.repeat(40);},
    x=>{x.network.config_sha256='0'.repeat(64);},
    x=>{x.server.ubuntuImageNo='not-an-approved-image';},
    x=>{x.server.serverSpecCode='bad spec; rm -rf';},
    x=>{x.server.existingLoginKeyName='';},
    x=>{x.server.approvedBudgetKrw=100;},
    x=>{x.server.approvedHours=745;},
    x=>{x.server.estimatedHourlyKrw=0;},
  ];
  for(const mutate of variants){
    const value=source();mutate(value);
    assert.throws(()=>createHostBundle(value));
  }
});
test('does not accept a browser, secret, credential or apply field in the plan input',()=>{
  for(const extra of [{operator_approved:true},{ncpAccessKey:'SYN-SECRET'},
    {server:{...source().server,apply:true}}]){
    assert.throws(()=>createHostBundle({...source(),...extra}));
  }
});
