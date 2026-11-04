import {afterEach,describe,expect,it} from 'vitest';
import {DemoProfileOptionSchema,DemoSnapshotSchema,SharingGrantSchema} from '@hufs-one/contracts';
import {createApi} from '../../apps/api/src/server.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {MemoryReviewerAccessStore,issueReviewerInvitation} from '../../apps/api/src/modules/auth/reviewer.js';
import type {VerifiedActor} from '../../apps/api/src/types.js';
import profiles from '../../packages/fixtures/synthetic/demo-profiles.json';
import snapshot from '../../packages/fixtures/synthetic/demo-snapshot.json';

const ORIGIN='https://context-allocation.example.test';
const BEGIN='2026-11-10T00:00:00.000Z',END='2026-12-01T00:00:00.000Z';
const apps:Array<ReturnType<typeof createApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(app=>app.close()));});

async function fixture(role:'BETA'|'REVIEWER',actorCount=2){
  let now=BEGIN;
  const sessions=new Map<string,VerifiedActor>();
  for(let owner=0;owner<actorCount;owner++)for(let session=0;session<3;session++){
    const key=`owner-${owner}-session-${session}`;
    const base={actorId:`SYN-OWNER-${owner}`,sessionIdHash:key.padEnd(32,'S'),
      csrfToken:'C'.repeat(32),sessionExpiresAt:END};
    sessions.set(key,role==='BETA'?{...base,role,betaAllowed:true,schoolMailProofExpiresAt:END}
      :{...base,role,verifiedEmail:`owner-${owner}@example.test`,identityProofExpiresAt:END});
  }
  const repository=new MemoryApiRepository({profiles:profiles.profiles.map(p=>DemoProfileOptionSchema.parse(p)),
    projections:[DemoSnapshotSchema.parse(snapshot)],safePackets:[],
    grants:Array.from({length:actorCount},(_,owner)=>SharingGrantSchema.parse({grantId:`SYN-GRANT-${owner}`,
      actorId:`SYN-OWNER-${owner}`,demoSubjectId:'S01',version:'G1',expiresAt:END,
      recordingAllowed:false,displayNameAllowed:false,allowedSections:['FEED','NOTICES','ACADEMICS','EXPERIENCE']}))});
  const access=new MemoryReviewerAccessStore();
  let inviteId:string|undefined,denied=false;
  const originalGrant=repository.readGrant.bind(repository);
  repository.readGrant=async(...args)=>denied?null:originalGrant(...args);
  let blockRead=false,entered!:()=>void,finish!:()=>void;
  const readStarted=new Promise<void>(resolve=>{entered=resolve;});
  const readBarrier=new Promise<void>(resolve=>{finish=resolve;});
  const originalRead=repository.readAuthorizedSnapshot.bind(repository);
  repository.readAuthorizedSnapshot=async input=>{
    const result=await originalRead(input);
    if(blockRead){entered();await readBarrier;}
    return result;
  };
  const app=createApi({repository,allowedOrigin:ORIGIN,now:()=>now,
    verifySession:async req=>sessions.get(String(req.headers['x-synthetic-session']))??null,
    revokeSession:async()=>{},reviewerAccess:access,reviewerDemo:{
      listProfiles:async()=>profiles.profiles.map(p=>({...DemoProfileOptionSchema.parse(p),readiness:'READY' as const,dataMode:'SYNTHETIC' as const})),
      readSnapshot:async()=>{if(blockRead){entered();await readBarrier;}return DemoSnapshotSchema.parse(snapshot);},
      readSafePacket:async()=>null}});
  apps.push(app);
  const headers=(owner=0,session=0)=>({origin:ORIGIN,'x-csrf-token':'C'.repeat(32),
    'x-synthetic-session':`owner-${owner}-session-${session}`});
  if(role==='REVIEWER'){
    const invite=await issueReviewerInvitation(access,{startsAt:BEGIN,endsAt:END,maxAccounts:actorCount,
      label:'Synthetic allocation'},{now:'2026-11-01T00:00:00.000Z'});
    inviteId=invite.invitationId;
    for(let owner=0;owner<actorCount;owner++)expect((await app.inject({method:'POST',
      url:'/api/reviewer/invitations/redeem',headers:headers(owner),payload:{enrollmentCode:invite.enrollmentCode}})).statusCode).toBe(200);
  }
  return {app,headers,advance:()=>{now='2026-11-10T00:05:00.000Z';},
    revoke:async()=>{denied=true;if(inviteId)await access.revoke(inviteId,now);},
    create:(owner=0,session=0)=>app.inject({method:'POST',url:'/api/demo/contexts',headers:headers(owner,session),
      payload:{demoSubjectId:'S01',demoRunId:'SYN-RUN'}}),
    release:(id:string,owner=0,session=0)=>app.inject({method:'DELETE',url:'/api/demo/contexts/'+id,headers:headers(owner,session)}),
    pause:()=>{blockRead=true;return {started:readStarted,finish};}};
}

