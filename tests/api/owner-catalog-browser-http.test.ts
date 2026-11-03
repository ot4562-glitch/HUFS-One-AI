import {afterEach,describe,expect,it} from 'vitest';
import {CourseCatalogPageSchema,CourseOfferingsPageSchema,OpportunityCatalogPageSchema} from '@hufs-one/contracts';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {HufsApiClient} from '../../apps/web/src/integrations/api-client.js';
import {OwnerSessionController} from '../../apps/web/src/app/owner-session-controller.js';
import type {TrustedCatalogPort} from '../../apps/api/src/modules/opportunities/owner-catalog-http.js';
import type {VerifiedActor} from '../../apps/api/src/types.js';

const asOf='2026-11-03T00:00:00.000Z',origin='https://synthetic.invalid';
const beta={role:'BETA' as const,actorId:'SYN-OWNER',sessionIdHash:'H'.repeat(32),
  csrfToken:'C'.repeat(32),betaAllowed:true,sessionExpiresAt:'2026-12-01T00:00:00.000Z',
  schoolMailProofExpiresAt:'2026-12-01T00:00:00.000Z'};
const source={sourceId:'SYN-SOURCE',revisionId:'SYN-REV',
  permissionRef:'SYN-PERM',status:'SYNTHETIC' as const};
const apps:ReturnType<typeof createIntegratedApi>[]=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(x=>x.close()));});
function harness(withCatalog=true){
  let actor:VerifiedActor|null=beta,allowed=true,swap=false,reads=0;
  const catalog:TrustedCatalogPort={
    readTranscript:async()=>null,
    listCourses:async input=>{
      reads++;
      if(swap)actor={...beta,actorId:'SYN-OTHER'};
      return {scopeToken:'SYN-CURRENT-RECEIPT',result:CourseCatalogPageSchema.parse({
        asOf:input.asOf,nextCursor:null,items:[{courseId:'SYN-COURSE-A',
          courseCode:'SYN-101',title:'가상 데이터 수업',campus:'SEOUL',creditUnits:6,source}],
      })};
    },
    listOfferings:async input=>({scopeToken:'SYN-CURRENT-RECEIPT',
      result:CourseOfferingsPageSchema.parse({asOf:input.asOf,nextCursor:null,
        items:[{courseId:input.courseId,term:'2027-1',status:'UNKNOWN',source}]})}),
    listOpportunities:async input=>({scopeToken:'SYN-CURRENT-RECEIPT',
      result:OpportunityCatalogPageSchema.parse({asOf:input.asOf,nextCursor:null,items:[]})}),
    getOpportunity:async()=>null,
    revalidate:async()=>allowed,
  };
  const app=createIntegratedApi({allowedOrigin:origin,
    repository:new MemoryApiRepository({profiles:[]}),
    auth:{verifySession:async()=>actor,revokeSession:async()=>{actor=null;}},
    now:()=>asOf,...(withCatalog?{ownerCatalog:catalog}:{})});
  apps.push(app);
  const client=new HufsApiClient(async(url,init)=>{
    const headers:Record<string,string>={};
    new Headers(init.headers).forEach((v,k)=>{headers[k]=v;});
    const result=await app.inject({method:init.method??'GET',url,
      headers:{...headers,origin,cookie:'SYNTHETIC-SESSION'},
      ...(init.body===undefined?{}:{payload:JSON.parse(String(init.body))})});
    return new Response(result.body,{status:result.statusCode,headers:{'content-type':'application/json'}});
  });
  return {client,reads:()=>reads,revoke:()=>{allowed=false;},switchDuringRead:()=>{swap=true;},
    actor:(next:VerifiedActor|null)=>{actor=next;}};
}
describe('#27 BETA approved catalog HTTP ↔ browser typed contract',()=>{
  it('reads only current owner courses/offerings and no actor-scoped query tokens',async()=>{
    const f=harness(),scope=new OwnerSessionController(f.client);
    await scope.initialize();expect(scope.getState().status).toBe('READY');
    const courses=await scope.runLatest('owner-courses',s=>f.client.owner.listCourses({limit:20},s));
    expect(courses?.items).toMatchObject([{courseId:'SYN-COURSE-A',creditUnits:6}]);
    expect(courses?.asOf).toBe(asOf);
    const offerings=await scope.runLatest('owner-offerings',s=>
      f.client.owner.listCourseOfferings('SYN-COURSE-A',{limit:20,asOf},s));
    expect(offerings?.items[0]).toMatchObject({status:'UNKNOWN'});
    expect(f.reads()).toBe(1);
  });
  it('denies absent approved catalog and current permission withdrawal with no synthetic fallback',async()=>{
    await expect(harness(false).client.owner.listCourses()).rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE'});
    const f=harness();f.revoke();
    await expect(f.client.owner.listCourses()).rejects.toMatchObject({code:'FORBIDDEN'});
  });
  it('discards private results if session changes during awaited catalog reads',async()=>{
    const f=harness();f.switchDuringRead();
    await expect(f.client.owner.listCourses()).rejects.toMatchObject({code:'FORBIDDEN'});
    expect(f.reads()).toBe(1);
    f.actor(null);
    await expect(f.client.owner.listCourses()).rejects.toMatchObject({code:'UNAUTHENTICATED'});
  });
});
