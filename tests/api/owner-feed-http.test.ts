import {afterEach,describe,expect,it,vi} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {closedRepository} from '../../apps/api/src/repository.js';
import type {OwnerFeedResponse} from '@hufs-one/contracts';

const at='2026-11-04T00:00:00.000Z',origin='https://synthetic.invalid';
const owner={role:'BETA' as const,actorId:'SYN-OWNER',sessionIdHash:'S'.repeat(32),csrfToken:'C'.repeat(32),
  betaAllowed:true,sessionExpiresAt:'2026-12-01T00:00:00.000Z',schoolMailProofExpiresAt:'2026-12-01T00:00:00.000Z'};
const wire=():OwnerFeedResponse=>({version:'a'.repeat(64),rankConfigVersion:'rank-v1.0',
  feed:{asOf:at,featured:[],compact:[],hasMore:false,totalCandidates:0}});
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(app=>app.close()));});
function fixture(){
  let identity:typeof owner|null=owner,approved=true,current=true;
  const source={mayInspect:vi.fn(async()=>true),inspect:vi.fn(async()=>({result:wire() as unknown,receipt:'SYN-SOURCE-RECEIPT',coreVersion:'SYN-CORE'})),
    revalidate:vi.fn(async()=>current)};
  const approval={isApproved:vi.fn(async()=>approved)};
  const open=(ports:unknown={source,approval})=>{
    const app=createIntegratedApi({allowedOrigin:origin,repository:closedRepository,now:()=>at,
      auth:{verifySession:async()=>identity,revokeSession:async()=>{}},ownerFeed:ports} as any);
    apps.push(app);return app;
  };
  return {source,approval,open,logout:()=>{identity=null;},revoke:()=>{current=false;},unapprove:()=>{approved=false;}};
}
describe('BETA owner feed HTTP gate',()=>{
  it('checks independent owner permission before inspecting private feed inputs',async()=>{
    const f=fixture();f.source.mayInspect.mockResolvedValue(false);
    expect((await f.open().inject({url:'/api/owner/feed'})).statusCode).toBe(403);
    expect(f.source.inspect).not.toHaveBeenCalled();
  });
  it('returns only strict safe feed and rechecks source/core/session before disclosure',async()=>{
    const f=fixture(),response=await f.open().inject({url:'/api/owner/feed?asOf='+encodeURIComponent(at)});
    expect(response.statusCode).toBe(200);expect(response.json()).toEqual(wire());
    expect(response.headers['cache-control']).toBe('no-store');
    expect(f.source.inspect).toHaveBeenCalledWith({actorId:owner.actorId,asOf:at,now:at});
    expect(f.approval.isApproved).toHaveBeenCalledTimes(2);
  });
  it('keeps unavailable/unauthenticated cases closed without reading data',async()=>{
    const f=fixture();expect((await f.open({}).inject({url:'/api/owner/feed'})).statusCode).toBe(503);
    f.logout();expect((await f.open().inject({url:'/api/owner/feed'})).statusCode).toBe(401);
    expect(f.source.inspect).not.toHaveBeenCalled();
  });
  it.each(['?actorId=SYN-OTHER','?subjectId=S01','?asOf=2026-12-01T00%3A00%3A00.000Z'])('rejects client scope or future time %s',async query=>{
    const f=fixture(),response=await f.open().inject({url:'/api/owner/feed'+query});
    expect(response.statusCode).toBe(422);expect(response.json().code).toBe('INVALID_INPUT');
    expect(f.source.inspect).not.toHaveBeenCalled();
  });
  it('rejects changed session before invoking approval',async()=>{
    const f=fixture();f.source.inspect.mockImplementation(async()=>{f.logout();return {result:wire(),receipt:'SYN-SOURCE-RECEIPT',coreVersion:'SYN-CORE'};});
    expect((await f.open().inject({url:'/api/owner/feed'})).statusCode).toBe(401);
    expect(f.approval.isApproved).not.toHaveBeenCalled();
  });
  it('rejects source withdrawal and core withdrawal during source revalidation',async()=>{
    const f=fixture();f.revoke();expect((await f.open().inject({url:'/api/owner/feed'})).statusCode).toBe(403);
    const g=fixture();g.source.revalidate.mockImplementation(async()=>{g.unapprove();return true;});
    expect((await g.open().inject({url:'/api/owner/feed'})).statusCode).toBe(503);
  });
  it('does not reflect malformed/private SQL output or a mismatched response time',async()=>{
    for(const bad of [{...wire(),privateProfile:'PRIVATE-SYNTHETIC'},
      {...wire(),feed:{...wire().feed,asOf:'2026-11-03T00:00:00.000Z'}}]){
      const f=fixture();f.source.inspect.mockResolvedValue({result:bad,receipt:'SYN-SOURCE-RECEIPT',coreVersion:'SYN-CORE'});
      const response=await f.open().inject({url:'/api/owner/feed'});
      expect(response.statusCode).toBe(503);expect(response.body).not.toContain('PRIVATE-SYNTHETIC');
    }
  });
});
