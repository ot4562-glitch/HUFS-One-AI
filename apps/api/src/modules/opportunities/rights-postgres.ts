import {createHash} from 'node:crypto';
import {isIP} from 'node:net';
import {z} from 'zod';
import {AcademicDegreePathSelectionVNextSchema,type EvidenceActorScope} from '@hufs-one/contracts';
import type {ReviewerSqlPool,ReviewerSqlConnection} from '../auth/reviewer-postgres.js';
import type {VerifiedTeamActor} from '../../types.js';
import type {ApprovedSourceRightsResolver,ApprovedSourceRights} from './approved-fetch.js';
import type {CurrentEvidenceGrants,EvidenceRightsResolver} from './temporal-gateway.js';

const Ref=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const ActorId=z.string().regex(/^[A-Za-z0-9_.:@-]{1,128}$/);
const Time=z.preprocess(v=>v instanceof Date?v.toISOString():v,z.iso.datetime({offset:true}));
const Purpose=z.enum(['COLLECT','STORE','SEARCH','EXTERNAL_TRANSFER']);
const Receipt=z.object({receipt_id:Ref,actor_id:ActorId,source_id:Ref,permission_ref:Ref,
  canonical_url:z.string().min(9).max(2048),purposes:z.array(Purpose).min(1).max(4),
  reviewed_by:ActorId,reviewed_at:Time,starts_at:Time,expires_at:Time,policy_version:Ref,
  revoked_at:Time.nullable(),database_now:Time});
const Scope=z.strictObject({
  campus:Ref.optional(),college:Ref.optional(),enrollmentState:Ref.optional(),
  admissionType:Ref.optional(),majorCode:Ref.optional(),
  degreePath:AcademicDegreePathSelectionVNextSchema.optional(),
  track:Ref.refine(v=>v!=='UNSELECTED',{message:'Unknown track must be UNDECIDED'}).optional(),curriculumVersion:Ref.optional(),
  majors:z.array(z.strictObject({code:Ref,role:z.enum(['PRIMARY','DOUBLE','MINOR'])})).max(16).optional(),
  cohort:z.number().int().min(1950).max(2200).optional(),
  graduationTerm:z.string().regex(/^(19|20|21|22)\d{2}-[12]$/).optional(),
  graduationTermVerified:z.boolean().optional(),
}).superRefine((v,c)=>{
  if(v.graduationTerm!==undefined&&v.graduationTermVerified!==true)
    c.addIssue({code:'custom',message:'Graduation term requires independent verification'});
  if(v.majors&&new Set(v.majors.map(m=>m.code+'\0'+m.role)).size!==v.majors.length)
    c.addIssue({code:'custom',message:'Duplicate academic major role'});
});
const ScopeReceipt=z.object({scope_receipt_id:Ref,actor_id:ActorId,scope_json:Scope,
  reviewed_by:ActorId,reviewed_at:Time,starts_at:Time,expires_at:Time,scope_version:Ref,
  revoked_at:Time.nullable(),database_now:Time});
const Head=z.object({source_id:Ref,revision_id:Ref,permission_ref:Ref,
  status:z.enum(['ACTIVE','NEEDS_REVIEW','STALE','RETRACTED','BLOCKED_RIGHTS']),
  last_verified_at:Time.nullable(),fetched_at:Time,content_sha256:z.string().regex(/^[a-f0-9]{64}$/)});
const Pair=z.object({source_id:Ref,permission_ref:Ref});
const fingerprint=(prefix:string,value:unknown)=>prefix+createHash('sha256').update(JSON.stringify(value)).digest('hex');
const pair=(source:string,permission:string)=>source+'\0'+permission;
function times(request:string,current:string):{request:string;current:string}|null{
  const a=Time.safeParse(request),b=Time.safeParse(current);
  return a.success&&b.success&&Date.parse(a.data)<=Date.parse(b.data)
    ?{request:a.data,current:b.data}:null;
}
type ActiveRecord={actor_id:string;reviewed_by:string;reviewed_at:string;starts_at:string;
  expires_at:string;revoked_at:string|null;database_now:string};
