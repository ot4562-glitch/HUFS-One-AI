import {describe,expect,it,vi} from 'vitest';
import {makeApiError} from '@hufs-one/contracts';
import type {OwnerWorkspaceRecord} from '@hufs-one/contracts';
import {HufsApiClient} from '../../apps/web/src/integrations/api-client.js';
import {OwnerSessionController} from '../../apps/web/src/app/owner-session-controller.js';

const csrfToken='C'.repeat(32);
const at='2026-11-20T00:00:00.000Z';
const legacy={kind:'BOOKMARK' as const,dataMode:'SYNTHETIC' as const,
  opportunityId:'SYN-OP-1',state:'SAVED' as const};
const record=(value:OwnerWorkspaceRecord['value']=legacy,version=1):OwnerWorkspaceRecord=>({
  itemId:'SYN-BM-1',version,value,updatedAt:at,
});
const succeeded=(previous:OwnerWorkspaceRecord,stage:string,outcome?:unknown)=>({
  item:{...previous,version:previous.version+1,value:{
    ...previous.value,stage,...(outcome?{outcome}:{}),
  }},
});
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{
  status,headers:{'content-type':'application/json'},
});
const session=(actorId='SYN-OWNER-A')=>({
  actorId,role:'BETA',schoolMailProofValid:true,betaAllowed:true,
});
function harness(result:unknown,status=200){
  const calls:Array<{url:string;init:RequestInit}>=[];
  const fetch=vi.fn(async(url:string,init:RequestInit)=>{
    calls.push({url,init});
    return url==='/api/auth/csrf'?json({csrfToken}):json(result,status);
  });
  return {client:new HufsApiClient(fetch),calls,fetch};
}

