import {createHash} from 'node:crypto';
import {
  SourceRevisionVNextSchema,RevisionInvalidationVNextSchema,
} from '@hufs-one/contracts';
import type {SourceRevisionVNext,RevisionInvalidationVNext} from '@hufs-one/contracts';
import type {ReviewerSqlPool} from '../auth/reviewer-postgres.js';
import {hashRevisionParagraphs} from './revision-ledger.js';
import type {RevisionParagraph} from './revision-ledger.js';

/**
 * Transactional Postgres source writer. Cannot be reached by browser routes.
 * Caller must verify source rights, content bytes and human-approval identity.
 * A writer role may INSERT drafts/approved revisions but cannot rewrite history.
 */
export class PostgresSourceRevisionWriter {
  constructor(private readonly pool:ReviewerSqlPool){}

  async append(input:{
    revision:unknown;
    paragraphs:RevisionParagraph[];
    originalBytes:Uint8Array;
    permissionReviewed:boolean;
  }):Promise<RevisionInvalidationVNext|null>{
    if(!input.permissionReviewed)throw new Error('Missing approved source rights');
    const r=SourceRevisionVNextSchema.parse(input.revision);
    if(!input.originalBytes.length||input.originalBytes.byteLength>500_000
      ||!input.paragraphs.length||input.paragraphs.length>200
      ||new Set(input.paragraphs.map(x=>x.id)).size!==input.paragraphs.length
      ||Buffer.byteLength(JSON.stringify(input.paragraphs))>500_000
      ||input.paragraphs.some(x=>!x.id||!x.text||x.text.length>20_000)
      ||createHash('sha256').update(input.originalBytes).digest('hex')!==r.originalSha256
      ||hashRevisionParagraphs(input.paragraphs)!==r.contentSha256)
      throw new Error('Immutable revision integrity failure');
    const c=await this.pool.connect();
    let started=false;
    try{
      await c.query('BEGIN');started=true;
      // Lock a single source head, never hold the lock across HTTP/OCR calls.
      await c.query(`INSERT INTO source_ingest_heads(source_id)
        VALUES($1) ON CONFLICT (source_id) DO NOTHING`,[r.sourceId]);
      const locked=await c.query(`SELECT revision_id,fetched_at FROM source_ingest_heads
        WHERE source_id=$1 FOR UPDATE`,[r.sourceId]);
      if(locked.rows.length!==1)throw new Error('Source head lock unavailable');
      const prev=locked.rows[0]!.revision_id;
      const prevFetched=locked.rows[0]!.fetched_at;
      if(prev===null){
        if(r.supersedes||r.changeKind!=='NEW')
          throw new Error('First revision must be a new source');
      }else{
        if(typeof prev!=='string'||r.supersedes!==prev
          ||r.changeKind==='NEW')throw new Error('Revision head changed');
        const previousTime=prevFetched instanceof Date?prevFetched.getTime()
          :typeof prevFetched==='string'?Date.parse(prevFetched):NaN;
        if(!Number.isFinite(previousTime)||previousTime>=Date.parse(r.fetchedAt))
          throw new Error('Nonmonotonic source history');
      }
      await c.query(`INSERT INTO source_revisions_vnext(
        revision_id,source_id,supersedes,original_sha256,content_sha256,
        media_kind,source_class,permission_ref,provenance,status,change_kind,
        published_at,fetched_at,last_checked_at,last_verified_at,
        valid_from,valid_until,scope_campuses,scope_majors,cohort_min,cohort_max)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
          $16,$17,$18,$19,$20,$21)`,[
        r.revisionId,r.sourceId,r.supersedes??null,r.originalSha256,r.contentSha256,
        r.mediaKind,r.sourceClass,r.permissionRef,r.provenance,r.status,r.changeKind,
        r.publishedAt??null,r.fetchedAt,r.lastCheckedAt,r.lastVerifiedAt??null,
        r.validFrom??null,r.validUntil??null,
        r.applicableScope?.campuses?.length?r.applicableScope.campuses:null,
        r.applicableScope?.majorCodes?.length?r.applicableScope.majorCodes:null,
        r.applicableScope?.cohortRange?.[0]??null,
        r.applicableScope?.cohortRange?.[1]??null,
      ]);
      await c.query(`INSERT INTO source_paragraphs_vnext(
        revision_id,paragraph_id,paragraph_text)
        SELECT $1, item.id,item.text FROM jsonb_to_recordset($2::jsonb)
        AS item(id text,text text)`,[
        r.revisionId,JSON.stringify(input.paragraphs),
      ]);
      const updated=await c.query(`UPDATE source_ingest_heads
        SET revision_id=$2,fetched_at=$3,last_checked_at=$3
        WHERE source_id=$1 RETURNING source_id`,[
        r.sourceId,r.revisionId,r.fetchedAt,
      ]);
      if(updated.rows.length!==1)throw new Error('Unable to publish source head');
      const event:RevisionInvalidationVNext|null=prev===null?null:
        RevisionInvalidationVNextSchema.parse({
          eventId:'revision:'+r.revisionId,sourceId:r.sourceId,
          previousRevisionId:prev,newRevisionId:r.revisionId,
          changedAt:r.fetchedAt,
          reason:r.changeKind==='CANCELLED'?'CANCELLED'
            :r.changeKind==='EXTENDED'?'EXTENDED'
            :r.status==='BLOCKED_RIGHTS'?'RIGHTS_REVOKED':'CORRECTED',
          permissionPolicyVersion:r.permissionRef,
          invalidates:['RETRIEVAL','CLAIMS','FEED','NOTICES','AI_CACHE'],
        });
      if(event)await c.query(`INSERT INTO source_invalidation_events(
        event_id,source_id,previous_revision_id,new_revision_id,reason,
        changed_at,permission_policy_version,invalidates)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[
          event.eventId,event.sourceId,event.previousRevisionId,
          event.newRevisionId,event.reason,event.changedAt,
          event.permissionPolicyVersion,event.invalidates,
        ]);
      await c.query('COMMIT');started=false;
      return event;
    }catch(e){
      if(started)try{await c.query('ROLLBACK');}catch{/* also fail closed */}
      throw e;
    }finally{c.release();}
  }

  async observeUnchanged(input:{
    sourceId:string;revisionId:string;checkedAt:string;responseStatus:200|304;
  }):Promise<void>{
    const c=await this.pool.connect();
    let started=false;
    try{
      await c.query('BEGIN');started=true;
      const updated=await c.query(`UPDATE source_ingest_heads
        SET last_checked_at=$3
        WHERE source_id=$1 AND revision_id=$2
          AND last_checked_at<=$3::timestamptz
        RETURNING source_id`,[input.sourceId,input.revisionId,input.checkedAt]);
      if(updated.rows.length!==1)throw new Error('Source changed before 304');
      await c.query(`INSERT INTO source_check_observations(
        source_id,checked_at,revision_id,response_status)
        VALUES($1,$2,$3,$4)`,[
          input.sourceId,input.checkedAt,input.revisionId,input.responseStatus,
        ]);
      // Never modify lastVerifiedAt or an immutable source revision here.
      await c.query('COMMIT');started=false;
    }catch(e){
      if(started)try{await c.query('ROLLBACK');}catch{/* fail closed */}
      throw e;
    }finally{c.release();}
  }
}
