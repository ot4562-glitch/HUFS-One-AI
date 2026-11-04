/** Actual local PostgreSQL proof, synthetic only. Requires a fresh empty database;
 * never resets/drops a database or changes application/production resources. */
import {readFileSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {doubleMajorInput} from './owner-double-major-fixture.js';
import {createPostgresOwnerDoubleMajorServices} from '../../apps/api/src/modules/academics/owner-double-major-postgres.js';
import {PostgresOwnerStudyPlanSnapshotLoader} from '../../apps/api/src/modules/academics/owner-study-plan-postgres.js';
import {createTrustedOwnerStudyPlanSource} from '../../apps/api/src/modules/academics/owner-study-plan-source.js';
import {PostgresEvidenceRightsResolver} from '../../apps/api/src/modules/opportunities/rights-postgres.js';
import {canonicalProjectionHash} from '../../apps/api/src/modules/opportunities/owner-catalog-postgres.js';
import type {OwnerCatalogAuthority} from '../../apps/api/src/modules/opportunities/owner-catalog-postgres.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';

const RUN=process.env.HUFS_PG_OWNER_ACADEMICS_LIVE==='1';
const pools:Pool[]=[];
const password=randomBytes(24).toString('hex');
let admin:Pool,reader:Pool;
const now=()=>new Date().toISOString();
const migrations=['20261031_temporal_evidence.sql','20261101_source_review.sql',
  '20261101_verified_source_rights.sql','20261101_self_account.sql','20261101_self_workspace.sql',
  '20261101_owner_approved_catalog.sql'];
const adapter=(pool:Pool):ReviewerSqlPool=>({connect:async()=>{
  const client=await pool.connect();return {query:async(sql,params=[])=>({rows:(await client.query(sql,[...params])).rows}),release:()=>client.release()};
}});
function databaseUrl(){
  const raw=process.env.HUFS_PG_OWNER_ACADEMICS_URL;
  if(!raw)throw new Error('Explicit isolated owner-academics PostgreSQL URL required');
  const url=new URL(raw);
  if(!['postgres:','postgresql:'].includes(url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||
    url.port!=='15439'||url.pathname!=='/hufs_one_owner_academics_test'||url.search||url.hash||!url.username)
    throw new Error('Refusing non-loopback/non-owner-academics test database');
  return url;
}
function pool(url:URL,role?:string){
  const target=new URL(url);
  if(role){target.username=role;target.password=password;}
  const value=new Pool({connectionString:target.toString(),ssl:false,max:4,connectionTimeoutMillis:3000,statement_timeout:5000});
  pools.push(value);return value;
}
describe.skipIf(!RUN)('REAL PostgreSQL: approved owner double-major and study-plan adapters',()=>{
  beforeAll(async()=>{
    const url=databaseUrl();admin=pool(url);
    const info=await admin.query(`SELECT current_database() AS name,current_setting('server_version_num')::int AS version`);
    if(info.rows[0]?.name!=='hufs_one_owner_academics_test'||info.rows[0]?.version<140000)throw new Error('Unsupported isolated PostgreSQL target');
    const existing=await admin.query(`SELECT
      (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace)+
      (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace) AS n`);
    if(Number(existing.rows[0]?.n)!==0)throw new Error('Owner-academics live-test database must be empty; preserve it and request a fresh database');
    const roles=await admin.query("SELECT 1 FROM pg_roles WHERE rolname='hufs_test_owner_academics'");
    if(roles.rows.length)throw new Error('Synthetic owner-academics role already exists; no role overwrite');
    for(const name of migrations)await admin.query(readFileSync(new URL('../../infra/sql/'+name,import.meta.url),'utf8'));
    // Random ephemeral synthetic role credential; never printed or persisted.
    await admin.query(`CREATE ROLE hufs_test_owner_academics LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      GRANT USAGE ON SCHEMA public TO hufs_test_owner_academics;
      GRANT SELECT ON api_owner_approved_projections,api_owner_approved_heads,api_owner_projection_revocations,
        api_self_consents,api_self_workspace_records,source_revisions_vnext,source_effective_revisions_vnext,
        source_ingest_heads,source_review_attestations_vnext,source_rights_receipts,source_rights_revocations,
        source_actor_scope_receipts,source_actor_scope_revocations TO hufs_test_owner_academics;
      GRANT SELECT(revision_id,original_sha256) ON source_originals_vnext TO hufs_test_owner_academics;`);
    reader=pool(url,'hufs_test_owner_academics');
  },30000);
  afterAll(async()=>{await Promise.all(pools.map(value=>value.end()));},10000);

  async function seed(suffix:string){
    const actorId='SYN-ACADEMIC-'+suffix,sourceId=actorId+'-SOURCE',revisionId=actorId+'-REV',permissionRef=actorId+'-PERM';
    const before=new Date(Date.now()-60_000).toISOString(),expires=new Date(Date.now()+3_600_000).toISOString();
    const original=Buffer.from('SYNTHETIC academic rule source; no real students or school rules.');
    const sha=createHash('sha256').update(original).digest('hex');
    await admin.query(`INSERT INTO source_revisions_vnext(revision_id,source_id,original_sha256,content_sha256,media_kind,source_class,
      permission_ref,provenance,status,change_kind,fetched_at,last_checked_at,last_verified_at,scope_campuses,scope_majors,scope_major_roles,cohort_min,cohort_max)
      VALUES($1,$2,$3,$3,'TEXT','SYNTHETIC',$4,'SYNTHETIC','ACTIVE','NEW',$5,$5,$5,ARRAY['SEOUL'],ARRAY['SYN-P','SYN-D'],ARRAY['PRIMARY','DOUBLE'],2024,2024)`,[revisionId,sourceId,sha,permissionRef,before]);
    await admin.query('INSERT INTO source_ingest_heads(source_id,revision_id,fetched_at,last_checked_at) VALUES($1,$2,$3,$3)',[sourceId,revisionId,before]);
    await admin.query('INSERT INTO source_originals_vnext(revision_id,original_sha256,original_bytes,captured_at) VALUES($1,$2,$3,$4)',[revisionId,sha,original,before]);
    await admin.query(`INSERT INTO source_review_attestations_vnext(review_id,revision_id,reviewer_id,decision,checked_at,original_sha256,content_sha256,permission_policy_version)
      VALUES($1,$2,'SYN-INDEPENDENT-REVIEWER','APPROVED',$3,$4,$4,'SYN-REVIEW-1')`,[actorId+'-REVIEW',revisionId,before,sha]);
    await admin.query(`INSERT INTO source_rights_receipts(receipt_id,actor_id,source_id,permission_ref,canonical_url,purposes,reviewed_by,reviewed_at,starts_at,expires_at,policy_version)
      VALUES($1,$2,$3,$4,'https://synthetic.invalid/rules',ARRAY['SEARCH'],'SYN-INDEPENDENT-OPERATOR',$5,$5,$6,'SYN-RIGHTS-1')`,[actorId+'-RIGHTS',actorId,sourceId,permissionRef,before,expires]);
    await admin.query(`INSERT INTO source_actor_scope_receipts(scope_receipt_id,actor_id,scope_json,reviewed_by,reviewed_at,starts_at,expires_at,scope_version)
      VALUES($1,$2,$3,'SYN-INDEPENDENT-OPERATOR',$4,$4,$5,'SYN-SCOPE-1')`,[actorId+'-SCOPE',actorId,
      {campus:'SEOUL',cohort:2024,admissionType:'REGULAR',majors:[{code:'SYN-P',role:'PRIMARY'},{code:'SYN-D',role:'DOUBLE'}]},before,expires]);
    await admin.query('INSERT INTO api_self_consents(actor_id,version,choices_json,updated_at) VALUES($1,1,$2,$3)',[actorId,
      {personalStorage:true,teamReview:false,externalAi:false,ncpStorage:false,presentation:false},before]);
    const resolver=new PostgresEvidenceRightsResolver(adapter(reader));
    const authority:OwnerCatalogAuthority={resolve:({actorId,now})=>resolver.resolveFor({actor:{actorId,role:'BETA',sessionIdHash:'SYN-SESSION-HASH',csrfToken:'SYN-CSRF-TOKEN-0000',
      sessionExpiresAt:expires,schoolMailProofExpiresAt:expires,betaAllowed:true},now})};
    const grants=await authority.resolve({actorId,now:now()});if(!grants)throw new Error('Synthetic source authority unavailable');
    const payload=doubleMajorInput(),source={sourceId,revisionId,permissionRef};
    payload.profile.source=source;payload.transcript.source=source;payload.approval.verifiedAt=before;payload.approval.sourceRightsVersion=grants.policyVersion;
    for(const binding of [payload.primary,payload.doubleMajor]){
      binding.source=source;binding.catalogSource=source;binding.pack.sourceDocumentSha256=sha;
      binding.pack.sourcePublishedAt=before;binding.pack.effectiveFrom=before;binding.pack.approvedAt=before;
      binding.pack.validationReport.checkedAt=before;binding.pack.validationReport.sourceDocumentSha256=sha;binding.trustedOriginal.sourceDocumentSha256=sha;
    }
    for(const link of payload.evidenceLinks)link.verifiedAt=before;
    const insert=async(kind:string,entity:string,value:unknown,id:string)=>{
      await admin.query(`INSERT INTO api_owner_approved_projections(projection_id,actor_id,kind,entity_id,version,payload_json,payload_sha256,sources_json,
        reviewed_by,reviewed_at,as_of,starts_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'SYN-INDEPENDENT-OPERATOR',$9,$9,$9,$10)`,
      [id,actorId,kind,entity,id+'-V1',value,canonicalProjectionHash(value),JSON.stringify([source]),before,expires]);
      await admin.query('INSERT INTO api_owner_approved_heads(actor_id,kind,entity_id,projection_id) VALUES($1,$2,$3,$4)',[actorId,kind,entity,id]);
    };
    await insert('PLAN_INPUT','CURRENT_DOUBLE_MAJOR',payload,actorId+'-INPUT');
    return {actorId,sourceId,revisionId,permissionRef,before,expires,authority,insert,
      services:createPostgresOwnerDoubleMajorServices({pool:adapter(reader),authority})};
  }
  it('runs the actual two-pack reader/rights SQL under a non-owner read-only RLS role',async()=>{
    const f=await seed('READ'),input={actorId:f.actorId,now:now()};
    expect(await f.services.rights.mayInspect(input)).toBe(true);
    const result=await f.services.source.inspect(input);
    expect(result.check).toMatchObject({selection:'SELECTED',state:'NEEDS_REVIEW',uniqueCredits:{earnedCreditUnits:6},
      overlap:{status:'NO_APPROVED_RULE',sharedCreditUnits:6}});
    const authorization=await f.services.rights.authorize({actorId:f.actorId,now:now(),sourceReceipt:result.receipt,check:result.check});
    expect(authorization.allowed).toBe(true);
    expect(await f.services.source.revalidate({actorId:f.actorId,now:now(),receipt:result.receipt})).toBe(true);
    expect(await f.services.rights.revalidate({actorId:f.actorId,now:now(),sourceReceipt:result.receipt,rightsReceipt:authorization.rightsReceipt!})).toBe(true);
    expect((await reader.query('SELECT projection_id FROM api_owner_approved_projections')).rows).toHaveLength(0);
    await expect(reader.query('SELECT original_bytes FROM source_originals_vnext')).rejects.toMatchObject({code:'42501'});
    await expect(reader.query('UPDATE api_owner_approved_heads SET projection_id=projection_id')).rejects.toMatchObject({code:'42501'});
    await expect(f.services.source.inspect({actorId:'SYN-FOREIGN',now:now()})).rejects.toThrow();
  });
  it('denies changed consent and changed current approved head on fresh receipt validation',async()=>{
    const c=await seed('CONSENT'),result=await c.services.source.inspect({actorId:c.actorId,now:now()});
    await admin.query("UPDATE api_self_consents SET choices_json=jsonb_set(choices_json,'{personalStorage}','false'),version=version+1,updated_at=clock_timestamp() WHERE actor_id=$1",[c.actorId]);
    expect(await c.services.source.revalidate({actorId:c.actorId,receipt:result.receipt,now:now()})).toBe(false);
    expect(await c.services.rights.mayInspect({actorId:c.actorId,now:now()})).toBe(false);
    const h=await seed('HEAD'),snapshot=await h.services.source.inspect({actorId:h.actorId,now:now()});
    await admin.query("DELETE FROM api_owner_approved_heads WHERE actor_id=$1 AND entity_id='CURRENT_DOUBLE_MAJOR'",[h.actorId]);
    expect(await h.services.source.revalidate({actorId:h.actorId,receipt:snapshot.receipt,now:now()})).toBe(false);
  });
  it('denies independently revoked actor scope and latest source rights without fallback to an older receipt',async()=>{
    const s=await seed('SCOPE'),snapshot=await s.services.source.inspect({actorId:s.actorId,now:now()});
    await admin.query("INSERT INTO source_actor_scope_revocations(scope_receipt_id,revoked_by,revoked_at,reason_ref) VALUES($1,'SYN-OPERATOR',clock_timestamp(),'SYN-REVOKED')",[s.actorId+'-SCOPE']);
    expect(await s.services.source.revalidate({actorId:s.actorId,receipt:snapshot.receipt,now:now()})).toBe(false);
    const r=await seed('RIGHTS'),checked=await r.services.source.inspect({actorId:r.actorId,now:now()});
    await admin.query(`INSERT INTO source_rights_receipts(receipt_id,actor_id,source_id,permission_ref,canonical_url,purposes,reviewed_by,reviewed_at,starts_at,expires_at,policy_version)
      VALUES($1,$2,$3,$4,'https://synthetic.invalid/rules',ARRAY['SEARCH'],'SYN-INDEPENDENT-OPERATOR',$5,$5,$6,'SYN-RIGHTS-2')`,[r.actorId+'-RIGHTS-NEW',r.actorId,r.sourceId,r.permissionRef,new Date(Date.now()-10_000).toISOString(),r.expires]);
    await admin.query("INSERT INTO source_rights_revocations(receipt_id,revoked_by,revoked_at,reason_ref) VALUES($1,'SYN-OPERATOR',clock_timestamp(),'SYN-REVOKED')",[r.actorId+'-RIGHTS-NEW']);
    expect(await r.services.source.revalidate({actorId:r.actorId,receipt:checked.receipt,now:now()})).toBe(false);
  });
  it('executes the existing owner study-plan loader/core through the same actual approved SQL reader',async()=>{
    const f=await seed('PLAN'),term='2027-1';
    const grants=await f.authority.resolve({actorId:f.actorId,now:now()});
    await f.insert('PLAN_INPUT',term,{term,transcript:{version:'SYN-T1',state:'APPROVED',attempts:[]},
      catalog:{version:'SYN-CATALOG',courseCreditUnits:{}},rulePack:{version:'SYN-TERM-RULES',state:'APPROVED',termRules:{creditCapUnits:36,capEvidenceRefs:['SYN-CAP']}},
      approval:{rulePackState:'APPROVED',rulePackVersion:'SYN-TERM-RULES',officialEvidenceRefs:['SYN-CAP'],verifiedAt:f.before,
        sourceRightsVersion:grants!.policyVersion,consentVersion:'1',coreVersion:'SYN-CORE-116'},
      evidenceLinks:[{evidenceRef:'SYN-CAP',href:'https://synthetic.invalid/cap',verifiedAt:f.before}],visibility:{mode:'OWNER_VERIFIED',allowedCourseRefs:[]}},f.actorId+'-PLAN-INPUT');
    const snapshots=new PostgresOwnerStudyPlanSnapshotLoader(adapter(reader),f.authority);
    const source=createTrustedOwnerStudyPlanSource({snapshots}),result=await source.inspect({actorId:f.actorId,term,now:now()});
    expect(result.check).toMatchObject({term,termLoadCreditUnits:0,creditCapUnits:36});
    expect(await source.revalidate({actorId:f.actorId,receipt:result.receipt,now:now()})).toBe(true);
  });
});
