import {afterEach,describe,expect,it,vi} from 'vitest';
import {createApi} from '../../apps/api/src/server.js';
import {closedRepository} from '../../apps/api/src/repository.js';
import type {AdminUsageReport} from '../../apps/api/src/modules/admin/usage.js';

const NOW='2026-11-05T00:00:00.000Z',ORIGIN='https://example.test';
const admin={actorId:'SYN-ADMIN',role:'ADMIN' as const,sessionIdHash:'H'.repeat(32),
  csrfToken:'C'.repeat(32),betaAllowed:true,sessionExpiresAt:'2026-11-07T00:00:00.000Z',
  schoolMailProofExpiresAt:'2026-11-07T00:00:00.000Z'};
const report=():AdminUsageReport=>({
  asOf:NOW,status:'READY',unit:'MICRO_KRW',tokenCount:null,errorCount:null,
  metricCoverage:{tokens:'NOT_COLLECTED',errors:'NOT_COLLECTED'},
  phases:[{phaseId:'SYN-PHASE',enabled:false,
    startsAt:'2026-11-01T00:00:00.000Z',endsAt:'2026-11-30T00:00:00.000Z',
    maxUnits:'1000000',actorMaxUnits:'100000',maxAttempts:20,actorMaxAttempts:2,
    reservedUnits:'100',chargedUnits:'9007199254740993',attempts:1,
    jobs:{reserved:'1',dispatched:'0',unknownBilling:'0',released:'0',settled:'1'}}],
});
const apps:Array<ReturnType<typeof createApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(app=>app.close()));});
function setup(role:'ADMIN'|'BETA'|null='ADMIN',includeReader=true,includeAuthority=true){
  const read=vi.fn(async()=>report());
  const approved=vi.fn(async()=>true);
  const app=createApi({repository:closedRepository,allowedOrigin:ORIGIN,now:()=>NOW,
    verifySession:async()=>role?{...admin,role}:null,
    ...(includeAuthority?{adminAuthority:{isApproved:approved}}:{}),
    ...(includeReader?{adminUsage:{read}}:{})});
  apps.push(app);
  const run=(url='/api/admin/usage')=>app.inject({url});
  return {app,run,read,approved};
}
describe('read-only ADMIN usage summary (#27)',()=>{
  it('denies anonymous/BETA/non-approved ADMIN before any ledger read',async()=>{
    for(const [role,hasAuthority,status] of [
      [null,true,401],['BETA',true,403],['ADMIN',false,403],
    ] as const){
      const h=setup(role,true,hasAuthority);
      expect((await h.run()).statusCode).toBe(status);
      expect(h.read).not.toHaveBeenCalled();
    }
  });
  it('returns only validated budget aggregate and explicit missing telemetry',async()=>{
    const h=setup();
    const res=await h.run();
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json()).toEqual(report());
    expect(h.read).toHaveBeenCalledWith({actorId:admin.actorId,now:NOW});
    expect(JSON.stringify(res.json())).not.toContain('request_sha256');
    expect(res.json().tokenCount).toBeNull();
  });
  it('is unavailable without a supplied read-only port',async()=>{
    const h=setup('ADMIN',false);
    const res=await h.run();
    expect(res.statusCode).toBe(503);
  });
  it('rejects browser selection of actor, phase and query scope',async()=>{
    const h=setup();
    const res=await h.run('/api/admin/usage?actorId=SYN-OTHER&phaseId=SYN-PHASE');
    expect(res.statusCode).toBe(422);expect(h.read).not.toHaveBeenCalled();
  });
  it('refuses malformed, future or fabricated telemetry',async()=>{
    for(const bad of [
      {...report(),tokenCount:0},
      {...report(),errorCount:0},
      {...report(),asOf:'2026-11-06T00:00:00.000Z'},
      {...report(),phases:[{...report().phases[0],privateActor:'SYN-STUDENT'}]},
      {...report(),phases:[],status:'READY'},
    ]){
      const h=setup();
      h.read.mockImplementation(async()=>bad as AdminUsageReport);
      const res=await h.run();
      expect(res.statusCode).toBe(503);
    }
  });
  it('rechecks an independently approved admin session after asynchronous reading',async()=>{
    let approved=true;
    const app=createApi({repository:closedRepository,allowedOrigin:ORIGIN,now:()=>NOW,
      verifySession:async()=>admin,adminAuthority:{isApproved:async()=>approved},
      adminUsage:{read:async()=>{approved=false;return report();}}});
    apps.push(app);
    const res=await app.inject({url:'/api/admin/usage'});
    expect(res.statusCode).toBe(403);
  });
});
