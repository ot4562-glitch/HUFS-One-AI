import {afterEach,describe,expect,it} from 'vitest';
import {DemoProfileOptionSchema,DemoSnapshotSchema} from '@hufs-one/contracts';
import {MemoryReviewerAccessStore,issueReviewerInvitation} from '../../apps/api/src/modules/auth/reviewer.js';
import {createApi} from '../../apps/api/src/server.js';
import type {VerifiedReviewerActor} from '../../apps/api/src/types.js';
import profiles from '../../packages/fixtures/synthetic/demo-profiles.json';
import snapshot from '../../packages/fixtures/synthetic/demo-snapshot.json';

const ORIGIN='https://example.test';
const BEGIN='2026-12-05T00:00:00.000Z';
const END='2026-12-12T00:00:00.000Z';
let current='2026-12-06T00:00:00.000Z';
const identity:VerifiedReviewerActor={
  actorId:'OIDC-TEST-REVIEWER-01',role:'REVIEWER',
  verifiedEmail:'evaluator@example.edu',identityProofExpiresAt:'2026-12-31T00:00:00.000Z',
  sessionExpiresAt:'2026-12-14T00:00:00.000Z',sessionIdHash:'S'.repeat(30),
  csrfToken:'C'.repeat(30),
};
const headers={cookie:'reviewer-session',origin:ORIGIN,'x-csrf-token':identity.csrfToken};
const codes:Record<string,string>={};
const toGrantSpec=()=>({
  recipientEmail:'evaluator@example.edu',startsAt:BEGIN,endsAt:END,label:'HUFS Review Period',
});
const apps:Array<ReturnType<typeof createApi>>=[];
afterEach(async()=>{await Promise.all(apps.map(v=>v.close()));apps.length=0;current='2026-12-06T00:00:00.000Z'});
async function harness(options:{
  identity?:VerifiedReviewerActor|null,
  alternate?:VerifiedReviewerActor,
  badDemoMode?:boolean,
  secondInvite?:boolean
}={}){
  const access=new MemoryReviewerAccessStore();
  const invitation=await issueReviewerInvitation(access,toGrantSpec(),{now:'2026-11-30T00:00:00.000Z'});
  const actor=options.identity===undefined?identity:options.identity;
  const synthetic=DemoSnapshotSchema.parse({...snapshot,contextId:'REPLAY-S01',datasetMode:'SYNTHETIC'});
  const demo={
    listProfiles:async()=>profiles.profiles.map((p,i)=>DemoProfileOptionSchema.parse({
      ...p,dataMode: options.badDemoMode&&i===0?'MIXED':'SYNTHETIC',
    })),
    readSnapshot:async(id:string)=>id==='S01'?structuredClone(synthetic):null,
  };
  const verifier=async(req:import('fastify').FastifyRequest)=>
    req.headers.cookie==='reviewer-session'?actor:
    req.headers.cookie==='reviewer-other'?options.alternate??{...identity,actorId:'OIDC-OTHER',sessionIdHash:'X'.repeat(30)}:
    null;
  const app=createApi({
    repository:{
      listProfiles:async()=>[],readGrant:async()=>null,readSnapshot:async()=>null,
      readSafePacket:async()=>null,
    },
    reviewerAccess:access,reviewerDemo:demo,verifySession:verifier,
    now:()=>current,allowedOrigin:ORIGIN,
  });
  apps.push(app);
  return {app,access,code:invitation.enrollmentCode,invitation};
}
const enroll=(app:ReturnType<typeof createApi>,code:string,meta:Record<string,string>=headers)=>
  app.inject({method:'POST',url:'/api/reviewer/invitations/redeem',headers:meta,
    payload:{enrollmentCode:code}});
const get=(app:ReturnType<typeof createApi>,url='/api/reviewer/demo/profiles',cookie='reviewer-session')=>
  app.inject({method:'GET',url,headers:{cookie}});

