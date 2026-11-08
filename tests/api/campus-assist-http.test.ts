import {afterEach,describe,expect,it,vi} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {closedRepository} from '../../apps/api/src/repository.js';
import {SYNTHETIC_ACTIVITIES,SYNTHETIC_PARTNERS,SYNTHETIC_FAQ_DOCUMENTS}
  from '../../apps/web/src/features/campus-assist/synthetic.js';
const NOW='2026-11-08T00:00:00Z',ORIGIN='https://synthetic.invalid';
const actor={role:'BETA' as const,actorId:'SYN-OWNER',sessionIdHash:'H'.repeat(32),csrfToken:'C'.repeat(32),
  betaAllowed:true,sessionExpiresAt:'2026-12-01T00:00:00Z',schoolMailProofExpiresAt:'2026-12-01T00:00:00Z'};
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(a=>a.close()));});
function fixture(){
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
      revokeSession:async()=>{}},campusAssist:{activities,exchange,faq},
  });
  apps.push(app);
  const post=(url:string,payload:object)=>app.inject({method:'POST',url,
    headers:{origin:ORIGIN,'x-csrf-token':actor.csrfToken},payload});
  return {app,post,activities,exchange,faq,logout:()=>{enabled=false;},
    revoke:()=>{rights=false;},switchActor:()=>{sameActor=false;}};
}
describe('authenticated campus assistance route boundaries (#339 #340 #341)',()=>{
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
    const none=await h.post('/api/owner/faq/ask',{asOf:NOW,question:'공식 학적 원본 비밀번호'});
    expect(none.json().status).toBe('NOT_FOUND');
  });
  it('revoked rights or logout fail closed for all three features',async()=>{
    const h=fixture();h.revoke();
    expect((await h.app.inject({url:'/api/owner/activities?asOf='+encodeURIComponent(NOW)})).statusCode).toBe(403);
    expect((await h.post('/api/owner/faq/ask',{asOf:NOW,question:'가상 교환학생 어학'})).statusCode).toBe(403);
    h.logout();
    expect((await h.app.inject({url:'/api/owner/activities?asOf='+encodeURIComponent(NOW)})).statusCode).toBe(401);
  });
  it('no production route is exposed without independently injected source ports',async()=>{
    const app=createIntegratedApi({allowedOrigin:ORIGIN,repository:closedRepository,
      now:()=>NOW,auth:{verifySession:async()=>actor,revokeSession:async()=>{}}});
    apps.push(app);
    expect((await app.inject({url:'/api/owner/activities?asOf='+encodeURIComponent(NOW)})).statusCode).toBe(404);
    expect((await app.inject({method:'POST',url:'/api/owner/faq/ask',payload:{asOf:NOW,question:'질문'}})).statusCode).toBe(404);
  });
});
