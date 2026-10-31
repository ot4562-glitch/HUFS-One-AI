import {createHash} from 'node:crypto';
import {z} from 'zod';
import {canReadSharedSection,DatasetModeSchema,DemoContextSchema,DemoSnapshotSchema,EligibilityConditionSchema,
  ISODateTimeSchema,OpportunitySchema,SharedSectionSchema,SharingGrantSchema,TopicCodeSchema} from '@hufs-one/contracts';
import {scopeInputsToGrant} from '../../../../packages/core/src/opportunities/scope.js';
import type {RevisionRecord} from '../../../../packages/core/src/normalization/revisions.js';
import type {ReviewerSqlConnection,ReviewerSqlPool} from './auth/reviewer-postgres.js';
import type {CalendarAuthorizationReceipt,CalendarInputBundle,CalendarInputSource,CalendarReadRequest} from './calendar.js';
import type {DemoSnapshot} from '@hufs-one/contracts';

const Ref=z.string().min(1).max(200).regex(/^[A-Za-z0-9_.:@-]+$/);
const Label=z.string().min(1).max(500);
const Refs=z.array(Ref).max(400);
const ScopeField=z.enum(['campus','college','majors','cohort','enrollmentState','admissionType']);
const ConditionField=EligibilityConditionSchema.shape.field;
const Fact=z.union([z.string().max(500),z.number().finite(),z.boolean(),z.array(z.string().max(500)).max(100)]);
const Major=z.strictObject({major:Label,role:z.enum(['PRIMARY','DOUBLE','MINOR'])});
const NormalizedInputs=z.strictObject({
  profile:z.strictObject({interestTopics:z.array(TopicCodeSchema).max(24),desiredJobTopics:z.array(TopicCodeSchema).max(24),
    approvedExperienceTopics:z.array(TopicCodeSchema).max(24),approvedLanguageCodes:z.array(Label).max(24),
    officialMajorTopics:z.array(TopicCodeSchema).max(24),facts:z.partialRecord(ConditionField,Fact)}),
  noticeStudent:z.strictObject({campus:Label.optional(),college:Label.optional(),majors:z.array(Major).max(16).optional(),
    cohort:z.number().int().min(1900).max(2200).optional(),enrollmentState:Label.optional(),admissionType:Label.optional(),
    targetGraduationTerm:z.string().regex(/^\d{4}-[12]$/).optional(),graduationTermVerified:z.boolean().optional(),
    openRequirementIds:Refs.nullable(),courseIds:Refs,interestTopics:z.array(TopicCodeSchema).max(24)}),
  provenance:z.strictObject({noticeScope:z.partialRecord(ScopeField,SharedSectionSchema).optional(),
    facts:z.partialRecord(ConditionField,SharedSectionSchema).optional()}),
  opportunities:z.array(OpportunitySchema).max(200),
  notices:z.array(z.strictObject({id:Ref,sourceSnapshotId:Ref,title:Label,issuer:Label,
    category:z.enum(['ACADEMIC','SCHOLARSHIP','EXCHANGE','CAREER','GENERAL']),campus:Label.optional(),college:Label.optional(),
    majors:z.array(Label).max(32).optional(),majorRoles:z.array(z.enum(['PRIMARY','DOUBLE','MINOR'])).max(3).optional(),
    cohortRange:z.strictObject({min:z.number().int().optional(),max:z.number().int().optional()}).optional(),
    enrollmentStates:z.array(Label).max(32).optional(),admissionTypes:z.array(Label).max(32).optional(),
    graduationTermScope:Refs.optional(),requirementRefs:Refs.optional(),courseRefs:Refs.optional(),
    topicCodes:z.array(TopicCodeSchema).max(24).optional(),scholarshipConditions:z.array(Label).max(32).optional(),
    studentDeadline:ISODateTimeSchema.optional(),adminReportDeadline:ISODateTimeSchema.optional(),
    publishedAt:ISODateTimeSchema.optional(),validUntil:ISODateTimeSchema.optional(),
    eventSessions:z.array(z.strictObject({start:ISODateTimeSchema,end:ISODateTimeSchema.optional()})).max(40).optional(),
    verificationState:z.enum(['CANDIDATE','VERIFIED','NEEDS_REVIEW','REJECTED']),evidenceRefs:Refs,
  })).max(200),savedOpportunityIds:Refs.optional(),
});
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const iso=(value:unknown)=>ISODateTimeSchema.parse(value instanceof Date?value.toISOString():value);
const active=(row:Record<string,unknown>,at:string)=>row.revoked_at==null
  &&row.approval_state==='APPROVED'&&typeof row.approved_by==='string'&&row.approved_by.length>0
  &&row.approved_by!==row.actor_id
  &&Date.parse(iso(row.approved_at))<=Date.parse(at)&&Date.parse(iso(row.expires_at))>Date.parse(at);
