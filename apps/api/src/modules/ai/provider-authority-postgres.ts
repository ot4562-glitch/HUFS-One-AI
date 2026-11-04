import {createHash} from 'node:crypto';
import {z} from 'zod';
import {SafeLlmPacketSchema,SelfConsentSchema} from '@hufs-one/contracts';
import type {AiTask,SafeLlmPacket} from '@hufs-one/contracts';
import type {ReviewerSqlPool,ReviewerSqlConnection} from '../auth/reviewer-postgres.js';
import type {VerifiedActor} from '../../types.js';
import {authorizeSession} from '../auth/gates.js';
/** Authority-only preflight contract. NO provider HTTP, costs or production wiring. */
export type ProviderOperation='OCR_GENERAL'|'HCX_005'|'HCX_007';
export interface ProviderRequest {
  actor:VerifiedActor;
  inputRef:string;
  operation:ProviderOperation;
  asOf:string;
  phaseId:string;
  idempotencyKey:string;
  signal?:AbortSignal;
  task?:AiTask;
}
export interface ProviderSnapshot {
  actorId:string;
  sessionIdHash:string;
  inputRef:string;
  operation:ProviderOperation;
  asOf:string;
  epoch:string;
  grantVersion:string;
  consentVersion:string;
  policyVersion:string;
  approvedBy:string;
  approvedAt:string;
  expiresAt:string;
  sources:Array<{sourceId:string;revisionId:string;permissionRef:string;originalSha256:string}>;
  packet?:SafeLlmPacket;
  media?:{bytes:Uint8Array;sourceRevisionId:string;assetId:string;originalSha256:string};
}

const Ref=z.string().regex(/^[A-Za-z0-9_.:@-]{1,128}$/),Hash=z.string().regex(/^[a-f0-9]{64}$/);
const Iso=z.iso.datetime({offset:true}),Time=z.preprocess(v=>v instanceof Date?v.toISOString():v,Iso);
const Operation=z.enum(['OCR_GENERAL','HCX_005','HCX_007']);
const InputClass=z.enum(['PUBLIC_CLEARED','SYNTHETIC_CLEARED','NON_IDENTIFYING_REVIEWED']);
const SourceRef=z.strictObject({sourceId:Ref,revisionId:Ref,permissionRef:Ref,originalSha256:Hash});
const Projection=z.object({projection_id:Ref,actor_id:Ref,input_ref:Ref,operation:Operation,as_of:Time,
  epoch:Ref,policy_version:Ref,consent_version:z.string().regex(/^[1-9][0-9]{0,15}$/),approved_by:Ref,approved_at:Time,expires_at:Time,
  input_class:InputClass,privacy_review_ref:Ref,source_refs:z.array(SourceRef).min(1).max(20),erased_at:Time.nullable(),
  safe_packet:SafeLlmPacketSchema.nullable(),media_bytes:z.instanceof(Uint8Array).nullable(),media_source_revision_id:Ref.nullable(),
  media_asset_id:Ref.nullable(),media_original_sha256:Hash.nullable()});
const Source=z.object({source_id:Ref,revision_id:Ref,permission_ref:Ref,original_sha256:Hash,content_sha256:Hash,
  source_class:z.enum(['SYNTHETIC','LICENSED_EXTERNAL','PERSONAL_CONSENTED','RESEARCH_REFERENCE_ONLY']),
  provenance:z.enum(['SYNTHETIC','REAL_APPROVED','RESEARCH_ONLY']),status:z.enum(['ACTIVE','NEEDS_REVIEW','STALE','RETRACTED','BLOCKED_RIGHTS']),
  change_kind:z.enum(['NEW','CORRECTED','EXTENDED','CANCELLED','UNKNOWN']),fetched_at:Time,last_verified_at:Time.nullable(),valid_from:Time.nullable(),valid_until:Time.nullable(),
  receipt_id:Ref,rights_actor_id:Ref,reviewed_by:Ref,reviewed_at:Time,starts_at:Time,expires_at:Time,policy_version:Ref,
  canonical_url:z.string().min(9).max(2048),purposes:z.array(z.enum(['COLLECT','STORE','SEARCH','EXTERNAL_TRANSFER'])).min(1).max(4),revoked_at:Time.nullable()});
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Both fresh reads independently hash-check the media bytes against originalSha256.
 * Compare only bound metadata here: JSON.stringify(Buffer) otherwise expands a 5 MB
 * image into tens of MB twice, which is unnecessary and avoidable memory pressure. */
