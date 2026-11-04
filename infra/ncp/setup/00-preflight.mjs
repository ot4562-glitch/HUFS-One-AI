/** #192 phase 00 only: no cloud/SSH/installation/apply/delete capabilities. */
import {z} from 'zod';
import {BlockList,isIP} from 'node:net';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const Cidr=z.string().min(9).max(18),Money=z.string().regex(/^(?:0|[1-9]\d{0,5})(?:\.\d{1,3})?$/);
const Schema=z.strictObject({version:z.literal(1),project:z.literal('hufs-one-ai'),region:z.literal('KR'),
  zone:z.enum(['KR-1','KR-2']),sourceSha:z.string().regex(/^[a-f0-9]{40}$/),
  network:z.strictObject({vpcCidr:Cidr,subnetCidr:Cidr,existingCidrs:z.array(Cidr).max(128),
    adminPublicCidr:Cidr,publicIp:z.boolean()}),
  server:z.strictObject({os:z.enum(['ubuntu-24.04-amd64','ubuntu-22.04-amd64']),
    productCode:z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),storageGb:z.number().int().min(50).max(200)}),
  estimate:z.strictObject({kind:z.enum(['SYNTHETIC','OPERATOR_QUOTE']),observedAt:z.iso.datetime({offset:true}),
    hours:z.number().int().min(1).max(816),serverHourlyKrw:Money,storageGbHourlyKrw:Money,
    publicIpHourlyKrw:Money,additionalKrw:z.number().int().min(0).max(100_000_000),
    vatPercent:z.union([z.literal(0),z.literal(10)]),budgetKrw:z.number().int().min(1).max(100_000_000),
    sourceUrl:z.url().refine(value=>{const u=new URL(value);return u.protocol==='https:'
      &&(u.hostname==='ncloud.com'||u.hostname.endsWith('.ncloud.com'))&&!u.username&&!u.password&&!u.search&&!u.hash;})})});
const reserved=new BlockList();
for(const [ip,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],
  ['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],
  ['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3]])
  reserved.addSubnet(ip,bits,'ipv4');
const privateRanges=[['10.0.0.0',8],['172.16.0.0',12],['192.168.0.0',16]];
function cidr(value){
  const [address,bits,...extra]=value.split('/'),prefix=Number(bits);
  if(extra.length||isIP(address)!==4||!/^\d{1,2}$/.test(bits??'')||prefix<1||prefix>32)throw Error('CIDR');
  const first=address.split('.').reduce((n,part)=>(n<<8n)+BigInt(part),0n),size=1n<<BigInt(32-prefix);
  if(first%size!==0n)throw Error('CIDR_ALIGNMENT');
  return {address,prefix,first,last:first+size-1n};
}
const contains=(a,b)=>a.first<=b.first&&a.last>=b.last;
const overlaps=(a,b)=>a.first<=b.last&&b.first<=a.last;
const milli=value=>{const [whole,fraction='']=value.split('.');return BigInt(whole)*1000n+BigInt(fraction.padEnd(3,'0'));};
const canonical=value=>value&&typeof value==='object'?(Array.isArray(value)?value.map(canonical)
  :Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]))):value;

