import {
  AiTaskSchema,DemoProfileOptionSchema,DemoProfilesResponseSchema,
  DemoSnapshotSchema,SafeLlmPacketSchema,SharingGrantSchema,
  SubjectAliasSchema,
} from '@hufs-one/contracts';
import type {
  ApiRepository,
} from './types.js';
import type {
  AiTask,DemoProfileOption,DemoSnapshot,SafeLlmPacket,SharingGrant,SubjectAlias,
} from '@hufs-one/contracts';
import type {ReviewerSqlConnection,ReviewerSqlPool} from './modules/auth/reviewer-postgres.js';
import {SnapshotMetadataSchema} from './snapshot-visibility.js';

const RAW_JSON_LIMIT=64*1024;
const OPAQUE_ACTOR=/^[A-Za-z0-9_.:@-]{1,200}$/;
const OPAQUE_REFERENCE=/^[A-Za-z0-9_-]{1,100}$/;
const PURPOSE_CONSENT_REFERENCE=/^[A-Za-z0-9_.:@-]{1,128}$/;
const SHARED_SECTIONS=new Set([
  'FEED','NOTICES','EXPERIENCE','ACADEMICS','FORECAST',
]);
function validateActor(actorId:string):void{
  if(!OPAQUE_ACTOR.test(actorId))throw new Error('Invalid verified actor key');
}
function parseTime(value:unknown):string{
  if(value instanceof Date&&!Number.isNaN(value.getTime()))
    return value.toISOString();
  if(typeof value==='string'&&Number.isFinite(Date.parse(value)))
    return new Date(value).toISOString();
  throw new Error('Invalid database datetime');
}
function parsedJson(value:unknown):unknown{
  const text=JSON.stringify(value);
  if(!text||Buffer.byteLength(text,'utf8')>RAW_JSON_LIMIT)
    throw new Error('Oversized projection payload');
  return value;
}
export interface PurposeConsentVerifier {
  isActive(input:{
    actorId:string;subjectId:SubjectAlias;
    purpose:'DISPLAY_NAME'|'RECORDING';consentRef:string;now:string;
  }):Promise<boolean>;
}
const SHARED_SECTIONS_ARRAY=[...SHARED_SECTIONS];
// A global precomputed feed/notice projection can contain academic eligibility,
// approved experience and preferences even when its top-level academics field
// is redacted. Until a *verified scope-specific recomputation* is persisted,
// never serve that snapshot to a partially shared grant (Issue #39 / PR #49).
const PRECOMPUTED_DERIVED_INPUTS=['FEED','NOTICES','ACADEMICS','EXPERIENCE'] as const;

async function queryOnce(
  pool:ReviewerSqlPool,sql:string,params:readonly unknown[],
):Promise<ReadonlyArray<Record<string,unknown>>>{
  const client:ReviewerSqlConnection=await pool.connect();
  try{
    const results=await client.query(sql,params);
    if(!Array.isArray(results.rows))throw new Error('Malformed database response');
    return results.rows;
  }finally{client.release();}
}
/**
 * Stores only JSON projections and server-curated synthetic packets, NOT CSV,
 * Google Forms, source originals or a public-facing reviewer snapshot.
 * Browser identity must be established independently by OIDC; no HTTP handler
 * may supply actorId or grant scopes to this adapter.
 */
export class PostgresApiProjectionRepository implements ApiRepository {
  constructor(
    private readonly pool:ReviewerSqlPool,
    private readonly now:()=>string=()=>new Date().toISOString(),
    private readonly consentVerifier?:PurposeConsentVerifier,
  ){}
  async listProfiles():Promise<DemoProfileOption[]>{
    const rows=await queryOnce(this.pool,`
      SELECT subject_id,profile_json FROM api_demo_profile_projections
      WHERE current=true ORDER BY subject_id ASC LIMIT 6`,[]);
    const profiles=rows.map(row=>{
      const profile=DemoProfileOptionSchema.parse(parsedJson(row.profile_json));
      if(profile.demoSubjectId!==row.subject_id)
        throw new Error('Profile projection subject mismatch');
      return profile;
    });
    // A missing or extra slot means this source is not ready for any user.
    return DemoProfilesResponseSchema.parse({profiles}).profiles;
  }

