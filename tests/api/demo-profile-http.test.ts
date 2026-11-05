import {afterEach,describe,expect,it} from 'vitest';
import {createApi} from '../../apps/api/src/server.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {registerDemoProfileRoutes} from '../../apps/api/src/modules/profiles/demo-profile-http.js';
import type {DemoProfileQuotaPort} from '../../apps/api/src/modules/profiles/demo-profile-http.js';
import {DemoProfileConflict,recomputeDemoProfile,type DemoProfilePort} from '../../apps/api/src/modules/profiles/demo-profile.js';
import {blankDemoProfileValue,blankDemoProfileWorkspace} from '@hufs-one/contracts';
import type {VerifiedActor} from '../../apps/api/src/types.js';
const NOW='2026-11-03T00:00:00.000Z',origin='https://synthetic.invalid';
const actor={role:'BETA' as const,actorId:'synthetic:owner-a',sessionIdHash:'S'.repeat(32),
  sessionExpiresAt:'2026-12-01T00:00:00Z',schoolMailProofExpiresAt:'2026-12-01T00:00:00Z',betaAllowed:true,csrfToken:'C'.repeat(32)};
const value={primaryMajor:'가상 정보학',earnedCreditUnits:0,interestTopics:['AI_ML'],doubleMajor:{kind:'NONE'}};
const apps:Array<ReturnType<typeof createApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(app=>app.close()));});
function fixture(absent=false,quota?:DemoProfileQuotaPort){
  let identity:VerifiedActor|null=actor;const ids:string[]=[];
  const result=recomputeDemoProfile({version:0,value:blankDemoProfileValue(),updatedAt:null});
  const port:DemoProfilePort={read:async id=>{ids.push(id);return result;},
    save:async(id,input)=>{ids.push(id);return recomputeDemoProfile({version:input.expectedVersion+1,value:input.value,updatedAt:NOW});},
    saveWorkspace:async(id,input)=>{ids.push(id);return recomputeDemoProfile({version:input.expectedVersion+1,
      value:blankDemoProfileValue(),workspace:input.workspace,updatedAt:NOW});},
    reset:async(id,input)=>{ids.push(id);return recomputeDemoProfile({version:input.expectedVersion+1,value:blankDemoProfileValue(),updatedAt:NOW});}};
  const verify=async()=>identity;
  const app=createApi({repository:new MemoryApiRepository({profiles:[]}),allowedOrigin:origin,verifySession:verify,now:()=>NOW});
  registerDemoProfileRoutes(app,absent?undefined:port,{verify,now:()=>NOW},quota);apps.push(app);
  return {app,port,ids,setActor:(a:VerifiedActor|null)=>{identity=a;}};
}
const headers={origin,'x-csrf-token':actor.csrfToken};
describe('standard product independent demo-profile HTTP',()=>{
  it('uses current server BETA actor, no-store and normal product endpoints with recomputation',async()=>{
    const h=fixture(),initial=await h.app.inject({url:'/api/demo-profile'});
    expect(initial.statusCode).toBe(200);expect(initial.headers['cache-control']).toBe('no-store');
    expect(initial.json().profile.version).toBe(0);expect(initial.json().snapshot.namespace).toBe('EMPTY_DEMO');
    const saved=await h.app.inject({method:'PATCH',url:'/api/demo-profile',headers,payload:{expectedVersion:0,value}});
    expect(saved.statusCode).toBe(200);expect(saved.json().snapshot.feed.featured.length).toBeGreaterThan(0);
    expect((await h.app.inject({url:'/api/demo-profile/snapshot'})).statusCode).toBe(200);
    expect((await h.app.inject({method:'POST',url:'/api/demo-profile/reset',headers,payload:{expectedVersion:1}})).json().profile.value).toEqual(blankDemoProfileValue());
    expect(h.ids.every(id=>id===actor.actorId)).toBe(true);
  });
  it('denies anonymous, REVIEWER, forged subject/query/body and CSRF before touching storage',async()=>{
    const h=fixture();h.setActor(null);
    expect((await h.app.inject({url:'/api/demo-profile',headers:{'x-actor-id':actor.actorId}})).statusCode).toBe(401);
    h.setActor({role:'REVIEWER',actorId:'synthetic:reviewer',sessionIdHash:actor.sessionIdHash,
      csrfToken:actor.csrfToken,sessionExpiresAt:actor.sessionExpiresAt,verifiedEmail:'reviewer@example.invalid',identityProofExpiresAt:actor.sessionExpiresAt});
    expect((await h.app.inject({url:'/api/demo-profile'})).statusCode).toBe(403);
    h.setActor(actor);
    for(const proof of [{},{origin},{...headers,origin:'https://evil.invalid'}]){
      expect((await h.app.inject({method:'PATCH',url:'/api/demo-profile',headers:proof,payload:{expectedVersion:0,value}})).statusCode).toBe(403);
    }
    expect((await h.app.inject({method:'PATCH',url:'/api/demo-profile',headers,payload:{expectedVersion:0,value,actorId:'forged'}})).statusCode).toBe(422);
    expect((await h.app.inject({url:'/api/demo-profile?accountId=S01'})).statusCode).toBe(422);
    expect(h.ids).toEqual([]);
  });
  it('fails closed on missing provider, conflict, malformed response and session swap during store work',async()=>{
    const absent=fixture(true);
    expect((await absent.app.inject({url:'/api/demo-profile'})).statusCode).toBe(503);
    const h=fixture();h.port.save=async()=>{throw new DemoProfileConflict();};
    expect((await h.app.inject({method:'PATCH',url:'/api/demo-profile',headers,payload:{expectedVersion:0,value}})).statusCode).toBe(409);
    h.port.read=async()=>({} as never);
    expect((await h.app.inject({url:'/api/demo-profile'})).statusCode).toBe(503);
    h.port.read=async()=>{h.setActor({...actor,actorId:'synthetic:owner-b'});return recomputeDemoProfile({version:0,value:blankDemoProfileValue(),updatedAt:null});};
    expect((await h.app.inject({url:'/api/demo-profile'})).statusCode).toBe(403);
  });
  it('bounds synthetic per-actor writes and returns 429 before the store',async()=>{
    const h=fixture();
    for(let i=0;i<20;i++)expect((await h.app.inject({method:'PATCH',url:'/api/demo-profile',headers,
      payload:{expectedVersion:0,value}})).statusCode).toBe(200);
    const denied=await h.app.inject({method:'PATCH',url:'/api/demo-profile',headers,payload:{expectedVersion:0,value}});
    expect(denied.statusCode).toBe(429);expect(h.ids).toHaveLength(20);
  });

  it('uses a shared actor-bound limiter and rejects excess without touching storage',async()=>{
    const seen:Array<[string,string]>=[];
    const quota:DemoProfileQuotaPort={consume:async(id,operation)=>{
      seen.push([id,operation]);return operation==='READ';
    }};
    const h=fixture(false,quota);
    expect((await h.app.inject({url:'/api/demo-profile'})).statusCode).toBe(200);
    const denied=await h.app.inject({
      method:'PATCH',url:'/api/demo-profile',headers,
      payload:{expectedVersion:0,value},
    });
    expect(denied.statusCode).toBe(429);
    expect(seen).toEqual([[actor.actorId,'READ'],[actor.actorId,'WRITE']]);
    expect(h.ids).toHaveLength(1);
  });

  it('fails closed on shared quota storage outage without executing profile writes',async()=>{
    const h=fixture(false,{consume:async()=>{throw new Error('offline');}});
    expect((await h.app.inject({url:'/api/demo-profile'})).statusCode).toBe(503);
    expect((await h.app.inject({
      method:'PATCH',url:'/api/demo-profile',headers,payload:{expectedVersion:0,value},
    })).statusCode).toBe(503);
    expect(h.ids).toEqual([]);
  });

  it('waits for shared WRITE quota before saving a demo workspace',async()=>{
    let entered!:()=>void,releaseQuota!:(allowed:boolean)=>void;
    const started=new Promise<void>(resolve=>{entered=resolve;});
    const admission=new Promise<boolean>(resolve=>{releaseQuota=resolve;});
    const seen:Array<[string,string]>=[];
    const h=fixture(false,{consume:async(id,operation)=>{
      seen.push([id,operation]);entered();return admission;
    }});
    let responded=false;
    const pending=h.app.inject({method:'PUT',url:'/api/demo-profile/workspace',headers,
      payload:{expectedVersion:0,workspace:blankDemoProfileWorkspace()}})
      .then(response=>{responded=true;return response;});
    await started;
    // Give the handler a complete event-loop turn while the quota is unresolved.
    await new Promise<void>(resolve=>setImmediate(resolve));
    const savedBeforeAdmission=[...h.ids],respondedBeforeAdmission=responded;
    releaseQuota(true);
    const response=await pending;
    expect(savedBeforeAdmission).toEqual([]);
    expect(respondedBeforeAdmission).toBe(false);
    expect(seen).toEqual([[actor.actorId,'WRITE']]);
    expect(response.statusCode).toBe(200);
    expect(h.ids).toEqual([actor.actorId]);
  });

  it.each([
    {name:'denial',throws:false,status:429},
    {name:'storage failure',throws:true,status:503},
  ])('does not save a demo workspace after shared quota $name',async({throws,status})=>{
    const seen:Array<[string,string]>=[];
    const h=fixture(false,{consume:async(id,operation)=>{
      seen.push([id,operation]);
      if(throws)throw new Error('synthetic quota unavailable');
      return false;
    }});
    const response=await h.app.inject({method:'PUT',url:'/api/demo-profile/workspace',headers,
      payload:{expectedVersion:0,workspace:blankDemoProfileWorkspace()}});
    expect(h.ids).toEqual([]);
    expect(response.statusCode).toBe(status);
    expect(seen).toEqual([[actor.actorId,'WRITE']]);
  });

});
