import {createPostgresDataPool} from './db/pg-pool.js';
import type {DataPoolSettings,ManagedDataPool} from './db/pg-pool.js';
import {createPostgresApplication} from './application-postgres.js';
import type {PostgresApplicationConfig} from './application-postgres.js';
import type {PostgresGoogleAuthConfig} from './auth-postgres.js';
import type {PostgresPlatformConfig} from './platform-postgres.js';
import type {ReviewerDemoRepository} from './modules/auth/reviewer.js';
import type {SchoolMailSender} from './modules/auth/school-mail-proof.js';
import {createOperatorSchoolMailProof} from './operator-mail-proof.js';

/**
 * Operator-only, real PostgreSQL composition and INTERNAL HTTP listener.
 *
 * This is the executable service wiring missing from #183, not a production
 * release approval. It never migrates a database or fetches credentials.
 * Caller passes seven independently approved SQL LOGIN roles and an authentic
 * OIDC code-exchange adapter from a private, trusted runtime.
 *
 * The existing createIntegratedApi production gate is deliberately retained:
 * #46/#61/#89 human acceptance must be completed before a separate reviewed
 * public release entrypoint may lift that gate. No environment variable bypass.
 */
export const REQUIRED_SQL_ROLES=[
  'sessions','admission','attempts','projections','calendar','personal','evidence',
] as const;
export type OperatorSqlRole=typeof REQUIRED_SQL_ROLES[number];
export type OperatorSqlSettings=Readonly<Record<OperatorSqlRole,DataPoolSettings>>;
export type OperatorSqlPools=Readonly<Record<OperatorSqlRole,ManagedDataPool>>;
export const EXTRA_SQL_ROLES=['reviewerInvitations','reviewerSandbox','mailChallenges','mailProofUpdates','demoProfile','demoProfileQuota'] as const;
type ExtraSqlRole=typeof EXTRA_SQL_ROLES[number];
type ExtraSqlPools=Partial<Record<ExtraSqlRole,ManagedDataPool>>;

export interface OperatorPostgresInputs {
  roles:OperatorSqlSettings;
  google:PostgresGoogleAuthConfig['google'];
  attemptDigestKey:Buffer;
  evidenceRights:PostgresPlatformConfig['evidenceRights'];
  /** Additional approved ports are deliberately NOT inferred from URL/flags. */
  platform?:Omit<PostgresPlatformConfig,'pools'|'evidenceRights'|'reviewerSandbox'>;
  /** Optional trusted REVIEWER-only BETA mail enrollment with isolated roles. */
  reviewer?:{invitations:DataPoolSettings;sandbox:DataPoolSettings;demo:ReviewerDemoRepository};
  schoolMail?:{challenges:DataPoolSettings;proofUpdates:DataPoolSettings;
    digestKey:Buffer;sender:SchoolMailSender};
  /** Optional, independent demo roles. Raw platform SQL pools are never accepted. */
  demo?:{profile:DataPoolSettings;quota:DataPoolSettings;digestKey:Buffer};
}
export interface PreparedOperatorPostgres {
  readonly application:PostgresApplicationConfig;
  readonly pools:OperatorSqlPools;
  readonly extraPools?:ExtraSqlPools;
}

const LOOPBACK=new Set(['127.0.0.1','::1']);
/** Optional SQL ports cannot bypass the production role/TLS/startup/shutdown checks. */
const UNVERIFIED_PLATFORM_PORTS=[
  'sourceIngestion','restrictedIntake','selfAccount','ownerWorkspace','experienceApproval',
  'demoOverlay','sourceReview','ownerCatalog','ownerRecommendations','studyPlanCheck',
  'ownerStudyPlan','doubleMajor','revisionComparison',
] as const;
const hasUnverifiedPlatformPort=(platform:PostgresPlatformConfig|undefined):boolean=>
  !!platform&&UNVERIFIED_PLATFORM_PORTS.some(field=>Object.prototype.hasOwnProperty.call(platform,field));

