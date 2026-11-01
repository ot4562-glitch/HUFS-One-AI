import {afterEach,describe,expect,it} from 'vitest';
import {DemoProfileOptionSchema,SharingGrantSchema} from '@hufs-one/contracts';
import {createApi} from '../../apps/api/src/server.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {MemoryReviewerAccessStore,issueReviewerInvitation} from
  '../../apps/api/src/modules/auth/reviewer.js';
import type {ReviewerAccessStore} from '../../apps/api/src/modules/auth/reviewer.js';
import type {ApiRepository,VerifiedReviewerActor} from '../../apps/api/src/types.js';
import profiles from '../../packages/fixtures/synthetic/demo-profiles.json';

const NOW='2026-11-10T00:00:00.000Z';
const ENDS='2026-11-20T00:00:00.000Z';
const ORIGIN='https://example.invalid';
const reviewer:VerifiedReviewerActor={
  actorId:'SYN-REVIEWER-A01',role:'REVIEWER',verifiedEmail:'judge@synthetic.invalid',
  sessionIdHash:'S'.repeat(32),csrfToken:'C'.repeat(32),
  sessionExpiresAt:'2026-12-20T00:00:00.000Z',
  identityProofExpiresAt:'2026-12-20T00:00:00.000Z',
};
const beta={
  actorId:'SYN-BETA-A01',role:'BETA' as const,sessionIdHash:'H'.repeat(32),
  csrfToken:'B'.repeat(32),betaAllowed:true,
  sessionExpiresAt:'2026-12-20T00:00:00.000Z',
  schoolMailProofExpiresAt:'2026-12-20T00:00:00.000Z',
};
const closedRepository:ApiRepository={
  listProfiles:async()=>[],readGrant:async()=>null,
  readSnapshot:async()=>null,readSafePacket:async()=>null,
};
const apps:Array<ReturnType<typeof createApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(app=>app.close()));});

function deferred(){
  let resolve!:()=>void;
  const promise=new Promise<void>(done=>{resolve=done;});
  return {promise,resolve};
}
async function redeemRace(mode:
  'logout'|'replaced-session'|'changed-sub'|'changed-email'|
  'revoked-invite'|'expired-invite'|'recheck-session-revoked'){
  let current:VerifiedReviewerActor|null=reviewer;
  let now=NOW;
  const store=new MemoryReviewerAccessStore();
  const invite=await issueReviewerInvitation(store,{
    startsAt:'2026-11-01T00:00:00.000Z',endsAt:ENDS,
    label:'Synthetic reviewer access',maxAccounts:20,
  },{now:'2026-10-31T00:00:00.000Z'});
  const committed=deferred(),release=deferred();
  let didRevokeDuringRecheck=false;
  const port:ReviewerAccessStore={
    saveIssued:record=>store.saveIssued(record),
    revoke:(id,at)=>store.revoke(id,at),
    redeem:async input=>{
      const result=await store.redeem(input);
      committed.resolve(); // The underlying enrollment has already committed.
      await release.promise;
      return result;
    },
    readActive:async input=>{
      const result=await store.readActive(input);
      if(mode==='recheck-session-revoked'&&!didRevokeDuringRecheck){
        didRevokeDuringRecheck=true;
        current=null; // session changes during a second asynchronous authorization check
      }
      return result;
    },
  };
  const app=createApi({
    allowedOrigin:ORIGIN,now:()=>now,repository:closedRepository,
    verifySession:async()=>current,
    revokeSession:async()=>{current=null;},
    reviewerAccess:port,
  });
  apps.push(app);
  const headers={origin:ORIGIN,'x-csrf-token':reviewer.csrfToken};
  const pending=app.inject({method:'POST',url:'/api/reviewer/invitations/redeem',
    headers,payload:{enrollmentCode:invite.enrollmentCode}});
  await committed.promise;
  // A durable enrollment can exist while its HTTP response must be denied.
  expect((await store.readActive({actorId:reviewer.actorId,
    verifiedEmail:reviewer.verifiedEmail,now:NOW}))?.inviteId).toBe(invite.invitationId);
  if(mode==='logout'){
    current=null; // same persistent invalidation performed by the logout port
  }else if(mode==='replaced-session'){
    current={...reviewer,sessionIdHash:'N'.repeat(32)};
  }else if(mode==='changed-sub'){
    current={...reviewer,actorId:'SYN-DIFFERENT-SUB'};
  }else if(mode==='changed-email'){
    current={...reviewer,verifiedEmail:'other@synthetic.invalid'};
  }else if(mode==='revoked-invite'){
    expect(await store.revoke(invite.invitationId,NOW)).toBe(true);
  }else if(mode==='expired-invite'){
    now=ENDS;
  }
  release.resolve();
  const response=await pending;
  expect([401,403,409]).toContain(response.statusCode);
  expect(response.json()).not.toHaveProperty('accessEndsAt');
  expect(response.json()).not.toHaveProperty('role');
  expect(response.headers['cache-control']).toBe('no-store');
}

