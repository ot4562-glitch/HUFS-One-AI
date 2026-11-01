import {afterEach,describe,expect,it} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import type {OwnerWorkspacePort} from '../../apps/api/src/modules/profiles/self-workspace-postgres.js';
import {WorkspaceConflict,WorkspaceDenied} from '../../apps/api/src/modules/profiles/self-workspace-postgres.js';
import type {OwnerWorkspaceRecord} from '@hufs-one/contracts';
import {HufsApiClient} from '../../apps/web/src/integrations/api-client.js';
import type {ApiFetch} from '../../apps/web/src/integrations/api-client.js';
import {OwnerSessionController} from '../../apps/web/src/app/owner-session-controller.js';

const NOW='2026-11-01T00:00:00.000Z',ORIGIN='https://synthetic.invalid';
const legacy={kind:'BOOKMARK' as const,state:'SAVED' as const,
  opportunityId:'SYN-OP-1',dataMode:'SYNTHETIC' as const};
const actor=(id:string)=>({actorId:id,role:'BETA' as const,sessionIdHash:'H'.repeat(32),
  csrfToken:'C'.repeat(32),betaAllowed:true,
  sessionExpiresAt:'2026-12-01T00:00:00.000Z',
  schoolMailProofExpiresAt:'2026-12-01T00:00:00.000Z'});
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(a=>a.close()));});

function harness(){
  const rows=new Map<string,OwnerWorkspaceRecord>(),calls:Array<{url:string;init:RequestInit;
    status:number;cache:string}>=[];
  let currentActor=actor('SYN-OWNER-A'),allowed=true,writes=0;
  const key=(actorId:string,itemId:string)=>actorId+'|'+itemId;
  const authorize=()=>{if(!allowed)throw new WorkspaceDenied();};
  const store:OwnerWorkspacePort={
    list:async({actorId,kind})=>{
      authorize();
      const items=[...rows].filter(([k,v])=>k.startsWith(actorId+'|')&&v.value.kind===kind)
        .map(([,v])=>structuredClone(v)).sort((a,b)=>a.itemId.localeCompare(b.itemId));
      return {items,nextCursor:null};
    },
    read:async({actorId,kind,itemId})=>{
      authorize();
      const row=rows.get(key(actorId,itemId));
      return row?.value.kind===kind?structuredClone(row):null;
    },
    create:async({actorId,itemId,value})=>{
      authorize();const k=key(actorId,itemId);
      if(rows.has(k))throw new WorkspaceConflict();
      const item:OwnerWorkspaceRecord={itemId,version:1,value,updatedAt:NOW};
      rows.set(k,item);return structuredClone(item);
    },
    update:async({actorId,kind,itemId,expectedVersion,value})=>{
      authorize();const k=key(actorId,itemId),prior=rows.get(k);
      if(!prior||prior.value.kind!==kind||prior.version!==expectedVersion)
        throw new WorkspaceConflict();
      writes++;
      const item:OwnerWorkspaceRecord={itemId,version:expectedVersion+1,value,updatedAt:NOW};
      rows.set(k,item);return structuredClone(item);
    },
    delete:async()=>{throw new WorkspaceDenied();},
  };
  const app=createIntegratedApi({allowedOrigin:ORIGIN,now:()=>NOW,
    repository:new MemoryApiRepository({profiles:[]}),
    auth:{verifySession:async()=>currentActor,revokeSession:async()=>{}},
    ownerWorkspace:store});
  apps.push(app);
  const transport:ApiFetch=async(url,init)=>{
    const headers=init.headers as Record<string,string>;
    const response=await app.inject({
      method:init.method??'GET',url,
      headers:{origin:ORIGIN,cookie:'synthetic-session-only',
        ...(headers['x-csrf-token']?{'x-csrf-token':headers['x-csrf-token']}:{}),
        ...(headers['content-type']?{'content-type':headers['content-type']}:{}),
      },
      ...(typeof init.body==='string'?{payload:init.body}:{}),
    });
    calls.push({url,init,status:response.statusCode,
      cache:String(response.headers['cache-control']??'')});
    return new Response(response.statusCode===204?null:response.body,{
      status:response.statusCode,headers:{'content-type':'application/json',
        'cache-control':String(response.headers['cache-control']??'')}});
  };
  const client=new HufsApiClient(transport);
  return {client,app,calls,rows,grant:()=>allowed,
    changeActor:(id:string)=>{currentActor=actor(id);},
    withdraw:()=>{allowed=false;},
    writeCount:()=>writes};
}

