import {afterEach,describe,expect,it} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import type {OwnerWorkspacePort} from '../../apps/api/src/modules/profiles/self-workspace-postgres.js';
import {WorkspaceConflict,WorkspaceDenied}
  from '../../apps/api/src/modules/profiles/self-workspace-postgres.js';
import type {OwnerWorkspaceRecord} from '@hufs-one/contracts';
import {HufsApiClient} from '../../apps/web/src/integrations/api-client.js';
import type {ApiFetch} from '../../apps/web/src/integrations/api-client.js';
import {OwnerSessionController} from '../../apps/web/src/app/owner-session-controller.js';

const NOW='2026-11-01T00:00:00.000Z',ORIGIN='https://synthetic.invalid';
const actor={actorId:'SYN-A06-OWNER',role:'BETA' as const,sessionIdHash:'H'.repeat(32),
  csrfToken:'C'.repeat(32),betaAllowed:true,
  sessionExpiresAt:'2026-11-20T00:00:00.000Z',
  schoolMailProofExpiresAt:'2026-11-20T00:00:00.000Z'};
const saved={kind:'BOOKMARK' as const,state:'SAVED' as const,
  dataMode:'SYNTHETIC' as const,opportunityId:'SYN-OP-1'};
const outcome={provenance:'USER_ENTERED_UNVERIFIED' as const,
  result:'WAITLISTED' as const,note:'합성 본인 입력'};
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(x=>x.close()));});

function harness(){
  const rows=new Map<string,OwnerWorkspaceRecord>();
  let allowed=true,writeCount=0,activeActor=actor;
  const verify=()=>{if(!allowed)throw new WorkspaceDenied();};
  const key=(who:string,id:string)=>who+':'+id;
  const store:OwnerWorkspacePort={
    list:async({actorId})=>{
      verify();
      return {items:[...rows].filter(([k])=>k.startsWith(actorId+':'))
        .map(([,record])=>record),nextCursor:null};
    },
    read:async({actorId,itemId})=>{verify();return rows.get(key(actorId,itemId))??null;},
    create:async({actorId,itemId,value})=>{
      verify();const id=key(actorId,itemId);
      if(rows.has(id))throw new WorkspaceConflict();
      const row={itemId,version:1,value,updatedAt:NOW};
      rows.set(id,row);return row;
    },
    update:async({actorId,itemId,expectedVersion,value})=>{
      verify();const id=key(actorId,itemId),previous=rows.get(id);
      if(!previous||previous.version!==expectedVersion)throw new WorkspaceConflict();
      const row={itemId,version:previous.version+1,value,updatedAt:NOW};
      rows.set(id,row);writeCount++;return row;
    },
    delete:async()=>{throw new WorkspaceDenied();},
  };
  const app=createIntegratedApi({
    allowedOrigin:ORIGIN,repository:new MemoryApiRepository({profiles:[]}),
    auth:{verifySession:async(req)=>req.headers.cookie==='sid=synthetic'?activeActor:null,
      revokeSession:async()=>{}},
    now:()=>NOW,ownerWorkspace:store,
  });
  apps.push(app);
  const requestLog:Array<{url:string;init:RequestInit;status:number;cache:string}>=[];
  const transport:ApiFetch=async(url,init)=>{
    const reply=await app.inject({method:init.method??'GET',url,
      headers:{cookie:'sid=synthetic',origin:ORIGIN,...(init.headers as Record<string,string>)},
      ...(typeof init.body==='string'?{payload:init.body}:{})});
    const cache=String(reply.headers['cache-control']??'');
    requestLog.push({url,init,status:reply.statusCode,cache});
    return new Response(reply.statusCode===204?null:reply.body,{status:reply.statusCode,
      headers:{'content-type':'application/json','cache-control':cache}});
  };
  return {client:new HufsApiClient(transport),requestLog,rows,
    revoke:()=>{allowed=false;},writes:()=>writeCount,
    switchActor:(actorId:string)=>{activeActor={...actor,actorId};}};
}