function revision(row:Record<string,unknown>):RevisionRecord {
  return {revisionId:Ref.parse(row.revision_id),sourceId:Ref.parse(row.source_id),
    ...(row.supersedes==null?{}:{supersedes:Ref.parse(row.supersedes)}),
    status:z.enum(['ACTIVE','NEEDS_REVIEW','STALE','RETRACTED','BLOCKED_RIGHTS']).parse(row.status),
    changeKind:z.enum(['NEW','CORRECTED','EXTENDED','CANCELLED','UNKNOWN']).parse(row.change_kind),
    provenance:z.enum(['SYNTHETIC','REAL_APPROVED','RESEARCH_ONLY']).parse(row.provenance),
    permissionRef:Ref.parse(row.permission_ref),fetchedAt:iso(row.fetched_at),
    ...(row.published_at==null?{}:{publishedAt:iso(row.published_at)}),
    ...(row.last_verified_at==null?{}:{lastVerifiedAt:iso(row.last_verified_at)}),
    ...(row.valid_from==null?{}:{validFrom:iso(row.valid_from)}),
    ...(row.valid_until==null?{}:{validUntil:iso(row.valid_until)})};
}

/**
 * Reads only independently approved normalized inputs. No CSV/Forms importer, credentials, cloud
 * provisioning or HTTP writer is supplied. Requires reviewed #34/#35 migrations plus calendar DDL.
 * REVIEWER must use its separate synthetic adapter: this production reader always refuses it.
 */
export class PostgresCalendarInputSource implements CalendarInputSource {
  constructor(private readonly pool:ReviewerSqlPool){}