describe('Agent 06 real Fastify -> same-origin browser -> owner controller (synthetic #80)',()=>{
  it('creates a legacy saved item, then advances all stages with fresh CSRF and owner CAS',async()=>{
    const h=harness();
    const owner=new OwnerSessionController(h.client);
    await owner.initialize();
    expect(owner.getState().status).toBe('READY');
    const created=await owner.runMutation(signal=>h.client.owner.createWorkspace({
      itemId:'SYN-BM-1',value:legacy,
    },signal));
    expect(created?.item.version).toBe(1);
    let current=created!.item;
    const entries=await owner.runLatest('saved',signal=>
      h.client.owner.listWorkspace('BOOKMARK',{},signal));
    expect(entries?.items[0]).toEqual(current);
    const steps=['PREPARING','SUBMITTED_SELF_REPORTED','AWAITING_RESULT'] as const;
    for(const stage of steps){
      const response=await owner.runMutation(signal=>
        h.client.owner.advanceBookmarkStage(current,{stage},signal));
      expect(response?.item.version).toBe(current.version+1);
      expect(response?.item.value).toEqual({...current.value,stage});
      current=response!.item;
    }
    const outcome={provenance:'USER_ENTERED_UNVERIFIED' as const,
      result:'OTHER' as const,note:'합성 학생이 기록한 결과'};
    const final=await owner.runMutation(signal=>
      h.client.owner.advanceBookmarkStage(current,{stage:'RESULT_RECORDED',outcome},signal));
    expect(final?.item.value).toEqual({...legacy,stage:'RESULT_RECORDED',outcome});
    expect(h.writeCount()).toBe(4);
    expect(h.calls.filter(x=>x.init.method==='PATCH')).toHaveLength(4);
    expect(h.calls.every(x=>x.init.credentials==='same-origin'&&x.init.cache==='no-store'
      &&x.init.redirect==='error'&&x.cache==='no-store')).toBe(true);
    expect(h.calls.every(x=>!String(x.init.body??'').includes('actorId')
      &&!x.url.includes('SYN-OP-1'))).toBe(true);
    // The initial bookmark POST legitimately names its source opportunity;
    // stage-only PATCH must never resend or allow rewriting that immutable ID.
    expect(h.calls.filter(x=>x.init.method==='PATCH').every(x=>
      !String(x.init.body??'').includes('opportunityId'))).toBe(true);
    owner.dispose();
  },90_000);

  it('rejects duplicate click from stale tab and actor switch before another write',async()=>{
    const h=harness();
    const created=await h.client.owner.createWorkspace({itemId:'SYN-BM-1',value:legacy});
    const first=new OwnerSessionController(h.client),second=new OwnerSessionController(h.client);
    await Promise.all([first.initialize(),second.initialize()]);
    const current=created.item;
    const advanced=await first.runMutation(signal=>
      h.client.owner.advanceBookmarkStage(current,{stage:'PREPARING'},signal));
    expect(advanced?.item.version).toBe(2);
    // Tab B has not reloaded its original version; the server, not its UI,
    // atomically rejects the second attempt.
    const stale=await second.runMutation(signal=>
      h.client.owner.advanceBookmarkStage(current,{stage:'PREPARING'},signal));
    expect(stale).toBeNull();
    expect(second.getState()).toMatchObject({status:'CONFLICT',error:'VERSION_CONFLICT'});
    expect(h.writeCount()).toBe(1);
    h.changeActor('SYN-OWNER-B');
    const requestsBefore=h.calls.length;
    const shouldNotWrite=await first.runMutation(signal=>
      h.client.owner.advanceBookmarkStage(advanced!.item,{stage:'SUBMITTED_SELF_REPORTED'},signal));
    expect(shouldNotWrite).toBeNull();
    expect(first.getState().status).toBe('SIGNED_OUT');
    expect(h.calls.slice(requestsBefore).every(x=>x.url==='/api/auth/session')).toBe(true);
    expect(h.writeCount()).toBe(1);
    first.dispose();second.dispose();
  },90_000);

  it('clears private owner state after 403 storage consent withdrawal',async()=>{
    const h=harness();
    const created=await h.client.owner.createWorkspace({itemId:'SYN-BM-1',value:legacy});
    const controller=new OwnerSessionController(h.client);
    await controller.initialize();
    h.withdraw();
    expect(await controller.runMutation(signal=>
      h.client.owner.advanceBookmarkStage(created.item,{stage:'PREPARING'},signal))).toBeNull();
    expect(controller.getState()).toMatchObject({status:'FORBIDDEN',error:'FORBIDDEN'});
    expect(h.writeCount()).toBe(0);
    expect(await controller.runLatest('saved',signal=>h.client.owner.listWorkspace('BOOKMARK',{},signal)))
      .toBeNull();
    expect(h.calls.some(x=>x.status===403&&x.url.endsWith('/SYN-BM-1'))).toBe(true);
    controller.dispose();
  },90_000);
});