/** No connection, DNS call, migration or HTTP listener is started here. */
export function prepareOperatorPostgres(input:OperatorPostgresInputs):PreparedOperatorPostgres{
  if(!input||!input.roles||typeof input.google?.exchangeCode!=='function'
    ||typeof input.evidenceRights?.resolveFor!=='function'
    ||!Buffer.isBuffer(input.attemptDigestKey)||input.attemptDigestKey.length<32)
    throw new Error('Explicit Google, evidence rights and server-owned digest key required');
  if(input.schoolMail&&!input.reviewer)
    throw new Error('School-mail proof requires a separate REVIEWER sandbox');
  if(input.schoolMail&&(!Buffer.isBuffer(input.schoolMail.digestKey)
    ||input.schoolMail.digestKey.length<32
    ||input.schoolMail.digestKey.equals(input.attemptDigestKey)
    ||typeof input.schoolMail.sender?.send!=='function'))
    throw new Error('School-mail proof requires independent approved runtime settings');
  if(input.reviewer&&(typeof input.reviewer.demo?.listProfiles!=='function'
    ||typeof input.reviewer.demo?.readSnapshot!=='function'))
    throw new Error('An explicit synthetic-only reviewer repository is required');
  if(input.demo&&(!Buffer.isBuffer(input.demo.digestKey)
    ||input.demo.digestKey.length<32
    ||input.demo.digestKey.equals(input.attemptDigestKey)))
    throw new Error('Demo profile quota needs an independent digest key');
  if((input.platform as PostgresPlatformConfig|undefined)?.reviewerSandbox
    ||(input.platform as PostgresPlatformConfig|undefined)?.pools
    ||(input.platform as PostgresPlatformConfig|undefined)?.demoProfile
    ||(input.platform as PostgresPlatformConfig|undefined)?.demoProfileQuota
    ||hasUnverifiedPlatformPort(input.platform as PostgresPlatformConfig|undefined))
    throw new Error('Operator platform SQL pools must use verified role settings');
  const expectedRoles=new Set<string>(),endpoints=new Set<string>();
  const roles={} as Record<OperatorSqlRole,ManagedDataPool>;
  const extraSettings:Partial<Record<ExtraSqlRole,DataPoolSettings>>={
    ...(input.reviewer?{reviewerInvitations:input.reviewer.invitations,
      reviewerSandbox:input.reviewer.sandbox}:{}),
    ...(input.schoolMail?{mailChallenges:input.schoolMail.challenges,
      mailProofUpdates:input.schoolMail.proofUpdates}:{}),
    ...(input.demo?{demoProfile:input.demo.profile,demoProfileQuota:input.demo.quota}:{})
  };
  const allSettings:DataPoolSettings[]=[
    ...REQUIRED_SQL_ROLES.map(role=>input.roles[role]),...Object.values(extraSettings),
  ];
  for(const settings of allSettings){
    if(!settings||expectedRoles.has(settings.expectedRole)
      ||endpoints.has(settings.connectionString)
      ||settings.environment!=='production')
      throw new Error('Seven independently restricted production SQL LOGIN roles and isolated extensions required');
    expectedRoles.add(settings.expectedRole);
    endpoints.add(settings.connectionString);
  }
  // All role/TLS settings are verified before the first socket opens.
  const extraPools:ExtraSqlPools={};
  try{
    for(const role of REQUIRED_SQL_ROLES)roles[role]=createPostgresDataPool(input.roles[role]);
    for(const role of EXTRA_SQL_ROLES){
      const settings=extraSettings[role];
      if(settings)extraPools[role]=createPostgresDataPool(settings);
    }
  }catch{
    void Promise.allSettled([...Object.values(roles),...Object.values(extraPools)]
      .map(pool=>pool.close()));
    throw new Error('Operator SQL pool configuration refused');
  }
  const {sessions,admission,attempts,projections,calendar,personal,evidence}=roles;
  const application:PostgresApplicationConfig={
    auth:{pools:{sessions,admission,attempts},
      attemptDigestKey:Buffer.from(input.attemptDigestKey),google:input.google},
    platform:{...input.platform,pools:{projections,calendar,personal,evidence},
      evidenceRights:input.evidenceRights,
      ...(extraPools.reviewerSandbox?{reviewerSandbox:extraPools.reviewerSandbox}:{}),
      ...(input.demo?{demoProfile:{pool:extraPools.demoProfile!},
        demoProfileQuota:{pool:extraPools.demoProfileQuota!,digestKey:Buffer.from(input.demo.digestKey)}}:{})},
    ...(input.reviewer?{reviewer:{
      invitations:extraPools.reviewerInvitations!,demo:input.reviewer.demo}}:{}),
    ...(input.schoolMail?{schoolMailProof:createOperatorSchoolMailProof({
      pools:{challenges:extraPools.mailChallenges!,proofUpdates:extraPools.mailProofUpdates!,
        attempts},challengeDigestKey:input.schoolMail.digestKey,
      attemptDigestKey:input.attemptDigestKey,sender:input.schoolMail.sender,
      ...(input.google.now?{now:input.google.now}:{})
    })}:{})
  };
  return {application,pools:roles,...(Object.keys(extraPools).length?{extraPools}:{})};
}

