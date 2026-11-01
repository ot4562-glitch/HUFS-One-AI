import {afterEach,describe,expect,it} from 'vitest';
import {createApi} from '../../apps/api/src/server.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import type {VerifiedActor} from '../../apps/api/src/types.js';
import {registerExperienceApprovalRoutes} from '../../apps/api/src/modules/profiles/experience-approval-http.js';
import {ExperienceApprovalConflict,ExperienceApprovalDenied} from
  '../../apps/api/src/modules/profiles/experience-approval-postgres.js';
import type {ExperienceApprovalPort} from
  '../../apps/api/src/modules/profiles/experience-approval-postgres.js';

const NOW='2026-11-01T00:00:00.000Z',origin='https://synthetic.invalid';
const actor={role:'BETA' as const,actorId:'SYN-TAG-OWNER',
  sessionIdHash:'H'.repeat(32),csrfToken:'C'.repeat(32),betaAllowed:true,
  sessionExpiresAt:'2026-11-10T00:00:00Z',schoolMailProofExpiresAt:'2026-11-10T00:00:00Z'};
const body={expectedApprovalVersion:0,expectedContentVersion:1,
  expectedConsentVersion:1,topics:['DATA_ANALYTICS']};
const active={state:'ACTIVE' as const,version:1,contentVersion:1,consentVersion:1,
  topics:['DATA_ANALYTICS' as const],approvedAt:NOW,provenance:'LOCAL_USER_SELECTION' as const};
const url='/api/experience/cards/SYN-EX1/tag-approval',headers={origin,'x-csrf-token':actor.csrfToken};
const apps:Array<ReturnType<typeof createApi>>=[];
afterEach(async()=>{await Promise.all(apps.map(app=>app.close()));apps.length=0;});
function fixture(){
  let session:VerifiedActor|null=actor;
  const calls:unknown[]=[];
  const store:ExperienceApprovalPort={
    read:async input=>{calls.push(input);return active;},
    approve:async input=>{calls.push(input);return active;},
    revoke:async input=>{calls.push(input);return {state:'INACTIVE',version:2,reason:'REVOKED'};},
    readApprovedTopics:async()=>null,
  };
  const verify=async()=>session;
  const app=createApi({allowedOrigin:origin,repository:new MemoryApiRepository({profiles:[]}),
    verifySession:verify,now:()=>NOW});
  registerExperienceApprovalRoutes(app,store,{verify,now:()=>NOW});apps.push(app);
  return {app,store,calls,identity:(next:VerifiedActor|null)=>{session=next;}};
}
describe('explicit local experience tag approval HTTP',()=>{
  it('uses only the authenticated owner, exact versions, no-store and local provenance',async()=>{
    const h=fixture();
    const response=await h.app.inject({method:'PUT',url,headers,payload:body});
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toEqual({approval:active});
    expect(h.calls).toEqual([{actorId:actor.actorId,experienceId:'SYN-EX1',...body}]);
    expect((await h.app.inject({url})).json()).toEqual({approval:active});
    const {topics:_,...versions}=body;
    const revoked=await h.app.inject({method:'DELETE',url,headers,
      payload:{...versions,expectedApprovalVersion:1}});
    expect(revoked.json()).toEqual({approval:{state:'INACTIVE',version:2,reason:'REVOKED'}});
  });
  it('rejects anonymous, reviewer/admin impersonation and browser-invented ownership or provenance',async()=>{
    const h=fixture();h.identity(null);
    expect((await h.app.inject({url,headers:{'x-user-id':actor.actorId}})).statusCode).toBe(401);
    h.identity({...actor,role:'ADMIN'});
    expect((await h.app.inject({url})).statusCode).toBe(403);
    h.identity({role:'REVIEWER',actorId:'SYN-REVIEWER',sessionIdHash:actor.sessionIdHash,
      csrfToken:actor.csrfToken,sessionExpiresAt:actor.sessionExpiresAt,
      verifiedEmail:'reviewer@example.invalid',identityProofExpiresAt:actor.sessionExpiresAt});
    expect((await h.app.inject({url})).statusCode).toBe(403);
    for(const extra of [{actorId:'SYN-OTHER'},{provenance:'LIVE_NCP'},{approved:true}]){
      h.identity(actor);
      expect((await h.app.inject({method:'PUT',url,headers,payload:{...body,...extra}})).statusCode).toBe(422);
    }
    expect(h.calls).toHaveLength(0);
  });
  it('requires mutation Origin/CSRF and rejects current-session loss before exposing stored results',async()=>{
    const h=fixture();
    for(const bad of [{},{origin},{...headers,origin:'https://evil.invalid'}])
      expect((await h.app.inject({method:'PUT',url,headers:bad,payload:body})).statusCode).toBe(403);
    h.store.read=async()=>{h.identity(null);return active;};
    expect((await h.app.inject({url})).statusCode).toBe(401);
    expect(h.calls).toHaveLength(0);
  });
  it('maps CAS/owner errors and sanitizes internal SQL failures',async()=>{
    const h=fixture();
    for(const [error,status] of [[new ExperienceApprovalConflict(),409],
      [new ExperienceApprovalDenied(),403],[Error('SYN-PRIVATE-DB-DETAIL'),503]] as const){
      h.store.approve=async()=>{throw error;};
      const response=await h.app.inject({method:'PUT',url,headers,payload:body});
      expect(response.statusCode).toBe(status);
      expect(response.body).not.toContain('SYN-PRIVATE-DB-DETAIL');
    }
  });
  it('rejects malformed or wrong-version store results before exposing them',async()=>{
    const h=fixture();h.store.approve=async()=>({...active,contentVersion:2});
    expect((await h.app.inject({method:'PUT',url,headers,payload:body})).statusCode).toBe(503);
    h.store.read=async()=>({...active,state:'INACTIVE'} as any);
    const invalid=await h.app.inject({url});expect(invalid.statusCode).toBe(503);
    expect(invalid.body).not.toContain('DATA_ANALYTICS');
  });
});
