import {afterEach,describe,expect,it} from 'vitest';
import {DemoSnapshotSchema,SharingGrantSchema} from '@hufs-one/contracts';
import {createApi} from '../../apps/api/src/server.js';
import {DemoOverlayService,MemoryDemoOverlayStore} from '../../apps/api/src/modules/demo-overlay.js';
import {GeneratedSyntheticReviewerRepository} from '../../apps/api/src/modules/auth/reviewer-generated-corpus.js';
import {DEMO_STUDENTS,DEMO_AS_OF,DEMO_OPPORTUNITIES,DEMO_PUBLISHED_AT,scopeInputsToGrant}
  from '../../packages/core/src/opportunities/index.js';
import {DEMO_NOTICES} from '../../packages/core/src/notices/index.js';
import type {CalendarInputSource} from '../../apps/api/src/modules/calendar.js';

const NOW=DEMO_AS_OF,ORIGIN='https://example.test';
const actor={actorId:'SYN-HTTP-OVERLAY',role:'BETA' as const,sessionIdHash:'H'.repeat(32),
  csrfToken:'C'.repeat(32),betaAllowed:true,sessionExpiresAt:'2026-12-01T00:00:00.000Z',
  schoolMailProofExpiresAt:'2026-12-01T00:00:00.000Z'};
const apps:Array<ReturnType<typeof createApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(app=>app.close()));});
async function setup(){
  const generated=new GeneratedSyntheticReviewerRepository();
  const grant=SharingGrantSchema.parse({grantId:'SYN-G1',actorId:actor.actorId,demoSubjectId:'S01',
    version:'SYN-G1',expiresAt:actor.sessionExpiresAt,allowedSections:['FEED','NOTICES'],
    displayNameAllowed:false,recordingAllowed:false});
  const original=(await generated.readSnapshot('S01'))!;
  const snapshot=DemoSnapshotSchema.parse({...original,versions:{...original.versions,consent:grant.version},
    academics:{state:'NOT_SHARED'},forecast:{state:'NOT_SHARED'}});
  let active=true;
  const source:CalendarInputSource={
    readAuthorizedInputs:async input=>{
      const student=DEMO_STUDENTS[0]!;
      const scope=scopeInputsToGrant(student.profile,student.noticeStudent,grant.allowedSections);
      return {actorId:input.actorId,context:input.context,asOf:NOW,datasetMode:'SYNTHETIC',grant,
        profile:student.profile,noticeStudent:student.noticeStudent,provenance:{},scopeKey:scope.scopeKey,
        opportunities:[...DEMO_OPPORTUNITIES],notices:[...DEMO_NOTICES],
        authorizedRevisionIds:Object.keys(DEMO_PUBLISHED_AT),
        revisions:Object.entries(DEMO_PUBLISHED_AT).map(([id,publishedAt])=>({
          revisionId:id,sourceId:id,status:'ACTIVE',changeKind:'NEW',provenance:'SYNTHETIC',
          permissionRef:'SYN-PERM',publishedAt,fetchedAt:publishedAt,lastVerifiedAt:publishedAt,
        })),sourceVersion:'SYN-SOURCE1',authorizationToken:'SYN-RECEIPT'};
    },revalidateAuthorization:async()=>active,
  };
  const app=createApi({allowedOrigin:ORIGIN,now:()=>NOW,verifySession:async()=>active?actor:null,
    repository:{listProfiles:()=>generated.listProfiles(),readGrant:async()=>grant,
      readSnapshot:async()=>snapshot,readAuthorizedSnapshot:async()=>snapshot,readSafePacket:async()=>null},
    calendarSource:source,demoOverlay:new DemoOverlayService({source,store:new MemoryDemoOverlayStore(),now:()=>NOW})});
  apps.push(app);
  const headers={origin:ORIGIN,'x-csrf-token':actor.csrfToken};
  const context=async(run:string)=>(await app.inject({method:'POST',url:'/api/demo/contexts',headers,
    payload:{demoSubjectId:'S01',demoRunId:run}})).json().contextId as string;
  return {app,headers,context,revoke:()=>{active=false;},original:JSON.stringify(snapshot)};
}

describe('BETA overlay HTTP integration',()=>{
  it('writes isolated preferences and all later snapshot/calendar reads use the same overlay',async()=>{
    const h=await setup(),id=await h.context('tab1'),other=await h.context('tab2');
    const path='/api/demo/contexts/'+id;
    const before=(await h.app.inject({url:path+'/snapshot'})).json();
    const changed=await h.app.inject({method:'PATCH',url:path+'/overlay',headers:h.headers,
      payload:{expectedVersion:0,value:{interestTopics:['TRADE_OVERSEAS'],desiredJobTopics:['GLOBAL_SALES']}}});
    expect(changed.statusCode).toBe(200);
    const data=changed.json();expect(data.overlay.version).toBe(1);
    expect(data.snapshot.feed.featured).not.toEqual(before.feed.featured);
    const current=(await h.app.inject({url:path+'/snapshot'})).json();
    expect(current.feed).toEqual(data.snapshot.feed);expect(current.versions.overlay).toBe('BETA_OVERLAY:1');
    expect((await h.app.inject({url:path+'/calendar'})).json()).toEqual(data.calendar);
    expect((await h.app.inject({url:'/api/demo/contexts/'+other+'/overlay'})).json().overlay.version).toBe(0);
    const stale=await h.app.inject({method:'PATCH',url:path+'/overlay',headers:h.headers,
      payload:{expectedVersion:0,value:{}}});expect(stale.statusCode).toBe(409);
    const reset=await h.app.inject({method:'POST',url:path+'/reset',headers:h.headers,payload:{expectedVersion:1}});
    expect(reset.statusCode).toBe(200);expect(reset.json().overlay.version).toBe(2);
    expect(reset.json().snapshot.feed).toEqual(before.feed);
  });
  it('checks CSRF, input fields and current session and never accepts client identity',async()=>{
    const h=await setup(),id=await h.context('tab1'),url='/api/demo/contexts/'+id+'/overlay';
    expect((await h.app.inject({method:'PATCH',url,payload:{expectedVersion:0,value:{}}})).statusCode).toBe(403);
    expect((await h.app.inject({method:'PATCH',url,headers:h.headers,payload:{actorId:'other',expectedVersion:0,value:{}}})).statusCode).toBe(422);
    h.revoke();expect((await h.app.inject({url})).statusCode).toBe(401);
  });
});
