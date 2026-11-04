import {createHash} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {PNG} from 'pngjs';
import {buildOcrRequest,parseOcrResponse} from '../../packages/ai/src/clova-wire.js';
import {normalizeOcrEvidence} from '../../packages/ai/src/ocr-evidence.js';
import {decodeApprovedRaster} from '../../packages/ai/src/raster.js';
import {createApprovedImageExtractor,type SourceImageExtractorInput} from '../../apps/api/src/modules/opportunities/approved-image-extractor.js';
import {parseSourceImageEvidence} from '../../apps/api/src/modules/opportunities/source-image-evidence.js';
import {createApprovedDurableSourceExecutor} from '../../apps/api/src/modules/opportunities/source-ingestion-durable.js';
import {PostgresSourceRevisionWriter} from '../../apps/api/src/modules/opportunities/temporal-writer-postgres.js';
import {PostgresSourceReviewService} from '../../apps/api/src/modules/opportunities/source-review-postgres.js';
import {PostgresTemporalEvidenceReader} from '../../apps/api/src/modules/opportunities/temporal-postgres.js';
import {createPostgresTemporalGateway} from '../../apps/api/src/modules/opportunities/temporal-gateway.js';

const sha=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
const url='https://synthetic.example.edu/poster.png',sourceId='SYN-IMAGE',permissionRef='SYN-PERMISSION';
const png=new PNG({width:8,height:8});png.data.fill(255);const original=PNG.sync.write(png);
const policy={sourceId,permissionRef,canonicalUrl:url,approvedOrigin:'https://synthetic.example.edu',
  sourceClass:'LICENSED_EXTERNAL' as const,provenance:'REAL_APPROVED' as const,rightsReviewed:true};
const quote='합성 공고 모집';
const epoch=Date.parse('2026-11-05T00:00:00.000Z');
function ocr(media:ReturnType<typeof decodeApprovedRaster>){
  const request=buildOcrRequest(media,'00000000-0000-4000-8000-000000000001',epoch);
  return normalizeOcrEvidence(media,parseOcrResponse(request.context,{
    version:'V2',requestId:'00000000-0000-4000-8000-000000000001',images:[{
      name:'image',inferResult:'SUCCESS',fields:[{inferText:quote,inferConfidence:.9,type:'NORMAL',lineBreak:true,
        boundingPoly:{vertices:[{x:0,y:0},{x:4,y:0},{x:4,y:2},{x:0,y:2}]}}],
    }],
  }));
}
function bundle(input:any){
  const media=decodeApprovedRaster(input.content,{sourceRevisionId:input.sourceRevisionId,
    assetId:input.assetId,originalSha256:input.originalSha256});
  const candidate=ocr(media);
  return {version:'source-image-v1',sourceId:input.sourceId,sourceRevisionId:input.sourceRevisionId,
    permissionRef:input.permissionRef,assetId:media.assetId,originalSha256:media.originalSha256,
    rasterSha256:media.originalSha256,format:media.format,width:media.width,height:media.height,
    transformVersion:media.transformVersion,reviewState:'NEEDS_REVIEW',
    transformReceiptId:'TRANSFORM-1',externalAiReceiptId:'EXTERNAL-1',
    processingPolicyVersion:'MEDIA-POLICY-1',ocrFields:candidate.fields};
}

