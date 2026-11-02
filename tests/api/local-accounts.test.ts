import {afterEach,describe,expect,it} from 'vitest';
import {LocalAccountSnapshotSchema} from '@hufs-one/contracts';
import {createLocalAccountApi} from '../../apps/api/src/modules/local-accounts/http.js';
import {LocalAccountStore,recomputeLocalAccount} from '../../apps/api/src/modules/local-accounts/store.js';

const ORIGIN='http://127.0.0.1:5173';
const apps:Array<ReturnType<typeof createLocalAccountApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(app=>app.close()));});
async function setup(store=new LocalAccountStore()){
  const app=createLocalAccountApi({mode:'SYNTHETIC',environment:'test',allowedOrigin:ORIGIN,store});apps.push(app);
  const boot=await app.inject({url:'/api/local-accounts/session'}),session=boot.json();
  let cookie=boot.headers['set-cookie']!.toString().split(';')[0]!;
  let csrf=session.csrfToken as string;
  const headers=()=>({cookie,origin:ORIGIN,'x-csrf-token':csrf});
  const read=()=>app.inject({url:'/api/local-accounts/snapshot',headers:{cookie}});
  const switchTo=async(accountId:string)=>{
    const r=await app.inject({method:'POST',url:'/api/local-accounts/session',headers:headers(),payload:{accountId}});
    expect(r.statusCode).toBe(200);cookie=r.headers['set-cookie']!.toString().split(';')[0]!;csrf=r.json().csrfToken;
    return r;
  };
  return {app,session,headers,read,switchTo};
}
describe('synthetic local account HTTP boundary',()=>{
  it('requires explicit synthetic mode and blocks production',()=>{
    expect(()=>createLocalAccountApi({mode:'REAL',environment:'test'})).toThrow();
    expect(()=>createLocalAccountApi({mode:'SYNTHETIC',environment:'production'})).toThrow();
  });
  it('bootstraps exactly five independent synthetic accounts with an empty demo',async()=>{
    const h=await setup();expect(h.session.accounts).toHaveLength(5);
    expect(h.session.accounts.map((a:{accountId:string})=>a.accountId)).toEqual(['BLANK_DEMO','SYN_OWNER_1','SYN_OWNER_2','SYN_OWNER_3','SYN_OWNER_4']);
    const s=LocalAccountSnapshotSchema.parse((await h.read()).json());
    expect(s.profile.earnedCredits).toBeNull();expect(s.profile.primaryMajor).toBeNull();
    expect(s.profile.interestTopics).toEqual([]);expect(s.feed.featured).toEqual([]);
    expect(s.clubs.recommended).toEqual([]);expect(s.academics.state).toBe('UNKNOWN');
  });
  it('sets the synthetic session cookie only for a newly created bootstrap session',async()=>{
    const h=await setup();
    const existing=await h.app.inject({url:'/api/local-accounts/session',headers:{cookie:h.headers().cookie}});
    expect(existing.statusCode).toBe(200);expect(existing.json().sessionId).toBe(h.session.sessionId);
    expect(existing.headers['set-cookie']).toBeUndefined();
    const created=await h.app.inject({url:'/api/local-accounts/session'});
    expect(created.statusCode).toBe(200);expect(created.headers['set-cookie']).toBeDefined();
  });
  it('a revoked bootstrap cookie cannot replace a newer account switch in another tab',async()=>{
    const h=await setup(),oldCookie=h.headers().cookie;
    await h.switchTo('SYN_OWNER_1');
    const stale=await h.app.inject({url:'/api/local-accounts/session',headers:{cookie:oldCookie}});
    expect(stale.statusCode).toBe(401);
    expect(stale.json().error).toBe('SESSION_REQUIRED');
    expect(stale.headers['set-cookie']).toBeUndefined();
    const valid=await h.app.inject({url:'/api/local-accounts/session',headers:{cookie:h.headers().cookie}});
    expect(valid.statusCode).toBe(200);
    expect(valid.json().accountId).toBe('SYN_OWNER_1');
    expect(valid.headers['set-cookie']).toBeUndefined();
  });
  it('denies unauthenticated, forged actors, CSRF, hostile origin and hostile host',async()=>{
    const h=await setup(),payload={expectedRevision:0};
    expect((await h.app.inject({url:'/api/local-accounts/snapshot',headers:{'x-actor-id':'SYN_OWNER_1'}})).statusCode).toBe(401);
    for(const headers of [{cookie:h.headers().cookie},{...h.headers(),origin:'https://evil.test'},
      {...h.headers(),'x-csrf-token':'forged'}]){
      expect((await h.app.inject({method:'POST',url:'/api/local-accounts/reset',headers,payload})).statusCode).toBe(403);
    }
    expect((await h.app.inject({url:'/api/local-accounts/session',headers:{host:'evil.test'}})).statusCode).toBe(403);
  });
  it('rejects non-ASCII and repeated CSRF tokens without a server error',async()=>{
    const h=await setup();
    for(const csrf of ['é'.repeat(64),['forged','forged']]){
      const r=await h.app.inject({method:'POST',url:'/api/local-accounts/reset',
        headers:{...h.headers(),'x-csrf-token':csrf},payload:{expectedRevision:0}});
      expect(r.statusCode).toBe(403);expect(r.json().error).toBe('CSRF_REJECTED');
    }
  });
  it('recomputes all views for arbitrary edits and never infers graduation',async()=>{
    const h=await setup(),old=(await h.read()).json();
    const profile={...old.profile,interestTopics:['DATA_ANALYTICS','AI_ML'],desiredJobTopics:['SOFTWARE_DEV'],earnedCredits:0};
    const r=await h.app.inject({method:'PATCH',url:'/api/local-accounts/profile',headers:h.headers(),payload:{expectedRevision:0,profile}});
    expect(r.statusCode).toBe(200);const updated=LocalAccountSnapshotSchema.parse(r.json());
    expect(updated.revision).toBe(1);expect(updated.profile.earnedCredits).toBe(0);
    expect(updated.feed.featured.length).toBeGreaterThan(0);expect(updated.clubs.recommended.length).toBeGreaterThan(0);
    expect(updated.notices).not.toEqual(old.notices);expect(updated.academics.state).toBe('UNKNOWN');
    expect(updated.forecast.state).toBe('UNKNOWN');
  });
  it('uses one CAS revision across profile, workspace and reset, and shares state across browser sessions',async()=>{
    const store=new LocalAccountStore(),h=await setup(store),other=await setup(store),old=(await h.read()).json();
    const workspace={bookmarks:['SYN-OPP-002'],experiences:[{id:'exp1',title:'가상 경험',summary:'합성 기록',topicCodes:['AI_ML']}],
      planCourseIds:['SYN-COURSE-1'],search:'AI',notifications:true};
    const saved=await h.app.inject({method:'PUT',url:'/api/local-accounts/workspace',headers:h.headers(),payload:{expectedRevision:0,workspace}});
    expect(saved.statusCode).toBe(200);expect((await other.read()).json().workspace).toEqual(workspace);
    expect((await other.app.inject({method:'PATCH',url:'/api/local-accounts/profile',headers:other.headers(),payload:{expectedRevision:0,profile:old.profile}})).statusCode).toBe(409);
    const reset=await h.app.inject({method:'POST',url:'/api/local-accounts/reset',headers:h.headers(),payload:{expectedRevision:1}});
    expect(reset.statusCode).toBe(200);expect(reset.json().revision).toBe(2);
    expect(reset.json().workspace).toEqual(old.workspace);expect(reset.json().profile).toEqual(old.profile);
    expect((await other.app.inject({method:'POST',url:'/api/local-accounts/reset',headers:other.headers(),payload:{expectedRevision:1}})).statusCode).toBe(409);
    expect((await other.app.inject({method:'PUT',url:'/api/local-accounts/workspace',headers:other.headers(),payload:{expectedRevision:1,workspace}})).statusCode).toBe(409);
  });
  it('rotates sessions, isolates owners and forbids owner resets and direct account URLs',async()=>{
    const h=await setup(),oldHeaders=h.headers();await h.switchTo('SYN_OWNER_1');
    expect((await h.app.inject({url:'/api/local-accounts/snapshot',headers:oldHeaders})).statusCode).toBe(401);
    const owner=(await h.read()).json();expect(owner.accountId).toBe('SYN_OWNER_1');
    expect((await h.app.inject({method:'POST',url:'/api/local-accounts/reset',headers:h.headers(),payload:{expectedRevision:owner.revision}})).statusCode).toBe(403);
    expect((await h.app.inject({url:'/api/local-accounts/accounts/SYN_OWNER_2',headers:h.headers()})).statusCode).toBe(404);
    await h.switchTo('BLANK_DEMO');expect((await h.read()).json().profile.interestTopics).toEqual([]);
  });
  it('binds writes to the session actor and preserves all other owner profiles',async()=>{
    const h=await setup();await h.switchTo('SYN_OWNER_1');const owner=(await h.read()).json();
    const changed={...owner.profile,primaryMajor:'직접 입력한 가상 전공',interestTopics:[],desiredJobTopics:[]};
    const forged=await h.app.inject({method:'PATCH',url:'/api/local-accounts/profile',headers:h.headers(),
      payload:{expectedRevision:0,profile:changed,accountId:'SYN_OWNER_2'}});
    expect(forged.statusCode).toBe(400);
    const saved=await h.app.inject({method:'PATCH',url:'/api/local-accounts/profile',headers:h.headers(),payload:{expectedRevision:0,profile:changed}});
    expect(saved.statusCode).toBe(200);expect(saved.json().feed.featured).toEqual([]);
    await h.switchTo('SYN_OWNER_2');const other=(await h.read()).json();expect(other.revision).toBe(0);
    expect(other.profile.primaryMajor).not.toBe(changed.primaryMajor);
    await h.switchTo('SYN_OWNER_1');expect((await h.read()).json().profile).toEqual(changed);
  });
  it('enforces server-side session expiry and revocation before reads and writes',async()=>{
    let now=1_000;const store=new LocalAccountStore({now:()=>now}),h=await setup(store);
    now+=8*60*60*1000;
    expect((await h.read()).statusCode).toBe(401);
    expect((await h.app.inject({method:'POST',url:'/api/local-accounts/reset',headers:h.headers(),payload:{expectedRevision:0}})).statusCode).toBe(401);
    const next=await setup(store);store.revoke(next.session.sessionId);expect((await next.read()).statusCode).toBe(401);
  });
  it('bounds active sessions and recovers capacity when expired sessions are swept',()=>{
    let now=0;const store=new LocalAccountStore({now:()=>now});
    for(let i=0;i<1000;i++)store.createSession();
    expect(()=>store.createSession()).toThrow('SESSION_LIMIT');
    now=8*60*60*1000;expect(()=>store.createSession()).not.toThrow();
  });
  it('rejects old computations after reset or session switch',async()=>{
    let release:(()=>void)|undefined,started:(()=>void)|undefined;
    let paused=false;
    const store=new LocalAccountStore({compute:async input=>{
      if(paused){paused=false;started?.();await new Promise<void>(resolve=>{release=resolve;});}
      return recomputeLocalAccount(input);
    }}),h=await setup(store);
    paused=true;const ready=new Promise<void>(resolve=>{started=resolve;});const late=h.read();await ready;
    const reset=await h.app.inject({method:'POST',url:'/api/local-accounts/reset',headers:h.headers(),payload:{expectedRevision:0}});
    expect(reset.statusCode).toBe(200);release!();expect((await late).statusCode).toBe(409);
    paused=true;const ready2=new Promise<void>(resolve=>{started=resolve;});const late2=h.read();await ready2;
    await h.switchTo('SYN_OWNER_2');release!();expect((await late2).statusCode).toBe(401);
  });
  it('fences a mutation response when a concurrent reset wipes its committed workspace',async()=>{
    let release:(()=>void)|undefined,started:(()=>void)|undefined,paused=false;
    const store=new LocalAccountStore({compute:async input=>{
      if(paused){paused=false;started?.();await new Promise<void>(resolve=>{release=resolve;});}
      return recomputeLocalAccount(input);
    }}),h=await setup(store),original=(await h.read()).json();
    const ready=new Promise<void>(resolve=>{started=resolve;});paused=true;
    const oldWrite=h.app.inject({method:'PUT',url:'/api/local-accounts/workspace',headers:h.headers(),
      payload:{expectedRevision:0,workspace:{...original.workspace,search:'stale write',bookmarks:['SYN-OPP-002']}}});
    await ready;
    const reset=await h.app.inject({method:'POST',url:'/api/local-accounts/reset',headers:h.headers(),payload:{expectedRevision:1}});
    expect(reset.statusCode).toBe(200);release!();expect((await oldWrite).statusCode).toBe(409);
    const current=(await h.read()).json();expect(current.workspace).toEqual(original.workspace);expect(current.revision).toBe(2);
  });
});
