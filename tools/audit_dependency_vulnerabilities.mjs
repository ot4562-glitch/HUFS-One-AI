/**
 * #378 — read-only npm advisory scan, not a dependency install/update.
 * This process never prints advisory titles, registry URLs, credentials,
 * lockfile contents or student data. Missing advisory data is NOT a pass.
 */
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const SEVERITIES=['info','low','moderate','high','critical'];

/** @returns {{info:number,low:number,moderate:number,high:number,critical:number,total:number}} */
export function parseAuditReport(stdout,exitCode){
  if(exitCode!==0&&exitCode!==1)throw new Error('SCAN_UNAVAILABLE');
  let data;
  try{data=JSON.parse(stdout);}catch{throw new Error('SCAN_UNAVAILABLE');}
  if(!data||typeof data!=='object'||data.error||
    !data.metadata||!data.metadata.vulnerabilities)throw new Error('SCAN_UNAVAILABLE');
  const raw=data.metadata.vulnerabilities;
  const counts={};
  for(const key of SEVERITIES){
    const n=raw[key];
    if(!Number.isSafeInteger(n)||n<0)throw new Error('SCAN_UNAVAILABLE');
    counts[key]=n;
  }
  counts.total=SEVERITIES.reduce((sum,k)=>sum+counts[k],0);
  if(raw.total!==undefined && raw.total!==counts.total)throw new Error('SCAN_UNAVAILABLE');
  // An exit-0 response with vulnerable packages might be a filtered npm report,
  // so still inspect the count; the caller applies policy independently.
  return counts;
}

export function classifyAudit(runtime,all){
  for(const name of SEVERITIES){
    if(runtime[name]>all[name])throw new Error('SCAN_UNAVAILABLE');
  }
  const devOnly={};
  for(const name of SEVERITIES)devOnly[name]=all[name]-runtime[name];
  return {runtime,devOnly,all,
    blocked:all.critical>0||all.high>0};
}

function scan(args){
  const npm=process.platform==='win32'?'npm.cmd':'npm';
  const result=spawnSync(npm,['audit','--json','--audit-level=low',...args],{
    cwd:process.cwd(),encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024,
    env:{...process.env,npm_config_ignore_scripts:'true'},
  });
  if(result.error||result.signal)return (()=>{throw new Error('SCAN_UNAVAILABLE');})();
  return parseAuditReport(result.stdout,result.status);
}
function countLine(label,counts){
  return label+': critical='+counts.critical+', high='+counts.high+
    ', moderate='+counts.moderate+', low='+counts.low+', info='+counts.info;
}
export function runAudit(){
  // Do not call npm install/ci/fix; npm audit reads the committed lockfile.
  const runtime=scan(['--omit=dev']);
  const all=scan([]);
  const result=classifyAudit(runtime,all);
  console.log(countLine('RUNTIME',result.runtime));
  console.log(countLine('DEV_ONLY',result.devOnly));
  if(result.blocked){
    console.error('AUDIT_BLOCKED: high/critical advisories detected; review privately and pin an approved fix.');
    process.exitCode=1;
  }else{
    console.log('AUDIT_PASS: high/critical advisory count is zero for the checked lockfile.');
  }
}
const directlyExecuted=process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href===import.meta.url;
if(directlyExecuted){
  try{runAudit();}
  catch{
    console.error('SCAN_UNAVAILABLE: registry, lockfile or audit response could not be verified.');
    process.exitCode=2;
  }
}
