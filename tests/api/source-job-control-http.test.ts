import {afterEach,describe,expect,it,vi} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {closedRepository} from '../../apps/api/src/repository.js';
import {createPostgresPlatformServices} from '../../apps/api/src/platform-postgres.js';
import {SourceQueueDenied,SourceQueueCapacity,SourceQueueConflict} from '../../apps/api/src/modules/opportunities/source-ingestion-queue-postgres.js';
const now='2026-11-04T00:00:00.000Z',origin='https://synthetic.invalid';
const actor={actorId:'SYN-OPERATOR',role:'BETA' as const,sessionIdHash:'S'.repeat(32),csrfToken:'C'.repeat(32),betaAllowed:true,
  sessionExpiresAt:'2026-12-01T00:00:00.000Z',schoolMailProofExpiresAt:'2026-12-01T00:00:00.000Z'};
const jobId='5e349658-7e58-4ba3-9353-49eea646cefb';
const status={jobId,sourceId:'SYN-SOURCE',state:'PENDING',attemptCount:0,queuedAt:now,updatedAt:now,observedAt:now,requiresOperatorReview:false};
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(app=>app.close()));});
function fixture(configured=true){
  let identity:typeof actor|null=actor;
  const queue={enqueue:vi.fn(async()=>({jobId,created:true})),inspect:vi.fn(async()=>status),runOne:vi.fn()};
  const authority={mayManage:vi.fn(async()=>true)};
  const app=createIntegratedApi({allowedOrigin:origin,repository:closedRepository,now:()=>now,
    auth:{verifySession:async()=>identity,revokeSession:async()=>{}},
    ...(configured?{sourceIngestionControl:{queue,authority}}:{})} as any);apps.push(app);
  const headers={origin,'x-csrf-token':actor.csrfToken};
  return {app,queue,authority,headers,logout:()=>{identity=null;}};
}
describe('explicit operator source job HTTP control',()=>{
  it('queues only a server-bound actor and provides no-store status without dispatch',async()=>{
    const f=fixture(),input={sourceId:'SYN-SOURCE',permissionRef:'SYN-PERM',requestKey:'SYN-REQUEST'};
    const response=await f.app.inject({method:'POST',url:'/api/operator/source-jobs',headers:f.headers,payload:input});
    expect(response.statusCode,response.body).toBe(202);expect(response.json()).toEqual({jobId,created:true});
    expect(f.queue.enqueue).toHaveBeenCalledWith({...input,actorRef:actor.actorId});
    const found=await f.app.inject({url:`/api/operator/source-jobs/${jobId}?sourceId=SYN-SOURCE&permissionRef=SYN-PERM`});
    expect(found.statusCode,found.body).toBe(200);expect(found.json()).toEqual(status);expect(found.headers['cache-control']).toBe('no-store');
    expect(f.queue.runOne).not.toHaveBeenCalled();
  });
  it('is disabled by default and rejects absent session before accessing queue',async()=>{
    const f=fixture(false);expect((await f.app.inject({url:`/api/operator/source-jobs/${jobId}?sourceId=SYN-SOURCE&permissionRef=SYN-PERM`})).statusCode).toBe(503);
    f.logout();expect((await f.app.inject({url:`/api/operator/source-jobs/${jobId}?sourceId=SYN-SOURCE&permissionRef=SYN-PERM`})).statusCode).toBe(401);
    expect(f.queue.inspect).not.toHaveBeenCalled();
  });
  it('denies ordinary BETA operator access before touching a job and enforces CSRF',async()=>{
    const f=fixture();f.authority.mayManage.mockResolvedValue(false);
    expect((await f.app.inject({url:`/api/operator/source-jobs/${jobId}?sourceId=SYN-SOURCE&permissionRef=SYN-PERM`})).statusCode).toBe(403);
    expect(f.queue.inspect).not.toHaveBeenCalled();
    f.authority.mayManage.mockResolvedValue(true);
    expect((await f.app.inject({method:'POST',url:'/api/operator/source-jobs',payload:{sourceId:'SYN-SOURCE',permissionRef:'SYN-PERM',requestKey:'SYN-KEY'}})).statusCode).toBe(403);
    expect(f.queue.enqueue).not.toHaveBeenCalled();
  });
  it('rejects client identity/raw source/URL claims and malformed scope',async()=>{
    for(const extra of [{actorRef:'SYN-OTHER'},{actorId:'SYN-OTHER'},{url:'https://synthetic.invalid/raw'},{text:'SYN-PRIVATE'}]){
      const f=fixture(),response=await f.app.inject({method:'POST',url:'/api/operator/source-jobs',headers:f.headers,
        payload:{sourceId:'SYN-SOURCE',permissionRef:'SYN-PERM',requestKey:'SYN-KEY',...extra}});
      expect(response.statusCode).toBe(422);expect(f.queue.enqueue).not.toHaveBeenCalled();
    }
  });
  it('rechecks logout and operator withdrawal after asynchronous queue access',async()=>{
    const f=fixture();f.queue.inspect.mockImplementation(async()=>{f.logout();return status;});
    expect((await f.app.inject({url:`/api/operator/source-jobs/${jobId}?sourceId=SYN-SOURCE&permissionRef=SYN-PERM`})).statusCode).toBe(401);
    const g=fixture();g.queue.inspect.mockImplementation(async()=>{g.authority.mayManage.mockResolvedValue(false);return status;});
    expect((await g.app.inject({url:`/api/operator/source-jobs/${jobId}?sourceId=SYN-SOURCE&permissionRef=SYN-PERM`})).statusCode).toBe(403);
  });
  it('does not expose malformed/private storage fields, other job IDs or provider errors',async()=>{
    for(const bad of [{...status,actorRef:'SYN-PRIVATE'},{...status,jobId:'75d33017-9c9e-46ed-917f-1c14efa17089'},{...status,state:'NEW_DRAFT'}]){
      const f=fixture();f.queue.inspect.mockResolvedValue(bad as typeof status);
      const response=await f.app.inject({url:`/api/operator/source-jobs/${jobId}?sourceId=SYN-SOURCE&permissionRef=SYN-PERM`});
      expect(response.statusCode).toBe(503);expect(response.body).not.toContain('SYN-PRIVATE');
    }
    const f=fixture();f.queue.inspect.mockRejectedValue(new Error('SYN-SECRET-SQL'));
    const response=await f.app.inject({url:`/api/operator/source-jobs/${jobId}?sourceId=SYN-SOURCE&permissionRef=SYN-PERM`});
    expect(response.statusCode).toBe(503);expect(response.body).not.toContain('SYN-SECRET-SQL');
  });
  it('keeps independent operator checks in the worker authority and requires explicit configuration',async()=>{
    const pool={connect:vi.fn()},sourceAuthority={mayProcess:vi.fn(async()=>true)},executor={execute:vi.fn()},operator={mayManage:vi.fn(async()=>false)};
    const config={pools:{projections:pool,calendar:pool,personal:pool,evidence:pool},evidenceRights:{resolveFor:async()=>null},now:()=>now};
    expect(createPostgresPlatformServices(config).sourceIngestionControl).toBeUndefined();
    expect(()=>createPostgresPlatformServices({...config,sourceIngestionOperator:operator})).toThrow('explicit queue');
    const ports=createPostgresPlatformServices({...config,sourceIngestion:{pool,authority:sourceAuthority,executor},sourceIngestionOperator:operator});
    expect(ports.sourceIngestionControl?.queue).toBe(ports.sourceIngestion);
    await expect(ports.sourceIngestion!.enqueue({actorRef:actor.actorId,sourceId:'SYN-SOURCE',permissionRef:'SYN-PERM',requestKey:'SYN-KEY'})).rejects.toThrow();
    expect(pool.connect).not.toHaveBeenCalled();expect(sourceAuthority.mayProcess).not.toHaveBeenCalled();
  });
  it('returns idempotent replay and bounded semantic errors without redispatch',async()=>{
    const f=fixture();f.queue.enqueue.mockResolvedValue({jobId,created:false});
    const request={method:'POST' as const,url:'/api/operator/source-jobs',headers:f.headers,payload:{sourceId:'SYN-SOURCE',permissionRef:'SYN-PERM',requestKey:'SYN-KEY'}};
    const replay=await f.app.inject(request);expect(replay.statusCode).toBe(200);expect(replay.json()).toEqual({jobId,created:false});
    for(const [error,code] of [[new SourceQueueDenied(),403],[new SourceQueueCapacity(),429],[new SourceQueueConflict(),409]] as const){
      f.queue.enqueue.mockRejectedValueOnce(error);expect((await f.app.inject(request)).statusCode).toBe(code);
    }
    expect(f.queue.runOne).not.toHaveBeenCalled();
  });
});
