import {createPostgresDataPool} from './db/pg-pool.js';
import type {DataPoolSettings,ManagedDataPool} from './db/pg-pool.js';
import {createPostgresApplication} from './application-postgres.js';
import type {PostgresApplicationConfig} from './application-postgres.js';
import type {PostgresGoogleAuthConfig} from './auth-postgres.js';
import type {PostgresPlatformConfig} from './platform-postgres.js';
import type {ReviewerDemoRepository} from './modules/auth/reviewer.js';
import type {SchoolMailSender} from './modules/auth/school-mail-proof.js';
import {createOperatorSchoolMailProof} from './operator-mail-proof.js';
import {createTrustedProxyPolicy} from './modules/auth/trusted-proxy.js';
import type {ApiOptions} from './types.js';
import type {RuntimeMode} from './runtime-policy.js';
import {MANAGED_PLATFORM_EXTENSIONS,extensionSettings,bindManagedExtensions,assertManagedExtensions} from './operator-extensions.js';
import type {OperatorExtensions} from './operator-extensions.js';
import {createPostgresProviderRuntime} from './modules/ai/provider-postgres.js';
import type {PostgresProviderConfig} from './modules/ai/provider-postgres.js';

/** Current operator assembly. Project authorization is owner-confirmed; each
 * actual SQL role, identity adapter and listener is still configured explicitly.
 * Construction has no socket, migration, provider call or filesystem side effect. */
export const REQUIRED_SQL_ROLES=[
  'sessions','admission','attempts','projections','calendar','personal','evidence',
] as const;
export type OperatorSqlRole=typeof REQUIRED_SQL_ROLES[number];
export type OperatorSqlSettings=Readonly<Record<OperatorSqlRole,DataPoolSettings>>;
export type OperatorSqlPools=Readonly<Record<OperatorSqlRole,ManagedDataPool>>;
export const EXTRA_SQL_ROLES=[
  'reviewerInvitations','reviewerSandbox','mailChallenges','mailProofUpdates',
  'demoProfile','demoProfileQuota','adminUsage','aiAuthority','aiBudget','aiResults',...MANAGED_PLATFORM_EXTENSIONS,
] as const;
type ExtraSqlRole=typeof EXTRA_SQL_ROLES[number];
export type OperatorManagedAi=Omit<PostgresProviderConfig,'pools'|'operation'>&{
  operation:'HCX_005'|'HCX_007';
  roles:Readonly<Record<'authority'|'budget'|'results',DataPoolSettings>>;
};
type ExtraSqlPools=Partial<Record<ExtraSqlRole,ManagedDataPool>>;

export interface OperatorPostgresInputs {
  runtime?:RuntimeMode;
  trustedProxyAddresses?:readonly string[];
  roles:OperatorSqlSettings;
  google:PostgresGoogleAuthConfig['google'];
  attemptDigestKey:Buffer;
  evidenceRights:PostgresPlatformConfig['evidenceRights'];
  /** Non-SQL options only. Pool-bearing services use extensions below. */
  platform?:Omit<PostgresPlatformConfig,'pools'|'evidenceRights'|'reviewerSandbox'|'adminUsage'>;
  extensions?:OperatorExtensions;
  /** @deprecated Raw prebuilt provider runtimes are refused: no trusted SQL role proof. */
  ai?:PostgresApplicationConfig['ai'];
  managedAi?:OperatorManagedAi;
  reviewer?:{invitations:DataPoolSettings;sandbox:DataPoolSettings;demo:ReviewerDemoRepository};
  schoolMail?:{challenges:DataPoolSettings;proofUpdates:DataPoolSettings;digestKey:Buffer;sender:SchoolMailSender};
  demo?:{profile:DataPoolSettings;quota:DataPoolSettings;digestKey:Buffer};
  adminUsage?:{settings:DataPoolSettings;authority:NonNullable<ApiOptions['adminAuthority']>};
}
export interface PreparedOperatorPostgres {
  readonly application:PostgresApplicationConfig;
  readonly pools:OperatorSqlPools;
  readonly extraPools?:ExtraSqlPools;
  /** Exact runtime and SQL pool identity bound before any network/listener work. */
  readonly managedAiBinding?:{
    readonly ai:NonNullable<PostgresApplicationConfig['ai']>;
    readonly pools:Readonly<Record<'authority'|'budget'|'results',ManagedDataPool>>;
  };
}
const LOOPBACK=new Set(['127.0.0.1','::1']);
const RAW_PLATFORM_PORTS=[...MANAGED_PLATFORM_EXTENSIONS,'majorWhatIf','majorWhatIfPostgres','pools','reviewerSandbox','demoProfile','demoProfileQuota','adminUsage'] as const;
const own=(value:object,key:string)=>Object.prototype.hasOwnProperty.call(value,key);

