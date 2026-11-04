import {afterEach,describe,expect,it} from 'vitest';
import Fastify from 'fastify';
import {z} from 'zod';
import {doubleMajorInput} from './owner-double-major-fixture.js';
import {registerOwnerDoubleMajorRoutes} from '../../apps/api/src/modules/academics/owner-double-major-http.js';
import type {TrustedOwnerDoubleMajorRights} from '../../apps/api/src/modules/academics/owner-double-major-http.js';
import {createTrustedOwnerDoubleMajorSource} from '../../apps/api/src/modules/academics/owner-double-major-source.js';
import type {TrustedOwnerDoubleMajorSource} from '../../apps/api/src/modules/academics/owner-double-major-source.js';
import type {VerifiedActor} from '../../apps/api/src/types.js';
import {ApiFailure} from '../../apps/api/src/modules/auth/gates.js';
const at='2026-11-03T00:00:00.000Z';
const actor={role:'BETA' as const,actorId:'SYN-OWNER',sessionIdHash:'H'.repeat(32),csrfToken:'C'.repeat(32),
  betaAllowed:true,sessionExpiresAt:'2026-12-01T00:00:00.000Z',schoolMailProofExpiresAt:'2026-12-01T00:00:00.000Z'};
const apps:ReturnType<typeof Fastify>[]=[];
afterEach(async()=>{for(const app of apps.splice(0))await app.close();});
function fixture(){
  let session:VerifiedActor|null=actor,allowed=true,current=true,reads=0;
  const source:TrustedOwnerDoubleMajorSource=createTrustedOwnerDoubleMajorSource({snapshots:{load:async()=>{
    reads++;return {actorId:actor.actorId,asOf:at,receipt:'SYN-SOURCE-RECEIPT',projectionVersion:'SYN-PROJ-V1',input:doubleMajorInput()};
  },revalidate:async()=>current}});
  const rights:TrustedOwnerDoubleMajorRights={mayInspect:async()=>allowed,authorize:async()=>({allowed,rightsReceipt:'SYN-RIGHTS-RECEIPT'}),revalidate:async()=>allowed};
  const app=Fastify();apps.push(app);
  app.setErrorHandler((error,_request,reply)=>{
    const code=error instanceof ApiFailure?error.code:error instanceof z.ZodError?'INVALID_INPUT':'PROVIDER_UNAVAILABLE';
    return reply.code(({FORBIDDEN:403,UNAUTHENTICATED:401,INVALID_INPUT:422,PROVIDER_UNAVAILABLE:503} as Record<string,number>)[code]??500).send({code});
  });
  registerOwnerDoubleMajorRoutes({app,source,rights,session:{verify:async()=>session,now:()=>at}});
  return {app,source,rights,reads:()=>reads,revoke:()=>{session=null;},switchActor:()=>{session={...actor,actorId:'SYN-OTHER'};},
    deny:()=>{allowed=false;},stale:()=>{current=false;},reviewer:()=>{session={role:'REVIEWER',actorId:'SYN-REVIEWER',sessionIdHash:'R'.repeat(32),csrfToken:'C'.repeat(32),sessionExpiresAt:'2026-12-01T00:00:00.000Z',verifiedEmail:'synthetic@example.invalid',identityProofExpiresAt:'2026-12-01T00:00:00.000Z'};}};
}
describe('authorized current double-major GET',()=>{
  it('returns scoped current core output with no-store and no server receipt or transcript identity',async()=>{
    const h=fixture(),response=await h.app.inject({url:'/api/academics/double-major'});
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toMatchObject({selection:'SELECTED',state:'NEEDS_REVIEW',uniqueCredits:{earnedCreditUnits:6}});
    expect(response.body).not.toContain('PRIVATE-ATTEMPT-TOKEN');expect(response.body).not.toContain('SYN-SOURCE-RECEIPT');
    expect(response.body).not.toContain('SYN-OWNER');
  });
  it('requires BETA session and independent personal-data permission before any private read',async()=>{
    for(const change of [(h:ReturnType<typeof fixture>)=>h.revoke(),(h:ReturnType<typeof fixture>)=>h.reviewer(),(h:ReturnType<typeof fixture>)=>h.deny()]){
      const h=fixture();change(h);expect((await h.app.inject({url:'/api/academics/double-major'})).statusCode).toBeGreaterThanOrEqual(401);
      expect(h.reads()).toBe(0);
    }
  });
  it('does not let a permission await carry a replaced session into the source read',async()=>{
    const h=fixture();h.rights.mayInspect=async()=>{h.switchActor();return true;};
    expect((await h.app.inject({url:'/api/academics/double-major'})).statusCode).toBe(403);expect(h.reads()).toBe(0);
  });
  it('rejects actor/asOf/pack/state query injection before reading',async()=>{
    const h=fixture();
    for(const query of ['actorId=SYN-OTHER','asOf=2099-01-01T00:00:00Z','rulePack=APPROVED','state=READY'])
      expect((await h.app.inject({url:'/api/academics/double-major?'+query})).statusCode).toBe(422);
    expect(h.reads()).toBe(0);
  });
  it('revalidates source correction, rights withdrawal and logout after awaited authorization',async()=>{
    for(const change of [(h:ReturnType<typeof fixture>)=>h.stale(),(h:ReturnType<typeof fixture>)=>h.deny(),(h:ReturnType<typeof fixture>)=>h.revoke()]){
      const h=fixture();h.rights.authorize=async()=>{change(h);return {allowed:true,rightsReceipt:'SYN-RIGHTS-RECEIPT'};};
      const response=await h.app.inject({url:'/api/academics/double-major'});
      expect(response.statusCode).toBeGreaterThanOrEqual(401);expect(response.body).not.toContain('sharedCreditUnits');
    }
  });
  it('checks source/consent again after the final rights await',async()=>{
    const h=fixture();h.rights.revalidate=async()=>{h.stale();return true;};
    expect((await h.app.inject({url:'/api/academics/double-major'})).statusCode).toBe(403);
  });
  it('detaches the validated response before invoking external authority code',async()=>{
    const h=fixture();h.rights.authorize=async value=>{
      (value.check as Record<string,unknown>).actorId='injected-private-identity';
      return {allowed:true,rightsReceipt:'SYN-RIGHTS-RECEIPT'};
    };
    const response=await h.app.inject({url:'/api/academics/double-major'});
    expect(response.statusCode).toBe(200);expect(response.body).not.toContain('injected-private-identity');
  });
});