function snapshotFingerprint(value:ProviderSnapshot):string{
  const media=value.media;
  return hash({...value,...(media?{media:{sourceRevisionId:media.sourceRevisionId,
    assetId:media.assetId,originalSha256:media.originalSha256}}:{})});
}
const denied=()=>new Error('Provider authority unavailable');
function requireThat(value:unknown):asserts value {if(!value)throw new Denied();}
class Denied extends Error{}
function canonical(value:string){try{const u=new URL(value);return u.href===value&&u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&!u.port
  &&u.hostname!=='localhost'&&!u.hostname.endsWith('.local')&&!u.hostname.endsWith('.localhost');}catch{return false;}}
function version(raw:unknown){requireThat(typeof raw==='string'||typeof raw==='number');const n=Number(raw);requireThat(Number.isSafeInteger(n)&&n>0);return n;}
type Request=ProviderRequest&{now:string};
export interface PostgresProviderAuthorityOptions {
  /** Input/privacy review policy, independent of the executor's pricing policy. */
  policyVersion:string;
  /** Must check current server session/beta admission/revocation, not caller flags. */
  sessionIsCurrent(input:{actor:VerifiedActor;now:string}):Promise<boolean>;
  now?:()=>string;
}
const SOURCES=`SELECT h.source_id,r.revision_id,r.permission_ref,r.original_sha256,r.content_sha256,
  r.source_class,r.provenance,r.status,r.change_kind,r.fetched_at,r.last_verified_at,r.valid_from,r.valid_until,
  g.receipt_id,g.actor_id AS rights_actor_id,g.reviewed_by,g.reviewed_at,g.starts_at,g.expires_at,g.policy_version,g.canonical_url,g.purposes,v.revoked_at
  FROM source_ingest_heads h
  JOIN source_effective_revisions_vnext r ON r.source_id=h.source_id AND r.revision_id=h.revision_id
  JOIN jsonb_to_recordset($2::jsonb) AS wanted("sourceId" text,"revisionId" text,"permissionRef" text,"originalSha256" text)
    ON wanted."sourceId"=h.source_id
  JOIN LATERAL (SELECT * FROM source_rights_receipts
    WHERE actor_id=$1 AND source_id=h.source_id AND permission_ref=wanted."permissionRef"
    ORDER BY reviewed_at DESC,receipt_id DESC LIMIT 1) g ON true
  LEFT JOIN source_rights_revocations v ON v.receipt_id=g.receipt_id
  ORDER BY h.source_id LIMIT 21`;

/** Private operator-provisioned projections only. No writes, original discovery,
 * browser packet ingestion, network, credentials, approval manufacture or cache.
 * Use a dedicated SELECT-only non-owner/non-BYPASSRLS DB role. */
