import {describe,expect,it,vi} from 'vitest';
import {approvedPublicApiSourcePolicy,PUBLIC_API_PROVIDER_CATALOG}
  from '../../apps/api/src/modules/opportunities/public-api-provider-catalog.js';
import {createOperatorApprovedSource} from '../../apps/api/src/operator-approved-source.js';

const input={providerId:'CAREER_NET' as const,sourceId:'career-net-occupations',
  permissionRef:'career-rights-2026',
  canonicalUrl:'https://www.career.go.kr/cnet/openapi/approved-public-occupations.xml',
  rightsReviewed:true};
describe('public API provider selection is not a grant or an API client',()=>{
  it('provides traceable provider docs without keys, HTTP or implicit live status',()=>{
    expect(PUBLIC_API_PROVIDER_CATALOG.WORK24.connection).toBe('REQUIRES_PROVIDER_ADAPTER');
    expect(PUBLIC_API_PROVIDER_CATALOG.KESS.connection).toBe('REFERENCE_ONLY');
    expect(JSON.stringify(PUBLIC_API_PROVIDER_CATALOG)).not.toMatch(/secret|bearer|token/i);
  });
  it('maps an exact, reviewed public representation into the existing operator policy',()=>{
    expect(approvedPublicApiSourcePolicy(input)).toEqual({
      sourceId:input.sourceId,permissionRef:input.permissionRef,
      canonicalUrl:input.canonicalUrl,approvedOrigin:'https://www.career.go.kr/',
      sourceClass:'LICENSED_EXTERNAL',provenance:'REAL_APPROVED',rightsReviewed:true,
    });
  });
  it('denies unknown, unreviewed, foreign host, credentials, query and documentation URLs',()=>{
    const deny=(change:Record<string,unknown>)=>
      expect(()=>approvedPublicApiSourcePolicy({...input,...change})).toThrow();
    deny({rightsReviewed:false});
    deny({providerId:'UNKNOWN'});
    deny({providerId:'KESS'});
    deny({canonicalUrl:'https://attacker.example.net/feed.xml'});
    deny({canonicalUrl:'https://career.go.kr.attacker.example.net/feed.xml'});
    deny({canonicalUrl:'https://www.career.go.kr/cnet/feed.xml?apiKey=leak'});
    deny({canonicalUrl:'https://u:p@www.career.go.kr/cnet/feed.xml'});
    deny({canonicalUrl:'http://www.career.go.kr/cnet/feed.xml'});
    deny({canonicalUrl:PUBLIC_API_PROVIDER_CATALOG.CAREER_NET.homepage});
    deny({sourceId:'../bad'});
  });
  it('cannot authorize network/SQL without an independent current DB receipt',async()=>{
    const policy=approvedPublicApiSourcePolicy(input);
    const query=vi.fn(async()=>({rows:[]}));
    const rights={connect:vi.fn(async()=>({query,release:()=>{}}))};
    const untouched=()=>({connect:vi.fn(async()=>{throw Error('Unexpected DB');})});
    const headReader=untouched(),writer=untouched(),queue=untouched();
    const resolveAddresses=vi.fn(async()=>['8.8.8.8']);
    const requestPinned=vi.fn(async()=>new Response('should not fetch'));
    const result=createOperatorApprovedSource({
      operatorActorId:'operator-A',policies:[policy],
      pools:{rights,headReader,writer,queue},
      egress:{resolveAddresses,requestPinned},
      extractor:{extract:async()=>[]},
      authority:{mayProcess:vi.fn(async()=>true)},
      now:()=>new Date('2026-11-08T00:00:00Z').toISOString(),
    });
    expect(query).not.toHaveBeenCalled();
    expect(await result.authority.mayProcess({
      actorRef:'operator-A',sourceId:policy.sourceId,
      permissionRef:policy.permissionRef,now:'2026-11-08T00:00:00Z',
    })).toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
    expect(resolveAddresses).not.toHaveBeenCalled();
    expect(requestPinned).not.toHaveBeenCalled();
    expect(writer.connect).not.toHaveBeenCalled();
  });
});