describe('fair process-local context allocation and owner release',()=>{
  it.each(['BETA','REVIEWER'] as const)('%s preserves another actor capacity and limits all sessions of one actor',async role=>{
    const f=await fixture(role);
    for(let session=0;session<2;session++){
      const responses=await Promise.all(Array.from({length:15},()=>f.create(0,session)));
      expect(responses.filter(r=>r.statusCode===201)).toHaveLength(10);
      expect(responses.filter(r=>r.statusCode===429)).toHaveLength(5);
      for(const r of responses.filter(r=>r.statusCode===429)){
        expect(r.headers['retry-after']).toBe('300');
        expect(r.json()).not.toHaveProperty('actorId');
      }
    }
    expect((await f.create(0,2)).statusCode).toBe(429);
    expect((await f.create(1)).statusCode).toBe(201);
    f.advance();
    expect((await f.create()).statusCode).toBe(201);
  });

  it('retains the global 200 bound across 11 actors and simultaneous authorization',async()=>{
    const f=await fixture('BETA',11);
    const responses=await Promise.all(Array.from({length:220},(_,i)=>f.create(Math.floor(i/20),Math.floor(i%20/10))));
    expect(responses.filter(r=>r.statusCode===201)).toHaveLength(200);
    expect(responses.filter(r=>r.statusCode===429)).toHaveLength(20);
  });

  it.each(['BETA','REVIEWER'] as const)('%s releases only its session and repeats without an existence oracle',async role=>{
    const f=await fixture(role),first=await f.create(),id=first.json().contextId;
    expect((await f.release(id,1)).statusCode).toBe(204);
    expect((await f.release(id,0,1)).statusCode).toBe(204);
    expect((await f.app.inject({url:`/api/demo/contexts/${id}/snapshot`,headers:f.headers()})).statusCode).toBe(200);
    expect((await f.app.inject({method:'DELETE',url:'/api/demo/contexts/'+id,
      headers:{...f.headers(),'x-csrf-token':'wrong'}})).statusCode).toBe(403);
    expect((await f.release(id)).statusCode).toBe(204);
    expect((await f.release(id)).statusCode).toBe(204);
    expect((await f.release('unknown-context')).statusCode).toBe(204);
    expect((await f.app.inject({url:`/api/demo/contexts/${id}/snapshot`,headers:f.headers()})).statusCode).toBe(403);
    const responses=await Promise.all(Array.from({length:10},()=>f.create()));
    expect(responses.every(r=>r.statusCode===201)).toBe(true);
    expect((await f.create()).statusCode).toBe(429);
  });

  it.each(['BETA','REVIEWER'] as const)('%s discards a snapshot released while its repository read is pending',async role=>{
    const f=await fixture(role),id=(await f.create()).json().contextId;
    const barrier=f.pause();
    const pending=f.app.inject({url:`/api/demo/contexts/${id}/snapshot`,headers:f.headers()}).then(r=>r);
    await barrier.started;
    try {expect((await f.release(id)).statusCode).toBe(204);}
    finally {barrier.finish();}
    const result=await pending;
    expect(result.statusCode).toBe(403);
    expect(result.json()).not.toHaveProperty('feed');
  });

  it('logout releases its sessions capacity and leaves a second session active',async()=>{
    const f=await fixture('BETA');
    for(let i=0;i<10;i++)expect((await f.create()).statusCode).toBe(201);
    const other=(await f.create(0,1)).json().contextId;
    expect((await f.app.inject({method:'POST',url:'/api/auth/logout',headers:f.headers()})).statusCode).toBe(204);
    for(let i=0;i<10;i++)expect((await f.create(0,2)).statusCode).toBe(201);
    expect((await f.app.inject({url:`/api/demo/contexts/${other}/snapshot`,headers:f.headers(0,1)})).statusCode).toBe(200);
  });

  it.each(['BETA','REVIEWER'] as const)('%s permits authenticated cleanup after sharing or invite revocation',async role=>{
    const f=await fixture(role),id=(await f.create()).json().contextId;
    await f.revoke();
    expect((await f.app.inject({url:`/api/demo/contexts/${id}/snapshot`,headers:f.headers()})).statusCode).toBe(403);
    expect((await f.release(id)).statusCode).toBe(204);
    expect((await f.release(id)).statusCode).toBe(204);
  });

  it.each([{perActor:0,perSession:1},{perActor:201,perSession:1},{perActor:2,perSession:3},
    {perActor:2,perSession:0},{perActor:2.5,perSession:1},{perActor:20,perSession:NaN}])(
    'rejects invalid trusted limits %j before constructing the server',contextLimits=>{
      const repository=new MemoryApiRepository({profiles:[],projections:[],grants:[],safePackets:[]});
      expect(()=>createApi({repository,allowedOrigin:ORIGIN,contextLimits})).toThrow();
    });
});
