import {Pool} from 'pg';
import type {ReviewerSqlPool,ReviewerSqlConnection} from '../modules/auth/reviewer-postgres.js';

export type PgConnectionEnvironment='local-test'|'production';
export interface DataPoolSettings {
  /** Set by the server operator, never by a request or browser. */
  connectionString:string;
  environment:PgConnectionEnvironment;
  /** Actual LOGIN database role (not a caller-provided SET ROLE). */
  expectedRole:string;
  /** Required for production; use a CA issued for the deployed database. */
  trustedCaPem?:string;
  maxConnections?:number;
}
export interface ManagedDataPool extends ReviewerSqlPool {
  close():Promise<void>;
}

const RoleName=/^[a-z_][a-z0-9_]{0,62}$/;
const Loopback=new Set(['localhost','127.0.0.1','[::1]']);

/**
 * No implicit sslmode downgrades, shared privileged connections, or auto migration.
 * Production connections require explicit CA verification and role confirmation.
 * Test connections can only reach loopback; no tests accidentally touch cloud DBs.
 */
export function createPostgresDataPool(settings:DataPoolSettings):ManagedDataPool {
  if(!RoleName.test(settings.expectedRole))throw new Error('Invalid expected DB role');
  if(!Number.isInteger(settings.maxConnections??5)
    ||(settings.maxConnections??5)<1||(settings.maxConnections??5)>20)
    throw new Error('Invalid PG connection limit');
  let url:URL;
  try{url=new URL(settings.connectionString);}
  catch{throw new Error('Invalid PostgreSQL connection settings');}
  if(!['postgres:','postgresql:'].includes(url.protocol)
    ||!url.hostname||!url.username||!url.pathname||url.pathname==='/'
    ||url.search||url.hash)
    throw new Error('Invalid PostgreSQL connection settings');
  let ssl:false|{rejectUnauthorized:true;ca:string};
  if(settings.environment==='local-test'){
    if(!Loopback.has(url.hostname))throw new Error('Local DB must use loopback');
    ssl=false;
  }else if(settings.environment==='production'){
    if(Loopback.has(url.hostname)
      ||typeof settings.trustedCaPem!=='string'
      ||!settings.trustedCaPem.includes('BEGIN CERTIFICATE'))
      throw new Error('Production PG requires a verified remote TLS CA');
    ssl={rejectUnauthorized:true,ca:settings.trustedCaPem};
  }else{
    throw new Error('Explicit PostgreSQL environment required');
  }
  const pool=new Pool({
    connectionString:settings.connectionString,ssl,
    max:settings.maxConnections??5,
    connectionTimeoutMillis:3000,
    idleTimeoutMillis:10000,
    application_name:'hufs-one-api-data',
  });
  return {
    async connect():Promise<ReviewerSqlConnection>{
      const c=await pool.connect();
      try{
        const check=await c.query(`
          SELECT current_user AS db_role, rolsuper, rolbypassrls
          FROM pg_roles WHERE rolname=current_user`);
        const row=check.rows[0];
        if(check.rows.length!==1||row?.db_role!==settings.expectedRole
          ||row?.rolsuper!==false||row?.rolbypassrls!==false)
          throw new Error('Database role verification failed');
        return c;
      }catch{
        c.release();
        throw new Error('Database role verification failed');
      }
    },
    close:()=>pool.end(),
  };
}
