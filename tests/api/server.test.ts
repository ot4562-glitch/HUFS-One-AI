import {afterEach,describe,expect,it} from 'vitest';
import {DemoProfileOptionSchema,DemoSnapshotSchema,SharingGrantSchema} from '@hufs-one/contracts';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {createApi} from '../../apps/api/src/server.js';
import profiles from '../../packages/fixtures/synthetic/demo-profiles.json';
import snapshot from '../../packages/fixtures/synthetic/demo-snapshot.json';

const now='2026-10-31T00:00:00.000Z';
const origin='https://example.test';
const actor={
  actorId:'SYN-ACTOR-01',sessionIdHash:'H'.repeat(30),
  sessionExpiresAt:'2026-11-05T00:00:00.000Z',
  schoolMailProofExpiresAt:'2026-11-03T00:00:00.000Z',
  role:'BETA' as const,betaAllowed:true,csrfToken:'C'.repeat(32),
};
const grant=SharingGrantSchema.parse({
  grantId:'G1',actorId:actor.actorId,demoSubjectId:'S01',
  allowedSections:['FEED','NOTICES'],displayNameAllowed:true,recordingAllowed:false,
  version:'G1',expiresAt:'2026-11-05T00:00:00.000Z',
});
const postHeaders={cookie:'a',origin,'x-csrf-token':actor.csrfToken};
const getHeaders={cookie:'a'};
function fixture() {
  const repo=new MemoryApiRepository({
    profiles:profiles.profiles.map(p=>DemoProfileOptionSchema.parse(p)),
    grants:[grant],
    projections:[DemoSnapshotSchema.parse(snapshot)],
  });
  const sessions:{[key:string]:typeof actor}={a:actor};
  const app=createApi({repository:repo,allowedOrigin:origin,
    now:()=>now,verifySession:async(req)=>sessions[req.headers.cookie??'']??null});
  return {repo,app,sessions};
}
const opened:Array<ReturnType<typeof createApi>>=[];
afterEach(async()=>{await Promise.all(opened.map(a=>a.close()));opened.length=0;});

describe('API initial fail-closed boundary',()=>{
  it('denies requests without a verified session even when spoofed',async()=>{
    const {repo}=fixture();
    const app=createApi({repository:repo,allowedOrigin:origin,now:()=>now});
    opened.push(app);
    for(const url of ['/api/health','/api/auth/session','/api/demo/profiles']){
      const res=await app.inject({url,headers:{cookie:'a','x-user-id':'SYN-ACTOR-01'}});
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe('UNAUTHENTICATED');
      expect(res.headers['cache-control']).toBe('no-store');
    }
  });
  it('rejects stale school proof and non-invited principals',async()=>{
    for(const principal of [
      {...actor,betaAllowed:false},
      {...actor,schoolMailProofExpiresAt:'2026-01-01T00:00:00.000Z'},
    ]){
      const {repo}=fixture();
      const app=createApi({repository:repo,allowedOrigin:origin,
        now:()=>now,verifySession:async()=>principal});
      opened.push(app);
      expect((await app.inject({url:'/api/auth/session'})).statusCode).toBe(403);
    }
  });
  it('lists five profiles but never exposes absent grants or names',async()=>{
    const {app}=fixture();opened.push(app);
    const res=await app.inject({url:'/api/demo/profiles',headers:getHeaders});
    expect(res.statusCode).toBe(200);
    const list=res.json().profiles;
    expect(list).toHaveLength(5);
    expect(list[0].allowedSections).toEqual(['FEED','NOTICES']);
    expect(list[1].allowedSections).toEqual([]);
    expect(list[1].readiness).toBe('PENDING');
    expect(list[1].displayLabel).toBe('시연 대상 2');
  });
  it('rejects missing origin, missing CSRF, cross-origin and invalid bodies',async()=>{
    const {app}=fixture();opened.push(app);
    const base={method:'POST' as const,url:'/api/demo/contexts',
      payload:{demoSubjectId:'S01',demoRunId:'RUN1'}};
    for(const headers of [{cookie:'a'}, {cookie:'a',origin}, {...postHeaders,origin:'https://untrusted.test'}]){
      expect((await app.inject({...base,headers})).statusCode).toBe(403);
    }
    const invalid=await app.inject({...base,headers:postHeaders,
      payload:{...base.payload,actorId:'SYN-ACTOR-02'}});
    expect(invalid.statusCode).toBe(422);
  });
  it('issues an actor/session-bound context and returns an atomic redacted snapshot',async()=>{
    const {app}=fixture();opened.push(app);
    const created=await app.inject({method:'POST',url:'/api/demo/contexts',headers:postHeaders,
      payload:{demoSubjectId:'S01',demoRunId:'RUN1'}});
    expect(created.statusCode).toBe(201);
    const id=created.json().contextId;
    const res=await app.inject({url:'/api/demo/contexts/'+id+'/snapshot',headers:getHeaders});
    expect(res.statusCode).toBe(200);
    const projection=DemoSnapshotSchema.parse(res.json());
    expect(projection.contextId).toBe(id);
    expect(projection.academics).toEqual({state:'NOT_SHARED'});
    expect(projection.forecast).toEqual({state:'NOT_SHARED'});
    const other=await app.inject({url:'/api/demo/contexts/'+id+'/snapshot',headers:{cookie:'b'}});
    expect(other.statusCode).toBe(401);
  });
  it('revokes contexts on consent changes and blocks direct academic access',async()=>{
    const {app,repo}=fixture();opened.push(app);
    const created=await app.inject({method:'POST',url:'/api/demo/contexts',headers:postHeaders,
      payload:{demoSubjectId:'S01',demoRunId:'RUN1'}});
    const id=created.json().contextId;
    const academics=await app.inject({url:'/api/demo/contexts/'+id+'/graduation',headers:getHeaders});
    expect(academics.statusCode).toBe(403);
    repo.setGrant({...grant,version:'G2'});
    expect((await app.inject({url:'/api/demo/contexts/'+id+'/snapshot',headers:getHeaders})).statusCode).toBe(409);
    repo.revokeGrant(actor.actorId,'S01',now);
    const rejected=await app.inject({url:'/api/demo/contexts/'+id+'/snapshot',headers:getHeaders});
    expect(rejected.statusCode).toBe(403);
    expect(rejected.json().code).toBe('SHARING_REVOKED');
  });
  it('does not falsely report logout when no session invalidator is connected',async()=>{
    const {app}=fixture();opened.push(app);
    const res=await app.inject({method:'POST',url:'/api/auth/logout',headers:postHeaders,payload:{}});
    expect(res.statusCode).toBe(503);
  });
});
