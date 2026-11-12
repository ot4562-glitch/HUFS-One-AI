import {describe,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {buildSourceBrowserEvidence,parseSourceBrowserEvidence} from '../../apps/api/src/modules/opportunities/source-browser-evidence.js';
import {hashRevisionParagraphs} from '../../apps/api/src/modules/opportunities/revision-ledger.js';
import {PostgresSourceRevisionWriter} from '../../apps/api/src/modules/opportunities/temporal-writer-postgres.js';
import {PostgresSourceReviewService} from '../../apps/api/src/modules/opportunities/source-review-postgres.js';
const original=Buffer.from('<main>SYNTHETIC original script</main>'),dom=Buffer.from('<main><p>SYNTHETIC rendered</p></main>');
const paragraphs=[{id:'p1',text:'SYNTHETIC rendered'}],now='2026-11-12T00:00:01Z';
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const revision={revisionId:'SYN-BROWSER-REV',sourceId:'SYN-BROWSER-SOURCE',permissionRef:'SYN-PERM',
  originalSha256:sha(original),contentSha256:hashRevisionParagraphs(paragraphs),mediaKind:'HTML',
  sourceClass:'SYNTHETIC',provenance:'SYNTHETIC',status:'NEEDS_REVIEW',changeKind:'NEW',fetchedAt:now,lastCheckedAt:now,topicCodes:[]};
const evidence=buildSourceBrowserEvidence({sourceId:revision.sourceId,sourceRevisionId:revision.revisionId,
  permissionRef:revision.permissionRef,canonicalUrl:'https://synthetic.example.edu/notice',originalBytes:original,
  domBytes:dom,paragraphs,rootSelector:'main',capturedAt:'2026-11-12T00:00:00Z',resources:[],
  renderer:{id:'crawlee-playwright-v1',wrapperSha256:'a'.repeat(64),bwrapSha256:'b'.repeat(64),rootfsSha256:'c'.repeat(64),
    chromiumVersion:'130.0.1.2',policyVersion:'SYN-POLICY'}});
const bundleSha=parseSourceBrowserEvidence(evidence,dom,paragraphs,{sourceId:revision.sourceId,revisionId:revision.revisionId,
  permissionRef:revision.permissionRef,originalSha256:sha(original),originalByteLength:original.length,asOf:now}).sha256;
const reviewRequest={reviewId:'SYN-REVIEW',actorRef:'SYN-REVIEWER',sourceId:revision.sourceId,revisionId:revision.revisionId,
  permissionRef:revision.permissionRef,originalSha256:revision.originalSha256,contentSha256:revision.contentSha256,decision:'APPROVED' as const};
function writer(){
  const query=vi.fn(async(sql:string,_params?:readonly unknown[])=>({rows:
    sql.includes('SELECT revision_id,fetched_at')?[{revision_id:null,fetched_at:null}]:
    sql.includes('UPDATE source_ingest_heads')?[{source_id:revision.sourceId}]:[]}));
  return {query,service:new PostgresSourceRevisionWriter({connect:async()=>({query,release:()=>{}})})};
}
function reviewer(options:{omitAck?:boolean;dom?:Uint8Array}={}){
  const query=vi.fn(async(sql:string,_params?:readonly unknown[])=>({rows:
    sql.includes('FOR UPDATE')?[{revision_id:revision.revisionId}]:
    sql.includes('FROM source_revisions_vnext')?[{revision_id:revision.revisionId,source_id:revision.sourceId,
      permission_ref:revision.permissionRef,original_sha256:sha(original),content_sha256:revision.contentSha256,
      status:'NEEDS_REVIEW',change_kind:'NEW',provenance:'SYNTHETIC',source_class:'SYNTHETIC',media_kind:'HTML',fetched_at:now}]:
    sql.includes('FROM source_originals_vnext')?[{original_sha256:sha(original),original_bytes:original,captured_at:now,
      browser_evidence:evidence,browser_evidence_sha256:bundleSha,browser_dom_bytes:options.dom??dom}]:
    sql.includes('FROM source_paragraphs_vnext')?paragraphs.map((p,i)=>({paragraph_id:p.id,paragraph_text:p.text,paragraph_ordinal:i+1})):[]}));
  const authorize=vi.fn(async()=>({reviewerId:'SYN-REVIEWER',independentReview:true as const,permissionPolicyVersion:'SYN-RIGHTS',
    ...(options.omitAck?{}:{browserEvidenceSha256:bundleSha})}));
  return {query,authorize,service:new PostgresSourceReviewService({connect:async()=>({query,release:()=>{}})},
    {authorize},()=> '2026-11-12T00:00:02Z')};
}
describe('#445 immutable browser DOM storage and independent review',()=>{
  it('stores original and DOM bytes and their bound proof in the same source transaction',async()=>{
    const x=writer();await x.service.append({revision,paragraphs,originalBytes:original,permissionReviewed:true,
      browserEvidence:evidence,browserDomBytes:dom});
    const insert=x.query.mock.calls.find(([sql])=>sql.includes('INSERT INTO source_originals_vnext'))!;
    expect(insert[0]).toContain('browser_evidence');expect(insert[1]).toContain(bundleSha);
    expect(insert[1]!.filter(v=>v instanceof Uint8Array)).toEqual([original,dom]);
    expect(x.query.mock.calls.at(-1)![0]).toBe('COMMIT');
  });
  it('rejects browser self-approval and mismatched DOM before touching SQL',async()=>{
    for(const change of [{revision:{...revision,status:'ACTIVE',lastVerifiedAt:now}},{browserDomBytes:Buffer.from('changed')}]){
      const x=writer();await expect(x.service.append({revision,paragraphs,originalBytes:original,permissionReviewed:true,
        browserEvidence:evidence,browserDomBytes:dom,...change})).rejects.toThrow();expect(x.query).not.toHaveBeenCalled();
    }
  });
  it('requires a matching independent human acknowledgement of the exact browser bundle',async()=>{
    const x=reviewer();await x.service.review({...reviewRequest,browserEvidenceSha256:bundleSha});
    const insert=x.query.mock.calls.find(([sql])=>sql.includes('INSERT INTO source_review_attestations_vnext'))!;
    expect(insert[0]).toContain('browser_evidence_sha256');expect(insert[1]).toContain(bundleSha);
    await expect(reviewer().service.review(reviewRequest)).rejects.toThrow();
    const noAck=reviewer({omitAck:true});
    await expect(noAck.service.review({...reviewRequest,browserEvidenceSha256:bundleSha})).rejects.toThrow('authority');
    expect(noAck.query).not.toHaveBeenCalled();
  });
  it('refuses altered retained DOM even when the reviewer supplies the previous bundle hash',async()=>{
    const x=reviewer({dom:Buffer.from('changed')});
    await expect(x.service.review({...reviewRequest,browserEvidenceSha256:bundleSha})).rejects.toThrow();
    expect(x.query.mock.calls.some(([sql])=>sql.includes('INSERT INTO source_review_attestations_vnext'))).toBe(false);
  });
});
