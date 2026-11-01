import {afterEach,describe,expect,it} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import type {OwnerWorkspacePort} from
  '../../apps/api/src/modules/profiles/self-workspace-postgres.js';
import {WorkspaceConflict,WorkspaceDenied} from
  '../../apps/api/src/modules/profiles/self-workspace-postgres.js';
import type {OwnerWorkspaceRecord} from '@hufs-one/contracts';

const NOW='2026-11-01T00:00:00.000Z';
const ORIGIN='https://synthetic.invalid';
const actorA={role:'BETA' as const,actorId:'SYN-OWNER-A',
  sessionIdHash:'H'.repeat(32),csrfToken:'C'.repeat(32),betaAllowed:true,
  sessionExpiresAt:'2026-11-20T00:00:00Z',
  schoolMailProofExpiresAt:'2026-11-20T00:00:00Z'};
const writeHeaders={origin:ORIGIN,'x-csrf-token':actorA.csrfToken};
const legacy={kind:'BOOKMARK' as const,state:'SAVED' as const,
  opportunityId:'SYN-OP-A',dataMode:'SYNTHETIC' as const};
const URL='/api/saved-items/SYN-BM-1';
const outcome={provenance:'USER_ENTERED_UNVERIFIED' as const,
  result:'NOT_ACCEPTED' as const,note:'본인 기록'};
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{await Promise.all(apps.map(a=>a.close()));apps.length=0;});

function fixture(){
  const rows=new Map<string,OwnerWorkspaceRecord>();
  let identity={...actorA},allowed=true,revokeOnRead=false,tamper=false;
  let writes=0;
  const key=(actorId:string,itemId:string)=>actorId+'\0'+itemId;
  const grant=()=>{if(!allowed)throw new WorkspaceDenied();};
  const store:OwnerWorkspacePort={
    list:async({actorId})=>{
      grant();
      return {items:[...rows].filter(([k])=>k.startsWith(actorId+'\0'))
        .map(([,item])=>item),nextCursor:null};
    },
    read:async({actorId,kind,itemId})=>{
      grant();
      if(kind!=='BOOKMARK')return null;
      if(revokeOnRead)allowed=false;
      return rows.get(key(actorId,itemId))??null;
    },
    create:async({actorId,itemId,value})=>{
      grant();
      if(value.kind!=='BOOKMARK')throw new WorkspaceDenied();
      const k=key(actorId,itemId);
      if(rows.has(k))throw new WorkspaceConflict();
      const record:OwnerWorkspaceRecord={itemId,version:1,value,updatedAt:NOW};
      rows.set(k,record);return record;
    },
    update:async({actorId,kind,itemId,expectedVersion,value})=>{
      grant();
      if(kind!=='BOOKMARK'||value.kind!=='BOOKMARK')
        throw new WorkspaceDenied();
      const k=key(actorId,itemId),prior=rows.get(k);
      if(!prior||prior.version!==expectedVersion)throw new WorkspaceConflict();
      writes++;
      const record:OwnerWorkspaceRecord={itemId,version:prior.version+1,
        value,updatedAt:NOW};
      rows.set(k,record);
      return tamper?{...record,value:legacy}:record;
    },
    delete:async()=>{throw new WorkspaceDenied();},
  };
  const app=createIntegratedApi({
    allowedOrigin:ORIGIN,repository:new MemoryApiRepository({profiles:[]}),
    auth:{verifySession:async()=>identity,revokeSession:async()=>{}},
    now:()=>NOW,ownerWorkspace:store,
  });
  apps.push(app);
  const create=()=>app.inject({method:'POST',url:'/api/saved-items',
    headers:writeHeaders,payload:{itemId:'SYN-BM-1',value:legacy}});
  const patch=(stage:string,expectedVersion:number,rest:Record<string,unknown>={})=>
    app.inject({method:'PATCH',url:URL,headers:writeHeaders,
      payload:{expectedVersion,stage,...rest}});
  return {app,rows,create,patch,
    asOtherActor:()=>{identity={...actorA,actorId:'SYN-OWNER-B'};},
    revokeStorage:()=>{allowed=false;},
    revokeOnRead:()=>{revokeOnRead=true;},
    tamperResponse:()=>{tamper=true;},
    writeCount:()=>writes,
  };
}

