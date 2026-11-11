import {createHash,randomBytes} from 'node:crypto';
import {OwnerReceipts} from '../auth/owner-receipts.js';
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
export type ApprovedProjectionKind='TRANSCRIPT'|'COURSE'|'OFFERING'|'OPPORTUNITY'|'PLAN_INPUT'|'V2_CATALOG';
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
    // pg parses timestamptz into Date, including independently reviewed SQL
    // metadata. Canonicalize a valid instant without trusting locale/timezone.
    if(v instanceof Date){
      if(!Number.isFinite(v.getTime()))throw new Error('Invalid PostgreSQL timestamp');
      return v.toISOString();
    }
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
export type ApprovedOwnerRead={rows:ApprovedOwnerProjection[];consentVersion:string;fingerprint:string;validUntil:string;hasMore?:boolean};
type ReadQuery={actorId:string;kind:ApprovedProjectionKind;entityId?:string;asOf:string;
  page?:{afterEntityId?:string;pageSize:number}};
/** Only withV2KeysetSnapshot creates this scope. No second pooled connection or
 * transaction can be opened by read() while the MVCC scan holds its client. */
type ScopedV2Read={connection:ReviewerSqlConnection;grants:CurrentEvidenceGrants};
export type ApprovedOwnerKeysetPage={
  rows:ApprovedOwnerProjection[];consentVersion:string;fingerprint:string;
  validUntil:string;hasMore:boolean;nextAfterEntityId:string|null;
  /** Verified in the same read-only transaction and fingerprint as each page. */
  extra?:unknown;
};

/** Shared actual SQL reader for catalog and academic loader. There is no writer,
 * default authority, approval creation, intake fallback or operational launcher. */