function active(r:ActiveRecord,actorId:string,t:{request:string;current:string}):boolean{
  const earliest=Math.min(Date.parse(t.request),Date.parse(t.current),Date.parse(r.database_now));
  const latest=Math.max(Date.parse(t.request),Date.parse(t.current),Date.parse(r.database_now));
  return r.actor_id===actorId&&r.reviewed_by!==actorId&&r.revoked_at===null
    &&Date.parse(r.reviewed_at)<=Date.parse(r.starts_at)
    &&Date.parse(r.reviewed_at)<=earliest&&Date.parse(r.starts_at)<=earliest
    &&Date.parse(r.expires_at)>latest;
}
function canonical(value:string):boolean{
  try{const u=new URL(value);return u.href===value&&u.protocol==='https:'&&!u.username&&!u.password
    &&!u.port&&!u.hash&&u.hostname!=='localhost'&&!u.hostname.endsWith('.local')
    &&!u.hostname.endsWith('.localhost')&&!u.hostname.endsWith('.')
    &&!u.hostname.endsWith('.internal')&&!u.hostname.startsWith('[')
    &&isIP(u.hostname)===0;}catch{return false;}
}
const RECEIPTS=`SELECT r.*,v.revoked_at,clock_timestamp() AS database_now FROM (
  SELECT DISTINCT ON (source_id,permission_ref) * FROM source_rights_receipts
  WHERE actor_id=$1
  ORDER BY source_id,permission_ref,reviewed_at DESC,receipt_id DESC
  LIMIT 101
) r LEFT JOIN source_rights_revocations v USING(receipt_id)`;

/** Read-only authority for an independently configured ingestion operator.
 * Approval is provisioned in the private DB, never through caller flags.
 * Reads are fresh on every invocation; EXTERNAL_TRANSFER is never inferred.
 */
export class PostgresApprovedSourceRightsResolver implements ApprovedSourceRightsResolver{
  private readonly actorId:string;
  private readonly now:()=>string;
  constructor(private readonly pool:ReviewerSqlPool,options:{actorId:string;now?:()=>string}){
    this.actorId=ActorId.parse(options.actorId);this.now=options.now??(()=>new Date().toISOString());
  }
  async resolve(input:{sourceId:string;permissionRef:string;now:string}):Promise<ApprovedSourceRights|null>{
    const t=times(input.now,this.now());if(!t||!Ref.safeParse(input.sourceId).success
      ||!Ref.safeParse(input.permissionRef).success)return null;
    const c=await this.pool.connect();
    try{
      const rows=await c.query(`SELECT r.*,v.revoked_at,clock_timestamp() AS database_now
        FROM (SELECT * FROM source_rights_receipts
          WHERE actor_id=$1 AND source_id=$2 AND permission_ref=$3
          ORDER BY reviewed_at DESC,receipt_id DESC LIMIT 1) r
        LEFT JOIN source_rights_revocations v USING(receipt_id)`,[this.actorId,input.sourceId,input.permissionRef]);
      if(rows.rows.length!==1)return null;
      const parsed=Receipt.safeParse(rows.rows[0]);if(!parsed.success)return null;
      const r=parsed.data;
      if(!active(r,this.actorId,t)||r.source_id!==input.sourceId||r.permission_ref!==input.permissionRef
        ||!canonical(r.canonical_url)||new Set(r.purposes).size!==r.purposes.length)return null;
      return {sourceId:r.source_id,permissionRef:r.permission_ref,canonicalUrl:r.canonical_url,
        policyVersion:fingerprint('rights-',{...r,database_now:undefined}),
        reviewedBy:r.reviewed_by,reviewedAt:r.reviewed_at,expiresAt:r.expires_at,
        status:'APPROVED',allowedPurposes:new Set(r.purposes)};
    }catch{throw new Error('Source rights unavailable');}finally{c.release();}
  }
}

/** Exact verified-actor SEARCH rights, current head epoch and separately
 * attested academic facts from one repeatable-read snapshot. There is no
 * fallback to an earlier revoked/expired grant or academic attestation.
 */
