/** Synthetic-only durable execution proof, called by the disposable PG suite.
 * Parser internals use actual synthetic ZIP/CFB bytes in the worker's Node tests;
 * this slice tests the SQL integration contract without installing worker deps. */
import {createHash} from 'node:crypto';
import type {Pool} from 'pg';
import {expect} from 'vitest';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';
import {createApprovedDurableSourceExecutor} from '../../apps/api/src/modules/opportunities/source-ingestion-durable.js';
import {PostgresSourceRevisionWriter} from '../../apps/api/src/modules/opportunities/temporal-writer-postgres.js';
import {PostgresTemporalEvidenceReader} from '../../apps/api/src/modules/opportunities/temporal-postgres.js';
import {PostgresSourceReviewService} from '../../apps/api/src/modules/opportunities/source-review-postgres.js';
import {hashRevisionParagraphs} from '../../apps/api/src/modules/opportunities/revision-ledger.js';

const adapter=(pool:Pool):ReviewerSqlPool=>({connect:async()=>{
  const c=await pool.connect();return {query:async(sql,params=[])=>({rows:(await c.query(sql,[...params])).rows}),release:()=>c.release()};
}});
export async function proveSourceDocumentPg(admin:Pool,reader:Pool):Promise<void>{
  for(const [contentType,mediaKind] of [['application/x-hwp','HWP'],['application/hwp+zip','HWPX']] as const){
    const sourceId='SYN-DOCUMENT-PG-'+mediaKind,permissionRef=sourceId+'-RIGHTS';
    const canonicalUrl='https://synthetic.example.edu/documents/'+mediaKind;
    const content=Buffer.from('synthetic opaque container '+mediaKind);
    const originalSha256=createHash('sha256').update(content).digest('hex');
    const policy={sourceId,permissionRef,canonicalUrl,approvedOrigin:'https://synthetic.example.edu',
      sourceClass:'SYNTHETIC' as const,provenance:'SYNTHETIC' as const,rightsReviewed:true};
    const executor=createApprovedDurableSourceExecutor({policies:new Map([[sourceId,policy]]),
      rights:{resolve:async()=>null},readerPool:adapter(admin),writer:new PostgresSourceRevisionWriter(adapter(admin)),
      egress:{resolveAddresses:async()=>['8.8.8.8'],requestPinned:async()=>new Response(content,{headers:{'content-type':contentType}})},
      extractor:{extract:async()=>{throw new Error('Binary reached text parser');}},
      documentExtractor:{extract:async({sourceId,revisionId})=>({sourceId,revisionId,originalSha256,mediaKind,
        state:'NEEDS_REVIEW',completeness:'TEXT_ONLY_REQUIRES_ORIGINAL_REVIEW',paragraphs:[{id:'s0p1',text:'SYNTHETIC DOCUMENT'}]})},
    });
    const request={sourceId,permissionRef,actorRef:'SYN-DOCUMENT-OPERATOR'};
    const result=await executor.execute(request);expect(result.kind).toBe('NEW_DRAFT');
    const row=(await admin.query(`SELECT r.media_kind,r.status,r.last_verified_at,o.original_sha256,o.original_bytes
      FROM source_revisions_vnext r JOIN source_originals_vnext o USING(revision_id) WHERE revision_id=$1`,[result.revisionId])).rows[0];
    expect(row).toMatchObject({media_kind:mediaKind,status:'NEEDS_REVIEW',last_verified_at:null,original_sha256:originalSha256});
    expect(row.original_bytes).toEqual(content);
    for(const status of ['ACTIVE','NEEDS_REVIEW']){
      await expect(admin.query(`INSERT INTO source_revisions_vnext(revision_id,source_id,
        original_sha256,content_sha256,media_kind,source_class,permission_ref,provenance,
        status,change_kind,fetched_at,last_checked_at,last_verified_at)
        SELECT $1,source_id,original_sha256,content_sha256,media_kind,source_class,permission_ref,
          provenance,$2,change_kind,fetched_at,last_checked_at,fetched_at
        FROM source_revisions_vnext WHERE revision_id=$3`,
      [result.revisionId+'-FORGED-'+status,status,result.revisionId])).rejects.toThrow('document revision requires independent original review');
    }
    expect((await executor.execute(request)).kind).toBe('NOT_MODIFIED');
    const temporal=new PostgresTemporalEvidenceReader(adapter(reader));
    const hidden=await temporal.retrieve({query:'DOCUMENT',asOf:new Date().toISOString(),permissionRefs:new Set([permissionRef]),sourceIds:new Set([sourceId]),topK:2});
    expect(hidden.envelope.retrievalState).toBe('STALE');
    expect((await admin.query('SELECT count(*)::int AS n FROM source_review_attestations_vnext WHERE revision_id=$1',[result.revisionId])).rows[0].n).toBe(0);
    const review=new PostgresSourceReviewService(adapter(admin),{authorize:async()=>({
      reviewerId:'SYN-DOCUMENT-REVIEWER',independentReview:true,permissionPolicyVersion:'SYN-DOCUMENT-POLICY',
    })});
    await review.review({reviewId:sourceId+'-REVIEW',actorRef:'SYN-DOCUMENT-REVIEWER',sourceId,
      revisionId:result.revisionId,permissionRef,originalSha256,
      contentSha256:hashRevisionParagraphs([{id:'s0p1',text:'SYNTHETIC DOCUMENT'}]),decision:'APPROVED'});
    expect((await admin.query('SELECT status FROM source_effective_revisions_vnext WHERE revision_id=$1',[result.revisionId])).rows[0].status).toBe('ACTIVE');
    expect((await admin.query('SELECT status FROM source_revisions_vnext WHERE revision_id=$1',[result.revisionId])).rows[0].status).toBe('NEEDS_REVIEW');
  }
}
