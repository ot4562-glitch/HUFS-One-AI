/**
 * LIVE PostgreSQL test. Not a SQL fake and NOT part of default CI proof.
 * Before running, provision an EMPTY, disposable, localhost-only database
 * named exactly hufs_one_a2_test with no real student data.
 * Explicit opt-in: HUFS_A2_PG_LIVE=1 HUFS_A2_PG_LIVE_URL=postgres://...@127.0.0.1/hufs_one_a2_test
 * This test creates only project-prefixed tables/functions in that database
 * and cleans them up at the end. It never creates a database, role or cloud VM.
 */
import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {
  PostgresPersonalStateStore,PersonalStateConflict,PersonalStateDenied,
} from '../../apps/api/src/db/personal-state-postgres.js';
import type {ReviewerSqlPool} from
  '../../apps/api/src/modules/auth/reviewer-postgres.js';

const RUN=process.env.HUFS_A2_PG_LIVE==='1';
const ACTOR='synthetic-a2-pg-live-01';
const scope={actorId:ACTOR,subjectId:'S01' as const,grantVersion:'v1'};
const EXPERIENCE={
  kind:'EXPERIENCE' as const,dataMode:'SYNTHETIC' as const,
  title:'SYNTHETIC A2 LIVE',summary:'Synthetic PostgreSQL proof, no real students',
};
let pool:Pool|undefined;
let guarded=false;

