import {afterEach,describe,expect,it} from 'vitest';
import {
  CourseCatalogPageSchema,CourseOfferingsPageSchema,
  OpportunityCatalogPageSchema,OpportunityCatalogDetailSchema,OwnerTranscriptSchema,
  OpportunitySchema,
} from '@hufs-one/contracts';
import type {TrustedCatalogPort} from
  '../../apps/api/src/modules/opportunities/owner-catalog-http.js';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';

const NOW='2026-11-01T00:00:00.000Z';
const origin='https://synthetic.invalid';
const actor={role:'BETA' as const,actorId:'SYN-CATALOG-ACTOR',
  csrfToken:'C'.repeat(32),sessionIdHash:'H'.repeat(32),
  sessionExpiresAt:'2026-11-10T00:00:00.000Z',
  schoolMailProofExpiresAt:'2026-11-10T00:00:00.000Z',betaAllowed:true};
const source={sourceId:'SYN-SRC',revisionId:'SYN-REV',permissionRef:'SYN-PERM',
  status:'SYNTHETIC' as const};
const course={courseId:'SYN-C01',courseCode:'SYN101',title:'가상학과 개론',
  campus:'SEOUL',creditUnits:6,source};
const offering={courseId:'SYN-C01',term:'2026-2',status:'UNKNOWN' as const,source};
const opportunity=OpportunitySchema.parse({
  id:'SYN-OP01',version:'v1',sourceSnapshotId:'SYN-REV',
  title:'가상 공고',organization:'가상 학교',kind:'CONTEST',
  topicCodes:['DATA_ANALYTICS'],languageCodes:[],
  eventSessions:[],actualApplicationRoute:'DEMO_DISABLED',conditions:[],
  roleSteps:[],prioritySelection:[],completionRules:[],
  dataMode:'SYNTHETIC',dataQuality:'COMPLETE',
});
const coursePage=CourseCatalogPageSchema.parse({
  asOf:NOW,nextCursor:null,items:[course],
});
const offeringPage=CourseOfferingsPageSchema.parse({
  asOf:NOW,nextCursor:null,items:[offering],
});
const oppDetail=OpportunityCatalogDetailSchema.parse({opportunity,source});
const oppPage=OpportunityCatalogPageSchema.parse({
  asOf:NOW,nextCursor:null,items:[oppDetail],
});
const transcript=OwnerTranscriptSchema.parse({
  state:'OWNER_APPROVED',sourceRevisionId:'SYN-REV',
  sourceRightsVersion:'SYN-V1',asOf:NOW,reviewedAt:'2026-10-31T00:00:00Z',
  courses:[{term:'2026-1',courseCode:'SYN101',courseName:'가상학과 개론',
    creditUnits:6,category:'합성전공',ledger:'EARNED'}],
});
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{await Promise.all(apps.map(x=>x.close()));apps.length=0;});
function fixture(){
  let latest=true,active=true,reads=0;
  const catalog:TrustedCatalogPort={
    readTranscript:async()=>{reads++;return {scopeToken:'SYN-TOKEN',result:transcript};},
    listCourses:async()=>{reads++;return {scopeToken:'SYN-TOKEN',result:coursePage};},
    listOfferings:async()=>{reads++;return {scopeToken:'SYN-TOKEN',result:offeringPage};},
    listOpportunities:async()=>{reads++;return {scopeToken:'SYN-TOKEN',result:oppPage};},
    getOpportunity:async()=>{reads++;return {scopeToken:'SYN-TOKEN',result:oppDetail};},
    revalidate:async()=>latest,
  };
  const app=createIntegratedApi({
    allowedOrigin:origin,repository:new MemoryApiRepository({profiles:[]}),
    auth:{verifySession:async()=>active?actor:null,revokeSession:async()=>{}},
    now:()=>NOW,ownerCatalog:catalog,
  });apps.push(app);
  return {app,catalog,block:()=>{latest=false;},revoke:()=>{active=false;},reads:()=>reads,
    replace:(name:keyof TrustedCatalogPort,fn:(...args:any[])=>any)=>{
      (catalog as unknown as Record<string,any>)[name]=fn;
    }};
}
describe('A13 owner catalog and academic/transcript HTTP contract',()=>{
  it('authorizes all five read endpoints with current source token and no-store',async()=>{
    const h=fixture();
    for(const [url,check] of [
      ['/api/academics/transcript','transcript'],
      ['/api/courses','items'],
      ['/api/courses/SYN-C01/offerings','items'],
      ['/api/opportunities','items'],
      ['/api/opportunities/SYN-OP01','opportunity'],
    ] as const){
      const res=await h.app.inject({url});
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.json()).toHaveProperty(check);
      expect(JSON.stringify(res.json())).not.toContain('scopeToken');
    }
    expect(h.reads()).toBe(5);
  });
  it('returns no original response after source revision or permission revocation',async()=>{
    const h=fixture();h.block();
    for(const url of ['/api/academics/transcript','/api/courses',
      '/api/courses/SYN-C01/offerings','/api/opportunities',
      '/api/opportunities/SYN-OP01']){
      const res=await h.app.inject({url});
      expect(res.statusCode).toBe(403);
      expect(JSON.stringify(res.json())).not.toContain('가상');
    }
  });
  it('prevents future replay and client-provided actor/scope or oversized pages',async()=>{
    const h=fixture();
    for(const url of ['/api/courses?asOf=2099-11-01T00:00:00.000Z',
      '/api/courses?limit=51','/api/courses?actorId=SYN-OTHER',
      '/api/opportunities?limit=0','/api/academics/transcript?subjectId=S01']){
      const res=await h.app.inject({url});
      expect(res.statusCode).toBe(422);
    }
    expect(h.reads()).toBe(0);
  });
  it('rejects future VERIFIED sources and unapproved REAL opportunities',async()=>{
    const h=fixture();
    h.replace('listCourses',async()=>({scopeToken:'SYN-TOKEN',result:{
      ...coursePage,items:[{...course,source:{
        ...source,status:'ACTIVE',verifiedAt:'2026-12-01T00:00:00.000Z',
      }}],
    }}));
    expect((await h.app.inject({url:'/api/courses'})).statusCode).toBe(403);
    h.replace('listOpportunities',async()=>({scopeToken:'SYN-TOKEN',result:{
      ...oppPage,items:[{opportunity:{...opportunity,dataMode:'REAL'},source}],
    }}));
    expect((await h.app.inject({url:'/api/opportunities'})).statusCode).toBe(503);
  });
  it('refuses a mismatched selected course or opportunity and false last page',async()=>{
    const h=fixture();
    h.replace('getOpportunity',async()=>({scopeToken:'SYN-TOKEN',result:{
      opportunity:{...opportunity,id:'SYN-ANOTHER'},source,
    }}));
    expect((await h.app.inject({url:'/api/opportunities/SYN-OP01'})).statusCode).toBe(403);
    h.replace('listOfferings',async()=>({scopeToken:'SYN-TOKEN',result:{
      ...offeringPage,items:[{...offering,courseId:'SYN-OTHER'}],
    }}));
    expect((await h.app.inject({url:'/api/courses/SYN-C01/offerings'})).statusCode).toBe(503);
    h.replace('listCourses',async()=>({scopeToken:'SYN-TOKEN',result:{
      ...coursePage,items:[],nextCursor:'SYN-NEXT',
    }}));
    expect((await h.app.inject({url:'/api/courses'})).statusCode).toBe(503);
  });
  it('denies anonymous sessions before catalog lookup, and does not activate an absent port',async()=>{
    const h=fixture();h.revoke();
    expect((await h.app.inject({url:'/api/opportunities'})).statusCode).toBe(401);
    expect(h.reads()).toBe(0);
    const app=createIntegratedApi({allowedOrigin:origin,
      repository:new MemoryApiRepository({profiles:[]}),
      auth:{verifySession:async()=>actor,revokeSession:async()=>{}},now:()=>NOW,
    });apps.push(app);
    expect((await app.inject({url:'/api/opportunities'})).statusCode).toBe(403);
  });
});
