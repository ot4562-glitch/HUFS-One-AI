import {afterEach,describe,expect,it,vi} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {closedRepository} from '../../apps/api/src/repository.js';

const now='2026-11-08T01:00:00.000Z',origin='https://synthetic.invalid';
const actor={actorId:'SYN-OPERATOR',role:'BETA' as const,
  sessionIdHash:'S'.repeat(32),csrfToken:'C'.repeat(32),betaAllowed:true,
  sessionExpiresAt:'2026-12-01T00:00:00.000Z',
  schoolMailProofExpiresAt:'2026-12-01T00:00:00.000Z'};
const response={
  provider:'SARAMIN_JOB' as const,topic:'DATA_ANALYTICS' as const,
  observedAt:now,permissionRef:'rights-saramin-v1',
  rightsPolicyVersion:'rights-v1',mode:'OPERATOR_REVIEW_ONLY' as const,
  candidates:[{providerItemId:'123',kind:'JOB_POSTING' as const,
    title:'가상 데이터 분석 인턴',organization:'가상 기업',
    viewUrl:'https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=123',
    dataMode:'RESEARCH_REFERENCE_ONLY' as const,reviewState:'NEEDS_REVIEW' as const,
    applicationState:'UNKNOWN' as const,deadlineState:'UNKNOWN' as const}],
};
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(x=>x.close()));});
function fixture(enabled=true){
  let identity:typeof actor|null=actor;
  const service={
    permissionRef:vi.fn((provider:string)=>provider==='SARAMIN_JOB'?'rights-saramin-v1':null),
    lookup:vi.fn(async()=>response),
  };
  const authority={mayManage:vi.fn(async()=>true)};
  const app=createIntegratedApi({
    allowedOrigin:origin,now:()=>now,repository:closedRepository,
    auth:{verifySession:async()=>identity,revokeSession:async()=>{}},
    ...(enabled?{publicApiDiscovery:{service,authority}}:{}),
  } as any);
  apps.push(app);
  const headers={origin,'x-csrf-token':actor.csrfToken,'sec-fetch-site':'same-origin'};
  return {app,service,authority,headers,logout:()=>{identity=null;}};
}
const payload={provider:'SARAMIN_JOB',topic:'DATA_ANALYTICS'};
describe('operator-only public API discovery HTTP path',()=>{
  it('is installed only by root-controlled runtime configuration',async()=>{
    const x=fixture(false);
    const res=await x.app.inject({method:'POST',url:'/api/operator/public-api-discovery',
      headers:x.headers,payload});
    // Global source-route gate rejects unknown operator endpoints before Fastify 404.
    expect(res.statusCode).toBe(403);
    expect(x.service.lookup).not.toHaveBeenCalled();
  });
  it('uses authenticated owner, independently admitted operator and consumes a single explicit lookup',async()=>{
    const x=fixture();
    const result=await x.app.inject({method:'POST',url:'/api/operator/public-api-discovery',
      headers:x.headers,payload});
    expect(result.statusCode,result.body).toBe(200);
    expect(result.json()).toEqual(response);
    expect(x.service.lookup).toHaveBeenCalledOnce();
    expect(x.service.lookup).toHaveBeenCalledWith(payload);
    expect(x.authority.mayManage).toHaveBeenCalledTimes(2);
    expect(x.authority.mayManage).toHaveBeenCalledWith(expect.objectContaining({
      actorId:actor.actorId,sourceId:'PUBLIC_API:SARAMIN_JOB',
      permissionRef:'rights-saramin-v1',now,
    }));
    expect(JSON.stringify(result.json())).not.toContain('apiKey');
  });
  it('rejects BETA without operator authority, no CSRF, no session and browser privacy claims',async()=>{
    const x=fixture();
    x.authority.mayManage.mockResolvedValue(false);
    expect((await x.app.inject({method:'POST',url:'/api/operator/public-api-discovery',
      headers:x.headers,payload})).statusCode).toBe(403);
    expect(x.service.lookup).not.toHaveBeenCalled();
    x.authority.mayManage.mockResolvedValue(true);
    expect((await x.app.inject({method:'POST',url:'/api/operator/public-api-discovery',
      payload})).statusCode).toBe(403);
    expect(x.service.lookup).not.toHaveBeenCalled();
    for(const untrusted of [
      {...payload,actorId:'SYN-OTHER'},
      {...payload,permissionRef:'FORGED'},
      {...payload,keyword:'STUDENT_GRADE_PII'},
      {...payload,apiKey:'SYNTHETIC_SECRET'},
      {provider:'UNKNOWN',topic:'DATA_ANALYTICS'},
      {provider:'SARAMIN_JOB',topic:'STUDENT_EMAIL'},
    ]){
      const r=await x.app.inject({method:'POST',url:'/api/operator/public-api-discovery',
        headers:x.headers,payload:untrusted});
      expect(r.statusCode).toBe(422);
    }
    x.logout();
    expect((await x.app.inject({method:'POST',url:'/api/operator/public-api-discovery',
      headers:x.headers,payload})).statusCode).toBe(401);
    expect(x.service.lookup).not.toHaveBeenCalled();
  });
  it('drops a successful external result if operator grant or session changes during the call',async()=>{
    const x=fixture();
    x.service.lookup.mockImplementationOnce(async()=>{
      x.authority.mayManage.mockResolvedValue(false);return response;
    });
    expect((await x.app.inject({method:'POST',url:'/api/operator/public-api-discovery',
      headers:x.headers,payload})).statusCode).toBe(403);
    const y=fixture();
    y.service.lookup.mockImplementationOnce(async()=>{y.logout();return response;});
    expect((await y.app.inject({method:'POST',url:'/api/operator/public-api-discovery',
      headers:y.headers,payload})).statusCode).toBe(401);
  });
  it('rejects unreviewed leaked/private fields in the operator response and provider exceptions',async()=>{
    const x=fixture();
    // Use a structurally valid TypeScript response with a forbidden runtime field.
    const leaked={...response,candidates:[{...response.candidates[0]!,rawStudentText:'PRIVATE'}]};
    x.service.lookup.mockResolvedValueOnce(leaked);
    const res=await x.app.inject({method:'POST',url:'/api/operator/public-api-discovery',
      headers:x.headers,payload});
    expect(res.statusCode).toBe(503);
    expect(res.body).not.toContain('PRIVATE');
    x.service.lookup.mockRejectedValueOnce(new Error('SYNTHETIC_SECRET_PROVIDER_KEY'));
    const second=await x.app.inject({method:'POST',url:'/api/operator/public-api-discovery',
      headers:x.headers,payload});
    expect(second.statusCode).toBe(503);
    expect(second.body).not.toContain('SYNTHETIC_SECRET_PROVIDER_KEY');
  });
});
