/** Executed only inside pg-full-live-opt-in's disposable synthetic cluster.
 * No real source, external provider, model, renderer or production role. */
import {createHash} from 'node:crypto';
import type {Pool} from 'pg';
import {PNG} from 'pngjs';
import {expect} from 'vitest';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';
import {createApprovedImageExtractor} from '../../apps/api/src/modules/opportunities/approved-image-extractor.js';
import {parseSourceImageEvidence} from '../../apps/api/src/modules/opportunities/source-image-evidence.js';
import {PostgresSourceRevisionWriter} from '../../apps/api/src/modules/opportunities/temporal-writer-postgres.js';
import {PostgresSourceReviewService} from '../../apps/api/src/modules/opportunities/source-review-postgres.js';
import {PostgresTemporalEvidenceReader} from '../../apps/api/src/modules/opportunities/temporal-postgres.js';
import {hashRevisionParagraphs} from '../../apps/api/src/modules/opportunities/revision-ledger.js';
import {decodeApprovedRaster} from '../../packages/ai/src/raster.js';
import {buildOcrRequest,parseOcrResponse} from '../../packages/ai/src/clova-wire.js';
import {normalizeOcrEvidence} from '../../packages/ai/src/ocr-evidence.js';

function adapter(pool:Pool):ReviewerSqlPool{return {connect:async()=>{
  const c=await pool.connect();return {
    query:async(sql,params=[])=>({rows:(await c.query(sql,[...params])).rows}),release:()=>c.release(),
  };
}};}
export async function proveSourceImagePg(admin:Pool,reader:Pool):Promise<void>{
  const sourceId='SYN-IMAGE-PG-SOURCE',sourceRevisionId='SYN-IMAGE-PG-REV',permissionRef='SYN-IMAGE-PG-PERM';
  const png=new PNG({width:8,height:8});png.data.fill(255);const content=PNG.sync.write(png);
  const originalSha256=createHash('sha256').update(content).digest('hex'),quote='SYNTHETIC IMAGE POSTER';
  const now=()=>new Date().toISOString(),started=Date.now();
  const image=createApprovedImageExtractor({enabled:true,now,
    authority:{authorize:async(input)=>{
      const {now:_now,purpose,...binding}=input;
      return {...binding,purpose,receiptId:'SYN-PG-'+purpose,policyVersion:'SYN-MEDIA-POLICY',
        reviewedBy:'SYN-INDEPENDENT-PROCESSING',reviewedAt:new Date(started-120_000).toISOString(),
        startsAt:new Date(started-60_000).toISOString(),expiresAt:new Date(started+3600_000).toISOString(),revokedAt:null};
    }},
    decode:async(bytes,binding)=>decodeApprovedRaster(bytes,binding),
    ocr:{readCandidate:async({media,revalidate})=>{
      await revalidate();
      const request=buildOcrRequest(media,'00000000-0000-4000-8000-000000000002',started);
      return normalizeOcrEvidence(media,parseOcrResponse(request.context,{
        version:'V2',requestId:'00000000-0000-4000-8000-000000000002',images:[{
          name:'image',inferResult:'SUCCESS',fields:[{inferText:quote,inferConfidence:.9,type:'NORMAL',lineBreak:true,
            boundingPoly:{vertices:[{x:0,y:0},{x:4,y:0},{x:4,y:2},{x:0,y:2}]}}],
        }],
      }));
    }},
  });
  const prepared=await image.extract({actorRef:'SYN-IMAGE-OPERATOR',sourceId,sourceRevisionId,
    permissionRef,assetId:'SYN-IMAGE-PG-ASSET',originalSha256,
    canonicalUrl:'https://synthetic.example.edu/pg-poster.png',content,contentType:'image/png',
    assertSourceRights:async()=>{}});
  const retained=parseSourceImageEvidence(prepared.evidence,{sourceId,revisionId:sourceRevisionId,permissionRef,originalSha256});
  const at=now(),contentSha256=hashRevisionParagraphs(retained.paragraphs);
  const revision={sourceId,revisionId:sourceRevisionId,permissionRef,originalSha256,contentSha256,
    mediaKind:'IMAGE',sourceClass:'SYNTHETIC',provenance:'SYNTHETIC',status:'NEEDS_REVIEW',
    changeKind:'NEW',fetchedAt:at,lastCheckedAt:at,topicCodes:[]};
  await new PostgresSourceRevisionWriter(adapter(admin)).append({
    revision,paragraphs:retained.paragraphs,originalBytes:content,permissionReviewed:true,imageEvidence:prepared.evidence,
  });
  const temporal=new PostgresTemporalEvidenceReader(adapter(reader));
  const policy=()=>({query:'POSTER',asOf:now(),permissionRefs:new Set([permissionRef]),sourceIds:new Set([sourceId]),topK:2});
  expect((await temporal.retrieve(policy())).envelope.retrievalState).toBe('STALE');
  expect((await admin.query('SELECT status FROM source_effective_revisions_vnext WHERE revision_id=$1',[sourceRevisionId])).rows[0]?.status)
    .toBe('NEEDS_REVIEW');

  // #381: prove the immutable original INSERT guard on an isolated temporary
  // synthetic table. No real source, OCR endpoint or production data is read.
  // A dedicated connection preserves the temp-table/session boundary.
  const guardConn=await admin.connect();
  try{
    await guardConn.query('CREATE TEMP TABLE synthetic_ocr_id_guard (image_evidence jsonb)');
    await guardConn.query(`CREATE TRIGGER synthetic_ocr_id_guard_insert BEFORE INSERT
      ON synthetic_ocr_id_guard FOR EACH ROW
      EXECUTE FUNCTION public.guard_source_image_ocr_field_ids()`);
    const ok={ocrFields:[{id:'SYN-OCR-1',text:'synthetic'},{id:'SYN-OCR-2',text:'synthetic'}]};
    await expect(guardConn.query('INSERT INTO synthetic_ocr_id_guard(image_evidence) VALUES($1::jsonb)',
      [JSON.stringify(ok)])).resolves.toBeDefined();
    const duplicateSame={ocrFields:[{id:'SYN-OCR-1',text:'x'},{id:'SYN-OCR-1',text:'x'}]};
    const duplicateDifferent={ocrFields:[{id:'SYN-OCR-1',text:'x'},{id:'SYN-OCR-1',text:'y'}]};
    const missingId={ocrFields:[{id:'SYN-OCR-1'},{text:'x'}]};
    const invalidList={ocrFields:'not-a-list'};
    for(const bad of [duplicateSame,duplicateDifferent,missingId,invalidList]){
      await expect(guardConn.query('INSERT INTO synthetic_ocr_id_guard(image_evidence) VALUES($1::jsonb)',
        [JSON.stringify(bad)])).rejects.toThrow(/(?:duplicate or invalid|invalid OCR field ID list)/);
    }
  }finally{guardConn.release();}

  // A direct SQL caller cannot attest a different bbox/OCR bundle hash.
  await expect(admin.query(`INSERT INTO source_review_attestations_vnext(
    review_id,revision_id,reviewer_id,decision,checked_at,original_sha256,content_sha256,permission_policy_version,image_evidence_sha256)
    VALUES('SYN-IMAGE-PG-BAD-REVIEW',$1,'SYN-IMAGE-REVIEWER','APPROVED',clock_timestamp(),$2,$3,'SYN-SOURCE-POLICY',$4)`,
    [sourceRevisionId,originalSha256,contentSha256,'b'.repeat(64)])).rejects.toThrow(/image review binding/);
  const review=new PostgresSourceReviewService(adapter(admin),{authorize:async()=>({
    reviewerId:'SYN-IMAGE-REVIEWER',independentReview:true,permissionPolicyVersion:'SYN-SOURCE-POLICY',
    imageEvidenceSha256:retained.sha256,
  })},now);
  await review.review({reviewId:'SYN-IMAGE-PG-REVIEW',actorRef:'SYN-IMAGE-REVIEWER',sourceId,
    revisionId:sourceRevisionId,permissionRef,originalSha256,contentSha256,decision:'APPROVED',
    imageEvidenceSha256:retained.sha256});
  const result=await temporal.retrieve(policy());
  expect(result.envelope.retrievalState).toBe('READY');expect(result.envelope.evidence).toEqual(retained.spans);
  expect(result.hits[0]?.imageSpan).toEqual(retained.spans[0]);
  expect((await admin.query('SELECT status FROM source_revisions_vnext WHERE revision_id=$1',[sourceRevisionId])).rows[0]?.status)
    .toBe('NEEDS_REVIEW');
  expect((await admin.query('SELECT count(*)::int AS n FROM source_invalidation_deliveries WHERE event_id=$1',
    ['review:SYN-IMAGE-PG-REVIEW'])).rows[0]?.n).toBe(5);
  await expect(reader.query('SELECT original_bytes,image_evidence FROM source_originals_vnext')).rejects.toMatchObject({code:'42501'});
  await expect(reader.query("UPDATE source_paragraphs_vnext SET image_span=NULL WHERE revision_id=$1",[sourceRevisionId]))
    .rejects.toMatchObject({code:'42501'});
  // Even the table owner cannot mutate sealed history through ordinary DML.
  await expect(admin.query("UPDATE source_originals_vnext SET image_evidence=NULL WHERE revision_id=$1",[sourceRevisionId]))
    .rejects.toThrow(/immutable/);
  await expect(admin.query(`INSERT INTO source_revisions_vnext(revision_id,source_id,
    original_sha256,content_sha256,media_kind,source_class,permission_ref,provenance,status,change_kind,
    fetched_at,last_checked_at,last_verified_at)
    SELECT 'SYN-IMAGE-PG-AUTO','SYN-IMAGE-PG-AUTO-SOURCE',original_sha256,content_sha256,
      'IMAGE',source_class,permission_ref,provenance,'ACTIVE','NEW',fetched_at,last_checked_at,fetched_at
    FROM source_revisions_vnext WHERE revision_id=$1`,[sourceRevisionId]))
    .rejects.toThrow(/independent review/);
  await expect(admin.query(`INSERT INTO source_paragraphs_vnext(revision_id,paragraph_id,paragraph_text,paragraph_ordinal,image_span)
    VALUES($1,'SYN-UNREVIEWED-APPEND',$2,2,$3::jsonb)`,[sourceRevisionId,quote,JSON.stringify(retained.spans[0])]))
    .rejects.toThrow(/sealed/);
}
