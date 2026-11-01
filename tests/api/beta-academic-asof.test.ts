import {afterEach,describe,expect,it} from 'vitest';
import {DemoProfileOptionSchema,DemoSnapshotSchema,SharingGrantSchema} from '@hufs-one/contracts';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {createApi} from '../../apps/api/src/server.js';
import profiles from '../../packages/fixtures/synthetic/demo-profiles.json';
import snapshot from '../../packages/fixtures/synthetic/demo-snapshot.json';

const NOW='2026-10-31T00:00:00.000Z',ORIGIN='https://synthetic.invalid';
const actor={actorId:'SYN-ACTOR-01',role:'BETA' as const,betaAllowed:true,
  sessionIdHash:'H'.repeat(32),csrfToken:'C'.repeat(32),
  sessionExpiresAt:'2026-11-05T00:00:00.000Z',schoolMailProofExpiresAt:'2026-11-05T00:00:00.000Z'};
const grant=SharingGrantSchema.parse({grantId:'G-SYN',actorId:actor.actorId,demoSubjectId:'S01',
  version:'G1',expiresAt:actor.sessionExpiresAt,
  allowedSections:['FEED','NOTICES','ACADEMICS','FORECAST','EXPERIENCE'],
  displayNameAllowed:false,recordingAllowed:false});
const academic=(asOf:string)=>({state:'READY' as const,rulePackVersion:'SYN-RULE-1',asOf,
  earnedCreditUnits:4,inProgressCreditUnits:2,plannedCreditUnits:0,
  deficits:[{requirementId:'SYN-REQ-1',state:'NEEDS_REVIEW' as const,evidenceRefs:[]}],
  caveats:['Synthetic only; official rule is unverified']});
const forecast=(asOf:string)=>({status:'PARTIAL' as const,asOf,items:[]});
const opened:Array<ReturnType<typeof createApi>>=[];
afterEach(async()=>{await Promise.all(opened.splice(0).map(a=>a.close()));});
async function harness(){
  const repo=new MemoryApiRepository({
    profiles:profiles.profiles.map(x=>DemoProfileOptionSchema.parse(x)),
    grants:[grant],projections:[DemoSnapshotSchema.parse(snapshot)]});
  const app=createApi({allowedOrigin:ORIGIN,repository:repo,now:()=>NOW,
    verifySession:async()=>actor});
  opened.push(app);
  const created=await app.inject({method:'POST',url:'/api/demo/contexts',
    headers:{origin:ORIGIN,'x-csrf-token':actor.csrfToken},
    payload:{demoSubjectId:'S01',demoRunId:'SYN-RUN'}});
  expect(created.statusCode).toBe(201);
  const prefix='/api/demo/contexts/'+created.json().contextId;
  return {repo,app,prefix};
}

describe('BETA non-overlay academic/forecast asOf binding',()=>{
  it('rejects a future-than-snapshot academic summary even when clock is later',async()=>{
    const h=await harness();h.repo.setProjection(DemoSnapshotSchema.parse({
      ...snapshot,academics:academic('2026-10-30T10:00:00.000Z')}));
    for(const path of ['/snapshot','/graduation']){
      const response=await h.app.inject({url:h.prefix+path});
      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('VERSION_CONFLICT');
    }
  });
  it('rejects a forecast asOf inconsistent with snapshot even though all sections are granted',async()=>{
    const h=await harness();h.repo.setProjection(DemoSnapshotSchema.parse({
      ...snapshot,forecast:forecast('2026-10-30T10:00:00.000Z')}));
    for(const path of ['/snapshot','/outlook']){
      const response=await h.app.inject({url:h.prefix+path});
      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('VERSION_CONFLICT');
    }
  });
  it('keeps same-asOf synthetic summaries available to an authorized BETA only',async()=>{
    const h=await harness();h.repo.setProjection(DemoSnapshotSchema.parse({
      ...snapshot,academics:academic(snapshot.asOf),forecast:forecast(snapshot.asOf)}));
    for(const path of ['/snapshot','/graduation','/outlook'])
      expect((await h.app.inject({url:h.prefix+path})).statusCode).toBe(200);
  });
});
