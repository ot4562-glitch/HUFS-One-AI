import {posix} from 'node:path';
import type {IntakeIssue} from '@hufs-one/contracts';
import type {DataPoolSettings,ManagedDataPool} from '../db/pg-pool.js';
import {ApiFailure} from '../modules/auth/gates.js';
import {PostgresRestrictedIntakeImport} from '../modules/academics/intake-postgres.js';
import type {
  IntakeOperatorAuthority,IntakePreview,RestrictedIntakeInput,
} from '../modules/academics/intake-postgres.js';

/** Linux private factory path; reject nested directories before filesystem IO.
 * Every permitted parent is checked by the executable loader before import.
 */
export function privateIntakeConfigPath(name:unknown):string {
  if(typeof name!=='string'||name.length>512||!name.endsWith('.mjs')
    ||!posix.isAbsolute(name)||posix.dirname(name)!=='/etc/hufs-one/private'
    ||posix.normalize(name)!==name||name.includes('\\')||name.includes('\0'))
    throw new Error('Private intake factory path refused');
  return name;
}

export interface RestrictedIntakeConfig {
  /** Supplied only by the separately provisioned private operator factory. */
  input:RestrictedIntakeInput;
  authority:IntakeOperatorAuthority;
  database?:DataPoolSettings;
}
export interface RestrictedIntakeDependencies {
  loadConfig():Promise<RestrictedIntakeConfig>;
  createPool(settings:DataPoolSettings):ManagedDataPool;
  now?:()=>string;
}
type Command={operation:'PLAN'}|{operation:'PREVIEW'}|{
  operation:'APPLY';previewHash:string;expectedVersions:Readonly<Record<string,number>>;
};

function parseCommand(argv:readonly string[]):Command {
  if(argv.length===1&&argv[0]==='--plan')return {operation:'PLAN'};
  if(argv.length===1&&argv[0]==='--preview')return {operation:'PREVIEW'};
  if(argv.length!==11||argv[0]!=='--apply'||argv[1]!=='--preview-hash'
    ||!argv.every(value=>typeof value==='string'&&value.length<=128)
    ||!(/^[a-f0-9]{64}$/).test(argv[2]!))throw new ApiFailure('INVALID_INPUT');
  const entries=new Map<string,number>();
  for(let i=3;i<argv.length;i+=2){
    if(argv[i]!=='--expected-version')throw new ApiFailure('INVALID_INPUT');
    const match=/^([A-Za-z0-9_-]{2,64})=(0|[1-9][0-9]{0,15})$/.exec(argv[i+1]!);
    const subject=match?.[1],version=Number(match?.[2]);
    if(!subject||entries.has(subject)||!Number.isSafeInteger(version)
      ||version<0||version>=Number.MAX_SAFE_INTEGER)throw new ApiFailure('INVALID_INPUT');
    entries.set(subject,version);
  }
  return {operation:'APPLY',previewHash:argv[2]!,expectedVersions:Object.fromEntries(entries)};
}

function refusePublicRuntime():void {
  // This private command is not an alternate production API entrypoint.
  const allowed=new Set(['local','test','development','synthetic']);
  for(const name of ['APP_ENV','NODE_ENV']){
    const value=process.env[name];
    if(value!==undefined&&!allowed.has(value))throw new Error('Private intake runtime required');
  }
}

function aggregatePreview(preview:IntakePreview){
  const counts=new Map<IntakeIssue['code'],number>();
  for(const issue of preview.issues)counts.set(issue.code,(counts.get(issue.code)??0)+1);
  const creditChecks={MATCH:0,MISMATCH:0,UNKNOWN:0};
  for(const value of Object.values(preview.creditCheckBySubject))creditChecks[value]++;
  return {
    operation:'PREVIEW' as const,ready:preview.ready,previewHash:preview.previewHash,
    formRowCount:preview.formRowCount,courseFileCount:Object.keys(preview.courseRowCounts).length,
    courseRowCount:Object.values(preview.courseRowCounts).reduce((sum,count)=>sum+count,0),
    issueCounts:[...counts].sort(([a],[b])=>a.localeCompare(b))
      .map(([code,count])=>({code,count})),
    creditChecks,nextState:preview.nextState,
  };
}

/** No discovery, HTTP upload, migration, external model call or readiness promotion.
 * The only source of raw inputs is the private, trusted config factory.
 */
export async function runRestrictedIntakeCommand(
  argv:readonly string[],dependencies:RestrictedIntakeDependencies,
){
  const command=parseCommand(argv);
  if(command.operation==='PLAN')return {
    operation:'PLAN' as const,release:'RELEASE_BLOCKED' as const,
    sourceRead:false as const,databaseWrite:false as const,
  };
  refusePublicRuntime();
  const config=await dependencies.loadConfig();
  if(!config||!config.input||typeof config.authority?.mayProcess!=='function')
    throw new Error('Explicit private intake input and authority required');
  // Freeze the command's inputs against mutation by an awaiting adapter.
  // This copy remains private process memory and is never included in output.
  const input=structuredClone(config.input);
  const authority=config.authority;
  if(command.operation==='PREVIEW'){
    const disconnected={connect:async()=>{throw new Error('Preview cannot connect to a database');}};
    return aggregatePreview(await new PostgresRestrictedIntakeImport(
      disconnected,authority,dependencies.now,
    ).preview(input));
  }
  if(!config.database||config.database.environment!=='production')
    throw new Error('Dedicated restricted TLS PostgreSQL settings required');
  const settings=structuredClone(config.database);
  let managed:ManagedDataPool|undefined;
  const lazyPool={connect:async()=>{
    managed??=dependencies.createPool(settings);
    return managed.connect();
  }};
  try{
    const result=await new PostgresRestrictedIntakeImport(
      lazyPool,authority,dependencies.now,
    ).apply(input,{previewHash:command.previewHash,expectedVersions:command.expectedVersions});
    const reusedCount=result.applied.filter(value=>value.reused).length;
    return {
      operation:'APPLY' as const,previewHash:result.previewHash,
      participantCount:result.applied.length,
      newRevisionCount:result.applied.length-reusedCount,reusedCount,
      nextState:result.nextState,
    };
  }finally{
    await managed?.close();
  }
}

/** Do not echo errors from private file, authority, driver or shutdown adapters.
 * A failed command can have an unknown commit result; do not promise rollback.
 */
export async function runRestrictedIntakeCli(
  argv:readonly string[],dependencies:RestrictedIntakeDependencies,
  output:{stdout(value:string):unknown;stderr(value:string):unknown},
):Promise<number>{
  try{
    const result=await runRestrictedIntakeCommand(argv,dependencies);
    output.stdout(JSON.stringify(result)+'\n');
    return 0;
  }catch{
    output.stderr('INTAKE_COMMAND_REFUSED_OR_UNCONFIRMED\n');
    return 1;
  }
}
