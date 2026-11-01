import {describe,expect,it,vi} from 'vitest';
import {DemoContextSchema,makeApiError} from '@hufs-one/contracts';
import {HufsApiClient} from '../../apps/web/src/integrations/api-client.js';
import snapshot from '../../packages/fixtures/synthetic/demo-snapshot.json';

// Fictitious data only; expectations are independent of the client under test.
const context=DemoContextSchema.parse({contextId:'SYN-CTX-1',actorId:'SYN-ACTOR',
  demoSubjectId:'S01',demoRunId:'RUN1',sessionIdHash:'SYN-SESSION',
  datasetVersion:'D1',projectionVersion:'PR1',sharingGrantVersion:'C1',
  expiresAt:'2026-12-01T00:00:00.000Z'});
const csrfToken='C'.repeat(32);
const overlay=(version=1,value:Record<string,unknown>={interestTopics:['AI_ML']})=>({
  overlay:{version,value,updatedAt:version===0?null:snapshot.asOf},
  snapshot:{...snapshot,contextId:context.contextId,
    versions:{...snapshot.versions,overlay:'BETA_OVERLAY:'+version}},
  calendar:{asOf:snapshot.asOf,from:'2026-10-23T09:00:00.000Z',to:'2026-11-30T09:00:00.000Z',
    entries:[],undated:[],needsConfirmation:[],ambiguousNoticeIds:[]},
});
const approval={state:'ACTIVE' as const,version:1,contentVersion:3,consentVersion:4,
  topics:['AI_ML'],approvedAt:snapshot.asOf,provenance:'LOCAL_USER_SELECTION' as const};
const put={expectedApprovalVersion:0,expectedContentVersion:3,expectedConsentVersion:4,
  topics:['AI_ML' as const]};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{
  status,headers:{'content-type':'application/json'},
});

