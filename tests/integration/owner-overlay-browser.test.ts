import {afterEach,describe,expect,it} from 'vitest';
import {DemoSnapshotSchema,SharingGrantSchema,validateCalendarWire} from '@hufs-one/contracts';
import {createApi} from '../../apps/api/src/server.js';
import {DemoOverlayService,MemoryDemoOverlayStore} from '../../apps/api/src/modules/demo-overlay.js';
import {GeneratedSyntheticReviewerRepository} from '../../apps/api/src/modules/auth/reviewer-generated-corpus.js';
import {DEMO_STUDENTS,DEMO_AS_OF,DEMO_OPPORTUNITIES,DEMO_PUBLISHED_AT,scopeInputsToGrant}
  from '../../packages/core/src/opportunities/index.js';
import {DEMO_NOTICES} from '../../packages/core/src/notices/index.js';
import type {CalendarInputSource} from '../../apps/api/src/modules/calendar.js';
import {HufsApiClient,HufsApiError} from '../../apps/web/src/integrations/api-client.js';
import type {ApiFetch} from '../../apps/web/src/integrations/api-client.js';
import {DemoController} from '../../apps/web/src/app/demo-controller.js';

const NOW=DEMO_AS_OF,ORIGIN='https://synthetic.invalid';
const actor={actorId:'SYN-BROWSER-ACTOR',role:'BETA' as const,sessionIdHash:'H'.repeat(32),
  csrfToken:'C'.repeat(32),betaAllowed:true,sessionExpiresAt:'2026-12-01T00:00:00.000Z',
  schoolMailProofExpiresAt:'2026-12-01T00:00:00.000Z'};
const apps:Array<ReturnType<typeof createApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(app=>app.close()));});

async function harness(){
  const generated=new GeneratedSyntheticReviewerRepository();
  const grant=SharingGrantSchema.parse({grantId:'SYN-G1',actorId:actor.actorId,
    demoSubjectId:'S01',version:'SYN-G1',expiresAt:actor.sessionExpiresAt,
    allowedSections:['FEED','NOTICES'],displayNameAllowed:false,recordingAllowed:false});
  const original=(await generated.readSnapshot('S01'))!;
  const snapshot=DemoSnapshotSchema.parse({...original,versions:{...original.versions,consent:grant.version},
    academics:{state:'NOT_SHARED'},forecast:{state:'NOT_SHARED'}});
  let authorized=true;
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
    },revalidateAuthorization:async()=>authorized,
  };
  const app=createApi({allowedOrigin:ORIGIN,now:()=>NOW,verifySession:async()=>authorized?actor:null,
    repository:{listProfiles:()=>generated.listProfiles(),readGrant:async()=>grant,
      readSnapshot:async()=>snapshot,readAuthorizedSnapshot:async()=>snapshot,readSafePacket:async()=>null},
    calendarSource:source,
    demoOverlay:new DemoOverlayService({source,store:new MemoryDemoOverlayStore(),now:()=>NOW})});
  apps.push(app);
  const log:Array<{url:string;init:RequestInit}>=[];
  const transport:ApiFetch=async(url,init)=>{
    log.push({url,init});
    const headers=init.headers as Record<string,string>;
    const response=await app.inject({method:init.method??'GET',url,
      headers:{origin:ORIGIN,...(headers['x-csrf-token']?{'x-csrf-token':headers['x-csrf-token']}:{}),
        ...(headers['content-type']?{'content-type':headers['content-type']}:{}),
      },...(typeof init.body==='string'?{payload:init.body}:{})});
    return new Response(response.statusCode===204?null:response.body,{
      status:response.statusCode,headers:{'content-type':'application/json',
        'cache-control':String(response.headers['cache-control']??'')}});
  };
  const client=new HufsApiClient(transport);
  return {client,log,revoke:()=>{authorized=false;}};
}