describe('REVIEWER invitation & period-bound read-only route',()=>{
 it('denies review pages before account-bound enrollment, including session route',async()=>{
   const {app}=await harness();
   expect((await get(app)).statusCode).toBe(403);
   expect((await get(app,'/api/auth/session')).statusCode).toBe(403);
   expect((await get(app,'/api/demo/profiles')).statusCode).toBe(403);
 });
 it('enrolls with valid verified identity, then allows repeated visits without a visit quota',async()=>{
   const {app,code}=await harness();
   const result=await enroll(app,code);
   expect(result.statusCode).toBe(200);
   expect(result.json()).toMatchObject({role:'REVIEWER',readOnly:true,dataMode:'SYNTHETIC',accessEndsAt:END});
   expect(JSON.stringify(result.json())).not.toContain(code);
   for(let i=0;i<70;i++){
     const response=await get(app);
     expect(response.statusCode).toBe(200);
     expect(response.json().profiles).toHaveLength(5);
   }
   expect((await enroll(app,code)).statusCode).toBe(200); // same actor reuses attachment safely
 });
 it('authorizes a second browser session for same verified principal, not another identity',async()=>{
   const otherSession={...identity,sessionIdHash:'DIFFERENT-SESSION-HASH-02'};
   const {app,code}=await harness({alternate:otherSession});
   expect((await enroll(app,code)).statusCode).toBe(200);
   expect((await get(app,'/api/reviewer/demo/profiles','reviewer-other')).statusCode).toBe(200);
 });
 it('rejects an invitation forwarded to another verified email or Google subject',async()=>{
   const forwarded={...identity,verifiedEmail:'someone-else@example.edu'};
   const {app,code}=await harness({alternate:forwarded});
   const wrong=await enroll(app,code,{...headers,cookie:'reviewer-other'});
   expect(wrong.statusCode).toBe(403);
   expect((await enroll(app,code)).statusCode).toBe(200);
   const otherSub={...identity,actorId:'OIDC-OTHER'};
   // Store-level test separately tests a second Google account with matching email.
   const again=await get(app,'/api/reviewer/demo/profiles','reviewer-other');
   expect(again.statusCode).toBe(403);
 });
 it('requires Origin + CSRF for enrollment and blocks a leaked URL without authenticated session',async()=>{
   const {app,code}=await harness();
   expect((await enroll(app,code,{cookie:'reviewer-session'})).statusCode).toBe(403);
   expect((await enroll(app,code,{...headers,origin:'https://wrong.test'})).statusCode).toBe(403);
   expect((await enroll(app,code,{...headers,cookie:'none'})).statusCode).toBe(401);
   expect((await enroll(app,code)).statusCode).toBe(200);
 });
 it('ends automatically exactly at the end instant even with the same session cookie',async()=>{
   const {app,code}=await harness();
   expect((await enroll(app,code)).statusCode).toBe(200);
   current='2026-12-11T23:59:59.000Z';
   expect((await get(app)).statusCode).toBe(200);
   current=END; // exclusive end
   expect((await get(app)).statusCode).toBe(403);
   expect((await get(app,'/api/auth/session')).statusCode).toBe(403);
   expect((await enroll(app,code)).statusCode).toBe(403);
 });
 it('does not activate the invitation before startsAt',async()=>{
   const {app,code}=await harness();
   current='2026-12-04T23:59:59.000Z';
   expect((await enroll(app,code)).statusCode).toBe(403);
   current=BEGIN;
   expect((await enroll(app,code)).statusCode).toBe(200);
 });
 it('revocation immediately invalidates existing sessions and subsequent logins',async()=>{
   const {app,code,access,invitation}=await harness();
   expect((await enroll(app,code)).statusCode).toBe(200);
   expect((await get(app)).statusCode).toBe(200);
   await access.revoke(invitation.invitationId,current);
   expect((await get(app)).statusCode).toBe(403);
   expect((await enroll(app,code)).statusCode).toBe(403);
 });
 it('enforces a synthetic-only projection with no team/real data route',async()=>{
   const {app,code}=await harness();
   expect((await enroll(app,code)).statusCode).toBe(200);
   const view=await get(app,'/api/reviewer/demo/subjects/S01/snapshot');
   expect(view.statusCode).toBe(200);
   expect(view.json().datasetMode).toBe('SYNTHETIC');
   expect(view.json().aiProvenance).toBe('MOCK');
   const forbidden=[
     ['/api/demo/profiles','GET'],
     ['/api/demo/contexts','POST'],
     ['/api/ai/opportunity-terms','POST'],
     ['/api/ai/jobs/fake','GET'],
     ['/api/reviewer/demo/subjects/S05/snapshot','GET'],
   ] as const;
   for(const [url,method] of forbidden){
     const r=await app.inject({url,method,headers});
     expect(r.statusCode).toBe(403);
   }
 });
 it('rejects a miswired MIXED profile source instead of exposing protected data',async()=>{
   const {app,code}=await harness({badDemoMode:true});
   expect((await enroll(app,code)).statusCode).toBe(200);
   expect((await get(app)).statusCode).toBe(403);
 });
 it('rate-limits repeated invalid code guesses, not successful page visits',async()=>{
   const {app}=await harness();
   for(let i=0;i<5;i++)expect((await enroll(app,'Z'.repeat(43))).statusCode).toBe(403);
   expect((await enroll(app,'Z'.repeat(43))).statusCode).toBe(429);
 });
 it('fails closed if the separate grant store is absent, even for a valid OAuth subject',async()=>{
   const app=createApi({repository:{
     listProfiles:async()=>[],readGrant:async()=>null,readSnapshot:async()=>null,readSafePacket:async()=>null,
   },allowedOrigin:ORIGIN,now:()=>current,verifySession:async()=>identity});
   apps.push(app);
   expect((await get(app)).statusCode).toBe(403);
 });
 it('rejects expired trusted identity proof independently of review period',async()=>{
   const expired={...identity,identityProofExpiresAt:'2026-12-01T00:00:00.000Z'};
   const {app,code}=await harness({identity:expired});
   expect((await enroll(app,code)).statusCode).toBe(403);
 });
});

