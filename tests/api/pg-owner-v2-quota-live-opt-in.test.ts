/** #447: real disposable PostgreSQL 18 proof of owner V2 catalog quota.
 * Only synthetic account digests, with a unique throwaway local database.
 */
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {PostgresOwnerV2CatalogQuota} from '../../apps/api/src/modules/owner-v2-catalog-quota-postgres.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';

const RUN=process.env.HUFS_PG_FULL_LIVE==='1';
const suffix=randomBytes(5).toString('hex');
const dbName='hufs_v2_catalog_quota_'+suffix;
const login='hufs_catalog_quota_'+suffix,password=randomBytes(20).toString('hex');
const key=Buffer.alloc(32,31),at='2026-11-11T00:00:00Z';
let admin:Pool|undefined,db:Pool|undefined,reader:Pool|undefined,created=false,roleCreated=false;
const request=(actorId:string)=>({actorId,now:at,operation:'V2_CATALOG_SEARCH' as const});
function url():URL{
  const raw=process.env.HUFS_PG_FULL_URL;
  if(!raw)throw new Error('Explicit disposable local PostgreSQL URL required');
  const u=new URL(raw);
  if(!['postgres:','postgresql:'].includes(u.protocol)||u.hostname!=='127.0.0.1'
    ||u.port!=='5432'||u.pathname!=='/hufs_one_full_test'
    ||u.username!=='hufs_local_admin'||u.search||u.hash)
    throw new Error('Refusing non-disposable PostgreSQL target');
  return u;
}
const adapter=(pool:Pool):ReviewerSqlPool=>({connect:async()=>{
  const connection=await pool.connect();
  return {query:async(sql,params=[])=>({
    rows:(await connection.query(sql,[...params])).rows,
  }),release:()=>connection.release()};
}});
describe.skipIf(!RUN)('#447 real PostgreSQL synthetic owner V2 quota',()=>{
  beforeAll(async()=>{
    const root=url();
    admin=new Pool({connectionString:root.toString(),max:2,connectionTimeoutMillis:3000});
    const actual=await admin.query('SELECT current_database() AS name');
    if(actual.rows[0]?.name!=='hufs_one_full_test')throw new Error('Disposable database mismatch');
    await admin.query('CREATE DATABASE '+dbName);created=true;
    const local=new URL(root);local.pathname='/'+dbName;
    db=new Pool({connectionString:local.toString(),max:4,connectionTimeoutMillis:3000});
    await db.query(readFileSync(new URL('../../infra/sql/20261111_owner_v2_catalog_quota.sql',import.meta.url),'utf8'));
    expect((await db.query('SELECT count(*)::integer AS n FROM public.owner_v2_catalog_quota_policy')).rows[0]?.n).toBe(0);
    await admin.query(`CREATE ROLE ${login} LOGIN PASSWORD '${password}'
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`);roleCreated=true;
    await db.query(`GRANT USAGE ON SCHEMA public TO ${login}`);
    await db.query(`GRANT EXECUTE ON FUNCTION public.consume_owner_v2_catalog_quota(char(64)) TO ${login}`);
    local.username=login;local.password=password;
    reader=new Pool({connectionString:local.toString(),max:5,connectionTimeoutMillis:3000});
  },25000);
  afterAll(async()=>{
    await reader?.end();await db?.end();
    if(admin){
      if(created)await admin.query('DROP DATABASE '+dbName);
      if(roleCreated)await admin.query('DROP ROLE '+login);
      await admin.end();
    }
  },20000);
  it('is DENIED before an independently entered policy, without leaking actor text',async()=>{
    const port=new PostgresOwnerV2CatalogQuota(adapter(reader!),key);
    expect(await port.consume(request('SYN-OWNER-A'))).toBe(false);
    const rows=await db!.query('SELECT count(*)::integer AS n FROM public.owner_v2_catalog_quota_windows');
    expect(rows.rows[0]?.n).toBe(0);
    await expect(reader!.query('SELECT * FROM public.owner_v2_catalog_quota_policy'))
      .rejects.toThrow(/permission denied/);
    await expect(reader!.query('SELECT * FROM public.owner_v2_catalog_quota_windows'))
      .rejects.toThrow(/permission denied/);
  });
  it('uses one atomic limit across concurrent requests and isolates actors',async()=>{
    await db!.query('INSERT INTO public.owner_v2_catalog_quota_policy(singleton,max_requests_per_minute) VALUES(1,2)');
    const port=new PostgresOwnerV2CatalogQuota(adapter(reader!),key);
    const actual=await Promise.all(Array.from({length:8},()=>port.consume(request('SYN-OWNER-A'))));
    expect(actual.filter(Boolean)).toHaveLength(2);
    expect(actual.filter(v=>!v)).toHaveLength(6);
    expect(await port.consume(request('SYN-OWNER-B'))).toBe(true);
    const stored=await db!.query('SELECT identity_digest,uses FROM public.owner_v2_catalog_quota_windows');
    expect(stored.rows).toHaveLength(2);
    expect(stored.rows.map(x=>x.uses).sort()).toEqual([1,2]);
    expect(JSON.stringify(stored.rows)).not.toContain('SYN-OWNER');
  });
});
