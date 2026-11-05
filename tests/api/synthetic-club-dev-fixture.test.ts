import {createHash} from 'node:crypto';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {createSyntheticEmptyDemoApi} from '../../apps/api/src/dev/empty-demo-fixture.js';

const origin='http://127.0.0.1:5173';
const adminBootstrap='/api/dev/synthetic-clubs/bootstrap';
const betaBootstrap='/api/dev/empty-demo/bootstrap';
const adminPath='/api/admin/synthetic/clubs';
const boardPath='/api/synthetic/clubs';
const content={clubName:'가상동아리 AI 탐험대',summary:'합성 로봇 프로젝트 시연',category:'IT_AI',
  campus:'SEOUL',topicCodes:['AI_ML'],activities:['PROJECT'],conditions:[],
  posterAssetId:'SYN-POSTER-CLUB-090',dataMode:'SYNTHETIC'};
const apps:Array<ReturnType<typeof createSyntheticEmptyDemoApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(app=>app.close()));vi.unstubAllEnvs();});
function fixture(){
  let at='2026-11-20T00:00:00.000Z';
  const app=createSyntheticEmptyDemoApi({mode:'SYNTHETIC',allowedOrigin:origin,now:()=>at});
  apps.push(app);return {app,advance:()=>{at='2026-11-20T01:00:00.000Z';}};
}
type App=ReturnType<typeof createSyntheticEmptyDemoApi>;
async function login(app:App,path:string){
  const response=await app.inject(path);
  expect(response.statusCode).toBe(302);
  const header=String(response.headers['set-cookie']);
  expect(header).toContain('; HttpOnly; SameSite=Strict; Max-Age=3600');
  const cookie=header.split(';')[0]!;
  const proof=await app.inject({url:'/api/auth/csrf',headers:{cookie}});
  expect(proof.statusCode).toBe(200);
  return {cookie,csrf:proof.json().csrfToken as string,location:response.headers.location};
}
function mutation(app:App,auth:{cookie:string;csrf:string},url:string,payload:unknown,method:'POST'|'PATCH'='POST'){
  return app.inject({method,url,headers:{cookie:auth.cookie,origin,'x-csrf-token':auth.csrf,
    'content-type':'application/json'},payload:JSON.stringify(payload)});
}
const get=(app:App,cookie:string,url:string)=>app.inject({url,headers:{cookie}});

