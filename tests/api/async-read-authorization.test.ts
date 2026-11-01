import {afterEach,describe,expect,it} from 'vitest';
import {DemoProfileOptionSchema,DemoSnapshotSchema,SafeLlmPacketSchema,SharingGrantSchema}
  from '@hufs-one/contracts';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {MemoryReviewerAccessStore,issueReviewerInvitation}
  from '../../apps/api/src/modules/auth/reviewer.js';
import {MemoryReviewerSandboxStore} from '../../apps/api/src/modules/auth/reviewer-sandbox.js';
import {GeneratedSyntheticReviewerRepository}
  from '../../apps/api/src/modules/auth/reviewer-generated-corpus.js';
import {createApi} from '../../apps/api/src/server.js';
import type {ApiRepository,VerifiedReviewerActor} from '../../apps/api/src/types.js';
import profiles from '../../packages/fixtures/synthetic/demo-profiles.json';
import snapshot from '../../packages/fixtures/synthetic/demo-snapshot.json';
import packet from '../../packages/fixtures/synthetic/safe-llm-packet.json';

const ORIGIN='https://example.invalid',BETA_NOW='2026-10-31T00:00:00.000Z';
const beta={actorId:'SYN-BETA-1',sessionIdHash:'H'.repeat(32),
  csrfToken:'C'.repeat(32),role:'BETA' as const,betaAllowed:true,
  schoolMailProofExpiresAt:'2026-11-10T00:00:00.000Z',
  sessionExpiresAt:'2026-11-10T00:00:00.000Z'};
const grant=SharingGrantSchema.parse({
  grantId:'G1',actorId:beta.actorId,demoSubjectId:'S01',version:'G1',
  expiresAt:beta.sessionExpiresAt,recordingAllowed:false,displayNameAllowed:false,
  allowedSections:['FEED','NOTICES','ACADEMICS','EXPERIENCE'],
});
const headers={origin:ORIGIN,'x-csrf-token':beta.csrfToken};
const apps:Array<ReturnType<typeof createApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(a=>a.close()));});

function betaApi(){
  let active=true,revokeOnProjection=false,revokeOnProfiles=false,revokeOnAi=false;
  const repository=new MemoryApiRepository({
    profiles:profiles.profiles.map(x=>DemoProfileOptionSchema.parse(x)),
    projections:[DemoSnapshotSchema.parse(snapshot)],grants:[grant],
    safePackets:[{actorId:beta.actorId,ref:'SYN-PACKET',
      packet:SafeLlmPacketSchema.parse(packet)}],
  });
  const port:ApiRepository={
    readGrant:(actorId,subject)=>repository.readGrant(actorId,subject),
    readSnapshot:subject=>repository.readSnapshot(subject),
    readSafePacket:(actorId,task,ref)=>repository.readSafePacket(actorId,task,ref),
    listProfiles:async()=>{
      const rows=await repository.listProfiles();
      if(revokeOnProfiles)active=false;
      return rows;
    },
    readAuthorizedSnapshot:async input=>{
      const result=await repository.readAuthorizedSnapshot(input);
      if(revokeOnProjection)active=false;
      return result;
    },
  };
  const app=createApi({repository:port,allowedOrigin:ORIGIN,now:()=>BETA_NOW,
    verifySession:async()=>active?beta:null,
    syntheticAiProvider:{analyze:async()=>{if(revokeOnAi)active=false;
      return {task:'opportunity_terms',reviewRequired:true,citations:[]};}}});
  apps.push(app);
  const create=()=>app.inject({method:'POST',url:'/api/demo/contexts',headers,
    payload:{demoSubjectId:'S01',demoRunId:'SYN-RUN'}});
  return {app,create,revoke:()=>{active=false;},
    onProjection:()=>{revokeOnProjection=true;},
    onProfiles:()=>{revokeOnProfiles=true;},
    onAi:()=>{revokeOnAi=true;}};
}

