import {afterEach,describe,expect,it,vi} from 'vitest';
import {createApi} from '../../apps/api/src/server.js';
import {closedRepository} from '../../apps/api/src/repository.js';

const NOW='2026-11-01T00:00:00.000Z',ORIGIN='https://example.test';
const admin={actorId:'SYN-ADMIN',role:'ADMIN' as const,sessionIdHash:'H'.repeat(32),
  csrfToken:'C'.repeat(32),betaAllowed:true,sessionExpiresAt:'2026-11-03T00:00:00.000Z',
  schoolMailProofExpiresAt:'2026-11-03T00:00:00.000Z'};
const states=()=>({version:'SYN-PREFLIGHT-1',asOf:NOW,
  slots:['S01','S02','S03','S04','S05'].map(subject=>({subject,readiness:'READY',dataMode:'SYNTHETIC'})),
  checks:['AUTH','INGRESS','DATABASE','DATA_RIGHTS','PROVIDER','INDEPENDENT_REVIEW','BROWSER']
    .map(id=>({id,state:'PASS',evidenceRef:'SYN-EVIDENCE-1'})),
});
const apps:Array<ReturnType<typeof createApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(app=>app.close()));});
function setup(report:unknown=states(),role:'ADMIN'|'BETA'|null='ADMIN',current=true){
  const inspect=vi.fn(async()=>report),revalidate=vi.fn(async()=>current);
  const app=createApi({repository:closedRepository,allowedOrigin:ORIGIN,now:()=>NOW,
    adminAuthority:{isApproved:async()=>true},
    verifySession:async()=>role?{...admin,role}:null,
    demoPreflight:{inspect,revalidate} as never});
  apps.push(app);
  const run=(headers:Record<string,string>={origin:ORIGIN,'x-csrf-token':admin.csrfToken},payload:Record<string,unknown>={})=>
    app.inject({method:'POST',url:'/api/admin/demo/preflight',headers,payload});
  return {app,run,inspect,revalidate};
}

describe('ADMIN read-only demo preflight',()=>{
  it('requires authenticated ADMIN and CSRF before any inspection',async()=>{
    for(const [role,status] of [[null,401],['BETA',403]] as const){
      const h=setup(states(),role);expect((await h.run()).statusCode).toBe(status);
      expect(h.inspect).not.toHaveBeenCalled();
    }
    const h=setup();expect((await h.run({})).statusCode).toBe(403);
    expect(h.inspect).not.toHaveBeenCalled();
  });
  it('returns only a validated current manifest with no-store',async()=>{
    const h=setup();const r=await h.run();
    expect(r.statusCode).toBe(200);expect(r.headers['cache-control']).toBe('no-store');
    expect(r.json()).toEqual({...states(),readiness:'READY'});
    expect(h.inspect).toHaveBeenCalledWith({actor:admin,now:NOW});
  });
  it('keeps pending slots and unexecuted operational checks BLOCKED',async()=>{
    const data=states();data.slots[4]!.readiness='PENDING';
    data.checks[0]={id:'AUTH',state:'NOT_RUN',evidenceRef:'SYN-EVIDENCE-1'};
    const r=await setup(data).run();
    expect(r.statusCode).toBe(200);expect(r.json().readiness).toBe('BLOCKED');
    expect(r.json().checks[0].state).toBe('NOT_RUN');
  });
  it.each([
    {...states(),slots:states().slots.slice(0,4)},
    {...states(),checks:states().checks.slice(0,6)},
    {...states(),checks:states().checks.map(c=>({...c,evidenceRef:undefined}))},
    {...states(),slots:[states().slots[0],...states().slots.slice(0,4)]},
    {...states(),rawStudent:'private'},
    {...states(),asOf:'2026-11-02T00:00:00.000Z'},
  ])('rejects incomplete, private, duplicate or future manifests',async(data)=>{
    const r=await setup(data).run();expect(r.statusCode).toBe(503);
    expect(r.json()).not.toHaveProperty('rawStudent');
  });
  it('discards a manifest when its version changed during inspection',async()=>{
    const r=await setup(states(),'ADMIN',false).run();expect(r.statusCode).toBe(409);
    expect(r.json()).not.toHaveProperty('slots');
  });
  it('refuses browser-supplied release evidence or operator identity',async()=>{
    const h=setup();const r=await h.run(undefined,{actorId:'other',checks:states().checks});
    expect(r.statusCode).toBe(422);expect(h.inspect).not.toHaveBeenCalled();
  });
  it('remains unavailable without an explicitly configured read-only port',async()=>{
    const app=createApi({repository:closedRepository,allowedOrigin:ORIGIN,now:()=>NOW,verifySession:async()=>admin,
      adminAuthority:{isApproved:async()=>true}});
    apps.push(app);
    const r=await app.inject({method:'POST',url:'/api/admin/demo/preflight',payload:{},
      headers:{origin:ORIGIN,'x-csrf-token':admin.csrfToken}});
    expect(r.statusCode).toBe(503);
  });
  it('does not grant ADMIN from the ordinary session verifier alone',async()=>{
    const inspect=vi.fn(async()=>states());
    const app=createApi({repository:closedRepository,allowedOrigin:ORIGIN,now:()=>NOW,
      verifySession:async()=>admin,demoPreflight:{inspect,revalidate:async()=>true}});
    apps.push(app);
    const r=await app.inject({method:'POST',url:'/api/admin/demo/preflight',payload:{},
      headers:{origin:ORIGIN,'x-csrf-token':admin.csrfToken}});
    expect(r.statusCode).toBe(403);expect(inspect).not.toHaveBeenCalled();
  });
});
