import {describe,expect,it,vi} from 'vitest';
import {createApprovedDurableSourceExecutor} from
  '../../apps/api/src/modules/opportunities/source-ingestion-durable.js';
import {ApprovedPlainTextExtractor} from
  '../../apps/api/src/modules/opportunities/approved-text-extractor.js';
import type {SourceRevisionVNext} from '@hufs-one/contracts';
import type {ApprovedSourceRights} from
  '../../apps/api/src/modules/opportunities/approved-fetch.js';

const url='https://synthetic.example.edu/approved/source';
const policy={sourceId:'SYN-DURABLE',canonicalUrl:url,
  approvedOrigin:'https://synthetic.example.edu',
  permissionRef:'SYN-APPROVED',sourceClass:'LICENSED_EXTERNAL' as const,
  provenance:'REAL_APPROVED' as const,rightsReviewed:true};
const input={sourceId:policy.sourceId,permissionRef:policy.permissionRef,
  actorRef:'SYN-OPERATOR'};
function harness(response?:()=>Response){
  let grant=true,material='가상 공고 첫 판',calls=0,nowCounter=0;
  let responseStatus:200|304=200,etag:string|null=null,lastModified:string|null=null;
  const sentValidators:string[]=[];
  let latest:SourceRevisionVNext|null=null;
  let lastSeen='',approvedTime='2026-10-25T00:00:00.000Z';
  const observed:string[]=[];
  const permit=():ApprovedSourceRights=>({
    sourceId:policy.sourceId,canonicalUrl:url,permissionRef:policy.permissionRef,
    policyVersion:grant?'allow-v1':'revoked-v2',
    reviewedBy:'SYN-REVIEWER',reviewedAt:approvedTime,
    status:grant?'APPROVED':'REVOKED',
    allowedPurposes:new Set(['COLLECT','STORE']),
  });
  const service=createApprovedDurableSourceExecutor({
    policies:new Map([[policy.sourceId,policy]]),
    rights:{resolve:async()=>permit()},
    now:()=>new Date(Date.parse('2026-10-31T00:00:00Z')+nowCounter++*1000).toISOString(),
    egress:{
      resolveAddresses:async()=>['8.8.8.8'],
      requestPinned:async({init})=>{
        calls++;
        const headers=new Headers(init.headers);
        sentValidators.push(headers.get('if-none-match')??'<none>');
        if(response)return response();
        return new Response(responseStatus===304?null:material,{status:responseStatus,
          headers:responseStatus===304?{}:{'content-type':'text/plain',etag:'"SYN-ETAG"'}});
      },
    },
    extractor:new ApprovedPlainTextExtractor(),
    readerPool:{connect:async()=>({
      query:async()=>({rows:latest?[{
        revision_id:latest.revisionId,original_sha256:latest.originalSha256,
        content_sha256:latest.contentSha256,fetched_at:latest.fetchedAt,
        permission_ref:latest.permissionRef,etag,last_modified:lastModified,
      }]:[]}),
      release:()=>{},
    })},
    writer:{
      append:async({revision})=>{latest=revision as SourceRevisionVNext;return null;},
      observeUnchanged:async({revisionId})=>{lastSeen=revisionId;observed.push(revisionId);},
      storeHttpValidators:async(input)=>{etag=input.etag;lastModified=input.lastModified;},

    },
  });
  return {service,setMaterial:(x:string)=>{material=x;},
    setResponseStatus:(s:200|304)=>{responseStatus=s;},
    sentValidators:()=>sentValidators,
    revoke:()=>{grant=false;},calls:()=>calls,head:()=>latest,
    observed:()=>observed,lastSeen:()=>lastSeen};
}
describe('TASK-19 durable approved-source fetch-to-Postgres adapter (synthetic transport)',()=>{
  it.each(['oversized','declared','media','status','redirect'])('cancels rejected %s response bodies without drafting or retrying',async mode=>{
    const cancel=vi.fn();
    const response=new Response(new ReadableStream<Uint8Array>({
      start(controller){controller.enqueue(new Uint8Array(mode==='oversized'?256*1024+1:1));},cancel,
    }),{status:mode==='status'?503:mode==='redirect'?302:200,headers:{
      'content-type':mode==='media'?'application/octet-stream':'text/plain',
      ...(mode==='declared'?{'content-length':String(256*1024+1)}:{}),
    }});
    const x=harness(()=>response);
    await expect(x.service.execute(input)).rejects.toThrow();
    expect(cancel).toHaveBeenCalledOnce();expect(response.body?.locked).toBe(false);
    expect(x.head()).toBeNull();expect(x.observed()).toHaveLength(0);expect(x.calls()).toBe(1);
  });
  it('only ingests an allowlisted exact URL and creates a nonactive draft',async()=>{
    const x=harness();const v=await x.service.execute(input);
    expect(v.kind).toBe('NEW_DRAFT');
    expect(x.head()?.status).toBe('NEEDS_REVIEW');
    expect(x.head()?.mediaKind).toBe('TEXT');
    expect(x.calls()).toBe(1);
    await expect(x.service.execute({...input,sourceId:'SYN-OTHER'})).rejects.toThrow('allowlisted');
    await expect(x.service.execute({...input,permissionRef:'SYN-NO'})).rejects.toThrow();
  });
  it('uses persisted original+text digests, never promotes verifiedAt for unchanged 200',async()=>{
    const x=harness();const first=await x.service.execute(input);
    const unchanged=await x.service.execute(input);
    expect(unchanged).toEqual({kind:'NOT_MODIFIED',revisionId:first.revisionId});
    expect(x.head()?.lastVerifiedAt).toBeUndefined();
    expect(x.observed()).toHaveLength(1);
    x.setMaterial('가상 공고 정정된 내용');
    const newer=await x.service.execute(input);
    expect(newer.kind).toBe('CHANGED_DRAFT');
    expect(x.head()?.supersedes).toBe(first.revisionId);
    expect(x.head()?.status).toBe('NEEDS_REVIEW');
  });
  it('persists safe ETag headers and handles HTTP 304 without promoting human verification',async()=>{
    const x=harness();
    const first=await x.service.execute(input);
    x.setResponseStatus(304);
    expect(await x.service.execute(input)).toEqual({
      kind:'NOT_MODIFIED',revisionId:first.revisionId,
    });
    expect(x.sentValidators()).toEqual(['<none>','"SYN-ETAG"']);
    expect(x.observed()).toEqual([first.revisionId]);
    expect(x.head()?.lastVerifiedAt).toBeUndefined();
  });
  it('rejects unsolicited HTTP 304 without a persisted matching source validator',async()=>{
    const x=harness();x.setResponseStatus(304);
    await expect(x.service.execute(input)).rejects.toThrow('Unconditional 304');
    expect(x.observed()).toHaveLength(0);
  });
  it('never calls the injected transport if independent rights were revoked',async()=>{
    const x=harness();x.revoke();
    await expect(x.service.execute(input)).rejects.toThrow('rights');
    expect(x.calls()).toBe(0);
  });
  it('requires actual source-content-specific extraction, not silent OCR for binary',async()=>{
    const extractor=new ApprovedPlainTextExtractor();
    const bytes=new TextEncoder().encode('%PDF-1.5 fake document');
    await expect(extractor.extract({content:bytes,contentType:'application/pdf',
      canonicalUrl:url})).rejects.toThrow('not permitted');
  });
  it('accepts bounded safe HTML and RSS without script content or network expansion',async()=>{
    const extractor=new ApprovedPlainTextExtractor();
    const html='<div>가상 안내 &amp; 모집</div><script>steal secret</script><p>마감 안내</p>';
    const a=await extractor.extract({content:new TextEncoder().encode(html),
      contentType:'text/html',canonicalUrl:url});
    expect(a.map(p=>p.text)).toEqual(['가상 안내 & 모집','마감 안내']);
    expect(a.some(x=>x.text.includes('steal'))).toBe(false);
    await expect(extractor.extract({content:new TextEncoder().encode('<!DOCTYPE foo><p>text</p>'),
      contentType:'text/html',canonicalUrl:url})).rejects.toThrow('forbidden');
    const rss=await extractor.extract({content:new TextEncoder().encode(
      '<rss><channel><item><title>가상 새 공고</title><description>모집 안내</description></item></channel></rss>'),
      contentType:'application/rss+xml',canonicalUrl:url});
    expect(rss.map(p=>p.text)).toEqual(['가상 새 공고','모집 안내']);
  });
  it('rejects invalid byte encoding and paragraph count',async()=>{
    const extractor=new ApprovedPlainTextExtractor();
    await expect(extractor.extract({content:new Uint8Array([0xff,0xfe]),
      contentType:'text/plain',canonicalUrl:url})).rejects.toThrow();
    await expect(extractor.extract({content:new TextEncoder().encode(
      Array.from({length:201},()=> '가상문장').join('\n')),
      contentType:'text/plain',canonicalUrl:url})).rejects.toThrow('review');
  });
});
