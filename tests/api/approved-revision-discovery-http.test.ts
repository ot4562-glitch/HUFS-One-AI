import {afterEach,describe,expect,it,vi} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import type {TrustedOpportunityRevisionComparisonContextSource} from '../../apps/api/src/modules/opportunities/opportunity-revision-comparison-http.js';
import type {VerifiedActor} from '../../apps/api/src/types.js';
const NOW='2026-11-03T00:00:00.000Z',ORIGIN='https://synthetic.invalid';
const A={role:'BETA' as const,actorId:'SYN-OWNER',sessionIdHash:'S'.repeat(32),
  csrfToken:'C'.repeat(32),betaAllowed:true,sessionExpiresAt:'2026-12-01T00:00:00Z',
  schoolMailProofExpiresAt:'2026-12-01T00:00:00Z'};
const R={role:'REVIEWER' as const,actorId:'SYN-REVIEWER',sessionIdHash:'R'.repeat(32),
  csrfToken:A.csrfToken,verifiedEmail:'reviewer@example.invalid',
  identityProofExpiresAt:'2026-12-01T00:00:00Z',sessionExpiresAt:'2026-12-01T00:00:00Z'};
const ctx={opportunityId:'SYN-OPP',asOf:NOW,available:true as const,
  beforeRevisionId:'SYN-REV1',afterRevisionId:'SYN-REV2'};
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(app=>app.close()));});
function fixture(find:(input:{actorId:string;opportunityId:string;asOf:string;now:string})=>Promise<unknown|null>){
  let identity:VerifiedActor|null=A;
  const spy=vi.fn(find);
  const context:TrustedOpportunityRevisionComparisonContextSource={find:spy};
  const app=createIntegratedApi({allowedOrigin:ORIGIN,
    repository:new MemoryApiRepository({profiles:[]}),
    auth:{verifySession:async()=>identity,revokeSession:async()=>{}},
    revisionComparison:{context},now:()=>NOW});
  apps.push(app);
  const path='/api/opportunities/SYN-OPP/revisions/comparison-context?asOf='+encodeURIComponent(NOW);
  return {app,path,spy,setActor:(a:VerifiedActor|null)=>{identity=a;}};
}

describe('#119 approved comparison-context owner HTTP',()=>{
  it('uses only exact owner binding and rechecks current source and session twice',async()=>{
    const f=fixture(async()=>ctx);
    const res=await f.app.inject({url:f.path});
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(ctx);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(f.spy).toHaveBeenCalledTimes(2);
    expect(f.spy.mock.calls[0]?.[0]).toEqual({
      actorId:A.actorId,opportunityId:'SYN-OPP',asOf:NOW,now:NOW,
    });
  });
  it('returns no revision IDs when an authorized owner has no approved pair',async()=>{
    const f=fixture(async()=>({opportunityId:ctx.opportunityId,asOf:NOW,available:false}));
    const res=await f.app.inject({url:f.path});
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({opportunityId:ctx.opportunityId,asOf:NOW,available:false});
    expect(res.body).not.toContain('REV1');
  });
  it('denies absent, anonymous and REVIEWER access before any source read',async()=>{
    const f=fixture(async()=>ctx);
    f.setActor(null);
    expect((await f.app.inject({url:f.path})).statusCode).toBe(401);
    f.setActor(R);
    expect((await f.app.inject({url:f.path})).statusCode).toBe(403);
    expect(f.spy).not.toHaveBeenCalled();
    const absent=createIntegratedApi({allowedOrigin:ORIGIN,repository:new MemoryApiRepository({profiles:[]}),
      auth:{verifySession:async()=>A,revokeSession:async()=>{}},now:()=>NOW});
    apps.push(absent);
    expect((await absent.inject({url:f.path})).statusCode).toBe(503);
  });
  it('rejects future time, unexpected query and mismatched source opportunity',async()=>{
    const f=fixture(async()=>ctx);
    expect((await f.app.inject({url:f.path+'&actorId=FORGED'})).statusCode).toBe(422);
    expect((await f.app.inject({url:f.path.replace(encodeURIComponent(NOW),
      encodeURIComponent('2026-12-01T00:00:00.000Z'))})).statusCode).toBe(422);
    expect(f.spy).not.toHaveBeenCalled();
    const wrong=fixture(async()=>({...ctx,opportunityId:'SYN-OTHER'}));
    expect((await wrong.app.inject({url:wrong.path})).statusCode).toBe(503);
    expect(wrong.spy).toHaveBeenCalledTimes(1);
  });
  it('drops IDs when independent approval is revoked between proof and final recheck',async()=>{
    let n=0;
    const f=fixture(async()=>++n===1?ctx:{opportunityId:ctx.opportunityId,asOf:NOW,available:false});
    const res=await f.app.inject({url:f.path});
    expect(res.statusCode).toBe(403);
    expect(res.body).not.toContain('SYN-REV1');
    expect(f.spy).toHaveBeenCalledTimes(2);
  });
  it('denies actor rotation during an otherwise valid read',async()=>{
    let set!: (a:VerifiedActor|null)=>void;
    const f=fixture(async()=>{set({...A,actorId:'SYN-OTHER'});return ctx;});
    set=f.setActor;
    expect((await f.app.inject({url:f.path})).statusCode).toBe(403);
    expect(f.spy).toHaveBeenCalledTimes(1);
  });
});
