import {afterEach,describe,expect,it,vi} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import type {TrustedOwnerV2CatalogSource} from '../../apps/api/src/modules/owner-v2-catalog-http.js';
import {closedRepository} from '../../apps/api/src/repository.js';
import {createCatalogCursorSigner} from '../../packages/core/src/feature-additions/server-cursor.js';
import {opportunity,FIXED_NOW} from '../../packages/core/src/feature-additions/v2.fixtures.js';

const ORIGIN='https://synthetic.invalid';
const actor={role:'BETA' as const,actorId:'SYN-OWNER-1',sessionIdHash:'H'.repeat(32),
  csrfToken:'C'.repeat(32),betaAllowed:true,sessionExpiresAt:'2026-12-01T00:00:00Z',
  schoolMailProofExpiresAt:'2026-12-01T00:00:00Z'};
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(a=>a.close()));});
const key=Uint8Array.from(Array.from({length:32},(_,i)=>i+1)); // synthetic fixture only
const signer=createCatalogCursorSigner({activeKeyId:'test-key',keys:new Map([['test-key',key]]),ttlMs:60_000});
function setup(enabled=true){
  let identity=actor.actorId,consent='consent-1',rights=true,revision='catalog-r1';
  const records=[opportunity('item-1',{title:'Economics mentoring'}),
    opportunity('item-2',{title:'Economics research'}),
    opportunity('item-3',{title:'Restricted item',permitted:false})];
  const source:TrustedOwnerV2CatalogSource={
    read:vi.fn(async()=>({items:records,scopeKey:'scope-1',catalogRevision:revision,
      consentVersion:consent,receipt:{actorId:identity,sourceVersion:revision,
        expiresAt:'2026-11-30T00:00:00Z'}})),
    revalidate:vi.fn(async()=>rights),
  };
  const app=createIntegratedApi({allowedOrigin:ORIGIN,repository:closedRepository,now:()=>FIXED_NOW,
    auth:{verifySession:async()=>({...actor,actorId:identity}),revokeSession:async()=>{}},
    ...(enabled?{ownerV2Catalog:{source,signer}}:{})});
  apps.push(app);
  const get=(query='pageSize=1&sort=TITLE')=>app.inject({
    url:'/api/owner/features/v2/catalog?'+query});
  return {app,source,get,revoked:()=>{rights=false;},
    switchActor:()=>{identity='SYN-OWNER-2';},changeConsent:()=>{consent='consent-2';},
    changeRevision:()=>{revision='catalog-r2';}};
}
const next=(page:{nextCursor:string|null;at:string})=>'pageSize=1&sort=TITLE&asOf='
  +encodeURIComponent(page.at)+'&cursor='+encodeURIComponent(page.nextCursor||'');

describe('#366/#348 BETA verified catalog API and server-signed continuation',()=>{
  it('paginates only permitted/verified snapshot rows with a signed opaque token',async()=>{
    const h=setup(),first=await h.get();
    expect(first.statusCode).toBe(200);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.json()).toMatchObject({state:'READY',sourceVersion:'catalog-r1',
      page:{items:[{id:'item-1'}],totalInAuthorizedScope:2,hasMore:true}});
    const page=first.json().page;
    expect(page.nextCursor).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const second=await h.get(next(page));
    expect(second.statusCode).toBe(200);
    expect(second.json().page.items.map((x:{id:string})=>x.id)).toEqual(['item-2']);
    expect(second.json().page.nextCursor).toBeNull();
    expect(h.source.read).toHaveBeenCalledTimes(2);
    expect(h.source.revalidate).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(second.json())).not.toContain('SYN-OWNER-1');
  });
  it('shows not connected, never synthetic data when source or signer is absent',async()=>{
    const h=setup(false),r=await h.get();
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({state:'NOT_CONNECTED',asOf:FIXED_NOW});
    expect(h.source.read).not.toHaveBeenCalled();
  });
  it('rejects forged, cross-consent and cross-revision continuation tokens',async()=>{
    const h=setup(),first=(await h.get()).json().page;
    const forged=next(first).replace(/cursor=([^&])/,(_full,head)=>'cursor='+(head==='A'?'B':'A'));
    expect((await h.get(forged)).statusCode).toBe(409);
    h.changeConsent();
    expect((await h.get(next(first))).statusCode).toBe(409);
    h.changeRevision();
    expect((await h.get(next(first))).statusCode).toBe(409);
  });
  it('refuses a stale actor, revoked source and invalid-asOf request',async()=>{
    const h=setup(),first=(await h.get()).json().page;
    h.revoked();
    const denied=await h.get(next(first));
    expect(denied.statusCode).toBe(403);
    expect(denied.body).not.toContain('Economics research');
    expect((await h.get('cursor='+encodeURIComponent(first.nextCursor))).statusCode).toBe(422);
    expect((await h.get('asOf=2026-12-31T00%3A00%3A00Z')).statusCode).toBe(422);
    expect((await h.get('actorId=SYN-OWNER-2')).statusCode).toBe(422);
  });
  it('does not allow BETA principal substitution to reuse another actor scope',async()=>{
    const h=setup(),first=(await h.get()).json().page;
    h.switchActor();
    // In this fixture the operator changes its actor-bound snapshot as well,
    // but the signed cursor still binds the old actor and is rejected.
    expect((await h.get(next(first))).statusCode).toBe(409);
  });
  it('denies unauthenticated and non-BETA callers even when source ports are absent',async()=>{
    const guest=createIntegratedApi({allowedOrigin:ORIGIN,repository:closedRepository,
      now:()=>FIXED_NOW,auth:{verifySession:async()=>null,revokeSession:async()=>{}}});
    const admin=createIntegratedApi({allowedOrigin:ORIGIN,repository:closedRepository,
      now:()=>FIXED_NOW,auth:{verifySession:async()=>({...actor,role:'ADMIN' as const}),
        revokeSession:async()=>{}}});
    apps.push(guest,admin);
    const url='/api/owner/features/v2/catalog';
    expect((await guest.inject({url})).statusCode).toBe(401);
    expect((await admin.inject({url})).statusCode).toBe(403);
  });
});
