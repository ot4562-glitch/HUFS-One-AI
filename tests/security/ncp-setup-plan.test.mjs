import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createSetupPlan} from '../../infra/ncp/setup/00-preflight.mjs';

const fixture=()=>({version:1,project:'hufs-one-ai',region:'KR',zone:'KR-1',sourceSha:'a'.repeat(40),
  network:{vpcCidr:'10.27.0.0/16',subnetCidr:'10.27.10.0/24',existingCidrs:['10.28.0.0/16'],
    adminPublicCidr:'93.184.216.34/32',publicIp:true},
  server:{os:'ubuntu-24.04-amd64',productCode:'SYNTHETIC-SKU',storageGb:50},
  estimate:{kind:'SYNTHETIC',observedAt:'2026-11-04T00:00:00.000Z',hours:10,
    serverHourlyKrw:'1',storageGbHourlyKrw:'0.01',publicIpHourlyKrw:'0.5',additionalKrw:0,
    vatPercent:10,budgetKrw:100,sourceUrl:'https://www.ncloud.com/charge/region/ko'}});

test('plans one isolated SSH preview with exact decimal budget and no executable approval',()=>{
  const plan=createSetupPlan(fixture());
  assert.equal(plan.mode,'PLAN_ONLY');assert.equal(plan.release,'RELEASE_BLOCKED');
  assert.equal(plan.estimatedKrw,'22');
  assert.deepEqual(plan.network.inbound,[{protocol:'TCP',port:22,source:'93.184.216.34/32'}]);
  assert.equal(plan.resources.server.count,1);assert.equal(plan.resources.publicIp.count,1);
  assert.equal(plan.source.sha,'a'.repeat(40));assert.equal(plan.source.remoteCurrentness,'NOT_VERIFIED');
  assert.deepEqual(plan.steps.map(x=>x.id),['00-preflight','01-provision','02-bootstrap','03-deploy-preview','04-verify','05-rollback','06-teardown']);
  assert.ok(plan.steps.find(x=>x.id==='03-deploy-preview').command.includes('infra/ncp/Deploy-NcpPreview.ps1'));
  assert.ok(!plan.steps.find(x=>x.id==='03-deploy-preview').command.includes('-Apply'));
  assert.equal(plan.agentOnApplicationHost,false);
});

test('retains public IP holding cost separately and rounds up monetary fractions',()=>{
  const config=fixture();config.estimate={...config.estimate,serverHourlyKrw:'0.001',storageGbHourlyKrw:'0',
    publicIpHourlyKrw:'0',hours:1,vatPercent:0};
  assert.equal(createSetupPlan(config).estimatedKrw,'1');
  config.network.publicIp=false;
  assert.equal(createSetupPlan(config).resources.publicIp.count,0);
  assert.ok(createSetupPlan(config).gates.includes('APPROVED_BASTION_OR_VPN_REQUIRED'));
});

test('rejects overspend, nonaligned subnet, overlap and subnet outside VPC',()=>{
  for(const mutate of [c=>{c.estimate.budgetKrw=1;},c=>{c.network.subnetCidr='10.27.10.1/24';},
    c=>{c.network.subnetCidr='10.29.0.0/24';},c=>{c.network.existingCidrs=['10.27.0.0/17'];},
    c=>{c.network.vpcCidr='8.8.0.0/16';}]){
    const config=fixture();mutate(config);assert.throws(()=>createSetupPlan(config));
  }
});

test('rejects open SSH, metadata/private/documentation admin addresses and injected identities',()=>{
  for(const source of ['0.0.0.0/0','10.1.2.3/32','169.254.169.254/32','127.0.0.1/32',
    '100.64.0.1/32','203.0.113.1/32','192.0.2.1/32','224.1.2.3/32','93.184.216.34/24']){
    const config=fixture();config.network.adminPublicCidr=source;assert.throws(()=>createSetupPlan(config));
  }
  for(const mutate of [c=>{c.project='other-project';},c=>{c.sourceSha='main; curl evil';},
    c=>{c.region='US';},c=>{c.server.productCode='$(touch secret)';},c=>{c.server.os='windows';},
    c=>{c.network.inboundPorts=[80,443,5432];},c=>{c.ncpSecret='CANARY-NEVER-PRINT';}]){
    const config=fixture();mutate(config);assert.throws(()=>createSetupPlan(config));
  }
});

test('binds plan digest to configuration independent of JSON property order',()=>{
  const config=fixture(),first=createSetupPlan(config);
  assert.equal(createSetupPlan(Object.fromEntries(Object.entries(config).reverse())).planSha256,first.planSha256);
  config.sourceSha='b'.repeat(40);
  assert.notEqual(createSetupPlan(config).planSha256,first.planSha256);
});

test('CLI rejects apply/credentials/oversized stdin without writing or contacting a host',()=>{
  const file=fileURLToPath(new URL('../../infra/ncp/setup/00-preflight.mjs',import.meta.url));
  const apply=spawnSync(process.execPath,[file,'--apply'],{encoding:'utf8',env:{NCP_SECRET_KEY:'CANARY-NEVER-PRINT'}});
  assert.equal(apply.status,2);assert.equal(apply.stdout,'');assert.ok(!apply.stderr.includes('CANARY-NEVER-PRINT'));
  const invalid=spawnSync(process.execPath,[file],{encoding:'utf8',input:JSON.stringify({...fixture(),secret:'CANARY-NEVER-PRINT'})});
  assert.equal(invalid.status,2);assert.equal(invalid.stdout,'');assert.ok(!invalid.stderr.includes('CANARY-NEVER-PRINT'));
  const huge=spawnSync(process.execPath,[file],{encoding:'utf8',input:' '.repeat(65537)});
  assert.equal(huge.status,2);assert.equal(huge.stdout,'');
  const unknownSha=spawnSync(process.execPath,[file,'--plan'],{encoding:'utf8',input:JSON.stringify(fixture())});
  assert.equal(unknownSha.status,2);assert.equal(unknownSha.stdout,'');
  const example=JSON.parse(execFileSync(process.execPath,[file,'--example'],{encoding:'utf8'}));
  assert.equal(example.estimate.kind,'SYNTHETIC');
});
