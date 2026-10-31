import {afterEach,describe,expect,it} from 'vitest';
import {DemoProfileOptionSchema,DemoSnapshotSchema,SafeLlmPacketSchema}
  from '@hufs-one/contracts';
import type {AiTask,SubjectAlias} from '@hufs-one/contracts';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import type {ApiRepository,VerifiedReviewerActor}
  from '../../apps/api/src/types.js';
import {
  MemoryReviewerAccessStore,issueReviewerInvitation,
} from '../../apps/api/src/modules/auth/reviewer.js';
import {MemoryReviewerSandboxStore}
  from '../../apps/api/src/modules/auth/reviewer-sandbox.js';
import {HufsApiClient} from '../../apps/web/src/integrations/api-client.js';
import type {ApiFetch} from '../../apps/web/src/integrations/api-client.js';
import {DemoController} from '../../apps/web/src/app/demo-controller.js';
import profilesFixture from '../../packages/fixtures/synthetic/demo-profiles.json';
import snapshotFixture from '../../packages/fixtures/synthetic/demo-snapshot.json';
import safePacketFixture from '../../packages/fixtures/synthetic/safe-llm-packet.json';

const ORIGIN='https://synthetic.invalid';
const NOW='2026-11-10T00:00:00.000Z';
const reviewer:VerifiedReviewerActor={
  actorId:'google:SYN-REVIEWER-01',role:'REVIEWER',
  verifiedEmail:'synthetic-one@example.invalid',
  identityProofExpiresAt:'2026-12-01T00:00:00.000Z',
  sessionExpiresAt:'2026-12-01T00:00:00.000Z',
  sessionIdHash:'A'.repeat(64),csrfToken:'C'.repeat(32),
};
const second:VerifiedReviewerActor={
  ...reviewer,actorId:'google:SYN-REVIEWER-02',
  verifiedEmail:'synthetic-two@example.invalid',
  sessionIdHash:'B'.repeat(64),csrfToken:'D'.repeat(32),
};
const allProfiles=profilesFixture.profiles.map(p=>DemoProfileOptionSchema.parse({
  ...p,dataMode:'SYNTHETIC',readiness:'READY',
  allowedSections:['FEED','NOTICES','ACADEMICS','FORECAST','EXPERIENCE'],
}));

type App=ReturnType<typeof createIntegratedApi>;
const opened:App[]=[];
afterEach(async()=>{
  await Promise.all(opened.splice(0).map(x=>x.close()));
});

async function harness(){
  let realReads=0;
  const requestProofs:Array<{method:string;url:string;originOk:boolean;csrfOk:boolean;sessionOk:boolean}>=[];
  const denied=async():Promise<never>=>{
    realReads++;
    throw new Error('Never read actual student or production database records');
  };
  const repository:ApiRepository={
    listProfiles:denied,readGrant:denied,readSnapshot:denied,readSafePacket:denied,
  };
  const access=new MemoryReviewerAccessStore();
  const invite=await issueReviewerInvitation(access,{
    startsAt:'2026-11-05T15:00:00.000Z',
    endsAt:'2026-12-09T15:00:00.000Z',
    label:'Synthetic reviewer browser integration',
    maxAccounts:2,
  },{now:'2026-10-31T00:00:00.000Z'});
  const sandbox=new MemoryReviewerSandboxStore();
  const reviewerDemo={
    listProfiles:async()=>allProfiles,
    readSnapshot:async(subject:SubjectAlias)=>DemoSnapshotSchema.parse({
      ...snapshotFixture,demoSubjectId:subject,
    }),
    readSafePacket:async(_subject:SubjectAlias,task:AiTask,ref:string)=>
      ref.startsWith('SYN-PACKET-')?SafeLlmPacketSchema.parse({
        ...safePacketFixture,task,
      }):null,
  };
  const app=createIntegratedApi({
    allowedOrigin:ORIGIN,repository,
    auth:{
      verifySession:async(req)=>{
        const actor=req.headers.cookie==='reviewer-one'?reviewer:
          req.headers.cookie==='reviewer-two'?second:null;
        requestProofs.push({
          method:req.method,url:req.url,originOk:req.headers.origin===ORIGIN,
          csrfOk:req.headers['x-csrf-token']===actor?.csrfToken,
          sessionOk:actor!==null,
        });
        return actor;
      },
      revokeSession:async()=>{},
    },
    reviewer:{access,demo:reviewerDemo,sandbox},
    syntheticAiProvider:{
      analyze:async(packet)=>({
        task:packet.task,reviewRequired:true,citations:[],
      }),
    },
    maxSyntheticAiCallsPerActor:6,
    now:()=>NOW,
  });
  opened.push(app);
  function browser(cookie:'reviewer-one'|'reviewer-two'){
    const history:Array<{url:string;method:string;body:string|null}>=[];
    const transport:ApiFetch=async(url,init)=>{
      const method=init.method==='POST'?'POST':'GET';
      history.push({
        url,method,body:typeof init.body==='string'?init.body:null,
      });
      const response=await app.inject({
        url,method,
        headers:{
          origin:ORIGIN,cookie,
          ...(init.headers as Record<string,string>),
        },
        ...(method==='POST'?{payload:JSON.parse(init.body as string)}:{}),
      });
      return new Response(response.statusCode===204?null:response.body,{
        status:response.statusCode,
        headers:{'content-type':'application/json'},
      });
    };
    return {client:new HufsApiClient(transport),history};
  }
  return {app,access,invite,browser,getRealReads:()=>realReads,requestProofs};
}