  async readGrant(actorId:string,subject:SubjectAlias):Promise<SharingGrant|null>{
    validateActor(actorId);
    const id=SubjectAliasSchema.parse(subject),now=parseTime(this.now());
    const rows=await queryOnce(this.pool,`
      SELECT grant_id,actor_id,subject_id,allowed_sections,display_name_allowed,
        recording_allowed,display_name_consent_ref,recording_consent_ref,
        version,expires_at,revoked_at
      FROM api_sharing_grants
      WHERE actor_id=$1 AND subject_id=$2 AND revoked_at IS NULL
        AND expires_at>$3::timestamptz LIMIT 2`,
    [actorId,id,now]);
    if(!rows.length)return null;
    if(rows.length!==1)throw new Error('Ambiguous grant');
    const row=rows[0]!;
    if(!Array.isArray(row.allowed_sections)
      ||row.allowed_sections.some(section=>!SHARED_SECTIONS.has(section as string)))
      throw new Error('Unknown sharing section');
    const result=SharingGrantSchema.parse({
      grantId:row.grant_id,actorId:row.actor_id,
      demoSubjectId:row.subject_id,allowedSections:row.allowed_sections,
      displayNameAllowed:row.display_name_allowed,
      recordingAllowed:row.recording_allowed,
      version:row.version,
      expiresAt:parseTime(row.expires_at),
      ...(row.revoked_at?{revokedAt:parseTime(row.revoked_at)}:{}),
    });
    if(result.actorId!==actorId||result.demoSubjectId!==id
      ||Date.parse(result.expiresAt)<=Date.parse(now)||result.revokedAt)
      throw new Error('Stale or cross-account grant');
    // Sharing a section is NOT evidence of consent for a display name or a recording.
    // On missing/expired/revoked consent or a ledger outage, hide that purpose only.
    const purpose=async(enabled:boolean,ref:unknown,
      name:'DISPLAY_NAME'|'RECORDING'):Promise<boolean>=>{
      if(!enabled||typeof ref!=='string'||!PURPOSE_CONSENT_REFERENCE.test(ref)
        ||!this.consentVerifier)return false;
      try{
        return await this.consentVerifier.isActive({
          actorId,subjectId:id,purpose:name,consentRef:ref,now,
        })===true;
      }catch{return false;}
    };
    return {
      ...result,
      displayNameAllowed:await purpose(
        result.displayNameAllowed,row.display_name_consent_ref,'DISPLAY_NAME'),
      recordingAllowed:await purpose(
        result.recordingAllowed,row.recording_consent_ref,'RECORDING'),
    };
  }

  private checkSnapshot(
    rows:ReadonlyArray<Record<string,unknown>>,id:SubjectAlias,
  ):DemoSnapshot|null{
    if(!rows.length)return null;
    if(rows.length!==1)throw new Error('Ambiguous projection');
    const snap=DemoSnapshotSchema.parse(parsedJson(rows[0]?.snapshot_json));
    if(rows[0]?.subject_id!==id
      ||snap.demoSubjectId!==id||Date.parse(snap.asOf)>Date.parse(this.now())
      ||snap.feed.asOf!==snap.asOf||snap.notices.asOf!==snap.asOf)
      throw new Error('Cross-subject or future/contradictory snapshot');
    return snap;
  }
  async readSnapshot(subject:SubjectAlias):Promise<DemoSnapshot|null>{
    const id=SubjectAliasSchema.parse(subject);
    const rows=await queryOnce(this.pool,`
      SELECT subject_id,snapshot_json FROM api_demo_snapshot_projections
      WHERE subject_id=$1 AND current=true LIMIT 2`,[id]);
    return this.checkSnapshot(rows,id);
  }

  /** Metadata for ScopedApiRepository after its current-grant check. Keep the
   * legacy full readSnapshot strict; unused summaries do not cross this query. */
  async readSnapshotMetadata(subject:SubjectAlias){
    const id=SubjectAliasSchema.parse(subject);
    const rows=await queryOnce(this.pool,`
      SELECT subject_id,jsonb_build_object(
        'demoSubjectId',snapshot_json->'demoSubjectId',
        'datasetMode',snapshot_json->'datasetMode',
        'asOf',snapshot_json->'asOf',
        'versions',snapshot_json->'versions') AS snapshot_metadata
      FROM api_demo_snapshot_projections
      WHERE subject_id=$1 AND current=true LIMIT 2`,[id]);
    if(!rows.length)return null;
    if(rows.length!==1)throw new Error('Ambiguous projection');
    const metadata=SnapshotMetadataSchema.parse(parsedJson(rows[0]?.snapshot_metadata));
    if(rows[0]?.subject_id!==id||metadata.demoSubjectId!==id
      ||Date.parse(metadata.asOf)>Date.parse(this.now()))
      throw new Error('Cross-subject or future snapshot metadata');
    return metadata;
  }

