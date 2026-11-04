/** Offline request compiler only. Terraform/account/host operations are absent. */
import {z} from 'zod';
import {isIP} from 'node:net';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createSetupPlan} from './00-preflight.mjs';
const Range=z.strictObject({min:z.number().int().min(32768).max(65535),
  max:z.number().int().min(32768).max(65535)}).refine(v=>v.min<=v.max);
const Schema=z.strictObject({preview:z.unknown(),dnsResolverCidr:z.string().max(18).refine(value=>{
  const parts=value.split('/');return parts.length===2&&parts[1]==='32'&&isIP(parts[0])===4&&parts[0]!=='0.0.0.0';}),
  serverEphemeral:Range,clientEphemeral:Range});
const canonical=value=>value&&typeof value==='object'?(Array.isArray(value)?value.map(canonical)
  :Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]))):value;
export function createNetworkBundle(input){
  const value=Schema.parse(input),plan=createSetupPlan(value.preview);
  if(!plan.resources.publicIp.count||/^0+$/.test(plan.source.sha))throw Error('Public SSH preview profile and selected source SHA required');
  const request={scope:'NETWORK_ONLY_V1',project:'hufs-one-ai',prefix:'hufs-preview',
    source_sha:plan.source.sha,preflight_plan_sha256:plan.planSha256,zone:plan.resources.subnet.zone,
    vpc_cidr:plan.resources.vpc.cidr,subnet_cidr:plan.resources.subnet.cidr,admin_cidr:plan.network.inbound[0].source,
    dns_cidr:value.dnsResolverCidr,server_ephemeral_min:value.serverEphemeral.min,server_ephemeral_max:value.serverEphemeral.max,
    client_ephemeral_min:value.clientEphemeral.min,client_ephemeral_max:value.clientEphemeral.max};
  return {version:1,mode:'PLAN_ONLY',sourceVerification:'NOT_VERIFIED',expected_approval_sha256:
    createHash('sha256').update(JSON.stringify(canonical(request))).digest('hex'),
    tfvars:{request,operator_approved:false,operator_approval_reference:'',approved_config_sha256:''},
    pending:['OWNER_ACCOUNT_AND_SPEND_APPROVAL','ACTUAL_DNS_AND_EPHEMERAL_RANGES','CURRENT_SOURCE_CI_AND_NONAUTHOR_REVIEW',
      'SERVER_NIC_PUBLIC_IP_NEXT_SLICE','PRIVATE_VPN_PROFILE_NOT_SUPPORTED'],release:'RELEASE_BLOCKED'};
}
async function main(){
  const args=process.argv.slice(2);if(args.length&&!(args.length===1&&args[0]==='--vars'))throw Error('PLAN_ONLY');
  let size=0;const chunks=[];
  for await(const chunk of process.stdin){size+=chunk.length;if(size>65536)throw Error('INPUT_LIMIT');chunks.push(chunk);}
  const bundle=createNetworkBundle(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  process.stdout.write(JSON.stringify(args.length?bundle.tfvars:bundle,null,2)+'\n');
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)
  main().catch(()=>{process.stderr.write('NCP_NETWORK_PLAN_REFUSED: inspect bounded non-secret configuration. No mutation performed.\n');process.exitCode=2;});
