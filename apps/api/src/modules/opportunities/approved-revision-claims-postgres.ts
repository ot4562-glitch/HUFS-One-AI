import {randomBytes} from 'node:crypto';
import {z} from 'zod';
import {OpportunityRevisionComparisonClaimSchema,SourceSpanVNextSchema,matchesTextSpan,
  matchesImageSpan,matchesEvidenceScope} from '@hufs-one/contracts';
import type {EvidenceScope,SourceSpanVNext} from '@hufs-one/contracts';
import type {ReviewerSqlPool,ReviewerSqlConnection} from '../auth/reviewer-postgres.js';
import {canonicalProjectionHash} from './owner-catalog-postgres.js';
import type {OwnerCatalogAuthority} from './owner-catalog-postgres.js';
import {policyFingerprint} from './temporal-gateway.js';
import type {TrustedOpportunityRevisionComparisonSource,TrustedOpportunityRevisionComparisonRights,
  TrustedOpportunityRevisionMetadata} from './opportunity-revision-comparison.js';

const Id=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/),Actor=z.string().regex(/^[A-Za-z0-9_.:@-]{1,200}$/);
const Sha=z.string().regex(/^[a-f0-9]{64}$/);
const Time=z.preprocess(v=>v instanceof Date?v.toISOString():v,z.iso.datetime({offset:true}));
const Scope=z.strictObject({actorId:Actor,opportunityId:Id,beforeRevisionId:Id,afterRevisionId:Id,asOf:Time});
type Scope=z.infer<typeof Scope>;
const Payload=z.strictObject({claims:z.array(OpportunityRevisionComparisonClaimSchema).min(1).max(3),
  evidence:z.array(z.strictObject({evidenceRef:Id,span:SourceSpanVNextSchema})).min(1).max(90)});
const Approval=z.object({approval_id:Id,actor_id:Actor,opportunity_id:Id,revision_id:Id,source_id:Id,
  permission_ref:Id,content_sha256:Sha,payload_json:Payload,payload_sha256:Sha,reviewed_by:Actor,
  reviewed_at:Time,starts_at:Time,expires_at:Time,consent_version:z.string().min(1).max(128),revoked_at:Time.nullable()});
const Revision=z.object({revision_id:Id,source_id:Id,permission_ref:Id,supersedes:Id.nullable(),
  status:z.enum(['ACTIVE','NEEDS_REVIEW','STALE','RETRACTED','BLOCKED_RIGHTS']),
  change_kind:z.enum(['NEW','CORRECTED','EXTENDED','CANCELLED','UNKNOWN']),
  source_class:z.enum(['SYNTHETIC','LICENSED_EXTERNAL','PERSONAL_CONSENTED','RESEARCH_REFERENCE_ONLY']),
  provenance:z.enum(['SYNTHETIC','REAL_APPROVED','RESEARCH_ONLY']),media_kind:z.enum(['TEXT','HTML','IMAGE','PDF']),
  original_sha256:Sha,content_sha256:Sha,fetched_at:Time,last_checked_at:Time,last_verified_at:Time.nullable(),
  published_at:Time.nullable(),valid_from:Time.nullable(),valid_until:Time.nullable(),
  stored_original_sha256:Sha.nullable(),review_original_sha256:Sha.nullable(),review_content_sha256:Sha.nullable(),
  review_decision:z.enum(['APPROVED','REJECTED']).nullable(),reviewer_id:Actor.nullable(),review_checked_at:Time.nullable(),
  scope_campuses:z.array(z.string()).nullable(),scope_majors:z.array(z.string()).nullable(),scope_colleges:z.array(z.string()).nullable(),
  scope_major_roles:z.array(z.enum(['PRIMARY','DOUBLE','MINOR'])).nullable(),scope_admission_types:z.array(z.string()).nullable(),
  scope_enrollment_states:z.array(z.string()).nullable(),scope_graduation_terms:z.array(z.string()).nullable(),
  cohort_min:z.number().int().nullable(),cohort_max:z.number().int().nullable()});
const Rights=z.object({receipt_id:Id,actor_id:Actor,source_id:Id,permission_ref:Id,purposes:z.array(z.string()).max(4),
  reviewed_by:Actor,reviewed_at:Time,starts_at:Time,expires_at:Time,revoked_at:Time.nullable()});
