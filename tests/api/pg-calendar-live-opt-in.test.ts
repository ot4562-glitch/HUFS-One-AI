/** Explicit real-PG opt-in; fresh EMPTY local database only, synthetic records only.
 * HUFS_PG_CALENDAR_LIVE=1 HUFS_PG_CALENDAR_URL=postgres://...@127.0.0.1:55432/hufs_one_calendar_test
 */
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import snapshotRaw from '../../packages/fixtures/synthetic/demo-snapshot.json';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {DemoContextSchema} from '@hufs-one/contracts';
import {PostgresCalendarInputSource} from '../../apps/api/src/modules/calendar-postgres.js';
import {computeAuthorizedCalendar} from '../../apps/api/src/modules/calendar.js';
import type {CalendarReadRequest} from '../../apps/api/src/modules/calendar.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';
const RUN=process.env.HUFS_PG_CALENDAR_LIVE==='1';
// Random synthetic password permits SCRAM-authenticated CI least-privilege reads.
const rolePassword=randomBytes(24).toString('hex');
let admin:Pool,reader:Pool,source:PostgresCalendarInputSource,request:CalendarReadRequest;
const actor='SYN-CALENDAR-ACTOR';
const now=()=>new Date().toISOString();
function adapter(pool:Pool):ReviewerSqlPool{return {connect:async()=>{
  const c=await pool.connect();return {query:async(sql,params=[])=>({rows:(await c.query(sql,[...params])).rows}),release:()=>c.release()};
}};}
describe.skipIf(!RUN)('REAL PostgreSQL calendar: scoped recomputation and receipt revocation',()=>{
  beforeAll(async()=>{
    const raw=process.env.HUFS_PG_CALENDAR_URL;if(!raw)throw Error('Explicit local calendar database URL required');
    const url=new URL(raw);
    if(!['postgres:','postgresql:'].includes(url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)
      ||url.pathname!=='/hufs_one_calendar_test'||url.search||url.hash||!url.username)throw Error('Refusing non-local/non-disposable PG target');
    admin=new Pool({connectionString:url.toString(),ssl:false,max:4,connectionTimeoutMillis:3000});
    if((await admin.query(`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'`)).rows[0]?.n!==0)
      throw Error('Calendar live-test database must be empty');
    for(const name of ['20261031_api_projections.sql','20261031_temporal_evidence.sql',
      '20261101_source_review.sql','20261105_source_image_evidence.sql','20261105_source_pdf_evidence.sql','20261101_calendar_inputs.sql'])
      await admin.query(readFileSync(new URL('../../infra/sql/'+name,import.meta.url),'utf8'));
    await admin.query(`CREATE ROLE hufs_test_calendar LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
      GRANT USAGE ON SCHEMA public TO hufs_test_calendar;
      GRANT SELECT ON api_sharing_grants,api_demo_snapshot_projections,api_calendar_input_projections,api_calendar_source_permissions,
        source_ingest_heads,source_revisions_vnext,source_effective_revisions_vnext,source_paragraphs_vnext,
        source_conflict_decisions_vnext TO hufs_test_calendar;`);
    // The reviewed helper, when present, grants row locks without UPDATE authority.
    const helper=await admin.query(`SELECT oid::regprocedure::text AS signature FROM pg_proc
      WHERE pronamespace='public'::regnamespace AND proname='api_lock_authorized_calendar_inputs'`);
    if(helper.rows.length===1)await admin.query(`GRANT EXECUTE ON FUNCTION ${helper.rows[0].signature} TO hufs_test_calendar`);
    const readUrl=new URL(url);readUrl.username='hufs_test_calendar';readUrl.password=rolePassword;
    reader=new Pool({connectionString:readUrl.toString(),ssl:false,max:4,connectionTimeoutMillis:3000});
    source=new PostgresCalendarInputSource(adapter(reader));
    const at=now(),before=new Date(Date.now()-60_000).toISOString(),expires=new Date(Date.now()+3_600_000).toISOString();
    const approvedSnapshot=structuredClone(snapshotRaw);
    approvedSnapshot.contextId='SYN-CCTX';approvedSnapshot.asOf=at;
    approvedSnapshot.feed.asOf=at;approvedSnapshot.notices.asOf=at;
    approvedSnapshot.versions.projection='P1';approvedSnapshot.versions.dataset='D1';
    await admin.query(`INSERT INTO api_demo_snapshot_projections(subject_id,projection_version,dataset_version,snapshot_json,
      approved_at,approved_by,current) VALUES('S01','P1','D1',$1,$2,'SYN-OP',true)`,[approvedSnapshot,before]);
    const normalized={profile:{interestTopics:[],desiredJobTopics:[],approvedExperienceTopics:['AI_ML'],
      approvedLanguageCodes:[],officialMajorTopics:[],facts:{}},
      noticeStudent:{openRequirementIds:['SYN-REQ'],courseIds:[],interestTopics:[]},provenance:{},opportunities:[],
      notices:[{id:'SYN-NOTICE',sourceSnapshotId:'SYN-REV1',title:'SYNTHETIC academic deadline',issuer:'SYNTHETIC',
        category:'ACADEMIC',requirementRefs:['SYN-REQ'],studentDeadline:new Date(Date.now()+86_400_000).toISOString(),
        verificationState:'VERIFIED',evidenceRefs:['SYN-EVIDENCE']}]};
    await admin.query(`INSERT INTO api_sharing_grants(grant_id,actor_id,subject_id,allowed_sections,version,consent_ref,
      approved_by,approved_at,expires_at) VALUES('SYN-CG',$1,'S01',ARRAY['FEED','NOTICES'],'G1','SYN-CC','SYN-OP',$2,$3)`,[actor,before,expires]);
    await admin.query(`INSERT INTO source_revisions_vnext(revision_id,source_id,original_sha256,content_sha256,media_kind,
      source_class,permission_ref,provenance,status,change_kind,fetched_at,last_checked_at,last_verified_at)
      VALUES('SYN-REV1','SYN-SOURCE',repeat('a',64),repeat('b',64),'TEXT','SYNTHETIC','SYN-PERM','SYNTHETIC','ACTIVE','NEW',$1,$1,$1)`,[before]);
    await admin.query(`INSERT INTO source_ingest_heads(source_id,revision_id,fetched_at,last_checked_at) VALUES('SYN-SOURCE','SYN-REV1',$1,$1)`,[before]);
    await admin.query(`INSERT INTO api_calendar_input_projections(actor_id,subject_id,dataset_version,projection_version,dataset_mode,
      as_of,input_json,source_ids,consent_ref,approval_state,approved_by,approved_at,expires_at,current)
      VALUES($1,'S01','D1','P1','SYNTHETIC',$2,$3,ARRAY['SYN-SOURCE'],'SYN-CC','APPROVED','SYN-OP',$4,$5,true)`,[actor,at,normalized,before,expires]);
    await admin.query(`INSERT INTO api_calendar_source_permissions(actor_id,subject_id,source_id,permission_ref,policy_version,
      approval_state,approved_by,approved_at,expires_at) VALUES($1,'S01','SYN-SOURCE','SYN-PERM','RP1','APPROVED','SYN-OP',$2,$3)`,[actor,before,expires]);
    request={actorId:actor,now:at,context:DemoContextSchema.parse({contextId:'SYN-CCTX',actorId:actor,
      sessionIdHash:'H'.repeat(30),demoSubjectId:'S01',demoRunId:'SYN-CRUN',datasetVersion:'D1',projectionVersion:'P1',
      sharingGrantVersion:'G1',expiresAt:expires})};
  },30000);
  afterAll(async()=>{await reader?.end();await admin?.end();},30000);
  it('reads immutable source TEXT paragraphs through non-owner SELECT only',async()=>{
    const original='합성 출처 문단 2026-11-03T15:00:00.000Z';
    await admin.query(`INSERT INTO source_paragraphs_vnext
      (revision_id,paragraph_id,paragraph_text) VALUES('SYN-REV1','SYN-PAR1',$1)`,[original]);
    const rows=await reader.query(`SELECT revision_id,paragraph_id,paragraph_text
      FROM source_paragraphs_vnext WHERE (revision_id,paragraph_id) IN
      (SELECT revision_id,paragraph_id FROM unnest($1::text[],$2::text[])
        AS requested(revision_id,paragraph_id)) ORDER BY revision_id,paragraph_id LIMIT 1001`,
    [['SYN-REV1'],['SYN-PAR1']]);
    expect(rows.rows).toEqual([{revision_id:'SYN-REV1',paragraph_id:'SYN-PAR1',paragraph_text:original}]);
    await expect(reader.query(`UPDATE source_paragraphs_vnext SET paragraph_text='MALICIOUS'`))
      .rejects.toMatchObject({code:'42501'});
  });
  it('reads with SELECT+one lock helper and recomputes partial grants without academic deadlines',async()=>{
    const bundle=await source.readAuthorizedInputs({...request,now:now()});expect(bundle).not.toBeNull();
    expect(bundle?.grant?.allowedSections).toEqual(['FEED','NOTICES']);
    const result=computeAuthorizedCalendar(bundle!,{...request,now:now()});
    expect(result.entries).toEqual([]);expect(result.needsConfirmation.map(v=>v.refId)).toEqual(['SYN-NOTICE']);
    await expect(reader.query(`UPDATE api_sharing_grants SET version='BYPASS'`)).rejects.toMatchObject({code:'42501'});
    await expect(reader.query(`UPDATE source_ingest_heads SET last_checked_at=clock_timestamp()`)).rejects.toMatchObject({code:'42501'});
  });
  it('invalidates receipts on permission policy changes and revoked source rights',async()=>{
    const bundle=(await source.readAuthorizedInputs({...request,now:now()}))!;
    expect(await source.revalidateAuthorization(request,bundle,now())).toBe(true);
    try{
      await admin.query(`UPDATE api_calendar_source_permissions SET policy_version='RP2'`);
      expect(await source.revalidateAuthorization(request,bundle,now())).toBe(false);
      await admin.query(`UPDATE api_calendar_source_permissions SET revoked_at=clock_timestamp()`);
      expect((await source.readAuthorizedInputs({...request,now:now()}))?.authorizedRevisionIds).toEqual([]);
    }finally{await admin.query(`UPDATE api_calendar_source_permissions SET policy_version='RP1',revoked_at=NULL`);}
  });
  it('refuses a different actor and immediately revokes a previously read grant',async()=>{
    expect(await source.readAuthorizedInputs({...request,actorId:'SYN-OTHER',now:now()})).toBeNull();
    const bundle=(await source.readAuthorizedInputs({...request,now:now()}))!;
    try{
      await admin.query(`UPDATE api_sharing_grants SET revoked_at=clock_timestamp(),version='G2'`);
      expect(await source.revalidateAuthorization(request,bundle,now())).toBe(false);
      expect(await source.readAuthorizedInputs({...request,now:now()})).toBeNull();
    }finally{await admin.query(`UPDATE api_sharing_grants SET revoked_at=NULL,version='G1'`);}
  });
  it('invalidates receipts when the approved snapshot is withdrawn or its private sections change',async()=>{
    const bundle=(await source.readAuthorizedInputs({...request,now:now()}))!;
    try{
      await admin.query('UPDATE api_demo_snapshot_projections SET current=false');
      expect(await source.revalidateAuthorization(request,bundle,now())).toBe(false);
      expect(await source.readAuthorizedInputs({...request,now:now()})).toBeNull();
      await admin.query('UPDATE api_demo_snapshot_projections SET current=true');
      await admin.query(`UPDATE api_demo_snapshot_projections
        SET snapshot_json=jsonb_set(snapshot_json,'{academics}','{"state":"NOT_SHARED"}'::jsonb)`);
      expect(await source.revalidateAuthorization(request,bundle,now())).toBe(false);
    }finally{await admin.query('UPDATE api_demo_snapshot_projections SET current=true');}
  });
  it('prevents approved input mutation in real PostgreSQL',async()=>{
    await expect(admin.query(`UPDATE api_calendar_input_projections SET input_json='{}'::jsonb`))
      .rejects.toThrow('approved calendar inputs require a new projection version');
  });
  it('invalidates source-head receipts and never reuses the previous active revision',async()=>{
    const bundle=(await source.readAuthorizedInputs({...request,now:now()}))!;
    const at=now();
    await admin.query(`INSERT INTO source_revisions_vnext(revision_id,source_id,supersedes,original_sha256,content_sha256,
      media_kind,source_class,permission_ref,provenance,status,change_kind,fetched_at,last_checked_at)
      VALUES('SYN-REV2','SYN-SOURCE','SYN-REV1',repeat('c',64),repeat('d',64),'TEXT','SYNTHETIC','SYN-PERM',
        'SYNTHETIC','RETRACTED','CANCELLED',$1,$1)`,[at]);
    await admin.query(`UPDATE source_ingest_heads SET revision_id='SYN-REV2',fetched_at=$1,last_checked_at=$1`,[at]);
    expect(await source.revalidateAuthorization(request,bundle,now())).toBe(false);
    const current=(await source.readAuthorizedInputs({...request,now:now()}))!;
    // A cancellation discovered AFTER the stored projection cutoff must also block old ACTIVE dates.
    expect(current.revisions.map(v=>v.revisionId)).toEqual(['SYN-REV1','SYN-REV2']);
    expect(current.sourceVersion).not.toBe(bundle.sourceVersion);
    const result=computeAuthorizedCalendar(current,{...request,now:now()});
    expect(result.entries).toEqual([]);expect(result.needsConfirmation).toEqual([]);
  });
});
