import {z} from 'zod';
import type {Pool} from 'pg';
import {compileMigrationPlan} from './migration-plan.js';
import type {ReviewedMigrationPlan,CompiledMigrationPlan} from './migration-plan.js';

export interface MigrationConnection {
  query(sql:string,params?:readonly unknown[]):Promise<{rows:Record<string,unknown>[]}>;
  /** Must use PostgreSQL extended Parse, which refuses multiple commands. */
  querySingle(sql:string):Promise<{rows:Record<string,unknown>[]} >;
  release(error?:Error):void;
}
export interface MigrationPool {connect():Promise<MigrationConnection>}
/** The production adapter enforces a server-side single-statement boundary,
 * independent of the envelope lexer. No pool/credential/connection is created. */
export function postgresMigrationPool(pool:Pick<Pool,'connect'>):MigrationPool{
  return {connect:async()=>{
    const c=await pool.connect();return {
      query:async(sql,params=[])=>{const result=await c.query(sql,[...params]);return {rows:Array.isArray(result)?[]:result.rows};},
      querySingle:async sql=>{
        // pg 8 implements queryMode; its installed declaration omits that field.
        const single:{text:string;queryMode:'extended'}={text:sql,queryMode:'extended'};
        return {rows:(await c.query(single)).rows};
      },
      release:error=>c.release(error),
    };
  }};
}
type Authorization={planSha256:string;approvalRef:string;backupRef:string;target:ReviewedMigrationPlan['target'];now:string};
/** Must verify actual current operator approval AND recovery evidence in an
 * independent registry. Merely repeating a plan's refs/hash is not authority. */
export interface MigrationApproval {
  authorize(input:Authorization):Promise<{allowed:boolean;receipt?:string}>;
  revalidate(input:Authorization&{receipt:string}):Promise<boolean>;
}
export class MigrationRunError extends Error {
  constructor(readonly code:string,readonly outcome:'NOT_APPLIED'|'ROLLED_BACK'|'UNKNOWN_COMMIT'='NOT_APPLIED'){
    super('Reviewed migration operation unavailable');this.name='MigrationRunError';
  }
}
const Hash=z.string().regex(/^[a-f0-9]{64}$/),Ref=z.string().regex(/^[A-Za-z0-9_.:@-]{1,128}$/);
const History=z.array(z.object({position:z.coerce.number().int().positive(),path:z.string(),sha256:Hash,plan_sha256:Hash,applied_by:Ref,
  applied_at:z.iso.datetime({offset:true})})).max(64);
const deny=(code:string):never=>{throw new MigrationRunError(code);};
const approvalRead=async<T>(read:()=>Promise<T>):Promise<T>=>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([Promise.resolve().then(read),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new MigrationRunError('APPROVAL_UNAVAILABLE')),5000);})]);}
  finally{if(timer)clearTimeout(timer);}
};
const TABLE='public.hufs_schema_migrations';
const INSTANT=`pg_catalog.to_char(applied_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS applied_at`;
const COLUMNS=`position,path,sha256,plan_sha256,applied_by,${INSTANT}`;

/** Compile once to captured, pinned SQL. No DB access or implicit approval on
 * construction. No role provisioning, down migration, auto retry or release
 * enablement. The caller's pool must enforce verified TLS for remote targets. */
