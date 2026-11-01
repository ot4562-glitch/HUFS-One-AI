import {describe,expect,it,vi} from 'vitest';
import {makeApiError} from '@hufs-one/contracts';
import type {OwnerWorkspaceRecord} from '@hufs-one/contracts';
import {HufsApiClient} from '../../apps/web/src/integrations/api-client.js';
import type {ApiFetch} from '../../apps/web/src/integrations/api-client.js';
import {OwnerSessionController} from '../../apps/web/src/app/owner-session-controller.js';

const AT='2026-11-01T00:00:00.000Z',csrf='C'.repeat(32);
const legacy:OwnerWorkspaceRecord={itemId:'SYN-BM-1',version:1,updatedAt:AT,
  value:{kind:'BOOKMARK',dataMode:'SYNTHETIC',opportunityId:'SYN-OP-A',state:'SAVED'}};
const advanced=(previous:OwnerWorkspaceRecord,stage:string,outcome?:unknown)=>({
  itemId:previous.itemId,version:previous.version+1,updatedAt:AT,
  value:{...previous.value,stage,...(outcome?{outcome}:{})},
});
const response=(data:unknown,status=200):Response=>new Response(JSON.stringify(data),{
  status,headers:{'content-type':'application/json'},
});
function harness(receipt:unknown){
  const calls:Array<{url:string;init:RequestInit}>=[];
  const transport:ApiFetch=async(url,init)=>{
    calls.push({url,init});
    return url==='/api/auth/csrf'?response({csrfToken:csrf}):response({item:receipt});
  };
  return {owner:new HufsApiClient(transport).owner,calls};
}
const outcome={provenance:'USER_ENTERED_UNVERIFIED' as const,
  result:'NOT_ACCEPTED' as const,note:'합성 사용자 기록'};