export function createSetupPlan(input){
  const c=Schema.parse(input),vpc=cidr(c.network.vpcCidr),subnet=cidr(c.network.subnetCidr),admin=cidr(c.network.adminPublicCidr);
  if(vpc.prefix<16||vpc.prefix>28||!privateRanges.some(([ip,bits])=>contains(cidr(`${ip}/${bits}`),vpc))
    ||subnet.prefix<24||subnet.prefix>28||!contains(vpc,subnet))throw Error('PRIVATE_NETWORK_BOUNDARY');
  if(c.network.existingCidrs.some(value=>overlaps(vpc,cidr(value))))throw Error('EXISTING_NETWORK_OVERLAP');
  if(admin.prefix!==32||reserved.check(admin.address,'ipv4'))throw Error('PUBLIC_ADMIN_32_REQUIRED');
  const beforeTax=BigInt(c.estimate.hours)*(milli(c.estimate.serverHourlyKrw)
    +BigInt(c.server.storageGb)*milli(c.estimate.storageGbHourlyKrw)
    +(c.network.publicIp?milli(c.estimate.publicIpHourlyKrw):0n))+BigInt(c.estimate.additionalKrw)*1000n;
  const total=(beforeTax*BigInt(100+c.estimate.vatPercent)+99_999n)/100_000n;
  if(total>BigInt(c.estimate.budgetKrw))throw Error('ESTIMATE_OVER_BUDGET');
  const planSha256=createHash('sha256').update(JSON.stringify(canonical(c))).digest('hex');
  const gates=['USER_SPEND_AND_HOST_APPROVAL','SKU_QUOTA_ACCOUNT_AND_CURRENT_PRICE_NOT_VERIFIED',
    'NETWORK_ACG_NACL_RETURN_PATH_NOT_VERIFIED','REMOTE_HEAD_CI_NONAUTHOR_APPROVAL_NOT_VERIFIED',
    'PRIVACY_46_AND_RELEASE_89_BLOCKED','HOST_FINGERPRINT_AND_SECOND_SSH_SESSION_REQUIRED'];
  if(!c.network.publicIp)gates.push('APPROVED_BASTION_OR_VPN_REQUIRED');
  return {version:1,mode:'PLAN_ONLY',release:'RELEASE_BLOCKED',planSha256,estimatedKrw:String(total),
    pricing:{...c.estimate,warning:'Estimate only; no billing hard-stop, current quote, credit eligibility or unlisted charges proven.'},
    source:{sha:c.sourceSha,localMainAncestry:'NOT_VERIFIED',remoteCurrentness:'NOT_VERIFIED'},
    resources:{vpc:{cidr:c.network.vpcCidr,region:c.region},subnet:{cidr:c.network.subnetCidr,zone:c.zone},
      server:{count:1,...c.server},publicIp:{count:c.network.publicIp?1:0,holdingCostAppliesWhenUnassigned:true}},
    network:{inbound:[{protocol:'TCP',port:22,source:c.network.adminPublicCidr}],
      blockedPublicPorts:[80,443,3000,5173,5432,6379,9229],returnTraffic:'ACG stateful; NACL return ports require operator verification'},
    agentOnApplicationHost:false,gates,
    steps:[
      {id:'00-preflight',state:'PLAN_READY',command:['node','infra/ncp/setup/00-preflight.mjs']},
      {id:'01-provision',state:'CODE_AND_OPERATOR_APPROVAL_PENDING',manual:'infra/ncp/README.md#1'},
      {id:'02-bootstrap',state:'EXISTING_CODE_APPROVAL_REQUIRED',command:['sudo','bash','bootstrap-ubuntu.sh',
        '--admin-public-key','/root/hufs-admin.pub','--admin-ip',c.network.adminPublicCidr,'--ack-acg-ready']},
      {id:'03-deploy-preview',state:'EXISTING_PLAN_ONLY_WRAPPER',command:['powershell','-File','infra/ncp/Deploy-NcpPreview.ps1','-Ref',c.sourceSha]},
      {id:'04-verify',state:'HOST_APPROVAL_REQUIRED',checks:['systemd active','loopback-only 5173','SSH tunnel','no public app/DB ports','no real data/providers']},
      {id:'05-rollback',state:'EXISTING_AUTO_ROLLBACK_MANUAL_TOOL_PENDING',manual:'infra/ncp/deploy-preview.sh'},
      {id:'06-teardown',state:'RESOURCE_ID_PINNED_OPERATOR_RECEIPT_REQUIRED',manual:'infra/ncp/OPERATIONS_HANDOFF_TEMPLATE.md'}]};
}

const example=()=>({version:1,project:'hufs-one-ai',region:'KR',zone:'KR-1',sourceSha:'0'.repeat(40),
  network:{vpcCidr:'10.27.0.0/16',subnetCidr:'10.27.10.0/24',existingCidrs:[],adminPublicCidr:'93.184.216.34/32',publicIp:true},
  server:{os:'ubuntu-24.04-amd64',productCode:'SYNTHETIC-REPLACE-WITH-OPERATOR-VERIFIED-SKU',storageGb:50},
  estimate:{kind:'SYNTHETIC',observedAt:'2026-11-04T00:00:00.000Z',hours:1,serverHourlyKrw:'1',storageGbHourlyKrw:'0.01',
    publicIpHourlyKrw:'0.5',additionalKrw:0,vatPercent:10,budgetKrw:100,sourceUrl:'https://www.ncloud.com/charge/region/ko'}});
async function main(){
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--example'){process.stdout.write(JSON.stringify(example(),null,2)+'\n');return;}
  if(args.length&&!(args.length===1&&args[0]==='--plan'))throw Error('PLAN_ONLY');
  const chunks=[];let size=0;
  for await(const chunk of process.stdin){size+=chunk.length;if(size>65536)throw Error('INPUT_LIMIT');chunks.push(chunk);}
  const plan=createSetupPlan(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  const cwd=fileURLToPath(new URL('../../../',import.meta.url));
  // Read commit/ref metadata only. No fetch, archive, checkout, package or source-body reads.
  const git=(...params)=>execFileSync('git',params,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:4096});
  git('cat-file','-e',plan.source.sha+'^{commit}');
  git('merge-base','--is-ancestor',plan.source.sha,'refs/remotes/origin/main');
  plan.source.localMainAncestry='VERIFIED_CACHED_REF_ONLY';
  plan.source.cachedMainSha=git('rev-parse','refs/remotes/origin/main').trim();
  process.stdout.write(JSON.stringify(plan,null,2)+'\n');
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)
  main().catch(()=>{process.stderr.write('NCP_PLAN_REFUSED: invalid/oversized configuration, network/budget boundary or unverified local main SHA. No mutation performed.\n');process.exitCode=2;});
