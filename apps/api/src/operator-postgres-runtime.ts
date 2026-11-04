import {createPostgresDataPool} from './db/pg-pool.js';
import type {DataPoolSettings,ManagedDataPool} from './db/pg-pool.js';
import {createPostgresApplication} from './application-postgres.js';
import type {PostgresApplicationConfig} from './application-postgres.js';
import type {PostgresGoogleAuthConfig} from './auth-postgres.js';
import type {PostgresPlatformConfig} from './platform-postgres.js';

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

export interface OperatorPostgresInputs {
  roles:OperatorSqlSettings;
  google:PostgresGoogleAuthConfig['google'];
  attemptDigestKey:Buffer;
  evidenceRights:PostgresPlatformConfig['evidenceRights'];
  /** Additional approved ports are deliberately NOT inferred from URL/flags. */
  platform?:Omit<PostgresPlatformConfig,'pools'|'evidenceRights'>;
}
export interface PreparedOperatorPostgres {
  readonly application:PostgresApplicationConfig;
  readonly pools:OperatorSqlPools;
}

const LOOPBACK=new Set(['127.0.0.1','::1']);

/** No connection, DNS call, migration or HTTP listener is started here. */
export function prepareOperatorPostgres(input:OperatorPostgresInputs):PreparedOperatorPostgres{
  if(!input||!input.roles||typeof input.google?.exchangeCode!=='function'
    ||typeof input.evidenceRights?.resolveFor!=='function'
    ||!Buffer.isBuffer(input.attemptDigestKey)||input.attemptDigestKey.length<32)
    throw new Error('Explicit Google, evidence rights and server-owned digest key required');
  const expectedRoles=new Set<string>(),endpoints=new Set<string>();
  const roles={} as Record<OperatorSqlRole,ManagedDataPool>;
  for(const role of REQUIRED_SQL_ROLES){
    const settings=input.roles[role];
    if(!settings||expectedRoles.has(settings.expectedRole)
      ||endpoints.has(settings.connectionString)
      ||settings.environment!=='production')
      throw new Error('Seven independently restricted production SQL LOGIN roles required');
    expectedRoles.add(settings.expectedRole);
    endpoints.add(settings.connectionString);
  }
  // All settings pass syntax/TLS/role validation before the first socket opens.
  // Do not log connection strings: they may contain database credentials.
  try{
    for(const role of REQUIRED_SQL_ROLES)roles[role]=createPostgresDataPool(input.roles[role]);
  }catch{
    // Pool constructors do not open sockets, but close those already allocated.
    void Promise.allSettled(Object.values(roles).map(pool=>pool.close()));
    throw new Error('Operator SQL pool configuration refused');
  }
  const {sessions,admission,attempts,projections,calendar,personal,evidence}=roles;
  const application:PostgresApplicationConfig={
    auth:{pools:{sessions,admission,attempts},
      attemptDigestKey:Buffer.from(input.attemptDigestKey),google:input.google},
    platform:{...input.platform,pools:{projections,calendar,personal,evidence},
      evidenceRights:input.evidenceRights},
  };
  return {application,pools:roles};
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
  let app:ReturnType<typeof createPostgresApplication>|undefined;
  let closed=false;
  const closePools=async()=>{
    const finished=await Promise.allSettled(
      [...REQUIRED_SQL_ROLES].reverse().map(key=>prepared.pools[key].close()));
    if(finished.some(x=>x.status==='rejected'))
      throw new Error('Operator SQL pool shutdown incomplete');
  };
  try{
    // Each managed pool verifies current_user and non-superuser/non-BYPASSRLS
    // before returning a connection. Do NOT use an administrator DSN here.
    for(const key of REQUIRED_SQL_ROLES){
      const connection=await prepared.pools[key].connect();
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
