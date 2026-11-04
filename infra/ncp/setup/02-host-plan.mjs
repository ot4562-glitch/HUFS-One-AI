/** #192 phase 02: generate an exact HOST Terraform input; NEVER create NCP resources. */
import {z} from 'zod';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const Ref=z.string().regex(/^[0-9]{4,20}$/);
const Sha40=z.string().regex(/^[0-9a-f]{40}$/).refine(x=>!/^0+$/.test(x));
const Sha64=z.string().regex(/^[0-9a-f]{64}$/).refine(x=>!/^0+$/.test(x));
const Schema=z.strictObject({
  network:z.strictObject({
    mode:z.literal('SSH_SYNTHETIC_PREVIEW_ONLY'),
    source_sha:Sha40,config_sha256:Sha64,
    subnet_no:Ref,access_control_group_no:Ref,
  }),
  server:z.strictObject({
    ubuntuImageNo:Ref,
    serverSpecCode:z.string().regex(/^[a-zA-Z0-9._-]{3,40}$/),
    existingLoginKeyName:z.string().regex(/^[a-zA-Z0-9._-]{3,40}$/),
    estimatedHourlyKrw:z.number().int().min(1).max(1000000),
    approvedBudgetKrw:z.number().int().min(1).max(10000000),
    approvedHours:z.number().int().min(1).max(744),
  }),
});
const canonical=value=>value&&typeof value==='object'
  ?(Array.isArray(value)?value.map(canonical)
    :Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])))
  :value;
const sha=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

export function createHostBundle(raw){
  const input=Schema.parse(raw),{network,server}=input;
  if(server.estimatedHourlyKrw*server.approvedHours>server.approvedBudgetKrw)
    throw new Error('Approved budget is below estimated cost');
  if(network.subnet_no===network.access_control_group_no)
    throw new Error('Network identifiers must be independently inspected');
  const request={
    scope:'SSH_PREVIEW_HOST_ONLY_V1',project:'hufs-one-ai',
    source_sha:network.source_sha,network_config_sha256:network.config_sha256,
    subnet_no:network.subnet_no,
    access_control_group_no:network.access_control_group_no,
    ubuntu_image_no:server.ubuntuImageNo,server_spec_code:server.serverSpecCode,
    login_key_name:server.existingLoginKeyName,
    estimated_hourly_krw:server.estimatedHourlyKrw,
    approved_budget_krw:server.approvedBudgetKrw,
    approved_hours:server.approvedHours,
  };
  return {version:1,mode:'PLAN_ONLY',expected_approval_sha256:sha(request),
    tfvars:{request,operator_approved:false,operator_approval_reference:'',
      approved_config_sha256:''},
    pending:['NCP_CURRENT_CREDIT_AND_PRICE','NETWORK_STATE_IDS_AND_SOURCE_SHA',
      'UBUNTU_AMD64_IMAGE_AND_SKU','EXISTING_LOGIN_KEY_WITH_PRIVATE_OPERATOR',
      'MAIN_HEAD_INDEPENDENT_REVIEW','OWNER_ACCOUNT_AND_COST_APPROVAL',
      'HOST_BOOTSTRAP_AND_SECOND_SSH_SESSION','PRIVACY_AND_RELEASE_GATES'],
    release:'RELEASE_BLOCKED'};
}
async function main(){
  const args=process.argv.slice(2);
  if(args.length&&!(args.length===1&&args[0]==='--vars'))
    throw new Error('PLAN_ONLY');
  let bytes=0;const chunks=[];
  for await(const part of process.stdin){
    bytes+=part.length;if(bytes>65536)throw new Error('INPUT_LIMIT');
    chunks.push(part);
  }
  const plan=createHostBundle(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  process.stdout.write(JSON.stringify(args.length?plan.tfvars:plan,null,2)+'\n');
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)
  main().catch(()=>{process.stderr.write('NCP_HOST_PLAN_REFUSED: no cloud or host mutation.\n');process.exitCode=2;});
