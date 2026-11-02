import {afterEach,describe,expect,it} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {SyntheticClubDecisionResponseSchema} from '@hufs-one/contracts';

const at='2026-11-20T00:00:00.000Z',origin='https://synthetic.invalid';
const admin={role:'ADMIN' as const,actorId:'synthetic-moderator',sessionIdHash:'H'.repeat(32),
  csrfToken:'C'.repeat(32),betaAllowed:true,sessionExpiresAt:'2026-12-01T00:00:00Z',
  schoolMailProofExpiresAt:'2026-12-01T00:00:00Z'};
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{await Promise.all(apps.map(a=>a.close()));apps.length=0;});
function fixture(mode:'ADMIN'|'BETA'='ADMIN',approve=true,install=true){
  let permitted=approve,called=0,callbacks=0;
  const app=createIntegratedApi({allowedOrigin:origin,
    repository:new MemoryApiRepository({profiles:[]}),
    auth:{verifySession:async()=>({...admin,role:mode}),revokeSession:async()=>{}},
    adminAuthority:{isApproved:async()=>permitted},now:()=>at,
    syntheticClubs:install?{moderation:{decide:async args=>{
      called++;
      if(!await args.assertCurrentAdmin())return null;
      callbacks++;
      return {id:args.postId,version:args.expectedVersion+1,
        state:args.decision==='APPROVE'?'APPROVED':args.decision==='REJECT'?'REJECTED':'REVOKED',
        mode:'SYNTHETIC_DEMO',approvalNotice:'가상 관리자 승인(시연)'};
    }}}:{},
  });apps.push(app);
  const decide=(payload:Record<string,unknown>,csrf=admin.csrfToken)=>app.inject({
    method:'POST',url:'/api/admin/synthetic/clubs/SYN-CLUB-013/decision',
    headers:{origin,'x-csrf-token':csrf},payload,
  });
  return {decide,seen:()=>({called,callbacks}),revoke:()=>{permitted=false;}};
}
describe('#123 independently authorized simulated club administrator route',()=>{
  it('does not permit student actor or an unapproved operator',async()=>{
    const student=fixture('BETA'),unapproved=fixture('ADMIN',false);
    expect((await student.decide({decision:'APPROVE',expectedVersion:0})).statusCode).toBe(403);
    expect((await unapproved.decide({decision:'APPROVE',expectedVersion:0})).statusCode).toBe(403);
    expect(student.seen()).toEqual({called:0,callbacks:0});
    expect(unapproved.seen()).toEqual({called:0,callbacks:0});
  });
  it('rejects CSRF, browser-supplied approval time and missing moderation provider',async()=>{
    const h=fixture();
    expect((await h.decide({decision:'APPROVE',expectedVersion:0},'wrong')).statusCode).toBe(403);
    expect((await h.decide({decision:'APPROVE',expectedVersion:0,approvedAt:at})).statusCode).toBe(422);
    expect(h.seen()).toEqual({called:0,callbacks:0});
    expect((await fixture('ADMIN',true,false).decide({decision:'APPROVE',expectedVersion:0}))
      .statusCode).toBe(503);
  });
  it('verifies the current independent operator authority before acknowledging a simulated decision',async()=>{
    const h=fixture(),payload={decision:'APPROVE',expectedVersion:0};
    const result=await h.decide(payload);
    expect(result.statusCode).toBe(200);
    expect(SyntheticClubDecisionResponseSchema.parse(result.json())).toMatchObject({
      id:'SYN-CLUB-013',state:'APPROVED',version:1,mode:'SYNTHETIC_DEMO',
    });
    expect(h.seen()).toEqual({called:1,callbacks:1});
    h.revoke();
    expect((await h.decide(payload)).statusCode).toBe(403);
    expect(h.seen()).toEqual({called:1,callbacks:1});
  });
});
