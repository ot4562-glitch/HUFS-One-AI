import {afterEach,describe,expect,it} from 'vitest';
import {DemoProfileOptionSchema,DemoSnapshotSchema,SafeLlmPacketSchema} from '@hufs-one/contracts';
import {MemoryReviewerAccessStore,issueReviewerInvitation,digestInviteToken} from
  '../../apps/api/src/modules/auth/reviewer.js';
import {MemoryReviewerSandboxStore} from '../../apps/api/src/modules/auth/reviewer-sandbox.js';
import {createApi} from '../../apps/api/src/server.js';
import type {VerifiedReviewerActor} from '../../apps/api/src/types.js';
import profiles from '../../packages/fixtures/synthetic/demo-profiles.json';
import snapshot from '../../packages/fixtures/synthetic/demo-snapshot.json';
import packet from '../../packages/fixtures/synthetic/safe-llm-packet.json';

const ORIGIN='https://example.test';
const BEGIN='2026-11-05T15:00:00.000Z';
const END='2026-12-09T15:00:00.000Z';
let current='2026-11-10T00:00:00.000Z';
const identity:VerifiedReviewerActor={
  actorId:'OIDC-DEMO-01',role:'REVIEWER',verifiedEmail:'judge-one@example.org',
  identityProofExpiresAt:'2027-01-01T00:00:00.000Z',
  sessionExpiresAt:'2026-12-12T00:00:00.000Z',
  sessionIdHash:'S'.repeat(30),csrfToken:'C'.repeat(30),
};
const h={cookie:'reviewer-session',origin:ORIGIN,'x-csrf-token':identity.csrfToken};
const appList:Array<ReturnType<typeof createApi>>=[];
afterEach(async()=>{await Promise.all(appList.map(a=>a.close()));appList.length=0;
  current='2026-11-10T00:00:00.000Z';});
const ids=['S01','S02','S03','S04','S05'] as const;

async function harness(config:{
  alternate?:VerifiedReviewerActor,first?:VerifiedReviewerActor,
  maxAccounts?:number,invalidMode?:boolean
}={}){
  const store=new MemoryReviewerAccessStore();
  const invite=await issueReviewerInvitation(store,{
    startsAt:BEGIN,endsAt:END,label:'HUFS Competition Shared Review',
    maxAccounts:config.maxAccounts??20,
  },{now:'2026-10-31T00:00:00.000Z'});
  const data={
    listProfiles:async()=>profiles.profiles.map((p,i)=>DemoProfileOptionSchema.parse({
      ...p,readiness:'READY',dataMode:config.invalidMode&&i===0?'MIXED':'SYNTHETIC',
      allowedSections:['FEED','NOTICES','ACADEMICS','FORECAST','EXPERIENCE'],
    })),
    readSnapshot:async(id:string)=>ids.includes(id as typeof ids[number])?
      DemoSnapshotSchema.parse({...snapshot,demoSubjectId:id,contextId:'SYN-CONTEXT-'+id}):null,
    readSafePacket:async(_subject:string,task:string,ref:string)=>
      ref.startsWith('SYN-PACKET-')?SafeLlmPacketSchema.parse({...packet,task}):null,
  };
  const first=config.first??identity;
  const other=config.alternate??{...identity,actorId:'OIDC-DEMO-02',
    verifiedEmail:'judge-two@example.org',sessionIdHash:'T'.repeat(30)};
  const app=createApi({
    allowedOrigin:ORIGIN,now:()=>current,reviewerAccess:store,reviewerDemo:data,
    reviewerSandbox:new MemoryReviewerSandboxStore(),
    repository:{
      listProfiles:async()=>{throw Error('Real data repository accessed');},
      readGrant:async()=>{throw Error('Real grant repository accessed');},
      readSnapshot:async()=>{throw Error('Real projection accessed');},
      readSafePacket:async()=>{throw Error('Real AI packet accessed');},
    },
    verifySession:async req=>req.headers.cookie==='reviewer-session'?first:
      req.headers.cookie==='reviewer-other'?other:null,
  });
  appList.push(app);
  return {app,store,invite,other};
}
const enroll=(app:ReturnType<typeof createApi>,code:string,headers:Record<string,string>=h)=>
  app.inject({method:'POST',url:'/api/reviewer/invitations/redeem',headers,
    payload:{enrollmentCode:code}});
