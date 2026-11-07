import {describe,expect,it,vi} from 'vitest';
import {
  createOperatorPublicApiDiscovery,
  type OperatorPublicApiDiscoveryInput,
} from '../../apps/api/src/modules/opportunities/operator-public-api.js';
import {PublicApiDiscoveryResponseSchema} from '@hufs-one/contracts';

const timestamp='2026-11-08T01:00:00.000Z',KEY='SYNTHETIC_KEY_NOT_A_REAL_CREDENTIAL_001';
const scope={provider:'SARAMIN_JOB' as const,permissionRef:'rights-saramin-v1',apiKey:KEY};
const saramin={
  jobs:{count:2,job:[{
    id:'123456',url:'http://other.example/private?token=LEAK',active:1,
    company:{detail:{name:'합성 기업'}},position:{title:'데이터 분석 인턴'},
  },{
    id:'999999',active:0,company:{detail:{name:'마감 회사'}},
    position:{title:'마감한 공고'},
  }]},
};
function fixture(payload:unknown=saramin,provider:OperatorPublicApiDiscoveryInput['scopes'][number]=scope){
  let permissionRevoked=false,remaining=30,reply=payload,revision='rights-v1';
  const resolveAddresses=vi.fn(async()=>['8.8.8.8']);
  const requestPinned=vi.fn(async(_request:{url:URL;address:string;serverName:string;init:RequestInit})=>
    new Response(JSON.stringify(reply),{status:200,headers:{'content-type':'application/json'}}));
  const resolveRights=vi.fn(async()=>({
    provider:provider.provider,permissionRef:provider.permissionRef,
    policyVersion:revision,status:permissionRevoked?'REVOKED' as const:'APPROVED' as const,
    reviewedAt:'2026-11-01T00:00:00.000Z',expiresAt:'2099-01-01T00:00:00.000Z',
    allowedPurposes:new Set(['LOOKUP_METADATA','DISPLAY_SOURCE_LINK'] as const),
  }));
  const reserveCall=vi.fn(async()=>--remaining>=0);
  const service=createOperatorPublicApiDiscovery({
    scopes:[provider],egress:{resolveAddresses,requestPinned},
    resolveRights,reserveCall,now:()=>new Date(timestamp),
  });
  return {service,resolveRights,reserveCall,resolveAddresses,requestPinned,
    revoke:()=>{permissionRevoked=true;},change:()=>{revision='rights-v2';},
    setReply:(v:unknown)=>{reply=v;},exhaust:()=>{remaining=0;}};
}
describe('Korean API directory: rights-gated server-only provider connection',()=>{
  it('remains inert before explicit operator lookup, filters closed jobs and rejects unsafe links',async()=>{
    const x=fixture();
    expect(x.service.permissionRef('SARAMIN_JOB')).toBe(scope.permissionRef);
    expect(x.requestPinned).not.toHaveBeenCalled();
    expect(x.reserveCall).not.toHaveBeenCalled();
    const result=await x.service.lookup({provider:'SARAMIN_JOB',topic:'DATA_ANALYTICS'});
    expect(PublicApiDiscoveryResponseSchema.parse(result)).toMatchObject({
      provider:'SARAMIN_JOB',topic:'DATA_ANALYTICS',mode:'OPERATOR_REVIEW_ONLY',
      candidates:[{providerItemId:'123456',title:'데이터 분석 인턴',
        dataMode:'RESEARCH_REFERENCE_ONLY',reviewState:'NEEDS_REVIEW',
        applicationState:'UNKNOWN',deadlineState:'UNKNOWN',
        viewUrl:'https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=123456'}],
    });
    expect(result.candidates).toHaveLength(1);
    expect(x.reserveCall).toHaveBeenCalledOnce();
    expect(x.resolveRights).toHaveBeenCalledTimes(3);
    expect(x.resolveAddresses).toHaveBeenCalledTimes(2);
    expect(x.requestPinned).toHaveBeenCalledOnce();
    const request=x.requestPinned.mock.calls[0]![0];
    expect(request.url.hostname).toBe('oapi.saramin.co.kr');
    expect(request.url.pathname).toBe('/job-search');
    expect(request.url.searchParams.get('access-key')).toBe(KEY);
    expect(request.url.searchParams.get('keywords')).toBe('데이터 분석');
    expect(request.init.credentials).toBe('omit');
    expect(request.init.redirect).toBe('error');
    expect(JSON.stringify(result)).not.toContain(KEY);
    expect(JSON.stringify(result)).not.toContain('other.example');
  });
  it('uses the current CareerNet jobs.json, not discontinued getOpenApi.json',async()=>{
    const p={provider:'CAREERNET_JOBS' as const,permissionRef:'rights-careernet-v1',apiKey:KEY};
    const x=fixture({count:1,pageIndex:1,pageSize:10,jobs:[{
      job_cd:1093,job_nm:'가상현실 전문가',work:'합성 문구',
    }]},p);
    const result=await x.service.lookup({provider:'CAREERNET_JOBS',topic:'SOFTWARE'});
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      providerItemId:'1093',kind:'CAREER_REFERENCE',organization:'커리어넷 직업백과',
      dataMode:'RESEARCH_REFERENCE_ONLY',reviewState:'NEEDS_REVIEW',
    });
    const request=x.requestPinned.mock.calls[0]![0].url;
    expect(request.href).toContain('/cnet/front/openapi/jobs.json?');
    expect(request.searchParams.get('searchJobNm')).toBe('소프트웨어');
    expect(request.searchParams.get('pageIndex')).toBe('1');
    expect(request.searchParams.get('apiKey')).toBe(KEY);
    expect(JSON.stringify(result)).not.toContain('합성 문구');
  });
  it('requires a current independent rights grant before DNS or quota use',async()=>{
    const x=fixture();x.revoke();
    await expect(x.service.lookup({provider:'SARAMIN_JOB',topic:'MARKETING'}))
      .rejects.toThrow('lookup unavailable');
    expect(x.reserveCall).not.toHaveBeenCalled();
    expect(x.resolveAddresses).not.toHaveBeenCalled();
    expect(x.requestPinned).not.toHaveBeenCalled();
  });
  it('rejects revoked or changed grants immediately before and after outbound IO',async()=>{
    const first=fixture();
    // A quota reservation raced an independent operator rights-version change.
    first.reserveCall.mockImplementation(async()=>{first.change();return true;});
    await expect(first.service.lookup({provider:'SARAMIN_JOB',topic:'DATA_ANALYTICS'})).rejects.toThrow();
    expect(first.requestPinned).not.toHaveBeenCalled();
    const second=fixture();
    second.requestPinned.mockImplementationOnce(async()=>{second.revoke();
      return new Response(JSON.stringify(saramin),{headers:{'content-type':'application/json'}});
    });
    await expect(second.service.lookup({provider:'SARAMIN_JOB',topic:'DATA_ANALYTICS'})).rejects.toThrow();
    expect(second.requestPinned).toHaveBeenCalledOnce();
  });
  it('needs a distributed quota reservation, does not send student-free-form query, never falls back to network',async()=>{
    const x=fixture();x.exhaust();
    await expect(x.service.lookup({provider:'SARAMIN_JOB',topic:'BUSINESS'})).rejects.toThrow();
    expect(x.resolveAddresses).not.toHaveBeenCalled();
    await expect(x.service.lookup({provider:'SARAMIN_JOB',topic:'홍길동 학점' as any})).rejects.toThrow();
    expect(x.requestPinned).not.toHaveBeenCalled();
    expect(()=>createOperatorPublicApiDiscovery({scopes:[{...scope,apiKey:'   '}],
      egress:{resolveAddresses:x.resolveAddresses,requestPinned:x.requestPinned},
      resolveRights:x.resolveRights,reserveCall:x.reserveCall})).toThrow();
    expect(x.service.permissionRef('CAREERNET_JOBS')).toBeNull();
  });
  it('fails closed on malformed or unbounded provider representations without leaking credentials',async()=>{
    const x=fixture();x.setReply({result:{code:4,message:'SYNTHETIC_PRIVATE_KEY_LEAK'}});
    await expect(x.service.lookup({provider:'SARAMIN_JOB',topic:'BUSINESS'})).rejects.toThrow(
      'Public API metadata lookup unavailable');
    const y=fixture();y.setReply({jobs:{job:{id:'abc',active:1,
      company:{detail:{name:'unverified'}},position:{title:'job'}}}});
    await expect(y.service.lookup({provider:'SARAMIN_JOB',topic:'BUSINESS'})).rejects.toThrow();
    const z=fixture();z.resolveAddresses.mockResolvedValueOnce(['127.0.0.1']);
    await expect(z.service.lookup({provider:'SARAMIN_JOB',topic:'DATA_ANALYTICS'})).rejects.toThrow();
    expect(z.requestPinned).not.toHaveBeenCalled();
  });
});
