import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createNetworkBundle} from '../../infra/ncp/setup/01-network-plan.mjs';
const fixture=()=>({preview:{version:1,project:'hufs-one-ai',region:'KR',zone:'KR-1',sourceSha:'a'.repeat(40),
  network:{vpcCidr:'10.27.0.0/16',subnetCidr:'10.27.10.0/24',existingCidrs:[],adminPublicCidr:'93.184.216.34/32',publicIp:true},
  server:{os:'ubuntu-24.04-amd64',productCode:'SYNTHETIC-SKU',storageGb:50},
  estimate:{kind:'SYNTHETIC',observedAt:'2026-11-04T00:00:00.000Z',hours:1,serverHourlyKrw:'1',storageGbHourlyKrw:'0.01',
    publicIpHourlyKrw:'0.5',additionalKrw:0,vatPercent:10,budgetKrw:100,sourceUrl:'https://www.ncloud.com/charge/region/ko'}},
  dnsResolverCidr:'9.9.9.9/32',serverEphemeral:{min:32768,max:60999},clientEphemeral:{min:49152,max:65535}});

test('produces an approval-OFF network-only bundle bound to the preflight and resolver',()=>{
  const input=fixture(),bundle=createNetworkBundle(input);
  assert.equal(bundle.mode,'PLAN_ONLY');assert.equal(bundle.tfvars.operator_approved,false);
  assert.equal(bundle.tfvars.approved_config_sha256,'');assert.equal(bundle.tfvars.request.scope,'NETWORK_ONLY_V1');
  assert.equal(bundle.tfvars.request.admin_cidr,'93.184.216.34/32');
  assert.equal(bundle.tfvars.request.source_sha,'a'.repeat(40));
  assert.match(bundle.expected_approval_sha256,/^[a-f0-9]{64}$/);
  assert.deepEqual(bundle.tfvars.request,JSON.parse(readFileSync(new URL('../../infra/ncp/terraform/network/tests/synthetic-request.json',import.meta.url),'utf8')));
  input.dnsResolverCidr='8.8.8.8/32';
  assert.notEqual(createNetworkBundle(input).expected_approval_sha256,bundle.expected_approval_sha256);
});

test('rejects missing approval inputs, hidden ports/credentials, broad DNS and low return ranges',()=>{
  for(const change of [c=>{c.preview.network.adminPublicCidr='0.0.0.0/0';},c=>{c.dnsResolverCidr='0.0.0.0/0';},
    c=>{c.serverEphemeral.min=5432;},c=>{c.clientEphemeral.max=70000;},c=>{c.serverEphemeral.max=32000;},
    c=>{c.preview.sourceSha='0'.repeat(40);},c=>{c.approved=true;},c=>{c.publicPorts=[80,443];},
    c=>{c.secret='DO-NOT-ACCEPT';},c=>{c.preview.network.publicIp=false;}]){
    const config=fixture();change(config);assert.throws(()=>createNetworkBundle(config));
  }
});
