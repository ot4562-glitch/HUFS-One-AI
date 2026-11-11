/** Actual local PostgreSQL proof, synthetic only. Requires a fresh empty database;
 * never resets/drops a database or changes application/production resources. */
import {readFileSync} from 'node:fs';
import {createHash,createHmac,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {doubleMajorInput} from './owner-double-major-fixture.js';
import {createPostgresOwnerDoubleMajorServices} from '../../apps/api/src/modules/academics/owner-double-major-postgres.js';
import {PostgresOwnerStudyPlanSnapshotLoader} from '../../apps/api/src/modules/academics/owner-study-plan-postgres.js';
import {createTrustedOwnerStudyPlanSource} from '../../apps/api/src/modules/academics/owner-study-plan-source.js';
import {PostgresEvidenceRightsResolver} from '../../apps/api/src/modules/opportunities/rights-postgres.js';
import {canonicalProjectionHash,PostgresApprovedOwnerReader} from '../../apps/api/src/modules/opportunities/owner-catalog-postgres.js';
import {PostgresOwnerCounselingQuota} from '../../apps/api/src/modules/owner-counseling-quota-postgres.js';
import type {OwnerCatalogAuthority} from '../../apps/api/src/modules/opportunities/owner-catalog-postgres.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';
import {proveOwnerStudyPlanPg} from './owner-study-plan-live-slice.js';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {createPostgresPlatformServices} from '../../apps/api/src/platform-postgres.js';
import {ownerOpportunity} from './owner-recommendations-fixture.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {HufsApiClient} from '../../apps/web/src/integrations/api-client.js';
import {OwnerSessionController} from '../../apps/web/src/app/owner-session-controller.js';
import type {VerifiedActor} from '../../apps/api/src/types.js';

const RUN=process.env.HUFS_PG_OWNER_ACADEMICS_LIVE==='1';
const pools:Pool[]=[];
const password=randomBytes(24).toString('hex');
let admin:Pool,reader:Pool,writer:Pool,quotaReader:Pool;
const now=()=>new Date().toISOString();
const migrations=['20261031_temporal_evidence.sql','20261101_source_review.sql','20261105_source_image_evidence.sql',
  '20261109_source_image_ocr_unique.sql','20261105_source_pdf_evidence.sql',
  '20261101_verified_source_rights.sql','20261101_self_account.sql','20261101_self_workspace.sql',
  '20261101_self_workspace_tombstones.sql','20261101_experience_tag_approval.sql',
  '20261101_owner_approved_catalog.sql','20261109_owner_counseling_quota.sql',
  '20261111_owner_v2_projection_kind.sql'];
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
        api_self_consents,api_self_profiles,api_self_workspace_records,api_experience_tag_approvals,source_revisions_vnext,source_effective_revisions_vnext,
        source_ingest_heads,source_review_attestations_vnext,source_rights_receipts,source_rights_revocations,
        source_actor_scope_receipts,source_actor_scope_revocations TO hufs_test_owner_academics;
      GRANT SELECT(revision_id,original_sha256) ON source_originals_vnext TO hufs_test_owner_academics;`);
    reader=pool(url,'hufs_test_owner_academics');
    await admin.query(`CREATE ROLE hufs_test_owner_recommendation_writer LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      GRANT USAGE ON SCHEMA public TO hufs_test_owner_recommendation_writer;
      GRANT SELECT,INSERT,UPDATE ON api_self_consents TO hufs_test_owner_recommendation_writer;
      GRANT SELECT,INSERT,UPDATE,DELETE ON api_self_profiles,api_self_workspace_records,api_experience_tag_approvals TO hufs_test_owner_recommendation_writer;
      GRANT INSERT ON api_self_consent_events,api_self_workspace_events,api_experience_tag_events TO hufs_test_owner_recommendation_writer;`);
    writer=pool(url,'hufs_test_owner_recommendation_writer');
    // Disposable synthetic role: only EXECUTE, never access to quota rows or actor digests.
    await admin.query(`CREATE ROLE hufs_test_owner_counseling_quota LOGIN PASSWORD '${password}'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      GRANT USAGE ON SCHEMA public TO hufs_test_owner_counseling_quota;
      GRANT EXECUTE ON FUNCTION public.consume_owner_counseling_quota(char(64))
        TO hufs_test_owner_counseling_quota`);
    quotaReader=pool(url,'hufs_test_owner_counseling_quota');
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
    const authority:OwnerCatalogAuthority={resolve:({actorId,now})=>resolver.resolveFor({actor:{actorId,role:'BETA',sessionIdHash:'SYN-SESSION-HASH',csrfToken:'C'.repeat(32),
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
    const insert=async(kind:string,entity:string,value:unknown,id:string,sourceRefs:readonly typeof source[]=[source])=>{
      await admin.query(`INSERT INTO api_owner_approved_projections(projection_id,actor_id,kind,entity_id,version,payload_json,payload_sha256,sources_json,
        reviewed_by,reviewed_at,as_of,starts_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'SYN-INDEPENDENT-OPERATOR',$9,$9,$9,$10)`,
      [id,actorId,kind,entity,id+'-V1',value,canonicalProjectionHash(value),JSON.stringify(sourceRefs),before,expires]);
      await admin.query('INSERT INTO api_owner_approved_heads(actor_id,kind,entity_id,projection_id) VALUES($1,$2,$3,$4)',[actorId,kind,entity,id]);
    };
    await insert('PLAN_INPUT','CURRENT_DOUBLE_MAJOR',payload,actorId+'-INPUT');
    return {actorId,sourceId,revisionId,permissionRef,before,expires,authority,insert,
      services:createPostgresOwnerDoubleMajorServices({pool:adapter(reader),authority})};
  }
  it('applies reviewed V2_CATALOG kind to real disposable PostgreSQL without weakening RLS',async()=>{
    const c=await admin.connect();
    try{
      await c.query('BEGIN');
      const kind=await c.query(`SELECT pg_get_constraintdef(oid) AS definition
        FROM pg_constraint WHERE conrelid='public.api_owner_approved_projections'::regclass
          AND conname='api_owner_approved_projections_kind_check'`);
      expect(kind.rows).toHaveLength(1);
      expect(kind.rows[0]?.definition).toContain('V2_CATALOG');
      const value=await c.query(`INSERT INTO public.api_owner_approved_projections
        (projection_id,actor_id,kind,entity_id,version,payload_json,payload_sha256,
          sources_json,reviewed_by,reviewed_at,as_of,starts_at,expires_at)
        VALUES('SYN-V2-P','SYN-V2-OWNER','V2_CATALOG','SYN-V2-OP','v1',$1::jsonb,$2,
          $3::jsonb,'SYN-REVIEWER','2026-01-01T00:00:00Z','2026-01-02T00:00:00Z',
          '2026-01-01T00:00:00Z','2027-01-01T00:00:00Z')
        RETURNING kind`,[
        JSON.stringify({id:'SYN-V2-OP'}),
        'a'.repeat(64),
        JSON.stringify([{sourceId:'SYN-S',revisionId:'SYN-R',permissionRef:'SYN-P'}]),
      ]);
      expect(value.rows[0]?.kind).toBe('V2_CATALOG');
      const security=await c.query(`SELECT relrowsecurity,relforcerowsecurity
        FROM pg_class WHERE oid='public.api_owner_approved_projections'::regclass`);
      expect(security.rows[0]).toMatchObject({
        relrowsecurity:true,relforcerowsecurity:true,
      });
    }finally{
      await c.query('ROLLBACK');
      c.release();
    }
    // No synthetic source, actor or V2 projection survives this contract test.
    const remaining=await admin.query(`SELECT count(*)::integer AS n
      FROM public.api_owner_approved_projections WHERE kind='V2_CATALOG'`);
    expect(remaining.rows[0]?.n).toBe(0);
  });

  it('pages 1,250 PostgreSQL V2 approved heads with bounded SQL keysets and RLS',async()=>{
    const f=await seed('KEYSET'),ref={
      sourceId:f.sourceId,revisionId:f.revisionId,permissionRef:f.permissionRef,
    };
    const entries=Array.from({length:1250},(_,i)=>{
      const entity='SYN-PAGE-'+String(i).padStart(5,'0');
      const payload={id:entity,source:ref,permitted:true,title:'Synthetic V2 row'};
      return {entity_id:entity,projection_id:'SYN-V2-KEY-'+String(i).padStart(5,'0'),
        payload_json:payload,payload_sha256:canonicalProjectionHash(payload)};
    });
    // Batch insert into a disposable DB only: no fixture or real source seed.
    await admin.query(`INSERT INTO api_owner_approved_projections(
      projection_id,actor_id,kind,entity_id,version,payload_json,payload_sha256,
      sources_json,reviewed_by,reviewed_at,as_of,starts_at,expires_at)
      SELECT r.projection_id,$2,'V2_CATALOG',r.entity_id,'SYN-REVIEW-V1',
        r.payload_json,r.payload_sha256,$3::jsonb,'SYN-INDEPENDENT-OPERATOR',
        $4::timestamptz,$4::timestamptz,$4::timestamptz,$5::timestamptz
      FROM jsonb_to_recordset($1::jsonb) AS r(
        entity_id text,projection_id text,payload_json jsonb,payload_sha256 text)`,
    [JSON.stringify(entries),f.actorId,JSON.stringify([ref]),f.before,f.expires]);
    await admin.query(`INSERT INTO api_owner_approved_heads(
      actor_id,kind,entity_id,projection_id)
      SELECT $2,'V2_CATALOG',r.entity_id,r.projection_id
      FROM jsonb_to_recordset($1::jsonb) AS r(entity_id text,projection_id text)`,
    [JSON.stringify(entries.map(({entity_id,projection_id})=>({entity_id,projection_id}))),
      f.actorId]);
    const loader=new PostgresApprovedOwnerReader(adapter(reader),f.authority);
    let afterId:string|undefined,iterations=0;
    const seen:string[]=[];
    const wallStart=performance.now(),heapStart=process.memoryUsage().heapUsed;
    const at=now();
    while(iterations++<30){
      const result=await loader.readV2KeysetPage({
        actorId:f.actorId,asOf:at,pageSize:50,...(afterId?{afterEntityId:afterId}:{}),
      },at);
      expect(result).not.toBeNull();
      expect(result!.rows.length).toBeGreaterThan(0);
      expect(result!.rows.length).toBeLessThanOrEqual(50);
      seen.push(...result!.rows.map(x=>x.entity_id));
      if(!result!.hasMore){
        expect(result!.nextAfterEntityId).toBeNull();
        break;
      }
      expect(result!.nextAfterEntityId).toBe(result!.rows.at(-1)?.entity_id);
      afterId=result!.nextAfterEntityId!;
    }
    expect(iterations).toBe(25);
    expect(seen).toEqual(entries.map(x=>x.entity_id));
    expect(new Set(seen).size).toBe(1250);
    // Query the actual index metadata; no requirement to force an index
    // through the PostgreSQL planner when its choice may be faster.
    const idx=await admin.query(`SELECT indexdef FROM pg_indexes
      WHERE schemaname='public' AND indexname='api_owner_v2_heads_keyset_idx'`);
    expect(idx.rows).toHaveLength(1);
    expect(idx.rows[0]?.indexdef).toContain('COLLATE "C"');
    const analyze=await reader.connect();
    let plan:Record<string,unknown>|undefined;
    try{
      await analyze.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await analyze.query("SELECT set_config('hufs.self_actor',$1,true)",[f.actorId]);
      const details=await analyze.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT h.entity_id FROM api_owner_approved_heads h
        WHERE h.actor_id=$1 AND h.kind='V2_CATALOG'
          AND h.entity_id COLLATE "C" > ($2::text COLLATE "C")
        ORDER BY h.entity_id COLLATE "C" LIMIT 51`,
      [f.actorId,'SYN-PAGE-01199']);
      plan=(details.rows[0]?.['QUERY PLAN'] as Record<string,unknown>[]|undefined)?.[0];
      expect(plan?.['Execution Time']).toEqual(expect.any(Number));
    }finally{
      await analyze.query('ROLLBACK');
      analyze.release();
    }
    const elapsedMs=Number((performance.now()-wallStart).toFixed(2));
    console.info('SYN-PG KEYSET #447',JSON.stringify({
      rows:seen.length,pages:iterations,pageSize:50,
      wallMs:elapsedMs,heapDeltaBytes:process.memoryUsage().heapUsed-heapStart,
      sqlIndexProbeMs:plan?.['Execution Time'],planNode:(plan?.Plan as {['Node Type']?:string}|undefined)?.['Node Type'],
      strategy:'repeatable-read authorized SQL lookahead, per-page',
    }));
    // Fresh source withdrawal invalidates all later pages rather than
    // returning a cached identity/source-policy success.
    await admin.query(`INSERT INTO source_rights_revocations(
      receipt_id,revoked_by,revoked_at,reason_ref)
      VALUES($1,'SYN-OPERATOR',clock_timestamp(),'SYN-KEYSET-REVOKE')`,
    [f.actorId+'-RIGHTS']);
    const blocked=await loader.readV2KeysetPage({
      actorId:f.actorId,asOf:at,pageSize:50,
    },now());
    expect(blocked).toBeNull();
  },90000);

  it('benchmarks actual PostgreSQL owner batch proofs for 1/100/500 projections with 100 shared refs',async()=>{
    const f=await seed('BATCH'),ref={sourceId:f.sourceId,revisionId:f.revisionId,permissionRef:f.permissionRef};
    const refs=Array.from({length:100},()=>({...ref}));
    let existing=0,proofReads=0,explain=false;
    let explainPlan:Record<string,unknown>|null=null;
    const counted:ReviewerSqlPool={connect:async()=>{
      const c=await reader.connect();
      return {query:async(sql,params=[])=>{
        if(sql.includes('FROM jsonb_to_recordset(')){
          proofReads++;
          if(explain){
            const p=await c.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+sql,[...params]);
            explainPlan=(p.rows[0]?.['QUERY PLAN'] as Array<Record<string,unknown>>|undefined)?.[0]??null;
          }
        }
        return {rows:(await c.query(sql,[...params])).rows};
      },release:()=>c.release()};
    }};
    const loader=new PostgresApprovedOwnerReader(counted,f.authority);
    for(const count of [1,100,500]){
      while(existing<count){
        const id='SYN-BATCH-COURSE-'+existing;
        await f.insert('COURSE',id,{courseId:id,source:ref},'SYN-BATCH-PROJECTION-'+existing,refs);
        existing++;
      }
      proofReads=0;explain=count===500;explainPlan=null;
      const start=performance.now(),heapStart=process.memoryUsage().heapUsed;
      const at=now();
      const found=await loader.read({actorId:f.actorId,kind:'COURSE',asOf:at},at);
      const wallMs=performance.now()-start,heapDelta=process.memoryUsage().heapUsed-heapStart;
      expect(found?.rows).toHaveLength(count);
      expect(proofReads).toBe(1); // 500x100 repeated refs => ONE DB proof SELECT.
      if(explain){
        expect(explainPlan?.['Execution Time']).toEqual(expect.any(Number));
        expect(explainPlan?.['Plan']).toBeDefined();
      }
      // Real disposable PostgreSQL observations, not synthetic mock timing or a production SLA.
      console.info('SYN-PG #430',JSON.stringify({projections:count,refsPerProjection:100,
        distinctSourceRefs:1,proofSelectCount:proofReads,wallMs:Number(wallMs.toFixed(2)),
        heapDeltaBytes:heapDelta,
        ...(explainPlan?{explainExecutionMs:explainPlan['Execution Time']}:{}),
      }));
    }
    // Latest source-rights withdrawal must invalidate the batch as a whole.
    await admin.query(`INSERT INTO source_rights_revocations
      (receipt_id,revoked_by,revoked_at,reason_ref)
      VALUES($1,'SYN-OPERATOR',clock_timestamp(),'SYN-TEST-BATCH-WITHDRAW')`,
    [f.actorId+'-RIGHTS']);
    const at=now();
    expect(await loader.read({actorId:f.actorId,kind:'COURSE',asOf:at},at)).toBeNull();
  },90000);

  it('enforces counseling quota atomically across actual PostgreSQL API replicas and hides actor digests',async()=>{
    const key=Buffer.alloc(32,13),poolAdapter=adapter(quotaReader);
    const replica1=new PostgresOwnerCounselingQuota(poolAdapter,key);
    const replica2=new PostgresOwnerCounselingQuota(poolAdapter,Buffer.from(key));
    const a='SYN-OWNER-COUNSEL-QUOTA-A',b='SYN-OWNER-COUNSEL-QUOTA-B';
    const request=(actorId:string)=>({actorId,operation:'V2_OWNER_COUNSELING' as const,now:now()});
    const responses=await Promise.all(Array.from({length:50},(_,i)=>
      (i%2?replica1:replica2).consume(request(a))));
    const secondActor=await replica2.consume(request(b));
    expect(secondActor).toBe(true); // Another actor remains authorized.
    const digest=(actorId:string)=>createHmac('sha256',key)
      .update('hufs-one:owner-counseling:actor:v1\0').update(actorId,'utf8').digest('hex');
    const receipts=await admin.query(`SELECT identity_digest,window_start,uses
      FROM public.owner_counseling_quota_windows WHERE identity_digest=$1 ORDER BY window_start`,
    [digest(a)]);
    expect(receipts.rows.length).toBeGreaterThanOrEqual(1);
    expect(receipts.rows.every(row=>Number(row.uses)>=1&&Number(row.uses)<=30)).toBe(true);
    expect(receipts.rows.reduce((sum,row)=>sum+Number(row.uses),0))
      .toBe(responses.filter(Boolean).length);
    if(receipts.rows.length===1){
      expect(responses.filter(Boolean)).toHaveLength(30);
      expect(responses.filter(x=>!x)).toHaveLength(20);
    }
    const other=await admin.query('SELECT uses FROM public.owner_counseling_quota_windows WHERE identity_digest=$1',
      [digest(b)]);
    expect(other.rows).toHaveLength(1);
    expect(Number(other.rows[0]!.uses)).toBe(1);
    await expect(quotaReader.query('SELECT identity_digest FROM public.owner_counseling_quota_windows'))
      .rejects.toMatchObject({code:'42501'});
    await expect(quotaReader.query('UPDATE public.owner_counseling_quota_windows SET uses=1'))
      .rejects.toMatchObject({code:'42501'});
    console.info('SYN-PG #433',JSON.stringify({requests:responses.length,
      admitted:responses.filter(Boolean).length,denied:responses.filter(x=>!x).length,
      dbWindows:receipts.rows.length,otherActorAdmitted:secondActor,
    }));
  },60000);

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
  it('checks saved plan CRUD through independent PG services and separate API process restarts',async()=>{
    await proveOwnerStudyPlanPg({admin,reader,fixture:await seed('STUDYPLANS'),databaseUrl:databaseUrl(),password,adapter});
  },60000);
  it('connects owner CRUD, explicit experience approval, feed/explanation and two real process lifetimes',async()=>{
    const f=await seed('RECOMMENDATIONS'),origin='https://synthetic.invalid',token=randomBytes(32).toString('hex');
    const actor={actorId:f.actorId,role:'BETA' as const,sessionIdHash:token,csrfToken:token,betaAllowed:true,
      sessionExpiresAt:f.expires,schoolMailProofExpiresAt:f.expires};
    let identity:typeof actor|null=actor,ownerAllowed=true,coreApproved=true;
    let duringApproval:(()=>Promise<void>)|undefined;
    for(const [id,topics] of [['SYN-A',['AI_ML']],['SYN-B',['TRADE_OVERSEAS']]] as const){
      const opportunity={...ownerOpportunity(id,[...topics]),sourceSnapshotId:f.revisionId,applyClosesAt:f.expires,
        conditions:id==='SYN-A'?[{field:'cohort' as const,operator:'GTE' as const,value:2024,evidenceId:'SYN-COHORT'}]:[]};
      await f.insert('OPPORTUNITY',id,{opportunity,source:{sourceId:f.sourceId,revisionId:f.revisionId,
        permissionRef:f.permissionRef,status:'SYNTHETIC'}},f.actorId+'-'+id);
    }
    const mayOwn=async({actorId}:{actorId:string})=>ownerAllowed&&actorId===f.actorId;
    const sql=adapter(reader),write=adapter(writer),rights=new PostgresEvidenceRightsResolver(sql);
    const open=()=>createIntegratedApi({allowedOrigin:origin,now,
      ...createPostgresPlatformServices({pools:{projections:sql,calendar:sql,evidence:sql,personal:write},evidenceRights:rights,
        selfAccount:{pool:write,authority:{mayAccess:mayOwn}},ownerWorkspace:{pool:write,authority:{mayOperate:mayOwn}},
        experienceApproval:{pool:write,authority:{mayOperate:mayOwn}},ownerRecommendations:{pool:sql,authority:f.authority,
          ownerAuthority:{mayRead:mayOwn},approval:{isApproved:async()=>{await duringApproval?.();return coreApproved;}}},now}),
      auth:{verifySession:async()=>identity,revokeSession:async()=>{}}});
    const app=open();
    const headers={origin,'x-csrf-token':token};
    const profile={displayName:'SYN-PRIVATE-NAME',interestTopics:['AI_ML'],desiredJobTopics:[]};
    const experience={kind:'EXPERIENCE',dataMode:'OWNER_CONSENTED',state:'DRAFT',title:'SYN-PRIVATE-EXPERIENCE',summary:'SYN-PRIVATE-BODY'};
    const feed=async()=>{
      // Both PG and Node use the host clock, but Windows exposes different
      // precision. Establish that the HTTP asOf is AFTER all completed writes;
      // the separate old-asOf assertion below still requires a 409.
      const observed=(await admin.query('SELECT clock_timestamp() AS at')).rows[0]!.at as Date;
      const deadline=Date.now()+1000;
      while(Date.now()<=observed.getTime()){
        if(Date.now()>deadline)throw new Error('Synthetic database/API clocks disagree');
        await new Promise(resolve=>setTimeout(resolve,2));
      }
      const response=await app.inject({url:'/api/owner/feed'});expect(response.statusCode,response.body).toBe(200);return response.json();
    };
    try{
      expect((await app.inject({method:'PATCH',url:'/api/profile',payload:{expectedVersion:0,value:profile}})).statusCode).toBe(403);
      const saved=await app.inject({method:'PATCH',url:'/api/profile',headers,payload:{expectedVersion:0,value:profile}});
      expect(saved.statusCode,saved.body).toBe(200);
      const first=await feed();expect(first.feed.featured.map((c:any)=>c.opportunityId)).toEqual(['SYN-A']);
      expect(first.feed.featured[0].eligibility).toBe('ELIGIBLE');
      const explain=(snapshot:any)=>({asOf:snapshot.feed.asOf,sourceRevisionId:f.revisionId,
        rankConfigVersion:snapshot.rankConfigVersion,expectedFeedVersion:snapshot.version});
      const reason=await app.inject({method:'POST',url:'/api/opportunities/SYN-B/explanation',headers,payload:explain(first)});
      expect(reason.statusCode,reason.body).toBe(200);expect(reason.json()).toMatchObject({state:'NOT_FEATURED',reason:'LOW_RELEVANCE'});
      expect(reason.body+JSON.stringify(first)).not.toMatch(/SYN-PRIVATE|actorId|profile_json|sourceReceipt/);
      const created=await app.inject({method:'POST',url:'/api/experience/cards',headers,payload:{itemId:'SYN-EXP',value:experience}});
      expect(created.statusCode,created.body).toBe(201);
      const approve=async(version:number,content:number)=>app.inject({method:'PUT',url:'/api/experience/cards/SYN-EXP/tag-approval',headers,
        payload:{expectedApprovalVersion:version,expectedContentVersion:content,expectedConsentVersion:1,topics:['TRADE_OVERSEAS']}});
      const approved=await approve(0,1);expect(approved.statusCode,approved.body).toBe(200);
      const second=await feed();expect(new Set(second.feed.featured.map((c:any)=>c.opportunityId))).toEqual(new Set(['SYN-A','SYN-B']));
      expect(second.version).not.toBe(first.version);
      const edited=await app.inject({method:'PATCH',url:'/api/experience/cards/SYN-EXP',headers,payload:{expectedVersion:1,value:{...experience,summary:'SYN-PRIVATE-EDIT'}}});
      expect(edited.statusCode,edited.body).toBe(200);
      expect((await feed()).feed.featured.map((c:any)=>c.opportunityId)).toEqual(['SYN-A']);
      const inactive=(await app.inject({url:'/api/experience/cards/SYN-EXP/tag-approval'})).json().approval;
      expect(inactive.state).toBe('INACTIVE');
      const again=await approve(inactive.version,2);expect(again.statusCode,again.body).toBe(200);
      expect((await app.inject({method:'PATCH',url:'/api/profile',headers,payload:{expectedVersion:1,value:{...profile,interestTopics:[]}}})).statusCode).toBe(200);
      const final=await feed();expect(final.feed.featured.map((c:any)=>c.opportunityId)).toEqual(['SYN-B']);
      expect((await app.inject({method:'POST',url:'/api/opportunities/SYN-B/explanation',headers,
        payload:{...explain(final),expectedFeedVersion:first.version}})).statusCode).toBe(409);
      expect((await app.inject({url:'/api/owner/feed?asOf='+encodeURIComponent(first.feed.asOf)})).statusCode).toBe(409);

      // Each fork imports the actual built API in a fresh Node OS process.
      const readerUrl=databaseUrl();readerUrl.hostname='127.0.0.1';readerUrl.username='hufs_test_owner_academics';readerUrl.password=password;
      const restartRead=async()=>{
        const child=spawn(process.execPath,[fileURLToPath(new URL('./fixtures/owner-recommendations-pg-server.mjs',import.meta.url))],{
          windowsHide:true,stdio:['ignore','ignore','ignore','ipc'],
          env:{SystemRoot:process.env.SystemRoot,PATH:process.env.PATH,HUFS_SYN_REC_FIXTURE:'1',HUFS_SYN_REC_URL:readerUrl.toString(),
            HUFS_SYN_REC_ACTOR:f.actorId,HUFS_SYN_REC_TOKEN:token,HUFS_SYN_REC_EXPIRES:f.expires}});
        let exited=false;const exit=new Promise<void>(resolve=>child.once('close',()=>{exited=true;resolve();}));
        const startup=new Promise<number>((resolve,reject)=>{
          child.once('error',()=>reject(new Error('Synthetic child launch failed')));
          child.once('close',()=>reject(new Error('Synthetic child exited before ready')));
          child.once('message',(message:any)=>Number.isInteger(message?.port)?resolve(message.port):reject(new Error('Synthetic child unavailable')));
        });
        const deadline=setTimeout(()=>{child.kill();},15_000);
        try{
          const port=await startup,url=`http://127.0.0.1:${port}/api/owner/feed?asOf=${encodeURIComponent(final.feed.asOf)}`;
          const denied=await fetch(url,{headers:{cookie:'synthetic_session=wrong'},signal:AbortSignal.timeout(5000)});expect(denied.status).toBe(401);
          const response=await fetch(url,{headers:{cookie:`synthetic_session=${token}`},signal:AbortSignal.timeout(5000)});
          expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');
          expect(await response.json()).toEqual(final);
        }finally{
          if(!exited&&child.connected)child.send('STOP');
          await exit;clearTimeout(deadline);
        }
      };
      await restartRead();await restartRead();
      const other={...actor,actorId:'SYN-FOREIGN'};identity=other;
      expect((await app.inject({url:'/api/owner/feed'})).statusCode).toBe(403);identity=actor;
      ownerAllowed=false;expect((await app.inject({url:'/api/owner/feed'})).statusCode).toBe(403);ownerAllowed=true;
      coreApproved=false;expect((await app.inject({url:'/api/owner/feed'})).statusCode).toBe(503);coreApproved=true;
      const withdrawn=await app.inject({method:'PUT',url:'/api/consents',headers,payload:{expectedVersion:1,
        choices:{personalStorage:false,teamReview:false,externalAi:false,ncpStorage:false,presentation:false}}});
      expect(withdrawn.statusCode,withdrawn.body).toBe(200);
      expect((await app.inject({url:'/api/owner/feed'})).statusCode).toBe(403);
      expect((await app.inject({method:'POST',url:'/api/opportunities/SYN-B/explanation',headers,payload:explain(final)})).statusCode).toBe(403);
      // Restore consent only through a new explicit synthetic owner action.
      const restored=await app.inject({method:'PUT',url:'/api/consents',headers,payload:{expectedVersion:2,
        choices:{personalStorage:true,teamReview:false,externalAi:false,ncpStorage:false,presentation:false}}});
      expect(restored.statusCode,restored.body).toBe(200);
      expect((await feed()).feed.featured).toEqual([]); // no resurrected private profile/topics
      duringApproval=async()=>{duringApproval=undefined;await admin.query("INSERT INTO source_rights_revocations(receipt_id,revoked_by,revoked_at,reason_ref) VALUES($1,'SYN-OPERATOR',clock_timestamp(),'SYN-REVOKED')",[f.actorId+'-RIGHTS']);};
      expect((await app.inject({url:'/api/owner/feed'})).statusCode).toBe(403);
    }finally{await app.close();}
  },60000);
  it('restarts authenticated Fastify over real owner-approved RLS PostgreSQL and rejects revoked consent',async()=>{
    const f=await seed('BROWSER-E2E'),at=now(),origin='https://synthetic.invalid';
    const team={role:'BETA' as const,actorId:f.actorId,sessionIdHash:'H'.repeat(32),csrfToken:'C'.repeat(32),
      betaAllowed:true,sessionExpiresAt:f.expires,schoolMailProofExpiresAt:f.expires};
    let identity:VerifiedActor|null=team;
    const launch=()=>createIntegratedApi({allowedOrigin:origin,
      repository:new MemoryApiRepository({profiles:[]}),
      auth:{verifySession:async()=>identity,revokeSession:async()=>{identity=null;}},
      now:()=>at,
      doubleMajor:createPostgresOwnerDoubleMajorServices({pool:adapter(reader),authority:f.authority,now}),
    });
    let app=launch();
    const browser=()=>new HufsApiClient(async(url,init)=>{
      const headers:Record<string,string>={};
      new Headers(init.headers).forEach((v,k)=>{headers[k]=v;});
      const reply=await app.inject({url,method:init.method??'GET',
        headers:{...headers,cookie:'SYNTHETIC-SESSION',origin},
        ...(init.body===undefined?{}:{payload:JSON.parse(String(init.body))})});
      return new Response(reply.body,{status:reply.statusCode,headers:{'content-type':'application/json'}});
    });
    try{
      const api=browser(),session=new OwnerSessionController(api);
      await session.initialize();expect(session.getState().status).toBe('READY');
      const a=await session.runLatest('owner-academic',signal=>api.owner.getDoubleMajor(signal));
      expect(a).toMatchObject({state:'NEEDS_REVIEW',selection:'SELECTED',
        overlap:{status:'NO_APPROVED_RULE',sharedCreditUnits:6}});
      expect(JSON.stringify(a)).not.toMatch(/PRIVATE-ATTEMPT-TOKEN|SYN-SOURCE-RECEIPT|original_bytes/);
      await app.close();app=launch();
      const persisted=await browser().owner.getDoubleMajor();
      expect(persisted).toEqual(a);
      identity={...team,actorId:f.actorId+'-OTHER'};
      expect(await session.runLatest('owner-academic',signal=>api.owner.getDoubleMajor(signal))).toBeNull();
      expect(session.getState().status).toBe('SIGNED_OUT');
      await expect(browser().owner.getDoubleMajor()).rejects.toMatchObject({code:'FORBIDDEN'});
      identity=team;
      await admin.query("UPDATE api_self_consents SET choices_json=jsonb_set(choices_json,'{personalStorage}','false'),version=version+1,updated_at=clock_timestamp() WHERE actor_id=$1",[f.actorId]);
      await expect(browser().owner.getDoubleMajor()).rejects.toMatchObject({code:'FORBIDDEN'});
    }finally{await app.close();}
  });

});