describe('#123 explicit local ADMIN to BETA club demonstration',()=>{
  it('publishes, serves the exact private poster, then hides edits and revocation through the assembled API',async()=>{
    const {app}=fixture(),admin=await login(app,adminBootstrap);
    expect(admin.location).toBe('/clubs/admin');
    expect((await get(app,admin.cookie,'/api/auth/session')).json()).toMatchObject({
      role:'ADMIN',actorId:'SYN-EMPTY-DEMO-ADMIN'});
    expect((await get(app,admin.cookie,'/api/demo-profile')).statusCode).toBe(403);
    expect((await get(app,admin.cookie,boardPath)).statusCode).toBe(403);
    const initial=await get(app,admin.cookie,adminPath);
    expect(initial.statusCode).toBe(200);
    expect(initial.json().records.some((r:{post:{id:string}})=>r.post.id==='SYN-CLUB-090')).toBe(false);
    const beta=await login(app,betaBootstrap);
    expect(beta.location).toBe('/demo-profile');
    expect((await get(app,beta.cookie,adminPath)).statusCode).toBe(403);
    expect((await mutation(app,beta,adminPath,{id:'SYN-CLUB-090',content})).statusCode).toBe(403);
    const created=await mutation(app,admin,adminPath,{id:'SYN-CLUB-090',content});
    expect(created.statusCode).toBe(201);
    expect(created.json().record).toMatchObject({version:1,post:{state:'REVIEW_PENDING'}});
    expect((await get(app,beta.cookie,boardPath+'/SYN-CLUB-090')).statusCode).toBe(403);
    expect((await get(app,beta.cookie,boardPath+'/SYN-CLUB-090/poster')).statusCode).toBe(403);
    expect((await mutation(app,admin,adminPath+'/SYN-CLUB-090/decision',
      {decision:'APPROVE',expectedVersion:1})).statusCode).toBe(200);
    const board=await get(app,beta.cookie,boardPath),detail=await get(app,beta.cookie,boardPath+'/SYN-CLUB-090');
    expect(board.statusCode).toBe(200);
    // Approval makes a post visible; category diversity and the rank cap still apply.
    expect(board.json().items.some((item:{post:{id:string}})=>item.post.id==='SYN-CLUB-090')).toBe(true);
    expect(detail.statusCode).toBe(200);
    expect(detail.json().poster).toMatchObject({assetId:'SYN-POSTER-CLUB-090',
      href:'/api/synthetic/clubs/SYN-CLUB-090/poster',
      provenance:{kind:'AI_GENERATED_SYNTHETIC'}});
    const image=await get(app,beta.cookie,detail.json().poster.href);
    expect(image.statusCode).toBe(200);expect(image.headers['content-type']).toBe('image/png');
    expect(image.headers['cache-control']).toBe('no-store');
    expect(createHash('sha256').update(image.rawPayload).digest('hex'))
      .toBe('93446df5cc9a2859585e4801df7a74b7f602d71ae8084a4a51f5b563855af842');
    const other=await login(app,betaBootstrap+'?slot=B');
    expect((await get(app,other.cookie,'/api/auth/session')).json()).toMatchObject({
      role:'BETA',actorId:'SYN-EMPTY-DEMO-B'});
    expect((await get(app,other.cookie,'/api/demo-profile')).json().snapshot.namespace).toBe('EMPTY_DEMO');
    expect((await get(app,other.cookie,boardPath)).statusCode).toBe(200);
    expect((await mutation(app,admin,adminPath+'/SYN-CLUB-090',
      {expectedVersion:2,content:{...content,summary:'수정 뒤 재검수가 필요한 합성 글'}},'PATCH')).statusCode).toBe(200);
    expect((await get(app,beta.cookie,boardPath+'/SYN-CLUB-090')).statusCode).toBe(403);
    expect((await get(app,beta.cookie,boardPath+'/SYN-CLUB-090/poster')).statusCode).toBe(403);
    expect((await mutation(app,admin,adminPath+'/SYN-CLUB-090/decision',
      {decision:'APPROVE',expectedVersion:3})).statusCode).toBe(200);
    expect((await mutation(app,admin,adminPath+'/SYN-CLUB-090/decision',
      {decision:'REVOKE',expectedVersion:4})).statusCode).toBe(200);
    expect((await get(app,other.cookie,boardPath+'/SYN-CLUB-090/poster')).statusCode).toBe(403);
  });
  it('requires same-origin bootstrap and CSRF, expires sessions, and keeps re-entry available after one hour',async()=>{
    const h=fixture(),{app}=h;
    expect((await app.inject(adminPath)).statusCode).toBe(401);
    expect((await app.inject(boardPath)).statusCode).toBe(401);
    const beta=await login(app,betaBootstrap);
    for(const path of [adminBootstrap,betaBootstrap]){
      expect((await app.inject({url:path,headers:{cookie:beta.cookie,'sec-fetch-site':'cross-site'}})).statusCode).toBe(401);
      expect((await app.inject({url:path,headers:{cookie:beta.cookie,origin:'https://foreign.invalid'}})).statusCode).toBe(401);
    }
    for(const path of [betaBootstrap,adminBootstrap]){
      const head=await app.inject({method:'HEAD',url:path,headers:{cookie:beta.cookie}});
      expect(head.statusCode).toBe(401);expect(head.headers['set-cookie']).toBeUndefined();
    }
    expect((await app.inject(adminBootstrap+'?role=ADMIN')).statusCode).toBe(422);
    expect((await app.inject(betaBootstrap+'?role=ADMIN')).statusCode).toBe(422);
    const admin=await login(app,adminBootstrap);
    const noProof=await app.inject({method:'POST',url:adminPath,
      headers:{cookie:admin.cookie,origin,'content-type':'application/json'},payload:JSON.stringify({id:'SYN-CLUB-090',content})});
    expect(noProof.statusCode).toBe(403);
    expect((await mutation(app,{...admin,csrf:beta.csrf},adminPath,{id:'SYN-CLUB-090',content})).statusCode).toBe(403);
    const before=await get(app,admin.cookie,adminPath);
    expect(before.json().records.some((r:{post:{id:string}})=>r.post.id==='SYN-CLUB-090')).toBe(false);
    h.advance();
    expect((await get(app,admin.cookie,adminPath)).statusCode).toBe(401);
    expect((await get(app,beta.cookie,boardPath)).statusCode).toBe(401);
    const renewed=await login(app,adminBootstrap);
    expect((await get(app,renewed.cookie,adminPath)).statusCode).toBe(200);
    expect((await mutation(app,renewed,'/api/auth/logout',{})).statusCode).toBe(204);
    expect((await get(app,renewed.cookie,adminPath)).statusCode).toBe(401);
  });
  it('shares the bounded session capacity across ADMIN and BETA bootstraps',async()=>{
    const h=fixture();
    for(let i=0;i<32;i++){
      const response=await h.app.inject(i%2===0?adminBootstrap:betaBootstrap);
      expect(response.statusCode).toBe(302);
    }
    const limited=await h.app.inject(adminBootstrap);
    expect(limited.statusCode).toBe(503);expect(limited.headers['set-cookie']).toBeUndefined();
    h.advance();
    expect((await h.app.inject(betaBootstrap)).statusCode).toBe(302);
    expect((await h.app.inject(adminBootstrap)).statusCode).toBe(302);
  });
  it.each(['NODE_ENV','HUFS_DEPLOY_ENV'])('refuses the synthetic ADMIN harness when %s is production',name=>{
    vi.stubEnv(name,'production');
    expect(()=>createSyntheticEmptyDemoApi({mode:'SYNTHETIC',allowedOrigin:origin})).toThrow(/SYNTHETIC/);
  });
});
