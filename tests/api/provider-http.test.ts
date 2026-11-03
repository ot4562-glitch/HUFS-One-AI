import {afterEach,describe,expect,it,vi} from 'vitest';
import {createApi} from '../../apps/api/src/server.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import type {ApiOptions} from '../../apps/api/src/types.js';
import type {ProviderRequest,ProviderOutcome} from '../../apps/api/src/modules/ai/provider-runtime.js';
import type {VerifiedActor} from '../../apps/api/src/types.js';
const NOW='2026-11-03T00:00:00Z',ORIGIN='https://example.test',id='00000000-0000-4000-8000-000000000001';
const actor={actorId:'SYN-ACTOR',sessionIdHash:'SYN-SESSION-HASH',role:'BETA' as const,betaAllowed:true,csrfToken:'C'.repeat(32),
  sessionExpiresAt:'2026-11-04T00:00:00Z',schoolMailProofExpiresAt:'2026-11-04T00:00:00Z'};
const headers={cookie:'SYN',origin:ORIGIN,'x-csrf-token':actor.csrfToken};
const apps:ReturnType<typeof createApi>[]=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(a=>a.close()));});
function fixture(){
  const execute=vi.fn(async(_request:ProviderRequest):Promise<ProviderOutcome>=>({state:'NEEDS_REVIEW',billing:'SETTLED',jobId:id,candidate:{reviewState:'NEEDS_REVIEW'},provenance:'LIVE'}));
  const readJob=vi.fn(async(_actor:VerifiedActor,_jobId:string)=>({state:'NEEDS_REVIEW' as const,billing:'SETTLED' as const,jobId:id,candidate:{reviewState:'NEEDS_REVIEW'},provenance:'CANDIDATE_CACHE' as const}));
  const verify=vi.fn(async()=>actor);
  const options={repository:new MemoryApiRepository({profiles:[],safePackets:[]}),allowedOrigin:ORIGIN,verifySession:verify,now:()=>NOW,
    realAi:{phaseId:'SYN-PHASE',operation:'HCX_007' as const,executor:{execute,readJob}}};
  const app=createApi(options as unknown as ApiOptions);apps.push(app);return {app,execute,readJob,verify};
}
describe('explicit real provider API wiring',()=>{
  it('passes only server phase/actor/model plus approved packet ref/task/asOf to the executor',async()=>{
    const f=fixture(),r=await f.app.inject({url:'/api/ai/opportunity-terms',method:'POST',headers,
      payload:{packetRef:'INPUT1',idempotencyKey:'KEY00001',asOf:NOW}});
    expect(r.statusCode).toBe(202);expect(r.json()).toMatchObject({jobId:id,state:'NEEDS_REVIEW',provenance:'LIVE'});
    expect(f.execute.mock.calls[0]?.[0]).toMatchObject({actor,operation:'HCX_007',phaseId:'SYN-PHASE',inputRef:'INPUT1',
      idempotencyKey:'KEY00001',asOf:NOW,task:'opportunity_terms'});
  });
  it('requires asOf and rejects forged phase/model/actor before provider execution',async()=>{
    for(const payload of [{packetRef:'INPUT1',idempotencyKey:'KEY00001'},
      {packetRef:'INPUT1',idempotencyKey:'KEY00001',asOf:NOW,phaseId:'FORGED'}]){
      const f=fixture(),r=await f.app.inject({url:'/api/ai/opportunity-terms',method:'POST',headers,payload});
      expect(r.statusCode).toBe(422);expect(f.execute).not.toHaveBeenCalled();
    }
  });
  it('loads persisted jobs through current session ownership and returns cache provenance',async()=>{
    const f=fixture(),r=await f.app.inject({url:'/api/ai/jobs/'+id,headers:{cookie:'SYN'}});
    expect(r.statusCode).toBe(200);expect(r.json()).toMatchObject({jobId:id,provenance:'CANDIDATE_CACHE'});
    expect(f.readJob.mock.calls[0]).toEqual([actor,id]);expect(r.headers['cache-control']).toContain('no-store');
  });
  it('never falls back to mock when explicit provider runtime cannot execute',async()=>{
    const f=fixture();f.execute.mockResolvedValueOnce({state:'UNAVAILABLE',billing:'UNKNOWN_BILLING',jobId:id} as never);
    const r=await f.app.inject({url:'/api/ai/opportunity-terms',method:'POST',headers,
      payload:{packetRef:'INPUT1',idempotencyKey:'KEY00001',asOf:NOW}});
    expect(r.statusCode).toBe(503);expect(r.json().code).toBe('PROVIDER_UNAVAILABLE');
  });
  it('does not invent LIVE provenance for a pending job with no result',async()=>{
    const f=fixture();f.execute.mockResolvedValueOnce({state:'PENDING',billing:'RESERVED',jobId:id});
    const r=await f.app.inject({url:'/api/ai/opportunity-terms',method:'POST',headers,
      payload:{packetRef:'INPUT1',idempotencyKey:'KEY00001',asOf:NOW}});
    expect(r.statusCode).toBe(202);expect(r.json()).toEqual({jobId:id,state:'PENDING'});
    expect(r.json()).not.toHaveProperty('provenance');
  });
});