describe('Fastify owner overlay to real browser client (synthetic only)',()=>{
  it('serves calendar through Fastify to the active same-origin controller with its snapshot asOf',async()=>{
    const h=await harness(),controller=new DemoController(h.client,'SYN-CAL-RUN-1');
    await controller.select('S01');
    const snapshot=controller.getState().snapshot!;
    const result=await controller.runContextOperation((context,signal)=>
      h.client.getCalendar(context.contextId,signal));
    expect(result).not.toBeNull();
    expect(validateCalendarWire(result!,snapshot.asOf)).toEqual(result);
    const request=h.log.find(entry=>entry.url.endsWith('/calendar'));
    expect(request?.init).toMatchObject({method:'GET',cache:'no-store',
      credentials:'same-origin',mode:'same-origin',redirect:'error'});
    expect(request?.url).toBe('/api/demo/contexts/'+snapshot.contextId+'/calendar');
    controller.dispose();
  });
  it('drops a delayed calendar from the same context when overlay commits a newer snapshot',async()=>{
    const h=await harness(),controller=new DemoController(h.client,'SYN-CAL-RUN-2');
    await controller.select('S01');
    let ready!:()=>void;
    const waiting=new Promise<void>(resolve=>{ready=resolve;});
    let release!:()=>void;
    const pause=new Promise<void>(resolve=>{release=resolve;});
    let oldSignal:AbortSignal|undefined;
    const old=controller.runContextOperation(async(context,signal)=>{
      oldSignal=signal;
      const calendar=await h.client.getCalendar(context.contextId,signal);
      ready();
      await pause; // Completed HTTP response queued behind another UI operation.
      return calendar;
    });
    await waiting;
    const overlay=await controller.runOverlayOperation((context,signal)=>
      h.client.setDemoOverlay(context,{expectedVersion:0,value:{
        interestTopics:['TRADE_OVERSEAS'],
      }},signal));
    expect(overlay?.snapshot.versions.overlay).toBe('BETA_OVERLAY:1');
    expect(controller.getState().snapshot?.versions.overlay).toBe('BETA_OVERLAY:1');
    release();
    expect(await old).toBeNull();
    expect(oldSignal?.aborted).toBe(false);
    controller.dispose();
  });
  it('ignores a stale calendar failure after a newer same-context overlay snapshot commits',async()=>{
    const h=await harness(),controller=new DemoController(h.client,'SYN-CAL-RUN-3');
    await controller.select('S01');
    let entered!:()=>void,release!:()=>void;
    const waiting=new Promise<void>(resolve=>{entered=resolve;});
    const gate=new Promise<void>(resolve=>{release=resolve;});
    const old=controller.runContextOperation(async()=>{
      entered();
      await gate;
      throw new HufsApiError('SHARING_REVOKED',403);
    });
    await waiting;
    const updated=await controller.runOverlayOperation((context,signal)=>
      h.client.setDemoOverlay(context,{expectedVersion:0,value:{interestTopics:['AI_ML']}},signal));
    expect(updated?.overlay.version).toBe(1);
    release();
    expect(await old).toBeNull();
    expect(controller.getState()).toMatchObject({status:'READY',error:null});
    expect(controller.getState().snapshot?.versions.overlay).toBe('BETA_OVERLAY:1');
    controller.dispose();
  });
  it('reads, edits and resets one granted tab and atomically replaces its snapshot',async()=>{
    const h=await harness(),controller=new DemoController(h.client,'SYN-RUN-1');
    await controller.select('S01');
    expect(controller.getState().status).toBe('READY');
    const context=controller.getState().context!;
    const initial=await h.client.getDemoOverlay(context);
    expect(initial.overlay.version).toBe(0);
    const updated=await controller.runOverlayOperation((c,signal)=>
      h.client.setDemoOverlay(c,{expectedVersion:0,value:{interestTopics:['TRADE_OVERSEAS']}},signal));
    expect(updated?.overlay.version).toBe(1);
    expect(controller.getState().snapshot?.versions.overlay).toBe('BETA_OVERLAY:1');
    expect((await h.client.getSnapshot(context.contextId)).feed).toEqual(updated?.snapshot.feed);
    const reset=await controller.runOverlayOperation((c,signal)=>h.client.resetDemoOverlay(c,1,signal));
    expect(reset?.overlay.value).toEqual({});
    expect(controller.getState().snapshot?.versions.overlay).toBe('BETA_OVERLAY:2');
    expect(h.log.some(x=>x.init.method==='PATCH'&&x.url.endsWith('/overlay'))).toBe(true);
    expect(h.log.some(x=>x.init.method==='POST'&&x.url.endsWith('/reset'))).toBe(true);
    expect(h.log.every(x=>x.init.cache==='no-store'&&x.init.credentials==='same-origin'
      &&x.init.redirect==='error')).toBe(true);
    expect(h.log.every(x=>!String(x.init.body??'').includes('actorId'))).toBe(true);
    controller.dispose();
  });
  it('forbids owner account API when its store is not configured',async()=>{
    const h=await harness();
    await expect(h.client.owner.getProfile()).rejects.toMatchObject({code:'FORBIDDEN',status:403});
  });
  it('erases the selected snapshot on revocation and blocks later writes',async()=>{
    const h=await harness(),controller=new DemoController(h.client,'SYN-RUN-1');
    await controller.select('S01');h.revoke();
    expect(await controller.runOverlayOperation((c,signal)=>
      h.client.setDemoOverlay(c,{expectedVersion:0,value:{}},signal))).toBeNull();
    expect(controller.getState()).toMatchObject({status:'SIGNED_OUT',snapshot:null});
    controller.dispose();
  });
});