  async readAuthorizedInputs(input:CalendarReadRequest):Promise<(CalendarInputBundle&{approvedSnapshot:DemoSnapshot})|null>{
    if(input.reviewerInviteId!==undefined)return null;
    const context=DemoContextSchema.parse(input.context),actor=Ref.parse(input.actorId),now=iso(input.now);
    if(context.actorId!==actor||Date.parse(context.expiresAt)<=Date.parse(now))return null;
    const client=await this.pool.connect();
    let transaction=false;
    try{
      await client.query('BEGIN');transaction=true;
      await client.query("SET LOCAL statement_timeout = '5s'");
      await client.query("SET LOCAL lock_timeout = '3s'");
      // PostgreSQL row-locking SELECTs require UPDATE privilege. Keep that privilege with the
      // NOLOGIN owner of a narrowly scoped definer helper, never with this API connection.
      const lock=await this.rows(client,`SELECT public.api_lock_authorized_calendar_inputs(
        $1::text,$2::char(3),$3::text,$4::text,$5::text,$6::timestamptz) AS authorized`,
      [actor,context.demoSubjectId,context.sharingGrantVersion,context.datasetVersion,context.projectionVersion,now]);
      if(lock.length!==1||lock[0]!.authorized!==true)return null;
      const grantRows=await this.rows(client,`SELECT grant_id,actor_id,subject_id,version,allowed_sections,
        expires_at,revoked_at,approved_at,consent_ref FROM api_sharing_grants
        WHERE actor_id=$1 AND subject_id=$2 AND version=$3 AND revoked_at IS NULL
          AND approved_at<=LEAST($4::timestamptz,clock_timestamp())
          AND expires_at>GREATEST($4::timestamptz,clock_timestamp()) LIMIT 2`,
      [actor,context.demoSubjectId,context.sharingGrantVersion,now]);
      if(grantRows.length!==1)return null;
      const g=grantRows[0]!;
      const grant=SharingGrantSchema.parse({grantId:g.grant_id,actorId:g.actor_id,demoSubjectId:g.subject_id,
        version:g.version,allowedSections:g.allowed_sections,displayNameAllowed:false,recordingAllowed:false,
        expiresAt:iso(g.expires_at),...(g.revoked_at==null?{}:{revokedAt:iso(g.revoked_at)})});
      if(grant.version!==context.sharingGrantVersion||Date.parse(iso(g.approved_at))>Date.parse(now)
        ||!['FEED','NOTICES'].every(section=>canReadSharedSection(grant,{actorId:actor,demoSubjectId:context.demoSubjectId,
          section:section as 'FEED'|'NOTICES',asOf:now})))return null;
      const projections=await this.rows(client,`SELECT actor_id,subject_id,dataset_version,projection_version,
        as_of,dataset_mode,input_json,source_ids,approval_state,approved_by,approved_at,consent_ref,expires_at,revoked_at
        FROM api_calendar_input_projections WHERE actor_id=$1 AND subject_id=$2
          AND dataset_version=$3 AND projection_version=$4 AND current=true
          AND approval_state='APPROVED' AND revoked_at IS NULL
          AND approved_at<=LEAST(as_of,$5::timestamptz,clock_timestamp())
          AND expires_at>GREATEST($5::timestamptz,clock_timestamp()) LIMIT 2`,
      [actor,context.demoSubjectId,context.datasetVersion,context.projectionVersion,now]);
      if(projections.length!==1)return null;
      const p=projections[0]!;
      const asOf=iso(p.as_of);
      if(p.actor_id!==actor||p.subject_id!==context.demoSubjectId||p.dataset_version!==context.datasetVersion
        ||p.projection_version!==context.projectionVersion||p.consent_ref!==g.consent_ref
        ||!active(p,now)||Date.parse(asOf)>Date.parse(now)||Date.parse(iso(p.approved_at))>Date.parse(asOf))return null;
      // Academic/forecast summaries may only come from the current approved snapshot locked by
      // the same helper and included in this receipt. Never relabel an older summary to a new asOf.
      const snapshots=await this.rows(client,`SELECT subject_id,dataset_version,projection_version,snapshot_json,
        approved_at,approved_by,current FROM api_demo_snapshot_projections
        WHERE subject_id=$1 AND dataset_version=$2 AND projection_version=$3 AND current=true
          AND approved_at<=$4::timestamptz LIMIT 2`,
      [context.demoSubjectId,context.datasetVersion,context.projectionVersion,asOf]);
      if(snapshots.length!==1)return null;
      const s=snapshots[0]!;
      if(s.subject_id!==context.demoSubjectId||s.dataset_version!==context.datasetVersion
        ||s.projection_version!==context.projectionVersion||s.current!==true
        ||typeof s.approved_by!=='string'||!s.approved_by.length||s.approved_by===actor
        ||Date.parse(iso(s.approved_at))>Date.parse(asOf))return null;
      if(Buffer.byteLength(JSON.stringify(s.snapshot_json),'utf8')>65536)throw Error('Oversized approved snapshot');
      const approvedSnapshot=DemoSnapshotSchema.parse(s.snapshot_json);
      if(approvedSnapshot.demoSubjectId!==context.demoSubjectId||approvedSnapshot.versions.dataset!==context.datasetVersion
        ||approvedSnapshot.versions.projection!==context.projectionVersion||approvedSnapshot.datasetMode!==p.dataset_mode
        ||[approvedSnapshot.asOf,approvedSnapshot.feed.asOf,approvedSnapshot.notices.asOf]
          .some(value=>Date.parse(value)!==Date.parse(asOf)))return null;
      const text=JSON.stringify(p.input_json);
      if(!text||Buffer.byteLength(text,'utf8')>262144)throw Error('Oversized normalized projection');
      // PostgreSQL JSON cannot contain undefined. Serializing after validation removes optional
      // undefined values from injected/fake adapters too and preserves exact optional TS contracts.
      const normalized=JSON.parse(JSON.stringify(NormalizedInputs.parse(p.input_json))) as
        Pick<CalendarInputBundle,'profile'|'noticeStudent'|'provenance'|'opportunities'|'notices'|'savedOpportunityIds'>;
      const sourceIds=z.array(Ref).max(100).parse(p.source_ids);
      if(new Set(sourceIds).size!==sourceIds.length)return null;
      // Writers in #34 lock these same HEAD rows before inserting a successor revision. Do not
      // filter status/permission here: a blocked/cancelled head must shadow old active evidence.
      const heads=await this.rows(client,`SELECT source_id,revision_id,last_checked_at FROM source_ingest_heads
        WHERE source_id=ANY($1::text[]) ORDER BY source_id LIMIT 101`,[sourceIds]);
      if(heads.length!==sourceIds.length||heads.some(h=>!sourceIds.includes(String(h.source_id))))return null;
      const rawRevisions=await this.rows(client,`SELECT revision_id,source_id,supersedes,status,change_kind,provenance,
        permission_ref,published_at,fetched_at,last_verified_at,valid_from,valid_until FROM source_revisions_vnext
        WHERE source_id=ANY($1::text[]) ORDER BY source_id,fetched_at,revision_id LIMIT 1001`,[sourceIds]);
      if(rawRevisions.length>1000)throw Error('Revision history needs a narrower approved projection');
      const revisions=rawRevisions.map(revision);
      if(revisions.some(r=>!sourceIds.includes(r.sourceId))
        ||heads.some(h=>!revisions.some(r=>r.sourceId===h.source_id&&r.revisionId===h.revision_id)))return null;
      const rights=await this.rows(client,`SELECT actor_id,subject_id,source_id,permission_ref,policy_version,
        approval_state,approved_by,approved_at,expires_at,revoked_at,
        (approval_state='APPROVED' AND revoked_at IS NULL
          AND approved_at<=LEAST($3::timestamptz,clock_timestamp())
          AND expires_at>GREATEST($3::timestamptz,clock_timestamp())) AS active
        FROM api_calendar_source_permissions WHERE actor_id=$1 AND subject_id=$2
          AND source_id=ANY($4::text[]) ORDER BY source_id,permission_ref LIMIT 1001`,
      [actor,context.demoSubjectId,now,sourceIds]);
      if(rights.length>1000)throw Error('Source authorization scope too broad');
      const conflicts=await this.rows(client,`SELECT DISTINCT ON (left_revision_id,right_revision_id)
        left_revision_id,right_revision_id,disposition,reviewed_at,reviewer_id FROM source_conflict_decisions_vnext
        WHERE (left_revision_id=ANY($1::text[]) OR right_revision_id=ANY($1::text[]))
          AND reviewed_at<=$2::timestamptz
        ORDER BY left_revision_id,right_revision_id,reviewed_at DESC,decision_id DESC LIMIT 1001`,
      [revisions.map(r=>r.revisionId),now]);
      if(conflicts.length>1000)throw Error('Conflict history scope too broad');
      const blocked=new Set(conflicts.filter(c=>c.disposition==='CONFLICT').flatMap(c=>[c.left_revision_id,c.right_revision_id]));
      // Calendar is a current authenticated view, not a historical replay endpoint. A new draft,
      // cancellation or rights denial must shadow the frozen projection's older active revision,
      // even when fetched after projection.asOf. The core then quarantines a current head newer
      // than asOf rather than reusing an old deadline while the approved projection is refreshed.
      const currentHeads=new Set(heads.map(h=>h.revision_id));
      const authorizedRevisionIds=revisions.filter(r=>currentHeads.has(r.revisionId)&&Date.parse(r.fetchedAt)<=Date.parse(now)
        &&r.changeKind!=='UNKNOWN'&&!blocked.has(r.revisionId)&&rights.some(right=>right.actor_id===actor
        &&right.subject_id===context.demoSubjectId&&right.source_id===r.sourceId&&right.permission_ref===r.permissionRef
        &&right.active===true&&active(right,now))).map(r=>r.revisionId);
      const scopeKey=scopeInputsToGrant(normalized.profile,normalized.noticeStudent,grant.allowedSections,normalized.provenance).scopeKey;
      const sourceVersion=hash([heads,rawRevisions,rights,conflicts]);
      const authorizationToken=hash([context,grant,g.consent_ref,p,s,sourceVersion,scopeKey]);
      await client.query('COMMIT');transaction=false;
      return {actorId:actor,context,grant,asOf,datasetMode:DatasetModeSchema.parse(p.dataset_mode),
        ...normalized,revisions,authorizedRevisionIds,scopeKey,sourceVersion,authorizationToken,approvedSnapshot};
    }catch{
      throw new Error('Calendar input source unavailable');
    }finally{
      if(transaction)try{await client.query('ROLLBACK');}catch{/* original failure remains private */}
      client.release();
    }
  }

  async revalidateAuthorization(input:CalendarReadRequest,receipt:CalendarAuthorizationReceipt,now:string):Promise<boolean>{
    try{
      const current=await this.readAuthorizedInputs({...input,now});
      return current!==null&&current.authorizationToken===receipt.authorizationToken
        &&current.sourceVersion===receipt.sourceVersion&&current.scopeKey===receipt.scopeKey&&current.asOf===receipt.asOf;
    }catch{return false;}
  }

  private async rows(client:ReviewerSqlConnection,sql:string,params:readonly unknown[]):Promise<Record<string,unknown>[]>{
    const result=await client.query(sql,params);
    if(!Array.isArray(result.rows))throw Error('Malformed database response');
    return result.rows;
  }
}
