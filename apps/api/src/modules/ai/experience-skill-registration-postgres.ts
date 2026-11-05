import {randomBytes,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {OwnerWorkspaceRecordSchema,SelfConsentSchema,SafeLlmPacketSchema} from '@hufs-one/contracts';
import type {ReviewerSqlPool,ReviewerSqlConnection} from '../auth/reviewer-postgres.js';
import {buildExperienceSkillPacket} from './experience-skill-packet.js';
import {canonicalProjectionHash} from '../opportunities/owner-catalog-postgres.js';

const Actor=z.string().regex(/^[A-Za-z0-9_.:@-]{1,128}$/);
const Ref=z.string().regex(/^[A-Za-z0-9_.:@-]{1,128}$/);
const Id=z.string().regex(/^[A-Za-z0-9_-]{1,90}$/);
const Sha=z.string().regex(/^[a-f0-9]{64}$/);
const Time=z.iso.datetime({offset:true});
const DbTime=z.preprocess(v=>v instanceof Date?v.toISOString():v,Time);
const Version=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const Source=z.strictObject({sourceId:Ref,revisionId:Ref,permissionRef:Ref,originalSha256:Sha});
const Request=z.strictObject({
  actorId:Actor,experienceId:Id,contentVersion:Version,consentVersion:Version,
  approvedBy:Ref,approvedAt:Time,privacyReviewRef:Ref,
  policyVersion:Ref,source:Source,expiresAt:Time,
});
export type ExperienceInputRegistration=z.infer<typeof Request>;
export interface IndependentExperienceInputReview {
  /** Must consult the independently authenticated review registry. Never infer
   * its answer from a student request, project-wide approval or parsed packet. */
  verify(input:ExperienceInputRegistration&{now:string;packetSha256:string}):Promise<boolean>;
}
export interface RegisteredExperienceInput {
  experienceId:string;inputRef:string;asOf:string;expiresAt:string;
  contentVersion:number;consentVersion:number;
}
export class ExperienceInputRegistrationDenied extends Error{
  constructor(){super('Approved experience input unavailable');}
}
const Consent=z.object({version:z.coerce.number().int().positive(),choices_json:z.unknown(),
  updated_at:DbTime});
const Workspace=z.object({item_id:Id,version:z.coerce.number().int().positive(),
  value_json:z.unknown(),updated_at:DbTime,deleted_at:DbTime.nullable()});
const Evidence=z.object({
  source_id:Ref,revision_id:Ref,permission_ref:Ref,original_sha256:Sha,
  stored_original_sha256:Sha,review_original_sha256:Sha,review_content_sha256:Sha,
  content_sha256:Sha,source_class:z.literal('PERSONAL_CONSENTED'),
  provenance:z.literal('REAL_APPROVED'),status:z.literal('ACTIVE'),
  change_kind:z.enum(['NEW','CORRECTED','EXTENDED']),fetched_at:DbTime,last_verified_at:DbTime,
  valid_from:DbTime.nullable(),valid_until:DbTime.nullable(),
  review_decision:z.literal('APPROVED'),reviewer_id:Ref,review_checked_at:DbTime,
  receipt_id:Ref,rights_actor_id:Actor,rights_permission_ref:Ref,
  rights_reviewed_by:Ref,rights_reviewed_at:DbTime,rights_starts_at:DbTime,
  rights_expires_at:DbTime,rights_purposes:z.array(z.string()),
  rights_revoked_at:DbTime.nullable(),
});
const iso=(value:string)=>Date.parse(Time.parse(value));

/** NOT an HTTP route. An independently authenticated operator injects the
 * reviewer proof and one dedicated non-BYPASSRLS writer role. This is the
 * only application writer for immutable owner provider projections.
 * The server generates packet and input refs from current SQL owner content;
 * callers never provide model text, a source body or a self-approved packet.
 */
export class PostgresExperienceSkillInputRegistrar {
  constructor(private readonly pool:ReviewerSqlPool,
    private readonly reviewer:IndependentExperienceInputReview,
    private readonly policyVersion:string,
    private readonly now:()=>string=()=>new Date().toISOString()){
    Ref.parse(policyVersion);
    if(typeof reviewer?.verify!=='function')throw new ExperienceInputRegistrationDenied();
  }
  private async evidence(c:ReviewerSqlConnection,input:ExperienceInputRegistration,asOf:string){
    const source=input.source;
    const result=await c.query(`SELECT s.source_id,s.revision_id,s.permission_ref,s.original_sha256,
      o.original_sha256 AS stored_original_sha256,
      a.original_sha256 AS review_original_sha256,a.content_sha256 AS review_content_sha256,
      s.content_sha256,s.source_class,s.provenance,s.status,s.change_kind,
      s.fetched_at,s.last_verified_at,s.valid_from,s.valid_until,
      a.decision AS review_decision,a.reviewer_id,a.checked_at AS review_checked_at,
      g.receipt_id,g.actor_id AS rights_actor_id,g.permission_ref AS rights_permission_ref,
      g.reviewed_by AS rights_reviewed_by,g.reviewed_at AS rights_reviewed_at,
      g.starts_at AS rights_starts_at,g.expires_at AS rights_expires_at,
      g.purposes AS rights_purposes,v.revoked_at AS rights_revoked_at
      FROM source_ingest_heads h
      JOIN source_effective_revisions_vnext s
        ON s.source_id=h.source_id AND s.revision_id=h.revision_id
      JOIN source_originals_vnext o ON o.revision_id=s.revision_id
      JOIN source_review_attestations_vnext a ON a.revision_id=s.revision_id
      JOIN LATERAL(SELECT * FROM source_rights_receipts r
        WHERE r.actor_id=$2 AND r.source_id=h.source_id AND r.permission_ref=$3
        ORDER BY r.reviewed_at DESC,r.receipt_id DESC LIMIT 1) g ON true
      LEFT JOIN source_rights_revocations v ON v.receipt_id=g.receipt_id
      WHERE h.source_id=$1 LIMIT 2`,[source.sourceId,input.actorId,source.permissionRef]);
    if(result.rows.length!==1)throw new ExperienceInputRegistrationDenied();
    const row=Evidence.parse(result.rows[0]);
    const at=iso(asOf),approved=iso(input.approvedAt);
    if(row.source_id!==source.sourceId||row.revision_id!==source.revisionId
      ||row.permission_ref!==source.permissionRef
      ||row.original_sha256!==source.originalSha256
      ||row.stored_original_sha256!==source.originalSha256
      ||row.review_original_sha256!==source.originalSha256
      ||row.review_content_sha256!==row.content_sha256
      ||row.reviewer_id===input.actorId||row.rights_reviewed_by===input.actorId
      ||row.rights_actor_id!==input.actorId||row.rights_permission_ref!==source.permissionRef
      ||row.rights_revoked_at!==null
      ||!row.rights_purposes.includes('STORE')||!row.rights_purposes.includes('EXTERNAL_TRANSFER')
      ||new Set(row.rights_purposes).size!==row.rights_purposes.length
      ||iso(row.review_checked_at)>approved||iso(row.fetched_at)>at
      ||iso(row.last_verified_at)>at||iso(row.last_verified_at)<iso(row.fetched_at)
      ||iso(row.rights_reviewed_at)>iso(row.rights_starts_at)
      ||iso(row.rights_starts_at)>at||iso(row.rights_expires_at)<=at
      ||row.valid_from!==null&&iso(row.valid_from)>at
      ||row.valid_until!==null&&iso(row.valid_until)<=at)
      throw new ExperienceInputRegistrationDenied();
    return Math.min(iso(row.rights_expires_at),
      row.valid_until===null?Number.MAX_SAFE_INTEGER:iso(row.valid_until));
  }
  async register(raw:ExperienceInputRegistration):Promise<RegisteredExperienceInput>{
    const input=Request.parse(raw),asOf=Time.parse(this.now());
    if(input.policyVersion!==this.policyVersion||input.approvedBy===input.actorId
      ||iso(input.approvedAt)>iso(asOf)||iso(input.expiresAt)<=iso(asOf))
      throw new ExperienceInputRegistrationDenied();
    const c=await this.pool.connect();let begun=false;
    try{
      await c.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');begun=true;
      await c.query("SET LOCAL statement_timeout='5s'");
      await c.query("SELECT set_config('hufs.self_actor',$1,true)",[input.actorId]);
      const consentRow=await c.query('SELECT version,choices_json,updated_at FROM api_self_consents WHERE actor_id=$1',
        [input.actorId]);
      if(consentRow.rows.length!==1)throw new ExperienceInputRegistrationDenied();
      const cRow=Consent.parse(consentRow.rows[0]);
      const consent=SelfConsentSchema.parse({version:cRow.version,
        choices:cRow.choices_json,updatedAt:cRow.updated_at});
      if(consent.version!==input.consentVersion||!consent.choices.personalStorage
        ||!consent.choices.externalAi||iso(consent.updatedAt)>iso(input.approvedAt))
        throw new ExperienceInputRegistrationDenied();
      const records=await c.query(`SELECT item_id,version,value_json,updated_at,deleted_at
        FROM api_self_workspace_records WHERE actor_id=$1 AND kind='EXPERIENCE'
          AND item_id=$2`,[input.actorId,input.experienceId]);
      if(records.rows.length!==1)throw new ExperienceInputRegistrationDenied();
      const record=Workspace.parse(records.rows[0]);
      if(record.deleted_at!==null||record.item_id!==input.experienceId
        ||record.version!==input.contentVersion||iso(record.updated_at)>iso(input.approvedAt))
        throw new ExperienceInputRegistrationDenied();
      const experience=OwnerWorkspaceRecordSchema.parse({
        itemId:record.item_id,version:record.version,value:record.value_json,updatedAt:record.updated_at,
      });
      if(experience.value.kind!=='EXPERIENCE'||experience.value.dataMode!=='OWNER_CONSENTED')
        throw new ExperienceInputRegistrationDenied();
      const until=await this.evidence(c,input,asOf);
      const expiresAt=new Date(Math.min(iso(input.expiresAt),until,iso(asOf)+30*60*1000)).toISOString();
      if(iso(expiresAt)<=iso(asOf))throw new ExperienceInputRegistrationDenied();
      const packet=SafeLlmPacketSchema.parse(buildExperienceSkillPacket({
        packetId:randomBytes(24).toString('base64url'),experience,
      }));
      const packetSha256=canonicalProjectionHash(packet);
      const proof={...input,now:asOf,packetSha256};
      // One external review authority, checked against the exact fresh
      // packet/source/consent versions; no locally invented approval receipt.
      if(await this.reviewer.verify(proof)!==true)throw new ExperienceInputRegistrationDenied();
      const projectionId=randomUUID(),inputRef=randomUUID(),epoch=randomUUID();
      const sourceRefs=JSON.stringify([input.source]);
      const inserted=await c.query(`INSERT INTO api_ai_provider_inputs(
          projection_id,actor_id,input_ref,operation,as_of,epoch,policy_version,
          consent_version,approved_by,approved_at,expires_at,input_class,
          privacy_review_ref,source_refs,safe_packet)
        VALUES($1,$2,$3,'HCX_007',$4,$5,$6,$7,$8,$9,$10,
          'PERSONAL_CONSENTED_CLEARED',$11,$12::jsonb,$13::jsonb)
        RETURNING projection_id`,
      [projectionId,input.actorId,inputRef,asOf,epoch,input.policyVersion,
        String(input.consentVersion),input.approvedBy,input.approvedAt,expiresAt,
        input.privacyReviewRef,sourceRefs,JSON.stringify(packet)]);
      if(inserted.rows.length!==1||inserted.rows[0]?.projection_id!==projectionId)
        throw new ExperienceInputRegistrationDenied();
      const linked=await c.query(`INSERT INTO api_ai_experience_bindings(
        projection_id,actor_id,experience_id,content_version,consent_version,
        input_ref,operation,source_id,source_revision_id,approved_by,approved_at)
        VALUES($1,$2,$3,$4,$5,$6,'HCX_007',$7,$8,$9,$10)
        RETURNING projection_id`,
      [projectionId,input.actorId,input.experienceId,input.contentVersion,
        input.consentVersion,inputRef,input.source.sourceId,
        input.source.revisionId,input.approvedBy,input.approvedAt]);
      if(linked.rows.length!==1||linked.rows[0]?.projection_id!==projectionId)
        throw new ExperienceInputRegistrationDenied();
      // Remove only old HEAD pointers for this owner/experience. Immutable old
      // records remain auditable, and provider runtime rejects stale packets.
      await c.query(`DELETE FROM api_ai_provider_input_heads h WHERE h.actor_id=$1
        AND h.operation='HCX_007' AND h.projection_id IN (
          SELECT b.projection_id FROM api_ai_experience_bindings b
          WHERE b.actor_id=$1 AND b.experience_id=$2 AND b.projection_id<>$3)`,
        [input.actorId,input.experienceId,projectionId]);
      const current=await c.query(`INSERT INTO api_ai_provider_input_heads(
        actor_id,input_ref,operation,projection_id) VALUES($1,$2,'HCX_007',$3) RETURNING projection_id`,
      [input.actorId,inputRef,projectionId]);
      if(current.rows.length!==1||current.rows[0]?.projection_id!==projectionId
        ||await this.reviewer.verify({
        ...input,now:Time.parse(this.now()),packetSha256,
      })!==true)throw new ExperienceInputRegistrationDenied();
      await c.query('COMMIT');begun=false;
      return {experienceId:input.experienceId,inputRef,asOf,expiresAt,
        contentVersion:input.contentVersion,consentVersion:input.consentVersion};
    }catch{
      if(begun)try{await c.query('ROLLBACK');}catch{/* no private audit leak */}
      throw new ExperienceInputRegistrationDenied();
    }finally{c.release();}
  }
}