export function prepareOperatorPostgres(input:OperatorPostgresInputs):PreparedOperatorPostgres{
  if(!input||!input.roles||typeof input.google?.exchangeCode!=='function'
    ||typeof input.evidenceRights?.resolveFor!=='function'
    ||!Buffer.isBuffer(input.attemptDigestKey)||input.attemptDigestKey.length<32)
    throw new Error('Explicit Google, evidence rights and server-owned digest key required');
  if(input.runtime!==undefined&&input.runtime!=='production')throw new Error('Unknown runtime configuration');
  if(input.runtime==='production'&&!input.schoolMail)
    throw new Error('Production requires a configured school-mail verifier');
  if(input.trustedProxyAddresses!==undefined)createTrustedProxyPolicy(input.trustedProxyAddresses);
  if(input.schoolMail&&!input.reviewer)throw new Error('School-mail proof requires a separate REVIEWER sandbox');
  if(input.schoolMail&&(!Buffer.isBuffer(input.schoolMail.digestKey)
    ||input.schoolMail.digestKey.length<32||input.schoolMail.digestKey.equals(input.attemptDigestKey)
    ||typeof input.schoolMail.sender?.send!=='function'))
    throw new Error('School-mail proof requires independent approved runtime settings');
  if(input.reviewer&&(typeof input.reviewer.demo?.listProfiles!=='function'||typeof input.reviewer.demo?.readSnapshot!=='function'))
    throw new Error('An explicit synthetic-only reviewer repository is required');
  if(input.adminUsage&&(typeof input.adminUsage.authority?.isApproved!=='function'||!input.adminUsage.settings))
    throw new Error('Admin usage requires independent operator policy and SQL role');
  if(input.demo&&(!Buffer.isBuffer(input.demo.digestKey)||input.demo.digestKey.length<32
    ||input.demo.digestKey.equals(input.attemptDigestKey)))
    throw new Error('Demo profile quota needs an independent digest key');
  if(input.ai)throw new Error('AI provider must use managed SQL authority, budget and results roles');
  if(input.managedAi){
    const value=input.managedAi;
    if(!['HCX_005','HCX_007'].includes(value.operation)||!value.roles
      ||Object.keys(value.roles).sort().join(',')!=='authority,budget,results'
      ||typeof value.sessionIsCurrent!=='function'||typeof value.secret!=='function'
      ||(value.enabled!==undefined&&typeof value.enabled!=='function')
      ||(value.liveApproved!==undefined&&typeof value.liveApproved!=='function'))
      throw new Error('Managed AI requires input authority, budget, results and trusted provider controls');
  }
  if(input.platform&&RAW_PLATFORM_PORTS.some(key=>own(input.platform!,key)))
    throw new Error('Operator platform SQL pools must use verified role settings');
  const managed=extensionSettings(input.extensions);
  const extraSettings:Partial<Record<ExtraSqlRole,DataPoolSettings>>={
    ...managed,
    ...(input.reviewer?{reviewerInvitations:input.reviewer.invitations,reviewerSandbox:input.reviewer.sandbox}:{}),
    ...(input.schoolMail?{mailChallenges:input.schoolMail.challenges,mailProofUpdates:input.schoolMail.proofUpdates}:{}),
    ...(input.demo?{demoProfile:input.demo.profile,demoProfileQuota:input.demo.quota}:{}),
    ...(input.adminUsage?{adminUsage:input.adminUsage.settings}:{}),
    ...(input.managedAi?{aiAuthority:input.managedAi.roles.authority,
      aiBudget:input.managedAi.roles.budget,aiResults:input.managedAi.roles.results}:{}),
  };
  const expectedRoles=new Set<string>(),endpoints=new Set<string>();
  for(const settings of [...REQUIRED_SQL_ROLES.map(role=>input.roles[role]),...Object.values(extraSettings)]){
    if(!settings||expectedRoles.has(settings.expectedRole)||endpoints.has(settings.connectionString)
      ||settings.environment!=='production')
      throw new Error('Seven independently restricted production SQL LOGIN roles and isolated extensions required');
    expectedRoles.add(settings.expectedRole);endpoints.add(settings.connectionString);
  }
  const roles={} as Record<OperatorSqlRole,ManagedDataPool>,extraPools:ExtraSqlPools={};
  try{
    for(const role of REQUIRED_SQL_ROLES)roles[role]=createPostgresDataPool(input.roles[role]);
    for(const role of EXTRA_SQL_ROLES){
      const settings=extraSettings[role];if(settings)extraPools[role]=createPostgresDataPool(settings);
    }
    const {sessions,admission,attempts,projections,calendar,personal,evidence}=roles;
    const aiPools=input.managedAi?{
      authority:extraPools.aiAuthority!,budget:extraPools.aiBudget!,results:extraPools.aiResults!,
    }:undefined;
    const provider=input.managedAi&&aiPools
      ?createPostgresProviderRuntime({...input.managedAi,pools:aiPools}):undefined;
    const ai:PostgresApplicationConfig['ai']=provider
      ?{runtime:{phaseId:provider.phaseId,operation:provider.operation,executor:provider.executor},
        inputs:provider.approvedInputs}:undefined;
    const application:PostgresApplicationConfig={
      ...(input.runtime?{runtime:input.runtime}:{}),
      ...(ai?{ai}:{}),
      ...(input.trustedProxyAddresses!==undefined?{trustedProxyAddresses:[...input.trustedProxyAddresses]}:{}),
      auth:{pools:{sessions,admission,attempts},attemptDigestKey:Buffer.from(input.attemptDigestKey),google:input.google},
      platform:{...input.platform,...bindManagedExtensions(input.extensions,extraPools),
        pools:{projections,calendar,personal,evidence},evidenceRights:input.evidenceRights,
        ...(extraPools.reviewerSandbox?{reviewerSandbox:extraPools.reviewerSandbox}:{}),
        ...(input.demo?{demoProfile:{pool:extraPools.demoProfile!},
          demoProfileQuota:{pool:extraPools.demoProfileQuota!,digestKey:Buffer.from(input.demo.digestKey)}}:{}),
        ...(input.adminUsage?{adminUsage:{pool:extraPools.adminUsage!,authority:input.adminUsage.authority}}:{}),
      },
      ...(input.reviewer?{reviewer:{invitations:extraPools.reviewerInvitations!,demo:input.reviewer.demo}}:{}),
      ...(input.schoolMail?{schoolMailProof:createOperatorSchoolMailProof({
        pools:{challenges:extraPools.mailChallenges!,proofUpdates:extraPools.mailProofUpdates!,attempts},
        challengeDigestKey:input.schoolMail.digestKey,attemptDigestKey:input.attemptDigestKey,
        sender:input.schoolMail.sender,...(input.google.now?{now:input.google.now}:{}),
      })}:{}),
    };
    return {application,pools:roles,...(Object.keys(extraPools).length?{extraPools}:{}),
      ...(ai&&aiPools?{managedAiBinding:{ai,pools:aiPools}}:{})};
  }catch{
    void Promise.allSettled([...Object.values(roles),...Object.values(extraPools)].map(pool=>pool.close()));
    throw new Error('Operator SQL pool configuration refused');
  }
}