export class PostgresEvidenceRightsResolver implements EvidenceRightsResolver{
  private readonly now:()=>string;
  constructor(private readonly pool:ReviewerSqlPool,options:{now?:()=>string}={}){
    this.now=options.now??(()=>new Date().toISOString());
  }
  async resolveFor(input:{actor:VerifiedTeamActor;now:string}):Promise<CurrentEvidenceGrants|null>{
    const t=times(input.now,this.now()),actor=input.actor;
    if(!t||!ActorId.safeParse(actor.actorId).success||!['BETA','ADMIN'].includes(actor.role)
      ||actor.betaAllowed!==true||!Time.safeParse(actor.sessionExpiresAt).success
      ||!Time.safeParse(actor.schoolMailProofExpiresAt).success
      ||Math.min(Date.parse(actor.sessionExpiresAt),Date.parse(actor.schoolMailProofExpiresAt))<=Date.parse(t.current))return null;
    const c=await this.pool.connect();let open=false;
    try{
      await c.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');open=true;
      await c.query("SET LOCAL statement_timeout='5s'");
      const result=await this.read(c,actor,t);
      await c.query('COMMIT');open=false;return result;
    }catch{if(open)try{await c.query('ROLLBACK');}catch{/* no raw SQL leakage */}
      throw new Error('Source rights unavailable');}finally{c.release();}
  }
  private async read(c:ReviewerSqlConnection,actor:VerifiedTeamActor,t:{request:string;current:string}):Promise<CurrentEvidenceGrants|null>{
    const rows=await c.query(RECEIPTS,[actor.actorId]);
    if(rows.rows.length>100)return null;
    const receipts:Array<z.infer<typeof Receipt>>=[];
    for(const raw of rows.rows){
      const parsed=Receipt.safeParse(raw);if(!parsed.success)return null;
      const r=parsed.data;
      if(!canonical(r.canonical_url)||new Set(r.purposes).size!==r.purposes.length)return null;
      if(active(r,actor.actorId,t)&&r.purposes.includes('SEARCH')
        &&Math.min(Date.parse(actor.sessionExpiresAt),Date.parse(actor.schoolMailProofExpiresAt))>Date.parse(r.database_now))receipts.push(r);
    }
    if(!receipts.length)return null;
    const scopeRows=await c.query(`SELECT s.*,v.revoked_at,clock_timestamp() AS database_now
      FROM (SELECT * FROM source_actor_scope_receipts WHERE actor_id=$1
        ORDER BY reviewed_at DESC,scope_receipt_id DESC LIMIT 1) s
      LEFT JOIN source_actor_scope_revocations v USING(scope_receipt_id)`,[actor.actorId]);
    if(scopeRows.rows.length>1)return null;
    let scope:EvidenceActorScope={},scopeReceipt:unknown=null;
    if(scopeRows.rows.length){
      const parsed=ScopeReceipt.safeParse(scopeRows.rows[0]);if(!parsed.success)return null;
      const r=parsed.data;scopeReceipt={...r,database_now:undefined};
      if(active(r,actor.actorId,t))scope=structuredClone(r.scope_json);
    }
    const sourceIds=[...new Set(receipts.map(r=>r.source_id))].sort();
    const headRows=await c.query(`SELECT h.source_id,h.revision_id,r.permission_ref,r.status,
      r.last_verified_at,r.fetched_at,r.content_sha256 FROM source_ingest_heads h
      JOIN source_effective_revisions_vnext r ON r.revision_id=h.revision_id
      WHERE h.source_id=ANY($1::text[]) ORDER BY h.source_id LIMIT 101`,[sourceIds]);
    if(headRows.rows.length>100)return null;
    const heads=headRows.rows.map(r=>Head.parse(r));
    if(new Set(heads.map(h=>h.source_id)).size!==heads.length)return null;
    const approvedPairs=new Set(receipts.map(r=>pair(r.source_id,r.permission_ref)));
    const permissions=new Set(receipts.map(r=>r.permission_ref));
    const allowedSources=new Set(heads.filter(h=>sourceIds.includes(h.source_id)
      &&approvedPairs.has(pair(h.source_id,h.permission_ref))
      &&Date.parse(h.fetched_at)<=Date.parse(t.current)).map(h=>h.source_id));
    // The legacy reader accepts separate source and permission sets. Prevent
    // their Cartesian product from authorizing a historical mismatched pair.
    const histories=await c.query(`SELECT DISTINCT source_id,permission_ref FROM source_revisions_vnext
      WHERE source_id=ANY($1::text[]) ORDER BY source_id,permission_ref LIMIT 1001`,[[...allowedSources]]);
    if(histories.rows.length>1000)return null;
    for(const raw of histories.rows){const p=Pair.parse(raw);
      if(permissions.has(p.permission_ref)&&!approvedPairs.has(pair(p.source_id,p.permission_ref)))allowedSources.delete(p.source_id);
    }
    const granted=receipts.filter(r=>allowedSources.has(r.source_id));
    if(!granted.length)return null;
    const currentHeads=heads.filter(h=>allowedSources.has(h.source_id));
    const policyVersion=fingerprint('rights-',{
      actorId:actor.actorId,receipts:granted.map(r=>({...r,database_now:undefined}))
        .sort((a,b)=>a.receipt_id<b.receipt_id?-1:a.receipt_id>b.receipt_id?1:0),scopeReceipt,
    });
    return {...scope,permissionRefs:new Set(granted.map(r=>r.permission_ref)),
      sourceIds:new Set([...allowedSources].sort()),policyVersion,
      sourceHeadVersion:fingerprint('heads-',currentHeads)};
  }
}
