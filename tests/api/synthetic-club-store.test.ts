import {afterEach,describe,expect,it} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {MemorySyntheticClubDemoStore} from '../../apps/api/src/dev/synthetic-club-store.js';
import {SyntheticClubBoardResponseSchema} from '@hufs-one/contracts';

const at='2026-11-20T00:00:00.000Z',origin='https://synthetic.invalid';
const base={sessionIdHash:'H'.repeat(32),csrfToken:'C'.repeat(32),
  betaAllowed:true,sessionExpiresAt:'2026-12-01T00:00:00Z',
  schoolMailProofExpiresAt:'2026-12-01T00:00:00Z'};
const owners={alpha:{...base,role:'BETA' as const,actorId:'alpha-synthetic'},
  beta:{...base,role:'BETA' as const,actorId:'beta-synthetic'},
  admin:{...base,role:'ADMIN' as const,actorId:'demo-operator'}};
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{await Promise.all(apps.map(app=>app.close()));apps.length=0;});
function preview(wallClock=at){
  const store=new MemorySyntheticClubDemoStore({'alpha-synthetic':'S01','beta-synthetic':'S02'},()=>wallClock);
  let principal:typeof owners[keyof typeof owners]=owners.alpha,operatorAllowed=true;
  const app=createIntegratedApi({allowedOrigin:origin,
    repository:new MemoryApiRepository({profiles:[]}),
    auth:{verifySession:async()=>principal,revokeSession:async()=>{}},
    now:()=>wallClock,adminAuthority:{isApproved:async()=>operatorAllowed},
    syntheticClubs:{source:store.source,moderation:store.moderation}});
  apps.push(app);
  return {
    store,choose:(who:keyof typeof owners)=>{principal=owners[who];},
    denyOperator:()=>{operatorAllowed=false;},
    list:()=>app.inject({method:'GET',url:'/api/synthetic/clubs'}),
    detail:(id:string)=>app.inject({method:'GET',url:'/api/synthetic/clubs/'+id}),
    decide:(id:string,decision:'APPROVE'|'REJECT'|'REVOKE',expectedVersion=0)=>
      app.inject({method:'POST',url:'/api/admin/synthetic/clubs/'+id+'/decision',
        headers:{origin,'x-csrf-token':base.csrfToken},payload:{decision,expectedVersion}}),
  };
}
describe('#123 explicit, ephemeral synthetic server provider',()=>{
  it.each(['2026-11-02T00:00:00.000Z','2026-11-25T00:00:00.000Z'])(
    'uses the board synthetic date for approval when the session clock is %s',async wallClock=>{
      const p=preview(wallClock),id='SYN-CLUB-014';
      p.choose('admin');
      expect((await p.decide(id,'APPROVE')).statusCode).toBe(200);
      p.choose('alpha');
      const board=SyntheticClubBoardResponseSchema.parse((await p.list()).json());
      expect(board.asOf).toBe(at);
      expect(board.items.find(item=>item.post.id===id)?.post.approvedAt).toBe(board.asOf);
      expect((await p.detail(id)).statusCode).toBe(200);
      // Revocation remains visible even when the real and replay dates differ.
      p.choose('admin');
      expect((await p.decide(id,'REVOKE',1)).statusCode).toBe(200);
      p.choose('alpha');
      expect((await p.detail(id)).statusCode).toBe(403);
    });
  it('keeps expired real sessions blocked despite the earlier synthetic replay date',async()=>{
    const p=preview('2026-12-02T00:00:00.000Z');
    p.choose('admin');
    expect((await p.decide('SYN-CLUB-014','APPROVE')).statusCode).toBe(401);
    p.choose('alpha');
    expect((await p.list()).statusCode).toBe(401);
  });
  it('separates five fictional user choices through a trusted server mapping and never returns real posts',async()=>{
    const p=preview();
    const first=SyntheticClubBoardResponseSchema.parse((await p.list()).json());
    p.choose('beta');
    const second=SyntheticClubBoardResponseSchema.parse((await p.list()).json());
    expect(first.items).toHaveLength(12);expect(second.items).toHaveLength(12);
    expect(first.recommendedIds).not.toEqual(second.recommendedIds);
    expect(first.items.every(x=>x.post.dataMode==='SYNTHETIC')).toBe(true);
    expect(JSON.stringify(first)).not.toContain('alpha-synthetic');
    expect(JSON.stringify(second)).not.toContain('beta-synthetic');
  });
  it('allows only the independently admitted synthetic operator to approve a previously pending fixture',async()=>{
    const p=preview(),id='SYN-CLUB-014';
    expect((await p.detail(id)).statusCode).toBe(403);
    expect((await p.decide(id,'APPROVE')).statusCode).toBe(403);
    p.choose('admin');
    const approved=await p.decide(id,'APPROVE');
    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toMatchObject({id,state:'APPROVED',version:1,mode:'SYNTHETIC_DEMO'});
    expect((await p.decide(id,'APPROVE')).statusCode).toBe(403);
    p.choose('alpha');
    expect((await p.detail(id)).statusCode).toBe(200);
    expect(SyntheticClubBoardResponseSchema.parse((await p.list()).json()).items).toHaveLength(13);
    p.choose('admin');
    expect((await p.decide(id,'REVOKE',1)).statusCode).toBe(200);
    p.choose('alpha');
    expect((await p.detail(id)).statusCode).toBe(403);
    expect(SyntheticClubBoardResponseSchema.parse((await p.list()).json()).items).toHaveLength(12);
  });
  it('denies operator changes on independent grant loss and rejects approving an unsubmitted draft',async()=>{
    const p=preview();
    p.choose('admin');
    expect((await p.decide('SYN-CLUB-013','APPROVE')).statusCode).toBe(403);
    p.denyOperator();
    expect((await p.decide('SYN-CLUB-014','APPROVE')).statusCode).toBe(403);
  });
  it('expires read receipts, enforces single use and never permits cross-subject replay',async()=>{
    let clock=at;
    const store=new MemorySyntheticClubDemoStore({'alpha-synthetic':'S01','beta-synthetic':'S02'},
      ()=>clock);
    const one=await store.source.read({actorId:'alpha-synthetic',now:at});
    expect(one).not.toBeNull();
    const correct={actorId:'alpha-synthetic',receipt:one!.receipt,
      revision:one!.revision,now:at};
    expect(await store.source.revalidate({...correct,actorId:'beta-synthetic'})).toBe(false);
    expect(await store.source.revalidate(correct)).toBe(false);
    const second=await store.source.read({actorId:'alpha-synthetic',now:at});
    expect(second).not.toBeNull();
    const next={...correct,receipt:second!.receipt,revision:second!.revision};
    expect(await store.source.revalidate(next)).toBe(true);
    expect(await store.source.revalidate(next)).toBe(false);
    const third=await store.source.read({actorId:'alpha-synthetic',now:at});
    clock=new Date(Date.parse(at)+30_001).toISOString();
    expect(await store.source.revalidate({...correct,
      receipt:third!.receipt,revision:third!.revision,now:clock})).toBe(false);
  });
  it('bounds unconsumed receipt memory and rejects old evicted tokens',async()=>{
    const store=new MemorySyntheticClubDemoStore({'alpha-synthetic':'S01'},()=>at);
    const earliest=await store.source.read({actorId:'alpha-synthetic',now:at});
    let last=earliest;
    for(let i=0;i<150;i++){
      last=await store.source.read({actorId:'alpha-synthetic',now:at});
    }
    expect(await store.source.revalidate({actorId:'alpha-synthetic',
      receipt:earliest!.receipt,revision:earliest!.revision,now:at})).toBe(false);
    expect(await store.source.revalidate({actorId:'alpha-synthetic',
      receipt:last!.receipt,revision:last!.revision,now:at})).toBe(true);
  });
  it('invalidates outstanding read receipts on simulated moderation and denies unknown synthetic subjects',async()=>{
    const p=preview(),before=await p.store.source.read({actorId:'alpha-synthetic',now:at});
    expect(before).not.toBeNull();
    expect(await p.store.source.revalidate({
      actorId:'alpha-synthetic',receipt:before!.receipt,revision:before!.revision,now:at})).toBe(true);
    expect(await p.store.source.read({actorId:'unknown',now:at})).toBeNull();
    p.choose('admin');
    expect((await p.decide('SYN-CLUB-014','REJECT')).statusCode).toBe(200);
    expect(await p.store.source.revalidate({
      actorId:'alpha-synthetic',receipt:before!.receipt,revision:before!.revision,now:at})).toBe(false);
  });
});
