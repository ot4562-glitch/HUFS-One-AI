import {afterEach,describe,expect,it} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {DEMO_CLUB_POSTS,DEMO_CLUB_PROFILES} from '../../packages/core/src/opportunities/demo-clubs.js';
import {DEMO_AS_OF} from '../../packages/core/src/opportunities/demo-corpus.js';
import {SyntheticClubBoardResponseSchema} from '@hufs-one/contracts';

const actor={role:'BETA' as const,actorId:'synthetic-student',sessionIdHash:'H'.repeat(32),
  csrfToken:'C'.repeat(32),betaAllowed:true,sessionExpiresAt:'2026-12-01T00:00:00Z',
  schoolMailProofExpiresAt:'2026-12-01T00:00:00Z'};
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{await Promise.all(apps.map(app=>app.close()));apps.length=0;});

function fixture(active=true){
  let stillValid=true;
  const app=createIntegratedApi({allowedOrigin:'https://synthetic.invalid',
    repository:new MemoryApiRepository({profiles:[]}),
    auth:{verifySession:async()=>active?actor:null,revokeSession:async()=>{}},
    now:()=>DEMO_AS_OF,
    syntheticClubs:{source:{
      read:async()=>({posts:DEMO_CLUB_POSTS,profile:DEMO_CLUB_PROFILES[0]!.profile,
        asOf:DEMO_AS_OF,receipt:'r'.repeat(18),revision:'syn-revision-1'}),
      revalidate:async()=>stillValid,
    }},
  });
  apps.push(app);
  return {app,revoke:()=>{stillValid=false;}};
}
describe('#123 synthetic-only club API read gate',()=>{
  it('only serves currently approved, chronologically valid invented content',async()=>{
    const h=fixture(),response=await h.app.inject({method:'GET',url:'/api/synthetic/clubs'});
    expect(response.statusCode).toBe(200);
    const board=SyntheticClubBoardResponseSchema.parse(response.json());
    expect(board.items).toHaveLength(12);
    expect(board.recommendedIds.length).toBeGreaterThan(0);
    expect(board.items.every(x=>x.post.dataMode==='SYNTHETIC')).toBe(true);
    expect(board.items.some(x=>x.post.id==='SYN-CLUB-018')).toBe(false);
    expect(board.approvalNotice).toBe('가상 관리자 승인(시연)');
    expect(board.applicationNotice).toBe('실제 지원 불가');
  });
  it('denies direct access to unapproved, edited and absent clubs',async()=>{
    const h=fixture();
    for(const id of ['SYN-CLUB-013','SYN-CLUB-017','SYN-CLUB-018','SYN-CLUB-099']){
      const response=await h.app.inject({method:'GET',url:'/api/synthetic/clubs/'+id});
      expect(response.statusCode).toBe(403);
      expect(response.json()).not.toHaveProperty('item');
    }
  });
  it('denies revoked reads and browser-supplied profile substitution',async()=>{
    const h=fixture();h.revoke();
    expect((await h.app.inject({method:'GET',url:'/api/synthetic/clubs'})).statusCode).toBe(403);
    expect((await h.app.inject({method:'GET',url:'/api/synthetic/clubs?profile=S02'})).statusCode).toBe(422);
    expect((await fixture(false).app.inject({method:'GET',url:'/api/synthetic/clubs'})).statusCode).toBe(401);
  });
});
