import {afterEach,describe,expect,it,vi} from 'vitest';
import {createApi} from '../../apps/api/src/server.js';
import {closedRepository} from '../../apps/api/src/repository.js';
import {createPostgresTemporalGateway} from
  '../../apps/api/src/modules/opportunities/temporal-gateway.js';

const NOW='2026-10-31T00:00:00.000Z';
const ACTOR={
  actorId:'synthetic-beta-actor',role:'BETA' as const,
  sessionIdHash:'H'.repeat(30),csrfToken:'C'.repeat(32),
  sessionExpiresAt:'2026-11-05T00:00:00.000Z',
  schoolMailProofExpiresAt:'2026-11-03T00:00:00.000Z',betaAllowed:true,
};
const envelope=(asOf:string)=>({
  queryVersion:'query-1',asOf,sourceRevisionIds:['rev-01'],
  permissionPolicyVersion:'server-policy-v1',
  retrievalConfigVersion:'pg-lexical-v1',retrievalState:'READY' as const,
  evidence:[{kind:'TEXT' as const,sourceRevisionId:'rev-01',
    paragraphId:'p1',startCodePoint:0,endCodePoint:4,quote:'합성공고'}],
});
const apps:Array<ReturnType<typeof createApi>>=[];
afterEach(async()=>{await Promise.all(apps.map(a=>a.close()));apps.length=0;});
describe('TASK-21 public REST Temporal RAG boundary (synthetic only)',()=>{
  function setup(options:{
    withEvidence?:boolean;role?:'BETA'|'REVIEWER';
    mismatch?:boolean;
  }={}){
    const call=vi.fn(async(input:{actor:unknown;query:string;asOf:string;topK:number;now:string})=>({
      envelope:envelope(options.mismatch?'2025-01-01T00:00:00.000Z':input.asOf),
      hits:[],
    }));
    const app=createApi({
      repository:closedRepository,allowedOrigin:'https://example.test',
      now:()=>NOW,
      verifySession:async(req)=>req.headers.cookie==='trusted-session'
        ?options.role==='REVIEWER'?{
          actorId:'other',role:'REVIEWER' as const,
          sessionIdHash:'H'.repeat(30),csrfToken:'C'.repeat(32),
          sessionExpiresAt:ACTOR.sessionExpiresAt,
          identityProofExpiresAt:ACTOR.sessionExpiresAt,
          verifiedEmail:'judge@example.org',
        }:ACTOR
        :null,
      ...(options.withEvidence?{temporalEvidence:{query:call}}:{}),
    });
    apps.push(app);
    return {app,call};
  }
  it('requires verified server session, denies forged browser headers',async()=>{
    const {app,call}=setup({withEvidence:true});
    const r=await app.inject({url:'/api/evidence/search?q=synthetic',
      headers:{'x-actor-id':ACTOR.actorId}});
    expect(r.statusCode).toBe(401);
    expect(call).not.toHaveBeenCalled();
  });
  it('rejects REVIEWER identity even if the evidence adapter is present',async()=>{
    const {app,call}=setup({withEvidence:true,role:'REVIEWER'});
    const r=await app.inject({url:'/api/evidence/search?q=synthetic',
      headers:{cookie:'trusted-session'}});
    expect(r.statusCode).toBe(403);
    expect(call).not.toHaveBeenCalled();
  });
  it('keeps route fail-closed without explicitly configured provider',async()=>{
    const {app}=setup();
    const r=await app.inject({url:'/api/evidence/search?q=synthetic',
      headers:{cookie:'trusted-session'}});
    expect(r.statusCode).toBe(503);
  });
  it('never accepts browser permissionRefs, actorId or future asOf',async()=>{
    const {app,call}=setup({withEvidence:true});
    for(const url of [
      '/api/evidence/search?q=abc&permissionRefs=free',
      '/api/evidence/search?q=abc&actorId=victim',
      '/api/evidence/search?q=abc&asOf=2026-11-01T00:00:00.000Z',
      '/api/evidence/search?q=a',
      '/api/evidence/search?q=abc&topK=13',
    ]){
      const r=await app.inject({url,headers:{cookie:'trusted-session'}});
      expect(r.statusCode).toBe(422);
    }
    expect(call).not.toHaveBeenCalled();
  });
  it('binds query to verified actor and caps topK with no-store response',async()=>{
    const {app,call}=setup({withEvidence:true});
    const r=await app.inject({url:'/api/evidence/search?q=synthetic&topK=2',
      headers:{cookie:'trusted-session'}});
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.json().retrievalState).toBe('READY');
    expect(call).toHaveBeenCalledOnce();
    expect(call.mock.calls[0]?.[0]).toMatchObject({
      actor:ACTOR,query:'synthetic',topK:2,asOf:NOW,now:NOW,
    });
  });
  it('rejects fake provider envelope from the wrong historical asOf',async()=>{
    const {app}=setup({withEvidence:true,mismatch:true});
    const r=await app.inject({url:'/api/evidence/search?q=synthetic',
      headers:{cookie:'trusted-session'}});
    expect(r.statusCode).toBe(503);
    expect(r.json().code).toBe('PROVIDER_UNAVAILABLE');
  });
});