describe('A06 owner bookmark-stage true Fastify -> same-origin browser -> session guard',()=>{
  it('advances 4 self-reported stages with CSRF/CAS; stale clicks and revoked storage fail closed',async()=>{
    const h=harness(),controller=new OwnerSessionController(h.client);
    await controller.initialize();
    expect(controller.getState().status).toBe('READY');
    const inserted=await controller.runMutation(signal=>
      h.client.owner.createWorkspace({itemId:'SYN-BM-1',value:saved},signal));
    expect(inserted?.item.version).toBe(1);
    const initial=await controller.runLatest('saved',signal=>
      h.client.owner.listWorkspace('BOOKMARK',{},signal));
    expect(initial?.items[0]?.value).toEqual(saved);
    let current=initial!.items[0]!;
    for(const stage of ['PREPARING','SUBMITTED_SELF_REPORTED','AWAITING_RESULT','RESULT_RECORDED'] as const){
      const next=await controller.runMutation(signal=>h.client.owner.advanceBookmarkStage(
        current,{stage,...(stage==='RESULT_RECORDED'?{outcome}:{})},signal));
      expect(next?.item.version).toBe(current.version+1);
      expect(next?.item.value).toEqual({...current.value,stage,
        ...(stage==='RESULT_RECORDED'?{outcome}:{})});
      current=next!.item;
    }
    expect(current.value.kind).toBe('BOOKMARK');
    expect(h.writes()).toBe(4);
    const steps=h.requestLog.filter(x=>x.url==='/api/saved-items/SYN-BM-1');
    expect(steps).toHaveLength(4);
    for(const call of steps){
      expect(call.status).toBe(200);expect(call.cache).toBe('no-store');
      expect(call.init).toMatchObject({method:'PATCH',credentials:'same-origin',
        cache:'no-store',mode:'same-origin',redirect:'error'});
      expect((call.init.headers as Record<string,string>)['x-csrf-token']).toBe(actor.csrfToken);
      const submitted=JSON.parse(call.init.body as string);
      expect(Object.keys(submitted).sort()).toEqual(call===steps[3]
        ?['expectedVersion','outcome','stage']:['expectedVersion','stage']);
    }
    expect(h.requestLog.every(x=>!String(x.init.body??'').includes(actor.actorId))).toBe(true);
    await expect(h.client.owner.advanceBookmarkStage(inserted!.item,{stage:'PREPARING'}))
      .rejects.toMatchObject({code:'VERSION_CONFLICT',status:409});
    expect(h.writes()).toBe(4);
    h.revoke();
    expect(await controller.runMutation(signal=>h.client.owner.listWorkspace('BOOKMARK',{},signal)))
      .toBeNull();
    expect(controller.getState().status).not.toBe('READY');
    controller.dispose();
  },90_000);

  it('does not transmit a stage PATCH when the original owner identity switched',async()=>{
    const h=harness(),controller=new OwnerSessionController(h.client);
    const created=await h.client.owner.createWorkspace({itemId:'SYN-BM-1',value:saved});
    await controller.initialize();
    expect(controller.getState().status).toBe('READY');
    h.switchActor('SYN-DIFFERENT-OWNER');
    const start=h.requestLog.length;
    const result=await controller.runMutation(signal=>
      h.client.owner.advanceBookmarkStage(created.item,{stage:'PREPARING'},signal));
    expect(result).toBeNull();
    expect(controller.getState()).toMatchObject({
      status:'SIGNED_OUT',error:'UNAUTHENTICATED',
    });
    expect(h.requestLog.slice(start).map(x=>x.url)).toEqual(['/api/auth/session']);
    expect(h.writes()).toBe(0);
    expect(h.rows.get('SYN-A06-OWNER:SYN-BM-1')?.version).toBe(1);
    controller.dispose();
  },90_000);
});