export class PostgresApprovedOwnerReader {
  constructor(private readonly pool:ReviewerSqlPool,private readonly authority:OwnerCatalogAuthority,
    private readonly clock:()=>string=()=>new Date().toISOString()){}
  async read(query:ReadQuery,now:string,extra?:(connection:ReviewerSqlConnection,
    projections:readonly ApprovedOwnerProjection[])=>Promise<unknown>,
    scoped?:ScopedV2Read):
    Promise<(ApprovedOwnerRead&{extra?:unknown})|null>{
    Ref.parse(query.actorId);Utc.parse(query.asOf);Utc.parse(now);
    if(query.page&&(query.kind!=='V2_CATALOG'||query.entityId!==undefined
      ||!Number.isSafeInteger(query.page.pageSize)||query.page.pageSize<1
      ||query.page.pageSize>50
      ||query.page.afterEntityId!==undefined&&!Id.safeParse(query.page.afterEntityId).success))
      throw new Error('Invalid approved owner keyset scope');
    const clock=timestamp(this.clock());
    if(Date.parse(query.asOf)>Math.min(Date.parse(now),Date.parse(clock)))return null;
    const grants=scoped?.grants??await this.authority.resolve({actorId:query.actorId,now});
    if(!grants||!grants.permissionRefs.size)return null;
    const policy=policyFingerprint(grants);
    const c=scoped?.connection??await this.pool.connect();
    let open=false,result:(ApprovedOwnerRead&{extra?:unknown})|null=null;
    try{
      if(!scoped){
        await c.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');open=true;
        await c.query("SET LOCAL statement_timeout='5s'");
      }
      // A scoped scan already opened a READ ONLY REPEATABLE READ transaction on
      // THIS client. Never allocate or commit another client/transaction here.
      await c.query("SELECT set_config('hufs.self_actor',$1,true)",[query.actorId]);
      const consent=await c.query(`SELECT version,choices_json,updated_at FROM api_self_consents
        WHERE actor_id=$1 AND choices_json->>'personalStorage'='true'
        AND updated_at<=LEAST($2::timestamptz,$3::timestamptz,clock_timestamp())`,[query.actorId,now,clock]);
      if(consent.rows.length!==1||consent.rows[0]?.choices_json===null
        ||typeof consent.rows[0]?.choices_json!=='object'
        ||(consent.rows[0]?.choices_json as Record<string,unknown>).personalStorage!==true){
        if(!scoped){await c.query('COMMIT');open=false;}
        return null;
      }
      const consentVersion=String(consent.rows[0]!.version);
      const loaded=await c.query(`SELECT p.* FROM api_owner_approved_projections p
        JOIN api_owner_approved_heads h USING(actor_id,kind,entity_id,projection_id)
        WHERE p.actor_id=$1 AND p.kind=$2 AND ($3::text IS NULL OR p.entity_id=$3)
        AND p.reviewed_by<>p.actor_id AND p.reviewed_at<=p.as_of AND p.as_of<=$4::timestamptz
        AND p.starts_at<=LEAST($5::timestamptz,$6::timestamptz,clock_timestamp())
        AND p.expires_at>GREATEST($5::timestamptz,$6::timestamptz,clock_timestamp())
        AND NOT EXISTS(SELECT 1 FROM api_owner_projection_revocations x WHERE x.projection_id=p.projection_id)
        AND ($7::text IS NULL OR p.entity_id COLLATE "C" > $7::text COLLATE "C")
        ORDER BY p.entity_id COLLATE "C" LIMIT $8::int`,
      [query.actorId,query.kind,query.entityId??null,query.asOf,now,clock,
        query.page?.afterEntityId??null,query.page?query.page.pageSize+1:501]);
      if(loaded.rows.length>500&&!query.page)
        throw new Error('Approved owner catalog exceeds read bound');
      const rows=loaded.rows.map(row=>Projection.parse(row));
      let validUntil='9999-12-31T23:59:59.999Z';
      const bound=(until:unknown)=>{
        const end=timestamp(until);
        if(Date.parse(end)<Date.parse(validUntil))validUntil=end;
      };
      // Validate actor and permissions before fetching any approved source proof.
      // The same data-integrity and temporal checks also run on the return path.
      const refKey=(r:{sourceId:string;revisionId:string;permissionRef:string})=>
        JSON.stringify([r.sourceId,r.revisionId,r.permissionRef]);
      const distinctRefs=new Map<string,{sourceId:string;revisionId:string;permissionRef:string}>();
      for(const projection of rows){
        if(projection.actor_id!==query.actorId||projection.kind!==query.kind
          ||projection.reviewed_by===projection.actor_id
          ||query.entityId!==undefined&&projection.entity_id!==query.entityId
          ||canonicalProjectionHash(projection.payload_json)!==projection.payload_sha256)
          throw new Error('Approved owner projection binding failed');
        for(const ref of projection.sources_json){
          if(!grants.permissionRefs.has(ref.permissionRef)
            ||grants.sourceIds&&!grants.sourceIds.has(ref.sourceId))
            return await this.deny(c,()=>{open=false;},!!scoped);
          distinctRefs.set(refKey(ref),ref);
        }
      }
      const proofsByKey=new Map<string,Record<string,unknown>>();
      if(distinctRefs.size){
        const proofBatch=await c.query(`SELECT s.*,rights.rights_expires_at,
          o.original_sha256 AS stored_original_sha256,
          a.original_sha256 AS review_original_sha256,a.content_sha256 AS review_content_sha256,
          a.decision AS review_decision,a.checked_at AS review_checked_at,a.reviewer_id
          FROM jsonb_to_recordset($1::jsonb) AS r(source_id text,revision_id text,permission_ref text)
          JOIN source_effective_revisions_vnext s
            ON s.source_id=r.source_id AND s.revision_id=r.revision_id AND s.permission_ref=r.permission_ref
          JOIN source_ingest_heads h ON h.source_id=s.source_id AND h.revision_id=s.revision_id
          JOIN source_originals_vnext o ON o.revision_id=s.revision_id
          JOIN source_review_attestations_vnext a ON a.revision_id=s.revision_id
          JOIN LATERAL(SELECT min(g.expires_at) AS rights_expires_at FROM source_rights_receipts g
            WHERE g.actor_id=$2 AND g.source_id=s.source_id AND g.permission_ref=s.permission_ref
            AND 'SEARCH'=ANY(g.purposes) AND g.reviewed_by<>g.actor_id
            AND g.reviewed_at<=LEAST($3::timestamptz,$4::timestamptz,clock_timestamp())
            AND g.starts_at<=LEAST($3::timestamptz,$4::timestamptz,clock_timestamp())
            AND g.expires_at>GREATEST($3::timestamptz,$4::timestamptz,clock_timestamp())
            AND NOT EXISTS(SELECT 1 FROM source_rights_revocations x WHERE x.receipt_id=g.receipt_id)) rights
            ON rights.rights_expires_at IS NOT NULL`,
        [JSON.stringify([...distinctRefs.values()].map(ref=>({source_id:ref.sourceId,
          revision_id:ref.revisionId,permission_ref:ref.permissionRef}))),query.actorId,now,clock]);
        // Missing (including RLS/withdrawn rights), extra or duplicate proofs deny
        // the ENTIRE response. We never return a partially authorized catalog.
        for(const raw of proofBatch.rows){
          const candidate=raw as Record<string,unknown>;
          const key=JSON.stringify([candidate.source_id,candidate.revision_id,candidate.permission_ref]);
          if(!distinctRefs.has(key)||proofsByKey.has(key))return await this.deny(c,()=>{open=false;},!!scoped);
          proofsByKey.set(key,candidate);
        }
        if(proofsByKey.size!==distinctRefs.size)return await this.deny(c,()=>{open=false;},!!scoped);
      }
      for(const p of rows){
        bound(p.expires_at);
        if(p.actor_id!==query.actorId||p.kind!==query.kind||p.reviewed_by===p.actor_id
          ||query.entityId!==undefined&&p.entity_id!==query.entityId
          ||canonicalProjectionHash(p.payload_json)!==p.payload_sha256)
          throw new Error('Approved owner projection binding failed');
        for(const instant of [p.reviewed_at,p.as_of])
          if(Date.parse(timestamp(instant))>Date.parse(query.asOf))return await this.deny(c,()=>{open=false;},!!scoped);
        if(Date.parse(timestamp(p.starts_at))>Math.min(Date.parse(now),Date.parse(clock))
          ||Date.parse(timestamp(p.expires_at))<=Math.max(Date.parse(now),Date.parse(clock)))
          return await this.deny(c,()=>{open=false;},!!scoped);
        for(const ref of p.sources_json){
          if(!grants.permissionRefs.has(ref.permissionRef)||grants.sourceIds&&!grants.sourceIds.has(ref.sourceId))
            return await this.deny(c,()=>{open=false;},!!scoped);
          const s=proofsByKey.get(refKey(ref));
          if(!s||s.revision_id!==ref.revisionId||s.source_id!==ref.sourceId
            ||s.permission_ref!==ref.permissionRef||s.status!=='ACTIVE'||s.change_kind==='CANCELLED'
            ||s.source_class==='RESEARCH_REFERENCE_ONLY'||s.provenance==='RESEARCH_ONLY'
            ||s.review_decision!=='APPROVED'||s.reviewer_id===query.actorId
            ||s.original_sha256!==s.stored_original_sha256||s.original_sha256!==s.review_original_sha256
            ||s.content_sha256!==s.review_content_sha256||!s.last_verified_at
            ||[s.fetched_at,s.last_verified_at,s.review_checked_at].some(at=>Date.parse(timestamp(at))>Date.parse(query.asOf))
            ||s.valid_from&&Date.parse(timestamp(s.valid_from))>Date.parse(query.asOf)
            ||s.valid_until&&Date.parse(timestamp(s.valid_until))<=Date.parse(query.asOf)
            ||!matchesEvidenceScope(this.scope(s),grants))return await this.deny(c,()=>{open=false;},!!scoped);
          bound(s.rights_expires_at);
        }
      }
      // Bind the *distinct* validated proofs in deterministic source-key order.
      // Every projection's full sources_json and its order/multiplicity remain in
      // 'rows' below; expanding identical SQL rows 50,000 times in the receipt
      // adds no additional authorization and amplifies CPU/heap usage.
      const sourceProofs=[...proofsByKey].sort(([left],[right])=>
        left<right?-1:left>right?1:0).map(([,proof])=>proof);
      const extraValue=extra?await extra(c,rows):undefined;
      const fingerprint=canonicalProjectionHash({query,consentVersion,policy,rows,sourceProofs,
        ...(extraValue===undefined?{}:{extra:extraValue})});
      // Validate the lookahead row and its rights as rigorously as displayed
      // rows; otherwise hasMore would disclose an unauthorized record.
      const hasMore=query.page?rows.length>query.page.pageSize:undefined;
      const exposed=query.page?rows.slice(0,query.page.pageSize):rows;
      result={rows:exposed,consentVersion,fingerprint,validUntil,
        ...(hasMore===undefined?{}:{hasMore}),
        ...(extraValue===undefined?{}:{extra:extraValue})};
      if(!scoped){await c.query('COMMIT');open=false;}
    }finally{
      if(!scoped){
        if(open)try{await c.query('ROLLBACK');}catch{/* deny failed read */}
        c.release();
      }
    }
    const completed=timestamp(this.clock());
    if(!result||Date.parse(completed)<Date.parse(clock)
      ||Date.parse(completed)>=Date.parse(result.validUntil))return null;
    // The outer scope checks current authority AFTER releasing the sole SQL
    // client. Checking from here could require a second connection from the
    // same pool and recreate starvation under concurrent scans.
    if(scoped)return result;
    const after=await this.authority.resolve({actorId:query.actorId,now:completed});
    return after&&policyFingerprint(after)===policy?result:null;
  }
  /**
   * True PostgreSQL entity_id keyset scan for V2_CATALOG projections. Every
   * returned row + lookahead goes through the SAME independent source/rights,
   * consent, hash, HEAD and revocation proofs as the bounded legacy read.
   * A page fingerprint is NOT a stable whole-catalog revision: the HTTP layer
   * must not expose it as a cross-page signed cursor without a separately
   * pinned global revision/consistency design.
   */
  async readV2KeysetPage(input:{actorId:string;asOf:string;pageSize:number;
    afterEntityId?:string},now:string,
    extra?:(connection:ReviewerSqlConnection,
      projections:readonly ApprovedOwnerProjection[])=>Promise<unknown>,
    scoped?:ScopedV2Read,
  ):Promise<ApprovedOwnerKeysetPage|null>{
    const result=await this.read({
      actorId:input.actorId,kind:'V2_CATALOG',asOf:input.asOf,
      page:{pageSize:input.pageSize,
        ...(input.afterEntityId===undefined?{}:{afterEntityId:input.afterEntityId})},
    },now,extra,scoped);
    if(!result)return null;
    const last=result.rows.at(-1)?.entity_id??null;
    if(result.hasMore&&!last)throw new Error('Invalid verified page lookahead');
    return {rows:result.rows,consentVersion:result.consentVersion,
      fingerprint:result.fingerprint,validUntil:result.validUntil,
      hasMore:result.hasMore===true,nextAfterEntityId:result.hasMore?last:null,
      ...(result.extra===undefined?{}:{extra:result.extra})};
  }
  /**
   * #447 / #472 bounded, pinned read. One PostgreSQL client and one READ ONLY
   * REPEATABLE READ transaction serve ALL keyset pages. A second exporter and
   * importer client would exhaust a small pool with five concurrent scans.
   *
   * Authority is checked before opening the SQL client and again ONLY after
   * closing it; each page still checks actor, consent, independent RLS/source
   * rights, proofs, hashes and TTL inside the pinned SQL view. A source/rights
   * change during the scan is caught by the subsequent fresh response-check
   * scan, and a policy change by the post-release authority check.
   */
  async withV2KeysetSnapshot<T>(
    input:{actorId:string;asOf:string},now:string,
    consume:(readPage:(
      page:{pageSize:number;afterEntityId?:string},
      extra?:(connection:ReviewerSqlConnection,
        projections:readonly ApprovedOwnerProjection[])=>Promise<unknown>,
    )=>Promise<ApprovedOwnerKeysetPage|null>)=>Promise<T>,
  ):Promise<T>{
    Ref.parse(input.actorId);Utc.parse(input.asOf);Utc.parse(now);
    const grants=await this.authority.resolve({actorId:input.actorId,now});
    if(!grants||!grants.permissionRefs.size)
      throw new Error('V2 keyset actor authority unavailable');
    const policy=policyFingerprint(grants);
    const connection=await this.pool.connect();
    let opened=false;
    let value!:T;
    try{
      await connection.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      opened=true;
      await connection.query("SET LOCAL statement_timeout='5s'");
      // No exporter remains idle waiting on another pooled client. Still guard
      // against a stalled callback holding the pinned MVCC transaction open.
      await connection.query("SET LOCAL idle_in_transaction_session_timeout='30s'");
      const scoped:ScopedV2Read={connection,grants};
      value=await consume((page,extra)=>this.readV2KeysetPage({
        actorId:input.actorId,asOf:input.asOf,pageSize:page.pageSize,
        ...(page.afterEntityId===undefined?{}:{afterEntityId:page.afterEntityId}),
      },now,extra,scoped));
    }finally{
      if(opened)try{await connection.query('ROLLBACK');}catch{/* do not reuse failed transaction */}
      connection.release();
    }
    const completed=timestamp(this.clock());
    const after=await this.authority.resolve({actorId:input.actorId,now:completed});
    if(!after||policyFingerprint(after)!==policy)
      throw new Error('V2 keyset authorization changed during pinned scan');
    return value;
  }
  private async deny(c:ReviewerSqlConnection,done:()=>void,scoped=false):Promise<null>{
    if(!scoped){await c.query('COMMIT');done();}
    return null; // the enclosing read-only transaction will be rolled back
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
  private readonly receipts=new OwnerReceipts<Receipt>(value=>value.query.actorId);
  constructor(pool:ReviewerSqlPool,authority:OwnerCatalogAuthority,
    private readonly clock:()=>string=()=>new Date().toISOString()){
    this.reader=new PostgresApprovedOwnerReader(pool,authority,clock);
  }
  private receipt(query:ReadQuery,fingerprint:string,validUntil:string):string{
    const now=Date.parse(this.clock());
    if(!Number.isFinite(now))throw new Error('Owner receipt clock unavailable');
    for(const [key,value] of this.receipts)if(value.expires<=now)this.receipts.delete(key);
    // Per-owner admission preserves other actors' live in-flight receipts.
    const token=randomBytes(32).toString('hex');
    const expires=Math.min(now+60_000,Date.parse(validUntil));
    if(expires<=now)throw new Error('Approved catalog authorization expired');
    this.receipts.set(token,{query,fingerprint,expires});return token;
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
    return {result,scopeToken:this.receipt(query,read.fingerprint,read.validUntil)};
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
      scopeToken:this.receipt(query,read.fingerprint,read.validUntil)};
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
    return {result,scopeToken:this.receipt(query,read.fingerprint,read.validUntil)};
  }
  async revalidate(input:{actorId:string;scopeToken:string;now:string}):Promise<boolean>{
    const receipt=this.receipts.get(input.scopeToken);
    this.receipts.delete(input.scopeToken); // fail-closed, even cross-actor or replay
    const now=Date.parse(this.clock());
    if(!receipt||!Number.isFinite(now)||receipt.query.actorId!==input.actorId
      ||receipt.expires<=now)return false;
    try{const current=await this.reader.read(receipt.query,input.now);
      const completed=Date.parse(timestamp(this.clock()));
      return current?.fingerprint===receipt.fingerprint&&completed>=now
        &&completed<receipt.expires&&completed<Date.parse(current.validUntil);}catch{return false;}
  }
}
