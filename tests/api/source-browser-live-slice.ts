/** Synthetic source/DOM proof on the disposable native PostgreSQL suite. */
import type {Pool} from 'pg';
import {createHash} from 'node:crypto';
import {expect} from 'vitest';
import {PostgresSourceRevisionWriter} from '../../apps/api/src/modules/opportunities/temporal-writer-postgres.js';
import {PostgresSourceReviewService} from '../../apps/api/src/modules/opportunities/source-review-postgres.js';
import {buildSourceBrowserEvidence,parseSourceBrowserEvidence} from '../../apps/api/src/modules/opportunities/source-browser-evidence.js';
import {hashRevisionParagraphs} from '../../apps/api/src/modules/opportunities/revision-ledger.js';
import {createPostgresSourceBrowserResources} from '../../apps/api/src/modules/opportunities/source-browser-resources.js';
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
export async function proveSourceBrowserPg(admin:Pool,reader:Pool):Promise<void>{
  const base=Date.now()-60000,T=(ms:number)=>new Date(base+ms).toISOString();
  const pool={connect:async()=>{const c=await admin.connect();return {
    query:async(sql:string,params:readonly unknown[]=[])=>({rows:(await c.query(sql,[...params])).rows}),release:()=>c.release(),
  };}};
  const writer=new PostgresSourceRevisionWriter(pool),permissionRef='SYN-BROWSER-PERM';
  const assetId='SYN-BROWSER-ASSET',assetBytes=Buffer.from('SYNTHETIC captured script');
  const assetParagraphs=[{id:'p1',text:'SYNTHETIC captured script'}];
  const asset={sourceId:assetId,revisionId:'SYN-BROWSER-ASSET-1',permissionRef,
    originalSha256:sha(assetBytes),contentSha256:hashRevisionParagraphs(assetParagraphs),mediaKind:'TEXT',
    sourceClass:'SYNTHETIC',provenance:'SYNTHETIC',status:'NEEDS_REVIEW',changeKind:'NEW',
    fetchedAt:T(0),lastCheckedAt:T(0),topicCodes:[]};
  await writer.append({revision:asset,paragraphs:assetParagraphs,originalBytes:assetBytes,permissionReviewed:true});
  await admin.query(`INSERT INTO source_rights_receipts(receipt_id,actor_id,source_id,permission_ref,canonical_url,
    purposes,reviewed_by,reviewed_at,starts_at,expires_at,policy_version)
    VALUES('SYN-BROWSER-RIGHT','SYN-BROWSER-OPERATOR',$1,$2,'https://synthetic.example.edu/script.js',
      ARRAY['COLLECT','STORE','SEARCH'],'SYN-INDEPENDENT',$3,$3,$4,'SYN-BROWSER-POLICY')`,
    [assetId,permissionRef,T(-1000),T(86400000)]);
  const renderer={id:'crawlee-playwright-v1' as const,wrapperSha256:'a'.repeat(64),bwrapSha256:'b'.repeat(64),
    rootfsSha256:'c'.repeat(64),chromiumVersion:'130.0.1.2',policyVersion:'SYN-RENDERER'};
  const original=Buffer.from('<script src="/script.js"></script>'),dom=Buffer.from('<main><p>SYNTHETIC DOM</p></main>');
  const paragraphs=[{id:'p1',text:'SYNTHETIC DOM'}];
  async function appendBrowser(sourceId:string,assetRevision=asset.revisionId,assetOriginal=assetBytes,offset=2000){
    const revision={...asset,sourceId,revisionId:sourceId+'-1',mediaKind:'HTML',fetchedAt:T(offset),lastCheckedAt:T(offset),
      originalSha256:sha(original),contentSha256:hashRevisionParagraphs(paragraphs)};
    const evidence=buildSourceBrowserEvidence({sourceId,sourceRevisionId:revision.revisionId,permissionRef,
      canonicalUrl:'https://synthetic.example.edu/notice',originalBytes:original,domBytes:dom,paragraphs,
      renderer,rootSelector:'main',capturedAt:T(offset-1000),resources:[{sourceId:assetId,revisionId:assetRevision,
        permissionRef,rightsReceiptId:'SYN-BROWSER-RIGHT',canonicalUrl:'https://synthetic.example.edu/script.js',
        originalSha256:sha(assetOriginal),byteLength:assetOriginal.length,kind:'SCRIPT'}]});
    const proof=parseSourceBrowserEvidence(evidence,dom,paragraphs,{sourceId,revisionId:revision.revisionId,
      permissionRef,originalSha256:sha(original),originalByteLength:original.length,asOf:T(offset)});
    await writer.append({revision,paragraphs,originalBytes:original,permissionReviewed:true,browserEvidence:evidence,browserDomBytes:dom});
    expect((await reader.query('SELECT rendering_sha256 FROM source_browser_revision_metadata_vnext WHERE revision_id=$1',
      [revision.revisionId])).rows).toEqual([{rendering_sha256:evidence.renderingSha256}]);
    await expect(reader.query('SELECT browser_dom_bytes FROM source_browser_revision_metadata_vnext')).rejects.toThrow();
    await expect(reader.query('SELECT original_bytes FROM source_originals_vnext')).rejects.toThrow();
    expect((await reader.query('SELECT status FROM source_effective_revisions_vnext WHERE revision_id=$1',[revision.revisionId])).rows[0].status).toBe('NEEDS_REVIEW');
    const reviewer=new PostgresSourceReviewService(pool,{authorize:async()=>({reviewerId:'SYN-BROWSER-REVIEWER',
      independentReview:true,permissionPolicyVersion:'SYN-RIGHTS',browserEvidenceSha256:proof.sha256})},()=>T(offset+1000));
    const request={reviewId:sourceId+'-REVIEW',actorRef:'SYN-BROWSER-REVIEWER',sourceId,revisionId:revision.revisionId,
      permissionRef,originalSha256:sha(original),contentSha256:revision.contentSha256,decision:'APPROVED' as const};
    await expect(reviewer.review(request)).rejects.toThrow();
    await reviewer.review({...request,browserEvidenceSha256:proof.sha256});
    expect((await reader.query('SELECT status FROM source_effective_revisions_vnext WHERE revision_id=$1',[revision.revisionId])).rows[0].status).toBe('ACTIVE');
    const stored=(await admin.query('SELECT original_bytes,browser_dom_bytes FROM source_originals_vnext WHERE revision_id=$1',[revision.revisionId])).rows[0];
    expect(Buffer.from(stored.original_bytes)).toEqual(original);expect(Buffer.from(stored.browser_dom_bytes)).toEqual(dom);
    return revision;
  }
  const first=await appendBrowser('SYN-BROWSER-PG');
  const resourceStore=createPostgresSourceBrowserResources({pool,actorRef:'SYN-BROWSER-OPERATOR',
    registrations:[{sourceId:assetId,permissionRef,canonicalUrl:'https://synthetic.example.edu/script.js',
      kind:'SCRIPT',contentType:'text/javascript; charset=utf-8'}]});
  const captured=await resourceStore.load({actorRef:'SYN-BROWSER-OPERATOR'});
  expect(captured.resources[0]!.bytes).toEqual(assetBytes);
  expect(captured.resources[0]!.manifest.rightsReceiptId).toBe('SYN-BROWSER-RIGHT');
  await captured.revalidate();
  const changed=Buffer.from('SYNTHETIC corrected script');
  await writer.append({revision:{...asset,revisionId:'SYN-BROWSER-ASSET-2',supersedes:asset.revisionId,
    changeKind:'CORRECTED',fetchedAt:T(4000),lastCheckedAt:T(4000),originalSha256:sha(changed),
    contentSha256:hashRevisionParagraphs([{id:'p1',text:'SYNTHETIC corrected script'}])},
    paragraphs:[{id:'p1',text:'SYNTHETIC corrected script'}],originalBytes:changed,permissionReviewed:true});
  await expect(captured.revalidate()).rejects.toThrow('Approved browser resources unavailable');
  expect((await reader.query('SELECT status FROM source_effective_revisions_vnext WHERE revision_id=$1',[first.revisionId])).rows[0].status).toBe('NEEDS_REVIEW');
  const second=await appendBrowser('SYN-BROWSER-PG-SECOND','SYN-BROWSER-ASSET-2',changed,6000);
  const renewed=await resourceStore.load({actorRef:'SYN-BROWSER-OPERATOR'});
  await admin.query(`INSERT INTO source_rights_revocations(receipt_id,revoked_by,revoked_at,reason_ref)
    VALUES('SYN-BROWSER-RIGHT','SYN-OPERATOR',clock_timestamp(),'SYN-REVOKED')`);
  await expect(renewed.revalidate()).rejects.toThrow('Approved browser resources unavailable');
  expect((await reader.query('SELECT status FROM source_effective_revisions_vnext WHERE revision_id=$1',[second.revisionId])).rows[0].status).toBe('NEEDS_REVIEW');
  await expect(admin.query('UPDATE source_originals_vnext SET browser_dom_bytes=$1 WHERE revision_id=$2',
    [Buffer.from('changed'),first.revisionId])).rejects.toThrow();
}
