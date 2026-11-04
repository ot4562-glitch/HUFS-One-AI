import {describe,expect,it} from 'vitest';
import {PNG} from 'pngjs';
import {PostgresSourceRevisionWriter} from '../../apps/api/src/modules/opportunities/temporal-writer-postgres.js';
import {PostgresSourceReviewService} from '../../apps/api/src/modules/opportunities/source-review-postgres.js';
import {PostgresTemporalEvidenceReader} from '../../apps/api/src/modules/opportunities/temporal-postgres.js';
import {syntheticPdfEvidence,pdfHash,PDF_AT,PDF_REVIEW_AT} from './synthetic-pdf-evidence.js';

type Fixture=ReturnType<typeof syntheticPdfEvidence>;
function database(f?:Fixture,failOn?:string){
  const calls:Array<{sql:string;params:readonly unknown[]}>=[];
  let revision:any=f?{revision_id:f.revisionId,source_id:f.sourceId,permission_ref:f.permissionRef,
    original_sha256:f.originalSha256,content_sha256:f.contentSha256,status:'NEEDS_REVIEW',
    change_kind:'NEW',provenance:'SYNTHETIC',source_class:'SYNTHETIC',fetched_at:PDF_AT,media_kind:'PDF'}:undefined;
  let head:string|null=f?.revisionId??null;
  let original:any=f?{original_sha256:f.originalSha256,original_bytes:f.originalBytes,captured_at:PDF_AT,
    image_evidence:f.evidence,image_evidence_sha256:f.evidenceHash}:undefined;
  let paragraphs:any[]=f?f.paragraphs.map((p,i)=>({paragraph_id:p.id,paragraph_text:p.text,paragraph_ordinal:i+1,image_span:f.spans[i]})):[];
  const rasters:any[]=f?f.rasters.map(r=>({page_index:r.pageIndex,asset_id:r.assetId,raster_sha256:r.rasterSha256,
    raster_bytes:r.bytes,width:r.width,height:r.height})):[];
  let review:any=null;
  const pool={connect:async()=>({query:async(sql:string,params:readonly unknown[]=[])=>{
    calls.push({sql,params});
    if(failOn&&sql.includes(failOn))throw new Error('Synthetic storage failure');
    if(sql.startsWith('INSERT INTO source_revisions_vnext')){
      revision={revision_id:params[0],source_id:params[1],original_sha256:params[3],content_sha256:params[4],
        media_kind:params[5],source_class:params[6],permission_ref:params[7],provenance:params[8],
        status:params[9],change_kind:params[10],fetched_at:params[12]};return {rows:[]};
    }
    if(sql.startsWith('INSERT INTO source_paragraphs_vnext')){
      paragraphs=JSON.parse(String(params[1])).map((p:any,i:number)=>({paragraph_id:p.id,paragraph_text:p.text,paragraph_ordinal:i+1,image_span:p.imageSpan}));
      return {rows:[]};
    }
    if(sql.startsWith('INSERT INTO source_pdf_rasters_vnext')){
      rasters.push({page_index:params[1],asset_id:params[2],raster_sha256:params[3],raster_bytes:params[4],width:params[5],height:params[6]});
      return {rows:[]};
    }
    if(sql.startsWith('INSERT INTO source_originals_vnext')){
      original={original_sha256:params[1],original_bytes:params[2],captured_at:params[3],
        image_evidence:JSON.parse(String(params[4])),image_evidence_sha256:params[5]};return {rows:[]};
    }
    if(sql.startsWith('UPDATE source_ingest_heads')){head=String(params[1]);return {rows:[{source_id:revision.source_id}]};}
    if(sql.startsWith('INSERT INTO source_review_attestations_vnext')){
      review={review_id:params[0],reviewer_id:params[2],decision:params[3],checked_at:params[4],original_sha256:params[5],
        content_sha256:params[6],permission_policy_version:params[7],image_evidence_sha256:params[8]};return {rows:[]};
    }
    if(sql.includes('confirmed_conflict'))return {rows:[{confirmed_conflict:false}]};
    if(sql.includes('AS blocked_rights'))return {rows:[{blocked_rights:false,unknown:false,stale:Boolean(revision)}]};
    if(sql.includes('score.score'))return {rows:review?.decision==='APPROVED'?paragraphs.map(p=>({
      source_id:revision.source_id,revision_id:head,paragraph_id:p.paragraph_id,paragraph_text:p.paragraph_text,score:1,
      media_kind:'PDF',original_sha256:revision.original_sha256,image_span:p.image_span,
      pdf_page_assets:original.image_evidence.pages.map((p:any)=>p.assetId),
    })):[]};
    if(sql.includes('FROM source_ingest_heads')&&sql.includes('FOR UPDATE'))return {rows:[{revision_id:head,fetched_at:revision?.fetched_at??null}]};
    if(sql.includes('FROM source_pdf_rasters_vnext'))return {rows:rasters};
    if(sql.includes('FROM source_revisions_vnext'))return {rows:revision?[revision]:[]};
    if(sql.includes('FROM source_originals_vnext'))return {rows:original?[original]:[]};
    if(sql.includes('FROM source_paragraphs_vnext'))return {rows:paragraphs};
    if(sql.includes('FROM source_review_attestations_vnext'))return {rows:review?[review]:[]};
    return {rows:[]};
  },release:()=>{}})};
  return {pool,calls,rasters,paragraphs:()=>paragraphs,original:()=>original,revision:()=>revision,
    approve:()=>{review={decision:'APPROVED'};}};
}
function reviewRequest(f:Fixture){return {reviewId:'SYN-PDF-REVIEW',actorRef:'SYN-REVIEWER',sourceId:f.sourceId,
  revisionId:f.revisionId,permissionRef:f.permissionRef,originalSha256:f.originalSha256,contentSha256:f.contentSha256,
  decision:'APPROVED' as const,imageEvidenceSha256:f.evidenceHash};}