describe('A05 #80 authenticated owner-only support-status PATCH',()=>{
  it('reads SAVED rows as legacy and advances exactly one stage with CAS',async()=>{
    const h=fixture();
    expect((await h.create()).statusCode).toBe(201);
    const original=await h.app.inject({url:'/api/saved-items'});
    expect(original.statusCode).toBe(200);
    expect(original.json().items[0].value).toEqual(legacy);
    for(const [version,stage,extra] of [
      [1,'PREPARING',{}],
      [2,'SUBMITTED_SELF_REPORTED',{}],
      [3,'AWAITING_RESULT',{}],
      [4,'RESULT_RECORDED',{outcome}],
    ] as const){
      const r=await h.patch(stage,version,extra);
      expect(r.statusCode).toBe(200);
      expect(r.json().item.version).toBe(version+1);
      expect(r.json().item.value).toEqual({
        ...legacy,stage,...extra,
      });
      expect(r.headers['cache-control']).toBe('no-store');
    }
    expect(h.rows.get('SYN-OWNER-A\0SYN-BM-1')?.value).toEqual({
      ...legacy,stage:'RESULT_RECORDED',outcome,
    });
    expect(h.writeCount()).toBe(4);
  });
  it('rejects skips, backwards, duplicates and stale retries without mutation',async()=>{
    const h=fixture();
    await h.create();
    expect((await h.patch('AWAITING_RESULT',1)).statusCode).toBe(409);
    expect((await h.patch('INTERESTED',1)).statusCode).toBe(409);
    expect((await h.patch('PREPARING',1)).statusCode).toBe(200);
    expect((await h.patch('PREPARING',1)).statusCode).toBe(409);
    expect((await h.patch('SUBMITTED_SELF_REPORTED',1)).statusCode).toBe(409);
    expect((await h.patch('INTERESTED',2)).statusCode).toBe(409);
    expect(h.writeCount()).toBe(1);
  });
  it('rejects forged actor/mutation, guessed official outcome and invalid input',async()=>{
    const h=fixture();
    await h.create();
    for(const [stage,rest] of [
      ['PREPARING',{actorId:'SYN-OWNER-B'}],
      ['RESULT_RECORDED',{}],
      ['PREPARING',{outcome}],
      ['PREPARING',{opportunityId:'SYN-OP-OTHER'}],
      ['ACCEPTED',{}],
    ] as const){
      expect((await h.patch(stage,1,rest)).statusCode).toBe(422);
    }
    const noCsrf=await h.app.inject({method:'PATCH',url:URL,
      headers:{origin:ORIGIN},payload:{expectedVersion:1,stage:'PREPARING'}});
    expect(noCsrf.statusCode).toBe(403);
    h.asOtherActor();
    const other=await h.patch('PREPARING',1);
    expect(other.statusCode).toBe(409);
    expect(other.body).not.toContain('SYN-OP-A');
    expect(h.writeCount()).toBe(0);
  });
  it('blocks consent revocation, including revocation between read and update',async()=>{
    const h=fixture();
    await h.create();
    h.revokeStorage();
    expect((await h.patch('PREPARING',1)).statusCode).toBe(403);
    expect(h.writeCount()).toBe(0);
    const later=fixture();
    await later.create();
    later.revokeOnRead();
    expect((await later.patch('PREPARING',1)).statusCode).toBe(403);
    expect(later.writeCount()).toBe(0);
  });
  it('rejects a provider trying to return an unadvanced or malformed stage',async()=>{
    const h=fixture();
    await h.create();h.tamperResponse();
    expect((await h.patch('PREPARING',1)).statusCode).toBe(503);
  });
  it('never lets a POST start in a self-declared submitted/final state',async()=>{
    const h=fixture();
    for(const value of [
      {...legacy,stage:'SUBMITTED_SELF_REPORTED'},
      {...legacy,stage:'RESULT_RECORDED',outcome},
    ]){
      const r=await h.app.inject({method:'POST',url:'/api/saved-items',
        headers:writeHeaders,payload:{itemId:'SYN-BM-1',value}});
      expect(r.statusCode).toBe(422);
    }
    expect(h.rows.size).toBe(0);
  });
});
