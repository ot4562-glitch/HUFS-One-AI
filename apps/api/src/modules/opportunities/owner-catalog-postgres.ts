import {createHash,randomBytes} from 'node:crypto';
import {z} from 'zod';
import {
  OwnerTranscriptSchema,CatalogCourseSchema,CourseOfferingSchema,OpportunityCatalogDetailSchema,
  CourseCatalogPageSchema,CourseOfferingsPageSchema,OpportunityCatalogPageSchema,
  matchesEvidenceScope,
} from '@hufs-one/contracts';
import type {EvidenceScope} from '@hufs-one/contracts';
import type {ReviewerSqlPool,ReviewerSqlConnection} from '../auth/reviewer-postgres.js';
import type {TrustedCatalogPort,CatalogRequest} from './owner-catalog-http.js';
import {policyFingerprint} from './temporal-gateway.js';
import type {CurrentEvidenceGrants} from './temporal-gateway.js';

const Ref=z.string().regex(/^[A-Za-z0-9_.:@-]{1,200}$/);
const Id=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const Utc=z.iso.datetime({offset:true});
const Sources=z.array(z.strictObject({sourceId:Id,revisionId:Id,permissionRef:Id})).min(1).max(100);
export type ApprovedProjectionKind='TRANSCRIPT'|'COURSE'|'OFFERING'|'OPPORTUNITY'|'PLAN_INPUT';
export interface OwnerCatalogAuthority {
  /** Bind an actual verified identity to independently reviewed current facts.
   * No browser facts or derived source-scope union. SQL also verifies exact
   * actor/source/permission SEARCH rights, separately from this authority. */
  resolve(input:{actorId:string;now:string}):Promise<CurrentEvidenceGrants|null>;
}
/** Stable across PostgreSQL jsonb key ordering; array order remains meaningful.
 * Exported for the separately authorized operator that prepares reviewed records. */
export function canonicalProjectionHash(value:unknown):string{
  const canonical=(v:unknown):unknown=>{
    if(v===null||typeof v==='string'||typeof v==='boolean')return v;
    if(typeof v==='number'&&Number.isFinite(v))return v;
    if(Array.isArray(v))return v.map(canonical);
    if(v&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype)
      return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical((v as Record<string,unknown>)[k])]));
    throw new Error('Non-JSON reviewed projection');
  };
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
const timestamp=(value:unknown)=>Utc.parse(value instanceof Date?value.toISOString():value);
const Projection=z.object({projection_id:Id,actor_id:Ref,kind:z.string(),entity_id:Id,version:Id,
  payload_json:z.unknown(),payload_sha256:z.string().regex(/^[a-f0-9]{64}$/),sources_json:Sources,
  reviewed_by:Ref,reviewed_at:z.unknown(),as_of:z.unknown(),starts_at:z.unknown(),expires_at:z.unknown()});
export type ApprovedOwnerProjection=z.infer<typeof Projection>;
export type ApprovedOwnerRead={rows:ApprovedOwnerProjection[];consentVersion:string;fingerprint:string};
type ReadQuery={actorId:string;kind:ApprovedProjectionKind;entityId?:string;asOf:string};

/** Shared actual SQL reader for catalog and academic loader. There is no writer,
 * default authority, approval creation, intake fallback or operational launcher. */
