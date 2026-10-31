import {describe,expect,it} from 'vitest';
import {HufsApiClient,HufsApiError} from '../../apps/web/src/integrations/api-client.js';
import type {ApiFetch} from '../../apps/web/src/integrations/api-client.js';
import profiles from '../../packages/fixtures/synthetic/demo-profiles.json';
import snapshot from '../../packages/fixtures/synthetic/demo-snapshot.json';

const respond=(data:unknown,status=200):Response=>new Response(JSON.stringify(data),{
  status,headers:{'content-type':'application/json'},
});
const csrfToken='C'.repeat(32);
const reviewerCapabilities={
  role:'REVIEWER',dataMode:'SYNTHETIC',sandboxOnly:true,ncpCalls:false,
  externalSubmission:false,aiProvenance:'MOCK',actualBrowserUiVerified:false,
  sections:['TODAY','OPPORTUNITIES','NOTICES','EXPERIENCE','GRADUATION',
    'COURSE_PLANNER','OUTLOOK','SAVED','APPLICATIONS','SETTINGS'],
  actions:['BOOKMARK','MARK_READ','CHECKLIST','EXPERIENCE',
    'APPLICATION_DRAFT','SIMULATE_APPLICATION','SET_INTERESTS',
    'SET_DESIRED_JOBS','PLAN_COURSE','SET_SEARCH','SET_NOTIFICATIONS',
    'RESET_SANDBOX'],
};

describe('reviewer API consumer (isolated synthetic HTTP responses)',()=>{
  it('validates REVIEWER manifest and all five SYNTHETIC profile slots',async()=>{
    const calls:string[]=[];
    const transport:ApiFetch=async(url)=>{
      calls.push(url);
      if(url==='/api/reviewer/capabilities')return respond(reviewerCapabilities);
      if(url==='/api/reviewer/demo/profiles')return respond(profiles);
      throw new Error('not an allowed endpoint');
    };
    const client=new HufsApiClient(transport);
    expect((await client.loadReviewerCapabilities()).sandboxOnly).toBe(true);
    expect((await client.listReviewerProfiles()).map(p=>p.demoSubjectId))
      .toEqual(['S01','S02','S03','S04','S05']);
    expect(calls).toEqual(['/api/reviewer/capabilities','/api/reviewer/demo/profiles']);
  });

  it('rejects any reviewer manifest with external submission or NCP enabled',async()=>{
    for(const patch of [{ncpCalls:true},{externalSubmission:true},
      {dataMode:'REAL_CONSENTED'},{sandboxOnly:false},{aiProvenance:'LIVE_NCP'},
      {studentRecord:'unreviewed'},
      {sections:['ADMIN']},{actions:['EXPORT_PRIVATE_RECORDS']},
      {sections:['TODAY','TODAY']},{actions:['BOOKMARK','BOOKMARK']}]){
      const client=new HufsApiClient(async()=>respond({...reviewerCapabilities,...patch}));
      await expect(client.loadReviewerCapabilities()).rejects.toMatchObject({
        code:'PROVIDER_UNAVAILABLE',
      });
    }
  });

  it('rejects reviewer profile that is not fully synthetic',async()=>{
    const client=new HufsApiClient(async()=>respond({profiles:profiles.profiles.map(
      (p,i)=>i===0?{...p,dataMode:'REAL_CONSENTED'}:p,
    )}));
    await expect(client.listReviewerProfiles()).rejects.toMatchObject({code:'FORBIDDEN'});
  });

  it('rejects live NCP/foreign evidence in reviewer snapshots',async()=>{
    const url='/api/reviewer/demo/subjects/S01/snapshot';
    for(const malicious of [
      {...snapshot,datasetMode:'REAL_CONSENTED'},
      {...snapshot,aiProvenance:'LIVE_NCP'},
      {...snapshot,demoSubjectId:'S02'},
      {...snapshot,feed:{...snapshot.feed,featured:[{
        ...snapshot.feed.featured[0],evidenceRefs:['EV-REAL-STUDENT'],
      }]}},
      {...snapshot,notices:{...snapshot.notices,items:[{
        ...snapshot.notices.items[0],noticeId:'REAL-NOT-001',
      }]}},
    ]){
      const client=new HufsApiClient(async(requestUrl)=>{
        expect(requestUrl).toBe(url);
        return respond(malicious);
      });
      // Invalid wire schemas are 503; valid-but-crossing the sandbox boundary are 403.
      // Both must reject without returning any student data to the UI.
      await expect(client.getReviewerSnapshot('S01'))
        .rejects.toBeInstanceOf(HufsApiError);
    }
    const good=new HufsApiClient(async()=>respond(snapshot));
    expect((await good.getReviewerSnapshot('S01')).datasetMode).toBe('SYNTHETIC');
    await expect(good.getReviewerSnapshot('S06' as never)).rejects.toMatchObject({
      code:'INVALID_INPUT',
    });
  });

  it('transmits invite only in POST body with same-origin CSRF; no URL/session storage',async()=>{
    const enrollmentCode='A'.repeat(43);
    const calls:Array<{url:string;init:RequestInit}>=[];
    const transport:ApiFetch=async(url,init)=>{
      calls.push({url,init});
      if(url==='/api/auth/csrf')return respond({csrfToken});
      if(url==='/api/reviewer/invitations/redeem')return respond({
        role:'REVIEWER',accessEndsAt:'2026-11-05T00:00:00.000Z',
        dataMode:'SYNTHETIC',readOnly:false,sandboxOnly:true,
      });
      throw new Error('unexpected route');
    };
    const client=new HufsApiClient(transport);
    expect((await client.redeemReviewerInvite(enrollmentCode)).role).toBe('REVIEWER');
    expect(calls.map(x=>x.url)).toEqual([
      '/api/auth/csrf','/api/reviewer/invitations/redeem',
    ]);
    expect(calls[1]!.init.method).toBe('POST');
    expect(calls[1]!.init.credentials).toBe('same-origin');
    expect(calls[1]!.init.cache).toBe('no-store');
    expect((calls[1]!.init.headers as Record<string,string>)['x-csrf-token']).toBe(csrfToken);
    expect(JSON.parse(calls[1]!.init.body as string)).toEqual({enrollmentCode});
    expect(calls.every(x=>!x.url.includes(enrollmentCode))).toBe(true);
    await expect(client.createContext('S09' as never,'RUN-1')).rejects
      .toMatchObject({code:'INVALID_INPUT'});
    await expect(client.redeemReviewerInvite('not-valid')).rejects.toMatchObject({
      code:'INVALID_INPUT',
    });
  });

  it('does not forward an unknown AI task or malformed packet to the API',async()=>{
    let count=0;
    const client=new HufsApiClient(async()=>{count++;throw new Error('must not call');});
    await expect(client.submitSyntheticAi(
      'unapproved-fifth-task' as never,'PACKET','IDEMPOTENCY-1',
    )).rejects.toMatchObject({code:'INVALID_INPUT'});
    await expect(client.submitSyntheticAi('experience-skills','../bad','IDEMPOTENCY-1'))
      .rejects.toMatchObject({code:'INVALID_INPUT'});
    expect(count).toBe(0);
  });
});