describe('invitation issuance contract and store behavior',()=>{
 it('persists only token digests, supports idempotent owner redemption and actor binding',async()=>{
   const store=new MemoryReviewerAccessStore();
   const invite=await issueReviewerInvitation(store,toGrantSpec(),{now:'2026-11-30T00:00:00.000Z'});
   const args={tokenDigest:await import('../../apps/api/src/modules/auth/reviewer.js').then(m=>m.digestInviteToken(invite.enrollmentCode)),
     actorId:'GOOGLE-SUB-REVIEW-1',verifiedEmail:'evaluator@example.edu',now:BEGIN};
   const grant=await store.redeem(args);
   expect(grant?.actorId).toBe(args.actorId);
   expect((await store.redeem(args))?.inviteId).toBe(grant?.inviteId);
   expect(await store.redeem({...args,actorId:'GOOGLE-SUB-REVIEW-2'})).toBeNull();
   expect(JSON.stringify(grant)).not.toContain(invite.enrollmentCode);
   expect((await store.readActive(args))?.endsAt).toBe(END);
 });
 it('rejects invalid/overlong windows before saving',async()=>{
   const store=new MemoryReviewerAccessStore();
   await expect(issueReviewerInvitation(store,{...toGrantSpec(),endsAt:BEGIN},
     {now:'2026-11-30T00:00:00.000Z'})).rejects.toThrow();
   await expect(issueReviewerInvitation(store,{...toGrantSpec(),endsAt:'2027-04-30T00:00:00.000Z'},
     {now:'2026-11-30T00:00:00.000Z'})).rejects.toThrow();
 });
});