export class PostgresApprovedOwnerReader {
  constructor(private readonly pool:ReviewerSqlPool,private readonly authority:OwnerCatalogAuthority,
    private readonly clock:()=>string=()=>new Date().toISOString()){}
  async read(query:ReadQuery,now:string,extra?:(connection:ReviewerSqlConnection)=>Promise<unknown>):
    Promise<(ApprovedOwnerRead&{extra?:unknown})|null>{
    Ref.parse(query.actorId);Utc.parse(query.asOf);Utc.parse(now);const clock=timestamp(this.clock());
    if(Date.parse(query.asOf)>Math.min(Date.parse(now),Date.parse(clock)))return null;
    const grants=await this.authority.resolve({actorId:query.actorId,now});
    if(!grants||!grants.permissionRefs.size)return null;
    const policy=policyFingerprint(grants),c=await this.pool.connect();
    let open=false,result:(ApprovedOwnerRead&{extra?:unknown})|null=null;
    try{
      await c.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');open=true;
      await c.query("SET LOCAL statement_timeout='5s'");
      await c.query("SELECT set_config('hufs.self_actor',$1,true)",[query.actorId]);
      const consent=await c.query(`SELECT version,choices_json,updated_at FROM api_self_consents
        WHERE actor_id=$1 AND choices_json->>'personalStorage'='true'
        AND updated_at<=LEAST($2::timestamptz,$3::timestamptz,clock_timestamp())`,[query.actorId,now,clock]);
      if(consent.rows.length!==1||consent.rows[0]?.choices_json===null
        ||typeof consent.rows[0]?.choices_json!=='object'
        ||(consent.rows[0]?.choices_json as Record<string,unknown>).personalStorage!==true){
        await c.query('COMMIT');open=false;return null;
      }
      const consentVersion=String(consent.rows[0]!.version);
      const loaded=await c.query(`SELECT p.* FROM api_owner_approved_projections p
        JOIN api_owner_approved_heads h USING(actor_id,kind,entity_id,projection_id)
        WHERE p.actor_id=$1 AND p.kind=$2 AND ($3::text IS NULL OR p.entity_id=$3)
        AND p.reviewed_by<>p.actor_id AND p.reviewed_at<=p.as_of AND p.as_of<=$4::timestamptz
        AND p.starts_at<=LEAST($5::timestamptz,$6::timestamptz,clock_timestamp())
        AND p.expires_at>GREATEST($5::timestamptz,$6::timestamptz,clock_timestamp())
        AND NOT EXISTS(SELECT 1 FROM api_owner_projection_revocations x WHERE x.projection_id=p.projection_id)
        ORDER BY p.entity_id COLLATE "C" LIMIT 501`,
      [query.actorId,query.kind,query.entityId??null,query.asOf,now,clock]);
      if(loaded.rows.length>500)throw new Error('Approved owner catalog exceeds read bound');
      const rows=loaded.rows.map(row=>Projection.parse(row));
      const sourceProofs:unknown[]=[];
      for(const p of rows){
        if(p.actor_id!==query.actorId||p.kind!==query.kind||p.reviewed_by===p.actor_id
          ||query.entityId!==undefined&&p.entity_id!==query.entityId
          ||canonicalProjectionHash(p.payload_json)!==p.payload_sha256)
          throw new Error('Approved owner projection binding failed');
        for(const instant of [p.reviewed_at,p.as_of])
          if(Date.parse(timestamp(instant))>Date.parse(query.asOf))return await this.deny(c,()=>{open=false;});
        if(Date.parse(timestamp(p.starts_at))>Math.min(Date.parse(now),Date.parse(clock))
          ||Date.parse(timestamp(p.expires_at))<=Math.max(Date.parse(now),Date.parse(clock)))
          return await this.deny(c,()=>{open=false;});
        for(const ref of p.sources_json){
          if(!grants.permissionRefs.has(ref.permissionRef)||grants.sourceIds&&!grants.sourceIds.has(ref.sourceId))
            return await this.deny(c,()=>{open=false;});
          const proof=await c.query(`SELECT s.*,o.original_sha256 AS stored_original_sha256,
            a.original_sha256 AS review_original_sha256,a.content_sha256 AS review_content_sha256,
            a.decision AS review_decision,a.checked_at AS review_checked_at,a.reviewer_id
            FROM source_effective_revisions_vnext s
            JOIN source_ingest_heads h ON h.source_id=s.source_id AND h.revision_id=s.revision_id
            JOIN source_originals_vnext o ON o.revision_id=s.revision_id
            JOIN source_review_attestations_vnext a ON a.revision_id=s.revision_id
            WHERE s.source_id=$1 AND s.revision_id=$2 AND s.permission_ref=$3
            AND EXISTS(SELECT 1 FROM source_rights_receipts g
              WHERE g.actor_id=$4 AND g.source_id=s.source_id AND g.permission_ref=s.permission_ref
              AND 'SEARCH'=ANY(g.purposes) AND g.reviewed_by<>g.actor_id
              AND g.reviewed_at<=LEAST($5::timestamptz,$6::timestamptz,clock_timestamp())
              AND g.starts_at<=LEAST($5::timestamptz,$6::timestamptz,clock_timestamp())
              AND g.expires_at>GREATEST($5::timestamptz,$6::timestamptz,clock_timestamp())
              AND NOT EXISTS(SELECT 1 FROM source_rights_revocations x WHERE x.receipt_id=g.receipt_id))`,
          [ref.sourceId,ref.revisionId,ref.permissionRef,query.actorId,now,clock]);
          const s=proof.rows[0];
          if(proof.rows.length!==1||!s||s.revision_id!==ref.revisionId||s.source_id!==ref.sourceId
            ||s.permission_ref!==ref.permissionRef||s.status!=='ACTIVE'||s.change_kind==='CANCELLED'
            ||s.source_class==='RESEARCH_REFERENCE_ONLY'||s.provenance==='RESEARCH_ONLY'
            ||s.review_decision!=='APPROVED'||s.reviewer_id===query.actorId
            ||s.original_sha256!==s.stored_original_sha256||s.original_sha256!==s.review_original_sha256
            ||s.content_sha256!==s.review_content_sha256||!s.last_verified_at
            ||[s.fetched_at,s.last_verified_at,s.review_checked_at].some(at=>Date.parse(timestamp(at))>Date.parse(query.asOf))
            ||s.valid_from&&Date.parse(timestamp(s.valid_from))>Date.parse(query.asOf)
            ||s.valid_until&&Date.parse(timestamp(s.valid_until))<=Date.parse(query.asOf)
            ||!matchesEvidenceScope(this.scope(s),grants))return await this.deny(c,()=>{open=false;});
          sourceProofs.push(s);
        }
      }
      const extraValue=extra?await extra(c):undefined;
      const fingerprint=canonicalProjectionHash({query,consentVersion,policy,rows,sourceProofs,
        ...(extraValue===undefined?{}:{extra:extraValue})});
      result={rows,consentVersion,fingerprint,...(extraValue===undefined?{}:{extra:extraValue})};
      await c.query('COMMIT');open=false;
    }finally{if(open)try{await c.query('ROLLBACK');}catch{/* deny failed read */}c.release();}
    const after=await this.authority.resolve({actorId:query.actorId,now:timestamp(this.clock())});
    return after&&policyFingerprint(after)===policy?result:null;
  }
  private async deny(c:ReviewerSqlConnection,done:()=>void):Promise<null>{
    await c.query('COMMIT');done();return null;
  }
  private scope(s:Record<string,unknown>):EvidenceScope{
    const result:Record<string,unknown>={};
    for(const [column,field] of [['scope_campuses','campuses'],['scope_majors','majorCodes'],
      ['scope_colleges','colleges'],['scope_major_roles','majorRoles'],['scope_admission_types','admissionTypes'],
      ['scope_enrollment_states','enrollmentStates'],['scope_graduation_terms','graduationTermScope'],
      ['cohort_min','cohortMin'],['cohort_max','cohortMax']]){
      const value=s[column!];if(value!==null&&value!==undefined)result[field!]=value;
    }
    return result as EvidenceScope;
  }
}

