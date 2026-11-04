import {afterEach,describe,expect,it} from 'vitest';
import {DemoProfileOptionSchema,DemoSnapshotSchema,SharingGrantSchema} from '@hufs-one/contracts';
import {createApi} from '../../apps/api/src/server.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {MemoryReviewerAccessStore,issueReviewerInvitation} from '../../apps/api/src/modules/auth/reviewer.js';
import type {VerifiedActor} from '../../apps/api/src/types.js';
import profiles from '../../packages/fixtures/synthetic/demo-profiles.json';
import snapshot from '../../packages/fixtures/synthetic/demo-snapshot.json';

const ORIGIN='https://context-capacity.example.test';
const BEGIN='2026-11-10T00:00:00.000Z',END='2026-12-01T00:00:00.000Z';
const apps:Array<ReturnType<typeof createApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(app=>app.close()));});
async function fixture(role:'BETA'|'REVIEWER',concurrent=false){
  let now=BEGIN;
  const common={actorId:'SYN-CAPACITY',sessionIdHash:'S'.repeat(32),csrfToken:'C'.repeat(32),sessionExpiresAt:END};
  const actor:VerifiedActor=role==='BETA'?{...common,role,betaAllowed:true,schoolMailProofExpiresAt:END}
    :{...common,role,verifiedEmail:'judge@example.test',identityProofExpiresAt:END};
  const parsedProfiles=profiles.profiles.map(p=>DemoProfileOptionSchema.parse(p));
  const parsedSnapshot=DemoSnapshotSchema.parse(snapshot);
  const repository=new MemoryApiRepository({profiles:parsedProfiles,projections:[parsedSnapshot],safePackets:[],
    grants:[SharingGrantSchema.parse({grantId:'SYN-CAPACITY-GRANT',actorId:actor.actorId,
      demoSubjectId:'S01',version:'G1',expiresAt:END,recordingAllowed:false,displayNameAllowed:false,
      allowedSections:['FEED','NOTICES','ACADEMICS','EXPERIENCE']})]});
  const access=new MemoryReviewerAccessStore();
  // Pause every request after its original capacity check, at the real
  // asynchronous session-verifier boundary. No timers or network are needed.
  const verifications=new WeakMap<object,number>();let waiting=0,release!:()=>void;
  const barrier=new Promise<void>(resolve=>{release=resolve;});
  const app=createApi({repository,allowedOrigin:ORIGIN,now:()=>now,verifySession:async request=>{
    if(concurrent&&request.method==='POST'&&request.url==='/api/demo/contexts'){
      const count=(verifications.get(request)??0)+1;verifications.set(request,count);
      if(count===2){if(++waiting===205)release();await barrier;}
    }
    return actor;
  },
    reviewerAccess:access,reviewerDemo:{
      listProfiles:async()=>parsedProfiles.map(p=>({...p,readiness:'READY' as const,dataMode:'SYNTHETIC' as const})),
      readSnapshot:async()=>parsedSnapshot,readSafePacket:async()=>null,
    }});
  apps.push(app);
  const headers={origin:ORIGIN,'x-csrf-token':actor.csrfToken};
  if(role==='REVIEWER'){
    const invite=await issueReviewerInvitation(access,{startsAt:BEGIN,endsAt:END,maxAccounts:1,label:'Synthetic capacity'},
      {now:'2026-11-01T00:00:00.000Z'});
    expect((await app.inject({method:'POST',url:'/api/reviewer/invitations/redeem',headers,
      payload:{enrollmentCode:invite.enrollmentCode}})).statusCode).toBe(200);
  }
  return {app,advance:()=>{now='2026-11-10T00:05:00.000Z';},
    create:()=>app.inject({method:'POST',url:'/api/demo/contexts',headers,
      payload:{demoSubjectId:'S01',demoRunId:'SYN-CAPACITY-RUN'}})};
}

describe('bounded context publication after asynchronous authorization',()=>{
  it.each(['BETA','REVIEWER'] as const)('%s reclaims expired contexts without another role or a restart',async role=>{
    const f=await fixture(role);let first='';
    for(let i=0;i<200;i++){
      const result=await f.create();expect(result.statusCode).toBe(201);
      if(i===0)first=result.json().contextId;
    }
    expect((await f.create()).statusCode).toBe(429);
    f.advance();
    expect((await f.create()).statusCode).toBe(201);
    expect((await f.app.inject({url:'/api/demo/contexts/'+first+'/snapshot'})).statusCode).toBe(403);
  });
  it.each(['BETA','REVIEWER'] as const)('%s never exceeds the cap during concurrent authorization awaits',async role=>{
    const f=await fixture(role,true);
    const responses=await Promise.all(Array.from({length:205},()=>f.create()));
    expect(responses.filter(r=>r.statusCode===201)).toHaveLength(200);
    expect(responses.filter(r=>r.statusCode===429)).toHaveLength(5);
    expect(new Set(responses.filter(r=>r.statusCode===201).map(r=>r.json().contextId)).size).toBe(200);
  });
});
