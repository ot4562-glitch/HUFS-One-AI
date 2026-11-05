import {afterEach,describe,expect,it,vi} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';

const now='2026-11-05T00:00:00.000Z',origin='https://example.test';
const jobId='b8a652af-f8b2-49d4-80f0-427cb6cf1b48';
const actor={actorId:'SYN-A',role:'BETA' as const,sessionIdHash:'H'.repeat(32),
  csrfToken:'C'.repeat(32),betaAllowed:true,sessionExpiresAt:'2026-11-10T00:00:00.000Z',
  schoolMailProofExpiresAt:'2026-11-10T00:00:00.000Z'};
const response={experienceId:'SYN-EXP',jobId,contentVersion:2,consentVersion:3,
  state:'NEEDS_REVIEW' as const,candidate:{task:'experience_skills' as const,
    reviewRequired:true as const,reviewState:'NEEDS_REVIEW' as const,
    citations:[{sourceToken:'EXPERIENCE',paragraphId:'TITLE',quote:'Synthetic title'}],
    objectTokens:[],usage:{promptTokens:10,completionTokens:5,totalTokens:15}}};
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(app=>app.close()));});
function setup(){
  let current=true;
  const read=vi.fn(async()=>response);
  const app=createIntegratedApi({
    allowedOrigin:origin,repository:new MemoryApiRepository({profiles:[]}),now:()=>now,
    auth:{verifySession:async()=>current?actor:null,revokeSession:async()=>{current=false;}},
    experienceCandidates:{read},
  } as any);
  apps.push(app);
  return {app,read,revoke(){current=false;}};
}
describe('authenticated experience skill candidate HTTP',()=>{
  it('returns a review-only candidate, no store and no implicit tag approval',async()=>{
    const h=setup(),r=await h.app.inject({url:'/api/experience/cards/SYN-EXP/ai-skills/'+jobId});
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.json()).toEqual(response);
    expect(h.read).toHaveBeenCalledWith({actor,experienceId:'SYN-EXP',jobId});
  });
  it('does not expose candidates without an authenticated BETA session',async()=>{
    const h=setup();h.revoke();
    expect((await h.app.inject({url:'/api/experience/cards/SYN-EXP/ai-skills/'+jobId})).statusCode).toBe(401);
    expect(h.read).not.toHaveBeenCalled();
  });
  it('refuses spoofed actor query, invalid IDs and unavailable candidates',async()=>{
    const h=setup();for(const url of [
      '/api/experience/cards/SYN-EXP/ai-skills/'+jobId+'?actorId=OTHER',
      '/api/experience/cards/%20/ai-skills/'+jobId,
      '/api/experience/cards/SYN-EXP/ai-skills/INVALID']){
      expect((await h.app.inject({url})).statusCode).toBe(422);
    }
    h.read.mockResolvedValueOnce(null as any);
    const res=await h.app.inject({url:'/api/experience/cards/SYN-EXP/ai-skills/'+jobId});
    expect(res.statusCode).toBe(403);expect(res.body).not.toContain('Synthetic title');
  });
  it('rejects late candidate disclosure after session revocation',async()=>{
    const h=setup();h.read.mockImplementationOnce(async()=>{h.revoke();return response;});
    const res=await h.app.inject({url:'/api/experience/cards/SYN-EXP/ai-skills/'+jobId});
    expect(res.statusCode).toBe(401);expect(res.body).not.toContain('Synthetic title');
  });
});
