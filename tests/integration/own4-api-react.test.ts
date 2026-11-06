import {afterEach,describe,expect,it} from 'vitest';
import {DemoProfileOptionSchema,DemoSnapshotSchema,SharingGrantSchema,SafeLlmPacketSchema} from '@hufs-one/contracts';
import type {ApiFetch} from '../../apps/web/src/integrations/api-client.js';
import {HufsApiClient} from '../../apps/web/src/integrations/api-client.js';
import {DemoController} from '../../apps/web/src/app/demo-controller.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import profiles from '../../packages/fixtures/synthetic/demo-profiles.json';
import snapshot from '../../packages/fixtures/synthetic/demo-snapshot.json';
import safePacket from '../../packages/fixtures/synthetic/safe-llm-packet.json';

const origin='https://hufs-test.invalid';
const now='2026-10-31T00:00:00.000Z';
const actor={
  actorId:'SYN-INT-ACTOR',sessionIdHash:'H'.repeat(40),
  sessionExpiresAt:'2026-11-05T00:00:00.000Z',
  schoolMailProofExpiresAt:'2026-11-03T00:00:00.000Z',
  betaAllowed:true,role:'BETA' as const,csrfToken:'C'.repeat(32),
};
const grant=SharingGrantSchema.parse({
  grantId:'SYN-G1',actorId:actor.actorId,demoSubjectId:'S01',
  allowedSections:['FEED','NOTICES','ACADEMICS','EXPERIENCE'],displayNameAllowed:true,recordingAllowed:false,
  version:'SYN-V1',expiresAt:'2026-11-05T00:00:00.000Z',
});
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{await Promise.all(apps.map(a=>a.close()));apps.length=0;});

function harness(withAi=false) {
  let active=true;
  const repository=new MemoryApiRepository({
    profiles:profiles.profiles.map(p=>DemoProfileOptionSchema.parse(p)),
    projections:[DemoSnapshotSchema.parse(snapshot)],grants:[grant],
    safePackets:[{actorId:actor.actorId,ref:'SYN-PACKET',
      packet:SafeLlmPacketSchema.parse(safePacket)}],
  });
  const app=createIntegratedApi({
    repository,allowedOrigin:origin,now:()=>now,
    auth:{
      verifySession:async(req)=>active&&req.headers.cookie==='sid=good'?actor:null,
      revokeSession:async()=>{active=false;},
    },
    ...(withAi?{syntheticAiProvider:{analyze:async()=>({
      task:'opportunity_terms',reviewRequired:true,citations:[{
        sourceToken:'SYN-DOC-01',paragraphId:'p1',quote:'가상 데이터 체험',
      }],
    })}}:{}),
  });
  apps.push(app);
  const requests:Array<{url:string;init:RequestInit}>=[];
  const transport:ApiFetch=async(url,init)=>{
    requests.push({url,init});
    const headers=init.headers as Record<string,string>;
    // The #32 auth PR owns this route. Stub the verified CSRF API until that PR is merged.
    if(url==='/api/auth/csrf') {
      if(!active)return new Response(JSON.stringify({
        code:'UNAUTHENTICATED',message:'로그인이 필요합니다.',requestId:'SYN-REQ',
        retryable:false,
      }),{status:401,headers:{'content-type':'application/json'}});
      return new Response(JSON.stringify({csrfToken:actor.csrfToken}),{
        status:200,headers:{'content-type':'application/json'},
      });
    }
    const response=await app.inject({
      url,method:init.method==='POST'?'POST':'GET',
      headers:{
        cookie:'sid=good',origin,
        ...(headers['x-csrf-token']?{'x-csrf-token':headers['x-csrf-token']}:{}),
        ...(headers['content-type']?{'content-type':headers['content-type']}:{}),
      },
      ...(typeof init.body==='string'?{payload:init.body}:{}),
    });
    return new Response(response.statusCode===204?null:response.body,{
      status:response.statusCode,
      headers:{'content-type':'application/json',
        'cache-control':String(response.headers['cache-control'] ?? '')},
    });
  };
  return {app,repository,requests,client:new HufsApiClient(transport)};
}

