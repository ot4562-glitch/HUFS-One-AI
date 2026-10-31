import {describe,expect,it} from 'vitest';
import {
  createApprovedSourceFetcher,SourceIngestionError,
} from '../../apps/api/src/modules/opportunities/approved-fetch.js';
import {MemorySourceRevisionLedger} from
  '../../apps/api/src/modules/opportunities/revision-ledger.js';

const URL='https://official.example.edu/notice/approved';
const POLICY={
  sourceId:'source-1',canonicalUrl:URL,
  approvedOrigin:'https://official.example.edu',
  permissionRef:'P-APPROVED',sourceClass:'SYNTHETIC' as const,
  provenance:'SYNTHETIC' as const,rightsReviewed:true,
};
const reply=(body:string,status=200,extra:Record<string,string>={})=>
  new Response(status===304?null:body,{
    status,headers:{'content-type':'text/plain',...extra},
  });
const extractor={extract:async({content}:{content:Uint8Array})=>[
  {id:'p1',text:new TextDecoder('utf-8',{fatal:true}).decode(content)},
]};
function harness(responses:Response[],policy=POLICY){
  const ledger=new MemorySourceRevisionLedger();
  let i=0,now=new Date('2026-10-20T00:00:00.000Z');
  const calls:Array<{url:string;opts:RequestInit}>=[];
  const fetcher=createApprovedSourceFetcher({
    policy,ledger,extractor,now:()=>now,
    transport:async(url,opts)=>{
      calls.push({url:String(url),opts:opts??{}});
      const result=responses[i++];
      if(!result)throw new Error('No synthetic response');
      return result;
    },
  });
  return {ledger,fetcher,calls,at:(day:number)=>{
    now=new Date(`2026-10-${day}T00:00:00.000Z`);
  }};
}
describe('TASK-19 approved-source ingestion, fail-closed HTTP and immutable drafts',()=>{
  it('never falls back to global fetch when a trusted transport is unconfigured',async()=>{
    const ledger=new MemorySourceRevisionLedger();
    const service=createApprovedSourceFetcher({
      policy:POLICY,ledger,extractor,
      now:()=>new Date('2026-10-20T00:00:00.000Z'),
    });
    await expect(service.check()).rejects.toBeInstanceOf(SourceIngestionError);
    expect(ledger.size()).toBe(0);
  });
  it('fetches only the configured HTTPS origin with zero credentials and no redirects',async()=>{
    const h=harness([reply('가상 공고 모집')]);
    const outcome=await h.fetcher.check();
    expect(outcome.kind).toBe('NEW_DRAFT');
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]?.url).toBe(URL);
    expect(h.calls[0]?.opts).toMatchObject({
      method:'GET',redirect:'error',credentials:'omit',
    });
    expect(h.ledger.size()).toBe(1);
    expect(h.ledger.latest(POLICY.sourceId)?.revision.status).toBe('NEEDS_REVIEW');
  });
  it('honors ETag/304 without changing human-verified timestamp or creating a revision',async()=>{
    const h=harness([
      reply('가상 최초 공고',200,{etag:'"v1"'}),
      reply('',304),
    ]);
    const original=await h.fetcher.check();
    h.at(21);
    const checked=await h.fetcher.check();
    expect(checked.kind).toBe('NOT_MODIFIED');
    expect(checked.revisionId).toBe(original.revisionId);
    expect(h.calls[1]?.opts.headers).toMatchObject({'If-None-Match':'"v1"'});
    expect(h.ledger.size()).toBe(1);
    expect(h.ledger.lastChecked(POLICY.sourceId)).toBe('2026-10-21T00:00:00.000Z');
    expect(h.ledger.latest(POLICY.sourceId)?.revision.lastVerifiedAt).toBeUndefined();
  });
  it('treats a 200 with identical bytes as unchanged, without unverifiable approval',async()=>{
    const h=harness([reply('동일 공고'),reply('동일 공고')]);
    await h.fetcher.check();h.at(21);
    expect((await h.fetcher.check()).kind).toBe('NOT_MODIFIED');
    expect(h.ledger.size()).toBe(1);
  });
  it('new content produces a pending revision with invalidation of derived caches',async()=>{
    const h=harness([reply('모집 11월 2일'),reply('정정: 모집 11월 20일')]);
    const before=await h.fetcher.check();
    h.at(25);
    const changed=await h.fetcher.check();
    expect(changed.kind).toBe('CHANGED_DRAFT');
    expect(changed.revisionId).not.toBe(before.revisionId);
    expect(changed.invalidation?.previousRevisionId).toBe(before.revisionId);
    expect(changed.invalidation?.invalidates).toEqual([
      'RETRIEVAL','CLAIMS','FEED','NOTICES','AI_CACHE',
    ]);
    expect(h.ledger.latest(POLICY.sourceId)?.revision.status).toBe('NEEDS_REVIEW');
    expect(h.ledger.retrieve({query:'정정 모집',
      asOf:'2026-10-26T00:00:00.000Z',
      permissionRefs:new Set([POLICY.permissionRef]),
    }).envelope.evidence).toHaveLength(0);
  });
  it('rejects any unapproved, altered origin or HTTP scheme before fetching',()=>{
    for(const policy of [
      {...POLICY,rightsReviewed:false},
      {...POLICY,canonicalUrl:'http://official.example.edu/notice'},
      {...POLICY,canonicalUrl:'https://other.example.edu/notice'},
      {...POLICY,canonicalUrl:'https://user:pass@official.example.edu/notice'},
      {...POLICY,canonicalUrl:'https://localhost/notice'},
      {...POLICY,canonicalUrl:'https://127.0.0.1/notice'},
      {...POLICY,canonicalUrl:'https://official.example.edu:8443/notice'},
    ])expect(()=>createApprovedSourceFetcher({
      policy,ledger:new MemorySourceRevisionLedger(),extractor,
    })).toThrow(SourceIngestionError);
  });
  it('rejects unapproved provider redirect and non-200/304 status',async()=>{
    const r=reply('moved',302,{location:'https://unknown.example.test/'});
    const h=harness([r]);
    await expect(h.fetcher.check()).rejects.toBeInstanceOf(SourceIngestionError);
    expect(h.ledger.size()).toBe(0);
    const fail=harness([reply('error',503)]);
    await expect(fail.fetcher.check()).rejects.toBeInstanceOf(SourceIngestionError);
  });
  it('refuses a 304 before any source has ever been observed',async()=>{
    const h=harness([reply('',304)]);
    await expect(h.fetcher.check()).rejects.toBeInstanceOf(SourceIngestionError);
  });
  it('caps raw download size without trusting Content-Length',async()=>{
    const h=harness([reply('a'.repeat(257*1024))]);
    await expect(h.fetcher.check()).rejects.toBeInstanceOf(SourceIngestionError);
    expect(h.ledger.size()).toBe(0);
  });
  it('rejects wrong MIME, empty body and malformed extraction without writing evidence',async()=>{
    for(const r of [
      reply('wrong',200,{'content-type':'application/octet-stream'}),
      reply(''),
      reply('<script>alert(1)</script>',200,{'content-type':'text/html'}),
    ]){
      const h=harness([r]);
      await expect(h.fetcher.check()).rejects.toBeInstanceOf(SourceIngestionError);
      expect(h.ledger.size()).toBe(0);
    }
  });
  it('does not allow checkedAt to regress or overwrite future verified data',async()=>{
    const h=harness([reply('v1'),reply('v1')]);
    await h.fetcher.check();
    h.at(19);
    await expect(h.fetcher.check()).rejects.toBeInstanceOf(SourceIngestionError);
    expect(h.ledger.size()).toBe(1);
    expect(h.ledger.lastChecked(POLICY.sourceId)).toBe('2026-10-20T00:00:00.000Z');
  });
});