export interface OperatorServer {
  readonly address:string;
  close():Promise<void>;
}

/**
 * Real sockets, real SQL-role checks, then loopback HTTP ONLY. A failed
 * dependency closes every pool and never starts a partially authenticated API.
 * Ingress, DNS, public TLS, provider/AI and NCP remain separate approvals.
 */
export async function startOperatorPostgres(input:{
  prepared:PreparedOperatorPostgres; host:'127.0.0.1'|'::1'; port:number;
}):Promise<OperatorServer>{
  const {prepared,host,port}=input;
  if(!LOOPBACK.has(host)||!Number.isSafeInteger(port)
    ||(port!==0 && (port<1024||port>65535))
    ||(port===0&&process.env.NODE_ENV!=='test'))
    throw new Error('Operator API can only bind an approved loopback port');
  if(!prepared?.application||!prepared.pools
    ||!REQUIRED_SQL_ROLES.every(key=>typeof prepared.pools[key]?.connect==='function'
      &&typeof prepared.pools[key]?.close==='function'))
    throw new Error('Seven managed PostgreSQL pools required');
  const extra=prepared.extraPools??{};
  const platform=prepared.application.platform;
  if(hasUnverifiedPlatformPort(platform)||Boolean(platform.demoProfile)!==Boolean(platform.demoProfileQuota))
    throw new Error('Operator platform SQL pools must use verified role settings');
  const requiredExtra:ExtraSqlRole[]=[
    ...(prepared.application.reviewer?['reviewerInvitations','reviewerSandbox'] as const:[]),
    ...(prepared.application.schoolMailProof?['mailChallenges','mailProofUpdates'] as const:[]),
    ...(platform.demoProfile?['demoProfile','demoProfileQuota'] as const:[]),
  ];
  if(Object.keys(extra).length!==requiredExtra.length
    ||requiredExtra.some(key=>!extra[key])
    ||Object.keys(extra).some(key=>!EXTRA_SQL_ROLES.includes(key as ExtraSqlRole))
    ||(platform.demoProfile&&platform.demoProfile.pool!==extra.demoProfile)
    ||(platform.demoProfileQuota&&platform.demoProfileQuota.pool!==extra.demoProfileQuota))
    throw new Error('Operator extension pool roles are incomplete');
  const pools=[
    ...REQUIRED_SQL_ROLES.map(key=>prepared.pools[key]),
    ...EXTRA_SQL_ROLES.flatMap(key=>extra[key]?[extra[key]!]:[]),
  ];
  if(pools.some(pool=>typeof pool?.connect!=='function'||typeof pool.close!=='function')
    ||new Set(pools).size!==pools.length)
    throw new Error('Operator SQL pools must be independent and managed');
  let app:ReturnType<typeof createPostgresApplication>|undefined;
  let closed=false;
  const closePools=async()=>{
    const finished=await Promise.allSettled([...pools].reverse().map(pool=>pool.close()));
    if(finished.some(x=>x.status==='rejected'))
      throw new Error('Operator SQL pool shutdown incomplete');
  };
  try{
    // Each managed pool verifies current_user and non-superuser/non-BYPASSRLS
    // before returning a connection. Do NOT use an administrator DSN here.
    for(const pool of pools){
      const connection=await pool.connect();
      try{
        const result=await connection.query('SELECT 1 AS ready');
        if(result.rows.length!==1||Number(result.rows[0]?.ready)!==1)
          throw new Error('Database readiness check refused');
      }finally{connection.release();}
    }
    app=createPostgresApplication(prepared.application);
    const address=await app.listen({host,port});
    return {
      address,
      async close(){
        if(closed)return;
        closed=true;
        let appFailed=false;
        try{await app!.close();}catch{appFailed=true;}
        await closePools();
        if(appFailed)throw new Error('Operator API shutdown incomplete');
      },
    };
  }catch{
    if(app)try{await app.close();}catch{/* preserve generic startup error */}
    try{await closePools();}catch{/* no credentials in error */}
    throw new Error('Operator PostgreSQL/API startup refused');
  }
}