describe('TASK-21 live permission resolver binds current rights to past replay',()=>{
  it('returns NO_EVIDENCE after revoke, never calls SQL with a stale grant',async()=>{
    let enabled=true;
    const reader={retrieve:vi.fn(async()=>{
      return {envelope:envelope(NOW),hits:[{
        sourceId:'source-1',revisionId:'rev-01',
        paragraphId:'p1',quote:'합성공고',score:2,
      }]};
    })};
    const gateway=createPostgresTemporalGateway(reader,{
      resolveFor:async()=>enabled?{
        permissionRefs:new Set(['P-1']),policyVersion:'policy-v2',
      }:{
        permissionRefs:new Set<string>(),policyVersion:'policy-revoked',
      },
    });
    const first=await gateway.query({actor:ACTOR,query:'abc',asOf:NOW,topK:12,now:NOW});
    expect(first.envelope.permissionPolicyVersion).toBe('policy-v2');
    expect(reader.retrieve).toHaveBeenCalledOnce();
    enabled=false;
    const revoked=await gateway.query({actor:ACTOR,query:'abc',asOf:NOW,topK:12,now:NOW});
    expect(revoked.envelope.retrievalState).toBe('NO_EVIDENCE');
    expect(revoked.envelope.evidence).toEqual([]);
    expect(reader.retrieve).toHaveBeenCalledOnce();
  });
  it('drops quotes if permissions are revoked during an in-flight SQL query',async()=>{
    const rights=new Set(['P-1']);
    const reader={retrieve:vi.fn(async()=>{
      rights.clear();
      return {envelope:envelope(NOW),hits:[{
        sourceId:'source-1',revisionId:'rev-01',
        paragraphId:'p1',quote:'합성공고',score:2,
      }]};
    })};
    const resolveFor=vi.fn(async()=>({
      permissionRefs:rights,policyVersion:'policy-v1',
    }));
    const gateway=createPostgresTemporalGateway(reader,{resolveFor});
    const value=await gateway.query({
      actor:ACTOR,query:'abc',asOf:NOW,topK:12,now:NOW,
    });
    expect(value.envelope.retrievalState).toBe('NO_EVIDENCE');
    expect(value.hits).toEqual([]);
    expect(resolveFor).toHaveBeenCalledTimes(2);
  });
  it('drops results if the source scope changes during an in-flight query',async()=>{
    const sourceIds=new Set(['source-1']);
    const reader={retrieve:vi.fn(async()=>{
      sourceIds.clear();
      return {envelope:envelope(NOW),hits:[{
        sourceId:'source-1',revisionId:'rev-01',
        paragraphId:'p1',quote:'합성공고',score:2,
      }]};
    })};
    const gateway=createPostgresTemporalGateway(reader,{
      resolveFor:async()=>({
        permissionRefs:new Set(['P-1']),sourceIds,policyVersion:'policy-v1',
      }),
    });
    const result=await gateway.query({
      actor:ACTOR,query:'abc',asOf:NOW,topK:12,now:NOW,
    });
    expect(result.envelope.retrievalState).toBe('NO_EVIDENCE');
    expect(result.envelope.evidence).toEqual([]);
  });
  it('rejects a reader that returns different quotes than its validated spans',async()=>{
    const reader={retrieve:vi.fn(async()=>({
      envelope:envelope(NOW),hits:[{
        sourceId:'source-1',revisionId:'rev-01',
        paragraphId:'p1',quote:'forged quote',score:2,
      }],
    }))};
    const gateway=createPostgresTemporalGateway(reader,{
      resolveFor:async()=>({
        permissionRefs:new Set(['P-1']),policyVersion:'policy-v1',
      }),
    });
    await expect(gateway.query({
      actor:ACTOR,query:'abc',asOf:NOW,topK:12,now:NOW,
    })).rejects.toThrow(/mismatch/);
  });
  it('does not accept future asOf even if a caller bypassed Fastify',async()=>{
    const reader={retrieve:vi.fn()};
    const gateway=createPostgresTemporalGateway(reader,{
      resolveFor:async()=>({permissionRefs:new Set(['P-1']),policyVersion:'policy-v1'}),
    });
    await expect(gateway.query({
      actor:ACTOR,query:'abc',asOf:'2026-11-01T00:00:00.000Z',topK:12,now:NOW,
    })).rejects.toThrow(/Future/);
    expect(reader.retrieve).not.toHaveBeenCalled();
  });
});
