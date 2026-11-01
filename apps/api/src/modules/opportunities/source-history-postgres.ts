import {z} from 'zod';
import {matchesEvidenceScope} from '@hufs-one/contracts';
import type {EvidenceScope} from '@hufs-one/contracts';
import type {VerifiedTeamActor} from '../../types.js';
import type {ReviewerSqlPool} from '../auth/reviewer-postgres.js';
import {policyFingerprint} from './temporal-gateway.js';
import type {EvidenceRightsResolver,CurrentEvidenceGrants} from './temporal-gateway.js';

const Id=z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:@-]+$/);
const Revision=z.object({
  revision_id:Id,source_id:Id,supersedes:Id.nullable(),
  permission_ref:Id,
  status:z.enum(['ACTIVE','NEEDS_REVIEW','STALE','RETRACTED','BLOCKED_RIGHTS']),
  change_kind:z.enum(['NEW','CORRECTED','EXTENDED','CANCELLED','UNKNOWN']),
  media_kind:z.enum(['HTML','TEXT','PDF','IMAGE']),
  source_class:z.enum(['SYNTHETIC','LICENSED_EXTERNAL','PERSONAL_CONSENTED','RESEARCH_REFERENCE_ONLY']),
  provenance:z.enum(['SYNTHETIC','REAL_APPROVED','RESEARCH_ONLY']),
  content_sha256:z.string().regex(/^[0-9a-f]{64}$/),
  published_at:z.unknown().nullable(),fetched_at:z.unknown(),
  last_checked_at:z.unknown(),last_verified_at:z.unknown().nullable(),
  scope_campuses:z.array(z.string()).nullable(),scope_majors:z.array(z.string()).nullable(),
  scope_colleges:z.array(z.string()).nullable(),scope_major_roles:z.array(z.string()).nullable(),
  scope_admission_types:z.array(z.string()).nullable(),
  scope_enrollment_states:z.array(z.string()).nullable(),
  scope_graduation_terms:z.array(z.string()).nullable(),
  cohort_min:z.number().int().nullable(),cohort_max:z.number().int().nullable(),
});
const at=(input:unknown):string=>{
  const value=input instanceof Date?input.toISOString():input;
  if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw new Error('Invalid source timestamp');
  return new Date(value).toISOString();
};
const scopeFor=(r:z.infer<typeof Revision>):EvidenceScope=>({
  ...(r.scope_campuses?.length?{campuses:r.scope_campuses}:{}),
  ...(r.scope_majors?.length?{majorCodes:r.scope_majors}:{}),
  ...(r.scope_colleges?.length?{colleges:r.scope_colleges}:{}),
  ...(r.scope_major_roles?.length?{majorRoles:r.scope_major_roles as EvidenceScope['majorRoles']}:{}),
  ...(r.scope_admission_types?.length?{admissionTypes:r.scope_admission_types}:{}),
  ...(r.scope_enrollment_states?.length?{enrollmentStates:r.scope_enrollment_states}:{}),
  ...(r.scope_graduation_terms?.length?{graduationTermScope:r.scope_graduation_terms}:{}),
  ...(r.cohort_min===null?{}:{cohortMin:r.cohort_min}),
  ...(r.cohort_max===null?{}:{cohortMax:r.cohort_max}),
});
export interface PublicSourceRevisionMetadata {
  revisionId:string;supersedes?:string;
  status:'ACTIVE'|'NEEDS_REVIEW'|'STALE'|'RETRACTED'|'BLOCKED_RIGHTS';
  changeKind:'NEW'|'CORRECTED'|'EXTENDED'|'CANCELLED'|'UNKNOWN';
  mediaKind:'HTML'|'TEXT'|'PDF'|'IMAGE';contentSha256:string;
  publishedAt?:string;fetchedAt:string;lastCheckedAt:string;lastVerifiedAt?:string;
}
export interface PublicSourceRevisionHistory {
  sourceId:string;currentRevisionId:string;permissionPolicyVersion:string;
  revisions:PublicSourceRevisionMetadata[];
}
function permitted(g:CurrentEvidenceGrants|null,sourceId:string):g is CurrentEvidenceGrants{
  return !!g&&g.permissionRefs.size>0&&!!g.policyVersion
    &&(!g.sourceIds||g.sourceIds.has(sourceId));
}
/**
 * Actor-scoped METADATA ONLY: never serves source text, image bytes, hidden
 * revision IDs, student content, or an unapproved predecessor of a newer head.
 * The rights resolver must be a server-owned, current policy source.
 */