const judge:VerifiedReviewerActor={
  actorId:'SYN-JUDGE',role:'REVIEWER',sessionIdHash:'S'.repeat(32),
  csrfToken:'T'.repeat(32),sessionExpiresAt:'2026-12-11T00:00:00.000Z',
  identityProofExpiresAt:'2026-12-11T00:00:00.000Z',
  verifiedEmail:'judge@synthetic.invalid',
};
async function reviewerApi(){
  let active=true,disconnectOnRead=false,revokeInviteOnRead=false,revokeOnProfiles=false;
  let revokeOnSandbox=false;
  const source=new GeneratedSyntheticReviewerRepository(),access=new MemoryReviewerAccessStore();
  const invite=await issueReviewerInvitation(access,{
    startsAt:'2026-11-01T00:00:00.000Z',endsAt:'2026-12-09T00:00:00.000Z',
    maxAccounts:3,label:'Test-only invited judge',
  },{now:BETA_NOW});
  const sandbox=new MemoryReviewerSandboxStore();
  const app=createApi({repository:{
      listProfiles:async()=>{throw new Error('real data read denied');},
      readGrant:async()=>{throw new Error('real grant read denied');},
      readSnapshot:async()=>{throw new Error('real snapshot read denied');},
      readSafePacket:async()=>{throw new Error('real packet read denied');},
    },allowedOrigin:ORIGIN,now:()=> '2026-11-10T00:00:00.000Z',
    reviewerAccess:access,
    reviewerSandbox:{
      read:async request=>{
        const result=await sandbox.read(request);
        if(revokeOnSandbox)await access.revoke(invite.invitationId,'2026-11-10T00:00:00.000Z');
        return result;
      },
      save:async request=>{
        const result=await sandbox.save(request);
        if(revokeOnSandbox)await access.revoke(invite.invitationId,'2026-11-10T00:00:00.000Z');
        return result;
      },
    },
    verifySession:async()=>active?judge:null,
    reviewerDemo:{
      listProfiles:async()=>{
        const items=await source.listProfiles();
        if(revokeOnProfiles)active=false;
        return items;
      },
      readSnapshot:async id=>{
        const data=await source.readSnapshot(id);
        if(disconnectOnRead)active=false;
        if(revokeInviteOnRead)await access.revoke(invite.invitationId,'2026-11-10T00:00:00.000Z');
        return data;
      },
      readSafePacket:async()=>null,
    },
  });
  apps.push(app);
  const reviewerHeaders={origin:ORIGIN,'x-csrf-token':judge.csrfToken};
  expect((await app.inject({url:'/api/reviewer/invitations/redeem',method:'POST',
    headers:reviewerHeaders,payload:{enrollmentCode:invite.enrollmentCode}})).statusCode).toBe(200);
  const create=()=>app.inject({method:'POST',url:'/api/demo/contexts',headers:reviewerHeaders,
    payload:{demoSubjectId:'S01',demoRunId:'SYN-RUN'}});
  return {app,create,disconnect:()=>{disconnectOnRead=true;},
    revokeInvite:()=>{revokeInviteOnRead=true;},
    expireProfiles:()=>{revokeOnProfiles=true;},
    revokeDuringSandbox:()=>{revokeOnSandbox=true;},
    reviewerHeaders};
}
const refused=(code:number)=>expect([401,403,409]).toContain(code);
describe('never publish async authorized data after session, invite or grant changes',()=>{
  it('rejects an atomic BETA snapshot completed after logout',async()=>{
    const h=betaApi(),created=await h.create();
    expect(created.statusCode).toBe(201);
    h.onProjection();
    const response=await h.app.inject({url:'/api/demo/contexts/'+created.json().contextId+'/snapshot'});
    refused(response.statusCode);
    expect(response.json()).not.toHaveProperty('feed');
  });
  it('does not mint a BETA context after the checked grant/snapshot await loses its session',async()=>{
    const h=betaApi();h.onProjection();
    const res=await h.create();
    refused(res.statusCode);expect(res.json()).not.toHaveProperty('contextId');
  });
  it('does not return BETA profile labels after a long metadata read loses its session',async()=>{
    const h=betaApi();h.onProfiles();
    const res=await h.app.inject({url:'/api/demo/profiles'});
    refused(res.statusCode);expect(res.json()).not.toHaveProperty('profiles');
  });
  it('does not publish AI job receipts after a model finishes on a revoked session',async()=>{
    const h=betaApi();h.onAi();
    const response=await h.app.inject({url:'/api/ai/opportunity-terms',
      method:'POST',headers,payload:{packetRef:'SYN-PACKET',idempotencyKey:'SYN-RACE-001'}});
    refused(response.statusCode);expect(response.json()).not.toHaveProperty('jobId');
  });
  it('cannot return reviewer snapshot after its invite is revoked during source read',async()=>{
    const h=await reviewerApi();h.revokeInvite();
    const response=await h.app.inject({url:'/api/reviewer/demo/subjects/S01/snapshot'});
    refused(response.statusCode);expect(response.json()).not.toHaveProperty('feed');
  });
  it('cannot return reviewer snapshot after OAuth identity disappears during source read',async()=>{
    const h=await reviewerApi();h.disconnect();
    const response=await h.app.inject({url:'/api/reviewer/demo/subjects/S01/snapshot'});
    refused(response.statusCode);expect(response.json()).not.toHaveProperty('feed');
  });
  it('does not create a REVIEWER context from an expired invite',async()=>{
    const h=await reviewerApi();h.revokeInvite();
    const res=await h.create();
    refused(res.statusCode);expect(res.json()).not.toHaveProperty('contextId');
  });
  it('denies a reviewer sandbox read when its invite disappears during store I/O',async()=>{
    const h=await reviewerApi(),created=await h.create();
    expect(created.statusCode).toBe(201);
    h.revokeDuringSandbox();
    const res=await h.app.inject({url:'/api/reviewer/demo/contexts/'+created.json().contextId+'/actions'});
    refused(res.statusCode);expect(res.json()).not.toHaveProperty('actions');
  });
  it('denies a reviewer sandbox write receipt when the invite is revoked after store I/O',async()=>{
    const h=await reviewerApi(),created=await h.create();
    expect(created.statusCode).toBe(201);
    h.revokeDuringSandbox();
    const res=await h.app.inject({method:'POST',
      url:'/api/reviewer/demo/contexts/'+created.json().contextId+'/actions',
      headers:h.reviewerHeaders,payload:{kind:'SET_SEARCH',query:'synthetic'}});
    refused(res.statusCode);expect(res.json()).not.toHaveProperty('actions');
  });
  it('rejects late REVIEWER profile results after OAuth session changes',async()=>{
    const h=await reviewerApi();h.expireProfiles();
    const res=await h.app.inject({url:'/api/reviewer/demo/profiles'});
    refused(res.statusCode);expect(res.json()).not.toHaveProperty('profiles');
  });
});