describe('A06 #80 owner bookmark-stage browser consumer: CAS and trust boundary',()=>{
  it('advances a legacy SAVED record with same-origin CSRF and strict next-version receipt',async()=>{
    const receipt=advanced(legacy,'PREPARING'),h=harness(receipt);
    expect(await h.owner.advanceBookmarkStage(legacy,{stage:'PREPARING'})).toEqual({item:receipt});
    expect(h.calls.map(x=>x.url)).toEqual(['/api/auth/csrf','/api/saved-items/SYN-BM-1']);
    expect(h.calls[1]!.init).toMatchObject({method:'PATCH',cache:'no-store',
      mode:'same-origin',credentials:'same-origin',redirect:'error'});
    expect((h.calls[1]!.init.headers as Record<string,string>)['x-csrf-token']).toBe(csrf);
    expect(JSON.parse(h.calls[1]!.init.body as string))
      .toEqual({expectedVersion:1,stage:'PREPARING'});
    expect(h.calls.every(x=>!x.url.includes('SYN-OP-A'))).toBe(true);
    expect(legacy.value).not.toHaveProperty('stage');
  });

  it('requires a user-entered, unverified outcome only for a final result',async()=>{
    const previous:OwnerWorkspaceRecord={...legacy,version:4,
      value:{kind:'BOOKMARK',dataMode:'SYNTHETIC',state:'SAVED',
        opportunityId:'SYN-OP-A',stage:'AWAITING_RESULT'}};
    const receipt=advanced(previous,'RESULT_RECORDED',outcome);
    const h=harness(receipt);
    expect(await h.owner.advanceBookmarkStage(previous,{
      stage:'RESULT_RECORDED',outcome,
    })).toEqual({item:receipt});
    expect(JSON.parse(h.calls[1]!.init.body as string)).toEqual({
      expectedVersion:4,stage:'RESULT_RECORDED',outcome,
    });
  });

  it('rejects skipped/reversed/duplicate steps, forged fields and malformed results before CSRF',async()=>{
    const transport=vi.fn(async()=>response({csrfToken:csrf}));
    const owner=new HufsApiClient(transport).owner;
    for(const change of [
      {stage:'AWAITING_RESULT'},{stage:'INTERESTED'},{stage:'RESULT_RECORDED'},
      {stage:'PREPARING',outcome},{stage:'ACCEPTED'},
      {stage:'PREPARING',actorId:'SYN-OTHER'},
      {stage:'PREPARING',expectedVersion:999},
    ])await expect(owner.advanceBookmarkStage(legacy,change as never))
      .rejects.toMatchObject({code:expect.stringMatching(/INVALID_INPUT|VERSION_CONFLICT/)});
    await expect(owner.advanceBookmarkStage({...legacy,value:{
      kind:'ACTION_PLAN',dataMode:'SYNTHETIC',state:'DRAFT',task:'sample',done:false,
    }} as never,{stage:'PREPARING'})).rejects.toMatchObject({code:'INVALID_INPUT'});
    expect(transport).not.toHaveBeenCalled();
  });

  it('rejects a forged success response for a different item, version, stage or opportunity',async()=>{
    const valid=advanced(legacy,'PREPARING');
    for(const bad of [
      {...valid,itemId:'SYN-BM-OTHER'}, {...valid,version:1},
      {...valid,value:{...valid.value,stage:'AWAITING_RESULT'}},
      {...valid,value:{...valid.value,opportunityId:'SYN-OP-B'}},
      {...valid,value:{...valid.value,dataMode:'OWNER_CONSENTED'}},
    ])await expect(harness(bad).owner.advanceBookmarkStage(legacy,{stage:'PREPARING'}))
      .rejects.toMatchObject({code:'VERSION_CONFLICT',status:409});
    await expect(harness({...valid,value:{...valid.value,studentEmail:'secret'}})
      .owner.advanceBookmarkStage(legacy,{stage:'PREPARING'}))
      .rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE',status:503});
  });

  it.each([
    ['UNAUTHENTICATED',401],['FORBIDDEN',403],['VERSION_CONFLICT',409],
    ['INVALID_INPUT',422],['RATE_LIMITED',429],['PROVIDER_UNAVAILABLE',503],
  ] as const)('preserves server %s/%i without rendering private details',async(code,status)=>{
    const owner=new HufsApiClient(async url=>url==='/api/auth/csrf'
      ?response({csrfToken:csrf}):response(makeApiError(code,'SYN-REQ'),status)).owner;
    await expect(owner.advanceBookmarkStage(legacy,{stage:'PREPARING'}))
      .rejects.toMatchObject({code,status});
  });

  it('OwnerSessionController suppresses duplicate clicks while the first PATCH is pending',async()=>{
    let unlock!:()=>void,started!:()=>void;
    const gate=new Promise<void>(resolve=>{unlock=resolve;});
    const entered=new Promise<void>(resolve=>{started=resolve;});
    let patches=0;
    const api=new HufsApiClient(async url=>{
      if(url==='/api/auth/csrf')return response({csrfToken:csrf});
      patches++;started();await gate;
      return response({item:advanced(legacy,'PREPARING')});
    });
    const ctrl=new OwnerSessionController({getSession:async()=>({
      actorId:'SYN-ACTOR',role:'BETA',schoolMailProofValid:true,betaAllowed:true,
    })});
    await ctrl.initialize();
    const first=ctrl.runMutation(signal=>api.owner.advanceBookmarkStage(legacy,{stage:'PREPARING'},signal));
    await entered;
    const duplicate=vi.fn(signal=>api.owner.advanceBookmarkStage(legacy,{stage:'PREPARING'},signal));
    expect(await ctrl.runMutation(duplicate)).toBeNull();
    expect(patches).toBe(1);expect(duplicate).not.toHaveBeenCalled();
    unlock();expect((await first)?.item.version).toBe(2);
    ctrl.dispose();
  });

  it('does not surface a late successful PATCH after a cross-tab session close',async()=>{
    let complete!:(reply:Response)=>void,started!:()=>void;
    const queued=new Promise<Response>(resolve=>{complete=resolve;});
    const entered=new Promise<void>(resolve=>{started=resolve;});
    const urls:string[]=[];
    const api=new HufsApiClient(async url=>{
      urls.push(url);
      if(url==='/api/auth/session')return response({
        actorId:'SYN-ACTOR',role:'BETA',schoolMailProofValid:true,betaAllowed:true,
      });
      if(url==='/api/auth/csrf')return response({csrfToken:csrf});
      started();
      return queued; // Network transport deliberately ignores AbortSignal.
    });
    const ctrl=new OwnerSessionController(api);
    await ctrl.initialize();
    const pending=ctrl.runMutation(signal=>
      api.owner.advanceBookmarkStage(legacy,{stage:'PREPARING'},signal));
    await entered;
    ctrl.invalidateLocalSession();
    complete(response({item:advanced(legacy,'PREPARING')}));
    expect(await pending).toBeNull();
    expect(ctrl.getState()).toMatchObject({status:'SIGNED_OUT',error:null});
    expect(urls.filter(url=>url==='/api/saved-items/SYN-BM-1')).toHaveLength(1);
    expect(await ctrl.runMutation(signal=>
      api.owner.advanceBookmarkStage(legacy,{stage:'PREPARING'},signal))).toBeNull();
    ctrl.dispose();
  });

  it('does not issue PATCH if the caller aborts during CSRF fetch',async()=>{
    const stop=new AbortController(),urls:string[]=[];
    const owner=new HufsApiClient(async(url)=>{
      urls.push(url);stop.abort();
      return response({csrfToken:csrf});
    }).owner;
    await expect(owner.advanceBookmarkStage(legacy,{stage:'PREPARING'},stop.signal))
      .rejects.toMatchObject({name:'AbortError'});
    expect(urls).toEqual(['/api/auth/csrf']);
  });
});