describe('A01 reviewer redeem is not an authorization receipt until post-commit revalidation',()=>{
  for(const mode of ['logout','replaced-session','changed-sub','changed-email',
    'revoked-invite','expired-invite','recheck-session-revoked'] as const){
    it('does not return success after '+mode,async()=>{await redeemRace(mode);});
  }
  it('returns success for the unchanged active session and invite',async()=>{
    const store=new MemoryReviewerAccessStore();
    const invite=await issueReviewerInvitation(store,{
      startsAt:'2026-11-01T00:00:00.000Z',endsAt:ENDS,
      label:'Synthetic reviewers',maxAccounts:20,
    },{now:'2026-10-31T00:00:00.000Z'});
    let live=true;
    const app=createApi({
      allowedOrigin:ORIGIN,now:()=>NOW,repository:closedRepository,
      reviewerAccess:store,verifySession:async()=>live?reviewer:null,
      revokeSession:async()=>{live=false;},
    });
    apps.push(app);
    const response=await app.inject({method:'POST',
      url:'/api/reviewer/invitations/redeem',
      headers:{origin:ORIGIN,'x-csrf-token':reviewer.csrfToken},
      payload:{enrollmentCode:invite.enrollmentCode}});
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({role:'REVIEWER',accessEndsAt:ENDS,
      dataMode:'SYNTHETIC',sandboxOnly:true});
    const logout=await app.inject({method:'POST',url:'/api/auth/logout',
      headers:{origin:ORIGIN,'x-csrf-token':reviewer.csrfToken},payload:{}});
    expect(logout.statusCode).toBe(204);
    expect((await app.inject({url:'/api/auth/session'})).statusCode).toBe(401);
  });
});

describe('A01 BETA profile list post-authorization grant races',()=>{
  for(const change of ['revoke','change-without-version-bump'] as const){
    it('does not leak a previously allowed display label or readiness after '+change,async()=>{
      const grant=SharingGrantSchema.parse({
        grantId:'SYN-GRANT-A01',actorId:beta.actorId,demoSubjectId:'S01',
        version:'G1',expiresAt:beta.sessionExpiresAt,
        recordingAllowed:false,displayNameAllowed:true,
        allowedSections:['FEED','NOTICES'],
      });
      const repo=new MemoryApiRepository({
        profiles:profiles.profiles.map(profile=>DemoProfileOptionSchema.parse(profile)),
        grants:[grant],projections:[],
      });
      let grantReads=0;
      const port:ApiRepository={
        listProfiles:()=>repo.listProfiles(),
        readGrant:async(actorId,subject)=>{
          grantReads++;
          if(grantReads===2){
            if(change==='revoke')repo.revokeGrant(beta.actorId,'S01',NOW);
            else repo.setGrant({...grant,displayNameAllowed:false,
              allowedSections:[]}); // same version: fail even with a broken CAS adapter
          }
          return repo.readGrant(actorId,subject);
        },
        readSnapshot:subject=>repo.readSnapshot(subject),
        readSafePacket:(actorId,task,ref)=>repo.readSafePacket(actorId,task,ref),
      };
      const app=createApi({allowedOrigin:ORIGIN,now:()=>NOW,repository:port,
        verifySession:async()=>beta});
      apps.push(app);
      const response=await app.inject({url:'/api/demo/profiles'});
      expect(response.statusCode).toBe(403);
      expect(response.json()).not.toHaveProperty('profiles');
      expect(response.json()).not.toHaveProperty('displayLabel');
      expect(grantReads).toBeGreaterThan(5);
    });
  }
});