const Box=z.tuple([z.number().min(0).max(1),z.number().min(0).max(1),z.number().min(0).max(1),z.number().min(0).max(1)])
  .refine(b=>b[0]<b[2]&&b[1]<b[3]);
const ImagePayload=z.strictObject({assetId:Id,originalSha256:Sha,transformVersion:Id,
  pageCount:z.number().int().min(1).max(100),width:z.number().int().min(1).max(100000),height:z.number().int().min(1).max(100000),
  ocrLines:z.array(z.strictObject({id:Id,text:z.string().min(1).max(20000),pageIndex:z.number().int().min(0).max(99),bboxNorm:Box})).min(1).max(2000)});
const Image=z.object({evidence_id:Id,revision_id:Id,payload_json:ImagePayload,payload_sha256:Sha,
  reviewed_by:Actor,reviewed_at:Time,review_ref:Id,revoked_at:Time.nullable()});
const at=(value:unknown)=>Date.parse(Time.parse(value));
function fail():never{throw new Error('Approved revision claims unavailable');}
function scopeFor(r:z.infer<typeof Revision>):EvidenceScope{
  return {...(r.scope_campuses===null?{}:{campuses:r.scope_campuses}),
    ...(r.scope_majors===null?{}:{majorCodes:r.scope_majors}),...(r.scope_colleges===null?{}:{colleges:r.scope_colleges}),
    ...(r.scope_major_roles===null?{}:{majorRoles:r.scope_major_roles}),
    ...(r.scope_admission_types===null?{}:{admissionTypes:r.scope_admission_types}),
    ...(r.scope_enrollment_states===null?{}:{enrollmentStates:r.scope_enrollment_states}),
    ...(r.scope_graduation_terms===null?{}:{graduationTermScope:r.scope_graduation_terms}),
    ...(r.cohort_min===null?{}:{cohortMin:r.cohort_min}),...(r.cohort_max===null?{}:{cohortMax:r.cohort_max})};
}
type Pair={actorId:string;opportunityId:string;sourceId:string;asOf:string;currentRevisionId:string;
  before:TrustedOpportunityRevisionMetadata;after:TrustedOpportunityRevisionMetadata};
type Read={pair:Pair;fingerprint:string;validUntil:number};
type Ticket={scope:Scope;fingerprint:string;expires:number;sourceReceipt?:string};

/** SELECT-only ports for the existing comparison HTTP bridge. Private operator
 * attestations bind claims AND evidence; no extraction, provider candidate read,
 * approval writer, source fetching, URL generation or automatic activation.
 * Pass source/rights separately to registerOpportunityRevisionComparisonRoutes.
 */
