import {afterEach,describe,expect,it} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {createTrustedOwnerDoubleMajorSource} from '../../apps/api/src/modules/academics/owner-double-major-source.js';
import {HufsApiClient} from '../../apps/web/src/integrations/api-client.js';
import {OwnerSessionController} from '../../apps/web/src/app/owner-session-controller.js';
import {doubleMajorInput} from './owner-double-major-fixture.js';
import type {VerifiedActor} from '../../apps/api/src/types.js';
const at='2026-11-03T00:00:00.000Z',origin='https://synthetic.invalid';
const beta={role:'BETA' as const,actorId:'SYN-OWNER',sessionIdHash:'H'.repeat(32),
  csrfToken:'C'.repeat(32),betaAllowed:true,sessionExpiresAt:'2026-12-01T00:00:00.000Z',
  schoolMailProofExpiresAt:'2026-12-01T00:00:00.000Z'};
const apps:ReturnType<typeof createIntegratedApi>[]=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(x=>x.close()));});
function create(enabled=true){
  let principal:VerifiedActor|null=beta,allowed=true,revoked=false,reads=0;
  const source=createTrustedOwnerDoubleMajorSource({snapshots:{
    load:async()=>{reads++;return{actorId:beta.actorId,asOf:at,receipt:'SYN-SOURCE-RECEIPT',
      projectionVersion:'SYN-PROJ-V1',input:doubleMajorInput()};},
    revalidate:async()=>!revoked,
  }});
  const app=createIntegratedApi({
    allowedOrigin:origin,repository:new MemoryApiRepository({profiles:[]}),
    auth:{verifySession:async()=>principal,revokeSession:async()=>{principal=null;}},
    now:()=>at,...(enabled?{doubleMajor:{source,rights:{
      mayInspect:async()=>allowed,
      authorize:async()=>({allowed,rightsReceipt:'SYN-RIGHTS-RECEIPT'}),
      revalidate:async()=>allowed&&!revoked,
    }}}:{}),
  });apps.push(app);
  const client=new HufsApiClient(async(url,init)=>{
    const headers:Record<string,string>={};new Headers(init.headers).forEach((val,key)=>{headers[key]=val;});
    const response=await app.inject({url,method:init.method??'GET',
      headers:{...headers,origin,cookie:'SYN_SESSION'},
      ...(init.body===undefined?{}:{payload:JSON.parse(String(init.body))})});
    return new Response(response.body,{status:response.statusCode,headers:{'content-type':'application/json'}});
  });
  return{client,setPrincipal:(p:VerifiedActor|null)=>{principal=p;},
    revoke:()=>{revoked=true;},deny:()=>{allowed=false;},reads:()=>reads};
}
describe('#144 browser→integrated Fastify→current double-major rights',()=>{
  it('checks owner session, current source, specific rights and Strict DTO at the HTTP boundary',async()=>{
    const f=create(),scope=new OwnerSessionController(f.client);
    await scope.initialize();
    expect(scope.getState().status).toBe('READY');
    const result=await scope.runLatest('double-major',signal=>f.client.owner.getDoubleMajor(signal));
    expect(result).toMatchObject({selection:'SELECTED',state:'NEEDS_REVIEW',
      overlap:{status:'NO_APPROVED_RULE',sharedCreditUnits:6}});
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE-ATTEMPT-TOKEN|SYN-SOURCE-RECEIPT|original_bytes/);
    expect(f.reads()).toBe(1);
  });
  it('fail-closes a missing adapter and never reads a private transcript',async()=>{
    const f=create(false);
    await expect(f.client.owner.getDoubleMajor()).rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE',status:503});
    expect(f.reads()).toBe(0);
  });
  it('revokes rights and detects actor replacement without returning stale student details',async()=>{
    const f=create(),scope=new OwnerSessionController(f.client);
    await scope.initialize();
    expect((await scope.runLatest('academics',s=>f.client.owner.getDoubleMajor(s)))?.state).toBe('NEEDS_REVIEW');
    f.deny();await expect(f.client.owner.getDoubleMajor()).rejects.toMatchObject({code:'FORBIDDEN'});
    f.revoke();await expect(f.client.owner.getDoubleMajor()).rejects.toMatchObject({code:'FORBIDDEN'});
    f.setPrincipal({...beta,actorId:'SYN-OTHER'});
    expect(await scope.runLatest('academics',s=>f.client.owner.getDoubleMajor(s))).toBeNull();
    expect(scope.getState().status).toBe('SIGNED_OUT');
  });
});