export interface OperatorServer {readonly address:string;close():Promise<void>}

/** Verify all managed roles before listening. Public TLS belongs at the ingress;
 * direct database/API ports remain local. Authorization never disables RLS. */
export async function startOperatorPostgres(input:{
  prepared:PreparedOperatorPostgres;host:'127.0.0.1'|'::1';port:number;
}):Promise<OperatorServer>{
  const {prepared,host,port}=input;
  if(!LOOPBACK.has(host)||!Number.isSafeInteger(port)||(port!==0&&(port<1024||port>65535))
    ||(port===0&&process.env.NODE_ENV!=='test'))
    throw new Error('Operator API can only bind an approved loopback port');
  if(!prepared?.application||!prepared.pools
    ||!REQUIRED_SQL_ROLES.every(key=>typeof prepared.pools[key]?.connect==='function'&&typeof prepared.pools[key]?.close==='function'))
    throw new Error('Seven managed PostgreSQL pools required');
  const extra=prepared.extraPools??{},platform=prepared.application.platform;
  if(!platform||!prepared.application.auth?.pools)
    throw new Error('Operator platform SQL pools must use verified role settings');
  const extensions=assertManagedExtensions(platform,extra);
  if(Boolean(platform.demoProfile)!==Boolean(platform.demoProfileQuota)
    ||(platform.adminUsage&&(platform.adminUsage.pool!==extra.adminUsage||typeof platform.adminUsage.authority?.isApproved!=='function')))
    throw new Error('Operator platform SQL pools must use verified role settings');
  for(const role of ['sessions','admission','attempts'] as const)
    if(prepared.application.auth.pools[role]!==prepared.pools[role])
      throw new Error('Operator platform SQL pools must use verified role settings');
  for(const role of ['projections','calendar','personal','evidence'] as const)
    if(platform.pools?.[role]!==prepared.pools[role])
      throw new Error('Operator platform SQL pools must use verified role settings');
  if(Boolean(prepared.application.ai)!==Boolean(prepared.managedAiBinding)
    ||prepared.managedAiBinding&&(
      prepared.application.ai!==prepared.managedAiBinding.ai
      ||prepared.managedAiBinding.pools.authority!==extra.aiAuthority
      ||prepared.managedAiBinding.pools.budget!==extra.aiBudget
      ||prepared.managedAiBinding.pools.results!==extra.aiResults))
    throw new Error('AI provider must use managed SQL authority, budget and results roles');
  const requiredExtra:ExtraSqlRole[]=[...extensions,
    ...(prepared.application.ai?['aiAuthority','aiBudget','aiResults'] as const:[]),
    ...(prepared.application.reviewer?['reviewerInvitations','reviewerSandbox'] as const:[]),
    ...(prepared.application.schoolMailProof?['mailChallenges','mailProofUpdates'] as const:[]),
    ...(platform.demoProfile?['demoProfile','demoProfileQuota'] as const:[]),
    ...(platform.adminUsage?['adminUsage'] as const:[]),
  ];
  if(Object.keys(extra).length!==requiredExtra.length||requiredExtra.some(key=>!extra[key])
    ||Object.keys(extra).some(key=>!EXTRA_SQL_ROLES.includes(key as ExtraSqlRole))
    ||(prepared.application.reviewer&&(prepared.application.reviewer.invitations!==extra.reviewerInvitations
      ||platform.reviewerSandbox!==extra.reviewerSandbox))
    ||(platform.reviewerSandbox&&!prepared.application.reviewer)
    ||(platform.demoProfile&&platform.demoProfile.pool!==extra.demoProfile)
    ||(platform.demoProfileQuota&&platform.demoProfileQuota.pool!==extra.demoProfileQuota)
    ||(platform.adminUsage&&platform.adminUsage.pool!==extra.adminUsage))
    throw new Error('Operator extension pool roles are incomplete');
  const pools=[...REQUIRED_SQL_ROLES.map(key=>prepared.pools[key]),
    ...EXTRA_SQL_ROLES.flatMap(key=>extra[key]?[extra[key]!]:[])];
  if(pools.some(pool=>typeof pool?.connect!=='function'||typeof pool.close!=='function')||new Set(pools).size!==pools.length)
    throw new Error('Operator SQL pools must be independent and managed');
  let app:ReturnType<typeof createPostgresApplication>|undefined,closed=false;
  const closePools=async()=>{
    const finished=await Promise.allSettled([...pools].reverse().map(pool=>pool.close()));
    if(finished.some(x=>x.status==='rejected'))throw new Error('Operator SQL pool shutdown incomplete');
  };
  try{
    // Build the authenticated app before connecting so invalid runtime options
    // cannot cause network side effects. Listening still follows every SQL check.
    app=createPostgresApplication(prepared.application);
    for(const pool of pools){
      const connection=await pool.connect();
      try{
        const result=await connection.query('SELECT 1 AS ready');
        if(result.rows.length!==1||Number(result.rows[0]?.ready)!==1)throw new Error('Database readiness check refused');
      }finally{connection.release();}
    }
    const address=await app.listen({host,port});
    return {address,async close(){
      if(closed)return;closed=true;
      let appFailed=false;try{await app!.close();}catch{appFailed=true;}
      await closePools();if(appFailed)throw new Error('Operator API shutdown incomplete');
    }};
  }catch{
    if(app)try{await app.close();}catch{/* generic diagnostics only */}
    try{await closePools();}catch{/* never expose credentials */}
    throw new Error('Operator PostgreSQL/API startup refused');
  }
}