function approvedPool(source:Pool):ReviewerSqlPool {
  return {
    connect:async()=>{
      const client=await source.connect();
      return {
        query:async(sql,params=[])=>{
          const result=await client.query(sql,[...params]);
          return {rows:result.rows};
        },
        release:()=>client.release(),
      };
    },
  };
}
function store(source:Pool):PostgresPersonalStateStore {
  return new PostgresPersonalStateStore(
    approvedPool(source),undefined,{isApproved:async({value})=>
      value.kind==='EXPERIENCE'&&value.dataMode==='SYNTHETIC'
      &&value.title.startsWith('SYNTHETIC')},
  );
}
function parseLoopbackUrl():string{
  const input=process.env.HUFS_A2_PG_LIVE_URL;
  if(!input)throw new Error('Explicit, local disposable PG test DSN required');
  const u=new URL(input);
  if(!['postgres:','postgresql:'].includes(u.protocol)
    ||!['localhost','127.0.0.1','[::1]'].includes(u.hostname)
    ||u.pathname!=='/hufs_one_a2_test'||u.search||u.hash||!u.username)
    throw new Error('Refusing anything other than a local isolated a2 test DB');
  return input;
}
async function cleanup(source:Pool):Promise<void>{
  await source.query(`
    BEGIN;
    DROP TABLE IF EXISTS
      api_personal_events,api_personal_records,api_grant_events,
      api_approved_safe_packets,api_demo_snapshot_projections,
      api_demo_profile_projections,api_sharing_grants CASCADE;
    DROP FUNCTION IF EXISTS api_lock_authorized_personal_grant(text,char(3),text,text[]);
    DROP FUNCTION IF EXISTS api_deny_grant_audit_mutation();
    DROP FUNCTION IF EXISTS api_deny_personal_audit_mutation();
    DROP FUNCTION IF EXISTS api_test_a2_deny_audit();
    COMMIT;
  `);
}
describe.skipIf(!RUN)('TASK-27 REAL local PG migration/transactions (explicit opt-in)',()=>{
  beforeAll(async()=>{
    const dsn=parseLoopbackUrl();
    pool=new Pool({
      connectionString:dsn,ssl:false,max:6,connectionTimeoutMillis:3000,
    });
    const info=await pool.query(`
      SELECT current_database() AS db,current_setting('server_version_num')::int AS ver`);
    if(info.rows[0]?.db!=='hufs_one_a2_test'||info.rows[0]?.ver<140000)
      throw new Error('Unsafe or unsupported live-test PostgreSQL target');
    const existing=await pool.query(`
      SELECT count(*)::integer AS n FROM pg_tables
      WHERE schemaname='public' AND tablename LIKE 'api_%'`);
    const funcs=await pool.query(`
      SELECT count(*)::integer AS n FROM pg_proc
      WHERE pronamespace='public'::regnamespace AND proname IN
        ('api_lock_authorized_personal_grant',
         'api_deny_grant_audit_mutation',
         'api_deny_personal_audit_mutation',
         'api_test_a2_deny_audit')`);
    if(existing.rows[0]?.n!==0||funcs.rows[0]?.n!==0)
      throw new Error('Disposable PG test database must be empty');
    guarded=true;
    const folder=new URL('../../infra/sql/',import.meta.url);
    await pool.query(readFileSync(new URL('20261031_api_projections.sql',folder),'utf8'));
    await pool.query(readFileSync(new URL('20261031_z_api_personal_state.sql',folder),'utf8'));
    await pool.query(`
      INSERT INTO api_sharing_grants(
        grant_id,actor_id,subject_id,allowed_sections,display_name_allowed,
        recording_allowed,version,consent_ref,approved_by,approved_at,expires_at)
      VALUES('SYN-A2-GRANT',$1,'S01',ARRAY['FEED','NOTICES','EXPERIENCE'],
        false,false,'v1','SYN-A2-CONSENT','SYN-A2-OP',
        clock_timestamp(),clock_timestamp()+interval '1 hour')`,[ACTOR]);
  },30000);

  afterAll(async()=>{
    if(!pool)return;
    try{if(guarded)await cleanup(pool);}
    finally{await pool.end();}
  },30000);

  it('migrates valid SQL and persists across distinct PG connections',async()=>{
    const db=pool!;
    const writer=store(db);
    const created=await writer.create({
      scope,itemId:'live-exp-01',value:EXPERIENCE,
    });
    expect(created.version).toBe(1);
    const anotherConnection=store(db);
    expect((await anotherConnection.read({
      scope,kind:'EXPERIENCE',itemId:'live-exp-01',
    }))?.value).toEqual(EXPERIENCE);
  });
  it('serializes competing version-CAS updates on two real PG connections',async()=>{
    const db=pool!,writer=store(db);
    const results=await Promise.allSettled([
      writer.update({
        scope,itemId:'live-exp-01',expectedVersion:1,
        value:{...EXPERIENCE,summary:'SYN winner 1'},
      }),
      store(db).update({
        scope,itemId:'live-exp-01',expectedVersion:1,
        value:{...EXPERIENCE,summary:'SYN winner 2'},
      }),
    ]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
    expect(results.some(r=>r.status==='rejected'
      &&r.reason instanceof PersonalStateConflict)).toBe(true);
    expect((await writer.read({
      scope,kind:'EXPERIENCE',itemId:'live-exp-01',
    }))?.version).toBe(2);
  });
  it('rolls back a real data insert when the audit trigger rejects it',async()=>{
    const db=pool!;
    await db.query(`
      CREATE OR REPLACE FUNCTION api_test_a2_deny_audit()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'SYNTHETIC AUDIT DENIED'; END; $$;
      CREATE TRIGGER api_test_a2_fail_audit
      BEFORE INSERT ON api_personal_events FOR EACH ROW
      EXECUTE FUNCTION api_test_a2_deny_audit()`);
    try{
      await expect(store(db).create({
        scope,itemId:'live-rollback',value:EXPERIENCE,
      })).rejects.toThrow('SYNTHETIC AUDIT DENIED');
      const rows=await db.query(`
        SELECT count(*)::integer AS n FROM api_personal_records
        WHERE actor_id=$1 AND item_id='live-rollback'`,[ACTOR]);
      expect(rows.rows[0]?.n).toBe(0);
    }finally{
      await db.query('DROP TRIGGER IF EXISTS api_test_a2_fail_audit ON api_personal_events');
      await db.query('DROP FUNCTION IF EXISTS api_test_a2_deny_audit()');
    }
  });
  it('blocks revoked grants immediately and maintains immutable audit events',async()=>{
    const db=pool!;
    await expect(db.query(`
      UPDATE api_personal_events SET action='DELETED'
      WHERE actor_id=$1`,[ACTOR])).rejects.toThrow();
    await db.query(`
      UPDATE api_sharing_grants
      SET revoked_at=clock_timestamp(),version='v2'
      WHERE actor_id=$1 AND subject_id='S01' AND version='v1'`,[ACTOR]);
    await expect(store(db).read({
      scope,kind:'EXPERIENCE',itemId:'live-exp-01',
    })).rejects.toBeInstanceOf(PersonalStateDenied);
  });
});