describe('real Fastify inject <-> browser API client REVIEWER E2E (synthetic only)',()=>{
  it('authorizes a trusted REVIEWER grant directly when CSRF, Origin and invite match',async()=>{
    const {app,invite}=await harness();
    const direct=await app.inject({
      method:'POST',url:'/api/reviewer/invitations/redeem',
      headers:{
        origin:ORIGIN,cookie:'reviewer-one',
        'x-csrf-token':reviewer.csrfToken,
      },
      payload:{enrollmentCode:invite.enrollmentCode},
    });
    expect(direct.statusCode).toBe(200);
    expect(direct.json().role).toBe('REVIEWER');
  });

  it('compares the browser POST proof with the exact server-authorized admission route',async()=>{
    const {invite,browser,requestProofs}=await harness();
    const {client,history}=browser('reviewer-one');
    const response=await client.redeemReviewerInvite(invite.enrollmentCode)
      .then(()=>200,(_error:unknown)=>403);
    const proof=requestProofs.filter(x=>x.url==='/api/reviewer/invitations/redeem');
    const submitted=history.find(x=>x.url==='/api/reviewer/invitations/redeem');
    const bodyMatches=submitted?.body
      ?JSON.parse(submitted.body).enrollmentCode===invite.enrollmentCode:false;
    expect({response,proof,bodyMatches}).toEqual({
      response:200,bodyMatches:true,
      proof:[{
        method:'POST',url:'/api/reviewer/invitations/redeem',
        originOk:true,csrfOk:true,sessionOk:true,
      }],
    });
  });

  it('redeems an invitation and operates one fake student end-to-end without real reads',async()=>{
    const {access,invite,browser,getRealReads}=await harness();
    const {client,history}=browser('reviewer-one');
    await expect(client.getSession()).rejects.toMatchObject({
      code:'FORBIDDEN',status:403,
    });
    const enrolled=await client.redeemReviewerInvite(invite.enrollmentCode);
    expect(enrolled.role).toBe('REVIEWER');
    expect(enrolled.sandboxOnly).toBe(true);
    const session=await client.getSession();
    expect(session.role).toBe('REVIEWER');
    const manifest=await client.loadReviewerCapabilities();
    expect(manifest.sections).toHaveLength(10);
    expect(manifest.actions).toHaveLength(12);
    expect(manifest.ncpCalls).toBe(false);
    expect(manifest.actualBrowserUiVerified).toBe(false);
    const profiles=await client.listReviewerProfiles();
    expect(profiles.map(x=>x.demoSubjectId)).toEqual([
      'S01','S02','S03','S04','S05',
    ]);
    const context=await client.createContext('S01','REVIEWER-RUN-01');
    const snapshot=await client.getSnapshot(context.contextId);
    expect(snapshot.demoSubjectId).toBe('S01');
    expect(snapshot.datasetMode).toBe('SYNTHETIC');
    const action={kind:'BOOKMARK',itemId:'SYN-OPP-1',saved:true} as const;
    const saved=await client.saveReviewerAction(context,action);
    expect(saved.mode).toBe('SYNTHETIC_SANDBOX');
    expect(saved.subjectId).toBe('S01');
    expect(saved.actions).toEqual([action]);
    const loaded=await client.readReviewerActions(context);
    expect(loaded.actions).toEqual([action]);
    const accepted=await client.submitSyntheticAi(
      'opportunity-terms','SYN-PACKET-S01','REVIEW-IDEMPOTENCY-01',
      context.contextId,
    );
    expect(accepted.provenance).toBe('MOCK');
    const job=await client.getSyntheticAiJob(accepted.jobId);
    expect(job.candidate.provenance).toBe('MOCK');
    expect(job.candidate.reviewState).toBe('NEEDS_REVIEW');
    expect(history.every(h=>h.url.startsWith('/api/')
      &&!h.url.includes(invite.enrollmentCode)
      &&!h.url.includes('SYN-PACKET-S01'))).toBe(true);
    expect(history.some(h=>h.method==='POST'
      &&h.url==='/api/reviewer/invitations/redeem'
      &&h.body?.includes(invite.enrollmentCode))).toBe(true);
    expect(getRealReads()).toBe(0);

    await access.revoke(invite.invitationId,NOW);
    await expect(client.readReviewerActions(context)).rejects.toMatchObject({
      code:'FORBIDDEN',status:403,
    });
    await expect(client.getSnapshot(context.contextId)).rejects.toMatchObject({
      code:'FORBIDDEN',status:403,
    });
    expect(getRealReads()).toBe(0);
  });

  it('cannot borrow an enrolled actor session or sandbox by switching browser cookies',async()=>{
    const {invite,browser,getRealReads}=await harness();
    const first=browser('reviewer-one').client;
    const secondBrowser=browser('reviewer-two').client;
    await first.redeemReviewerInvite(invite.enrollmentCode);
    const context=await first.createContext('S01','REVIEWER-RUN-02');
    await first.saveReviewerAction(context,{
      kind:'BOOKMARK',itemId:'SYN-OPP-1',saved:true,
    });
    await expect(secondBrowser.readReviewerActions(context)).rejects.toMatchObject({
      code:'FORBIDDEN',status:403,
    });
    await secondBrowser.redeemReviewerInvite(invite.enrollmentCode);
    await expect(secondBrowser.readReviewerActions(context)).rejects.toMatchObject({
      code:'FORBIDDEN',status:403,
    });
    const secondContext=await secondBrowser.createContext('S01','REVIEWER-RUN-03');
    expect((await secondBrowser.readReviewerActions(secondContext)).actions).toEqual([]);
    expect((await first.readReviewerActions(context)).actions).toHaveLength(1);
    expect(getRealReads()).toBe(0);
  });

  it('erases an already visible student once the active reviewer invitation is revoked',async()=>{
    const {invite,access,browser,getRealReads}=await harness();
    const {client}=browser('reviewer-one');
    await client.redeemReviewerInvite(invite.enrollmentCode);
    const controller=new DemoController(client,'REVIEWER-RUN-04');
    await controller.loadProfiles();
    await controller.select('S01');
    expect(controller.getState().status).toBe('READY');
    expect(controller.getState().snapshot?.demoSubjectId).toBe('S01');
    await access.revoke(invite.invitationId,NOW);
    await controller.revalidate();
    expect(controller.getState().status).toBe('REVOKED');
    expect(controller.getState().snapshot).toBeNull();
    expect(controller.getState().context).toBeNull();
    expect(getRealReads()).toBe(0);
    controller.dispose();
  });
});
