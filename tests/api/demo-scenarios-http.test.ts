import {afterEach,describe,expect,it} from 'vitest';
import {DemoProfileOptionSchema,DemoSnapshotSchema,SharingGrantSchema} from '@hufs-one/contracts';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {createApi} from '../../apps/api/src/server.js';
import profiles from '../../packages/fixtures/synthetic/demo-profiles.json';
import snapshot from '../../packages/fixtures/synthetic/demo-snapshot.json';

const NOW='2026-10-31T00:00:00.000Z',ORIGIN='https://synthetic.invalid';
const actor={actorId:'SYN-PLANNER',role:'BETA' as const,betaAllowed:true,
  sessionIdHash:'H'.repeat(32),csrfToken:'C'.repeat(32),
  sessionExpiresAt:'2026-11-05T00:00:00.000Z',
  schoolMailProofExpiresAt:'2026-11-05T00:00:00.000Z'};
const grant=SharingGrantSchema.parse({grantId:'SYN-GRANT',actorId:actor.actorId,
  demoSubjectId:'S01',version:'G-SYN',expiresAt:actor.sessionExpiresAt,
  allowedSections:['FEED','NOTICES','ACADEMICS','FORECAST','EXPERIENCE'],
  displayNameAllowed:false,recordingAllowed:false});
const headers={origin:ORIGIN,'x-csrf-token':actor.csrfToken};
const apps:Array<ReturnType<typeof createApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(app=>app.close()));});

async function setup(sections=[...grant.allowedSections]){
  const academic={state:'READY' as const,rulePackVersion:'SYN-RULE-1',asOf:snapshot.asOf,
    earnedCreditUnits:8,inProgressCreditUnits:6,plannedCreditUnits:4,
    deficits:[{requirementId:'SYN-REQ',state:'NEEDS_REVIEW' as const,evidenceRefs:[]}],
    caveats:['Synthetic calculation only']};
  const forecast={status:'PARTIAL' as const,asOf:snapshot.asOf,items:[{
    courseId:'SYN-COURSE-1',targetTerm:'2027-1',signal:'UNKNOWN' as const,
    coverage:'UNKNOWN' as const,asOf:snapshot.asOf,
    sameSeasonObservedTerms:0,sameSeasonOfferedTerms:0,evidenceRefs:[],
    caveat:'No complete published term catalog',
  }]};
  const current=DemoSnapshotSchema.parse({...snapshot,academics:academic,forecast});
  const activeGrant=SharingGrantSchema.parse({...grant,allowedSections:sections});
  const repo=new MemoryApiRepository({profiles:profiles.profiles.map(x=>DemoProfileOptionSchema.parse(x)),
    grants:[activeGrant],projections:[current]});
  let active=true;
  const app=createApi({allowedOrigin:ORIGIN,repository:repo,now:()=>NOW,
    verifySession:async()=>active?actor:null});
  apps.push(app);
  const created=await app.inject({method:'POST',url:'/api/demo/contexts',headers,
    payload:{demoSubjectId:'S01',demoRunId:'SCENARIO'}});
  expect(created.statusCode).toBe(201);
  const id=created.json().contextId as string;
  const path='/api/demo/contexts/'+id;
  const scope={expectedDatasetVersion:current.versions.dataset,
    expectedProjectionVersion:current.versions.projection,
    expectedGrantVersion:activeGrant.version,expectedAsOf:current.asOf};
  return {app,repo,path,scope,current,logout:()=>{active=false;}};
}

describe('separate demo-context plan/outlook scenario contracts',()=>{
  it('adds hypothetical planned credits only, not earned credits or official graduation status',async()=>{
    const h=await setup();
    const response=await h.app.inject({method:'POST',url:h.path+'/plans/simulate',headers,
      payload:{...h.scope,plannedCourses:[{courseId:'SYN-CS',term:'2027-1',creditUnits:6}]}});
    expect(response.statusCode).toBe(200);
    const body=response.json();
    expect(body.state).toBe('HYPOTHETICAL_ONLY');
    expect(body.current).toEqual({earnedCreditUnits:8,inProgressCreditUnits:6,plannedCreditUnits:4});
    expect(body.hypothetical).toEqual({additionalPlannedCreditUnits:6,resultingPlannedCreditUnits:10});
    expect(body).not.toHaveProperty('graduationEligible');
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('outlook scenarios never manufacture offering confirmation from a hypothetical event',async()=>{
    const h=await setup();
    const response=await h.app.inject({method:'POST',url:h.path+'/outlook/scenarios',headers,
      payload:{...h.scope,targetTerm:'2027-1',courseIds:['SYN-COURSE-1','UNKNOWN-2'],
        assumption:'POSSIBLE_STAFF_CHANGE'}});
    expect(response.statusCode).toBe(200);
    const body=response.json();
    expect(body.state).toBe('HYPOTHETICAL_ONLY');
    expect(body.items.map((x:{baselineSignal:string})=>x.baselineSignal)).toEqual(['UNKNOWN','UNKNOWN']);
    expect(body.items.every((x:{hypotheticalSignal:string})=>x.hypotheticalSignal==='NEEDS_REVIEW')).toBe(true);
  });
  it('refuses missing CSRF/origin, input spoofing, malformed credits and duplicates',async()=>{
    const h=await setup(),base={method:'POST' as const,url:h.path+'/plans/simulate',
      payload:{...h.scope,plannedCourses:[]}};
    for(const altered of [{},{origin:ORIGIN},{...headers,origin:'https://attacker.invalid'}]){
      expect((await h.app.inject({...base,headers:altered})).statusCode).toBe(403);
    }
    for(const payload of [
      {...base.payload,actorId:'SYN-OTHER'},
      {...base.payload,plannedCourses:[{courseId:'SYN',term:'2027-1',creditUnits:-1}]},
      {...base.payload,plannedCourses:[{courseId:'SYN',term:'2027-1',creditUnits:4},
        {courseId:'SYN',term:'2027-1',creditUnits:4}]},
    ])expect((await h.app.inject({...base,headers,payload})).statusCode).toBe(422);
  });
  it('denies stale context versions, missing forecast consent, and later revocation',async()=>{
    const h=await setup();
    const plan={...h.scope,plannedCourses:[]};
    const wrong=await h.app.inject({method:'POST',url:h.path+'/plans/simulate',headers,
      payload:{...plan,expectedProjectionVersion:'STALE'}});
    expect(wrong.statusCode).toBe(409);
    h.repo.setGrant({...grant,version:'REVOKED-GRANT'});
    const stale=await h.app.inject({method:'POST',url:h.path+'/plans/simulate',headers,payload:plan});
    expect(stale.statusCode).toBe(409);
    const limited=await setup(['FEED','NOTICES','ACADEMICS','EXPERIENCE']);
    const outlook=await limited.app.inject({method:'POST',url:limited.path+'/outlook/scenarios',headers,
      payload:{...limited.scope,targetTerm:'2027-1',courseIds:['SYN-CS'],assumption:'UNCHANGED'}});
    expect(outlook.statusCode).toBe(403);
    limited.logout();
    const loggedOut=await limited.app.inject({method:'POST',url:limited.path+'/plans/simulate',headers,
      payload:{...limited.scope,plannedCourses:[]}});
    expect(loggedOut.statusCode).toBe(401);
  });
});
