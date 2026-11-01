import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {ReviewerSqlPool} from '../auth/reviewer-postgres.js';
import {hashRevisionParagraphs} from './revision-ledger.js';
const Ref=z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:@-]+$/);
const Sha=z.string().regex(/^[a-f0-9]{64}$/);
const Request=z.strictObject({reviewId:Ref,actorRef:Ref,sourceId:Ref,
  revisionId:Ref,permissionRef:Ref,originalSha256:Sha,contentSha256:Sha,
  decision:z.enum(['APPROVED','REJECTED']),
});
export interface SourceReviewAuthority {
  /** Independently authenticate the human reviewer and verify current COLLECT,
   * STORE and SEARCH rights, purposes/consent and independence from extraction.
   * Return null on any missing/revoked authority. Never trust browser claims. */
  authorize(input:{actorRef:string;sourceId:string;permissionRef:string;now:string}):Promise<{
    reviewerId:string;independentReview:true;permissionPolicyVersion:string;
  }|null>;
}
/** Private, explicit operator port. No HTTP route, scheduler, model or network.
 * Approval is an attestation: original download time and bytes are immutable.
 * Only the effective-revision view derives ACTIVE from an approved decision. */
export class PostgresSourceReviewService {
  constructor(private readonly pool:ReviewerSqlPool,private readonly authority:SourceReviewAuthority,
    private readonly now:()=>string=()=>new Date().toISOString()){}
  async review(raw:z.infer<typeof Request>):Promise<{reviewId:string;created:boolean}>{
    const input=Request.parse(raw),at=z.iso.datetime({offset:true}).parse(this.now());
    const authorize=async()=>{
      const r=await this.authority.authorize({actorRef:input.actorRef,sourceId:input.sourceId,
        permissionRef:input.permissionRef,now:this.now()});
      if(!r||r.independentReview!==true||r.reviewerId!==input.actorRef
        ||!Ref.safeParse(r.reviewerId).success||!Ref.safeParse(r.permissionPolicyVersion).success)
        throw new Error('Current independent-review authority unavailable');
      return r;
    };
    const initial=await authorize();
    const c=await this.pool.connect();let open=false;
    try{
      await c.query('BEGIN');open=true;
      await c.query("SET LOCAL lock_timeout='3s'");
      await c.query("SET LOCAL statement_timeout='5s'");
      const head=await c.query('SELECT revision_id FROM source_ingest_heads WHERE source_id=$1 FOR UPDATE',[input.sourceId]);
      if(head.rows.length!==1||head.rows[0]!.revision_id!==input.revisionId)
        throw new Error('Source review head changed');
      const revisions=await c.query(`SELECT revision_id,source_id,permission_ref,
        original_sha256,content_sha256,status,change_kind,provenance,source_class,fetched_at
        FROM source_revisions_vnext WHERE revision_id=$1`,[input.revisionId]);
      const r=revisions.rows[0];
      const fetched=r?.fetched_at instanceof Date?r.fetched_at.getTime():Date.parse(String(r?.fetched_at));
      if(revisions.rows.length!==1||!r||r.source_id!==input.sourceId
        ||r.permission_ref!==input.permissionRef||r.original_sha256!==input.originalSha256
        ||r.content_sha256!==input.contentSha256||r.status!=='NEEDS_REVIEW'
        ||!['NEW','CORRECTED','EXTENDED'].includes(String(r.change_kind))
        ||!['SYNTHETIC','REAL_APPROVED'].includes(String(r.provenance))
        ||!['SYNTHETIC','LICENSED_EXTERNAL'].includes(String(r.source_class))
        ||!Number.isFinite(fetched)||fetched>Date.parse(at))throw new Error('Source review integrity or eligibility failure');
      const original=await c.query(`SELECT original_sha256,original_bytes,captured_at
        FROM source_originals_vnext WHERE revision_id=$1`,[input.revisionId]);
      const stored=original.rows[0];
      const bytes=stored?.original_bytes;
      const captured=stored?.captured_at instanceof Date?stored.captured_at.getTime()
        :Date.parse(String(stored?.captured_at));
      // The independent attestation must refer to the exact retained snapshot,
      // not only matching caller-supplied hashes or a differently timed capture.
      if(original.rows.length!==1||!(bytes instanceof Uint8Array)||bytes.byteLength===0
        ||bytes.byteLength>500_000||stored?.original_sha256!==input.originalSha256
        ||!Number.isFinite(captured)||captured!==fetched
        ||createHash('sha256').update(bytes).digest('hex')!==input.originalSha256)
        throw new Error('Original snapshot integrity failure');
      const text=await c.query(`SELECT paragraph_id,paragraph_text,paragraph_ordinal
        FROM source_paragraphs_vnext WHERE revision_id=$1
        ORDER BY paragraph_ordinal`,[input.revisionId]);
      // Earlier drafts had nullable order metadata. Never silently turn those
      // unordered paragraphs into an approved, quotable source revision.
      if(!text.rows.length||text.rows.length>200||text.rows.some((p,i)=>
        typeof p.paragraph_id!=='string'||typeof p.paragraph_text!=='string'
        ||!Number.isSafeInteger(p.paragraph_ordinal)||p.paragraph_ordinal!==i+1))
        throw new Error('Paragraph integrity failure');
      const paragraphs=text.rows.map(p=>({id:p.paragraph_id as string,text:p.paragraph_text as string}));
      if(hashRevisionParagraphs(paragraphs)!==input.contentSha256)throw new Error('Paragraph integrity failure');
      const current=await authorize();
      if(current.permissionPolicyVersion!==initial.permissionPolicyVersion)throw new Error('Source review authority changed');
      const previous=await c.query(`SELECT review_id,reviewer_id,decision,original_sha256,
        content_sha256,permission_policy_version FROM source_review_attestations_vnext
        WHERE revision_id=$1`,[input.revisionId]);
      if(previous.rows.length){
        const old=previous.rows[0]!;
        if(previous.rows.length!==1||old.review_id!==input.reviewId||old.reviewer_id!==initial.reviewerId
          ||old.decision!==input.decision||old.original_sha256!==input.originalSha256
          ||old.content_sha256!==input.contentSha256||old.permission_policy_version!==initial.permissionPolicyVersion)
          throw new Error('Immutable source review conflict');
        await c.query('COMMIT');open=false;return {reviewId:input.reviewId,created:false};
      }
      const checkedAt=z.iso.datetime({offset:true}).parse(this.now());
      if(Date.parse(checkedAt)<Date.parse(at))throw new Error('Source review clock moved backwards');
      await c.query(`INSERT INTO source_review_attestations_vnext(review_id,revision_id,
        reviewer_id,decision,checked_at,original_sha256,content_sha256,permission_policy_version)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[input.reviewId,input.revisionId,
        initial.reviewerId,input.decision,checkedAt,input.originalSha256,input.contentSha256,initial.permissionPolicyVersion]);
      const eventId='review:'+input.reviewId;
      const targets=['RETRIEVAL','CLAIMS','FEED','NOTICES','AI_CACHE'];
      // Internal verification invalidation of the SAME immutable revision.
      // This is not a public RevisionInvalidationVNext (which requires a new
      // revision ID), and review() returns only a decision receipt above.
      await c.query(`INSERT INTO source_invalidation_events(event_id,source_id,previous_revision_id,
        new_revision_id,reason,changed_at,permission_policy_version,invalidates)
        VALUES($1,$2,$3,$3,'VERIFICATION_STALE',$4,$5,$6)`,[
        eventId,input.sourceId,input.revisionId,checkedAt,initial.permissionPolicyVersion,targets]);
      await c.query(`INSERT INTO source_invalidation_deliveries(event_id,target)
        SELECT $1,unnest($2::text[])`,[eventId,targets]);
      const final=await authorize();
      if(final.permissionPolicyVersion!==initial.permissionPolicyVersion)throw new Error('Source review authority changed');
      await c.query('COMMIT');open=false;return {reviewId:input.reviewId,created:true};
    }catch(error){if(open)try{await c.query('ROLLBACK');}catch{/* preserve failure */}throw error;}
    finally{c.release();}
  }
}
