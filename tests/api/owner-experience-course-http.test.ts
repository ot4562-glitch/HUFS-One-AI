import {afterEach,describe,expect,it,vi} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import type {TrustedExperienceCourseSource} from '../../apps/api/src/modules/owner-experience-course-http.js';
import {closedRepository} from '../../apps/api/src/repository.js';

const NOW='2026-11-09T00:00:00Z';
const actor={role:'BETA' as const,actorId:'SYN-OWNER',sessionIdHash:'H'.repeat(32),
  csrfToken:'C'.repeat(32),betaAllowed:true,sessionExpiresAt:'2026-12-01T00:00:00Z',
  schoolMailProofExpiresAt:'2026-12-01T00:00:00Z'};
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(app=>app.close()));});

const currentAccess={state:'SHARED' as const,grantVersion:'GRANT1',transcriptVersion:'TRANS1',
  attempts:[{attemptToken:'SYN-A1',canonicalCourseId:'SYN-COURSE-1',creditUnits:6,
    ledger:'EARNED' as const,areaIds:[],recognition:'RECOGNIZED' as const,term:'2025-2'}]};
const links=[{experienceId:'SYN-EX-1',canonicalCourseId:'SYN-COURSE-1',
  provenance:'STUDENT_CONFIRMED' as const,experienceContentVersion:1,
  grantVersion:'GRANT1',confirmedTerm:'2025-2',confirmedAt:'2026-01-15T00:00:00Z'}];
function fixture(enabled=true){
  let actorId=actor.actorId,allowed=true,role='BETA';
  const port:TrustedExperienceCourseSource={
    read:vi.fn(async()=>({access:currentAccess,experiences:[{experienceId:'SYN-EX-1',contentVersion:1}],
      links,receipt:{actorId:actor.actorId,grantVersion:'GRANT1',transcriptVersion:'TRANS1',
        expiresAt:'2026-11-30T00:00:00Z'}})),
    revalidate:vi.fn(async()=>allowed),
  };
  const app=createIntegratedApi({allowedOrigin:'https://synthetic.invalid',repository:closedRepository,now:()=>NOW,
    auth:{verifySession:async()=>({...actor,actorId,role:role as 'BETA'}),revokeSession:async()=>{}},
    ...(enabled?{ownerExperienceCourse:port}:{})});
  apps.push(app);
  return {app,port,read:()=>app.inject({url:'/api/owner/academics/experience-courses'}),
    revoke:()=>{allowed=false;},actorSwitch:()=>{actorId='SYN-OTHER';},asAdmin:()=>{role='ADMIN';}};
}
describe('#375 current academic purpose grant and owner-linked evidence',()=>{
  it('reads only reviewed current canonical courses and owner-confirmed experience links',async()=>{
    const h=fixture(),r=await h.read();
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.json()).toMatchObject({state:'SHARED',basis:'STUDENT_SUBMITTED_TRANSCRIPT',
      transcriptVersion:'TRANS1',courses:[{canonicalCourseId:'SYN-COURSE-1',state:'TAKEN'}],
      links:[{state:'LINKED',experienceId:'SYN-EX-1',canonicalCourseId:'SYN-COURSE-1'}]});
    expect(h.port.revalidate).toHaveBeenCalledOnce();
    expect(r.body).not.toContain('SYN-A1');
  });
  it('does not return bogus empty courses when operator grant source is absent',async()=>{
    const h=fixture(false),r=await h.read();
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({state:'NOT_CONNECTED',asOf:NOW});
    expect(h.port.read).not.toHaveBeenCalled();
  });
  it('refuses stale grant/links and revoked sharing after current rights check',async()=>{
    const h=fixture();
    h.port.read=vi.fn(async()=>({access:{state:'SHARED' as const,grantVersion:'GRANT2',transcriptVersion:'TRANS1',attempts:[]},
      experiences:[],links:[],receipt:{actorId:actor.actorId,grantVersion:'GRANT1',
        transcriptVersion:'TRANS1',expiresAt:'2026-11-30T00:00:00Z'}}));
    expect((await h.read()).statusCode).toBe(503);
    const ok=fixture();ok.revoke();
    expect((await ok.read()).statusCode).toBe(403);
  });
  it('never exposes academic course IDs to non-BETA sessions',async()=>{
    const h=fixture();h.asAdmin();
    const r=await h.read();
    expect(r.statusCode).toBe(403);
    expect(r.body).not.toContain('SYN-COURSE-1');
  });
});