type Receipt={query:ReadQuery;fingerprint:string;expires:number};
/** SELECT-only implementation of the existing owner HTTP catalog. */
export class PostgresTrustedOwnerCatalog implements TrustedCatalogPort {
  readonly reader:PostgresApprovedOwnerReader;
  private readonly receipts=new Map<string,Receipt>();
  constructor(pool:ReviewerSqlPool,authority:OwnerCatalogAuthority,
    private readonly clock:()=>string=()=>new Date().toISOString()){
    this.reader=new PostgresApprovedOwnerReader(pool,authority,clock);
  }
  private receipt(query:ReadQuery,fingerprint:string):string{
    const now=Date.parse(this.clock());
    for(const [key,value] of this.receipts)if(value.expires<=now)this.receipts.delete(key);
    if(this.receipts.size>=2048)throw new Error('Owner read receipt capacity exceeded');
    const token=randomBytes(32).toString('hex');
    this.receipts.set(token,{query,fingerprint,expires:now+60_000});return token;
  }
  private bindSource(p:ApprovedOwnerProjection,item:{source:{sourceId:string;revisionId:string;permissionRef:string}}){
    if(!p.sources_json.some(ref=>ref.sourceId===item.source.sourceId
      &&ref.revisionId===item.source.revisionId&&ref.permissionRef===item.source.permissionRef))
      throw new Error('Catalog payload source is outside its reviewed manifest');
  }
  async readTranscript(input:{actorId:string;now:string}){
    const query:ReadQuery={actorId:input.actorId,kind:'TRANSCRIPT',entityId:'CURRENT',asOf:input.now};
    const read=await this.reader.read(query,input.now);if(!read||read.rows.length!==1)return null;
    const p=read.rows[0]!,result=OwnerTranscriptSchema.parse(p.payload_json);
    if(!p.sources_json.some(ref=>ref.revisionId===result.sourceRevisionId)
      ||Date.parse(result.reviewedAt)>Date.parse(result.asOf)||Date.parse(result.asOf)>Date.parse(input.now))
      throw new Error('Transcript is outside its reviewed source');
    return {result,scopeToken:this.receipt(query,read.fingerprint)};
  }
  private async page<T extends {source:{sourceId:string;revisionId:string;permissionRef:string}}>(
    kind:'COURSE'|'OFFERING'|'OPPORTUNITY',input:CatalogRequest,parse:(raw:unknown)=>T,
    id:(item:T)=>string,text:(item:T)=>string,include:(item:T)=>boolean=()=>true,
  ){
    if(!Number.isSafeInteger(input.limit)||input.limit<1||input.limit>50)throw new Error('Invalid catalog limit');
    const query:ReadQuery={actorId:input.actorId,kind,asOf:input.asOf};
    const read=await this.reader.read(query,input.now);if(!read)return null;
    const all=read.rows.map(p=>{const item=parse(p.payload_json);this.bindSource(p,item);return item;});
    const filtered=all.filter(item=>include(item)&&(!input.afterId||id(item)>input.afterId)
      &&(!input.q||text(item).toLocaleLowerCase('ko-KR').includes(input.q.toLocaleLowerCase('ko-KR'))))
      .sort((a,b)=>id(a)<id(b)?-1:id(a)>id(b)?1:0);
    if(new Set(filtered.map(id)).size!==filtered.length)throw new Error('Ambiguous approved catalog entities');
    const items=filtered.slice(0,input.limit),last=items[items.length-1];
    return {result:{asOf:input.asOf,items,nextCursor:filtered.length>items.length&&last?id(last):null},
      scopeToken:this.receipt(query,read.fingerprint)};
  }
  async listCourses(input:CatalogRequest){
    const value=await this.page('COURSE',input,x=>CatalogCourseSchema.parse(x),x=>x.courseId,x=>x.title+' '+x.courseCode);
    return value?{...value,result:CourseCatalogPageSchema.parse(value.result)}:null;
  }
  async listOfferings(input:CatalogRequest&{courseId:string}){
    const value=await this.page('OFFERING',input,x=>CourseOfferingSchema.parse(x),x=>x.term,x=>x.courseId,
      x=>x.courseId===input.courseId);
    return value?{...value,result:CourseOfferingsPageSchema.parse(value.result)}:null;
  }
  async listOpportunities(input:CatalogRequest){
    const value=await this.page('OPPORTUNITY',input,x=>OpportunityCatalogDetailSchema.parse(x),
      x=>x.opportunity.id,x=>x.opportunity.title);
    return value?{...value,result:OpportunityCatalogPageSchema.parse(value.result)}:null;
  }
  async getOpportunity(input:{actorId:string;now:string;id:string}){
    const query:ReadQuery={actorId:input.actorId,kind:'OPPORTUNITY',entityId:input.id,asOf:input.now};
    const read=await this.reader.read(query,input.now);if(!read||read.rows.length!==1)return null;
    const p=read.rows[0]!,result=OpportunityCatalogDetailSchema.parse(p.payload_json);this.bindSource(p,result);
    if(result.opportunity.id!==input.id)throw new Error('Catalog opportunity binding mismatch');
    return {result,scopeToken:this.receipt(query,read.fingerprint)};
  }
  async revalidate(input:{actorId:string;scopeToken:string;now:string}):Promise<boolean>{
    const receipt=this.receipts.get(input.scopeToken);
    if(!receipt||receipt.query.actorId!==input.actorId||receipt.expires<=Date.parse(this.clock()))return false;
    try{const current=await this.reader.read(receipt.query,input.now);
      return current?.fingerprint===receipt.fingerprint;}catch{return false;}
  }
}