export class PostgresProviderAuthority {
  private readonly policyVersion:string;
  private readonly now:()=>string;
  constructor(private readonly pool:ReviewerSqlPool,private readonly options:PostgresProviderAuthorityOptions){
    this.policyVersion=Ref.parse(options.policyVersion);this.now=options.now??(()=>new Date().toISOString());
    if(typeof options.sessionIsCurrent!=='function')throw denied();
  }
  private async current(req:Request){
    const now=Iso.parse(this.now());requireThat(!req.signal?.aborted&&req.actor.role==='BETA');
    authorizeSession(req.actor,now);
    requireThat(Date.parse(req.now)<=Date.parse(now)&&Date.parse(req.asOf)<=Date.parse(now));
    requireThat(await this.options.sessionIsCurrent({actor:structuredClone(req.actor),now})===true);
    // A trusted session check may itself await DB/network work.
    const after=Iso.parse(this.now());authorizeSession(req.actor,after);
    requireThat(!req.signal?.aborted&&Date.parse(req.asOf)<=Date.parse(after));
    return after;
  }
  async read(input:Request):Promise<ProviderSnapshot|null>{
    try{
      const req:Request={...input,actor:structuredClone(input.actor)};
      Ref.parse(req.actor.actorId);Ref.parse(req.actor.sessionIdHash);Ref.parse(req.inputRef);Operation.parse(req.operation);Iso.parse(req.asOf);Iso.parse(req.now);
      await this.current(req);
      const first=await this.snapshot(req);
      await this.current(req);
      // A second fresh transaction observes consent/rights/head revocations which
      // REPEATABLE READ intentionally cannot see inside the first transaction.
      const second=await this.snapshot(req);
      const after=await this.current(req);
      requireThat(snapshotFingerprint(first)===snapshotFingerprint(second)&&Date.parse(second.expiresAt)>Date.parse(after));
      return second;
    }catch(error){if(error instanceof Denied||error instanceof z.ZodError)return null;
      // Session denial is deliberately indistinguishable from missing input.
      if(error instanceof Error&&['UNAUTHENTICATED','FORBIDDEN'].includes(error.message))return null;
      throw denied();}
  }
  private async snapshot(req:Request):Promise<ProviderSnapshot>{
    const c=await this.pool.connect();let begun=false;
    try{
      await c.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true;
      await c.query("SET LOCAL statement_timeout='5s'");
      await c.query("SELECT set_config('hufs.self_actor',$1,true)",[req.actor.actorId]);
      const result=await this.project(c,req);
      await c.query('COMMIT');begun=false;return result;
    }catch(error){if(begun)try{await c.query('ROLLBACK');}catch{/* preserve bounded denial */}throw error;}
    finally{c.release();}
  }
  private async project(c:ReviewerSqlConnection,req:Request):Promise<ProviderSnapshot>{
    const consentRows=await c.query('SELECT version,choices_json,updated_at FROM api_self_consents WHERE actor_id=$1',[req.actor.actorId]);
    requireThat(consentRows.rows.length===1);const row=consentRows.rows[0]!;
    const consent=SelfConsentSchema.parse({version:version(row.version),choices:row.choices_json,updatedAt:Time.parse(row.updated_at)});
    requireThat(consent.choices.personalStorage&&consent.choices.externalAi);
    const inputRows=await c.query(`SELECT p.* FROM api_ai_provider_input_heads h
      JOIN api_ai_provider_inputs p ON p.projection_id=h.projection_id AND p.actor_id=h.actor_id AND p.input_ref=h.input_ref AND p.operation=h.operation
      WHERE h.actor_id=$1 AND h.input_ref=$2 AND h.operation=$3 LIMIT 2`,[req.actor.actorId,req.inputRef,req.operation]);
    requireThat(inputRows.rows.length===1);const p=Projection.parse(inputRows.rows[0]);requireThat(p.erased_at===null);
    requireThat(p.actor_id===req.actor.actorId&&p.input_ref===req.inputRef&&p.operation===req.operation&&p.approved_by!==p.actor_id
      &&p.policy_version===this.policyVersion&&p.consent_version===String(consent.version)&&Date.parse(p.as_of)===Date.parse(req.asOf));
    requireThat(new Set(p.source_refs.map(s=>s.sourceId)).size===p.source_refs.length);
    const expires=[Date.parse(p.expires_at),Date.parse(req.actor.sessionExpiresAt)];
    if(req.actor.role==='BETA')expires.push(Date.parse(req.actor.schoolMailProofExpiresAt));
    const asOf=Date.parse(req.asOf);
    requireThat(Date.parse(p.approved_at)<=asOf&&Date.parse(consent.updatedAt)<=Date.parse(p.approved_at));
    const sources=await c.query(SOURCES,[req.actor.actorId,JSON.stringify(p.source_refs)]);
    requireThat(sources.rows.length===p.source_refs.length);
    const parsed=sources.rows.map(r=>Source.parse(r));
    requireThat(new Set(parsed.map(r=>r.source_id)).size===p.source_refs.length);
    for(const r of parsed){
      const ref=p.source_refs.find(s=>s.sourceId===r.source_id);
      requireThat(ref&&r.revision_id===ref.revisionId&&r.permission_ref===ref.permissionRef&&r.original_sha256===ref.originalSha256);
      requireThat(r.status==='ACTIVE'&&r.source_class!=='RESEARCH_REFERENCE_ONLY'&&r.provenance!=='RESEARCH_ONLY'
        &&r.change_kind!=='CANCELLED'&&r.last_verified_at!==null&&Date.parse(r.last_verified_at)>=Date.parse(r.fetched_at)
        &&Date.parse(r.fetched_at)<=asOf&&Date.parse(r.last_verified_at)<=asOf);
      requireThat(r.rights_actor_id===req.actor.actorId&&r.reviewed_by!==req.actor.actorId&&r.revoked_at===null
        &&canonical(r.canonical_url)&&new Set(r.purposes).size===r.purposes.length&&r.purposes.includes('STORE')&&r.purposes.includes('EXTERNAL_TRANSFER')
        &&Date.parse(r.reviewed_at)<=Date.parse(r.starts_at)&&Date.parse(r.starts_at)<=asOf);
      if(r.valid_from)requireThat(Date.parse(r.valid_from)<=asOf);
      if(r.valid_until)expires.push(Date.parse(r.valid_until));
      expires.push(Date.parse(r.expires_at));
      if(p.input_class==='SYNTHETIC_CLEARED')requireThat(r.source_class==='SYNTHETIC'&&r.provenance==='SYNTHETIC');
      if(r.source_class==='PERSONAL_CONSENTED')requireThat(p.input_class==='NON_IDENTIFYING_REVIEWED');
    }
    requireThat((req.operation==='OCR_GENERAL')===(p.safe_packet===null));
    if(p.safe_packet){requireThat(p.safe_packet.providerInputClass===p.input_class
      &&Buffer.byteLength(JSON.stringify(p.safe_packet))<=24000);}
    let media:ProviderSnapshot['media'];
    if(p.media_bytes!==null){
      requireThat(req.operation!=='HCX_007'&&p.media_bytes.byteLength>0&&p.media_bytes.byteLength<=5*1024*1024
        &&p.media_source_revision_id&&p.media_asset_id&&p.media_original_sha256);
      const bytes=Buffer.from(p.media_bytes);
      requireThat(createHash('sha256').update(bytes).digest('hex')===p.media_original_sha256
        &&p.source_refs.some(s=>s.revisionId===p.media_source_revision_id&&s.originalSha256===p.media_original_sha256));
      media={bytes,sourceRevisionId:p.media_source_revision_id,assetId:p.media_asset_id,originalSha256:p.media_original_sha256};
    }else requireThat(p.media_source_revision_id===null&&p.media_asset_id===null&&p.media_original_sha256===null);
    requireThat((req.operation!=='HCX_007')===Boolean(media));
    const databaseRows=await c.query('SELECT clock_timestamp() AS database_now');
    requireThat(databaseRows.rows.length===1);
    const databaseNow=Date.parse(Time.parse(databaseRows.rows[0]!.database_now)),localNow=Date.parse(Iso.parse(this.now()));
    const earliest=Math.min(asOf,Date.parse(req.now),databaseNow,localNow),latest=Math.max(asOf,Date.parse(req.now),databaseNow,localNow);
    requireThat(asOf<=databaseNow&&Date.parse(p.approved_at)<=earliest&&Date.parse(consent.updatedAt)<=earliest
      &&parsed.every(r=>Date.parse(r.starts_at)<=earliest)&&expires.every(at=>at>latest));
    const grantVersion='rights-'+hash(parsed.map(r=>({...r})).sort((a,b)=>a.source_id.localeCompare(b.source_id)));
    return {actorId:req.actor.actorId,sessionIdHash:req.actor.sessionIdHash,inputRef:req.inputRef,operation:req.operation,asOf:req.asOf,
      epoch:'input-'+createHash('sha256').update(p.projection_id+'|'+p.epoch+'|'+p.consent_version).digest('hex'),
      grantVersion,consentVersion:String(consent.version),policyVersion:p.policy_version,
      approvedBy:p.approved_by,approvedAt:p.approved_at,expiresAt:new Date(Math.min(...expires)).toISOString(),sources:p.source_refs,
      ...(p.safe_packet?{packet:p.safe_packet}:{}),...(media?{media}:{})};
  }
}