describe('Agent 06 owner-only #80 support stage browser contract (synthetic)',()=>{
  it('advances legacy SAVED to PREPARING with exact CAS, fresh CSRF, no original/actor payload',async()=>{
    const before=record(),h=harness(succeeded(before,'PREPARING'));
    const result=await h.client.owner.advanceBookmarkStage(before,{stage:'PREPARING'});
    expect(result.item.version).toBe(2);
    expect(result.item.value).toEqual({...legacy,stage:'PREPARING'});
    expect(h.calls.map(c=>c.url)).toEqual(['/api/auth/csrf','/api/saved-items/SYN-BM-1']);
    expect(h.calls[1]!.init).toMatchObject({method:'PATCH',cache:'no-store',
      credentials:'same-origin',mode:'same-origin',redirect:'error',
      referrerPolicy:'no-referrer',body:'{"expectedVersion":1,"stage":"PREPARING"}'});
    expect((h.calls[1]!.init.headers as Record<string,string>)['x-csrf-token']).toBe(csrfToken);
    expect(h.calls.every(c=>!String(c.init.body??'').includes('SYN-OP-1')
      &&!String(c.init.body??'').includes('actorId'))).toBe(true);
  });

  it('allows only the next user-reported stage; final result is never server-verified',async()=>{
    let current=record();
    const sequence=['PREPARING','SUBMITTED_SELF_REPORTED','AWAITING_RESULT'] as const;
    for(const stage of sequence){
      const next=succeeded(current,stage),h=harness(next);
      const written=await h.client.owner.advanceBookmarkStage(current,{stage});
      expect(written.item).toEqual(next.item);
      current=written.item;
    }
    const outcome={provenance:'USER_ENTERED_UNVERIFIED' as const,
      result:'WAITLISTED' as const,note:'가상 사용자 메모'};
    const final=harness(succeeded(current,'RESULT_RECORDED',outcome));
    const last=await final.client.owner.advanceBookmarkStage(current,{
      stage:'RESULT_RECORDED',outcome,
    });
    expect(last.item.value).toEqual({...legacy,stage:'RESULT_RECORDED',outcome});
    expect(final.calls[1]!.init.body).toBe(JSON.stringify({
      expectedVersion:current.version,stage:'RESULT_RECORDED',outcome,
    }));
  });

  it('rejects forged, skipped, reversed, duplicated or terminal updates before CSRF',async()=>{
    const h=harness({});
    const cases:Array<[unknown,unknown]>=[
      [record(),{stage:'INTERESTED'}],
      [record(),{stage:'AWAITING_RESULT'}],
      [record(),{stage:'RESULT_RECORDED',outcome:{
        provenance:'USER_ENTERED_UNVERIFIED',result:'ACCEPTED',
      }}],
      [record({...legacy,stage:'PREPARING'}),{stage:'PREPARING'}],
      [record({...legacy,stage:'PREPARING'}),{stage:'INTERESTED'}],
      [record({...legacy,stage:'RESULT_RECORDED',outcome:{
        provenance:'USER_ENTERED_UNVERIFIED',result:'OTHER',
      }}),{stage:'PREPARING'}],
      [record(),{stage:'PREPARING',actorId:'SYN-OWNER-B'}],
      [record(),{stage:'PREPARING',expectedVersion:100}],
      [record(),{stage:'PREPARING',opportunityId:'SYN-OTHER'}],
      [record(),{stage:'PREPARING',outcome:{
        provenance:'USER_ENTERED_UNVERIFIED',result:'ACCEPTED',
      }}],
      [record({...legacy,actorId:'SYN-OWNER-B'} as never),{stage:'PREPARING'}],
      [record({kind:'EXPERIENCE',state:'DRAFT',dataMode:'SYNTHETIC',
        title:'Not a bookmark',summary:''}),{stage:'PREPARING'}],
      [{...record(),version:-1},{stage:'PREPARING'}],
      [{...record(),itemId:'../../another'},{stage:'PREPARING'}],
    ];
    for(const [old,change] of cases)
      await expect(h.client.owner.advanceBookmarkStage(old as never,change as never))
        .rejects.toMatchObject({code:'INVALID_INPUT',status:422});
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['other item ID',(item:OwnerWorkspaceRecord)=>({...item,itemId:'SYN-OTHER'}),'VERSION_CONFLICT',409],
    ['wrong kind',(item:OwnerWorkspaceRecord)=>({...item,value:{
      kind:'EXPERIENCE',dataMode:'SYNTHETIC',state:'DRAFT',title:'forged',summary:'',
    }}),'VERSION_CONFLICT',409],
    ['unchanged version',(item:OwnerWorkspaceRecord)=>({...item,version:1}),'VERSION_CONFLICT',409],
    ['wrong opportunity',(item:OwnerWorkspaceRecord)=>({...item,value:{
      ...item.value,opportunityId:'SYN-OTHER',
    }}),'VERSION_CONFLICT',409],
    ['changed dataMode',(item:OwnerWorkspaceRecord)=>({...item,value:{
      ...item.value,dataMode:'OWNER_CONSENTED',
    }}),'VERSION_CONFLICT',409],
    ['wrong stage',(item:OwnerWorkspaceRecord)=>({...item,value:{
      ...item.value,stage:'SUBMITTED_SELF_REPORTED',
    }}),'VERSION_CONFLICT',409],
    ['invented owner result',(item:OwnerWorkspaceRecord)=>({...item,value:{
      ...item.value,outcome:{provenance:'USER_ENTERED_UNVERIFIED',result:'ACCEPTED'},
    }}),'PROVIDER_UNAVAILABLE',503],
  ] as const)('refuses a 200 receipt with %s',async(_label,tamper,code,status)=>{
    const original=record(),receipt=succeeded(original,'PREPARING');
    const h=harness({item:tamper(receipt.item as OwnerWorkspaceRecord)});
    await expect(h.client.owner.advanceBookmarkStage(original,{stage:'PREPARING'}))
      .rejects.toMatchObject({code,status});
  });

  it.each([
    ['UNAUTHENTICATED',401],['FORBIDDEN',403],['VERSION_CONFLICT',409],
    ['INVALID_INPUT',422],['RATE_LIMITED',429],['PROVIDER_UNAVAILABLE',503],
  ] as const)('preserves safe %s/%s from the authenticated owner route',async(code,status)=>{
    const h=harness(makeApiError(code,'SYN-REQ-1'),status);
    await expect(h.client.owner.advanceBookmarkStage(record(),{stage:'PREPARING'}))
      .rejects.toMatchObject({code,status});
  });

  it('cancels after CSRF without sending PATCH, even if transport ignores its signal',async()=>{
    const abort=new AbortController(),urls:string[]=[];
    const client=new HufsApiClient(async(url)=>{
      urls.push(url);
      abort.abort('private request context');
      return json({csrfToken});
    });
    await expect(client.owner.advanceBookmarkStage(record(),{
      stage:'PREPARING',
    },abort.signal)).rejects.toMatchObject({name:'AbortError'});
    expect(urls).toEqual(['/api/auth/csrf']);
  });

  it('one-write owner controller rejects duplicate clicks and stale post-logout replies',async()=>{
    let finish!:(response:Response)=>void;
    const queued=new Promise<Response>(resolve=>{finish=resolve;});
    let patchStarted!:()=>void;
    const started=new Promise<void>(resolve=>{patchStarted=resolve;});
    const requests:string[]=[];
    const client=new HufsApiClient(async url=>{
      requests.push(url);
      if(url==='/api/auth/session')return json(session());
      if(url==='/api/auth/csrf')return json({csrfToken});
      patchStarted();
      return queued;
    });
    const controller=new OwnerSessionController(client);
    await controller.initialize();
    const pending=controller.runMutation(signal=>client.owner.advanceBookmarkStage(
      record(),{stage:'PREPARING'},signal));
    await started;
    const duplicate=vi.fn(async()=>succeeded(record(),'PREPARING'));
    expect(await controller.runMutation(duplicate)).toBeNull();
    expect(duplicate).not.toHaveBeenCalled();
    controller.invalidateLocalSession();
    finish(json(succeeded(record(),'PREPARING')));
    expect(await pending).toBeNull();
    expect(controller.getState().status).toBe('SIGNED_OUT');
    expect(requests.filter(url=>url.endsWith('/SYN-BM-1'))).toHaveLength(1);
    controller.dispose();
  });
});
