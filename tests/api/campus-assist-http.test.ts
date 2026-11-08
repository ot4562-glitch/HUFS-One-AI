import {afterEach,describe,expect,it,vi} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import type {CampusAssistServices} from '../../apps/api/src/modules/campus-assist-http.js';
import {closedRepository} from '../../apps/api/src/repository.js';
import {SYNTHETIC_ACTIVITIES,SYNTHETIC_PARTNERS,SYNTHETIC_FAQ_DOCUMENTS}
  from '../../apps/web/src/features/campus-assist/synthetic.js';
const NOW='2026-11-08T00:00:00Z',ORIGIN='https://synthetic.invalid';
const actor={role:'BETA' as const,actorId:'SYN-OWNER',sessionIdHash:'H'.repeat(32),csrfToken:'C'.repeat(32),
  betaAllowed:true,sessionExpiresAt:'2026-12-01T00:00:00Z',schoolMailProofExpiresAt:'2026-12-01T00:00:00Z'};
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(a=>a.close()));});
function fixture(hcx007?:NonNullable<CampusAssistServices['hcx007']>){
  let enabled=true,rights=true,sameActor=true;
  const receipt={actorId:actor.actorId,sourceVersion:'SYN-REV-1',expiresAt:'2026-12-01T00:00:00Z'};
  const activities={read:vi.fn(async()=>({items:SYNTHETIC_ACTIVITIES,receipt})),
    revalidate:vi.fn(async()=>rights)};
  const exchange={read:vi.fn(async()=>({items:SYNTHETIC_PARTNERS,receipt})),
    revalidate:vi.fn(async()=>rights)};
  const faq={read:vi.fn(async()=>({items:SYNTHETIC_FAQ_DOCUMENTS,receipt})),
    revalidate:vi.fn(async()=>rights)};
  const app=createIntegratedApi({
    allowedOrigin:ORIGIN,repository:closedRepository,now:()=>NOW,
    auth:{verifySession:async()=>enabled?(sameActor?actor:{...actor,actorId:'SYN-OTHER'}):null,
      revokeSession:async()=>{}},campusAssist:{activities,exchange,faq,...(hcx007?{hcx007}:{})},
  });
  apps.push(app);
  const post=(url:string,payload:object)=>app.inject({method:'POST',url,
    headers:{origin:ORIGIN,'x-csrf-token':actor.csrfToken},payload});
  return {app,post,activities,exchange,faq,logout:()=>{enabled=false;},
    revoke:()=>{rights=false;},switchActor:()=>{sameActor=false;}};
}
describe('authenticated campus assistance route boundaries (#339 #340 #341)',()=>{
  it('aborts HCX execution if data rights are revoked while budget admission is in flight',async()=>{
    let revokeRights=()=>{};
    const provider:NonNullable<CampusAssistServices['hcx007']>={
      admit:vi.fn(async()=>{revokeRights();return true;}),
      execute:vi.fn(async()=>({status:{code:'20000'}})),
    };
    const h=fixture(provider);
    revokeRights=h.revoke;
    const r=await h.post('/api/owner/faq/ask',{asOf:NOW,question:'가상 교환학생 어학'});
    expect(r.statusCode).toBe(403);
    expect(provider.admit).toHaveBeenCalledOnce();
    expect(provider.execute).not.toHaveBeenCalled();
  });

  it('scopes activity reads to an authorized, revalidated snapshot',async()=>{
    const h=fixture(),r=await h.app.inject({url:'/api/owner/activities?asOf='+encodeURIComponent(NOW)});
    expect(r.statusCode).toBe(200);
    expect(r.json().items.length).toBe(9);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(h.activities.read).toHaveBeenCalledTimes(1);
    expect(h.activities.revalidate).toHaveBeenCalledTimes(1);
    const next=await h.app.inject({url:'/api/owner/activities/forecast?asOf='+encodeURIComponent(NOW)
      +'&targetYear=2027&organizationId=SYN-ECON&seriesId=orientation'});
    expect(next.statusCode).toBe(200);
    expect(next.json().state).toBe('PREDICTED');
  });
  it('enforces CSRF and never trusts browser supplied actor, source or student record',async()=>{
    const h=fixture();
    const body={asOf:NOW,partnerId:'SYN-PARTNER-1',applicant:{duration:1,track:'OIA',
      status:'ENROLLED',completedSemesters:3,gpa:3.2,transfer:false,
      previousCancellation:'CLEAR'}};
    expect((await h.post('/api/owner/exchange/evaluate',body)).json().result).toBe('UNKNOWN');
    // No language evidence is present, so never automatically approve a partner.
    expect((await h.app.inject({method:'POST',url:'/api/owner/exchange/evaluate',payload:body})).statusCode).toBe(403);
    expect((await h.post('/api/owner/exchange/evaluate',{...body,actorId:'SYN-OTHER'})).statusCode).toBe(422);
    expect((await h.post('/api/owner/exchange/evaluate',{...body,partnerId:'UNKNOWN-PARTNER'})).json().result).toBe('UNKNOWN');
  });
  it('keeps default FAQ model unavailable without an explicit paid-provider port',async()=>{
    const h=fixture(),r=await h.post('/api/owner/faq/ask',{asOf:NOW,question:'가상 교환학생 어학'});
    expect(r.statusCode).toBe(200);
    expect(r.json().status).toBe('CONFIGURATION_REQUIRED');
    expect(r.body).not.toContain('가상 파견대학의 어학 점수는');
    const none=await h.post('/api/owner/faq/ask',{asOf:NOW,question:'양자악어비행선'});
    expect(none.json().status).toBe('NOT_FOUND');
  });
  it('revoked rights or logout fail closed for all three features',async()=>{
    const h=fixture();h.revoke();
    expect((await h.app.inject({url:'/api/owner/activities?asOf='+encodeURIComponent(NOW)})).statusCode).toBe(403);
    expect((await h.post('/api/owner/faq/ask',{asOf:NOW,question:'가상 교환학생 어학'})).statusCode).toBe(403);
    h.logout();
    expect((await h.app.inject({url:'/api/owner/activities?asOf='+encodeURIComponent(NOW)})).statusCode).toBe(401);
  });
  it('protected production routes deny requests without independently injected source ports',async()=>{
    const app=createIntegratedApi({allowedOrigin:ORIGIN,repository:closedRepository,
      now:()=>NOW,auth:{verifySession:async()=>actor,revokeSession:async()=>{}}});
    apps.push(app);
    expect((await app.inject({url:'/api/owner/activities?asOf='+encodeURIComponent(NOW)})).statusCode).toBe(403);
    expect((await app.inject({method:'POST',url:'/api/owner/faq/ask',payload:{asOf:NOW,question:'질문'}})).statusCode).toBe(403);
  });
  it('#365 partner list and evaluation agree at KST day boundaries',async()=>{
    const h=fixture();
    const base=SYNTHETIC_PARTNERS[0]!;
    const policy={...base,publishedAt:'2026-11-01T00:00:00Z',verifiedAt:'2026-11-01T00:00:00Z',
      effectiveFrom:'2026-11-08',effectiveUntil:'2026-11-07'};
    const check=async(rule:Omit<typeof policy,'effectiveUntil'>&{effectiveUntil?:string},asOf:string)=>{
      h.exchange.read.mockResolvedValue({items:[rule],receipt:{actorId:actor.actorId,
        sourceVersion:'SYN-REV-1',expiresAt:'2026-12-01T00:00:00Z'}});
      const list=await h.app.inject({url:'/api/owner/exchange/partners?asOf='+encodeURIComponent(asOf)});
      const listed=(list.json().partners as {partnerId:string}[]).some(p=>p.partnerId===rule.partnerId);
      const evaluated=(await h.post('/api/owner/exchange/evaluate',{asOf,partnerId:rule.partnerId,
        applicant:{duration:1,track:rule.track,status:'ENROLLED',completedSemesters:3,gpa:3.2,
          transfer:false,previousCancellation:'CLEAR'}})).json();
      const inEffect=evaluated.checks.find((c:{code:string})=>c.code==='TRACK').status==='PASS';
      return [listed,inEffect];
    };
    const {effectiveUntil:_openEnded,...starts}=policy;
    // Issue example 1: KST 00:30 on the start day -> both see the policy.
    expect(await check(starts,'2026-11-08T00:30:00+09:00')).toEqual([true,true]);
    expect(await check(starts,'2026-11-07T23:30:00+09:00')).toEqual([false,false]);
    // Issue example 2: KST 00:30 after the (inclusive) end day -> neither sees it.
    const ends={...policy,effectiveFrom:'2026-11-01'};
    expect(await check(ends,'2026-11-08T00:30:00+09:00')).toEqual([false,false]);
    expect(await check(ends,'2026-11-07T23:30:00+09:00')).toEqual([true,true]);
    // The same instants written in UTC must give the same answers (the list used
    // to compare the request string's own calendar date).
    expect(await check(starts,'2026-11-07T15:30:00Z')).toEqual([true,true]);
    expect(await check(ends,'2026-11-07T15:30:00Z')).toEqual([false,false]);
    expect(await check(ends,'2026-11-07T14:30:00Z')).toEqual([true,true]);
  });
  it('#379 historical editions no longer hide the current exchange policy',async()=>{
    const h=fixture();
    const base=SYNTHETIC_PARTNERS[0]!;
    const old={...base,sourceRevision:'syn-old',effectiveFrom:'2025-01-01',effectiveUntil:'2025-12-31'};
    const neu={...base,sourceRevision:'syn-new',effectiveFrom:'2026-01-01',effectiveUntil:'2026-12-31'};
    h.exchange.read.mockResolvedValue({items:[old,neu],receipt:{actorId:actor.actorId,
      sourceVersion:'SYN-REV-1',expiresAt:'2026-12-01T00:00:00Z'}});
    const asOf='2026-09-01T00:00:00+09:00';
    const list=(await h.app.inject({url:'/api/owner/exchange/partners?asOf='+encodeURIComponent(asOf)})).json();
    const row=(list.partners as {partnerId:string;sourceRevision:string}[]).find(p=>p.partnerId===base.partnerId);
    expect(row?.sourceRevision).toBe('syn-new');
    const evaluated=(await h.post('/api/owner/exchange/evaluate',{asOf,partnerId:base.partnerId,
      applicant:{duration:1,track:base.track,status:'ENROLLED',completedSemesters:3,gpa:3.2,
        transfer:false,previousCancellation:'CLEAR'}})).json();
    expect(evaluated.policyRevision).toBe('syn-new');
  });
});
