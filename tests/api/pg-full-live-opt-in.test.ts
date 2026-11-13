/** Real PostgreSQL proof; default CI remains opt-in. Never point at application data.
 * HUFS_PG_FULL_LIVE=1 HUFS_PG_FULL_URL=postgres://...@127.0.0.1:55432/hufs_one_full_test
 * Start a fresh disposable local cluster first. All records below are synthetic.
 */
import {readFileSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import {createLocalJWKSet,exportJWK,generateKeyPair,SignJWT} from 'jose';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {createPostgresApplication} from '../../apps/api/src/application-postgres.js';
import {createPostgresSchoolMailAuth} from '../../apps/api/src/auth-postgres.js';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {closedRepository} from '../../apps/api/src/repository.js';
import {createGoogleIdTokenVerifier as idVerifier} from '../../apps/api/src/modules/auth/google-oidc.js';
import {PostgresPersonalStateStore,PersonalStateDenied} from '../../apps/api/src/db/personal-state-postgres.js';
import {PostgresApiProjectionRepository} from '../../apps/api/src/repository-postgres.js';
import {PostgresAuthAttemptLimiter} from '../../apps/api/src/modules/auth/auth-attempt-limiter-postgres.js';
import {PostgresTemporalEvidenceReader} from '../../apps/api/src/modules/opportunities/temporal-postgres.js';
import {PostgresSourceIngestionQueue} from '../../apps/api/src/modules/opportunities/source-ingestion-queue-postgres.js';
import {proveSourceJobControlPg} from './source-job-control-live-slice.js';
import {proveSourceImagePg} from './source-image-live-slice.js';
import {proveSourcePdfPg} from './source-pdf-live-slice.js';
import {proveSourceDocumentPg} from './source-document-live-slice.js';
import {proveSourceRefreshBudgetPg} from './source-refresh-budget-live-slice.js';
import {proveSourceBrowserPg} from './source-browser-live-slice.js';
import {proveSourceRuntimeReceipts} from './source-runtime-receipt-live-slice.js';
import {proveGuideWorkspace} from './international-checklist-live-slice.js';
import {proveRecognitionCleanup} from './recognition-cleanup-live-slice.js';
import {proveRecognitionProofHttp} from './recognition-proof-http-live-slice.js';
import {createApprovedDurableSourceExecutor} from '../../apps/api/src/modules/opportunities/source-ingestion-durable.js';
import {ApprovedPlainTextExtractor} from '../../apps/api/src/modules/opportunities/approved-text-extractor.js';
import {PostgresSourceRevisionWriter} from '../../apps/api/src/modules/opportunities/temporal-writer-postgres.js';
import {PostgresSourceRevisionHistory} from '../../apps/api/src/modules/opportunities/source-history-postgres.js';
import {PostgresSourceReviewService} from '../../apps/api/src/modules/opportunities/source-review-postgres.js';
import {hashRevisionParagraphs} from '../../apps/api/src/modules/opportunities/revision-ledger.js';
import {PostgresReviewerSandboxStore} from '../../apps/api/src/modules/auth/reviewer-sandbox-postgres.js';
import {PostgresRestrictedIntakeImport} from '../../apps/api/src/modules/academics/intake-postgres.js';
import {PostgresSelfAccountStore} from '../../apps/api/src/modules/profiles/self-account-postgres.js';
import {PostgresOwnerWorkspaceStore} from '../../apps/api/src/modules/profiles/self-workspace-postgres.js';
import {PostgresExperienceApprovalStore} from '../../apps/api/src/modules/profiles/experience-approval-postgres.js';
import {PostgresDemoOverlayStore} from '../../apps/api/src/modules/demo-overlay-postgres.js';
import {PostgresAiBudgetLedger} from '../../apps/api/src/modules/ai/budget-postgres.js';
import {PostgresProviderResults} from '../../apps/api/src/modules/ai/provider-results-postgres.js';
import {PostgresProviderAuthority} from '../../apps/api/src/modules/ai/provider-authority-postgres.js';
import {makeSyntheticIntake,syntheticOriginalPermission} from './synthetic-intake-fixture.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';
import snapshotRaw from '../../packages/fixtures/synthetic/demo-snapshot.json';

const RUN=process.env.HUFS_PG_FULL_LIVE==='1';
const pools:Pool[]=[];
// Generated credential for isolated synthetic test roles (SCRAM on GitHub Actions).
const rolePassword=randomBytes(24).toString('hex');
let admin:Pool,writer:Pool,reader:Pool,temporal:Pool,limiter:Pool,sandbox:Pool,intake:Pool,selfAccount:Pool,overlays:Pool,aiBudget:Pool,aiResults:Pool;
let aiProvider:Pool;
const actor='SYNTHETIC-FULL-PG-ACTOR';
const scope={actorId:actor,subjectId:'S01' as const,grantVersion:'v1'};
const now=()=>new Date().toISOString();
const migrationNames=[
  '20261031_api_projections.sql','20261031_z_api_personal_state.sql',
  '20261031_zz_api_roles.sql','20261031_google_auth.sql',
  '20261031_beta_admission.sql','20261031_school_mail.sql',
  '20261031_reviewer_invitations.sql','20261101_reviewer_sandbox.sql',
  '20261031_auth_attempt_windows.sql',
  '20261101_school_mail_network_limits.sql',
  '20261031_temporal_evidence.sql','20261101_source_review.sql','20261105_source_image_evidence.sql',
  '20261109_source_image_ocr_unique.sql','20261105_source_pdf_evidence.sql','20261101_source_http_validators.sql',
  '20261111_source_korean_document_media.sql',
  '20261112_source_refresh_budget.sql',
  '20261101_source_ingest_queue.sql',
  '20261104_source_ingest_cancellation.sql',
  '20261101_intake_staging.sql','20261101_self_account.sql',
  '20261101_personal_storage_withdrawal.sql',
  '20261101_self_workspace.sql','20261101_self_workspace_tombstones.sql',
  '20261113_international_checklists.sql',
  '20261113_recognition_proof_cleanup.sql',
  '20261101_experience_tag_approval.sql',
  '20261101_demo_overlays.sql',
  '20261101_verified_source_rights.sql',
  '20261112_source_browser_evidence.sql',
  '20261113_source_runtime_receipts.sql',
  '20261103_ai_budget.sql',
  '20261103_ai_provider_inputs.sql',
  '20261103_ai_provider_results.sql',
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
  const selected=new URL(url);if(user){selected.username=user;selected.password=rolePassword;}
  const pool=new Pool({connectionString:selected.toString(),ssl:false,max:12,
    connectionTimeoutMillis:3000,statement_timeout:5000});
  pools.push(pool);return pool;
}
describe.skipIf(!RUN)('REAL PostgreSQL: full migrations and least-privilege adapters',()=>{
  beforeAll(async()=>{
    const url=connectionUrl();admin=poolFor(url);
    const tables=await admin.query(`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'`);
    if(tables.rows[0]?.n!==0)throw new Error('Full live-test database must be empty');
    for(const name of migrationNames){
      await admin.query(readFileSync(new URL('../../infra/sql/'+name,import.meta.url),'utf8'));
      if(name==='20261101_self_workspace.sql'){
        // Synthetic pre-migration tombstone: earlier DELETE left private
        // value_json in storage. The forward migration must scrub this row.
        await admin.query(`INSERT INTO api_self_workspace_records
          (actor_id,kind,item_id,version,value_json,deleted_at)
          VALUES('SYN-LEGACY-ERASURE','EXPERIENCE','SYN-LEGACY-01',3,
            $1::jsonb,clock_timestamp())`,[JSON.stringify({
          kind:'EXPERIENCE',dataMode:'OWNER_CONSENTED',
          state:'DRAFT',title:'SYNTHETIC-LEGACY-MUST-DISAPPEAR',summary:'synthetic',
        })]);
      }
    }
    // LOGIN roles exist only in the disposable cluster. The password is a random synthetic test value,
    // not a production credential; never log or persist it.
    await admin.query(`
      CREATE ROLE hufs_test_personal LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
      CREATE ROLE hufs_test_projection LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
      CREATE ROLE hufs_test_temporal LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
      CREATE ROLE hufs_test_limiter LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
       CREATE ROLE hufs_test_sandbox LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
       CREATE ROLE hufs_test_intake LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
       CREATE ROLE hufs_test_self LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
       CREATE ROLE hufs_test_overlay LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
       CREATE ROLE hufs_test_ai_budget LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
       CREATE ROLE hufs_test_ai_results LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
      GRANT hufs_api_personal_writer TO hufs_test_personal;
      GRANT hufs_api_projection_reader TO hufs_test_projection;
      GRANT USAGE ON SCHEMA public TO hufs_test_temporal,hufs_test_limiter,hufs_test_sandbox,hufs_test_intake,hufs_test_self,hufs_test_overlay;
       GRANT SELECT,INSERT,UPDATE ON api_demo_overlays TO hufs_test_overlay;
       GRANT SELECT,INSERT,UPDATE ON api_self_consents TO hufs_test_self;
       GRANT SELECT,INSERT,UPDATE,DELETE ON api_self_profiles TO hufs_test_self;
       GRANT SELECT,INSERT,UPDATE,DELETE ON api_self_workspace_records TO hufs_test_self;
       GRANT INSERT ON api_self_workspace_events TO hufs_test_self;
       GRANT SELECT ON api_self_proof_cleanup TO hufs_test_self;
       GRANT UPDATE(status,receipt_id,acknowledged_at) ON api_self_proof_cleanup TO hufs_test_self;
       GRANT INSERT ON api_self_consent_events TO hufs_test_self;
       GRANT SELECT,INSERT,UPDATE,DELETE ON api_experience_tag_approvals TO hufs_test_self;
       GRANT INSERT ON api_experience_tag_events TO hufs_test_self;
       GRANT SELECT,INSERT,UPDATE ON api_intake_heads TO hufs_test_intake;
       GRANT SELECT,INSERT ON api_intake_revisions TO hufs_test_intake;
       GRANT EXECUTE ON FUNCTION reviewer_sandbox_allowed(text,text) TO hufs_test_sandbox;
       GRANT SELECT,INSERT,UPDATE ON reviewer_sandbox_state TO hufs_test_sandbox;
      GRANT SELECT ON source_ingest_heads,source_http_validators,source_revisions_vnext,source_effective_revisions_vnext,source_browser_revision_metadata_vnext,source_paragraphs_vnext,
        source_conflict_decisions_vnext TO hufs_test_temporal;
      GRANT SELECT,INSERT,UPDATE ON auth_attempt_windows TO hufs_test_limiter;
      GRANT USAGE ON SCHEMA public TO hufs_test_ai_budget;
      GRANT EXECUTE ON FUNCTION ai_budget_reserve(text,text,text,text,bigint) TO hufs_test_ai_budget;
      GRANT EXECUTE ON FUNCTION ai_budget_transition(text,uuid,text,text,bigint,text) TO hufs_test_ai_budget;
       GRANT USAGE ON SCHEMA public TO hufs_test_ai_results;
       GRANT EXECUTE ON FUNCTION ai_provider_result_put(jsonb),ai_provider_result_get(uuid) TO hufs_test_ai_results;
       CREATE ROLE hufs_test_ai_provider LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
       GRANT USAGE ON SCHEMA public TO hufs_test_ai_provider;
       GRANT SELECT ON api_ai_provider_inputs,api_ai_provider_input_heads,api_self_consents,
         source_ingest_heads,source_effective_revisions_vnext,source_rights_receipts,source_rights_revocations TO hufs_test_ai_provider;
    `);
    writer=poolFor(url,'hufs_test_personal');reader=poolFor(url,'hufs_test_projection');
    temporal=poolFor(url,'hufs_test_temporal');limiter=poolFor(url,'hufs_test_limiter');
    sandbox=poolFor(url,'hufs_test_sandbox');intake=poolFor(url,'hufs_test_intake');
    selfAccount=poolFor(url,'hufs_test_self');
    overlays=poolFor(url,'hufs_test_overlay');
    aiBudget=poolFor(url,'hufs_test_ai_budget');
     aiResults=poolFor(url,'hufs_test_ai_results');
    aiProvider=poolFor(url,'hufs_test_ai_provider');
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

  it('retains reviewed IMAGE geometry through SQL guards and the least-privilege reader',async()=>{
    await proveSourceImagePg(admin,temporal);
  });

  it('retains original PDF and page geometry through review and the least-privilege reader',async()=>{
    await proveSourcePdfPg(admin,temporal);
  });

  it('retains HWP/HWPX original media and bytes as review-only through the durable executor',async()=>{
    await proveSourceDocumentPg(admin,temporal);
    await proveSourceRefreshBudgetPg(admin,temporal);
    await proveSourceBrowserPg(admin,temporal);
    await proveSourceRuntimeReceipts(admin,temporal);
  });

  const billingHash='a'.repeat(64),usageReceipt='b'.repeat(64);
  async function provisionProvider(suffix:string){
    const actorId='SYN-PROVIDER-'+suffix,sourceId=actorId+'-SOURCE',revisionId=actorId+'-REV',permissionRef=actorId+'-PERM',projectionId=actorId+'-INPUT';
    const asOf=now(),before=new Date(Date.parse(asOf)-60000).toISOString(),approved=new Date(Date.parse(asOf)-30000).toISOString(),expires=new Date(Date.parse(asOf)+3600000).toISOString();
    const originalSha256='d'.repeat(64),choices={personalStorage:true,externalAi:true,teamReview:false,ncpStorage:false,presentation:false};
    const packet={packetId:'DOC-PACKET',task:'opportunity_terms',providerInputClass:'SYNTHETIC_CLEARED',
      sourceTokens:[{token:'DOC1',paragraphs:[{id:'p1',text:'Synthetic approved notice'}]}],allowedTopicCodes:[],allowedObjectTokens:[],approvedFacts:[],schemaVersion:'1',promptVersion:'1'};
    await admin.query(`INSERT INTO source_revisions_vnext(revision_id,source_id,original_sha256,content_sha256,media_kind,source_class,permission_ref,provenance,status,change_kind,fetched_at,last_checked_at,last_verified_at)
      VALUES($1,$2,$3,$3,'TEXT','SYNTHETIC',$4,'SYNTHETIC','ACTIVE','NEW',$5,$5,$5)`,[revisionId,sourceId,originalSha256,permissionRef,before]);
    await admin.query('INSERT INTO source_ingest_heads(source_id,revision_id,fetched_at,last_checked_at) VALUES($1,$2,$3,$3)',[sourceId,revisionId,before]);
    await admin.query(`INSERT INTO api_self_consents(actor_id,version,choices_json,updated_at) VALUES($1,1,$2,$3)`,[actorId,choices,before]);
    await admin.query(`INSERT INTO source_rights_receipts(receipt_id,actor_id,source_id,permission_ref,canonical_url,purposes,reviewed_by,reviewed_at,starts_at,expires_at,policy_version)
      VALUES($1,$2,$3,$4,'https://example.org/synthetic',ARRAY['STORE','EXTERNAL_TRANSFER'],'SYN-INDEPENDENT-OPERATOR',$5,$5,$6,'rights-1')`,[actorId+'-RIGHTS-1',actorId,sourceId,permissionRef,before,expires]);
    await admin.query(`INSERT INTO api_ai_provider_inputs(projection_id,actor_id,input_ref,operation,as_of,epoch,policy_version,consent_version,approved_by,approved_at,expires_at,input_class,privacy_review_ref,source_refs,safe_packet)
      VALUES($1,$2,'SYN-INPUT','HCX_007',$3,'epoch-1','input-policy-1','1','SYN-INDEPENDENT-OPERATOR',$4,$5,'SYNTHETIC_CLEARED','SYN-PRIVACY-ATTESTATION',$6,$7)`,
      [projectionId,actorId,asOf,approved,expires,JSON.stringify([{sourceId,revisionId,permissionRef,originalSha256}]),packet]);
    await admin.query(`INSERT INTO api_ai_provider_input_heads(actor_id,input_ref,operation,projection_id) VALUES($1,'SYN-INPUT','HCX_007',$2)`,[actorId,projectionId]);
    const request={actor:{actorId,role:'BETA' as const,sessionIdHash:'SYN-SESSION-HASH',csrfToken:'C'.repeat(32),sessionExpiresAt:expires,schoolMailProofExpiresAt:expires,betaAllowed:true},
      inputRef:'SYN-INPUT',operation:'HCX_007' as const,asOf,phaseId:'SYN-PHASE',idempotencyKey:'SYN-KEY',now:now()};
    const authority=new PostgresProviderAuthority(adapter(aiProvider),{policyVersion:'input-policy-1',sessionIsCurrent:async()=>true});
    return {authority,request,actorId,sourceId,revisionId,permissionRef,projectionId,before,expires};
  }
  function request(phaseId:string,idempotencyKey:string,worstCaseUnits=100){
    return {phaseId,task:'HCX_007' as const,idempotencyKey,requestSha256:billingHash,worstCaseUnits};
  }
  async function provisionBudget(phase:string,cap=500,actorCap=500,attempts=100,actorAttempts=100){
    await admin.query(`INSERT INTO ai_budget_phases(phase_id,enabled,starts_at,ends_at,max_units,actor_max_units,max_attempts,actor_max_attempts)
      VALUES($1,true,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour',$2,$3,$4,$5)`,
      [phase,cap,actorCap,attempts,actorAttempts]);
    return new PostgresAiBudgetLedger(adapter(aiBudget));
  }
  /** Synthetic settled result fixtures for the remaining #150 retention proof.
   * Uses the execute-only runtime role, never a privileged result INSERT. */
  async function retentionResult(suffix:string,ttlMs=600_000){
    const owner='SYN-RETENTION-'+suffix,phase='SYN-RETENTION-PHASE-'+suffix;
    const projection='SYN-RETENTION-PROJECTION-'+suffix,inputRef='SYN-RETENTION-INPUT-'+suffix;
    const approvedAt=new Date(Date.now()-120_000).toISOString(),asOf=new Date(Date.now()-60_000).toISOString();
    const inputExpiry=new Date(Date.now()+600_000).toISOString(),epoch='retention-v1';
    await admin.query(`INSERT INTO api_self_consents(actor_id,version,choices_json,updated_at)
      VALUES($1,1,'{"personalStorage":true,"externalAi":true,"teamReview":false,"ncpStorage":false,"presentation":false}'::jsonb,$2)`,[owner,approvedAt]);
    const packet={packetId:'SYN-RETENTION-PACKET',task:'opportunity_terms',providerInputClass:'SYNTHETIC_CLEARED',
      sourceTokens:[{token:'DOC1',paragraphs:[{id:'p1',text:'SYNTHETIC ONLY'}]}],
      allowedTopicCodes:[],allowedObjectTokens:[],approvedFacts:[],schemaVersion:'1',promptVersion:'1'};
    await admin.query(`INSERT INTO api_ai_provider_inputs(projection_id,actor_id,input_ref,operation,as_of,epoch,
      policy_version,consent_version,approved_by,approved_at,expires_at,input_class,privacy_review_ref,source_refs,safe_packet)
      VALUES($1,$2,$3,'HCX_007',$4,$5,'retention-policy','1','SYN-INDEPENDENT-REVIEWER',$6,$7,
        'SYNTHETIC_CLEARED','SYN-RETENTION-PRIVACY',$8::jsonb,$9::jsonb)`,
    [projection,owner,inputRef,asOf,epoch,approvedAt,inputExpiry,JSON.stringify([{sourceId:'SYN-RETENTION-SOURCE',
      revisionId:'SYN-RETENTION-REV',permissionRef:'SYN-RETENTION-PERM',originalSha256:'c'.repeat(64)}]),JSON.stringify(packet)]);
    await admin.query(`INSERT INTO api_ai_provider_input_heads(actor_id,input_ref,operation,projection_id)
      VALUES($1,$2,'HCX_007',$3)`,[owner,inputRef,projection]);
    const ledger=await provisionBudget(phase),job=await ledger.reserve(owner,request(phase,'SYN-RETENTION-KEY'));
    const identity={phaseId:phase,jobId:job.jobId,requestSha256:billingHash};
    await ledger.transition(owner,{...identity,action:'DISPATCHED'});
    await ledger.transition(owner,{...identity,action:'SETTLED',actualUnits:40,receiptSha256:usageReceipt});
    const value={jobId:job.jobId,actorId:owner,sessionIdHash:'SYN-RETENTION-SESSION',inputRef,
      operation:'HCX_007' as const,asOf,phaseId:phase,idempotencyKey:'SYN-RETENTION-KEY',requestSha256:billingHash,
      inputEpoch:'input-'+createHash('sha256').update([projection,epoch,'1'].join('|')).digest('hex'),
      expiresAt:new Date(Date.now()+Math.min(ttlMs,590_000)).toISOString(),
      candidate:{reviewState:'NEEDS_REVIEW',text:'SYNTHETIC-RETENTION-CANDIDATE'}};
    const store=new PostgresProviderResults(adapter(aiResults));
    await store.put(value);
    return {owner,projection,value,store};
  }
  it('AI budget is OFF by default, private, and execute-only role cannot bypass accounting',async()=>{
    const phase='SYN-BILL-OFF';
    await admin.query(`INSERT INTO ai_budget_phases(phase_id,starts_at,ends_at)
      VALUES($1,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour')`,[phase]);
    const ledger=new PostgresAiBudgetLedger(adapter(aiBudget));
    await expect(ledger.reserve('SYN-A',request(phase,'FIRST'))).rejects.toThrow('AI budget operation denied');
    await expect(aiBudget.query('SELECT * FROM ai_budget_jobs')).rejects.toThrow();
    await expect(aiBudget.query(`UPDATE ai_budget_phases SET enabled=true`)).rejects.toThrow();
    await expect(aiBudget.query(`SELECT * FROM ai_budget_reserve($1,'HCX_007','NO-ACTOR',$2,100)`,[phase,billingHash])).rejects.toThrow();
    const policies=await admin.query(`SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class
      WHERE relname=ANY($1::text[])`,[['ai_budget_phases','ai_budget_actors','ai_budget_jobs']]);
    expect(policies.rows).toHaveLength(3);
    expect(policies.rows.every(r=>r.relrowsecurity&&r.relforcerowsecurity)).toBe(true);
    expect((await admin.query('SELECT count(*)::int AS n FROM ai_budget_jobs')).rows[0]?.n).toBe(0);
  });
  it('twenty concurrent AI requests cannot exceed shared or per-actor reservation caps',async()=>{
    for(const [phase,sameActor] of [['SYN-BILL-GLOBAL',false],['SYN-BILL-ACTOR',true]] as const){
      const ledger=await provisionBudget(phase,sameActor?10000:500,sameActor?300:1000);
      const results=await Promise.allSettled(Array.from({length:20},(_,i)=>ledger.reserve(sameActor?'SYN-A':'SYN-A'+i,request(phase,'REQ-'+i))));
      expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(sameActor?3:5);
      const totals=(await admin.query('SELECT reserved_units::int,charged_units::int,attempts FROM ai_budget_phases WHERE phase_id=$1',[phase])).rows[0];
      expect(totals).toEqual({reserved_units:sameActor?300:500,charged_units:0,attempts:sameActor?3:5});
    }
  });
  it('AI idempotency races create one reservation, reject changed requests and permit one dispatch',async()=>{
    const phase='SYN-BILL-IDEM',ledger=await provisionBudget(phase);
    const jobs=await Promise.all(Array.from({length:20},()=>ledger.reserve('SYN-A',request(phase,'SAME'))));
    expect(new Set(jobs.map(j=>j.jobId)).size).toBe(1);
    expect(jobs.filter(j=>j.changed)).toHaveLength(1);
    await expect(ledger.reserve('SYN-A',{...request(phase,'SAME'),requestSha256:'c'.repeat(64)})).rejects.toThrow();
    await expect(ledger.reserve('SYN-A',request(phase,'SAME',101))).rejects.toThrow();
    const job=jobs[0]!,v={phaseId:phase,jobId:job.jobId,requestSha256:billingHash,action:'DISPATCHED' as const};
    const dispatches=await Promise.all(Array.from({length:20},()=>ledger.transition('SYN-A',v)));
    expect(dispatches.filter(j=>j.changed)).toHaveLength(1);
    await expect(ledger.transition('SYN-B',v)).rejects.toThrow();
    await expect(ledger.transition('SYN-A',{...v,requestSha256:'d'.repeat(64)})).rejects.toThrow();
  });
  it('AI attempt limits bind independently of roomy cost caps; unsent release returns one attempt',async()=>{
    for(const [phase,sameActor] of [['SYN-BILL-GLOBAL-COUNT',false],['SYN-BILL-ACTOR-COUNT',true]] as const){
      const ledger=await provisionBudget(phase,100000,100000,sameActor?100:3,sameActor?2:100);
      const results=await Promise.allSettled(Array.from({length:20},(_,i)=>ledger.reserve(sameActor?'SYN-A':'SYN-'+i,request(phase,'TRY-'+i))));
      const good=results.flatMap((r,i)=>r.status==='fulfilled'?[{...r.value,actor:sameActor?'SYN-A':'SYN-'+i}]:[]);
      expect(good).toHaveLength(sameActor?2:3);
      const sent=good[0]!,unused=good[1]!;
      const ident=(jobId:string)=>({phaseId:phase,jobId,requestSha256:billingHash});
      await ledger.transition(sent.actor,{...ident(sent.jobId),action:'DISPATCHED'});
      await ledger.transition(sent.actor,{...ident(sent.jobId),action:'SETTLED',actualUnits:0,receiptSha256:usageReceipt});
      await expect(ledger.reserve(sameActor?'SYN-A':'SYN-FRESH',request(phase,'STILL-FULL'))).rejects.toThrow();
      await ledger.transition(unused.actor,{...ident(unused.jobId),action:'RELEASED'});
      await ledger.transition(unused.actor,{...ident(unused.jobId),action:'RELEASED'});
      await ledger.reserve(sameActor?'SYN-A':'SYN-FRESH',request(phase,'REPLACEMENT'));
      await expect(ledger.reserve(sameActor?'SYN-A':'SYN-NEW',request(phase,'COUNT-FULL'))).rejects.toThrow();
    }
  });
  it('unknown AI billing stays reserved until verified settlement; replay never refunds twice',async()=>{
    const phase='SYN-BILL-UNKNOWN',ledger=await provisionBudget(phase,100,100);
    const job=await ledger.reserve('SYN-A',request(phase,'ONE'));
    const v={phaseId:phase,jobId:job.jobId,requestSha256:billingHash};
    await ledger.transition('SYN-A',{...v,action:'DISPATCHED'});
    await ledger.transition('SYN-A',{...v,action:'UNKNOWN_BILLING'});
    await expect(ledger.transition('SYN-A',{...v,action:'RELEASED'})).rejects.toThrow();
    await expect(ledger.reserve('SYN-A',request(phase,'RETRY'))).rejects.toThrow();
    const done={...v,action:'SETTLED' as const,actualUnits:70,receiptSha256:usageReceipt};
    expect((await ledger.transition('SYN-A',done)).changed).toBe(true);
    expect((await ledger.transition('SYN-A',done)).changed).toBe(false);
    await expect(ledger.transition('SYN-A',{...done,actualUnits:0})).rejects.toThrow();
    expect((await admin.query('SELECT reserved_units::int,charged_units::int,attempts FROM ai_budget_phases WHERE phase_id=$1',[phase])).rows[0])
      .toEqual({reserved_units:0,charged_units:70,attempts:1});
  });
  it('unsent AI cancellations release quota once, but disabled/expired phases never dispatch',async()=>{
    const phase='SYN-BILL-CANCEL',ledger=await provisionBudget(phase,100,100,1,1);
    const job=await ledger.reserve('SYN-A',request(phase,'CANCEL'));
    const v={phaseId:phase,jobId:job.jobId,requestSha256:billingHash};
    await admin.query('UPDATE ai_budget_phases SET enabled=false WHERE phase_id=$1',[phase]);
    await expect(ledger.transition('SYN-A',{...v,action:'DISPATCHED'})).rejects.toThrow();
    expect((await ledger.transition('SYN-A',{...v,action:'RELEASED'})).changed).toBe(true);
    expect((await ledger.transition('SYN-A',{...v,action:'RELEASED'})).changed).toBe(false);
    await expect(ledger.reserve('SYN-A',request(phase,'DISABLED'))).rejects.toThrow();
    await admin.query('UPDATE ai_budget_phases SET enabled=true WHERE phase_id=$1',[phase]);
    const next=await ledger.reserve('SYN-A',request(phase,'NEXT'));
    await admin.query(`UPDATE ai_budget_phases SET starts_at=clock_timestamp()-interval '2 hour',ends_at=clock_timestamp()-interval '1 hour' WHERE phase_id=$1`,[phase]);
    await expect(ledger.transition('SYN-A',{...v,jobId:next.jobId,action:'DISPATCHED'})).rejects.toThrow();
    await expect(ledger.reserve('SYN-B',request(phase,'EXPIRED'))).rejects.toThrow();
  });
  it('AI cost overrun records actual cost, disables future calls and still settles existing dispatches',async()=>{
    const phase='SYN-BILL-OVERRUN',ledger=await provisionBudget(phase);
    const a=await ledger.reserve('SYN-A',request(phase,'ONE'));
    const b=await ledger.reserve('SYN-B',request(phase,'TWO'));
    const identity=(jobId:string)=>({phaseId:phase,jobId,requestSha256:billingHash});
    await ledger.transition('SYN-A',{...identity(a.jobId),action:'DISPATCHED'});
    await ledger.transition('SYN-B',{...identity(b.jobId),action:'DISPATCHED'});
    await ledger.transition('SYN-A',{...identity(a.jobId),action:'SETTLED',actualUnits:120,receiptSha256:usageReceipt});
    await expect(ledger.reserve('SYN-C',request(phase,'THREE'))).rejects.toThrow();
    await ledger.transition('SYN-B',{...identity(b.jobId),action:'SETTLED',actualUnits:90,receiptSha256:usageReceipt});
    expect((await admin.query('SELECT enabled,reserved_units::int,charged_units::int FROM ai_budget_phases WHERE phase_id=$1',[phase])).rows[0])
      .toEqual({enabled:false,reserved_units:0,charged_units:210});
  });
  it('verified AI charges above quote ceiling are accounted exactly and kill phase before new reservations',async()=>{
    const phase='SYN-BILL-LARGE-ACTUAL',ledger=await provisionBudget(phase),actual=1_000_000_000_001;
    const job=await ledger.reserve('SYN-A',request(phase,'LARGE'));
    const ident={phaseId:phase,jobId:job.jobId,requestSha256:billingHash};
    await ledger.transition('SYN-A',{...ident,action:'DISPATCHED'});
    const done={...ident,action:'SETTLED' as const,actualUnits:actual,receiptSha256:usageReceipt};
    expect((await ledger.transition('SYN-A',done)).chargedUnits).toBe(actual);
    expect((await ledger.transition('SYN-A',done)).changed).toBe(false);
    await expect(ledger.reserve('SYN-B',request(phase,'AFTER-OVERRUN'))).rejects.toThrow();
    expect((await admin.query('SELECT enabled,reserved_units::text,charged_units::text FROM ai_budget_phases WHERE phase_id=$1',[phase])).rows[0])
      .toEqual({enabled:false,reserved_units:'0',charged_units:String(actual)});
  });


  it('supports owner-private profile/consent CAS, no implicit grant, withdrawal and immutable audit under FORCE RLS',async()=>{
    const id='SYN-SELF-OWNER';
    const consent={personalStorage:true,teamReview:false,externalAi:false,
      ncpStorage:false,presentation:false};
    const service=new PostgresSelfAccountStore(adapter(selfAccount),{
      mayAccess:async(input)=>input.actorId===id,
    });
    expect(await service.readConsents(id)).toBeNull();
    await expect(service.readProfile(id)).rejects.toThrow('Owner data access denied');
    await expect(service.readConsents('SYN-OTHER')).rejects.toThrow('Owner data access denied');
    const initial=await service.putConsents(id,{expectedVersion:0,choices:consent});
    expect(initial.version).toBe(1);
    expect(initial.choices.externalAi).toBe(false);
    const same=await service.putConsents(id,{expectedVersion:1,choices:consent});
    expect(same.version).toBe(1);
    await expect(service.putConsents(id,{expectedVersion:0,choices:consent}))
      .rejects.toThrow('Owner version conflict');
    const info={displayName:'가상 소유자',interestTopics:['DATA_ANALYTICS'],
      desiredJobTopics:['DATA_ANALYTICS']};
    expect((await service.patchProfile(id,{expectedVersion:0,value:info})).version).toBe(1);
    expect((await service.readProfile(id))?.value.displayName).toBe('가상 소유자');
    await expect(service.patchProfile(id,{expectedVersion:0,value:info}))
      .rejects.toThrow('Owner version conflict');
    expect((await service.patchProfile(id,{expectedVersion:1,value:{
      ...info,displayName:'가상 갱신'
    }})).version).toBe(2);
    const withdrawn=await service.putConsents(id,{expectedVersion:1,choices:{
      ...consent,personalStorage:false,
    }});
    expect(withdrawn.version).toBe(2);
    await expect(service.readProfile(id)).rejects.toThrow('Owner data access denied');
    const remaining=await admin.query('SELECT count(*)::int AS n FROM api_self_profiles WHERE actor_id=$1',[id]);
    expect(remaining.rows[0]?.n).toBe(0);
    const updated=await service.putConsents(id,{expectedVersion:2,choices:consent});
    expect(updated.version).toBe(3);
    expect(await service.readProfile(id)).toBeNull();
    const audits=await admin.query('SELECT version,changed_purposes FROM api_self_consent_events WHERE actor_id=$1 ORDER BY version',[id]);
    expect(audits.rows).toHaveLength(3);
    expect(audits.rows[1]?.changed_purposes).toEqual(['personalStorage']);
    expect((await selfAccount.query('SELECT * FROM api_self_consents')).rows).toEqual([]);
    await expect(selfAccount.query('SELECT * FROM api_self_consent_events'))
      .rejects.toMatchObject({code:'42501'});
    await expect(reader.query('SELECT * FROM api_self_profiles')).rejects.toMatchObject({code:'42501'});
    await expect(admin.query('UPDATE api_self_consent_events SET changed_purposes=ARRAY[\'externalAi\']'))
      .rejects.toThrow('cannot be mutated');
  });
  it('isolates owner international checklists and purges withdrawn owner data',async()=>{
    await proveGuideWorkspace(admin,selfAccount);
  });
  it('retains recognition erasure jobs through consent withdrawal and verifies owner isolation',async()=>{
    await proveRecognitionCleanup(admin,selfAccount);
  });
  it('uses owner proof HTTP extraction/review/redaction and durable erasure acknowledgment',async()=>{
    await proveRecognitionProofHttp(admin,selfAccount);
  });
  it('isolates owner workspace REST data using consent locks, version CAS, audit and hard withdrawal',async()=>{
    const actorId='SYN-SELF-OWNER';
    const auth={mayOperate:async(input:{actorId:string;itemId?:string;
      value?:{dataMode:string};operation:string})=>input.actorId===actorId
      &&(input.operation==='DISCOVER'
        ||(input.itemId?.startsWith('SYN-')===true
          &&input.value?.dataMode==='SYNTHETIC'))};
    const a=new PostgresOwnerWorkspaceStore(adapter(selfAccount),auth);
    const b=new PostgresOwnerWorkspaceStore(adapter(selfAccount),auth);
    const value={kind:'EXPERIENCE' as const,dataMode:'SYNTHETIC' as const,
      state:'DRAFT' as const,title:'가상 경험',summary:'개인 합성 기록'};
    const first=await a.create({actorId,itemId:'SYN-EXP-1',value});
    expect(first.version).toBe(1);
    const found=await b.read({actorId,kind:'EXPERIENCE',itemId:'SYN-EXP-1'});
    expect(found?.value.kind).toBe('EXPERIENCE');
    const changed=await a.update({actorId,kind:'EXPERIENCE',
      itemId:'SYN-EXP-1',expectedVersion:1,value:{...value,title:'가상 수정'}});
    expect(changed.version).toBe(2);
    await expect(b.update({actorId,kind:'EXPERIENCE',itemId:'SYN-EXP-1',
      expectedVersion:1,value})).rejects.toThrow('version conflict');
    const list=await a.list({actorId,kind:'EXPERIENCE',limit:10});
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.value.kind).toBe('EXPERIENCE');
    await expect(a.read({actorId:'SYN-SELF-OTHER',kind:'EXPERIENCE',itemId:'SYN-EXP-1'}))
      .rejects.toThrow('access denied');
    const deleted=await b.delete({actorId,kind:'EXPERIENCE',
      itemId:'SYN-EXP-1',expectedVersion:2});
    expect(deleted.version).toBe(3);
    expect(await a.read({actorId,kind:'EXPERIENCE',itemId:'SYN-EXP-1'})).toBeNull();
    const race=await Promise.allSettled([
      a.create({actorId,itemId:'SYN-EXP-RACE',value}),
      b.create({actorId,itemId:'SYN-EXP-RACE',value}),
    ]);
    expect(race.filter(x=>x.status==='fulfilled')).toHaveLength(1);
    expect(race.filter(x=>x.status==='rejected')).toHaveLength(1);
    await expect(a.create({actorId,itemId:'SYN-REAL',value:{
      ...value,dataMode:'OWNER_CONSENTED' as const,
    }})).rejects.toThrow('access denied');
    const events=await admin.query('SELECT action,version FROM api_self_workspace_events WHERE actor_id=$1 AND item_id=$2 ORDER BY version',
      [actorId,'SYN-EXP-1']);
    expect(events.rows).toEqual([
      {action:'CREATED',version:'1'},{action:'UPDATED',version:'2'},{action:'DELETED',version:'3'},
    ]);
    expect((await selfAccount.query('SELECT * FROM api_self_workspace_records')).rows).toEqual([]);
    await expect(selfAccount.query('SELECT * FROM api_self_workspace_events'))
      .rejects.toMatchObject({code:'42501'});
    const profile=new PostgresSelfAccountStore(adapter(selfAccount),{
      mayAccess:async({actorId:id})=>id===actorId,
    });
    const prior=await profile.readConsents(actorId);
    expect(prior?.version).toBe(3);
    const withdrawal=await profile.putConsents(actorId,{expectedVersion:3,choices:{
      personalStorage:false,teamReview:false,externalAi:false,ncpStorage:false,presentation:false,
    }});
    expect(withdrawal.version).toBe(4);
    const remaining=await admin.query('SELECT count(*)::int AS n FROM api_self_workspace_records WHERE actor_id=$1',[actorId]);
    expect(remaining.rows[0]?.n).toBe(0);
    await expect(a.list({actorId,kind:'EXPERIENCE',limit:10}))
      .rejects.toThrow('access denied');
  });
  it('physically scrubs deleted owner-workspace values and legacy tombstones',async()=>{
    const legacy=await admin.query(`SELECT version,value_json,deleted_at
      FROM api_self_workspace_records WHERE actor_id='SYN-LEGACY-ERASURE'
        AND item_id='SYN-LEGACY-01'`);
    expect(legacy.rows).toHaveLength(1);
    expect(legacy.rows[0]?.version).toBe('3');
    expect(legacy.rows[0]?.deleted_at).not.toBeNull();
    expect(legacy.rows[0]?.value_json).toEqual({
      kind:'EXPERIENCE',dataMode:'OWNER_CONSENTED',
    });
    expect(JSON.stringify(legacy.rows)).not.toContain('SYNTHETIC-LEGACY-MUST-DISAPPEAR');

    const actorId='SYN-TOMBSTONE-OWNER';
    const account=new PostgresSelfAccountStore(adapter(selfAccount),{
      mayAccess:async({actorId:id})=>id===actorId,
    });
    await account.putConsents(actorId,{expectedVersion:0,choices:{
      personalStorage:true,teamReview:false,externalAi:false,
      ncpStorage:false,presentation:false,
    }});
    const authority={mayOperate:async({actorId:id}:{actorId:string})=>id===actorId};
    const a=new PostgresOwnerWorkspaceStore(adapter(selfAccount),authority);
    const b=new PostgresOwnerWorkspaceStore(adapter(selfAccount),authority);
    const examples=[
      {id:'SYN-TOMB-EXP',value:{kind:'EXPERIENCE' as const,
        dataMode:'OWNER_CONSENTED' as const,state:'DRAFT' as const,
        title:'SYNTHETIC-ERASE-TITLE',summary:'synthetic test entry'}},
      {id:'SYN-TOMB-SAVED',value:{kind:'BOOKMARK' as const,
        dataMode:'SYNTHETIC' as const,state:'SAVED' as const,
        opportunityId:'SYN-SAVED-REF'}},
    ];
    for(const {id,value} of examples){
      expect((await a.create({actorId,itemId:id,value})).version).toBe(1);
      expect((await b.delete({actorId,kind:value.kind,itemId:id,
        expectedVersion:1})).version).toBe(2);
      expect(await a.read({actorId,kind:value.kind,itemId:id})).toBeNull();
      const saved=await admin.query(`SELECT version,value_json,deleted_at
        FROM api_self_workspace_records WHERE actor_id=$1 AND kind=$2
          AND item_id=$3`,[actorId,value.kind,id]);
      expect(saved.rows).toHaveLength(1);
      expect(saved.rows[0]?.version).toBe('2');
      expect(saved.rows[0]?.deleted_at).not.toBeNull();
      expect(saved.rows[0]?.value_json).toEqual({
        kind:value.kind,dataMode:value.dataMode,
      });
      expect(JSON.stringify(saved.rows)).not.toContain(
        value.kind==='EXPERIENCE'?'SYNTHETIC-ERASE-TITLE':'SYN-SAVED-REF');
      await expect(a.update({actorId,kind:value.kind,itemId:id,
        expectedVersion:1,value})).rejects.toThrow('version conflict');
      await expect(a.create({actorId,itemId:id,value}))
        .rejects.toThrow('version conflict');
      const events=await admin.query(`SELECT version,action FROM api_self_workspace_events
        WHERE actor_id=$1 AND item_id=$2 ORDER BY version`,[actorId,id]);
      expect(events.rows).toEqual([
        {version:'1',action:'CREATED'},{version:'2',action:'DELETED'},
      ]);
    }

    // A separate non-owner SQL connection cannot revive or rename tombstones.
    const c=await selfAccount.connect();
    try{
      await c.query('BEGIN');
      await c.query("SELECT set_config('hufs.self_actor',$1,true)",[actorId]);
      await expect(c.query(`UPDATE api_self_workspace_records
        SET deleted_at=NULL,value_json=$3::jsonb,version=version+1
        WHERE actor_id=$1 AND kind='EXPERIENCE' AND item_id=$2`,
      [actorId,'SYN-TOMB-EXP',JSON.stringify(examples[0]!.value)]))
        .rejects.toMatchObject({code:'P6002'});
      await c.query('ROLLBACK');
      await c.query('BEGIN');
      await c.query("SELECT set_config('hufs.self_actor',$1,true)",[actorId]);
      await expect(c.query(`UPDATE api_self_workspace_records
        SET actor_id='SYN-FORGED-OWNER' WHERE actor_id=$1
          AND kind='BOOKMARK' AND item_id='SYN-TOMB-SAVED'`,[actorId]))
        .rejects.toMatchObject({code:'P6002'});
      await c.query('ROLLBACK');
    }finally{c.release();}
    expect((await selfAccount.query('SELECT * FROM api_self_workspace_records')).rows).toEqual([]);
    const rls=await admin.query(`SELECT relrowsecurity,relforcerowsecurity FROM pg_class
      WHERE oid='api_self_workspace_records'::regclass`);
    expect(rls.rows).toEqual([{relrowsecurity:true,relforcerowsecurity:true}]);
  });
  it('atomically purges demo owner data on storage withdrawal across connections',async()=>{
    const owner=actor,recordId='SYN-OWNER-CONSENT-01';
    const account=new PostgresSelfAccountStore(adapter(selfAccount),{
      mayAccess:async({actorId})=>actorId===owner,
    });
    const personal=new PostgresPersonalStateStore(adapter(writer),
      {mayProcess:async()=>true},{isApproved:async()=>true});
    const value={kind:'EXPERIENCE' as const,dataMode:'OWNER_CONSENTED' as const,
      title:'SYNTHETIC owner-only secret',summary:'synthetic record to erase'};
    const choices={personalStorage:true,teamReview:false,externalAi:false,
      ncpStorage:false,presentation:false};
    // External consent/verifier alone must never authorize a PG write.
    await expect(personal.create({scope,itemId:recordId,value}))
      .rejects.toBeInstanceOf(PersonalStateDenied);
    expect((await admin.query(`SELECT count(*)::int AS n FROM api_personal_records
      WHERE actor_id=$1 AND item_id=$2`,[owner,recordId])).rows[0]?.n).toBe(0);
    await account.putConsents(owner,{expectedVersion:0,choices});
    expect((await personal.create({scope,itemId:recordId,value})).version).toBe(1);

    // Independent writer connection already holds the owner consent share lock
    // when withdrawal begins. A revoked value cannot survive either ordering.
    const c=await writer.connect();
    let inTransaction=false;
    try{
      await c.query('BEGIN');inTransaction=true;
      await c.query(`SELECT set_config('hufs.actor_id',$1,true),
        set_config('hufs.subject_id',$2,true)`,[owner,'S01']);
      const changed=await c.query(`UPDATE api_personal_records
        SET value_json=$3::jsonb,version=version+1
        WHERE actor_id=$1 AND subject_id=$2 AND kind='EXPERIENCE'
          AND item_id='SYN-OWNER-CONSENT-01'
        RETURNING version`,[owner,'S01',JSON.stringify({...value,title:'synthetic revised'})]);
      expect(changed.rows).toHaveLength(1);
      const revoke=account.putConsents(owner,{expectedVersion:1,
        choices:{...choices,personalStorage:false}});
      await c.query('COMMIT');inTransaction=false;
      await revoke;
    }finally{
      if(inTransaction)await c.query('ROLLBACK').catch(()=>undefined);
      c.release();
    }

    const after=await admin.query(`SELECT version,value_json,deleted_at,data_mode
      FROM api_personal_records WHERE actor_id=$1 AND item_id=$2`,[owner,recordId]);
    expect(after.rows).toHaveLength(1);
    expect(after.rows[0]?.value_json).toEqual({});
    expect(after.rows[0]?.deleted_at).not.toBeNull();
    expect(after.rows[0]?.data_mode).toBe('OWNER_CONSENTED');
    const audit=await admin.query(`SELECT action,version FROM api_personal_events
      WHERE actor_id=$1 AND item_id=$2 ORDER BY version`,[owner,recordId]);
    expect(audit.rows.map(r=>r.action)).toEqual(['CREATED','DELETED']);
    expect(JSON.stringify(audit.rows)).not.toContain(value.title);
    await expect(personal.create({scope,itemId:'SYN-OWNER-CONSENT-02',value}))
      .rejects.toBeInstanceOf(PersonalStateDenied);
    await account.putConsents(owner,{expectedVersion:2,choices});
    expect(await personal.read({scope,kind:'EXPERIENCE',itemId:recordId})).toBeNull();
    // The role cannot see another actor without an explicit RLS scope.
    expect((await writer.query('SELECT * FROM api_personal_records')).rows).toEqual([]);
  });
  it('serializes concurrent initial owner writes and rolls back independent permission loss',async()=>{
    const id='SYN-SELF-CONCURRENT',info={displayName:'합성 병렬 입력',
      interestTopics:['DATA_ANALYTICS'],desiredJobTopics:[]};
    let permitted=true;
    const authority={mayAccess:async()=>permitted};
    const a=new PostgresSelfAccountStore(adapter(selfAccount),authority);
    const b=new PostgresSelfAccountStore(adapter(selfAccount),authority);
    const choices={personalStorage:true,teamReview:false,externalAi:false,
      ncpStorage:false,presentation:false};
    const race=await Promise.allSettled([
      a.putConsents(id,{expectedVersion:0,choices}),
      b.putConsents(id,{expectedVersion:0,choices}),
    ]);
    expect(race.filter(x=>x.status==='fulfilled')).toHaveLength(1);
    expect(race.filter(x=>x.status==='rejected')).toHaveLength(1);
    const profiles=await Promise.allSettled([
      a.patchProfile(id,{expectedVersion:0,value:info}),
      b.patchProfile(id,{expectedVersion:0,value:info}),
    ]);
    expect(profiles.filter(x=>x.status==='fulfilled')).toHaveLength(1);
    expect(profiles.filter(x=>x.status==='rejected')).toHaveLength(1);
    permitted=false;
    await expect(a.readProfile(id)).rejects.toThrow('Owner data access denied');
    let checks=0;
    const transient=new PostgresSelfAccountStore(adapter(selfAccount),{
      mayAccess:async()=>++checks===1,
    });
    await expect(transient.putConsents('SYN-ROLLED-BACK',{expectedVersion:0,choices}))
      .rejects.toThrow('Owner data access denied');
    const count=await admin.query('SELECT count(*)::int AS n FROM api_self_consents WHERE actor_id=$1',
      ['SYN-ROLLED-BACK']);
    expect(count.rows[0]?.n).toBe(0);
  });
  it('keeps local experience approvals version-bound through parallel CAS, content/consent invalidation and RLS',async()=>{
    const actorId='SYN-LOCAL-TAG-OWNER',experienceId='SYN-LOCAL-EXP';
    const choices={personalStorage:true,teamReview:false,externalAi:false,ncpStorage:false,presentation:false};
    const account=new PostgresSelfAccountStore(adapter(selfAccount),{mayAccess:async({actorId:id})=>id===actorId});
    const workspace=new PostgresOwnerWorkspaceStore(adapter(selfAccount),{mayOperate:async({actorId:id})=>id===actorId});
    const permission={mayOperate:async({actorId:id}:{actorId:string})=>id===actorId};
    const a=new PostgresExperienceApprovalStore(adapter(selfAccount),permission);
    const b=new PostgresExperienceApprovalStore(adapter(selfAccount),permission);
    await account.putConsents(actorId,{expectedVersion:0,choices});
    const value={kind:'EXPERIENCE' as const,dataMode:'SYNTHETIC' as const,
      state:'DRAFT' as const,title:'합성 로컬 태그 경험',summary:''};
    await workspace.create({actorId,itemId:experienceId,value});
    const request={actorId,experienceId,expectedApprovalVersion:0,expectedContentVersion:1,
      expectedConsentVersion:1,topics:['DATA_ANALYTICS' as const]};
    const race=await Promise.allSettled([a.approve(request),b.approve(request)]);
    expect(race.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(race.filter(r=>r.status==='rejected')).toHaveLength(1);
    expect((await b.readApprovedTopics({actorId,experienceId,
      expectedContentVersion:1,expectedConsentVersion:1}))?.topics).toEqual(['DATA_ANALYTICS']);
    expect((await selfAccount.query('SELECT * FROM api_experience_tag_approvals')).rows).toEqual([]);
    await expect(selfAccount.query('SELECT * FROM api_experience_tag_events')).rejects.toMatchObject({code:'42501'});
    await expect(a.read({actorId:'SYN-OTHER',experienceId})).rejects.toThrow('denied');
    await workspace.update({actorId,kind:'EXPERIENCE',itemId:experienceId,expectedVersion:1,
      value:{...value,summary:'수정된 합성 내용'}});
    expect(await a.read({actorId,experienceId})).toEqual({state:'INACTIVE',version:2,reason:'STALE'});
    expect(await a.readApprovedTopics({actorId,experienceId,
      expectedContentVersion:1,expectedConsentVersion:1})).toBeNull();
    await expect(a.approve(request)).rejects.toThrow('version conflict');
    await b.approve({...request,expectedApprovalVersion:2,expectedContentVersion:2});
    await account.putConsents(actorId,{expectedVersion:1,choices:{...choices,teamReview:true}});
    expect(await a.read({actorId,experienceId})).toEqual({state:'INACTIVE',version:4,reason:'STALE'});
    await a.approve({...request,expectedApprovalVersion:4,expectedContentVersion:2,expectedConsentVersion:2});
    await workspace.delete({actorId,kind:'EXPERIENCE',itemId:experienceId,expectedVersion:2});
    expect(await a.read({actorId,experienceId})).toEqual({state:'INACTIVE',version:6,reason:'NOT_FOUND'});
    const events=await admin.query(`SELECT action FROM api_experience_tag_events
      WHERE actor_id=$1 ORDER BY version`,[actorId]);
    expect(events.rows.map(e=>e.action)).toEqual(['APPROVED','INVALIDATED','APPROVED','INVALIDATED','APPROVED','INVALIDATED']);
    await expect(admin.query(`UPDATE api_experience_tag_events SET action='APPROVED' WHERE actor_id=$1`,[actorId]))
      .rejects.toThrow('cannot be mutated');
    await account.putConsents(actorId,{expectedVersion:2,choices:{...choices,personalStorage:false}});
    expect(await a.read({actorId,experienceId})).toEqual({state:'INACTIVE',version:0,reason:'CONSENT_REQUIRED'});
    expect((await admin.query('SELECT * FROM api_experience_tag_approvals WHERE actor_id=$1',[actorId])).rows).toEqual([]);
  });
  it('serializes initial/update overlay CAS and separates session, tab, subject, source and grant namespaces under RLS',async()=>{
    const a=new PostgresDemoOverlayStore(adapter(overlays)),b=new PostgresDemoOverlayStore(adapter(overlays));
    const key={actorId:'SYN-OVERLAY-ACTOR',sessionIdHash:'SYN-SESSION-1',demoRunId:'SYN-TAB-1',
      demoSubjectId:'S01' as const,datasetVersion:'SYN-D1',projectionVersion:'SYN-P1',sharingGrantVersion:'SYN-G1'};
    const value={interestTopics:['DATA_ANALYTICS' as const]};
    expect((await a.read(key)).version).toBe(0);
    const first=await Promise.allSettled([
      a.put(key,{expectedVersion:0,value},now()),b.put(key,{expectedVersion:0,value},now()),
    ]);
    expect(first.filter(x=>x.status==='fulfilled')).toHaveLength(1);
    expect(first.filter(x=>x.status==='rejected')).toHaveLength(1);
    const second=await Promise.allSettled([
      a.put(key,{expectedVersion:1,value:{}},now()),b.put(key,{expectedVersion:1,value:{}},now()),
    ]);
    expect(second.filter(x=>x.status==='fulfilled')).toHaveLength(1);
    expect(second.filter(x=>x.status==='rejected')).toHaveLength(1);
    expect(await b.read(key)).toMatchObject({version:2,value:{}});
    await expect(a.put(key,{expectedVersion:0,value},now())).rejects.toThrow('version conflict');
    for(const change of [{actorId:'SYN-OTHER'}, {sessionIdHash:'SYN-SESSION-2'},
      {demoRunId:'SYN-TAB-2'},{demoSubjectId:'S02' as const},{datasetVersion:'SYN-D2'},
      {projectionVersion:'SYN-P2'},{sharingGrantVersion:'SYN-G2'}])
      expect((await a.read({...key,...change})).version).toBe(0);
    expect((await overlays.query('SELECT * FROM api_demo_overlays')).rows).toEqual([]);
    await expect(overlays.query('DELETE FROM api_demo_overlays')).rejects.toMatchObject({code:'42501'});
    await expect(overlays.query('SELECT * FROM api_self_workspace_records')).rejects.toMatchObject({code:'42501'});
    const security=await admin.query(`SELECT relrowsecurity,relforcerowsecurity FROM pg_class
      WHERE oid='api_demo_overlays'::regclass`);
    expect(security.rows[0]).toEqual({relrowsecurity:true,relforcerowsecurity:true});
  });
  it('commits four synthetic intake drafts atomically with idempotent file hashes and version CAS',async()=>{
    const fixture=makeSyntheticIntake();
    const imports=new PostgresRestrictedIntakeImport(adapter(intake),{
      mayProcess:async()=>true,
      resolveOriginalPermission:async request=>syntheticOriginalPermission(request),
    },()=> '2026-10-31T00:00:00.000Z');
    const preview=await imports.preview(fixture);
    expect(preview.ready).toBe(true);
    expect(preview.formRowCount).toBe(4);
    const versions=Object.fromEntries(fixture.formsOptions.expectedSubjectKeys.map(s=>[s,0]));
    const first=await imports.apply(fixture,{previewHash:preview.previewHash,expectedVersions:versions});
    expect(first.applied).toHaveLength(4);
    expect(first.applied.every(x=>x.version===1&&!x.reused)).toBe(true);
    const repeated=await imports.apply(fixture,{previewHash:preview.previewHash,expectedVersions:versions});
    expect(repeated.applied.every(x=>x.version===1&&x.reused)).toBe(true);
    const changes={...fixture,courseFiles:fixture.courseFiles.map(f=>({
      ...f,content:f.content.replace('가상 기초과목','가상 수정 과목'),
    }))};
    const changed=await imports.preview(changes);
    expect(changed.ready).toBe(true);
    const stale={...Object.fromEntries(fixture.formsOptions.expectedSubjectKeys.map(s=>[s,1])),
      'SYN-INT-D':0};
    await expect(imports.apply(changes,{previewHash:changed.previewHash,expectedVersions:stale}))
      .rejects.toMatchObject({code:'VERSION_CONFLICT'});
    const rolledBack=await admin.query('SELECT subject_key,current_version FROM api_intake_heads ORDER BY subject_key');
    expect(rolledBack.rows).toHaveLength(4);
    expect(rolledBack.rows.every(x=>Number(x.current_version)===1)).toBe(true);
    const correct=Object.fromEntries(fixture.formsOptions.expectedSubjectKeys.map(s=>[s,1]));
    const second=await imports.apply(changes,{previewHash:changed.previewHash,expectedVersions:correct});
    expect(second.applied.every(x=>x.version===2&&!x.reused)).toBe(true);
    const audit=await admin.query('SELECT state,count(*)::integer AS n FROM api_intake_revisions GROUP BY state');
    expect(audit.rows).toEqual([{state:'STUDENT_REVIEW_PENDING',n:8}]);
    await expect(intake.query("UPDATE api_intake_revisions SET actor_ref='SYN-OTHER'"))
      .rejects.toMatchObject({code:'42501'});
    await expect(reader.query('SELECT * FROM api_intake_revisions'))
      .rejects.toMatchObject({code:'42501'});
    expect(JSON.stringify(first)).not.toContain('가상 기초과목');
  });
  it('persists reviewer-only synthetic sandbox across connections, serializes edits and denies revoked access',async()=>{
    const inviteId='SYN-REVIEWER-PG',actorId='google:SYN-PG-REVIEWER';
    await admin.query(`INSERT INTO reviewer_invitations
      (id,starts_at,ends_at,label,max_accounts,token_digest,issued_at)
      VALUES($1,clock_timestamp()-interval '1 minute',
        clock_timestamp()+interval '1 hour','SYNTHETIC TEST',20,repeat('a',64),clock_timestamp())`,
      [inviteId]);
    await admin.query(`INSERT INTO reviewer_enrollments(invite_id,actor_id,verified_email,enrolled_at)
      VALUES($1,$2,'synthetic-reviewer@example.invalid',clock_timestamp())`,[inviteId,actorId]);
    const a=new PostgresReviewerSandboxStore(adapter(sandbox));
    const b=new PostgresReviewerSandboxStore(adapter(sandbox));
    const key={inviteId,actorId,subjectId:'S01' as const};
    expect((await a.read(key)).actions).toEqual([]);
    await Promise.all([
      a.save({...key,action:{kind:'BOOKMARK',itemId:'SYN-BOOK-1',saved:true}}),
      b.save({...key,action:{kind:'MARK_READ',itemId:'SYN-BOOK-1',read:true}}),
    ]);
    const result=await b.read(key);
    expect(result.actions).toHaveLength(2);
    expect(new Set(result.actions.map(x=>x.kind))).toEqual(new Set(['BOOKMARK','MARK_READ']));
    expect((await a.read({...key,subjectId:'S02'})).actions).toEqual([]);
    await expect(a.read({...key,actorId:'google:SYN-OTHER'})).rejects.toMatchObject({code:'FORBIDDEN'});
    expect((await a.save({...key,action:{kind:'RESET_SANDBOX'}})).actions).toEqual([]);
    expect((await b.read(key)).actions).toEqual([]);
    await admin.query('UPDATE reviewer_invitations SET revoked_at=clock_timestamp() WHERE id=$1',[inviteId]);
    await expect(a.read(key)).rejects.toMatchObject({code:'FORBIDDEN'});
    await expect(b.save({...key,action:{kind:'BOOKMARK',itemId:'SYN-BOOK-1',saved:true}}))
      .rejects.toMatchObject({code:'FORBIDDEN'});
    expect((await sandbox.query('SELECT * FROM reviewer_sandbox_state')).rows).toEqual([]);
    await expect(sandbox.query('SELECT * FROM reviewer_enrollments')).rejects.toMatchObject({code:'42501'});
    await expect(sandbox.query('DELETE FROM reviewer_sandbox_state')).rejects.toMatchObject({code:'42501'});
  });
  it('applies the full migration set and FORCE RLS policies',async()=>{
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
  it('enforces shared school-mail IP/global/confirmation budgets with the forward SQL constraint',async()=>{
    const service=new PostgresAuthAttemptLimiter(adapter(limiter),randomBytes(32));
    for(const [kind,max] of [['SCHOOL_OTP_ISSUE_IP',10],['SCHOOL_OTP_ISSUE_GLOBAL',100],
      ['SCHOOL_OTP_CONFIRM_IP',30]] as const){
      const input={kind,identifier:'SYNTHETIC:'+kind,at:now()};
      const result=await Promise.all(Array.from({length:max+2},()=>service.consume(input)));
      expect(result.filter(Boolean)).toHaveLength(max);
      const rows=await admin.query('SELECT attempts,identity_digest FROM auth_attempt_windows WHERE kind=$1',[kind]);
      expect(rows.rows).toHaveLength(1);expect(rows.rows[0]?.attempts).toBe(max);
      expect(rows.rows[0]?.identity_digest).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.stringify(rows.rows)).not.toContain(input.identifier);
    }
  });
  it('bridges exact allowlisted synthetic HTTPS responses into immutable PG drafts and unchanged observations',async()=>{
    let body='가상 안내 원문',calls=0,step=0,status:200|304=200;
    const conditional:string[]=[];
    const url='https://synthetic.example.edu/notice/one';
    const policy={sourceId:'SYN-DURABLE-PG',canonicalUrl:url,
      approvedOrigin:'https://synthetic.example.edu',permissionRef:'SYN-DURABLE-RIGHTS',
      rightsReviewed:true,sourceClass:'SYNTHETIC' as const,provenance:'SYNTHETIC' as const};
    const executor=createApprovedDurableSourceExecutor({
      policies:new Map([[policy.sourceId,policy]]),
      rights:{resolve:async()=>null},
      egress:{
        resolveAddresses:async()=>['8.8.8.8'],
        requestPinned:async({init})=>{
          calls++;
          conditional.push(new Headers(init.headers).get('if-none-match')??'<none>');
          return new Response(status===304?null:body,{status,
            headers:status===304?{}:{'content-type':'text/plain',etag:'"SYN-REAL-PG"'}});
        },
      },
      extractor:new ApprovedPlainTextExtractor(),readerPool:adapter(temporal),
      writer:new PostgresSourceRevisionWriter(adapter(admin)),
      now:()=>new Date(Date.now()+step++*1000).toISOString(),
    });
    const input={actorRef:'SYN-OPERATOR',sourceId:policy.sourceId,
      permissionRef:policy.permissionRef};
    const first=await executor.execute(input);
    expect(first.kind).toBe('NEW_DRAFT');
    const same=await executor.execute(input);
    expect(same).toEqual({kind:'NOT_MODIFIED',revisionId:first.revisionId});
    status=304;
    const notModified=await executor.execute(input);
    expect(notModified).toEqual({kind:'NOT_MODIFIED',revisionId:first.revisionId});
    expect(conditional).toEqual(['<none>','"SYN-REAL-PG"','"SYN-REAL-PG"']);
    status=200;
    body='가상 안내 정정판';
    const changed=await executor.execute(input);
    expect(changed.kind).toBe('CHANGED_DRAFT');
    const old=await admin.query(`SELECT revision_id,supersedes,status FROM source_revisions_vnext
      WHERE source_id=$1 ORDER BY fetched_at`,[policy.sourceId]);
    expect(old.rows).toMatchObject([
      {revision_id:first.revisionId,supersedes:null,status:'NEEDS_REVIEW'},
      {revision_id:changed.revisionId,supersedes:first.revisionId,status:'NEEDS_REVIEW'},
    ]);
    expect((await admin.query('SELECT count(*)::integer AS n FROM source_check_observations WHERE source_id=$1',
      [policy.sourceId])).rows[0]?.n).toBe(2);
    expect(calls).toBe(4);
    const validators=await admin.query('SELECT revision_id,etag FROM source_http_validators WHERE source_id=$1',
      [policy.sourceId]);
    expect(validators.rows).toEqual([{revision_id:changed.revisionId,etag:'"SYN-REAL-PG"'}]);
    await expect(temporal.query('UPDATE source_revisions_vnext SET status=$1', ['ACTIVE']))
      .rejects.toMatchObject({code:'42501'});
  });
  it('durably deduplicates operator jobs and records only an immutable reviewed draft',async()=>{
    const sourceId='SYN-QUEUE-SOURCE',requestKey='SYN-QUEUE-R1';
    await admin.query(`INSERT INTO source_revisions_vnext
      (revision_id,source_id,original_sha256,content_sha256,media_kind,source_class,
        permission_ref,provenance,status,change_kind,fetched_at,last_checked_at)
      VALUES('SYN-QUEUE-DRAFT', $1,repeat('e',64),repeat('f',64),'TEXT','SYNTHETIC',
        'SYN-QUEUE-PERM','SYNTHETIC','NEEDS_REVIEW','NEW',clock_timestamp(),clock_timestamp())`,[sourceId]);
    let calls=0;
    const queue=new PostgresSourceIngestionQueue(adapter(admin),{
      mayProcess:async()=>true,
    },{execute:async()=>{calls++;return {kind:'NEW_DRAFT',revisionId:'SYN-QUEUE-DRAFT'};}});
    const task={actorRef:'SYN-OPERATOR',sourceId,permissionRef:'SYN-QUEUE-PERM',requestKey};
    const first=await queue.enqueue(task);
    expect(first.created).toBe(true);
    expect(await queue.enqueue(task)).toEqual({...first,created:false});
    await expect(queue.enqueue({...task,actorRef:'SYN-OTHER'})).rejects.toThrow('identity conflict');
    expect(await queue.runOne()).toEqual({jobId:first.jobId,state:'NEW_DRAFT'});
    expect(await queue.runOne()).toEqual({state:'IDLE'});
    expect(calls).toBe(1);
    expect((await admin.query('SELECT state,outcome_revision_id,attempt_count FROM source_ingest_jobs WHERE job_id=$1',
      [first.jobId])).rows[0]).toEqual({
      state:'NEW_DRAFT',outcome_revision_id:'SYN-QUEUE-DRAFT',attempt_count:1,
    });
    await expect(reader.query('SELECT * FROM source_ingest_jobs')).rejects.toMatchObject({code:'42501'});
  });
  it('fails closed for revoked rights and unknown completion without an automatic retry',async()=>{
    let revoked=false,calls=0;
    const queue=new PostgresSourceIngestionQueue(adapter(admin),{
      mayProcess:async({sourceId})=>!revoked||sourceId!=='SYN-QUEUE-REVOKE',
    },{execute:async()=>{calls++;throw new Error('Synthetic transport failed');}});
    const task={actorRef:'SYN-OPERATOR',sourceId:'SYN-QUEUE-REVOKE',
      permissionRef:'SYN-QUEUE-PERM',requestKey:'SYN-QUEUE-REVOKE-1'};
    const accepted=await queue.enqueue(task);revoked=true;
    expect(await queue.runOne()).toEqual({jobId:accepted.jobId,state:'BLOCKED_RIGHTS'});
    expect(calls).toBe(0);
    const fail=await queue.enqueue({...task,sourceId:'SYN-QUEUE-FAIL',requestKey:'SYN-QUEUE-FAIL-1'});
    expect(await queue.runOne()).toEqual({jobId:fail.jobId,state:'NEEDS_REVIEW'});
    expect(await queue.runOne()).toEqual({state:'IDLE'});
    expect(calls).toBe(1);
    expect((await admin.query('SELECT state,last_error_code FROM source_ingest_jobs WHERE job_id=$1',
      [fail.jobId])).rows[0]).toEqual({state:'NEEDS_REVIEW',last_error_code:'SOURCE_FAILURE'});
  });
  it('quarantines an expired source lease instead of repeating an ambiguous provider call',async()=>{
    const queue=new PostgresSourceIngestionQueue(adapter(admin),{
      mayProcess:async()=>true,
    },{execute:async()=>{throw Error('Must not execute');}});
    const task=await queue.enqueue({actorRef:'SYN-OPERATOR',sourceId:'SYN-QUEUE-EXPIRED',
      permissionRef:'SYN-QUEUE-PERM',requestKey:'SYN-QUEUE-EXPIRED-1'});
    await admin.query(`UPDATE source_ingest_jobs SET state='LEASED',attempt_count=1,
      lease_token=gen_random_uuid(),lease_until=clock_timestamp()-interval '5 seconds'
      WHERE job_id=$1`,[task.jobId]);
    expect(await queue.runOne()).toEqual({state:'IDLE'});
    expect((await admin.query('SELECT state,last_error_code FROM source_ingest_jobs WHERE job_id=$1',
      [task.jobId])).rows[0]).toEqual({state:'NEEDS_REVIEW',last_error_code:'UNKNOWN_COMPLETION'});
  });
  it('persists pending source cancellation across instances and refuses to cancel a dispatched lease',async()=>{
    let calls=0,started!:()=>void,finish!:()=>void;
    const entered=new Promise<void>(resolve=>{started=resolve;});
    const held=new Promise<void>(resolve=>{finish=resolve;});
    const authority={mayProcess:async()=>true};
    const executor={execute:async()=>{calls++;started();await held;throw Error('Synthetic ambiguous completion');}};
    const make=()=>new PostgresSourceIngestionQueue(adapter(admin),authority,executor);
    const task={actorRef:'SYN-CANCEL-OPERATOR',sourceId:'SYN-CANCEL-SOURCE',
      permissionRef:'SYN-CANCEL-PERM',requestKey:'SYN-CANCEL-KEY'};
    const first=make(),queued=await first.enqueue(task);
    const cancel={actorRef:task.actorRef,sourceId:task.sourceId,permissionRef:task.permissionRef,jobId:queued.jobId};
    expect(await first.cancelPending({...cancel,actorRef:'SYN-CANCEL-OTHER'})).toBe(false);
    expect((await Promise.all([first.cancelPending(cancel),make().cancelPending(cancel)])).sort())
      .toEqual([false,true]);
    const reconstructed=make();
    expect(await reconstructed.cancelPending(cancel)).toBe(false);
    expect(await reconstructed.enqueue(task)).toEqual({jobId:queued.jobId,created:false});
    expect(await reconstructed.runOne()).toEqual({state:'IDLE'});expect(calls).toBe(0);
    expect((await admin.query('SELECT state,attempt_count FROM source_ingest_jobs WHERE job_id=$1',[queued.jobId])).rows[0])
      .toEqual({state:'CANCELLED',attempt_count:0});
    const active=await reconstructed.enqueue({...task,requestKey:'SYN-CANCEL-ACTIVE'});
    const running=reconstructed.runOne();
    try{
      await Promise.race([entered,running.then(()=>{throw Error('Worker completed before executor entry');})]);
      expect(await first.cancelPending({...cancel,jobId:active.jobId})).toBe(false);
    }finally{finish();await running;}
    expect(await running).toEqual({state:'NEEDS_REVIEW',jobId:active.jobId});
    expect(await make().runOne()).toEqual({state:'IDLE'});expect(calls).toBe(1);
  });

  it('exposes only authorized job control/status across HTTP and two built API process lifetimes',async()=>{
    await proveSourceJobControlPg({admin,url:connectionUrl(),password:rolePassword,adapter});
  },60000);
  it('reads only current rights-scoped SourceRevision metadata from real SELECT-only PostgreSQL',async()=>{
    const old=new Date(Date.now()-60_000).toISOString(),fresh=new Date(Date.now()-30_000).toISOString();
    await admin.query(`INSERT INTO source_revisions_vnext (
      revision_id,source_id,supersedes,original_sha256,content_sha256,media_kind,source_class,
      permission_ref,provenance,status,change_kind,fetched_at,last_checked_at,last_verified_at)
      VALUES('SYN-HIST-R1','SYN-HIST-S1',NULL,repeat('a',64),repeat('b',64),'TEXT','SYNTHETIC',
        'SYN-HIST-PERM','SYNTHETIC','ACTIVE','NEW',$1,$1,$1),
        ('SYN-HIST-R2','SYN-HIST-S1','SYN-HIST-R1',repeat('c',64),repeat('d',64),'TEXT',
        'SYNTHETIC','SYN-HIST-PERM','SYNTHETIC','NEEDS_REVIEW','CORRECTED',$2,$2,NULL)`,[old,fresh]);
    await admin.query(`INSERT INTO source_ingest_heads(source_id,revision_id,fetched_at,last_checked_at)
      VALUES('SYN-HIST-S1','SYN-HIST-R2',$1,$1)`,[fresh]);
    const actor={
      role:'BETA' as const,actorId:'SYN-HIST-ACTOR',sessionIdHash:'H'.repeat(32),
      csrfToken:'C'.repeat(32),sessionExpiresAt:new Date(Date.now()+3_600_000).toISOString(),
      schoolMailProofExpiresAt:new Date(Date.now()+3_600_000).toISOString(),betaAllowed:true,
    };
    let allowed=true;
    const history=new PostgresSourceRevisionHistory(adapter(temporal),{
      resolveFor:async()=>({
        permissionRefs:new Set(allowed?['SYN-HIST-PERM']:[]),
        sourceIds:new Set(['SYN-HIST-S1']),policyVersion:allowed?'policy-v1':'revoked-v2',
      }),
    });
    const valid=await history.read({actor,sourceId:'SYN-HIST-S1',now:now()});
    expect(valid).toMatchObject({sourceId:'SYN-HIST-S1',currentRevisionId:'SYN-HIST-R2',
      revisions:[
        {revisionId:'SYN-HIST-R2',status:'NEEDS_REVIEW'},
        {revisionId:'SYN-HIST-R1',status:'ACTIVE'},
      ]});
    expect(JSON.stringify(valid)).not.toContain('paragraph_text');
    allowed=false;
    expect(await history.read({actor,sourceId:'SYN-HIST-S1',now:now()})).toBeNull();
    expect(await history.read({actor,sourceId:'SYN-HIST-OTHER',now:now()})).toBeNull();
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
  it('activates an independently reviewed preserved draft only at review time and matches NFKC without rewriting quotes',async()=>{
    const fetchedAt='2026-11-01T00:00:00.000Z',reviewedAt='2026-11-01T02:00:00.000Z';
    const bytes=Buffer.from('SYNTHETIC ＡＩ preserved original');
    const paragraphs=[{id:'SYN-REVIEW-P1',text:'SYNTHETIC ＡＩ preserved original'}];
    const revision={revisionId:'SYN-REVIEW-R1',sourceId:'SYN-REVIEW-S1',
      originalSha256:createHash('sha256').update(bytes).digest('hex'),
      contentSha256:hashRevisionParagraphs(paragraphs),mediaKind:'TEXT',sourceClass:'SYNTHETIC',
      permissionRef:'SYN-REVIEW-PERM',provenance:'SYNTHETIC',status:'NEEDS_REVIEW',
      changeKind:'NEW',fetchedAt,lastCheckedAt:fetchedAt,topicCodes:[]};
    const writer=new PostgresSourceRevisionWriter(adapter(admin));
    await writer.append({revision,paragraphs,originalBytes:bytes,permissionReviewed:true});
    const reader=new PostgresTemporalEvidenceReader(adapter(temporal));
    const request={permissionRefs:new Set([revision.permissionRef]),
      sourceIds:new Set([revision.sourceId]),asOf:fetchedAt,query:'AI'};
    expect((await reader.retrieve(request)).hits).toHaveLength(0);
    const review=new PostgresSourceReviewService(adapter(admin),{
      authorize:async()=>({reviewerId:'SYN-INDEPENDENT-REVIEWER',independentReview:true,
        permissionPolicyVersion:'SYN-REVIEW-POLICY-1'}),
    },()=>reviewedAt);
    expect(await review.review({reviewId:'SYN-REVIEW-ATTESTATION',actorRef:'SYN-INDEPENDENT-REVIEWER',
      sourceId:revision.sourceId,revisionId:revision.revisionId,permissionRef:revision.permissionRef,
      originalSha256:revision.originalSha256,contentSha256:revision.contentSha256,decision:'APPROVED'}))
      .toEqual({reviewId:'SYN-REVIEW-ATTESTATION',created:true});
    expect((await reader.retrieve(request)).hits).toHaveLength(0);
    const ready=await reader.retrieve({...request,asOf:reviewedAt});
    expect(ready.envelope.retrievalState).toBe('READY');
    expect(ready.hits).toHaveLength(1);expect(ready.hits[0]?.quote).toBe(paragraphs[0]?.text);
    const immutable=await admin.query(`SELECT fetched_at,status,last_verified_at
      FROM source_revisions_vnext WHERE revision_id=$1`,[revision.revisionId]);
    expect(immutable.rows[0]?.fetched_at.toISOString()).toBe(fetchedAt);
    expect(immutable.rows[0]?.status).toBe('NEEDS_REVIEW');expect(immutable.rows[0]?.last_verified_at).toBeNull();
    await expect(temporal.query('SELECT original_bytes FROM source_originals_vnext')).rejects.toMatchObject({code:'42501'});
    const events=await admin.query(`SELECT count(*)::int AS n FROM source_invalidation_deliveries
      WHERE event_id='review:SYN-REVIEW-ATTESTATION'`);expect(events.rows[0]?.n).toBe(5);
  });
  it('keeps staged provider input projections immutable and inaccessible to unrelated runtime roles',async()=>{
    const rows=await admin.query(`SELECT relname,relrowsecurity,relforcerowsecurity
      FROM pg_class WHERE relname IN ('api_ai_provider_inputs','api_ai_provider_input_heads')
      ORDER BY relname`);
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows.every(r=>r.relrowsecurity===true&&r.relforcerowsecurity===true)).toBe(true);
    const triggers=await admin.query(`SELECT tgname FROM pg_trigger
      WHERE tgrelid='api_ai_provider_inputs'::regclass AND NOT tgisinternal`);
    expect(triggers.rows.map(r=>r.tgname)).toEqual(expect.arrayContaining([
      'immutable_ai_provider_input','approved_ai_input_needs_current_consent',
    ]));
    await expect(writer.query('SELECT projection_id FROM api_ai_provider_inputs')).rejects.toMatchObject({code:'42501'});
    await expect(writer.query('SELECT projection_id FROM api_ai_provider_input_heads')).rejects.toMatchObject({code:'42501'});
    await expect(writer.query(`INSERT INTO api_ai_provider_input_heads
      (actor_id,input_ref,operation,projection_id) VALUES ('SYN-A','SYN-I','HCX_007','SYN-P')`))
      .rejects.toMatchObject({code:'42501'});
    expect((await admin.query(`SELECT count(*)::int AS n FROM api_ai_provider_inputs`)).rows[0]?.n).toBe(0);
  });

  // Run after #157's empty-projection baseline test; keep that prior gate unchanged.
  it('provider authority reads independently approved input with actual actor RLS and no write privilege',async()=>{
    const p=await provisionProvider('RLS');
    expect((await p.authority.read(p.request))?.packet?.providerInputClass).toBe('SYNTHETIC_CLEARED');
    expect(await p.authority.read({...p.request,actor:{...p.request.actor,actorId:'SYN-OTHER-ACTOR'}})).toBeNull();
    expect((await aiProvider.query('SELECT projection_id FROM api_ai_provider_inputs')).rows).toHaveLength(0);
    await expect(aiProvider.query(`UPDATE api_ai_provider_input_heads SET projection_id=$1`,[p.projectionId])).rejects.toMatchObject({code:'42501'});
    await expect(admin.query(`UPDATE api_ai_provider_inputs SET epoch='tampered' WHERE projection_id=$1`,[p.projectionId])).rejects.toThrow('immutable provider input');
    const policies=await admin.query(`SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class
      WHERE relname=ANY($1::text[])`,[['api_ai_provider_inputs','api_ai_provider_input_heads']]);
    expect(policies.rows).toHaveLength(2);expect(policies.rows.every(r=>r.relrowsecurity&&r.relforcerowsecurity)).toBe(true);
  });
  it('physically erases provider payloads on external-AI withdrawal and never restores archived inputs',async()=>{
    const p=await provisionProvider('ERASURE');
    expect(await p.authority.read({...p.request,now:now()})).not.toBeNull();
    await admin.query(`UPDATE api_self_consents SET choices_json=jsonb_set(choices_json,'{externalAi}','false'::jsonb),
      version=version+1,updated_at=clock_timestamp() WHERE actor_id=$1`,[p.actorId]);
    const row=(await admin.query('SELECT safe_packet,media_bytes,erased_at,epoch FROM api_ai_provider_inputs WHERE projection_id=$1',[p.projectionId])).rows[0];
    expect(row?.safe_packet).toBeNull();expect(row?.media_bytes).toBeNull();expect(row?.erased_at).not.toBeNull();expect(row?.epoch).toBe('epoch-1');
    expect(await p.authority.read({...p.request,now:now()})).toBeNull();
    await expect(admin.query(`UPDATE api_ai_provider_inputs SET safe_packet='{}'::jsonb,erased_at=NULL WHERE projection_id=$1`,[p.projectionId]))
      .rejects.toThrow('immutable provider input');
    await admin.query(`UPDATE api_self_consents SET choices_json=jsonb_set(choices_json,'{externalAi}','true'::jsonb),version=version+1 WHERE actor_id=$1`,[p.actorId]);
    expect(await p.authority.read({...p.request,now:now()})).toBeNull();
  });
  it('provider latest revoked receipt shadows the earlier still-valid receipt',async()=>{
    const p=await provisionProvider('REVOKE');expect(await p.authority.read(p.request)).not.toBeNull();
    await admin.query(`INSERT INTO source_rights_receipts(receipt_id,actor_id,source_id,permission_ref,canonical_url,purposes,reviewed_by,reviewed_at,starts_at,expires_at,policy_version)
      VALUES($1,$2,$3,$4,'https://example.org/synthetic',ARRAY['STORE','EXTERNAL_TRANSFER'],'SYN-INDEPENDENT-OPERATOR',$5,$5,$6,'rights-2')`,
      [p.actorId+'-RIGHTS-2',p.actorId,p.sourceId,p.permissionRef,p.before,p.expires]);
    await admin.query(`INSERT INTO source_rights_revocations(receipt_id,revoked_by,revoked_at,reason_ref) VALUES($1,'SYN-INDEPENDENT-OPERATOR',clock_timestamp(),'SYN-REVOKED')`,[p.actorId+'-RIGHTS-2']);
    expect(await p.authority.read({...p.request,now:now()})).toBeNull();
  });
  it('provider fresh consent withdrawal and head deletion deny previously approved projection',async()=>{
    const p=await provisionProvider('CONSENT');expect(await p.authority.read(p.request)).not.toBeNull();
    await admin.query(`UPDATE api_self_consents SET choices_json=jsonb_set(choices_json,'{externalAi}','false'),version=version+1,updated_at=clock_timestamp() WHERE actor_id=$1`,[p.actorId]);
    expect(await p.authority.read({...p.request,now:now()})).toBeNull();
    const h=await provisionProvider('HEAD');expect(await h.authority.read(h.request)).not.toBeNull();
    await admin.query('DELETE FROM api_ai_provider_input_heads WHERE actor_id=$1',[h.actorId]);
    expect(await h.authority.read({...h.request,now:now()})).toBeNull();
  });

  it('accepts only SETTLED candidate results, isolates actors and scrubs on consent withdrawal',async()=>{
    const owner='SYN-RESULT-A',session='SYN-RESULT-SESSION-1',phase='SYN-RESULT-PHASE';
    const projection='SYN-RESULT-PROJECTION-1',inputRef='SYN-RESULT-INPUT-1',operation='HCX_007' as const;
    const idempotencyKey='SYN-RESULT-KEY',epoch='synthetic-projection-v1';
    const approvedAt=new Date(Date.now()-120_000).toISOString();
    const asOf=new Date(Date.now()-60_000).toISOString();
    const expiresAt=new Date(Date.now()+600_000).toISOString();
    const packet={packetId:'DOC-RESULT-SYN',task:'opportunity_terms',providerInputClass:'SYNTHETIC_CLEARED',
      sourceTokens:[{token:'DOC1',paragraphs:[{id:'p1',text:'SYNTHETIC ONLY'}]}],
      allowedTopicCodes:[],allowedObjectTokens:[],approvedFacts:[],schemaVersion:'1',promptVersion:'1'};
    await admin.query(`INSERT INTO api_self_consents(actor_id,version,choices_json,updated_at)
      VALUES($1,1,$2::jsonb,$3)`,[owner,JSON.stringify({
      personalStorage:true,externalAi:true,teamReview:false,ncpStorage:false,presentation:false,
    }),approvedAt]);
    await admin.query(`INSERT INTO api_ai_provider_inputs(
      projection_id,actor_id,input_ref,operation,as_of,epoch,policy_version,consent_version,
      approved_by,approved_at,expires_at,input_class,privacy_review_ref,source_refs,safe_packet)
      VALUES($1,$2,$3,$4,$5,$6,'synthetic-policy-v1','1','SYN-INDEPENDENT-REVIEWER',
        $7,$8,'SYNTHETIC_CLEARED','SYN-PRIVACY-REVIEW',$9::jsonb,$10::jsonb)`,[
      projection,owner,inputRef,operation,asOf,epoch,approvedAt,expiresAt,
      JSON.stringify([{sourceId:'SYN-RESULT-SOURCE',revisionId:'SYN-RESULT-REV',
        permissionRef:'SYN-RESULT-PERM',originalSha256:'c'.repeat(64)}]),JSON.stringify(packet),
    ]);
    await admin.query(`INSERT INTO ai_budget_phases(
      phase_id,enabled,starts_at,ends_at,max_units,actor_max_units,max_attempts,actor_max_attempts)
      VALUES($1,true,clock_timestamp()-interval '1 minute',
        clock_timestamp()+interval '1 hour',1000,1000,10,10)`,[phase]);
    const ledger=new PostgresAiBudgetLedger(adapter(aiBudget));
    const requestSha256='a'.repeat(64),receiptSha256='b'.repeat(64);
    const job=await ledger.reserve(owner,{phaseId:phase,task:operation,idempotencyKey,
      requestSha256,worstCaseUnits:100});
    const receipt={phaseId:phase,jobId:job.jobId,requestSha256};
    const value={jobId:job.jobId,actorId:owner,sessionIdHash:session,inputRef,operation,asOf,
      phaseId:phase,idempotencyKey,requestSha256,
      inputEpoch:'input-'+createHash('sha256').update([projection,epoch,'1'].join('|')).digest('hex'),
      expiresAt,candidate:{reviewState:'NEEDS_REVIEW',text:'SYNTHETIC-RESULT-CANDIDATE'}};
    const results=new PostgresProviderResults(adapter(aiResults));
    await expect(results.put(value)).rejects.toThrow('Provider result unavailable'); // RESERVED
    await ledger.transition(owner,{...receipt,action:'DISPATCHED'});
    await expect(results.put(value)).rejects.toThrow('Provider result unavailable'); // DISPATCHED
    await ledger.transition(owner,{...receipt,action:'UNKNOWN_BILLING'});
    await expect(results.put(value)).rejects.toThrow('Provider result unavailable'); // unresolved bill
    await ledger.transition(owner,{...receipt,action:'SETTLED',actualUnits:65,receiptSha256});
    await expect(results.put(value)).rejects.toThrow('Provider result unavailable'); // missing current head
    await admin.query(`INSERT INTO api_ai_provider_input_heads(actor_id,input_ref,operation,projection_id)
      VALUES($1,$2,$3,$4)`,[owner,inputRef,operation,projection]);
    await Promise.all(Array.from({length:4},()=>results.put(value)));
    expect((await admin.query(`SELECT count(*)::int AS n FROM api_ai_provider_results
      WHERE job_id=$1`,[job.jobId])).rows[0]?.n).toBe(1);
    // A new adapter instance reads only durable PostgreSQL state (simulates process restart).
    const restarted=new PostgresProviderResults(adapter(aiResults));
    expect(await restarted.get(owner,session,job.jobId)).toEqual(value);
    expect(await restarted.get('SYN-RESULT-OTHER',session,job.jobId)).toBeNull();
    expect(await restarted.get(owner,'SYN-RESULT-OTHER-SESSION',job.jobId)).toBeNull();
    await expect(results.put({...value,actorId:'SYN-RESULT-OTHER'})).rejects.toThrow('Provider result unavailable');
    await expect(results.put({...value,sessionIdHash:'SYN-RESULT-OTHER-SESSION'}))
      .rejects.toThrow('Provider result unavailable');
    await expect(results.put({...value,candidate:{reviewState:'NEEDS_REVIEW',text:'SYNTHETIC-ALTERED'}}))
      .rejects.toThrow('Provider result unavailable');
    await expect(results.put({...value,inputEpoch:'input-'+'0'.repeat(64)}))
      .rejects.toThrow('Provider result unavailable');
    // Preserve the remaining original #150 exact billing/input binding cases.
    for(const delta of [{requestSha256:'0'.repeat(64)},{phaseId:'SYN-OTHER-PHASE'},
      {idempotencyKey:'SYN-OTHER-KEY'},{operation:'OCR_GENERAL' as const},
      {asOf:new Date(Date.parse(asOf)-1).toISOString()},
      {expiresAt:new Date(Date.now()+31*60_000).toISOString()}]){
      await expect(results.put({...value,...delta})).rejects.toThrow('Provider result unavailable');
    }
    expect(await restarted.get(owner,session,job.jobId)).toEqual(value);
    await expect(aiResults.query('SELECT result_json FROM api_ai_provider_results')).rejects.toMatchObject({code:'42501'});
    await expect(aiResults.query("UPDATE api_ai_provider_results SET result_json='{}'::jsonb"))
      .rejects.toMatchObject({code:'42501'});
    await expect(aiResults.query('SELECT public.ai_provider_results_prune(1)')).rejects.toMatchObject({code:'42501'});
    expect((await admin.query(`SELECT relrowsecurity,relforcerowsecurity FROM pg_class
      WHERE relname='api_ai_provider_results'`)).rows).toEqual([{relrowsecurity:true,relforcerowsecurity:true}]);
    await admin.query('DELETE FROM api_ai_provider_input_heads WHERE actor_id=$1',[owner]);
    expect(await restarted.get(owner,session,job.jobId)).toBeNull();
    // Restore only this synthetic operator fixture to test withdrawal separately.
    await admin.query(`INSERT INTO api_ai_provider_input_heads(actor_id,input_ref,operation,projection_id)
      VALUES($1,$2,$3,$4)`,[owner,inputRef,operation,projection]);
    expect(await restarted.get(owner,session,job.jobId)).toEqual(value);
    // Consent withdrawal triggers one-way erasure of input AND previously settled result.
    await admin.query(`UPDATE api_self_consents SET version=version+1,
      choices_json=jsonb_set(choices_json,'{externalAi}','false'::jsonb),
      updated_at=clock_timestamp() WHERE actor_id=$1`,[owner]);
    expect(await restarted.get(owner,session,job.jobId)).toBeNull();
    await expect(results.put(value)).rejects.toThrow('Provider result unavailable');
    expect((await admin.query(`SELECT result_json IS NULL AS scrubbed,erased_at IS NOT NULL AS erased
      FROM api_ai_provider_results WHERE job_id=$1`,[job.jobId])).rows[0])
      .toEqual({scrubbed:true,erased:true});
    expect((await admin.query(`SELECT safe_packet IS NULL AS scrubbed,erased_at IS NOT NULL AS erased
      FROM api_ai_provider_inputs WHERE projection_id=$1`,[projection])).rows[0])
      .toEqual({scrubbed:true,erased:true});
  });

  it('persists mailbox OTP across HTTP reconstruction, admits BETA only after proof, and rechecks withdrawal',async()=>{
    await admin.query(`
      CREATE ROLE hufs_test_otp_sessions LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
      CREATE ROLE hufs_test_otp_admission LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
      CREATE ROLE hufs_test_otp_challenges LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
      CREATE ROLE hufs_test_otp_proofs LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
      GRANT USAGE ON SCHEMA public TO hufs_test_otp_sessions,hufs_test_otp_admission,hufs_test_otp_challenges,hufs_test_otp_proofs;
      GRANT SELECT,INSERT,DELETE ON google_login_attempts TO hufs_test_otp_sessions;
      GRANT SELECT,INSERT,UPDATE ON google_app_sessions TO hufs_test_otp_sessions;
      GRANT SELECT ON beta_school_proofs TO hufs_test_otp_admission,hufs_test_otp_proofs;
      GRANT UPDATE(method,proof_verified_at,proof_expires_at) ON beta_school_proofs TO hufs_test_otp_proofs;
      GRANT SELECT,INSERT,UPDATE ON beta_mail_issue_windows TO hufs_test_otp_challenges;
      GRANT SELECT,INSERT,UPDATE,DELETE ON beta_mail_challenges TO hufs_test_otp_challenges;
    `);
    const sessions=poolFor(connectionUrl(),'hufs_test_otp_sessions');
    const admission=poolFor(connectionUrl(),'hufs_test_otp_admission');
    const challenges=poolFor(connectionUrl(),'hufs_test_otp_challenges');
    const proofs=poolFor(connectionUrl(),'hufs_test_otp_proofs');
    const at=new Date(),origin='https://synthetic-otp.example.test';
    const subject='SYN-PG-OTP',schoolEmail='synthetic-otp@hufs.ac.kr';
    const expires=new Date(at.getTime()+600_000).toISOString();
    const pair=await generateKeyPair('RS256',{extractable:true});
    const clientId='synthetic-otp.apps.googleusercontent.com';
    const jwks=createLocalJWKSet({keys:[{...await exportJWK(pair.publicKey),kid:'otp',alg:'RS256',use:'sig'}]});
    let nonce='',code='',sends=0,deliveryFails=false,currentSubject=subject;
    const config={pools:{sessions:adapter(sessions),admission:adapter(admission),attempts:adapter(limiter)},
      attemptDigestKey:randomBytes(32),google:{clientId,allowedOrigin:origin,now:()=>at,
        redirectUri:origin+'/api/auth/google/callback',
        verifyIdToken:idVerifier({clientId,jwks,now:()=>at}),
        exchangeCode:async()=>new SignJWT({sub:currentSubject,email:'synthetic-otp@example.test',email_verified:true,nonce})
          .setProtectedHeader({alg:'RS256',kid:'otp'}).setIssuer('https://accounts.google.com')
          .setAudience(clientId).setIssuedAt(Math.floor(at.getTime()/1000)-1)
          .setExpirationTime(Math.floor(at.getTime()/1000)+600).sign(pair.privateKey)},
      schoolMail:{pools:{challenges:adapter(challenges),proofUpdates:adapter(proofs)},digestKey:randomBytes(32),
        sender:{send:async(input:{schoolEmail:string;code:string;expiresAt:string})=>{
          sends++;code=input.code;expect(input.schoolEmail).toBe(schoolEmail);
          if(deliveryFails)throw Error('Synthetic delivery failure');
        }}}};
    const make=()=>createIntegratedApi({allowedOrigin:origin,repository:closedRepository,
      ...createPostgresSchoolMailAuth(config),now:()=>at.toISOString()});
    let app=make();
    const cookie=(response:{headers:Record<string,unknown>},name:string)=>{
      const raw=response.headers['set-cookie'],all=Array.isArray(raw)?raw:[raw];
      return String(all.find(v=>typeof v==='string'&&v.startsWith(name+'='))??'').split(';')[0]!;
    };
    const login=async(intent:'BETA'|'REVIEWER')=>{
      const start=await app.inject({url:'/api/auth/google/start?intent='+intent,remoteAddress:'127.0.0.91'});
      expect(start.statusCode).toBe(303);
      const url=new URL(String(start.headers.location));nonce=url.searchParams.get('nonce')!;
      return app.inject({url:'/api/auth/google/callback?state='+url.searchParams.get('state')+'&code=SYN-CODE',
        remoteAddress:'127.0.0.91',headers:{cookie:cookie(start,'__Host-hufs_login')}});
    };
    try{
      const reviewer=await login('REVIEWER');expect(reviewer.statusCode).toBe(303);
      const headers={cookie:cookie(reviewer,'__Host-hufs_session'),origin};
      const csrf=(await app.inject({url:'/api/auth/csrf',headers})).json().csrfToken as string;
      const request={method:'POST' as const,url:'/api/auth/school-mail/request',remoteAddress:'127.0.0.91',
        headers:{...headers,'x-csrf-token':csrf},payload:{schoolEmail}};
      expect((await app.inject(request)).statusCode).toBe(403);expect(sends).toBe(0);
      await admin.query(`INSERT INTO beta_school_proofs(google_subject,school_email,method,approved_at,approved_until)
        VALUES($1,$2,'MAILBOX_OTP',$3,$4)`,[subject,schoolEmail,at.toISOString(),expires]);
      expect((await login('BETA')).statusCode).toBe(403);
      expect((await app.inject({...request,headers})).statusCode).toBe(403);expect(sends).toBe(0);
      const issued=await app.inject(request);expect(issued.statusCode).toBe(202);
      expect(issued.json()).not.toHaveProperty('code');expect(code).toMatch(/^\d{8}$/);
      const challengeId=issued.json().challengeId as string;
      const stored=(await admin.query('SELECT proof_digest,used_at FROM beta_mail_challenges WHERE challenge_id=$1',[challengeId])).rows[0]!;
      expect(stored.proof_digest).toMatch(/^[a-f0-9]{64}$/);expect(stored.proof_digest).not.toBe(code);
      expect(stored.used_at).toBeNull();
      await app.close();app=make(); // only PG and protected shared keys survive
      const confirm={...request,url:'/api/auth/school-mail/confirm',payload:{schoolEmail,challengeId,code}};
      currentSubject='SYN-PG-OTHER';
      const other=await login('REVIEWER'),otherHeaders={cookie:cookie(other,'__Host-hufs_session'),origin};
      const otherCsrf=(await app.inject({url:'/api/auth/csrf',headers:otherHeaders})).json().csrfToken as string;
      expect((await app.inject({...confirm,headers:{...otherHeaders,'x-csrf-token':otherCsrf}})).json()).toEqual({verified:false});
      currentSubject=subject;
      expect((await app.inject(confirm)).json()).toEqual({verified:true});
      expect((await app.inject(confirm)).json()).toEqual({verified:false});
      const beta=await login('BETA');expect(beta.statusCode).toBe(303);
      const betaHeaders={cookie:cookie(beta,'__Host-hufs_session')};
      expect((await app.inject({url:'/api/auth/session',headers:betaHeaders})).json()).toMatchObject({role:'BETA',actorId:'google:'+subject});
      await expect(admission.query("UPDATE beta_school_proofs SET method='SIGNED_WORKSPACE'")).rejects.toMatchObject({code:'42501'});
      await expect(proofs.query('UPDATE beta_school_proofs SET approved_until=approved_until')).rejects.toMatchObject({code:'42501'});
      await expect(proofs.query("INSERT INTO beta_school_proofs SELECT * FROM beta_school_proofs WHERE false")).rejects.toMatchObject({code:'42501'});
      deliveryFails=true;
      expect((await app.inject(request)).statusCode).toBe(403);
      expect((await admin.query('SELECT count(*)::int AS n FROM beta_mail_challenges WHERE google_subject=$1',[subject])).rows[0]?.n).toBe(1);
      await admin.query('UPDATE beta_school_proofs SET revoked_at=$2 WHERE google_subject=$1',[subject,at.toISOString()]);
      await app.close();app=make();
      expect((await app.inject({url:'/api/auth/session',headers:betaHeaders})).statusCode).toBe(401);
      const sent=sends;
      expect((await app.inject(request)).statusCode).toBe(403);expect(sends).toBe(sent);
    }finally{await app.close();}
  });

  it('assembles PostgreSQL BETA auth and owner consent HTTP with restart, shared revocation, limits and CSRF',async()=>{
    await admin.query(`
      CREATE ROLE hufs_test_auth_sessions LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
      CREATE ROLE hufs_test_auth_admission LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
      GRANT USAGE ON SCHEMA public TO hufs_test_auth_sessions,hufs_test_auth_admission;
      GRANT SELECT,INSERT,DELETE ON google_login_attempts TO hufs_test_auth_sessions;
      GRANT SELECT,INSERT,UPDATE ON google_app_sessions TO hufs_test_auth_sessions;
      GRANT SELECT ON beta_school_proofs TO hufs_test_auth_admission;
    `);
    const sessions=poolFor(connectionUrl(),'hufs_test_auth_sessions');
    const admission=poolFor(connectionUrl(),'hufs_test_auth_admission');
    const at=new Date(),expires=new Date(at.getTime()+600_000).toISOString();
    const origin='https://synthetic-auth.example.test',clientId='synthetic.apps.googleusercontent.com';
    const subject='SYN-PG-AUTH',email='synthetic-pg-auth@hufs.ac.kr';
    const pair=await generateKeyPair('RS256',{extractable:true});
    const jwks=createLocalJWKSet({keys:[{...await exportJWK(pair.publicKey),kid:'synthetic-pg-auth',alg:'RS256',use:'sig'}]});
    let nonce='',exchanges=0;
    const config={pools:{sessions:adapter(sessions),admission:adapter(admission),attempts:adapter(limiter)},
      attemptDigestKey:randomBytes(32),google:{clientId,allowedOrigin:origin,
        redirectUri:origin+'/api/auth/google/callback',now:()=>at,
        verifyIdToken:idVerifier({clientId,jwks,now:()=>at}),
        exchangeCode:async()=>{
          exchanges++;return new SignJWT({sub:subject,email,email_verified:true,hd:'hufs.ac.kr',nonce})
            .setProtectedHeader({alg:'RS256',kid:'synthetic-pg-auth'}).setIssuer('https://accounts.google.com')
            .setAudience(clientId).setIssuedAt(Math.floor(at.getTime()/1000)-1)
            .setExpirationTime(Math.floor(at.getTime()/1000)+600).sign(pair.privateKey);
        }}};
    let ownerAllowed=true;
    const make=()=>createPostgresApplication({auth:config,platform:{
      pools:{projections:adapter(reader),calendar:adapter(temporal),personal:adapter(writer),evidence:adapter(temporal)},
      evidenceRights:{resolveFor:async()=>null},selfAccount:{pool:adapter(selfAccount),
        authority:{mayAccess:async({actorId})=>ownerAllowed&&actorId==='google:'+subject}},
    }});
    const first=make();let second=make();
    const cookie=(response:{headers:Record<string,unknown>},name:string)=>{
      const raw=response.headers['set-cookie'],all=Array.isArray(raw)?raw:[raw];
      return String(all.find(v=>typeof v==='string'&&v.startsWith(name+'='))??'').split(';')[0]!;
    };
    const begin=async()=>{
      const response=await first.inject({url:'/api/auth/google/start?intent=BETA',remoteAddress:'127.0.0.81'});
      expect(response.statusCode).toBe(303);
      const url=new URL(String(response.headers.location));nonce=url.searchParams.get('nonce')!;
      return {url:'/api/auth/google/callback?state='+url.searchParams.get('state')+'&code=SYN-CODE',
        headers:{cookie:cookie(response,'__Host-hufs_login')}};
    };
    try{
      // Signed Workspace hd alone cannot grant BETA without a pre-existing approval.
      expect((await first.inject(await begin())).statusCode).toBe(403);
      await admin.query(`INSERT INTO beta_school_proofs(google_subject,school_email,method,
        proof_verified_at,proof_expires_at,approved_at,approved_until)
        VALUES($1,$2,'SIGNED_WORKSPACE',$3,$4,$3,$4)`,[subject,email,at.toISOString(),expires]);
      const pending=await begin(),login=await first.inject(pending);
      expect(login.statusCode).toBe(303);
      await second.close();second=make(); // reconstruct using only durable state
      const bearer=cookie(login,'__Host-hufs_session'),headers={cookie:bearer};
      expect(String(login.headers['set-cookie'])).toContain('HttpOnly; Secure; SameSite=Lax');
      expect(String(login.headers['set-cookie'])).not.toContain('Domain=');
      expect((await second.inject({url:'/api/auth/session',headers})).json()).toMatchObject({role:'BETA',actorId:'google:'+subject});
      const choices={personalStorage:true,externalAi:false,teamReview:false,ncpStorage:false,presentation:false};
      const consentCsrf=(await second.inject({url:'/api/auth/csrf',headers})).json().csrfToken as string;
      const consent=await second.inject({method:'PUT',url:'/api/consents',headers:{...headers,origin,'x-csrf-token':consentCsrf},
        payload:{expectedVersion:0,choices}});
      expect(consent.statusCode).toBe(200);expect(consent.json()).toMatchObject({consents:{version:1,choices}});
      await second.close();second=make();
      expect((await second.inject({url:'/api/consents',headers})).json()).toMatchObject({consents:{version:1,choices}});
      const profile=await second.inject({url:'/api/profile',headers});
      expect(profile.statusCode).toBe(200);expect(profile.json()).toEqual({profile:null});
      ownerAllowed=false;
      expect((await second.inject({url:'/api/consents',headers})).statusCode).toBe(403);
      ownerAllowed=true;
      const before=exchanges;
      expect((await second.inject(pending)).statusCode).toBe(403);
      expect(exchanges).toBe(before); // one-time state consumed across replicas
      expect((await second.inject({method:'POST',url:'/api/auth/logout',headers,payload:{}})).statusCode).toBe(403);
      expect((await first.inject({url:'/api/auth/session',headers})).statusCode).toBe(200);
      await expect(admission.query('UPDATE beta_school_proofs SET revoked_at=clock_timestamp()'))
        .rejects.toMatchObject({code:'42501'});
      await admin.query('UPDATE beta_school_proofs SET proof_expires_at=$2 WHERE google_subject=$1',
        [subject,new Date(at.getTime()+1).toISOString()]);
      config.google.now=()=>new Date(at.getTime()+2);
      const expired=make();
      try{expect((await expired.inject({url:'/api/auth/session',headers})).statusCode).toBe(401);}
      finally{await expired.close();}
      config.google.now=()=>at;
      await admin.query('UPDATE beta_school_proofs SET proof_expires_at=$2 WHERE google_subject=$1',[subject,expires]);
      await admin.query('UPDATE beta_school_proofs SET revoked_at=$2 WHERE google_subject=$1',[subject,at.toISOString()]);
      expect((await second.inject({url:'/api/auth/session',headers})).statusCode).toBe(401);
      expect((await first.inject({url:'/api/auth/session',headers})).statusCode).toBe(401);
      // Restore only this synthetic operator fixture to exercise durable logout separately.
      await admin.query('UPDATE beta_school_proofs SET revoked_at=NULL WHERE google_subject=$1',[subject]);
      const csrf=(await second.inject({url:'/api/auth/csrf',headers})).json().csrfToken as string;
      expect((await second.inject({method:'POST',url:'/api/auth/logout',payload:{},
        headers:{...headers,origin,'x-csrf-token':csrf}})).statusCode).toBe(204);
      expect((await first.inject({url:'/api/auth/session',headers})).statusCode).toBe(401);
      const start={url:'/api/auth/google/start?intent=BETA',remoteAddress:'127.0.0.82'};
      for(let i=0;i<10;i++)expect((await (i%2?first:second).inject(start)).statusCode).toBe(303);
      expect((await first.inject(start)).statusCode).toBe(429);
    }finally{await first.close();await second.close();}
  });

  it('retention never resurrects erased payloads after AI/storage withdrawal, consent deletion or later reconsent',async()=>{
    for(const mode of ['externalAi','personalStorage','delete'] as const){
      const f=await retentionResult('ERASE-'+mode);
      if(mode==='delete')await admin.query('DELETE FROM api_self_consents WHERE actor_id=$1',[f.owner]);
      else await admin.query(`UPDATE api_self_consents SET version=version+1,
        choices_json=jsonb_set(choices_json,ARRAY[$2]::text[],'false'::jsonb),updated_at=clock_timestamp()
        WHERE actor_id=$1`,[f.owner,mode]);
      const erased=(await admin.query(`SELECT result_json,erased_at,request_sha256 FROM api_ai_provider_results
        WHERE job_id=$1`,[f.value.jobId])).rows[0]!;
      expect(erased.result_json).toBeNull();expect(erased.erased_at).not.toBeNull();expect(erased.request_sha256).toBe(billingHash);
      await admin.query(`INSERT INTO api_self_consents(actor_id,version,choices_json,updated_at)
        VALUES($1,2,'{"personalStorage":true,"externalAi":true,"teamReview":false,"ncpStorage":false,"presentation":false}'::jsonb,clock_timestamp())
        ON CONFLICT(actor_id) DO UPDATE SET version=api_self_consents.version+1,choices_json=EXCLUDED.choices_json,updated_at=EXCLUDED.updated_at`,[f.owner]);
      const restarted=new PostgresProviderResults(adapter(aiResults));
      expect(await restarted.get(f.owner,f.value.sessionIdHash,f.value.jobId)).toBeNull();
      await expect(restarted.put(f.value)).rejects.toThrow('Provider result unavailable');
      await expect(admin.query(`UPDATE api_ai_provider_results SET result_json=$2::jsonb,erased_at=NULL
        WHERE job_id=$1`,[f.value.jobId,JSON.stringify(f.value.candidate)])).rejects.toThrow('immutable provider result');
      expect((await admin.query('SELECT state,charged_units,receipt_sha256 FROM ai_budget_jobs WHERE job_id=$1',
        [f.value.jobId])).rows[0]).toEqual({state:'SETTLED',charged_units:'40',receipt_sha256:usageReceipt});
    }
  });

  it('a separate execute-only retention role scrubs bounded expired batches while preserving active results and billing',async()=>{
    await admin.query(`CREATE ROLE hufs_test_result_retention LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
      GRANT USAGE ON SCHEMA public TO hufs_test_result_retention;
      GRANT EXECUTE ON FUNCTION ai_provider_results_prune(integer) TO hufs_test_result_retention;`);
    const maintenance=poolFor(connectionUrl(),'hufs_test_result_retention');
    const first=await retentionResult('TTL-A',3000),second=await retentionResult('TTL-B',3000),active=await retentionResult('TTL-ACTIVE');
    // Wait only until these synthetic fixtures expire, independent of runner speed.
    await admin.query(`SELECT pg_sleep(GREATEST(0,EXTRACT(EPOCH FROM $1::timestamptz-clock_timestamp()))+0.02)`,[second.value.expiresAt]);
    const restarted=new PostgresProviderResults(adapter(aiResults));
    for(const f of [first,second])expect(await restarted.get(f.owner,f.value.sessionIdHash,f.value.jobId)).toBeNull();
    await expect(aiResults.query('SELECT public.ai_provider_results_prune(1)')).rejects.toMatchObject({code:'42501'});
    await expect(maintenance.query('SELECT result_json FROM api_ai_provider_results')).rejects.toMatchObject({code:'42501'});
    const pruner=new PostgresProviderResults(adapter(maintenance));
    expect(await pruner.pruneExpired(1)).toBe(1);
    const jobs=[first.value.jobId,second.value.jobId];
    expect((await admin.query(`SELECT count(*)::int AS n FROM api_ai_provider_results
      WHERE job_id=ANY($1::uuid[]) AND result_json IS NULL AND erased_at IS NOT NULL`,[jobs])).rows[0]?.n).toBe(1);
    expect(await pruner.pruneExpired(1)).toBe(1);expect(await pruner.pruneExpired(1)).toBe(0);
    expect(await restarted.get(active.owner,active.value.sessionIdHash,active.value.jobId)).toEqual(active.value);
    for(const f of [first,second]){
      await expect(f.store.put(f.value)).rejects.toThrow('Provider result unavailable');
      expect((await admin.query('SELECT request_sha256 FROM api_ai_provider_results WHERE job_id=$1',[f.value.jobId])).rows[0]?.request_sha256).toBe(billingHash);
    }
  });
});