function deferred<T>(){let resolve!:(value:T)=>void,reject!:(reason?:unknown)=>void;
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function processingHarness(options:{enabled?:boolean;noProvider?:boolean;timeoutMs?:number}={}){
  let allowed=true,sourceAllowed=true,at=epoch+10_000;
  let patch:(receipt:any)=>any=value=>value;
  const authority={authorize:vi.fn(async(request:any)=>{
    if(!allowed)return null;
    const {now:_at,purpose,...binding}=request;
    return patch({...binding,purpose,receiptId:purpose+'-1',policyVersion:'SYN-MEDIA-POLICY-1',
      reviewedBy:'SYN-INDEPENDENT',reviewedAt:new Date(epoch-3600_000).toISOString(),
      startsAt:new Date(epoch).toISOString(),expiresAt:new Date(epoch+3600_000).toISOString(),revokedAt:null});
  })};
  const decode=vi.fn(async(bytes:Uint8Array,binding:any)=>decodeApprovedRaster(bytes,binding));
  const provider={readCandidate:vi.fn(async(input:any)=>{await input.revalidate();return ocr(input.media);})};
  const input:SourceImageExtractorInput={actorRef:'SYN-OPERATOR',sourceId,sourceRevisionId:'SYN-IMAGE-R1',
    permissionRef,assetId:'SYN-ASSET',canonicalUrl:url,originalSha256:sha(original),content:original,contentType:'image/png',
    assertSourceRights:async()=>{if(!sourceAllowed)throw new Error('Source revoked');}};
  const adapter=createApprovedImageExtractor({authority,decode,now:()=>new Date(at).toISOString(),
    enabled:options.enabled??true,...(options.noProvider?{}:{ocr:provider}),
    ...(options.timeoutMs===undefined?{}:{timeoutMs:options.timeoutMs})});
  return {adapter,input,authority,decode,provider,revoke:()=>{allowed=false;},
    revokeSource:()=>{sourceAllowed=false;},advance:(value:number)=>{at=value;},
    patch:(mutate:(receipt:any)=>any)=>{patch=mutate;}};
}

function sqlMemory(){
  const queries:Array<{sql:string;params:readonly unknown[]}>=[];
  const rows=new Map<string,any>();let head:string|null=null,review:any=null;
  const pool={connect:async()=>({query:async(sql:string,params:readonly unknown[]=[])=>{
    queries.push({sql,params});
    if(sql.startsWith('INSERT INTO source_revisions_vnext')){
      rows.set(String(params[0]),{revision_id:params[0],source_id:params[1],original_sha256:params[3],
        content_sha256:params[4],media_kind:params[5],source_class:params[6],permission_ref:params[7],
        provenance:params[8],status:params[9],change_kind:params[10],fetched_at:params[12]});
      return {rows:[]};
    }
    if(sql.startsWith('INSERT INTO source_paragraphs_vnext')){
      rows.get(String(params[0])).paragraphs=JSON.parse(String(params[1]));return {rows:[]};
    }
    if(sql.startsWith('INSERT INTO source_originals_vnext')){
      Object.assign(rows.get(String(params[0])),{original_bytes:params[2],captured_at:params[3],
        image_evidence:params[4]?JSON.parse(String(params[4])):null,image_evidence_sha256:params[5]??null});return {rows:[]};
    }
    if(sql.startsWith('UPDATE source_ingest_heads')){head=String(params[1]);return {rows:[{source_id:sourceId}]};}
    if(sql.startsWith('INSERT INTO source_review_attestations_vnext')){
      review={review_id:params[0],reviewer_id:params[2],decision:params[3],checked_at:params[4],
        original_sha256:params[5],content_sha256:params[6],permission_policy_version:params[7],
        image_evidence_sha256:params[8]??null};return {rows:[]};
    }
    const current=head?rows.get(head):undefined;
    if(sql.includes('confirmed_conflict'))return {rows:[{confirmed_conflict:false}]};
    if(sql.includes('AS blocked_rights'))return {rows:[{blocked_rights:false,unknown:false,stale:Boolean(current)}]};
    if(sql.includes('WITH latest')&&sql.includes('score.score')){
      const approved=current&&review?.decision==='APPROVED'&&review.image_evidence_sha256===current.image_evidence_sha256;
      return {rows:approved?current.paragraphs.map((p:any)=>({source_id:sourceId,revision_id:head,
        paragraph_id:p.id,paragraph_text:p.text,score:1,media_kind:current.media_kind,
        original_sha256:current.original_sha256,image_span:p.imageSpan??null})):[]};
    }
    if(sql.includes('FROM source_ingest_heads h'))return {rows:current?[{...current,etag:null,last_modified:null,has_image_evidence:Boolean(current.image_evidence)}]:[]};
    if(sql.includes('FOR UPDATE'))return {rows:[{revision_id:head,fetched_at:current?.fetched_at??null}]};
    if(sql.includes('FROM source_revisions_vnext'))return {rows:current?[current]:[]};
    if(sql.includes('FROM source_originals_vnext'))return {rows:current?[current]:[]};
    if(sql.includes('FROM source_paragraphs_vnext'))return {rows:current?.paragraphs.map((p:any,i:number)=>({
      paragraph_id:p.id,paragraph_text:p.text,paragraph_ordinal:i+1,image_span:p.imageSpan??null}))??[]};
    if(sql.includes('FROM source_review_attestations_vnext'))return {rows:review?[review]:[]};
    if(sql.startsWith('INSERT INTO source_http_validators'))return {rows:[{source_id:sourceId}]};
    return {rows:[]};
  },release:()=>{}})};
  return {pool,queries,current:()=>head?rows.get(head):null};
}
function harness(imageExtractor?:any){
  const db=sqlMemory();let tick=0,rights=true,body=original;
  const now=()=>new Date(epoch+tick++*1000).toISOString();
  const resolver={resolve:async()=>rights?{sourceId,permissionRef,canonicalUrl:url,status:'APPROVED' as const,
    policyVersion:'SOURCE-POLICY-1',reviewedBy:'SYN-INDEPENDENT',reviewedAt:'2026-11-04T00:00:00.000Z',
    allowedPurposes:new Set(['COLLECT','STORE','EXTERNAL_TRANSFER'] as const)}:null};
  const extractor={extract:vi.fn(async()=>{throw new Error('Text extractor cannot receive binary');})};
  const executor=createApprovedDurableSourceExecutor({policies:new Map([[sourceId,policy]]),rights:resolver,
    now,egress:{resolveAddresses:async()=>['8.8.8.8'],
      requestPinned:async()=>new Response(new Uint8Array(body),{headers:{'content-type':'image/png'}})},
    extractor,readerPool:db.pool,writer:new PostgresSourceRevisionWriter(db.pool),
    ...(imageExtractor?{imageExtractor}:{}),
  });
  return {db,executor,extractor,now,revoke:()=>{rights=false;},setImage:(bytes:Buffer)=>{body=bytes;}};
}
describe('approved image draft, independent review and temporal citation integration',()=>{
  it('carries retained OCR bbox evidence through the durable writer and independent review into IMAGE retrieval',async()=>{
    const processing=processingHarness();
    const x=harness(processing.adapter);
    const result=await x.executor.execute({sourceId,permissionRef,actorRef:'SYN-OPERATOR'});
    expect(result.kind).toBe('NEW_DRAFT');expect(x.extractor.extract).not.toHaveBeenCalled();
    const row=x.db.current();
    expect(row.status).toBe('NEEDS_REVIEW');expect(row.image_evidence_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(row.image_evidence.originalSha256).toBe(sha(original));
    expect(row.paragraphs[0].imageSpan).toMatchObject({kind:'IMAGE',quote,sourceRevisionId:row.revision_id,
      bboxNorm:[0,0,.5,.25],originalSha256:sha(original)});
    const reader=new PostgresTemporalEvidenceReader(x.db.pool);
    const evidencePolicy={query:'공고',asOf:x.now(),permissionRefs:new Set([permissionRef]),topK:3};
    expect((await reader.retrieve(evidencePolicy)).envelope.retrievalState).toBe('STALE');
    const service=new PostgresSourceReviewService(x.db.pool,{authorize:async()=>({
      reviewerId:'SYN-REVIEWER',independentReview:true,permissionPolicyVersion:'SOURCE-POLICY-1',
      imageEvidenceSha256:row.image_evidence_sha256,
    })},x.now);
    await service.review({reviewId:'SYN-REVIEW',actorRef:'SYN-REVIEWER',sourceId,revisionId:row.revision_id,
      permissionRef,originalSha256:row.original_sha256,contentSha256:row.content_sha256,decision:'APPROVED',
      imageEvidenceSha256:row.image_evidence_sha256} as any);
    const actor={actorId:'SYN-ACTOR',role:'BETA' as const,sessionIdHash:'s'.repeat(32),csrfToken:'c'.repeat(32),
      sessionExpiresAt:'2026-11-06T00:00:00.000Z',schoolMailProofExpiresAt:'2026-11-06T00:00:00.000Z',betaAllowed:true};
    const gateway=createPostgresTemporalGateway(reader,{resolveFor:async()=>({
      permissionRefs:new Set([permissionRef]),sourceIds:new Set([sourceId]),
      policyVersion:'SOURCE-POLICY-1',sourceHeadVersion:row.revision_id})});
    const asOf=x.now();const retrieved=await gateway.query({actor,query:'공고',asOf,topK:3,now:asOf});
    expect(retrieved.envelope.retrievalState).toBe('READY');
    expect(retrieved.envelope.evidence).toEqual([row.paragraphs[0].imageSpan]);
    expect(retrieved.envelope.evidence[0]?.kind).toBe('IMAGE');
    expect(x.db.queries.some(q=>q.sql.includes('image_evidence_sha256'))).toBe(true);
    // Equal image bytes only update check observations, preserving the exact
    // reviewed OCR bundle. A new original creates an unreviewed successor.
    const repeat=await x.executor.execute({sourceId,permissionRef,actorRef:'SYN-OPERATOR'});
    expect(repeat).toEqual({kind:'NOT_MODIFIED',revisionId:row.revision_id});
    expect(processing.provider.readCandidate).toHaveBeenCalledOnce();
    const revisedPng=new PNG({width:8,height:8});revisedPng.data.fill(127);
    x.setImage(PNG.sync.write(revisedPng));
    const correction=await x.executor.execute({sourceId,permissionRef,actorRef:'SYN-OPERATOR'});
    expect(correction.kind).toBe('CHANGED_DRAFT');expect(correction.revisionId).not.toBe(row.revision_id);
    const changed=await reader.retrieve({...evidencePolicy,asOf:x.now()});
    expect(changed.envelope.retrievalState).toBe('STALE');expect(changed.envelope.evidence).toEqual([]);
    expect(x.db.queries.filter(q=>q.sql.startsWith('INSERT INTO source_invalidation_events')).at(-1)?.params)
      .toEqual(expect.arrayContaining([row.revision_id,correction.revisionId,'CORRECTED']));
    expect(x.db.queries.filter(q=>q.sql.startsWith('INSERT INTO source_invalidation_deliveries')).at(-1)?.params[1])
      .toEqual(['RETRIEVAL','CLAIMS','FEED','NOTICES','AI_CACHE']);
  });
  it('does not persist a returned OCR candidate after source transfer permission is revoked',async()=>{
    const processing=processingHarness(),x=harness(processing.adapter);
    processing.provider.readCandidate.mockImplementationOnce(async(input)=>{x.revoke();return ocr(input.media);});
    await expect(x.executor.execute({sourceId,permissionRef,actorRef:'SYN-OPERATOR'})).rejects.toThrow();
    expect(x.db.current()).toBeNull();
    expect(x.db.queries.some(q=>q.sql.startsWith('INSERT INTO source_revisions_vnext'))).toBe(false);
  });
  it.each(['bbox','bundle','stored hash','human receipt'] as const)('refuses review with mismatched %s proof',async(kind)=>{
    const processing=processingHarness(),x=harness(processing.adapter);
    await x.executor.execute({sourceId,permissionRef,actorRef:'SYN-OPERATOR'});
    const row=x.db.current(),hash=row.image_evidence_sha256;
    if(kind==='bbox')row.paragraphs[0].imageSpan.bboxNorm=[0,0,.9,.25];
    if(kind==='bundle')row.image_evidence.assetId='OTHER-ASSET';
    if(kind==='stored hash')row.image_evidence_sha256='b'.repeat(64);
    const service=new PostgresSourceReviewService(x.db.pool,{authorize:async()=>({
      reviewerId:'SYN-REVIEWER',independentReview:true,permissionPolicyVersion:'SOURCE-POLICY-1',
      ...(kind==='human receipt'?{}:{imageEvidenceSha256:hash}),
    })},x.now);
    await expect(service.review({reviewId:'SYN-REVIEW',actorRef:'SYN-REVIEWER',sourceId,revisionId:row.revision_id,
      permissionRef,originalSha256:row.original_sha256,contentSha256:row.content_sha256,decision:'APPROVED',
      imageEvidenceSha256:hash})).rejects.toThrow();
    expect(x.db.queries.some(q=>q.sql.startsWith('INSERT INTO source_review_attestations_vnext'))).toBe(false);
  });
  it('refuses binary input when the explicitly reviewed image adapter is absent',async()=>{
    const x=harness();await expect(x.executor.execute({sourceId,permissionRef,actorRef:'SYN-OPERATOR'})).rejects.toThrow();
    expect(x.db.current()).toBeNull();expect(x.extractor.extract).not.toHaveBeenCalled();
  });
});

describe('private reviewed image adapter boundaries',()=>{
  it.each([{enabled:false},{noProvider:true}])('stays closed without explicit adapter enablement and guarded provider %j',async(options)=>{
    const x=processingHarness(options);await expect(x.adapter.extract(x.input)).rejects.toThrow('Approved image extraction unavailable');
    expect(x.authority.authorize).not.toHaveBeenCalled();expect(x.decode).not.toHaveBeenCalled();expect(x.provider.readCandidate).not.toHaveBeenCalled();
  });
  const badReceipts:Array<[string,(r:any)=>any]>=[
    ['missing',()=>null],['source',r=>({...r,sourceId:'OTHER'})],['revision',r=>({...r,sourceRevisionId:'OTHER'})],
    ['original hash',r=>({...r,originalSha256:'b'.repeat(64)})],['permission',r=>({...r,permissionRef:'OTHER'})],
    ['actor',r=>({...r,actorRef:'OTHER'})],['URL',r=>({...r,canonicalUrl:'https://other.example.edu/poster.png'})],
    ['purpose',r=>({...r,purpose:r.purpose==='TRANSFORM'?'EXTERNAL_AI':'TRANSFORM'})],
    ['independent reviewer',r=>({...r,reviewedBy:'SYN-OPERATOR'})],
    ['revoked',r=>({...r,revokedAt:new Date(epoch).toISOString()})],
    ['future',r=>({...r,startsAt:new Date(epoch+100_000).toISOString()})],
    ['expired',r=>({...r,expiresAt:new Date(epoch+10_000).toISOString()})],
    ['extra allow flag',r=>({...r,allowed:true})],
  ];
  it.each(badReceipts)('refuses a TRANSFORM receipt with wrong %s before decoding',async(_name,mutate)=>{
    const x=processingHarness();x.patch(mutate);
    await expect(x.adapter.extract(x.input)).rejects.toThrow('Approved image extraction unavailable');
    expect(x.decode).not.toHaveBeenCalled();expect(x.provider.readCandidate).not.toHaveBeenCalled();
  });
  it('requires an independent EXTERNAL_AI receipt after local raster validation',async()=>{
    const x=processingHarness();x.patch(r=>r.purpose==='EXTERNAL_AI'?null:r);
    await expect(x.adapter.extract(x.input)).rejects.toThrow();expect(x.decode).toHaveBeenCalledOnce();
    expect(x.provider.readCandidate).not.toHaveBeenCalled();
  });
  it.each(['application/pdf','image/gif','text/plain'])('refuses unsupported %s without rendering or OCR',async(contentType)=>{
    const x=processingHarness();await expect(x.adapter.extract({...x.input,contentType})).rejects.toThrow();
    expect(x.decode).not.toHaveBeenCalled();expect(x.provider.readCandidate).not.toHaveBeenCalled();
  });
  it.each(['hash','bytes'] as const)('refuses wrong original %s before any authority or decoder work',async(kind)=>{
    const x=processingHarness();const input={...x.input,...(kind==='hash'?{originalSha256:'a'.repeat(64)}:{content:new Uint8Array(256*1024+1)})};
    await expect(x.adapter.extract(input)).rejects.toThrow();expect(x.authority.authorize).not.toHaveBeenCalled();expect(x.decode).not.toHaveBeenCalled();
  });
  it.each(['receipt','source','expired'] as const)('rechecks %s after deferred raster work before OCR',async(kind)=>{
    const x=processingHarness(),gate=deferred<ReturnType<typeof decodeApprovedRaster>>(),entered=deferred<void>();
    x.decode.mockImplementationOnce(async()=>{entered.resolve();return gate.promise;});
    const pending=x.adapter.extract(x.input);const checked=expect(pending).rejects.toThrow();
    await entered.promise;if(kind==='receipt')x.revoke();else if(kind==='source')x.revokeSource();else x.advance(epoch+3600_000);
    gate.resolve(decodeApprovedRaster(original,x.input));await checked;expect(x.provider.readCandidate).not.toHaveBeenCalled();
  });
  it('rejects a changed reviewed receipt even if the replacement remains otherwise valid',async()=>{
    const x=processingHarness();let transformReads=0;
    x.patch(r=>r.purpose==='TRANSFORM'&&++transformReads>1?{...r,receiptId:'TRANSFORM-REPLACEMENT'}:r);
    await expect(x.adapter.extract(x.input)).rejects.toThrow();expect(x.provider.readCandidate).not.toHaveBeenCalled();
  });
  it.each(['decode','provider'] as const)('settles cancellation while %s is pending and observes its late rejection',async(stage)=>{
    const x=processingHarness(),gate=deferred<any>(),entered=deferred<void>(),abort=new AbortController();
    if(stage==='decode')x.decode.mockImplementationOnce(async()=>{entered.resolve();return gate.promise;});
    else x.provider.readCandidate.mockImplementationOnce(async()=>{entered.resolve();return gate.promise;});
    const pending=x.adapter.extract({...x.input,signal:abort.signal});const checked=expect(pending).rejects.toThrow();
    await entered.promise;abort.abort();await checked;gate.reject(new Error('late synthetic completion'));
    await Promise.resolve();await Promise.resolve();
    if(stage==='decode')expect(x.provider.readCandidate).not.toHaveBeenCalled();
  });
  it('discards a late OCR candidate when source permission changed during the provider call',async()=>{
    const x=processingHarness(),gate=deferred<any>(),entered=deferred<any>();
    x.provider.readCandidate.mockImplementationOnce(async(input)=>{entered.resolve(input);return gate.promise;});
    const pending=x.adapter.extract(x.input);const checked=expect(pending).rejects.toThrow();
    const request=await entered.promise;x.revokeSource();gate.resolve(ocr(request.media));await checked;
  });
  it('binds caller identity and bytes before asynchronous work and revalidates after returning a candidate',async()=>{
    const x=processingHarness(),gate=deferred<ReturnType<typeof decodeApprovedRaster>>(),entered=deferred<void>();
    x.decode.mockImplementationOnce(async(bytes,binding)=>{entered.resolve();return gate.promise;});
    const bytes=Buffer.from(original),request={...x.input,content:bytes};
    const pending=x.adapter.extract(request);await entered.promise;
    request.sourceRevisionId='MUTATED';request.permissionRef='MUTATED';bytes.fill(0);
    gate.resolve(decodeApprovedRaster(original,x.input));const result=await pending;
    expect(result.evidence.sourceRevisionId).toBe(x.input.sourceRevisionId);expect(result.evidence.permissionRef).toBe(permissionRef);
    expect(result.evidence.reviewState).toBe('NEEDS_REVIEW');x.revoke();await expect(result.revalidate()).rejects.toThrow();
  });
  it.each(['bbox','revision','original','approved'] as const)('rejects unbound or unreviewable %s OCR output',async(kind)=>{
    const x=processingHarness();
    x.provider.readCandidate.mockImplementationOnce(async(input)=>{
      const value=structuredClone(ocr(input.media));
      if(kind==='bbox')value.fields[0]!.bboxNorm[2]=.9;
      else if(kind==='revision')value.fields[0]!.sourceRevisionId='OTHER';
      else if(kind==='original')value.fields[0]!.originalSha256='b'.repeat(64);
      else (value as any).reviewState='APPROVED';
      return value;
    });
    await expect(x.adapter.extract(x.input)).rejects.toThrow();
  });
  it('rejects invalid decoded dimensions before invoking the guarded OCR port',async()=>{
    const x=processingHarness();
    x.decode.mockImplementationOnce(async(bytes,binding)=>({...decodeApprovedRaster(bytes,binding),width:5000}));
    await expect(x.adapter.extract(x.input)).rejects.toThrow();expect(x.provider.readCandidate).not.toHaveBeenCalled();
  });
  it('owns decoder metadata before awaiting later authority calls',async()=>{
    const x=processingHarness(),decoded=decodeApprovedRaster(original,x.input);
    x.decode.mockImplementationOnce(async()=>decoded);
    x.patch(r=>{if(r.purpose==='EXTERNAL_AI')decoded.sourceRevisionId='LATE-MUTATION';return r;});
    const result=await x.adapter.extract(x.input);
    expect(result.evidence.sourceRevisionId).toBe(x.input.sourceRevisionId);
  });
  it('derives paragraph/span bytes again from retained fields rather than trusting a supplied line projection',()=>{
    const input=processingHarness().input,evidence=bundle(input);
    const parsed=parseSourceImageEvidence(evidence,{sourceId,revisionId:input.sourceRevisionId,permissionRef,originalSha256:sha(original)});
    expect(parsed.paragraphs).toEqual([{id:'ocr-line-1',text:quote}]);expect(parsed.spans[0]?.bboxNorm).toEqual([0,0,.5,.25]);
    expect(parsed.sha256).toBe(sha(JSON.stringify(parsed.evidence)));
  });
});
