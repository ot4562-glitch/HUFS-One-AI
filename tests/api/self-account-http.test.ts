import {afterEach,describe,expect,it} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import type {SelfAccountPort} from '../../apps/api/src/modules/profiles/self-account-postgres.js';
import {SelfProfileValueSchema} from '@hufs-one/contracts';
import type {SelfProfile,SelfConsent} from '@hufs-one/contracts';
const NOW='2026-11-01T00:00:00.000Z';
const origin='https://synthetic.invalid';
const actor={
  role:'BETA' as const,actorId:'SYN-ACCOUNT-ACTOR',sessionIdHash:'H'.repeat(24),
  sessionExpiresAt:'2026-11-10T00:00:00.000Z',
  schoolMailProofExpiresAt:'2026-11-10T00:00:00.000Z',
  betaAllowed:true,csrfToken:'C'.repeat(32),
};
const choices={personalStorage:true,teamReview:false,externalAi:false,
  ncpStorage:false,presentation:false};
const value=SelfProfileValueSchema.parse({displayName:'가상 계정',
  interestTopics:['DATA_ANALYTICS'],desiredJobTopics:['DATA_ANALYTICS']});
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{await Promise.all(apps.map(a=>a.close()));apps.length=0;});
function fixture(){
  let active=true,consents:SelfConsent|null=null,profile:SelfProfile|null=null;
  let actorLog:string[]=[],stolenActor=false;
  const selfAccount:SelfAccountPort={
    readProfile:async(id)=>{actorLog.push(id);return profile;},
    patchProfile:async(id,raw)=>{
      actorLog.push(id);
      const created:SelfProfile={version:1,value,updatedAt:NOW};
      profile=created;return created;
    },
    readConsents:async(id)=>{actorLog.push(id);return consents;},
    putConsents:async(id)=>{
      actorLog.push(id);
      consents={version:1,choices,updatedAt:NOW};return consents;
    },
  };
  const app=createIntegratedApi({
    allowedOrigin:origin,repository:new MemoryApiRepository({profiles:[]}),
    auth:{verifySession:async()=>active?stolenActor?{...actor,actorId:'SYN-OTHER'}:actor:null,
      revokeSession:async()=>{}},now:()=>NOW,selfAccount,
  });apps.push(app);
  return {app,actorLog,
    revoke:()=>{active=false;},swap:()=>{stolenActor=true;},
    setPort:(method:keyof SelfAccountPort,fn:(...args:any[])=>any)=>{
      (selfAccount as unknown as Record<string,any>)[method]=fn;
    }};
}
const headers={origin,'x-csrf-token':actor.csrfToken};
describe('A13 owner-private profile and granular consent HTTP scope',()=>{
  it('rejects anonymous, spoofed identity and REVIEWER roles before touching the store',async()=>{
    const h=fixture();
    h.revoke();
    expect((await h.app.inject({url:'/api/profile',headers:{'x-user-id':actor.actorId}})).statusCode).toBe(401);
    expect(h.actorLog).toHaveLength(0);
    const reviewer={actorId:'SYN-REVIEWER',sessionIdHash:actor.sessionIdHash,
      csrfToken:actor.csrfToken,sessionExpiresAt:actor.sessionExpiresAt,
      role:'REVIEWER' as const,
      verifiedEmail:'reviewer@example.invalid',identityProofExpiresAt:'2026-11-10T00:00:00Z'};
    const app=createIntegratedApi({allowedOrigin:origin,
      repository:new MemoryApiRepository({profiles:[]}),
      auth:{verifySession:async()=>reviewer,revokeSession:async()=>{}},
      now:()=>NOW,selfAccount:{readProfile:async()=>{throw Error('leak');},
        readConsents:async()=>{throw Error('leak');},
        patchProfile:async()=>{throw Error('leak');},putConsents:async()=>{throw Error('leak');}},
    });apps.push(app);
    const response=await app.inject({url:'/api/profile'});
    expect(response.statusCode).toBe(403);
  });
  it('requires exact Origin+CSRF for consent and profile writes and prohibits forged actor',async()=>{
    const h=fixture();
    for(const url of ['/api/consents','/api/profile']){
      const method=url.endsWith('consents')?'PUT':'PATCH';
      for(const hds of [{},{origin},{...headers,origin:'https://evil.invalid'}]){
        const res=await h.app.inject({method,url,headers:hds,
          payload:{expectedVersion:0,choices,value}});
        expect(res.statusCode).toBe(403);
      }
    }
    const changed=await h.app.inject({method:'PUT',url:'/api/consents',
      headers,payload:{expectedVersion:0,choices,actorId:'SYN-IMPOSTOR'}});
    expect(changed.statusCode).toBe(422);
    expect(h.actorLog).toHaveLength(0);
  });
  it('returns only owner-bound values and no consent granted by default',async()=>{
    const h=fixture();
    expect((await h.app.inject({url:'/api/consents'})).json()).toEqual({consents:null});
    expect((await h.app.inject({url:'/api/profile'})).json()).toEqual({profile:null});
    const put=await h.app.inject({url:'/api/consents',method:'PUT',
      headers,payload:{expectedVersion:0,choices}});
    expect(put.statusCode).toBe(200);
    expect(put.json().consents.choices.externalAi).toBe(false);
    const patch=await h.app.inject({url:'/api/profile',method:'PATCH',headers,
      payload:{expectedVersion:0,value}});
    expect(patch.statusCode).toBe(200);
    expect(patch.json().profile.value.displayName).toBe('가상 계정');
    expect(h.actorLog.every(x=>x===actor.actorId)).toBe(true);
    expect(patch.headers['cache-control']).toBe('no-store');
  });
  it('fails closed when owner grant or OAuth session changes while a query awaits',async()=>{
    const h=fixture();
    h.setPort('readProfile',async()=>{h.revoke();return {
      version:1,value,updatedAt:NOW,
    };});
    const response=await h.app.inject({url:'/api/profile'});
    expect(response.statusCode).toBe(401);
    expect(response.json()).not.toHaveProperty('profile');
  });
  it('converts version conflict and storage failure without leaking SQL details',async()=>{
    const h=fixture();
    h.setPort('patchProfile',async()=>{const {SelfAccountConflict}=await import(
      '../../apps/api/src/modules/profiles/self-account-postgres.js');
      throw new SelfAccountConflict();
    });
    const conflict=await h.app.inject({url:'/api/profile',method:'PATCH',headers,
      payload:{expectedVersion:0,value}});
    expect(conflict.statusCode).toBe(409);
    h.setPort('readConsents',async()=>{throw new Error('private SQL/identity leaked');});
    const unavailable=await h.app.inject({url:'/api/consents'});
    expect(unavailable.statusCode).toBe(503);
    expect(JSON.stringify(unavailable.json())).not.toContain('private SQL');
  });
  it('does not serialize private actor columns returned by a misconfigured owner adapter',async()=>{
    const h=fixture();
    h.setPort('readProfile',async()=>({version:1,value,updatedAt:NOW,
      actorId:'SYN-PRIVATE',sessionIdHash:'PRIVATE-COLUMN'}));
    const res=await h.app.inject({url:'/api/profile'});
    expect(res.statusCode).toBe(503);
    expect(res.body).not.toContain('SYN-PRIVATE');
    expect(res.body).not.toContain('PRIVATE-COLUMN');
    h.setPort('readConsents',async()=>({version:1,choices,updatedAt:NOW,
      actorId:'SYN-PRIVATE'}));
    const consent=await h.app.inject({url:'/api/consents'});
    expect(consent.statusCode).toBe(503);
    expect(consent.body).not.toContain('SYN-PRIVATE');
  });
  it('does not acknowledge an owner CAS write with an incorrect version or value',async()=>{
    const h=fixture();
    h.setPort('patchProfile',async()=>({version:99,value,updatedAt:NOW}));
    const invalid=await h.app.inject({method:'PATCH',url:'/api/profile',headers,
      payload:{expectedVersion:0,value}});
    expect(invalid.statusCode).toBe(503);
    expect(invalid.json()).not.toHaveProperty('profile');
    h.setPort('putConsents',async()=>({version:1,choices:{...choices,externalAi:true},
      updatedAt:NOW}));
    const stale=await h.app.inject({method:'PUT',url:'/api/consents',headers,
      payload:{expectedVersion:0,choices}});
    expect(stale.statusCode).toBe(503);
    expect(stale.json()).not.toHaveProperty('consents');
  });
  it('does not register new routes without an explicitly approved owner store',async()=>{
    const app=createIntegratedApi({allowedOrigin:origin,repository:new MemoryApiRepository({profiles:[]}),
      auth:{verifySession:async()=>actor,revokeSession:async()=>{}},now:()=>NOW,
    });apps.push(app);
    expect(app.hasRoute({method:'PATCH',url:'/api/profile'})).toBe(false);
    expect((await app.inject({url:'/api/profile'})).statusCode).toBe(403);
  });
});
