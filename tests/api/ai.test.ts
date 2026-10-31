import {afterEach,describe,expect,it,vi} from 'vitest';
import {DemoProfileOptionSchema,SafeLlmPacketSchema} from '@hufs-one/contracts';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {createApi} from '../../apps/api/src/server.js';
import profiles from '../../packages/fixtures/synthetic/demo-profiles.json';
import safePacket from '../../packages/fixtures/synthetic/safe-llm-packet.json';

const NOW='2026-10-31T00:00:00.000Z';
const ORIGIN='https://example.test';
const actor={actorId:'SYN-ACTOR-01',sessionIdHash:'H'.repeat(32),
  schoolMailProofExpiresAt:'2026-11-02T00:00:00.000Z',
  sessionExpiresAt:'2026-11-03T00:00:00.000Z',
  role:'BETA' as const,betaAllowed:true,csrfToken:'C'.repeat(32)};
const headers={cookie:'a',origin:ORIGIN,'x-csrf-token':actor.csrfToken};
const packet=SafeLlmPacketSchema.parse(safePacket);
const instances:Array<ReturnType<typeof createApi>>=[];
afterEach(async()=>{await Promise.all(instances.map(x=>x.close()));instances.length=0;});
function create(provider?:{analyze:(input:typeof packet)=>Promise<unknown>},max=3){
  const repo=new MemoryApiRepository({
    profiles:profiles.profiles.map(p=>DemoProfileOptionSchema.parse(p)),
    safePackets:[{actorId:actor.actorId,ref:'DOC1',packet}],
  });
  const app=createApi({repository:repo,allowedOrigin:ORIGIN,
    verifySession:async req=>req.headers.cookie==='a'?actor:
      req.headers.cookie==='b'?{...actor,actorId:'SYN-ACTOR-02',sessionIdHash:'X'.repeat(32)}:null,
    now:()=>NOW,...(provider?{syntheticAiProvider:provider}:{}),maxSyntheticAiCallsPerActor:max});
  instances.push(app);
  return app;
}
const request=(app:ReturnType<typeof createApi>,key:string,ref='DOC1',task='opportunity-terms')=>
  app.inject({url:'/api/ai/'+task,method:'POST',
    headers,payload:{packetRef:ref,idempotencyKey:key}});

describe('AI boundary (local fake provider only)',()=>{
  it('disables all provider calls by default',async()=>{
    const app=create();
    const res=await request(app,'KEY00001');
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('PROVIDER_UNAVAILABLE');
  });
  it('rejects client packet injection and unknown task routes',async()=>{
    const app=create({analyze:async()=>({task:'opportunity_terms',citations:[],reviewRequired:true})});
    const extra=await app.inject({url:'/api/ai/opportunity-terms',method:'POST',
      headers,payload:{packetRef:'DOC1',idempotencyKey:'KEY00002',sourceTokens:[]}});
    expect(extra.statusCode).toBe(422);
    expect((await request(app,'KEY00003','DOC1','hidden-rulepack')).statusCode).toBe(422);
    expect((await request(app,'KEY00004','MISSING')).statusCode).toBe(403);
  });
  it('returns verified exact quote as a NEEDS_REVIEW candidate, not a fact',async()=>{
    const mock=vi.fn(async()=>({
      task:'opportunity_terms',reviewRequired:true,
      citations:[{sourceToken:'SYN-DOC-01',paragraphId:'p1',
        quote:'가상 데이터 체험',topicCode:'DATA_ANALYTICS'}],
    }));
    const app=create({analyze:mock});
    const res=await request(app,'KEY00005');
    expect(res.statusCode).toBe(202);
    const job=await app.inject({url:'/api/ai/jobs/'+res.json().jobId,headers:{cookie:'a'}});
    expect(job.statusCode).toBe(200);
    expect(job.json().candidate.reviewState).toBe('NEEDS_REVIEW');
    expect(job.json().candidate.provenance).toBe('MOCK');
    expect(mock).toHaveBeenCalledTimes(1);
    const other=await app.inject({url:'/api/ai/jobs/'+res.json().jobId,headers:{cookie:'b'}});
    expect(other.statusCode).toBe(403);
  });
  it('does not double-call provider on an idempotent retry and caps calls',async()=>{
    const mock=vi.fn(async()=>({task:'opportunity_terms',citations:[],reviewRequired:true}));
    const app=create({analyze:mock},1);
    const first=await request(app,'KEY00006');
    const second=await request(app,'KEY00006');
    expect(second.json().jobId).toBe(first.json().jobId);
    expect(mock).toHaveBeenCalledTimes(1);
    expect((await request(app,'KEY00006','OTHER')).statusCode).toBe(409);
    expect((await request(app,'KEY00007')).statusCode).toBe(429);
  });
  it('blocks hallucinated citations, extra fields and provider exceptions',async()=>{
    const wrong=create({analyze:async()=>({
      task:'opportunity_terms',reviewRequired:true,
      citations:[{sourceToken:'SYN-DOC-01',paragraphId:'p1',quote:'가짜 허위 경력'}],
    })});
    const bad=await request(wrong,'KEY00008');
    expect(bad.statusCode).toBe(422);
    expect(JSON.stringify(bad.json())).not.toContain('가짜 허위 경력');
    const extra=create({analyze:async()=>({
      task:'opportunity_terms',reviewRequired:true,citations:[],officialApproval:true,
    })});
    expect((await request(extra,'KEY00009')).statusCode).toBe(422);
    const broken=create({analyze:async()=>{throw new Error('private raw provider data');}});
    const error=await request(broken,'KEY00010');
    expect(error.statusCode).toBe(503);
    expect(JSON.stringify(error.json())).not.toContain('private raw provider data');
  });
  it('does not let an AI provider bypass section grants or originate real text',async()=>{
    const app=create({analyze:async()=>({task:'opportunity_terms',reviewRequired:true,citations:[]})});
    const body=await app.inject({url:'/api/ai/opportunity-terms',method:'POST',headers,
      payload:{packetRef:'DOC1',idempotencyKey:'KEY00011',actorId:'SYN-ACTOR-02'}});
    expect(body.statusCode).toBe(422);
  });
});