  /**
   * Atomic authorized projection read. The stored snapshot is unscoped and
   * its derived feed/notices may reveal private academic or experience inputs.
   * Until the writer stores a verified grant-scoped recomputation, deny partial
   * grants rather than leaking through ranking scores or notice priorities.
   * Lock the live grant row within this SELECT; reject revocation/expiry/version.
   */
  async readAuthorizedSnapshot(input:{
    actorId:string;subjectId:SubjectAlias;grantVersion:string;
    requiredSections?:string[];
  }):Promise<DemoSnapshot|null>{
    validateActor(input.actorId);
    const id=SubjectAliasSchema.parse(input.subjectId);
    if(!/^[A-Za-z0-9_.:-]{1,100}$/.test(input.grantVersion))
      throw new Error('Invalid grant version');
    const required=input.requiredSections??['FEED','NOTICES'];
    if(!required.length||new Set(required).size!==required.length
      ||required.some(v=>!SHARED_SECTIONS_ARRAY.includes(v)))
      throw new Error('Invalid section request');
    // A DemoSnapshot always contains feed+notices. Requiring only the requested
    // visible section is insufficient because the stored result is precomputed
    // using four inputs; SQL must lock and authorize every such source section.
    const sourceSections=[...new Set([...required,...PRECOMPUTED_DERIVED_INPUTS])];
    const rows=await queryOnce(this.pool,`
      SELECT p.subject_id,p.snapshot_json,g.actor_id,g.version,g.allowed_sections
      FROM api_demo_snapshot_projections p
      JOIN api_sharing_grants g ON g.subject_id=p.subject_id
      WHERE g.actor_id=$1 AND p.subject_id=$2 AND g.version=$3
        AND g.revoked_at IS NULL AND g.expires_at>clock_timestamp()
        AND g.allowed_sections @> $4::text[] AND p.current=true
        AND public.api_lock_authorized_personal_grant(
          $1::text,$2::char(3),$3::text,$4::text[])
      LIMIT 2`,[
      input.actorId,id,input.grantVersion,sourceSections,
    ]);
    const snap=this.checkSnapshot(rows,id);
    if(!snap)return null;
    const row=rows[0]!;
    if(row.actor_id!==input.actorId||row.version!==input.grantVersion
      ||!Array.isArray(row.allowed_sections)
      ||sourceSections.some(v=>!(row.allowed_sections as unknown[]).includes(v))
      ||(row.allowed_sections as unknown[]).some(v=>!SHARED_SECTIONS.has(v as string)))
      throw new Error('Stale or cross-account projection');
    const sections=new Set(row.allowed_sections as string[]);
    return DemoSnapshotSchema.parse({
      ...snap,
      academics:sections.has('ACADEMICS')?snap.academics:{state:'NOT_SHARED'},
      forecast:sections.has('FORECAST')?snap.forecast:{state:'NOT_SHARED'},
    });
  }

  async readSafePacket(actorId:string,task:AiTask,ref:string):Promise<SafeLlmPacket|null>{
    validateActor(actorId);
    const t=AiTaskSchema.parse(task);
    if(!OPAQUE_REFERENCE.test(ref))throw new Error('Invalid packet reference');
    const rows=await queryOnce(this.pool,`
      SELECT actor_id,task,packet_ref,packet_json
      FROM api_approved_safe_packets
      WHERE actor_id=$1 AND task=$2 AND packet_ref=$3
        AND approval_state='APPROVED'
        AND input_class='SYNTHETIC_CLEARED'
        AND revoked_at IS NULL AND expires_at>$4::timestamptz
      LIMIT 2`,[actorId,t,ref,parseTime(this.now())]);
    if(!rows.length)return null;
    if(rows.length!==1)throw new Error('Ambiguous safe packet');
    const row=rows[0]!;
    const packet=SafeLlmPacketSchema.parse(parsedJson(row.packet_json));
    if(row.actor_id!==actorId||row.task!==t||row.packet_ref!==ref
      ||packet.task!==t||packet.providerInputClass!=='SYNTHETIC_CLEARED'
      ||packet.packetId!==ref)
      throw new Error('Untrusted or mismatched packet');
    return packet;
  }
}
