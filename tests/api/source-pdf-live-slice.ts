/** Runs only inside pg-full-live-opt-in's disposable synthetic cluster.
 * These invented PDF/PNG/OCR fixtures prove persistence/SQL behavior, not actual
 * rendering, operating rights or independent human review of a real source. */
import {expect} from 'vitest';
import type {Pool,PoolClient} from 'pg';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';
import {PostgresSourceRevisionWriter} from '../../apps/api/src/modules/opportunities/temporal-writer-postgres.js';
import {PostgresSourceReviewService} from '../../apps/api/src/modules/opportunities/source-review-postgres.js';
import {PostgresTemporalEvidenceReader} from '../../apps/api/src/modules/opportunities/temporal-postgres.js';
import {syntheticPdfEvidence} from './synthetic-pdf-evidence.js';

function adapter(pool:Pool):ReviewerSqlPool{return {connect:async()=>{
  const c=await pool.connect();return {
    query:async(sql,params=[])=>({rows:(await c.query(sql,[...params])).rows}),release:()=>c.release(),
  };
}};}
export async function proveSourcePdfPg(admin:Pool,reader:Pool):Promise<void>{
  const f=syntheticPdfEvidence(),now=()=>new Date().toISOString();
  const at=new Date(Date.now()-1000).toISOString();
  f.revision.fetchedAt=at;f.revision.lastCheckedAt=at;
  const writer=new PostgresSourceRevisionWriter(adapter(admin));
  await writer.append(f.input);
  const temporal=new PostgresTemporalEvidenceReader(adapter(reader));
  const policy=(asOf=now())=>({query:'POSTER',asOf,permissionRefs:new Set([f.permissionRef]),
    sourceIds:new Set([f.sourceId]),topK:4});
  expect((await temporal.retrieve(policy())).envelope.retrievalState).toBe('STALE');
  const stored=(await admin.query('SELECT page_index,asset_id,raster_sha256,raster_bytes,width,height FROM source_pdf_rasters_vnext WHERE revision_id=$1 ORDER BY page_index',[f.revisionId])).rows;
  expect(stored.map(p=>p.page_index)).toEqual([0,1]);
  expect(stored.map(p=>p.raster_bytes)).toEqual(f.rasters.map(p=>p.bytes));
  expect((await admin.query('SELECT original_bytes FROM source_originals_vnext WHERE revision_id=$1',[f.revisionId])).rows[0]?.original_bytes)
    .toEqual(f.originalBytes);

  // Neither a direct ACTIVE row nor an attestation for another canonical bundle
  // may bypass the draft + immutable proof + independent review protocol.
  await expect(admin.query(`INSERT INTO source_revisions_vnext(revision_id,source_id,
    original_sha256,content_sha256,media_kind,source_class,permission_ref,provenance,status,change_kind,
    fetched_at,last_checked_at,last_verified_at)
    SELECT 'SYN-PDF-AUTO','SYN-PDF-AUTO-SOURCE',original_sha256,content_sha256,'PDF',
      source_class,permission_ref,provenance,'ACTIVE','NEW',fetched_at,last_checked_at,fetched_at
    FROM source_revisions_vnext WHERE revision_id=$1`,[f.revisionId])).rejects.toThrow(/independent review/);
  await expect(admin.query(`INSERT INTO source_review_attestations_vnext(
    review_id,revision_id,reviewer_id,decision,checked_at,original_sha256,content_sha256,permission_policy_version,image_evidence_sha256)
    VALUES('SYN-PDF-BAD-REVIEW',$1,'SYN-PDF-REVIEWER','APPROVED',clock_timestamp(),$2,$3,'SYN-SOURCE-POLICY',$4)`,
    [f.revisionId,f.originalSha256,f.contentSha256,'b'.repeat(64)])).rejects.toThrow(/review binding/);
  const reviewer=new PostgresSourceReviewService(adapter(admin),{authorize:async()=>({
    reviewerId:'SYN-PDF-REVIEWER',independentReview:true,permissionPolicyVersion:'SYN-SOURCE-POLICY',
    imageEvidenceSha256:f.evidenceHash,
  })},now);
  await reviewer.review({reviewId:'SYN-PDF-PG-REVIEW',actorRef:'SYN-PDF-REVIEWER',sourceId:f.sourceId,
    revisionId:f.revisionId,permissionRef:f.permissionRef,originalSha256:f.originalSha256,
    contentSha256:f.contentSha256,decision:'APPROVED',imageEvidenceSha256:f.evidenceHash});
  const reviewedAsOf=now(),result=await temporal.retrieve(policy(reviewedAsOf));
  expect(result.envelope.retrievalState).toBe('READY');expect(result.envelope.evidence).toEqual(f.spans);
  expect(result.hits.map(h=>h.imageSpan?.pageIndex)).toEqual([0,1]);
  expect((await temporal.retrieve(policy(at))).envelope.retrievalState).toBe('STALE');
  expect((await temporal.retrieve({...policy(),permissionRefs:new Set<string>()})).envelope.retrievalState).toBe('NO_EVIDENCE');
  expect((await admin.query('SELECT status FROM source_revisions_vnext WHERE revision_id=$1',[f.revisionId])).rows[0]?.status)
    .toBe('NEEDS_REVIEW');
  expect((await reader.query('SELECT pdf_page_assets FROM source_effective_revisions_vnext WHERE revision_id=$1',[f.revisionId])).rows[0]?.pdf_page_assets)
    .toEqual(f.rasters.map(p=>p.assetId));
  await expect(reader.query('SELECT raster_bytes FROM source_pdf_rasters_vnext')).rejects.toMatchObject({code:'42501'});
  await expect(reader.query('SELECT original_bytes,image_evidence FROM source_originals_vnext')).rejects.toMatchObject({code:'42501'});
  await expect(reader.query('DELETE FROM source_pdf_rasters_vnext WHERE revision_id=$1',[f.revisionId])).rejects.toMatchObject({code:'42501'});
  await expect(admin.query('UPDATE source_pdf_rasters_vnext SET width=width WHERE revision_id=$1',[f.revisionId])).rejects.toThrow(/immutable/);
  await expect(admin.query('DELETE FROM source_pdf_rasters_vnext WHERE revision_id=$1',[f.revisionId])).rejects.toThrow(/immutable/);
  await expect(admin.query(`INSERT INTO source_pdf_rasters_vnext(revision_id,page_index,asset_id,raster_sha256,raster_bytes,width,height)
    SELECT revision_id,2,'SYN-PDF-LATE-PAGE',raster_sha256,raster_bytes,width,height
    FROM source_pdf_rasters_vnext WHERE revision_id=$1 AND page_index=0`,[f.revisionId])).rejects.toThrow(/sealed/);
  await expect(admin.query(`INSERT INTO source_paragraphs_vnext(revision_id,paragraph_id,paragraph_text,paragraph_ordinal,image_span)
    VALUES($1,'SYN-PDF-LATE-LINE',$2,3,$3::jsonb)`,[f.revisionId,f.paragraphs[0]!.text,JSON.stringify(f.spans[0])]))
    .rejects.toThrow(/sealed/);

  // Each direct SQL negative case lives in its own rolled-back transaction.
  // This probes actual constraints, not a mock's imitation of the guards.
  async function unsealed(c:PoolClient,id:string){
    await c.query(`INSERT INTO source_revisions_vnext(revision_id,source_id,original_sha256,content_sha256,
      media_kind,source_class,permission_ref,provenance,status,change_kind,fetched_at,last_checked_at)
      SELECT $2,source_id,original_sha256,content_sha256,media_kind,source_class,permission_ref,
        provenance,status,change_kind,fetched_at,last_checked_at FROM source_revisions_vnext WHERE revision_id=$1`,[f.revisionId,id]);
  }
  for(const bad of ['hash','dimensions'] as const){
    const c=await admin.connect();
    try{
      await c.query('BEGIN');const id='SYN-PDF-RAW-'+bad;await unsealed(c,id);
      const page=f.rasters[0]!;
      await expect(c.query(`INSERT INTO source_pdf_rasters_vnext(revision_id,page_index,asset_id,raster_sha256,raster_bytes,width,height)
        VALUES($1,0,$2,$3,$4,$5,$6)`,[id,page.assetId,bad==='hash'?'b'.repeat(64):page.rasterSha256,
        page.bytes,bad==='dimensions'?page.width+1:page.width,page.height])).rejects.toMatchObject({code:'23514'});
    }finally{await c.query('ROLLBACK');c.release();}
  }
  for(const bad of ['page order','transform','PDF bytes'] as const){
    const c=await admin.connect();
    try{
      await c.query('BEGIN');const id='SYN-PDF-BUNDLE-'+bad.replaceAll(' ','-');await unsealed(c,id);
      await c.query(`INSERT INTO source_paragraphs_vnext(revision_id,paragraph_id,paragraph_text,paragraph_ordinal,image_span)
        SELECT $2,paragraph_id,paragraph_text,paragraph_ordinal,jsonb_set(image_span,'{sourceRevisionId}',to_jsonb($2::text))
        FROM source_paragraphs_vnext WHERE revision_id=$1`,[f.revisionId,id]);
      await c.query(`INSERT INTO source_pdf_rasters_vnext(revision_id,page_index,asset_id,raster_sha256,raster_bytes,width,height)
        SELECT $2,page_index,asset_id,raster_sha256,raster_bytes,width,height FROM source_pdf_rasters_vnext WHERE revision_id=$1`,[f.revisionId,id]);
      const bundle=structuredClone(f.evidence);bundle.sourceRevisionId=id;
      for(const page of bundle.pages)for(const field of page.ocrFields)(field as {sourceRevisionId:string}).sourceRevisionId=id;
      if(bad==='page order')bundle.pages.reverse();
      if(bad==='transform')bundle.pages[0]!.rasterToPdfPoints[3]=1;
      const bytes=Buffer.from(f.originalBytes);if(bad==='PDF bytes')bytes[bytes.length-1]=bytes.at(-1)!^1;
      await expect(c.query(`INSERT INTO source_originals_vnext(revision_id,original_sha256,original_bytes,captured_at,image_evidence,image_evidence_sha256)
        VALUES($1,$2,$3,$4,$5::jsonb,$6)`,[id,f.originalSha256,bytes,at,JSON.stringify(bundle),'b'.repeat(64)]))
        .rejects.toThrow(/PDF/);
    }finally{await c.query('ROLLBACK');c.release();}
  }

  // Latest-before-status filtering also applies to PDF: a fresh unreviewed
  // revision shadows older approved evidence; historical asOf remains exact.
  const next=syntheticPdfEvidence('-NEXT'),nextAt=new Date(Date.now()+1000).toISOString();
  await writer.append({...next.input,revision:{...next.revision,supersedes:f.revisionId,
    changeKind:'CORRECTED',fetchedAt:nextAt,lastCheckedAt:nextAt}});
  expect((await temporal.retrieve(policy(nextAt))).envelope.retrievalState).toBe('STALE');
  expect((await temporal.retrieve(policy(reviewedAsOf))).envelope.evidence).toEqual(f.spans);
}
