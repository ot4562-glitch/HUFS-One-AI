import {afterEach,describe,expect,it,vi} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {ExperiencePortfolioSchema} from '@hufs-one/contracts';

const now='2026-11-05T00:00:00.000Z',origin='https://example.test';
const owner={actorId:'OWNER-A',role:'BETA' as const,sessionIdHash:'H'.repeat(32),csrfToken:'C'.repeat(32),
  betaAllowed:true,sessionExpiresAt:'2026-11-10T00:00:00.000Z',schoolMailProofExpiresAt:'2026-11-10T00:00:00.000Z'};
const item={itemId:'EXP-1',version:3,updatedAt:now,value:{kind:'EXPERIENCE' as const,
  dataMode:'OWNER_CONSENTED' as const,state:'SELF_REPORTED' as const,title:'Project',summary:'Prepared a chart'}};
const consent={version:2,updatedAt:now,choices:{personalStorage:true,teamReview:true,externalAi:true,ncpStorage:true,presentation:true}};
const approval={state:'ACTIVE' as const,version:1,contentVersion:3,consentVersion:2,
  topics:['DATA_ANALYTICS'],approvedAt:now,provenance:'LOCAL_USER_SELECTION' as const};
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(app=>app.close()));});
function setup(configured=true,authenticated=true){
  let live=authenticated;
  const list=vi.fn(async()=>({items:[structuredClone(item)],nextCursor:null}));
  const workspace={list,read:vi.fn(async()=>structuredClone(item)),create:vi.fn(),update:vi.fn(),delete:vi.fn()};
  const accounts={readConsents:vi.fn(async()=>structuredClone(consent)),readProfile:vi.fn(),patchProfile:vi.fn(),putConsents:vi.fn()};
  const approvals={read:vi.fn(async()=>structuredClone(approval)),approve:vi.fn(),revoke:vi.fn(),readApprovedTopics:vi.fn()};
  const app=createIntegratedApi({allowedOrigin:origin,repository:new MemoryApiRepository({profiles:[]}),now:()=>now,
    auth:{verifySession:async()=>live?owner:null,revokeSession:async()=>{live=false;}},
    ownerWorkspace:workspace,...(configured?{selfAccount:accounts,experienceApproval:approvals}:{}),
  } as any);
  apps.push(app);
  return {app,list,workspace,accounts,approvals,revoke(){live=false;}};
}

describe('GET experience cards explicit portfolio view',()=>{
  it('keeps the default existing list byte-compatible and adds the requested portfolio only',async()=>{
    const h=setup();
    const legacy=await h.app.inject({url:'/api/experience/cards'});
    expect(legacy.statusCode).toBe(200);expect(legacy.json()).toEqual({items:[item],nextCursor:null});
    expect(h.accounts.readConsents).not.toHaveBeenCalled();
    const res=await h.app.inject({url:'/api/experience/cards?view=portfolio&limit=10'});
    expect(res.statusCode).toBe(200);expect(res.headers['cache-control']).toBe('no-store');
    const parsed=ExperiencePortfolioSchema.parse(res.json());
    expect(parsed.portfolio.topics).toEqual([{topicCode:'DATA_ANALYTICS',experienceIds:['EXP-1']}]);
    expect(h.list).toHaveBeenLastCalledWith({actorId:'OWNER-A',kind:'EXPERIENCE',limit:10});
    expect(h.approvals.approve).not.toHaveBeenCalled();
  });
  it('requires authentication before any content is listed',async()=>{
    const h=setup(true,false),res=await h.app.inject({url:'/api/experience/cards?view=portfolio'});
    expect(res.statusCode).toBe(401);expect(h.list).not.toHaveBeenCalled();
  });
  it('reports missing server ports instead of a fake empty or unapproved portfolio',async()=>{
    const h=setup(false),res=await h.app.inject({url:'/api/experience/cards?view=portfolio'});
    expect(res.statusCode).toBe(503);expect(h.list).not.toHaveBeenCalled();
  });
  it('rejects spoofed actor parameters, invalid view, and oversized bounded aggregation',async()=>{
    const h=setup();
    for(const query of ['view=portfolio&actorId=OTHER','view=portfolio&limit=21','view=admin'])
      expect((await h.app.inject({url:'/api/experience/cards?'+query})).statusCode).toBe(422);
    expect((await h.app.inject({url:'/api/study-plans?view=portfolio'})).statusCode).toBe(422);
    expect(h.list).not.toHaveBeenCalled();
  });
  it('rechecks session after asynchronous portfolio assembly and suppresses late data',async()=>{
    const h=setup();h.approvals.read.mockImplementation(async()=>{h.revoke();return structuredClone(approval);});
    const res=await h.app.inject({url:'/api/experience/cards?view=portfolio'});
    expect(res.statusCode).toBe(401);expect(res.body).not.toContain('Prepared a chart');
  });
  it('rejects fabricated aggregate topics not backed by a current approval',async()=>{
    const h=setup(),res=await h.app.inject({url:'/api/experience/cards?view=portfolio'});
    const raw=res.json();raw.portfolio.topics=[{topicCode:'DATA_ANALYTICS',experienceIds:['OTHER']}];
    expect(ExperiencePortfolioSchema.safeParse(raw).success).toBe(false);
  });
});
