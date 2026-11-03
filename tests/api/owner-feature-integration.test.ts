import {afterEach,describe,expect,it} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import type {IntegrationDependencies} from '../../apps/api/src/integration.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {blankDemoProfileValue} from '@hufs-one/contracts';
import {recomputeDemoProfile,type DemoProfilePort} from '../../apps/api/src/modules/profiles/demo-profile.js';
import {createTrustedOwnerDoubleMajorSource} from '../../apps/api/src/modules/academics/owner-double-major-source.js';
import {doubleMajorInput} from './owner-double-major-fixture.js';

const at='2026-11-01T00:00:00.000Z',origin='https://synthetic.invalid';
const actor={role:'BETA' as const,actorId:'SYN-OWNER',sessionIdHash:'H'.repeat(32),
  csrfToken:'C'.repeat(32),betaAllowed:true,sessionExpiresAt:'2026-12-01T00:00:00Z',
  schoolMailProofExpiresAt:'2026-12-01T00:00:00Z'};
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{await Promise.all(apps.map(app=>app.close()));apps.length=0;});
const endpoints=[
  ['/api/study-plans/check',{term:'2026-2'}],
  ['/api/academics/major-what-if',{scenario:{action:'ADD_MINOR',targetMajorId:'SYN-MAJOR'}}],
  ['/api/opportunities/SYN-OPP/explanation',{asOf:at,sourceRevisionId:'SYN-REV',rankConfigVersion:'rank-v1.0'}],
  ['/api/opportunities/SYN-OPP/revisions/compare',{asOf:at,beforeRevisionId:'SYN-BEFORE',afterRevisionId:'SYN-AFTER'}],
] as const;
function setup(loggedIn=true,features:Pick<IntegrationDependencies,'studyPlanCheck'|'majorWhatIf'|'doubleMajor'|'demoProfile'>={}){
  const app=createIntegratedApi({allowedOrigin:origin,repository:new MemoryApiRepository({profiles:[]}),
    auth:{verifySession:async()=>loggedIn?actor:null,revokeSession:async()=>{}},now:()=>at,...features});
  apps.push(app);return app;
}
describe('owner feature registration does not silently enable unavailable providers',()=>{
  it('registers new owner routes as 503 with no provider and 401 without authentication',async()=>{
    const unavailable=setup();
    for(const path of ['/api/academics/double-major','/api/demo-profile'] as const){
      const response=await unavailable.inject({url:path});
      expect(response.statusCode).toBe(503);
      expect(response.json().code).toBe('PROVIDER_UNAVAILABLE');
      expect(response.headers['cache-control']).toBe('no-store');
    }
    const loggedOut=setup(false);
    for(const path of ['/api/academics/double-major','/api/demo-profile'] as const)
      expect((await loggedOut.inject({url:path})).statusCode).toBe(401);
  });
  it('wires explicit approved owner ports through one integrated authenticated API',async()=>{
    const record={version:0,value:blankDemoProfileValue(),updatedAt:null};
    const profile:DemoProfilePort={
      read:async()=>recomputeDemoProfile(record),
      save:async()=>{throw new Error('test forbids writes');},
      reset:async()=>{throw new Error('test forbids resets');},
    };
    const source=createTrustedOwnerDoubleMajorSource({snapshots:{
      load:async()=>({actorId:actor.actorId,asOf:at,receipt:'SYN-SOURCE-RECEIPT',
        projectionVersion:'SYN-PROJ-V1',input:doubleMajorInput()}),
      revalidate:async()=>true,
    }});
    const app=setup(true,{demoProfile:profile,doubleMajor:{source,rights:{
      mayInspect:async()=>true,authorize:async()=>({allowed:true,rightsReceipt:'SYN-RIGHTS-RECEIPT'}),
      revalidate:async()=>true,
    }}});
    const demo=await app.inject({url:'/api/demo-profile'});
    expect(demo.statusCode).toBe(200);
    expect(demo.json().snapshot.namespace).toBe('EMPTY_DEMO');
    const majors=await app.inject({url:'/api/academics/double-major'});
    expect(majors.statusCode).toBe(200);
    expect(majors.json()).toMatchObject({state:'NEEDS_REVIEW',selection:'SELECTED'});
    expect(majors.body).not.toContain('SYN-SOURCE-RECEIPT');
  });
  it('forwards explicit study-plan and What-if ports through the integrated server',async()=>{
    const review={state:'NEEDS_REVIEW',asOf:at,term:'2026-2',versions:{plan:'SYN-PLAN'},
      termLoadCreditUnits:0,planIssues:[],unchecked:[],evidenceLinks:[],
      caveats:['NOT_OFFICIAL_REGISTRATION','NOT_GRADUATION_DECISION','RULEPACK_UNVERIFIED'],
      disclosure:{mode:'REDACTED',visibleCourseRefs:[]}};
    const scenario={action:'ADD_MINOR',targetMajorId:'SYN-MAJOR'};
    const blocked={state:'BLOCKED_DEPENDENCY',asOf:at,scenario,
      blockers:['CALCULATION_CORE_UNAVAILABLE'],caveat:'HYPOTHETICAL_NOT_OFFICIAL'};
    const app=setup(true,{
      studyPlanCheck:{source:{inspect:async()=>({check:review,receipt:'SYN-STUDY-RECEIPT'}),
        revalidate:async()=>true},rights:{mayInspect:async()=>true,
        authorize:async()=>({allowed:true,rightsReceipt:'SYN-RIGHTS-RECEIPT'}),revalidate:async()=>true}},
      majorWhatIf:{source:{inspect:async()=>({check:blocked,receipt:'SYN-MAJOR-RECEIPT',currentVersion:'SYN-CURRENT'}),
        revalidate:async()=>true},rights:{mayInspect:async()=>true,
        authorize:async()=>({allowed:true,rightsReceipt:'SYN-RIGHTS-RECEIPT'}),revalidate:async()=>true}},
    });
    for(const [url,payload,expected] of [
      ['/api/study-plans/check',{term:'2026-2'},review],
      ['/api/academics/major-what-if',{scenario},blocked],
    ] as const){
      const response=await app.inject({method:'POST',url,
        headers:{origin,'x-csrf-token':actor.csrfToken},payload});
      expect(response.statusCode).toBe(200);expect(response.json()).toEqual(expected);
    }
  });
  it.each(endpoints)('registers %s and fails closed without trusted dependencies',async(url,payload)=>{
    const app=setup();const response=await app.inject({method:'POST',url,
      headers:{origin,'x-csrf-token':actor.csrfToken},payload});
    expect(response.statusCode).toBe(503);expect(response.json().code).toBe('PROVIDER_UNAVAILABLE');
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it.each(endpoints)('protects %s before returning provider availability',async(url,payload)=>{
    const app=setup(false);const response=await app.inject({method:'POST',url,
      headers:{origin,'x-csrf-token':actor.csrfToken},payload});
    expect(response.statusCode).toBe(401);
  });
});