function authority(f:Fixture){return {authorize:async()=>({reviewerId:'SYN-REVIEWER',independentReview:true as const,
  permissionPolicyVersion:'SYN-SOURCE-POLICY',imageEvidenceSha256:f.evidenceHash})};}

describe('private PDF page persistence and independent review',()=>{
  it('stores exact PDF and two page PNGs, then exposes page-bound citations only after independent review',async()=>{
    const f=syntheticPdfEvidence(),db=database(),writer=new PostgresSourceRevisionWriter(db.pool);
    await expect(writer.append(f.input)).resolves.toBeNull();
    expect(db.original().original_bytes).toEqual(f.originalBytes);
    expect(db.rasters.map(r=>r.raster_sha256)).toEqual(f.rasters.map(r=>r.rasterSha256));
    expect(db.rasters.map(r=>r.raster_bytes)).toEqual(f.rasters.map(r=>r.bytes));
    expect(db.original().image_evidence.version).toBe('source-pdf-v1');
    expect(db.paragraphs().map(p=>p.image_span)).toEqual(f.spans);
    const order=db.calls.map(c=>c.sql);
    expect(order.findIndex(q=>q.startsWith('INSERT INTO source_pdf_rasters_vnext')))
      .toBeLessThan(order.findIndex(q=>q.startsWith('INSERT INTO source_originals_vnext')));
    const reader=new PostgresTemporalEvidenceReader(db.pool);
    const query={query:'POSTER',asOf:PDF_REVIEW_AT,permissionRefs:new Set([f.permissionRef]),topK:4};
    expect((await reader.retrieve(query)).envelope.retrievalState).toBe('STALE');
    const reviewer=new PostgresSourceReviewService(db.pool,authority(f),()=>PDF_REVIEW_AT);
    await expect(reviewer.review(reviewRequest(f))).resolves.toEqual({reviewId:'SYN-PDF-REVIEW',created:true});
    const result=await reader.retrieve(query);
    expect(result.envelope.retrievalState).toBe('READY');expect(result.envelope.evidence).toEqual(f.spans);
    expect(result.hits.map(h=>h.imageSpan?.pageIndex)).toEqual([0,1]);
    expect(db.revision().status).toBe('NEEDS_REVIEW');
  });
  it('copies caller-owned PDF and page bytes before awaiting storage',async()=>{
    const f=syntheticPdfEvidence(),db=database(),connect=db.pool.connect;
    db.pool.connect=async()=>{f.originalBytes.fill(0);f.rasters[0]!.bytes.fill(0);return connect();};
    await new PostgresSourceRevisionWriter(db.pool).append(f.input);
    expect(pdfHash(db.original().original_bytes)).toBe(f.originalSha256);
    expect(pdfHash(db.rasters[0].raster_bytes)).toBe(f.rasters[0]!.rasterSha256);
  });
  const badInputs:Array<[string,(f:Fixture)=>void]>=[
    ['missing page',f=>{f.input.pdfRasters.pop();}],
    ['duplicate page',f=>{f.input.pdfRasters[1]=f.rasters[0]!;}],
    ['reordered page',f=>{f.input.pdfRasters.reverse();}],
    ['page hash',f=>{f.rasters[0]!.rasterSha256='b'.repeat(64);}],
    ['page bytes',f=>{f.rasters[0]!.bytes=Buffer.from('not a PNG');}],
    ['page dimensions',f=>{f.rasters[0]!.width=7;}],
    ['original byte length',f=>{f.evidence.originalByteLength++;}],
    ['raster byte length',f=>{f.evidence.pages[0]!.rasterByteLength++;}],
    ['page membership',f=>{f.rasters[0]!.assetId='OTHER-PAGE';}],
    ['automatic activation',f=>{f.revision.status='ACTIVE';(f.revision as any).lastVerifiedAt=PDF_AT;}],
    ['IMAGE downgrade',f=>{f.revision.mediaKind='IMAGE';}],
    ['mixed image proof',f=>{(f.input as any).imageEvidence={version:'source-image-v1'};}],
  ];
  it.each(badInputs)('refuses %s before opening storage',async(_name,mutate)=>{
    const f=syntheticPdfEvidence(),db=database();mutate(f);
    await expect(new PostgresSourceRevisionWriter(db.pool).append(f.input)).rejects.toThrow();
    expect(db.calls).toHaveLength(0);
  });
  it.each(['broken PNG CRC','trailing PNG bytes','false decoded dimensions'] as const)
  ('rejects %s even when all claimed byte hashes and lengths agree',async kind=>{
    const f=syntheticPdfEvidence(),db=database(),page=f.rasters[0]!;
    if(kind==='broken PNG CRC'){page.bytes=Buffer.from(page.bytes);page.bytes[page.bytes.length-1]=page.bytes.at(-1)!^1;}
    else if(kind==='trailing PNG bytes')page.bytes=Buffer.concat([page.bytes,Buffer.from('trailing')]);
    else {const png=new PNG({width:32,height:16});png.data.fill(255);page.bytes=PNG.sync.write(png);}
    page.rasterSha256=pdfHash(page.bytes);
    const retained=f.evidence.pages[0]!;retained.rasterSha256=page.rasterSha256;retained.rasterByteLength=page.bytes.byteLength;
    retained.ocrFields=retained.ocrFields.map(field=>({...field as object,originalSha256:page.rasterSha256}));
    await expect(new PostgresSourceRevisionWriter(db.pool).append(f.input)).rejects.toThrow();
    expect(db.calls).toHaveLength(0);
  });
  it('rolls back all source writes when private page storage fails',async()=>{
    const f=syntheticPdfEvidence(),db=database(undefined,'INSERT INTO source_pdf_rasters_vnext');
    await expect(new PostgresSourceRevisionWriter(db.pool).append(f.input)).rejects.toThrow('Synthetic storage failure');
    expect(db.calls.at(-1)?.sql).toBe('ROLLBACK');expect(db.calls.some(c=>c.sql==='COMMIT')).toBe(false);
  });
  it.each(['missing page','foreign page','changed bytes','wrong dimensions','wrong bundle hash','wrong span'] as const)
  ('refuses independent approval for %s',async kind=>{
    const f=syntheticPdfEvidence(),db=database(f);
    if(kind==='missing page')db.rasters.pop();
    else if(kind==='foreign page')db.rasters[1].page_index=3;
    else if(kind==='changed bytes')db.rasters[0].raster_bytes=Buffer.from('tampered');
    else if(kind==='wrong dimensions')db.rasters[0].height=7;
    else if(kind==='wrong bundle hash')db.original().image_evidence_sha256='b'.repeat(64);
    else db.paragraphs()[1].image_span.pageIndex=0;
    await expect(new PostgresSourceReviewService(db.pool,authority(f),()=>PDF_REVIEW_AT).review(reviewRequest(f))).rejects.toThrow();
    expect(db.calls.some(c=>c.sql.startsWith('INSERT INTO source_review_attestations_vnext'))).toBe(false);
    expect(db.calls.at(-1)?.sql).toBe('ROLLBACK');
  });
  it('requires a current independent receipt for the entire retained PDF bundle',async()=>{
    const f=syntheticPdfEvidence(),db=database(f);
    const missing={authorize:async()=>({reviewerId:'SYN-REVIEWER',independentReview:true as const,permissionPolicyVersion:'SYN'})};
    await expect(new PostgresSourceReviewService(db.pool,missing,()=>PDF_REVIEW_AT).review(reviewRequest(f))).rejects.toThrow('authority');
    expect(db.calls).toHaveLength(0);
  });
  it('revalidates independent authority after private page reads and before COMMIT',async()=>{
    const f=syntheticPdfEvidence(),db=database(f);let count=0;
    const current=authority(f),revoked={authorize:async()=>++count===1?current.authorize():null};
    await expect(new PostgresSourceReviewService(db.pool,revoked,()=>PDF_REVIEW_AT).review(reviewRequest(f))).rejects.toThrow('authority');
    expect(db.calls.at(-1)?.sql).toBe('ROLLBACK');expect(db.calls.some(c=>c.sql==='COMMIT')).toBe(false);
  });
});

describe('PDF temporal row proof',()=>{
  it.each(['page range','page asset','transform','original','quote'] as const)('suppresses mismatched %s citations',async kind=>{
    const f=syntheticPdfEvidence(),db=database(f);db.approve();
    const span=db.paragraphs()[1].image_span;
    if(kind==='page range')span.pageIndex=4;
    else if(kind==='page asset')span.assetId=f.rasters[0]!.assetId;
    else if(kind==='transform')span.transformVersion='raster-identity-v1';
    else if(kind==='original')span.originalSha256=f.rasters[1]!.rasterSha256;
    else span.quote='UNREVIEWED';
    await expect(new PostgresTemporalEvidenceReader(db.pool).retrieve({query:'POSTER',asOf:PDF_REVIEW_AT,
      permissionRefs:new Set([f.permissionRef]),topK:4})).rejects.toThrow('Temporal retrieval unavailable');
    expect(db.calls.at(-1)?.sql).toBe('ROLLBACK');
  });
});
