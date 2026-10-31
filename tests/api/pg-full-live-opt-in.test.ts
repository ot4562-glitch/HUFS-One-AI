/** Real PostgreSQL proof; default CI remains opt-in. Never point at application data.
 * HUFS_PG_FULL_LIVE=1 HUFS_PG_FULL_URL=postgres://...@127.0.0.1:55432/hufs_one_full_test
 * Start a fresh disposable local cluster first. All records below are synthetic.
 */
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {PostgresPersonalStateStore} from '../../apps/api/src/db/personal-state-postgres.js';
import {PostgresApiProjectionRepository} from '../../apps/api/src/repository-postgres.js';
import {PostgresAuthAttemptLimiter} from '../../apps/api/src/modules/auth/auth-attempt-limiter-postgres.js';
import {PostgresTemporalEvidenceReader} from '../../apps/api/src/modules/opportunities/temporal-postgres.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';
import snapshotRaw from '../../packages/fixtures/synthetic/demo-snapshot.json';

const RUN=process.env.HUFS_PG_FULL_LIVE==='1';
const pools:Pool[]=[];
let admin:Pool,writer:Pool,reader:Pool,temporal:Pool,limiter:Pool;
const actor='SYNTHETIC-FULL-PG-ACTOR';
const scope={actorId:actor,subjectId:'S01' as const,grantVersion:'v1'};
const now=()=>new Date().toISOString();
const migrationNames=[
  '20261031_api_projections.sql','20261031_z_api_personal_state.sql',
  '20261031_zz_api_roles.sql','20261031_google_auth.sql',
  '20261031_beta_admission.sql','20261031_school_mail.sql',
  '20261031_reviewer_invitations.sql','20261031_auth_attempt_windows.sql',
  '20261031_temporal_evidence.sql',
];
function adapter(pool:Pool):ReviewerSqlPool{return {connect:async()=>{
  const c=await pool.connect();return {
    query:async(sql,params=[])=>({rows:(await c.query(sql,[...params])).rows}),
    release:()=>c.release(),
  };
}};}
function connectionUrl():URL{
  const raw=process.env.HUFS_PG_FULL_URL;
  if(!raw)throw new Error('Explicit local disposable PG URL required');
  const u=new URL(raw);
  if(!['postgres:','postgresql:'].includes(u.protocol)
    ||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)
    ||u.pathname!=='/hufs_one_full_test'||u.search||u.hash||!u.username)
    throw new Error('Refusing non-local/non-disposable PostgreSQL target');
  return u;
}
function poolFor(url:URL,user?:string):Pool{
  const selected=new URL(url);if(user){selected.username=user;selected.password='';}
  const pool=new Pool({connectionString:selected.toString(),ssl:false,max:12,
    connectionTimeoutMillis:3000,statement_timeout:5000});
  pools.push(pool);return pool;
}
describe.skipIf(!RUN)('REAL PostgreSQL: full migrations and least-privilege adapters',()=>{
  beforeAll(async()=>{
    const url=connectionUrl();admin=poolFor(url);
    const tables=await admin.query(`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'`);
    if(tables.rows[0]?.n!==0)throw new Error('Full live-test database must be empty');
    for(const name of migrationNames)await admin.query(readFileSync(new URL('../../infra/sql/'+name,import.meta.url),'utf8'));
    // LOGIN roles exist only in this disposable cluster. No password, secret,
    // school identity, cloud resource, or public listener is involved.
    await admin.query(`
      CREATE ROLE hufs_test_personal LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
      CREATE ROLE hufs_test_projection LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
      CREATE ROLE hufs_test_temporal LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
      CREATE ROLE hufs_test_limiter LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
      GRANT hufs_api_personal_writer TO hufs_test_personal;
      GRANT hufs_api_projection_reader TO hufs_test_projection;
      GRANT USAGE ON SCHEMA public TO hufs_test_temporal,hufs_test_limiter;
      GRANT SELECT ON source_revisions_vnext,source_paragraphs_vnext,
        source_conflict_decisions_vnext TO hufs_test_temporal;
      GRANT SELECT,INSERT,UPDATE ON auth_attempt_windows TO hufs_test_limiter;
    `);
    writer=poolFor(url,'hufs_test_personal');reader=poolFor(url,'hufs_test_projection');
    temporal=poolFor(url,'hufs_test_temporal');limiter=poolFor(url,'hufs_test_limiter');
    await admin.query(`INSERT INTO api_sharing_grants(
      grant_id,actor_id,subject_id,allowed_sections,version,consent_ref,
      approved_by,approved_at,expires_at)
      VALUES('SYN-FULL-GRANT',$1,'S01',ARRAY['FEED','NOTICES','ACADEMICS','EXPERIENCE'],
        'v1','SYN-CONSENT','SYN-OPERATOR',clock_timestamp(),clock_timestamp()+interval '1 hour')`,[actor]);
    await admin.query(`INSERT INTO api_demo_snapshot_projections(
      subject_id,projection_version,dataset_version,snapshot_json,approved_at,approved_by,current)
      VALUES('S01','SYN-P1','SYN-D1',$1,clock_timestamp(),'SYN-OPERATOR',true)`,[snapshotRaw]);
  },30000);
  afterAll(async()=>{await Promise.all(pools.map(pool=>pool.end()));},30000);

  it('applies all nine real SQL migrations and FORCE RLS policies',async()=>{
    const r=await admin.query(`SELECT relrowsecurity,relforcerowsecurity FROM pg_class
      WHERE oid='api_personal_records'::regclass`);
    expect(r.rows[0]).toEqual({relrowsecurity:true,relforcerowsecurity:true});
    expect((await admin.query(`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'`)).rows[0]?.n).toBeGreaterThan(15);
  });
  it('writes through the least-privileged personal adapter without grant UPDATE rights',async()=>{
    const store=new PostgresPersonalStateStore(adapter(writer),undefined,{isApproved:async()=>true});
    const created=await store.create({scope,itemId:'SYN-PERSONAL',value:{kind:'EXPERIENCE',
      dataMode:'SYNTHETIC',title:'SYNTHETIC integration',summary:'Only synthetic PG validation'}});
    expect(created.version).toBe(1);
    expect((await store.read({scope,kind:'EXPERIENCE',itemId:'SYN-PERSONAL'}))?.version).toBe(1);
    await expect(writer.query(`UPDATE api_sharing_grants SET version='bypass'`)).rejects.toMatchObject({code:'42501'});
    // The adapter's SET LOCAL actor/scope is gone after COMMIT.
    expect((await writer.query('SELECT * FROM api_personal_records')).rows).toEqual([]);
  });
  it('performs the atomic authorized projection read with the read-only role',async()=>{
    const repo=new PostgresApiProjectionRepository(adapter(reader),now);
    expect((await repo.readAuthorizedSnapshot(scope))?.demoSubjectId).toBe('S01');
    expect(await repo.readAuthorizedSnapshot({...scope,actorId:'SYNTHETIC-OTHER'})).toBeNull();
    await expect(reader.query('SELECT * FROM source_revisions_vnext')).rejects.toMatchObject({code:'42501'});
  });
  it('enforces the distributed limit on twelve concurrent real connections',async()=>{
    const key=randomBytes(32),at=now();
    const first=new PostgresAuthAttemptLimiter(adapter(limiter),key);
    const second=new PostgresAuthAttemptLimiter(adapter(limiter),key);
    const result=await Promise.all(Array.from({length:12},(_,i)=>(i%2?first:second).consume({
      kind:'GOOGLE_START',identifier:'SYNTHETIC:IP',at,
    })));
    expect(result.filter(Boolean)).toHaveLength(10);
    expect((await admin.query('SELECT attempts FROM auth_attempt_windows')).rows[0]?.attempts).toBe(10);
  });
  it('executes permission/asOf/academic-scope SQL and never revives a retracted source',async()=>{
    const old=new Date(Date.now()-60_000).toISOString();
    const fresh=new Date(Date.now()-30_000).toISOString();
    await admin.query(`INSERT INTO source_revisions_vnext(
      revision_id,source_id,original_sha256,content_sha256,media_kind,source_class,
      permission_ref,provenance,status,change_kind,fetched_at,last_checked_at,
      last_verified_at,scope_campuses,scope_majors,scope_major_roles,
      scope_admission_types,scope_graduation_terms,cohort_min)
      VALUES('SYN-R1','SYN-S1',repeat('a',64),repeat('b',64),'TEXT','SYNTHETIC',
        'SYN-PERM','SYNTHETIC','ACTIVE','NEW',$1,$1,$1,
        ARRAY['SEOUL'],ARRAY['ECON'],ARRAY['PRIMARY'],ARRAY['GENERAL'],ARRAY['2026-2'],2020)`,[old]);
    await admin.query(`INSERT INTO source_paragraphs_vnext VALUES('SYN-R1','SYN-P1','SYNTHETIC evidence paragraph')`);
    const service=new PostgresTemporalEvidenceReader(adapter(temporal));
    const policy={permissionRefs:new Set(['SYN-PERM']),campus:'SEOUL',
      majors:[{code:'ECON',role:'PRIMARY' as const}],admissionType:'GENERAL',
      graduationTerm:'2026-2',graduationTermVerified:true,cohort:2024,
      asOf:now(),query:'SYNTHETIC evidence'};
    expect((await service.retrieve(policy)).hits).toHaveLength(1);
    expect((await service.retrieve({...policy,graduationTermVerified:false})).hits).toHaveLength(0);
    expect((await service.retrieve({...policy,permissionRefs:new Set(['SYN-OTHER'])})).hits).toHaveLength(0);
    await admin.query(`INSERT INTO source_revisions_vnext(
      revision_id,source_id,supersedes,original_sha256,content_sha256,media_kind,
      source_class,permission_ref,provenance,status,change_kind,fetched_at,last_checked_at)
      VALUES('SYN-R2','SYN-S1','SYN-R1',repeat('c',64),repeat('d',64),'TEXT',
        'SYNTHETIC','SYN-PERM','SYNTHETIC','RETRACTED','CANCELLED',$1,$1)`,[fresh]);
    expect((await service.retrieve({...policy,asOf:now()})).hits).toHaveLength(0);
    await expect(admin.query(`UPDATE source_revisions_vnext SET status='ACTIVE' WHERE revision_id='SYN-R1'`)).rejects.toThrow('immutable evidence history');
  });
});