const get=(app:ReturnType<typeof createApi>,url:string,cookie='reviewer-session')=>
  app.inject({method:'GET',url,headers:{cookie}});

describe('SHARED REVIEWER invitation (identity-bound, max new seats, unlimited visits)',()=>{
  it('one invitation enrolls multiple independently verified Google accounts, no pre-known emails',async()=>{
    const {app,invite}=await harness({maxAccounts:2});
    expect((await enroll(app,invite.enrollmentCode)).statusCode).toBe(200);
    expect((await enroll(app,invite.enrollmentCode,{...h,cookie:'reviewer-other'})).statusCode).toBe(200);
    for(let i=0;i<70;i++){
      expect((await get(app,'/api/demo/profiles')).statusCode).toBe(200);
      expect((await get(app,'/api/reviewer/demo/profiles','reviewer-other')).statusCode).toBe(200);
    }
    expect((await enroll(app,invite.enrollmentCode)).statusCode).toBe(200);
  });
  it('new actor capacity is capped but already-enrolled accounts can revisit after full',async()=>{
    const store=new MemoryReviewerAccessStore();
    const issued=await issueReviewerInvitation(store,{
      startsAt:BEGIN,endsAt:END,label:'Demo seats',maxAccounts:1,
    },{now:'2026-10-31T00:00:00.000Z'});
    const digest=digestInviteToken(issued.enrollmentCode);
    const first={tokenDigest:digest,actorId:'sub1',verifiedEmail:'a@example.org',now:BEGIN};
    expect((await store.redeem(first))?.actorId).toBe('sub1');
    expect(await store.redeem({...first,actorId:'sub2',verifiedEmail:'b@example.org'})).toBeNull();
    expect((await store.redeem(first))?.actorId).toBe('sub1');
    expect((await store.readActive({actorId:'sub1',verifiedEmail:'a@example.org',
      now:'2026-12-09T14:59:59.000Z'}))?.inviteId).toBe(issued.invitationId);
    expect(await store.redeem({...first,actorId:'sub1',verifiedEmail:'changed@example.org'})).toBeNull();
  });
  it('rejects missing auth, bogus CSRF, incorrect origin, and malformed code',async()=>{
    const {app,invite}=await harness();
    expect((await enroll(app,invite.enrollmentCode,{...h,cookie:'none','x-csrf-token':'NO'})).statusCode).toBe(401);
    expect((await enroll(app,invite.enrollmentCode,{cookie:'reviewer-session'})).statusCode).toBe(403);
    expect((await enroll(app,invite.enrollmentCode,{...h,origin:'https://wrong.test'})).statusCode).toBe(403);
    expect((await enroll(app,'bad')).statusCode).toBe(422);
    expect((await get(app,'/api/demo/profiles')).statusCode).toBe(403);
  });
  it('hard-expires at the exact end instant, even with an existing session',async()=>{
    const {app,invite}=await harness();
    expect((await enroll(app,invite.enrollmentCode)).statusCode).toBe(200);
    current='2026-12-09T14:59:59.000Z';
    expect((await get(app,'/api/demo/profiles')).statusCode).toBe(200);
    current=END;
    expect((await get(app,'/api/demo/profiles')).statusCode).toBe(403);
    expect((await enroll(app,invite.enrollmentCode)).statusCode).toBe(403);
  });
  it('cannot enroll before opening, after revocation, or after identity expiry',async()=>{
    const {app,invite,store}=await harness();
    current='2026-11-05T14:59:59.000Z';
    expect((await enroll(app,invite.enrollmentCode)).statusCode).toBe(403);
    current=BEGIN;
    expect((await enroll(app,invite.enrollmentCode)).statusCode).toBe(200);
    await store.revoke(invite.invitationId,current);
    expect((await get(app,'/api/demo/profiles')).statusCode).toBe(403);
    const expired=await harness({first:{...identity,identityProofExpiresAt:'2026-11-01T00:00:00.000Z'}});
    expect((await enroll(expired.app,expired.invite.enrollmentCode)).statusCode).toBe(403);
  });
  it('limits guessing but not valid page visits and never reveals the invitation secret',async()=>{
    const {app,invite}=await harness();
    for(let i=0;i<5;i++)expect((await enroll(app,'Z'.repeat(43))).statusCode).toBe(403);
    expect((await enroll(app,invite.enrollmentCode)).statusCode).toBe(429);
    expect((await get(app,'/api/reviewer/demo/profiles')).statusCode).toBe(403);
  });
  it('uses ONLY a synthetic repository even when team repo would throw, denies mixed data',async()=>{
    const {app,invite}=await harness();
    expect((await enroll(app,invite.enrollmentCode)).statusCode).toBe(200);
    const r=await get(app,'/api/demo/profiles');
    expect(r.statusCode).toBe(200);
    expect(r.json().profiles).toHaveLength(5);
    expect(r.json().profiles.every((x:{dataMode:string})=>x.dataMode==='SYNTHETIC')).toBe(true);
    const bad=await harness({invalidMode:true});
    expect((await enroll(bad.app,bad.invite.enrollmentCode)).statusCode).toBe(200);
    expect((await get(bad.app,'/api/demo/profiles')).statusCode).toBe(403);
  });
  it('supports profile switch + feed/notices/academics/forecast with existing UI API routes',async()=>{
    const {app,invite}=await harness();
    expect((await enroll(app,invite.enrollmentCode)).statusCode).toBe(200);
    for(const subject of ids){
      const created=await app.inject({method:'POST',url:'/api/demo/contexts',headers:h,
        payload:{demoSubjectId:subject,demoRunId:'SYN-RUN-001'}});
      expect(created.statusCode).toBe(201);
      const id=created.json().contextId;
      for(const section of ['snapshot','notices','graduation','outlook']){
        const response=await get(app,`/api/demo/contexts/${id}/${section}`);
        expect(response.statusCode).toBe(200);
      }
      const direct=await get(app,`/api/reviewer/demo/subjects/${subject}/snapshot`);
      expect(direct.statusCode).toBe(200);
    }
  });
  it('exposes every synthetic student tab and lets each judge edit interests, plan and filters only in sandbox',async()=>{
    const {app,invite}=await harness();
    expect((await enroll(app,invite.enrollmentCode)).statusCode).toBe(200);
    const cap=await get(app,'/api/reviewer/capabilities');
    expect(cap.statusCode).toBe(200);
    expect(cap.json()).toMatchObject({sandboxOnly:true,externalSubmission:false,
      ncpCalls:false,actualBrowserUiVerified:false});
    expect(cap.json().sections).toEqual(expect.arrayContaining([
      'TODAY','OPPORTUNITIES','NOTICES','EXPERIENCE','GRADUATION',
      'COURSE_PLANNER','OUTLOOK','SAVED','APPLICATIONS','SETTINGS']));
    const ctx=await app.inject({method:'POST',url:'/api/demo/contexts',headers:h,
      payload:{demoSubjectId:'S01',demoRunId:'REVIEW-FULL'}});
    expect(ctx.statusCode).toBe(201);
    const url='/api/reviewer/demo/contexts/'+ctx.json().contextId+'/actions';
    for(const action of [
      {kind:'SET_INTERESTS',topics:['ECONOMIC_RESEARCH','FINANCE_INVESTMENT']},
      {kind:'SET_DESIRED_JOBS',topics:['DATA_ANALYTICS']},
      {kind:'PLAN_COURSE',courseId:'SYN-COURSE-001',planned:true},
      {kind:'SET_SEARCH',query:'경제'},
      {kind:'SET_NOTIFICATIONS',enabled:false},
    ])expect((await app.inject({method:'POST',url,headers:h,payload:action})).statusCode).toBe(200);
    expect((await get(app,url)).json().actions).toHaveLength(5);
    expect((await get(app,url,'reviewer-other')).statusCode).toBe(403);
    for(const action of [
      {kind:'PLAN_COURSE',courseId:'REAL-123',planned:true},
      {kind:'SET_INTERESTS',topics:['FAKE_TOPIC']},
      {kind:'SET_SEARCH',query:'x'.repeat(101)},
    ])expect((await app.inject({method:'POST',url,headers:h,payload:action})).statusCode).toBe(422);
    expect((await app.inject({method:'POST',url,headers:h,
      payload:{kind:'RESET_SANDBOX'}})).statusCode).toBe(200);
    expect((await get(app,url)).json().actions).toHaveLength(0);
    current=END;
    expect((await get(app,'/api/reviewer/capabilities')).statusCode).toBe(403);
  });
  it('runs isolated interactive bookmark, checklist, experience, draft and fake application actions',async()=>{
    const {app,invite}=await harness();
    expect((await enroll(app,invite.enrollmentCode)).statusCode).toBe(200);
    const created=await app.inject({method:'POST',url:'/api/demo/contexts',headers:h,
      payload:{demoSubjectId:'S01',demoRunId:'REVIEW-RUN'}});
    const id=created.json().contextId;
    const actions=[
      {kind:'BOOKMARK',itemId:'SYN-OPP-1',saved:true},
      {kind:'MARK_READ',itemId:'SYN-NOT-1',read:true},
      {kind:'CHECKLIST',requirementId:'SYN-REQ-1',done:true},
      {kind:'EXPERIENCE',experienceId:'SYN-EXP-1',note:'합성 활동 기록'},
      {kind:'APPLICATION_DRAFT',opportunityId:'SYN-OPP-1',text:'합성 지원서'},
      {kind:'SIMULATE_APPLICATION',opportunityId:'SYN-OPP-1'},
    ];
    for(const action of actions){
      const res=await app.inject({method:'POST',
        url:`/api/reviewer/demo/contexts/${id}/actions`,headers:h,payload:action});
      expect(res.statusCode).toBe(200);
      expect(res.json().mode).toBe('SYNTHETIC_SANDBOX');
    }
    const list=await get(app,`/api/reviewer/demo/contexts/${id}/actions`);
    expect(list.json().actions).toHaveLength(actions.length);
    expect((await get(app,'/api/reviewer/demo/contexts/'+id+'/actions','reviewer-other')).statusCode).toBe(403);
    const malicious=await app.inject({method:'POST',url:`/api/reviewer/demo/contexts/${id}/actions`,
      headers:h,payload:{kind:'SIMULATE_APPLICATION',opportunityId:'REAL-STUDENT-001'}});
    expect(malicious.statusCode).toBe(422);
  });
  it('simulates all four AI tasks using local synthetic packets; no external paid provider',async()=>{
    const {app,invite}=await harness();
    expect((await enroll(app,invite.enrollmentCode)).statusCode).toBe(200);
    const created=await app.inject({method:'POST',url:'/api/demo/contexts',headers:h,
      payload:{demoSubjectId:'S01',demoRunId:'REVIEW-RUN'}});
    const contextId=created.json().contextId;
    for(const task of ['experience-skills','opportunity-terms','personal-action-brief','graduation-explanation']){
      const res=await app.inject({method:'POST',url:'/api/ai/'+task,headers:h,
        payload:{contextId,packetRef:'SYN-PACKET-S01',idempotencyKey:'REVIEW-KEY-'+task}});
      expect(res.statusCode).toBe(202);
      const job=await get(app,'/api/ai/jobs/'+res.json().jobId);
      expect(job.statusCode).toBe(200);
      expect(job.json().candidate.provenance).toBe('MOCK');
      expect(job.json().candidate.reviewState).toBe('NEEDS_REVIEW');
    }
  });
  it('no access to actual admin routes, paid processing or real data API',async()=>{
    const {app,invite}=await harness();
    expect((await enroll(app,invite.enrollmentCode)).statusCode).toBe(200);
    for(const [path,method] of [
      ['/api/admin/anything','GET'],['/api/ingest','POST'],
      ['/api/health','GET'],['/api/reviewer/invitations/issue','POST']
    ] as const){
      const res=await app.inject({url:path,method,headers:h});
      expect(res.statusCode).toBe(403);
    }
    const session=await get(app,'/api/auth/session');
    expect(session.json()).toMatchObject({role:'REVIEWER',dataMode:'SYNTHETIC'});
    expect(JSON.stringify(session.json())).not.toContain(invite.enrollmentCode);
  });
  it('rejects reviewer requests without an injected store/Google session',async()=>{
    const app=createApi({allowedOrigin:ORIGIN,now:()=>current,
      repository:{listProfiles:async()=>[],readGrant:async()=>null,
        readSnapshot:async()=>null,readSafePacket:async()=>null},
      verifySession:async()=>identity});
    appList.push(app);
    expect((await get(app,'/api/demo/profiles')).statusCode).toBe(403);
  });
});
