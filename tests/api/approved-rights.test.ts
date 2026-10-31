import {describe,expect,it} from 'vitest';
import {createApprovedSourceFetcher,SourceIngestionError} from
  '../../apps/api/src/modules/opportunities/approved-fetch.js';
import {MemorySourceRevisionLedger} from
  '../../apps/api/src/modules/opportunities/revision-ledger.js';
import type {ApprovedSourceRights} from
  '../../apps/api/src/modules/opportunities/approved-fetch.js';

const URL='https://official.example.edu/notice/approved';
const policy={
  sourceId:'s-1',canonicalUrl:URL,approvedOrigin:'https://official.example.edu',
  permissionRef:'P-REAL-1',sourceClass:'LICENSED_EXTERNAL' as const,
  provenance:'REAL_APPROVED' as const,rightsReviewed:true,
};
const now='2026-10-20T00:00:00.000Z';
const grant:ApprovedSourceRights={
  sourceId:'s-1',canonicalUrl:URL,permissionRef:'P-REAL-1',
  policyVersion:'rights-v1',reviewedBy:'synthetic-reviewer',
  reviewedAt:'2026-10-19T00:00:00.000Z',
  status:'APPROVED',allowedPurposes:new Set(['COLLECT','STORE']),
};
function fixture(input:{
  resolver?:()=>Promise<ApprovedSourceRights|null>;
  transport?:()=>Promise<Response>;
}={}){
  const ledger=new MemorySourceRevisionLedger();
  let httpCalls=0,reviewCalls=0;
  const service=createApprovedSourceFetcher({
    policy,ledger,now:()=>new Date(now),
    extractor:{extract:async()=>[{id:'p1',text:'허용된 합성 자료'}]},
    ...(input.resolver?{rightsResolver:{resolve:async()=>{
      reviewCalls++;return input.resolver!();
    }}}:{}),
    transport:async()=>{
      httpCalls++;
      return input.transport?input.transport():new Response('source-raw',{
        headers:{'content-type':'text/plain'},
      });
    },
  });
  return {service,ledger,httpCalls:()=>httpCalls,reviewCalls:()=>reviewCalls};
}
describe('TASK-19 official-source purpose/consent registry (synthetic, no web access)',()=>{
  it('rejects REAL_APPROVED even with rightsReviewed=true when registry is absent',async()=>{
    const x=fixture();
    await expect(x.service.check()).rejects.toBeInstanceOf(SourceIngestionError);
    expect(x.httpCalls()).toBe(0);
    expect(x.ledger.size()).toBe(0);
  });
  it('only ingests real-origin data when COLLECT and STORE are explicitly approved',async()=>{
    const x=fixture({resolver:async()=>grant});
    const result=await x.service.check();
    expect(result.kind).toBe('NEW_DRAFT');
    expect(x.httpCalls()).toBe(1);
    expect(x.reviewCalls()).toBeGreaterThanOrEqual(2);
    expect(x.ledger.latest('s-1')?.revision).toMatchObject({
      sourceClass:'LICENSED_EXTERNAL',status:'NEEDS_REVIEW',
      permissionRef:'P-REAL-1',
    });
  });
  it('blocks revocation, wrong source binding, expired review and missing purpose',async()=>{
    for(const invalid of [
      {...grant,status:'REVOKED' as const},
      {...grant,permissionRef:'P-OTHER'},
      {...grant,canonicalUrl:'https://fake.example.edu/'},
      {...grant,expiresAt:'2026-10-19T00:00:00.000Z'},
      {...grant,allowedPurposes:new Set(['COLLECT'] as const)},
      {...grant,allowedPurposes:new Set(['STORE'] as const)},
      {...grant,reviewedAt:'2026-10-25T00:00:00.000Z'},
    ]){
      const x=fixture({resolver:async()=>invalid});
      await expect(x.service.check()).rejects.toBeInstanceOf(SourceIngestionError);
      expect(x.httpCalls()).toBe(0);
      expect(x.ledger.size()).toBe(0);
    }
  });
  it('rejects a permission revoke during HTTP rather than persisting draft evidence',async()=>{
    let n=0;
    const x=fixture({resolver:async()=>++n===1?grant:{
      ...grant,status:'REVOKED',
    }});
    await expect(x.service.check()).rejects.toBeInstanceOf(SourceIngestionError);
    expect(x.httpCalls()).toBe(1);
    expect(x.ledger.size()).toBe(0);
  });
  it('rejects source-rights policy version changes before digest commit',async()=>{
    let n=0;
    const x=fixture({resolver:async()=>({...grant,policyVersion:`rights-v${++n}`})});
    await expect(x.service.check()).rejects.toBeInstanceOf(SourceIngestionError);
    expect(x.httpCalls()).toBe(1);
    expect(x.ledger.size()).toBe(0);
  });
  it('does not silently treat SEARCH or EXTERNAL_TRANSFER as allowed purposes',async()=>{
    const x=fixture({resolver:async()=>grant});
    await x.service.check();
    expect(grant.allowedPurposes.has('SEARCH')).toBe(false);
    expect(grant.allowedPurposes.has('EXTERNAL_TRANSFER')).toBe(false);
  });
});
