/** Real compiled executor + real Crawlee/Cheerio. SQL and HTTPS are synthetic
 * injected ports; no socket, source registry, database, credentials or NCP. */
import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createApprovedDurableSourceExecutor} from '../../../dist/apps/api/src/modules/opportunities/source-ingestion-durable.js';
import {createApprovedCheerioAcquisition,createCheerioApprovedNoticeExtractor} from './native-worker.mjs';

const canonicalUrl='https://synthetic.example.edu/notice';
const bytes=Buffer.from('<!doctype html><main><h1>합성 공고</h1><p>가상 모집 안내</p></main>');
function fixture({poison=false,revokeDuringFetch=false}={}){
  let head=null,etag=null,revoked=false,calls=0,observed=0;
  const stored=[];
  const version={gitSha:'a'.repeat(40),buildSha:'b'.repeat(64),migrationVersion:'SYN-MIGRATION',
    adapterVersion:'SYN-ADAPTER',datasetRevision:'SYN-DATASET',schemaVersion:1};
  const policy={sourceId:'SYN-CHEERIO-SOURCE',permissionRef:'SYN-PERMISSION',canonicalUrl,
    approvedOrigin:'https://synthetic.example.edu',rightsReviewed:true,
    sourceClass:'LICENSED_EXTERNAL',provenance:'REAL_APPROVED'};
  const service=createApprovedDurableSourceExecutor({policies:new Map([[policy.sourceId,policy]]),
    rights:{resolve:async()=>({...policy,status:revoked?'REVOKED':'APPROVED',policyVersion:'SYN-RIGHTS',
      reviewedBy:'SYN-INDEPENDENT',reviewedAt:'2026-11-10T00:00:00Z',allowedPurposes:new Set(['COLLECT','STORE'])})},
    acquisition:createApprovedCheerioAcquisition(),
    runtimeVersion:{expected:version,reader:{minSchemaVersion:1,maxSchemaVersion:1},loadCurrent:async()=>({...version})},
    budget:{reserve:async()=>true},
    // Synthetic private operator evidence; no real source, robots request or
    // NCP budget is touched by this test.
    preflight:{loadCurrent:async({sourceId,permissionRef,canonicalUrl,now})=>({
      registration:{sourceId,permissionRef,canonicalUrl,
        publisher:'Synthetic notice',
        sourceClass:'PUBLIC_WEB',observedAt:'2026-11-10T00:00:00Z',
        rights:{collect:true,store:true,search:false,externalTransfer:false}},
      scope:{sourceId,approvedOrigin:new URL(canonicalUrl).origin+'/',
        pathPrefixes:['/notice'],robotsStatus:'REVIEWED_PERMITTED',
        termsStatus:'REVIEWED_PERMITTED',policyRef:'SYN-POLICY',
        observedAt:'2026-11-10T00:00:00Z'},
      pageUrl:canonicalUrl,now,
      remainingRequests:2,remainingBytes:262144,attemptsForUrl:0,maxAttempts:1,
    })},
    extractor:createCheerioApprovedNoticeExtractor({rootSelector:'main'}),
    egress:{resolveAddresses:async()=>poison?['127.0.0.1']:['8.8.8.8'],requestPinned:async({init})=>{
      calls++;if(revokeDuringFetch)revoked=true;
      if(new Headers(init.headers).get('if-none-match')==='"SYN-ORIGIN"')return new Response(null,{status:304});
      return new Response(bytes,{headers:{'content-type':'text/html; charset=utf-8',etag:'"SYN-ORIGIN"'}});
    }},readerPool:{connect:async()=>({query:async()=>({rows:head?[{
      revision_id:head.revisionId,original_sha256:head.originalSha256,content_sha256:head.contentSha256,
      fetched_at:head.fetchedAt,permission_ref:head.permissionRef,etag,last_modified:null,
      media_kind:head.mediaKind,has_image_evidence:false,has_pdf_evidence:false,
    }]:[]}),release:()=>{}})},
    writer:{append:async value=>{stored.push(value);head=value.revision;return null;},
      storeHttpValidators:async value=>{etag=value.etag;},observeUnchanged:async()=>{observed++;}},
    now:()=> '2026-11-11T00:00:00Z',
  });
  return {service,input:{sourceId:policy.sourceId,permissionRef:policy.permissionRef,actorRef:'SYN-OPERATOR'},
    stored,calls:()=>calls,observed:()=>observed};
}
describe('#445 actual compiled durable executor with native CheerioCrawler',()=>{
  it('retains exact origin SHA and review-only paragraphs, then observes conditional 304',async()=>{
    const f=fixture(),result=await f.service.execute(f.input);
    assert.equal(result.kind,'NEW_DRAFT');assert.equal(f.calls(),1);
    assert.deepEqual(f.stored[0].originalBytes,bytes);
    assert.equal(f.stored[0].revision.originalSha256,createHash('sha256').update(bytes).digest('hex'));
    assert.equal(f.stored[0].revision.status,'NEEDS_REVIEW');assert.equal(f.stored[0].revision.mediaKind,'HTML');
    assert.deepEqual(f.stored[0].paragraphs.map(p=>p.text),['제목: 합성 공고','가상 모집 안내']);
    assert.deepEqual(await f.service.execute(f.input),{kind:'NOT_MODIFIED',revisionId:result.revisionId});
    assert.equal(f.stored.length,1);assert.equal(f.calls(),2);assert.equal(f.observed(),1);
  });
  it('cannot use the crawler to bypass DNS/IP pinning or re-fetch after denial',async()=>{
    const f=fixture({poison:true});await assert.rejects(f.service.execute(f.input));
    assert.equal(f.calls(),0);assert.equal(f.stored.length,0);
  });
  it('does not store a successfully parsed page after its current rights are revoked',async()=>{
    const f=fixture({revokeDuringFetch:true});await assert.rejects(f.service.execute(f.input));
    assert.equal(f.calls(),1);assert.equal(f.stored.length,0);
  });
});
