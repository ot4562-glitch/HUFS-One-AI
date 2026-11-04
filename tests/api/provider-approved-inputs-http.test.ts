import {afterEach,describe,expect,it,vi} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import type {VerifiedActor} from '../../apps/api/src/types.js';
import type {ApprovedProviderInputs} from '@hufs-one/contracts';

const expires='2026-11-04T00:00:00.000Z';
const actor:VerifiedActor={actorId:'SYN-OWNER',role:'BETA',sessionIdHash:'SYN-SESSION',
  csrfToken:'C'.repeat(32),betaAllowed:true,sessionExpiresAt:expires,schoolMailProofExpiresAt:expires};
const item={inputRef:'SYN-INPUT',operation:'HCX_007' as const,task:'opportunity_terms' as const,
  asOf:'2026-11-03T00:00:00.000Z',expiresAt:expires};
type Api=ReturnType<typeof createIntegratedApi>;
const apps:Api[]=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(app=>app.close()));});
function fixture(list?:()=>Promise<ApprovedProviderInputs>){
  let identity:VerifiedActor|null=actor;
  const guard=vi.fn(async()=>identity);
  const app=createIntegratedApi({repository:new MemoryApiRepository({profiles:[]}),
    allowedOrigin:'https://synthetic.invalid',
    auth:{verifySession:guard,revokeSession:async()=>{identity=null;}},
    now:()=> '2026-11-03T00:30:00.000Z',
    ...(list?{approvedAiInputs:{list}}:{}),
  });
  apps.push(app);
  return {app,guard,setActor:(v:VerifiedActor|null)=>{identity=v;}};
}
describe('integrated approved input route is BETA-only, no raw payload and fail-closed',()=>{
  it('passes only the currently verified BETA identity and returns minimal bounded items',async()=>{
    const list=vi.fn(async()=>({items:[item]}));
    const f=fixture(list),response=await f.app.inject({url:'/api/ai/approved-inputs',headers:{cookie:'SYN'}});
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({items:[item]});
    expect(response.headers['cache-control']).toContain('no-store');
    expect(list).toHaveBeenCalledTimes(1);
    expect(f.guard.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(response.json())).not.toMatch(/actorId|secret|raw|safe_packet|media_bytes/);
  });
  it('missing adapter stays 503; signed-out and reviewer cannot query an approved input',async()=>{
    expect((await fixture().app.inject({url:'/api/ai/approved-inputs',headers:{cookie:'SYN'}}))
      .statusCode).toBe(503);
    const f=fixture(async()=>({items:[item]}));f.setActor(null);
    expect((await f.app.inject({url:'/api/ai/approved-inputs'})).statusCode).toBe(401);
    // Strict reviewer sessions must not inherit BETA-only fields: that malformed
    // shape would fail session parsing at 401 before exercising role isolation.
    f.setActor({actorId:actor.actorId,role:'REVIEWER',sessionIdHash:actor.sessionIdHash,
      csrfToken:actor.csrfToken,sessionExpiresAt:expires,
      verifiedEmail:'reviewer@example.invalid',identityProofExpiresAt:expires});
    expect((await f.app.inject({url:'/api/ai/approved-inputs',headers:{cookie:'SYN'}}))
      .statusCode).toBe(403);
  });
  it('rejects malicious port results or revoked session between DB read and reply',async()=>{
    const f=fixture(async()=>({items:[item],rawSource:'PRIVATE'} as never));
    expect((await f.app.inject({url:'/api/ai/approved-inputs',headers:{cookie:'SYN'}}))
      .statusCode).toBe(503);
    const other=fixture(async()=>{other.setActor(null);return {items:[item]};});
    expect((await other.app.inject({url:'/api/ai/approved-inputs',headers:{cookie:'SYN'}}))
      .statusCode).toBe(401);
  });
});
