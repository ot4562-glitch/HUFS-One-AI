import {afterEach,describe,expect,it} from 'vitest';
import {HufsAbilityMenuManifestSchema,getHufsAbilityManifest} from '@hufs-one/contracts';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import type {VerifySession} from '../../apps/api/src/types.js';

const now='2026-11-02T00:00:00.000Z',origin='https://synthetic.invalid';
const actor={role:'BETA' as const,actorId:'SYN-OWNER',sessionIdHash:'H'.repeat(32),
  csrfToken:'C'.repeat(32),betaAllowed:true,sessionExpiresAt:'2026-12-01T00:00:00Z',
  schoolMailProofExpiresAt:'2026-12-01T00:00:00Z'};
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{await Promise.all(apps.map(a=>a.close()));apps.length=0;});

describe('#124 public HUFSAbility menu baseline and disabled feature contract',()=>{
  it('preserves precisely five categories, 24 original items, and four public entry labels',()=>{
    const menu=getHufsAbilityManifest();
    expect(menu.categories.map(x=>x.label)).toEqual(['역량관리','교과/비교과','채용','경력개발','통합상담']);
    expect(menu.categories.map(x=>x.items.length)).toEqual([4,5,6,4,5]);
    expect(menu.publicEntries.map(x=>x.label)).toEqual(['교내비교과','장학공지','공지사항','채용정보']);
    expect(new Set(menu.categories.flatMap(x=>x.items.map(y=>y.id))).size).toBe(24);
    expect(menu.schoolAffiliation).toBe('INDEPENDENT_DEMO_NOT_OFFICIAL');
    expect(menu.source.url).toBe('https://dep.hufs.ac.kr/iei/13534/subview.do');
  });
  it('does not expose fictional campus routes or claim any unverified feature is active',()=>{
    const menu=getHufsAbilityManifest();
    expect(menu.categories.flatMap(x=>x.items).every(item=>
      item.state==='NOT_IMPLEMENTED'&&item.internalRoute===null
        &&item.dataMode==='NONE'&&item.disabledText==='🚫 미지원')).toBe(true);
    for(const entry of menu.publicEntries){
      expect(entry).toMatchObject({state:'OFFICIAL_LINK_ONLY',
        internalRoute:null,dataMode:'NONE',disabledText:'🚫 시연 불가',
        officialUrl:'https://hufsability.hufs.ac.kr/'});
    }
  });
  it('fails closed for forged availability, unapproved links and omitted menu items',()=>{
    const menu=getHufsAbilityManifest(),base=menu.categories[0]!.items[0]!;
    for(const item of [
      {...base,state:'DEMO_AVAILABLE'},
      {...base,internalRoute:'/api/auth/session'},
      {...base,dataMode:'REAL'},
      {...base,state:'OFFICIAL_LINK_ONLY',officialUrl:'https://lookalike.invalid/'},
      {...base,state:'NOT_IMPLEMENTED',officialUrl:'https://hufsability.hufs.ac.kr/'},
    ])expect(HufsAbilityMenuManifestSchema.safeParse({...menu,categories:[
      {...menu.categories[0],items:[item,...menu.categories[0]!.items.slice(1)]},
      ...menu.categories.slice(1)]}).success).toBe(false);
    expect(HufsAbilityMenuManifestSchema.safeParse({...menu,categories:menu.categories.slice(1)}).success).toBe(false);
    expect(HufsAbilityMenuManifestSchema.safeParse({...menu,categories:[
      {...menu.categories[0],items:menu.categories[0]!.items.slice(1)},
      ...menu.categories.slice(1)]}).success).toBe(false);
  });
  it('always returns a newly parsed snapshot rather than reusing mutable caller state',()=>{
    const first=getHufsAbilityManifest();
    first.categories[0]!.items[0]!.label='INJECTED';
    expect(getHufsAbilityManifest().categories[0]!.items[0]!.label).toBe('핵심역량 소개');
  });
});

describe('#124 authenticated read-only capability HTTP route',()=>{
  function appFor(verify:VerifySession){
    const api=createIntegratedApi({allowedOrigin:origin,
      repository:new MemoryApiRepository({profiles:[]}),
      auth:{verifySession:verify,revokeSession:async()=>{}},now:()=>now});
    apps.push(api);return api;
  }
  it('returns only the disabled original menu and safe public navigation for an active BETA session',async()=>{
    const app=appFor(async()=>actor);
    const r=await app.inject({method:'GET',url:'/api/hufsability/capabilities'});
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.json()).toEqual(getHufsAbilityManifest());
    expect(JSON.stringify(r.json())).not.toContain('SYN-OWNER');
    expect((await app.inject({method:'GET',url:'/api/hufsability/capabilities?actorId=other'})).statusCode)
      .toBe(422);
  });
  it('denies anonymous, REVIEWER and expired-school-proof sessions',async()=>{
    const reviewer={role:'REVIEWER' as const,actorId:'SYN-REVIEWER',
      sessionIdHash:'H'.repeat(32),csrfToken:'C'.repeat(32),
      verifiedEmail:'reviewer@example.invalid',identityProofExpiresAt:'2026-12-01T00:00:00Z',
      sessionExpiresAt:'2026-12-01T00:00:00Z'};
    for(const [identity,expected] of [[null,401],[reviewer,403],
      [{...actor,schoolMailProofExpiresAt:'2026-11-01T00:00:00Z'},403]] as const){
      const app=appFor(async()=>identity);
      const r=await app.inject({method:'GET',url:'/api/hufsability/capabilities'});
      expect(r.statusCode).toBe(expected);
    }
  });
  it('rechecks the principal after constructing the response and denies a late logout',async()=>{
    let checks=0;
    const app=appFor(async()=>++checks<=2?actor:null);
    const r=await app.inject({method:'GET',url:'/api/hufsability/capabilities'});
    expect(r.statusCode).toBe(401);
    expect(r.json()).not.toHaveProperty('categories');
  });
});
