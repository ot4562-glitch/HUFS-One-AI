/** Real PostgreSQL 18, ephemeral database, synthetic content only.
 * Exercises independent operator registration, forced RLS and payload erasure.
 * Never connects to a non-local or non-disposable destination. */
import {readFileSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {PostgresExperienceSkillInputRegistrar} from '../../apps/api/src/modules/ai/experience-skill-registration-postgres.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';

const RUN=process.env.HUFS_PG_FULL_LIVE==='1';
const suffix=randomBytes(5).toString('hex');
const database='hufs_ai_experience_'+suffix,login='hufs_ai_operator_'+suffix;
const password=randomBytes(20).toString('hex');
const actor='SYN-EXP-OWNER',source='SYN-EXP-SOURCE',revision='SYN-EXP-REV',permission='SYN-EXP-PERM';
let admin:Pool|undefined,db:Pool|undefined,writer:Pool|undefined,created=false,loginCreated=false,groupCreated=false;
const sqlFiles=[
  '20261031_temporal_evidence.sql','20261101_source_review.sql',
  '20261101_verified_source_rights.sql','20261101_self_account.sql',
  '20261101_self_workspace.sql','20261103_ai_provider_inputs.sql',
  '20261105_ai_consented_personal_inputs.sql','20261105_ai_experience_bindings.sql',
  '20261106_ai_experience_input_operator.sql',
];
function disposable():URL {
  const raw=process.env.HUFS_PG_FULL_URL;
  if(!raw)throw new Error('Disposable loopback admin URL required');
  const u=new URL(raw);
  if(!['postgres:','postgresql:'].includes(u.protocol)||u.hostname!=='127.0.0.1'
    ||(u.port&&u.port!=='5432')||u.pathname!=='/hufs_one_full_test'
    ||u.search||u.hash||u.username!=='hufs_local_admin')
    throw new Error('Refusing non-disposable PostgreSQL database');
  return u;
}
const adapt=(pool:Pool):ReviewerSqlPool=>({connect:async()=>{
  const c=await pool.connect();return {query:async(sql,params=[])=>({
    rows:(await c.query(sql,[...params])).rows,
  }),release:()=>c.release()};
}});
describe.skipIf(!RUN)('REAL disposable PostgreSQL: current owner AI experience operator',()=>{
  beforeAll(async()=>{
    const u=disposable();admin=new Pool({connectionString:u.toString(),max:1,connectionTimeoutMillis:3000});
    if((await admin.query("SELECT 1 FROM pg_roles WHERE rolname='hufs_ai_input_operator'")).rows.length)
      throw new Error('Preserve an existing operator role');
    await admin.query('CREATE DATABASE '+database);created=true;
    u.pathname='/'+database;
    db=new Pool({connectionString:u.toString(),max:2,connectionTimeoutMillis:3000});
    for(const name of sqlFiles)
      await db.query(readFileSync(new URL('../../infra/sql/'+name,import.meta.url),'utf8'));
    groupCreated=true;
    await admin.query(`CREATE ROLE ${login} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`);
    loginCreated=true;
    await admin.query(`GRANT hufs_ai_input_operator TO ${login}`);
    const link=new URL(u);link.username=login;link.password=password;
    writer=new Pool({connectionString:link.toString(),max:2,connectionTimeoutMillis:3000});
  },30000);
  afterAll(async()=>{
    await writer?.end();await db?.end();
    if(admin){
      if(created)await admin.query('DROP DATABASE '+database+' WITH (FORCE)');
      if(loginCreated)await admin.query('DROP ROLE '+login);
      if(groupCreated)await admin.query('DROP ROLE hufs_ai_input_operator');
      await admin.end();
    }
  },15000);

  it('registers a current reviewed owner experience and erases stale AI content on edit',async()=>{
    const t=Date.now(),at=(delta:number)=>new Date(t+delta).toISOString();
    const old=at(-180000),reviewed=at(-120000),accepted=at(-60000),until=at(3600000);
    const body=Buffer.from('SYNTHETIC OWNER-SUPPLIED EXPERIENCE; NO REAL PERSON OR SCHOOL RECORD');
    const digest=createHash('sha256').update(body).digest('hex');
    await db!.query(`INSERT INTO api_self_consents(actor_id,version,choices_json,updated_at)
      VALUES($1,1,$2,$3)`,[actor,{personalStorage:true,externalAi:true,teamReview:false,
        ncpStorage:false,presentation:false},old]);
    const value={kind:'EXPERIENCE',dataMode:'OWNER_CONSENTED',
      state:'SELF_REPORTED',title:'Synthetic activity',summary:'Analyzed a synthetic dataset'};
    await db!.query(`INSERT INTO api_self_workspace_records
      (actor_id,kind,item_id,version,value_json,updated_at)
      VALUES($1,'EXPERIENCE','SYN-EXPERIENCE',1,$2,$3)`,[actor,value,old]);
    await db!.query(`INSERT INTO source_revisions_vnext(
      revision_id,source_id,original_sha256,content_sha256,media_kind,
      source_class,permission_ref,provenance,status,change_kind,
      fetched_at,last_checked_at,last_verified_at)
      VALUES($1,$2,$3,$3,'TEXT','PERSONAL_CONSENTED',$4,
        'REAL_APPROVED','ACTIVE','NEW',$5,$5,$5)`,[revision,source,digest,permission,old]);
    await db!.query(`INSERT INTO source_ingest_heads
      (source_id,revision_id,fetched_at,last_checked_at) VALUES($1,$2,$3,$3)`,
    [source,revision,old]);
    await db!.query(`INSERT INTO source_originals_vnext
      (revision_id,original_sha256,original_bytes,captured_at)
      VALUES($1,$2,$3,$4)`,[revision,digest,body,old]);
    await db!.query(`INSERT INTO source_review_attestations_vnext
      (review_id,revision_id,reviewer_id,decision,checked_at,
      original_sha256,content_sha256,permission_policy_version)
      VALUES('SYN-REVIEW',$1,'SYN-INDEPENDENT-OPERATOR','APPROVED',
      $2,$3,$3,'SYN-RIGHTS-POLICY')`,[revision,reviewed,digest]);
    await db!.query(`INSERT INTO source_rights_receipts(
      receipt_id,actor_id,source_id,permission_ref,canonical_url,
      purposes,reviewed_by,reviewed_at,starts_at,expires_at,policy_version)
      VALUES('SYN-RECEIPT',$1,$2,$3,'https://synthetic.example.test/experience',
        ARRAY['STORE','EXTERNAL_TRANSFER'],'SYN-INDEPENDENT-OPERATOR',
        $4,$4,$5,'SYN-RIGHTS-POLICY')`,[actor,source,permission,old,until]);
    const now=at(0),register=new PostgresExperienceSkillInputRegistrar(adapt(writer!),{
      verify:async()=>true, // Synthetic operator registry simulation, never production approval.
    },'SYN-POLICY',()=>now);
    const result=await register.register({actorId:actor,experienceId:'SYN-EXPERIENCE',
      contentVersion:1,consentVersion:1,approvedBy:'SYN-INDEPENDENT-OPERATOR',
      approvedAt:accepted,privacyReviewRef:'SYN-PRIVACY-REVIEW',
      policyVersion:'SYN-POLICY',source:{sourceId:source,revisionId:revision,
        permissionRef:permission,originalSha256:digest},expiresAt:until});
    expect(result).toMatchObject({experienceId:'SYN-EXPERIENCE',contentVersion:1,consentVersion:1});
    const found=await db!.query(`SELECT projection_id,safe_packet,erased_at
      FROM api_ai_provider_inputs WHERE actor_id=$1`,[actor]);
    expect(found.rows).toHaveLength(1);
    expect(found.rows[0]?.safe_packet).toMatchObject({task:'experience_skills',
      providerInputClass:'PERSONAL_CONSENTED_CLEARED'});
    const conn=await writer!.connect();
    try{
      await conn.query('BEGIN');
      await conn.query("SELECT set_config('hufs.self_actor',$1,true)",[actor]);
      expect((await conn.query('SELECT projection_id FROM api_ai_provider_inputs')).rows).toHaveLength(1);
      await conn.query("SELECT set_config('hufs.self_actor','SYN-OTHER',true)");
      expect((await conn.query('SELECT projection_id FROM api_ai_provider_inputs')).rows).toHaveLength(0);
      await conn.query('ROLLBACK');
    }finally{conn.release();}
    await db!.query(`UPDATE api_self_workspace_records
      SET version=2,updated_at=clock_timestamp()
      WHERE actor_id=$1 AND item_id='SYN-EXPERIENCE'`,[actor]);
    const oldInput=(await db!.query('SELECT safe_packet,erased_at FROM api_ai_provider_inputs WHERE actor_id=$1',[actor])).rows[0];
    expect(oldInput.safe_packet).toBeNull();
    expect(oldInput.erased_at).not.toBeNull();
    expect((await db!.query('SELECT * FROM api_ai_provider_input_heads WHERE actor_id=$1',[actor])).rows).toHaveLength(0);
  },30000);
});