export async function createReviewedMigrationRunner(options:{workspace:string;plan:unknown;pool:MigrationPool;approval?:MigrationApproval;now?:()=>string}){
  let compiled:CompiledMigrationPlan;
  try{compiled=await compileMigrationPlan(options.workspace,options.plan);}catch{throw new MigrationRunError('PLAN_DENIED');}
  const {plan,files,sha256}=compiled,clock=options.now??(()=>new Date().toISOString());
  const authorization=():Authorization=>({planSha256:sha256,approvalRef:plan.approvalRef,backupRef:plan.backupRef,
    target:structuredClone(plan.target),now:z.iso.datetime({offset:true}).parse(clock())});
  const context=async(c:MigrationConnection)=>{
    // Captured statements are lexed with standard strings. An earlier SELECT
    // set_config()/function must not change parsing of the next statement.
    await c.query("SET LOCAL standard_conforming_strings='on';SET LOCAL client_encoding='UTF8';SET LOCAL search_path=public;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='15s';SET LOCAL idle_in_transaction_session_timeout='15s';");
  };
  const target=async(c:MigrationConnection)=>{
    const result=await c.query(`SELECT current_database() AS database,current_user AS role,session_user AS session_role,
      host(inet_server_addr()) AS address,inet_server_port() AS port,current_setting('server_version_num')::integer AS version,
      current_setting('server_encoding') AS encoding,current_setting('client_encoding') AS client_encoding,
      r.rolsuper,r.rolcreaterole,r.rolbypassrls,
      COALESCE((SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),false) AS tls
      FROM pg_roles r WHERE r.rolname=current_user`);
    const row=result.rows[0],wanted=plan.target;
    if(result.rows.length!==1||!row||row.database!==wanted.database||row.role!==wanted.role||row.session_role!==wanted.role||row.address!==wanted.address
      ||row.port!==wanted.port||typeof row.version!=='number'||row.version<wanted.minimumVersion
      ||row.encoding!=='UTF8'||row.client_encoding!=='UTF8'
      ||row.rolsuper!==false||row.rolcreaterole!==false||row.rolbypassrls!==false
      ||wanted.requireTls&&row.tls!==true||['postgres','template0','template1'].includes(wanted.database))deny('TARGET_DENIED');
  };
  const history=async(c:MigrationConnection,insideVerifiedApply=false)=>{
    const metadata=await c.query(`SELECT c.relkind,pg_get_userbyid(c.relowner) AS owner FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='hufs_schema_migrations'`);
    if(metadata.rows.length>1)deny('HISTORY_DRIFT');
    if(metadata.rows.length&&(metadata.rows[0]?.relkind!=='r'||metadata.rows[0]?.owner!==plan.target.role))deny('HISTORY_DRIFT');
    const rows=metadata.rows.length?History.parse((await c.query(`SELECT ${COLUMNS} FROM ${TABLE} ORDER BY position LIMIT 65`)).rows):[];
    if(!rows.length&&!insideVerifiedApply){
      const objects=await c.query(`SELECT
        (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
          AND c.relkind IN ('r','p','v','m','S','f') AND c.relname<>'hufs_schema_migrations')+
        (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') AS n`);
      if(objects.rows.length!==1||Number(objects.rows[0]?.n)!==0)deny('UNTRACKED_SCHEMA');
    }
    if(rows.length>files.length||rows.some((row,i)=>row.position!==i+1||row.path!==files[i]?.path
      ||row.sha256!==files[i]?.sha256||row.applied_by!==plan.target.role))deny('HISTORY_DRIFT');
    return rows;
  };
  const summary=(count:number)=>({planSha256:sha256,applied:files.slice(0,count).map(f=>({path:f.path,sha256:f.sha256})),
    pending:files.slice(count).map(f=>({path:f.path,sha256:f.sha256})),release:'RELEASE_BLOCKED' as const});
  const check=async()=>{
    const c=await options.pool.connect();let open=false,discard=false;
    try{
      await c.query('BEGIN TRANSACTION READ ONLY');open=true;
      await context(c);await target(c);
      const rows=await history(c);await c.query('COMMIT');open=false;return summary(rows.length);
    }catch(error){
      if(open)try{await c.query('ROLLBACK');}catch{discard=true;}
      throw error instanceof MigrationRunError?error:new MigrationRunError('CHECK_UNAVAILABLE');
    }finally{c.release(discard?new Error('Migration check connection discarded'):undefined);}
  };
  const apply=async()=>{
    const approval=options.approval;if(!approval)throw new MigrationRunError('APPROVAL_REQUIRED');
    let receipt:string;
    try{
      const allowed=await approvalRead(()=>approval.authorize(authorization()));
      if(allowed.allowed!==true||!Ref.safeParse(allowed.receipt).success)deny('APPROVAL_REQUIRED');
      receipt=allowed.receipt!;
    }catch{throw new MigrationRunError('APPROVAL_REQUIRED');}
    const revalidate=async()=>{
      if(await approvalRead(()=>approval.revalidate({...authorization(),receipt}))!==true)deny('APPROVAL_REVOKED');
    };
    const c=await options.pool.connect();let open=false,committing=false,discard=false;
    try{
      await c.query('BEGIN');open=true;
      await context(c);
      await target(c);
      const lock=await c.query('SELECT pg_try_advisory_xact_lock(64091010,(SELECT oid::integer FROM pg_database WHERE datname=current_database())) AS acquired');
      if(lock.rows.length!==1||lock.rows[0]?.acquired!==true)deny('MIGRATION_BUSY');
      const before=await history(c),expected=structuredClone(before);await revalidate();
      if(before.length<files.length){
        await c.query(`CREATE TABLE IF NOT EXISTS ${TABLE}(
          position integer PRIMARY KEY CHECK(position>0),path text UNIQUE NOT NULL,
          sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),plan_sha256 text NOT NULL CHECK(plan_sha256 ~ '^[a-f0-9]{64}$'),
          applied_by text NOT NULL,applied_at timestamptz NOT NULL DEFAULT clock_timestamp());
          REVOKE ALL ON ${TABLE} FROM PUBLIC;`);
        for(let i=before.length;i<files.length;i++){
          await revalidate();const file=files[i]!;
          for(const statement of file.statements){await context(c);await c.querySingle(statement);await context(c);await target(c);}
          // SQL must not silently edit an earlier receipt or insert its own.
          const current=await history(c,true);if(JSON.stringify(current)!==JSON.stringify(expected))deny('HISTORY_DRIFT');
          const time=await c.query(`SELECT pg_catalog.to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at`);
          if(time.rows.length!==1||!z.iso.datetime({offset:true}).safeParse(time.rows[0]?.at).success)deny('HISTORY_DRIFT');
          const at=time.rows[0]!.at;
          const inserted=History.length(1).parse((await c.query(`INSERT INTO ${TABLE}(position,path,sha256,plan_sha256,applied_by,applied_at)
            VALUES($1,$2,$3,$4,current_user,$5::timestamptz) RETURNING ${COLUMNS}`,[i+1,file.path,file.sha256,sha256,at])).rows)[0]!;
          if(inserted.position!==i+1||inserted.path!==file.path||inserted.sha256!==file.sha256||inserted.plan_sha256!==sha256
            ||inserted.applied_by!==plan.target.role||inserted.applied_at!==at)deny('HISTORY_DRIFT');
          expected.push(inserted);
          await revalidate();
        }
      }
      if(JSON.stringify(await history(c))!==JSON.stringify(expected))deny('HISTORY_DRIFT');await revalidate();
      committing=true;await c.query('COMMIT');open=false;committing=false;
      return {...summary(files.length),state:before.length===files.length?'NO_CHANGE' as const:'APPLIED' as const};
    }catch(error){
      if(open)try{await c.query('ROLLBACK');open=false;}catch{discard=true;}
      if(committing){discard=true;throw new MigrationRunError('COMMIT_UNCONFIRMED','UNKNOWN_COMMIT');}
      const code=error instanceof MigrationRunError?error.code:'SQL_FAILURE';
      throw new MigrationRunError(code,discard?'UNKNOWN_COMMIT':'ROLLED_BACK');
    }finally{
      // Reviewed SQL may contain non-local session settings. Never return such
      // an execution connection to an unrelated runtime caller, even on success.
      c.release(new Error('Migration execution session discarded'));
    }
  };
  return {check,apply,planSha256:sha256};
}