export class PostgresSourceRevisionHistory {
  constructor(private readonly pool:ReviewerSqlPool,private readonly rights:EvidenceRightsResolver){}

  async read(input:{actor:VerifiedTeamActor;sourceId:string;now:string}):Promise<PublicSourceRevisionHistory|null>{
    if(input.actor.role!=='BETA'&&input.actor.role!=='ADMIN')return null;
    const sourceId=Id.parse(input.sourceId),now=at(input.now);
    const before=await this.rights.resolveFor({actor:input.actor,now});
    if(!permitted(before,sourceId))return null;
    const fingerprint=policyFingerprint(before);
    const connection=await this.pool.connect();
    let transaction=false;
    let result:PublicSourceRevisionHistory|null=null;
    let headId:string|null=null;
    try{
      await connection.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');transaction=true;
      await connection.query("SET LOCAL statement_timeout = '5s'");
      const heads=await connection.query('SELECT revision_id FROM source_ingest_heads WHERE source_id=$1',[sourceId]);
      if(heads.rows.length===1&&typeof heads.rows[0]?.revision_id==='string'){
        headId=Id.parse(heads.rows[0].revision_id);
        const records=await connection.query(`SELECT revision_id,source_id,supersedes,permission_ref,status,
          change_kind,media_kind,source_class,provenance,content_sha256,
          published_at,fetched_at,last_checked_at,last_verified_at,
          scope_campuses,scope_majors,scope_colleges,scope_major_roles,
          scope_admission_types,scope_enrollment_states,scope_graduation_terms,
          cohort_min,cohort_max
          FROM source_revisions_vnext WHERE source_id=$1
          ORDER BY fetched_at DESC,revision_id DESC LIMIT 51`,[sourceId]);
        if(records.rows.length>50)throw new Error('History exceeds verified response bound');
        const revisions=records.rows.map(x=>Revision.parse(x));
        const latest=revisions[0];
        if(latest&&latest.revision_id===headId
          &&Date.parse(at(latest.fetched_at))<=Date.parse(now)
          &&latest.source_class!=='RESEARCH_REFERENCE_ONLY'
          &&latest.provenance!=='RESEARCH_ONLY'
          &&before.permissionRefs.has(latest.permission_ref)
          &&matchesEvidenceScope(scopeFor(latest),before)){
          const visible=revisions.filter(r=>before.permissionRefs.has(r.permission_ref)
            &&r.source_class!=='RESEARCH_REFERENCE_ONLY'&&r.provenance!=='RESEARCH_ONLY'
            &&Date.parse(at(r.fetched_at))<=Date.parse(now)
            &&matchesEvidenceScope(scopeFor(r),before));
          result={sourceId,currentRevisionId:headId,
            permissionPolicyVersion:before.policyVersion,
            revisions:visible.map(r=>({
              revisionId:r.revision_id,...(r.supersedes&&visible.some(x=>x.revision_id===r.supersedes)
                ?{supersedes:r.supersedes}:{}),
              status:r.status,changeKind:r.change_kind,mediaKind:r.media_kind,
              contentSha256:r.content_sha256,
              ...(r.published_at?{publishedAt:at(r.published_at)}:{}),
              fetchedAt:at(r.fetched_at),lastCheckedAt:at(r.last_checked_at),
              ...(r.last_verified_at?{lastVerifiedAt:at(r.last_verified_at)}:{}),
            })),
          };
        }
      }
      await connection.query('COMMIT');transaction=false;
    }catch(e){
      if(transaction)try{await connection.query('ROLLBACK');}catch{/* fail closed */}
      throw new Error('Source metadata unavailable');
    }finally{connection.release();}
    if(!result||!headId)return null;
    const after=await this.rights.resolveFor({actor:input.actor,now});
    if(!permitted(after,sourceId)||policyFingerprint(after)!==fingerprint)return null;
    // Detect a head correction between the read snapshot and authorization recheck.
    const confirm=await this.pool.connect();
    try{
      const current=await confirm.query('SELECT revision_id FROM source_ingest_heads WHERE source_id=$1',[sourceId]);
      if(current.rows.length!==1||current.rows[0]?.revision_id!==headId)return null;
    }finally{confirm.release();}
    return result;
  }
}