export class PostgresApprovedRevisionClaims {
  readonly source:TrustedOpportunityRevisionComparisonSource;
  readonly rights:TrustedOpportunityRevisionComparisonRights;
  private readonly sources=new Map<string,Ticket>();
  private readonly disclosures=new Map<string,Ticket>();
  constructor(private readonly pool:ReviewerSqlPool,private readonly authority:OwnerCatalogAuthority,
    private readonly clock:()=>string=()=>new Date().toISOString()){
    this.source={inspect:async input=>{
      const scope=Scope.parse(this.pick(input)),read=await this.read(scope,input.now);
      if(!read)fail();return {...read.pair,receipt:this.ticket(this.sources,scope,read)};
    },revalidate:async input=>this.revalidate(this.sources,input,input.receipt)};
    this.rights={mayInspect:async input=>{
      const scope=Scope.parse(this.pick(input));return !!await this.preflight(scope,input.now);
    },authorize:async input=>{
      const scope=Scope.parse(this.pick(input)),ticket=this.sources.get(input.sourceReceipt);
      if(!this.bound(ticket,scope))return {allowed:false,rightsReceipt:''};
      const read=await this.read(scope,input.now);
      const expected=read?[read.pair.before,read.pair.after].map(r=>({...r,
        evidenceRefs:[...new Set(r.claims.flatMap(c=>c.evidenceRefs))].sort()})):null;
      if(!read||input.sourceId!==read.pair.sourceId||read.fingerprint!==ticket!.fingerprint
        ||canonicalProjectionHash(input.revisions)!==canonicalProjectionHash(expected))return {allowed:false,rightsReceipt:''};
      return {allowed:true,rightsReceipt:this.ticket(this.disclosures,scope,read,input.sourceReceipt)};
    },revalidate:async input=>this.revalidate(this.disclosures,input,input.rightsReceipt,input.sourceReceipt)};
  }
  private pick(input:Scope):Scope{
    return {actorId:input.actorId,opportunityId:input.opportunityId,beforeRevisionId:input.beforeRevisionId,
      afterRevisionId:input.afterRevisionId,asOf:input.asOf};
  }
  private ticket(store:Map<string,Ticket>,scope:Scope,read:Read,sourceReceipt?:string):string{
    const current=at(this.clock());for(const [key,t] of store)if(t.expires<=current)store.delete(key);
    while(store.size>=2048)store.delete(store.keys().next().value!);
    const key=randomBytes(32).toString('hex');store.set(key,{scope,fingerprint:read.fingerprint,
      expires:Math.min(current+60_000,read.validUntil),...(sourceReceipt?{sourceReceipt}:{})});return key;
  }
  private bound(ticket:Ticket|undefined,scope:Scope):boolean{
    return !!ticket&&ticket.expires>at(this.clock())&&canonicalProjectionHash(ticket.scope)===canonicalProjectionHash(scope);
  }
  private async revalidate(store:Map<string,Ticket>,input:Scope&{now:string},token:string,sourceReceipt?:string):Promise<boolean>{
    const ticket=store.get(token);store.delete(token);
    try{const scope=Scope.parse(this.pick(input));
      if(!this.bound(ticket,scope)||ticket?.sourceReceipt!==sourceReceipt)return false;
      const read=await this.read(scope,input.now);
      return !!read&&read.fingerprint===ticket!.fingerprint&&at(this.clock())<Math.min(ticket!.expires,read.validUntil);
    }catch{return false;}
  }
  private async preflight(scope:Scope,now:string){
    const current=Time.parse(this.clock());
    if(at(scope.asOf)>Math.min(at(now),at(current))||scope.beforeRevisionId===scope.afterRevisionId)return null;
    const grants=await this.authority.resolve({actorId:scope.actorId,now:current});
    if(!grants||!grants.permissionRefs.size)return null;
    const c=await this.pool.connect();
    try{
      await c.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await c.query("SET LOCAL statement_timeout='5s'");
      await c.query("SELECT set_config('hufs.self_actor',$1,true)",[scope.actorId]);
      const rows=await c.query(`SELECT version,choices_json,updated_at FROM api_self_consents WHERE actor_id=$1
        AND choices_json->>'personalStorage'='true' AND updated_at<=LEAST($2::timestamptz,clock_timestamp())`,[scope.actorId,current]);
      await c.query('COMMIT');
      const consent=rows.rows[0];
      if(rows.rows.length!==1||!consent||typeof consent.choices_json!=='object'||consent.choices_json===null
        ||(consent.choices_json as Record<string,unknown>).personalStorage!==true||at(consent.updated_at)>at(current))return null;
      return {grants,policy:policyFingerprint(grants),consentVersion:String(consent.version),consentUpdated:Time.parse(consent.updated_at),current};
    }catch{try{await c.query('ROLLBACK');}catch{/* no SQL leakage */}fail();}finally{c.release();}
  }
  private async read(scope:Scope,now:string):Promise<Read|null>{
    const allowed=await this.preflight(scope,now);if(!allowed)return null;
    const c=await this.pool.connect();let open=false;
    try{
      await c.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');open=true;
      await c.query("SET LOCAL statement_timeout='5s'");
      await c.query("SELECT set_config('hufs.self_actor',$1,true)",[scope.actorId]);
      const db=await c.query('SELECT clock_timestamp() AS database_now');
      const databaseNow=Time.parse(db.rows[0]?.database_now),earliest=Math.min(at(now),at(allowed.current),at(databaseNow)),latest=Math.max(at(now),at(allowed.current),at(databaseNow));
      if(at(scope.asOf)>earliest)return null;
      // Recheck consent within the same source/claim snapshot, closing the gap
      // between the preauthorization connection and this repeatable-read one.
      const cs=await c.query('SELECT version,choices_json,updated_at FROM api_self_consents WHERE actor_id=$1',[scope.actorId]);
      const consent=cs.rows[0];
      if(cs.rows.length!==1||String(consent?.version)!==allowed.consentVersion
        ||(consent?.choices_json as Record<string,unknown>|null)?.personalStorage!==true
        ||Time.parse(consent?.updated_at)!==allowed.consentUpdated)return null;
      const loaded=await c.query(`SELECT s.*,o.original_sha256 AS stored_original_sha256,
        a.original_sha256 AS review_original_sha256,a.content_sha256 AS review_content_sha256,
        a.decision AS review_decision,a.reviewer_id,a.checked_at AS review_checked_at
        FROM source_effective_revisions_vnext s
        LEFT JOIN source_originals_vnext o USING(revision_id)
        LEFT JOIN source_review_attestations_vnext a USING(revision_id)
        WHERE s.revision_id=ANY($1::text[]) ORDER BY s.fetched_at LIMIT 3`,[[scope.beforeRevisionId,scope.afterRevisionId]]);
      if(loaded.rows.length!==2)return null;
      const revisions=loaded.rows.map(r=>Revision.parse(r));
      const before=revisions.find(r=>r.revision_id===scope.beforeRevisionId),after=revisions.find(r=>r.revision_id===scope.afterRevisionId);
      if(!before||!after||before.source_id!==after.source_id||at(before.fetched_at)>=at(after.fetched_at))return null;
      const heads=await c.query(`SELECT h.revision_id,s.status,s.change_kind,
        (SELECT revision_id FROM source_revisions_vnext WHERE source_id=h.source_id
          AND fetched_at<=$2::timestamptz ORDER BY fetched_at DESC,revision_id DESC LIMIT 1) AS asof_revision_id
        FROM source_ingest_heads h JOIN source_effective_revisions_vnext s ON s.revision_id=h.revision_id
        WHERE h.source_id=$1`,[after.source_id,scope.asOf]);
      const head=heads.rows[0];
      if(heads.rows.length!==1||head?.asof_revision_id!==scope.afterRevisionId||head.status==='BLOCKED_RIGHTS'
        ||head.status==='RETRACTED'&&head.change_kind!=='CANCELLED')return null;
      const proofs:unknown[]=[];
      let validUntil=latest+60_000;
      const bound=(value:string)=>{validUntil=Math.min(validUntil,at(value));};
      const projection:TrustedOpportunityRevisionMetadata[]=[];
      for(const r of [before,after]){
        if(!allowed.grants.permissionRefs.has(r.permission_ref)||allowed.grants.sourceIds&&!allowed.grants.sourceIds.has(r.source_id)
          ||!matchesEvidenceScope(scopeFor(r),allowed.grants)||r.source_class==='RESEARCH_REFERENCE_ONLY'||r.provenance==='RESEARCH_ONLY'
          ||r.status==='BLOCKED_RIGHTS'||r.status==='RETRACTED'&&r.change_kind!=='CANCELLED'
          ||at(r.fetched_at)>at(scope.asOf)||r.published_at&&at(r.published_at)>at(scope.asOf)
          ||r.valid_from&&at(r.valid_from)>at(scope.asOf)||r.valid_until&&at(r.valid_until)<=at(scope.asOf))return null;
        const rightsRows=await c.query(`SELECT g.*,x.revoked_at FROM (SELECT * FROM source_rights_receipts
          WHERE actor_id=$1 AND source_id=$2 AND permission_ref=$3
          ORDER BY reviewed_at DESC,receipt_id DESC LIMIT 1) g
          LEFT JOIN source_rights_revocations x USING(receipt_id)`,[scope.actorId,r.source_id,r.permission_ref]);
        if(rightsRows.rows.length!==1)return null;
        const rights=Rights.parse(rightsRows.rows[0]);
        if(rights.actor_id!==scope.actorId||rights.source_id!==r.source_id||rights.permission_ref!==r.permission_ref
          ||rights.reviewed_by===scope.actorId||rights.revoked_at!==null||!rights.purposes.includes('SEARCH')
          ||at(rights.reviewed_at)>at(rights.starts_at)||at(rights.starts_at)>earliest||at(rights.expires_at)<=latest)return null;
        bound(rights.expires_at);proofs.push(rights);
      }
      // Exact actor/source/permission SEARCH authority is checked before any
      // private field values or quotes are loaded, independently of grants.
      const approvals=await c.query(`SELECT p.*,x.revoked_at FROM api_opportunity_revision_claim_approvals p
        LEFT JOIN api_opportunity_revision_claim_revocations x USING(approval_id)
        WHERE p.actor_id=$1 AND p.opportunity_id=$2 AND p.revision_id=ANY($3::text[]) LIMIT 3`,
      [scope.actorId,scope.opportunityId,[scope.beforeRevisionId,scope.afterRevisionId]]);
      if(approvals.rows.length>2)return null;
      const rows=approvals.rows.map(r=>Approval.parse(r));
      for(const r of [before,after]){
        const approval=rows.find(p=>p.revision_id===r.revision_id);
        let claims:z.infer<typeof Payload>['claims']=[],reviewState:TrustedOpportunityRevisionMetadata['reviewState']='PENDING',verifiedAt:string|undefined;
        if(approval){
          if(approval.actor_id!==scope.actorId||approval.opportunity_id!==scope.opportunityId||approval.source_id!==r.source_id
            ||approval.permission_ref!==r.permission_ref||approval.content_sha256!==r.content_sha256
            ||approval.consent_version!==allowed.consentVersion||approval.reviewed_by===scope.actorId||approval.revoked_at!==null
            ||at(approval.reviewed_at)<at(allowed.consentUpdated)||at(approval.reviewed_at)<at(r.fetched_at)
            ||at(approval.reviewed_at)>at(scope.asOf)||at(approval.reviewed_at)>at(approval.starts_at)
            ||at(approval.starts_at)>earliest||at(approval.expires_at)<=latest
            ||canonicalProjectionHash(approval.payload_json)!==approval.payload_sha256)return null;
          if(r.review_decision!=='APPROVED'||!r.reviewer_id||r.reviewer_id===scope.actorId
            ||r.original_sha256!==r.stored_original_sha256||r.original_sha256!==r.review_original_sha256
            ||r.content_sha256!==r.review_content_sha256||!r.review_checked_at||!r.last_verified_at
            ||at(r.review_checked_at)<at(r.fetched_at)||at(r.review_checked_at)>at(scope.asOf)
            ||at(r.last_verified_at)>at(scope.asOf)||at(approval.reviewed_at)<at(r.review_checked_at))return null;
          const payload=approval.payload_json;
          if(new Set(payload.claims.map(x=>x.field)).size!==payload.claims.length
            ||new Set(payload.evidence.map(x=>x.evidenceRef)).size!==payload.evidence.length)return null;
          const used=new Set(payload.claims.flatMap(x=>x.evidenceRefs));
          if(used.size!==payload.evidence.length||payload.evidence.some(x=>!used.has(x.evidenceRef)))return null;
          for(const ref of used){const e=payload.evidence.find(x=>x.evidenceRef===ref);
            if(!e||e.span.sourceRevisionId!==r.revision_id||!await this.evidence(c,r,e.span,scope,approval.reviewed_at,proofs))return null;}
          claims=payload.claims;reviewState='REVIEWED';verifiedAt=Time.parse(new Date(Math.max(at(approval.reviewed_at),at(r.last_verified_at))));
          bound(approval.expires_at);
        }
        if(r.change_kind==='UNKNOWN')reviewState='UNKNOWN';
        else if(r.status!=='ACTIVE'&&r.change_kind!=='CANCELLED')reviewState='PENDING';
        // Observations after asOf do not rewrite the historical checked time or
        // independent verification. No 304 observation can approve a claim.
        projection.push({revisionId:r.revision_id,sourceId:r.source_id,opportunityId:scope.opportunityId,
          capturedAt:r.fetched_at,checkedAt:at(r.last_checked_at)<=at(scope.asOf)?r.last_checked_at:r.fetched_at,
          ...(verifiedAt?{verifiedAt}:{}),contentSha256:r.content_sha256,reviewState,
          status:r.change_kind==='CANCELLED'?'CANCELLED':r===before?'SUPERSEDED':'ACTIVE',changeKind:r.change_kind,
          dataMode:r.provenance==='SYNTHETIC'?'SYNTHETIC':'REAL',deliveryMode:'REPLAY',claims});
      }
      const conflicts=await c.query(`SELECT disposition FROM source_conflict_decisions_vnext
        WHERE left_revision_id=$1 AND right_revision_id=$2 AND reviewed_at<=$3::timestamptz
        ORDER BY reviewed_at DESC,decision_id DESC LIMIT 1`,[[scope.beforeRevisionId,scope.afterRevisionId].sort()[0],
        [scope.beforeRevisionId,scope.afterRevisionId].sort()[1],scope.asOf]);
      if(conflicts.rows[0]?.disposition==='CONFLICT')projection[1]={...projection[1]!,reviewState:'CONFLICT'};
      const pair:Pair={actorId:scope.actorId,opportunityId:scope.opportunityId,sourceId:after.source_id,asOf:scope.asOf,
        currentRevisionId:String(head.asof_revision_id),before:projection[0]!,after:projection[1]!};
      const fingerprint=canonicalProjectionHash({scope,policy:allowed.policy,consentVersion:allowed.consentVersion,
        pair,revisions,head,rows,proofs,conflicts:conflicts.rows});
      await c.query('COMMIT');open=false;
      const current=await this.authority.resolve({actorId:scope.actorId,now:Time.parse(this.clock())});
      return current&&policyFingerprint(current)===allowed.policy&&at(this.clock())>=at(allowed.current)
        &&at(this.clock())<validUntil?{pair,fingerprint,validUntil}:null;
    }finally{if(open)try{await c.query('ROLLBACK');}catch{/* fail closed */}c.release();}
  }
  private async evidence(c:ReviewerSqlConnection,r:z.infer<typeof Revision>,span:SourceSpanVNext,scope:Scope,claimReviewedAt:string,proofs:unknown[]):Promise<boolean>{
    if(span.kind==='TEXT'){
      const result=await c.query(`SELECT revision_id,paragraph_id,paragraph_text FROM source_paragraphs_vnext
        WHERE revision_id=$1 AND paragraph_id=$2`,[r.revision_id,span.paragraphId]);
      const p=result.rows[0];
      if(result.rows.length!==1||p?.revision_id!==r.revision_id||typeof p.paragraph_text!=='string')return false;
      proofs.push(p);return matchesTextSpan(span,{revisionId:r.revision_id,paragraphId:String(p.paragraph_id),text:p.paragraph_text});
    }
    if(r.media_kind!=='IMAGE'&&r.media_kind!=='PDF')return false;
    const result=await c.query(`SELECT e.*,x.revoked_at FROM api_reviewed_revision_image_evidence e
      LEFT JOIN api_revision_image_evidence_revocations x USING(evidence_id)
      WHERE e.revision_id=$1 AND e.asset_id=$2 LIMIT 2`,[r.revision_id,span.assetId]);
    if(result.rows.length!==1)return false;
    const row=Image.parse(result.rows[0]),origin=row.payload_json;
    if(row.revision_id!==r.revision_id||row.reviewed_by===scope.actorId||row.revoked_at!==null
      ||at(row.reviewed_at)<at(r.fetched_at)||at(row.reviewed_at)>at(scope.asOf)||at(row.reviewed_at)>at(claimReviewedAt)
      ||canonicalProjectionHash(origin)!==row.payload_sha256||origin.originalSha256!==r.original_sha256
      ||new Set(origin.ocrLines.map(x=>x.id)).size!==origin.ocrLines.length
      ||origin.ocrLines.some(x=>x.pageIndex>=origin.pageCount)
      ||!matchesImageSpan(span,{revisionId:r.revision_id,...origin}))return false;
    const [l,t,rr,b]=span.bboxNorm;
    if(!span.ocrLineIds.every(id=>{const line=origin.ocrLines.find(x=>x.id===id)!;
      return line.pageIndex===span.pageIndex&&line.bboxNorm[0]>=l&&line.bboxNorm[1]>=t&&line.bboxNorm[2]<=rr&&line.bboxNorm[3]<=b;}))return false;
    proofs.push(row);return true;
  }
}