describe('owner platform browser integration: overlay and local tag approval',()=>{
  it('reads an overlay with one bounded same-origin GET and the caller signal',async()=>{
    const transport=vi.fn(async()=>json(overlay()));
    const client=new HufsApiClient(transport),abort=new AbortController();
    expect(await client.getDemoOverlay(context,abort.signal)).toEqual(overlay());
    expect(transport).toHaveBeenCalledWith('/api/demo/contexts/SYN-CTX-1/overlay',
      expect.objectContaining({method:'GET',credentials:'same-origin',cache:'no-store',
        redirect:'error',mode:'same-origin',referrerPolicy:'no-referrer',signal:abort.signal}));
  });
  it('uses a fresh CSRF proof for PATCH/reset without sending actor or context objects',async()=>{
    const calls:Array<{url:string;init:RequestInit}>=[];
    const client=new HufsApiClient(async(url,init)=>{
      calls.push({url,init});
      return json(url==='/api/auth/csrf'?{csrfToken}:url.endsWith('/reset')?overlay(2,{}):overlay());
    });
    const change={expectedVersion:0,value:{interestTopics:['AI_ML' as const]}};
    expect((await client.setDemoOverlay(context,change)).overlay.version).toBe(1);
    expect(calls[1]).toMatchObject({url:'/api/demo/contexts/SYN-CTX-1/overlay',
      init:{method:'PATCH',body:JSON.stringify(change),headers:{'x-csrf-token':csrfToken,
        'content-type':'application/json'}}});
    expect((await client.resetDemoOverlay(context,1)).overlay.value).toEqual({});
    expect(calls.map(x=>x.url)).toEqual(['/api/auth/csrf','/api/demo/contexts/SYN-CTX-1/overlay',
      '/api/auth/csrf','/api/demo/contexts/SYN-CTX-1/reset']);
    expect(calls[3]!.init.body).toBe('{"expectedVersion":1}');
    expect(calls.every(x=>!String(x.init.body??'').includes('actorId'))).toBe(true);
  });
  it.each(['contextId','demoSubjectId','dataset','projection','consent'] as const)(
    'rejects schema-valid cross-binding %s',async field=>{
      const result=overlay();
      if(field==='contextId')result.snapshot.contextId='SYN-OTHER';
      else if(field==='demoSubjectId')result.snapshot.demoSubjectId='S02';
      else result.snapshot.versions[field]='OTHER-VERSION';
      const client=new HufsApiClient(async()=>json(result));
      await expect(client.getDemoOverlay(context)).rejects.toMatchObject({code:'VERSION_CONFLICT',status:409});
    });
  it.each(['calendar','feed','notices','overlay'] as const)(
    'refuses an internally inconsistent %s in a 200 response',async field=>{
      const result=overlay();
      if(field==='overlay')result.snapshot.versions.overlay='BETA_OVERLAY:2';
      else if(field==='calendar')result.calendar.asOf='2026-10-31T09:00:00.000Z';
      else if(field==='feed')result.snapshot.feed={...result.snapshot.feed,asOf:'2026-10-31T09:00:00.000Z'};
      else result.snapshot.notices={...result.snapshot.notices,asOf:'2026-10-31T09:00:00.000Z'};
      const client=new HufsApiClient(async()=>json(result));
      await expect(client.getDemoOverlay(context)).rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE',status:503});
    });
  it('rejects a non-CAS mutation response and a reset that kept preferences',async()=>{
    const client=new HufsApiClient(async url=>json(url==='/api/auth/csrf'?{csrfToken}:overlay()));
    await expect(client.setDemoOverlay(context,{expectedVersion:1,value:{}}))
      .rejects.toMatchObject({code:'VERSION_CONFLICT'});
    await expect(client.resetDemoOverlay(context,0)).rejects.toMatchObject({code:'VERSION_CONFLICT'});
  });
  it('refuses malformed context and overlay input before even requesting CSRF',async()=>{
    const transport=vi.fn(async()=>json({csrfToken})),client=new HufsApiClient(transport);
    await expect(client.getDemoOverlay({...context,contextId:'../other'})).rejects.toMatchObject({code:'INVALID_INPUT'});
    await expect(client.setDemoOverlay(context,{expectedVersion:-1,value:{}}))
      .rejects.toMatchObject({code:'INVALID_INPUT'});
    await expect(client.setDemoOverlay(context,{expectedVersion:0,value:{actorId:'spoof'}} as never))
      .rejects.toMatchObject({code:'INVALID_INPUT'});
    await expect(client.resetDemoOverlay(context,Number.MAX_SAFE_INTEGER))
      .rejects.toMatchObject({code:'INVALID_INPUT'});
    expect(transport).not.toHaveBeenCalled();
  });
  it('reads/approves/revokes tags using strict local-only versioned DTOs',async()=>{
    const calls:Array<{url:string;init:RequestInit}>=[];
    const client=new HufsApiClient(async(url,init)=>{
      calls.push({url,init});
      return json(url==='/api/auth/csrf'?{csrfToken}:{approval:init.method==='DELETE'
        ?{state:'INACTIVE',version:2,reason:'REVOKED'}:approval});
    });
    expect((await client.getExperienceTagApproval('EXP1')).approval).toEqual(approval);
    expect((await client.approveExperienceTags('EXP1',put)).approval.state).toBe('ACTIVE');
    expect(calls[2]).toMatchObject({url:'/api/experience/cards/EXP1/tag-approval',
      init:{method:'PUT',body:JSON.stringify(put),headers:{'x-csrf-token':csrfToken}}});
    const revoke={expectedApprovalVersion:1,expectedContentVersion:3,expectedConsentVersion:4};
    expect((await client.revokeExperienceTags('EXP1',revoke)).approval.state).toBe('INACTIVE');
    expect(calls[4]!.init.method).toBe('DELETE');
    expect(calls[4]!.init.body).toBe(JSON.stringify(revoke));
  });
  it('accepts an idempotent no-approval revocation without inventing a version',async()=>{
    const client=new HufsApiClient(async url=>json(url==='/api/auth/csrf'?{csrfToken}
      :{approval:{state:'INACTIVE',version:0,reason:'NOT_APPROVED'}}));
    const {topics:_,...input}=put;
    expect((await client.revokeExperienceTags('EXP1',input)).approval.version).toBe(0);
  });
  it.each(['version','contentVersion','consentVersion','topics'] as const)(
    'rejects a mismatched approval %s',async field=>{
      const wrong={...approval,...(field==='topics'?{topics:['DATA_ANALYTICS']}:{[field]:5})};
      const client=new HufsApiClient(async url=>json(url==='/api/auth/csrf'?{csrfToken}:{approval:wrong}));
      await expect(client.approveExperienceTags('EXP1',put)).rejects.toMatchObject({code:'VERSION_CONFLICT'});
    });
  it('rejects invalid ID, duplicate tags, extra identity and foreign provenance',async()=>{
    const transport=vi.fn(async()=>json({csrfToken})),client=new HufsApiClient(transport);
    for(const id of ['../other','',undefined,null,{},'a'.repeat(91)])
      await expect(client.getExperienceTagApproval(id as never)).rejects.toMatchObject({code:'INVALID_INPUT'});
    for(const input of [{...put,topics:['AI_ML','AI_ML']},{...put,actorId:'SYN-SPOOF'}])
      await expect(client.approveExperienceTags('EXP1',input as never)).rejects.toMatchObject({code:'INVALID_INPUT'});
    expect(transport).not.toHaveBeenCalled();
    const invalid=new HufsApiClient(async()=>json({approval:{...approval,provenance:'LIVE_NCP'}}));
    await expect(invalid.getExperienceTagApproval('EXP1')).rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE'});
  });
  it.each([['UNAUTHENTICATED',401],['FORBIDDEN',403],['VERSION_CONFLICT',409],
    ['RATE_LIMITED',429],['PROVIDER_UNAVAILABLE',503]] as const)(
    'preserves safe %s failures',async(code,status)=>{
      const client=new HufsApiClient(async()=>json(makeApiError(code,'SYN-REQ'),status));
      await expect(client.getDemoOverlay(context)).rejects.toMatchObject({code,status});
    });
});