describe('integration: real Fastify inject with synthetic browser transport',()=>{
  it('uses authenticated server identity and no-store, returns redacted shared projection',async()=>{
    const {client,requests}=harness();
    const list=await client.listProfiles();
    expect(list).toHaveLength(5);
    expect(list[1]!.readiness).toBe('PENDING');
    const controller=new DemoController(client,'SYN-RUN-1');
    await controller.select('S01');
    const view=controller.getState();
    expect(view.status).toBe('READY');
    expect(view.snapshot?.demoSubjectId).toBe('S01');
    expect(view.snapshot?.academics).toEqual(snapshot.academics);
    expect(view.snapshot?.forecast).toEqual({state:'NOT_SHARED'});
    expect(requests.every(r=>r.init.credentials==='same-origin'
      &&r.init.cache==='no-store'&&r.init.redirect==='error')).toBe(true);
    expect(requests.every(r=>!String(r.init.body??'').includes('actorId'))).toBe(true);
    controller.dispose();
  });

  it('server side grant revocation and version conflicts clear the selected student',async()=>{
    const {client,repository}=harness();
    const controller=new DemoController(client,'SYN-RUN-1');
    await controller.select('S01');
    expect(controller.getState().status).toBe('READY');
    const oldContext=controller.getState().context!;
    repository.setGrant({...grant,version:'SYN-V2'});
    await expect(client.getSnapshot(oldContext.contextId)).rejects.toMatchObject({
      code:'VERSION_CONFLICT',status:409,
    });
    await controller.select('S01');
    expect(controller.getState().status).toBe('READY'); // new context uses current grant
    repository.revokeGrant(actor.actorId,'S01',now);
    await controller.select('S01');
    expect(controller.getState().status).toBe('REVOKED');
    expect(controller.getState().snapshot).toBeNull();
    controller.dispose();
  });

  it('clears UI and denies a context if precomputed FEED/NOTICES derive from unshared academic or experience inputs',async()=>{
    for(const hidden of ['ACADEMICS','EXPERIENCE'] as const){
      const {client,repository}=harness();
      repository.setGrant({...grant,allowedSections:grant.allowedSections.filter(section=>section!==hidden)});
      const controller=new DemoController(client,'SYN-RUN-1');
      await controller.select('S01');
      expect(controller.getState().status).toBe('REVOKED');
      expect(controller.getState().snapshot).toBeNull();
      controller.dispose();
    }
  });

  it('logout requires a server revocation and invalidates the next browser request',async()=>{
    const {client}=harness();
    const controller=new DemoController(client,'SYN-RUN-1');
    await controller.select('S01');
    await controller.logout();
    expect(controller.getState().status).toBe('SIGNED_OUT');
    expect(controller.getState().snapshot).toBeNull();
    await expect(client.listProfiles()).rejects.toMatchObject({code:'UNAUTHENTICATED'});
  });

  it('rejects missing providers at construction and invalid Origin/CSRF on Fastify',async()=>{
    const {app}=harness();
    const response=await app.inject({method:'POST',url:'/api/demo/contexts',
      headers:{cookie:'sid=good',origin:'https://other.invalid'},
      payload:{demoSubjectId:'S01',demoRunId:'SYN-RUN-1'}});
    expect(response.statusCode).toBe(403);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(()=>createIntegratedApi({
      allowedOrigin:origin,repository:{} as never,auth:{} as never,
    })).toThrow('fail closed');
    expect(()=>createIntegratedApi({
      allowedOrigin:'http://insecure.invalid',repository:{} as never,auth:{} as never,
    })).toThrow();
    expect(()=>createIntegratedApi({
      allowedOrigin:origin,repository:new MemoryApiRepository({profiles:[]}),
      auth:{verifySession:async()=>actor,revokeSession:async()=>{}},
      reviewer:{} as never,
    })).toThrow('REVIEWER sandbox');
  });

  it('submits exactly one cleared synthetic AI packet and retrieves only a NEEDS_REVIEW mock',async()=>{
    const {client,requests}=harness(true);
    const accepted=await client.submitSyntheticAi(
      'opportunity-terms','SYN-PACKET','SYN-IDEMPOTENCY-01',
    );
    expect(accepted.state).toBe('NEEDS_REVIEW');
    expect(accepted.provenance).toBe('MOCK');
    const job=await client.getSyntheticAiJob(accepted.jobId);
    expect(job.state).toBe('NEEDS_REVIEW');
    expect(job.candidate.reviewState).toBe('NEEDS_REVIEW');
    expect(job.candidate.provenance).toBe('MOCK');
    expect(job.candidate.task).toBe('opportunity_terms');
    expect(job.candidate.citations).toHaveLength(1);
    expect(job.candidate.citations[0]?.quote).toBe('가상 데이터 체험');
    expect(requests.some(x=>x.url.startsWith('/api/ai/jobs/'))).toBe(true);
    expect(requests.every(x=>!String(x.init.body??'').includes('sourceTokens'))).toBe(true);
  });

  it('fails closed on an unconfigured AI model or an invalid job identifier',async()=>{
    const {client}=harness();
    await expect(client.submitSyntheticAi(
      'opportunity-terms','SYN-PACKET','SYN-IDEMPOTENCY-02',
    )).rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE',status:503});
    await expect(client.getSyntheticAiJob('../private')).rejects.toMatchObject({
      code:'INVALID_INPUT',status:422,
    });
  });

  it('rejects a fabricated VERIFIED job even if it has a plausible citation',async()=>{
    const job={
      jobId:'SYN-JOB',state:'NEEDS_REVIEW',task:'opportunity_terms',
      createdAt:'2026-10-31T00:00:00.000Z',
      candidate:{task:'opportunity_terms',reviewState:'VERIFIED',provenance:'MOCK',
        citations:[{sourceToken:'SYN-DOC-01',paragraphId:'p1',quote:'synthetic'}]},
    };
    const client=new HufsApiClient(async()=>new Response(JSON.stringify(job),{
      status:200,headers:{'content-type':'application/json'},
    }));
    await expect(client.getSyntheticAiJob('SYN-JOB')).rejects.toMatchObject({
      code:'PROVIDER_UNAVAILABLE',status:503,
    });
  });

  it('keeps malformed HTTP 403 terminal, drops private error details and rejects third-party URL inputs',async()=>{
    const malformed:ApiFetch=async()=>new Response('{"studentRaw":"private"}',{
      status:403,headers:{'content-type':'application/json'},
    });
    const client=new HufsApiClient(malformed);
    const err=await client.listProfiles().catch(error=>error);
    expect(err).toMatchObject({
      code:'FORBIDDEN',status:403,
    });
    await expect(client.getSnapshot('https://evil.invalid')).rejects.toMatchObject({
      code:'INVALID_INPUT',
    });
    expect(JSON.stringify(err)).not.toContain('private');
  });
});
