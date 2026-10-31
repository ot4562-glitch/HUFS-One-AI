import {afterEach,beforeAll,describe,expect,it} from 'vitest';
import {createLocalJWKSet,exportJWK,generateKeyPair,SignJWT} from 'jose';
import type {FastifyInstance} from 'fastify';
import {createApi} from '../../apps/api/src/server.js';
import {closedRepository} from '../../apps/api/src/repository.js';
import {createGoogleIdTokenVerifier} from '../../apps/api/src/modules/auth/google-oidc.js';
import {createGoogleAuthFlow} from '../../apps/api/src/modules/auth/google-auth-flow.js';
import {MemoryGoogleAuthStore} from '../../apps/api/src/modules/auth/google-auth-store.js';
import {MemoryReviewerAccessStore,issueReviewerInvitation} from
  '../../apps/api/src/modules/auth/reviewer.js';

const ORIGIN='https://example.test';
const CLIENT='9876543210-local.apps.googleusercontent.com';
const NOW=new Date('2026-10-31T12:00:00.000Z');
let current=NOW;
let signingKey:Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
let jwks:ReturnType<typeof createLocalJWKSet>;
const opened:FastifyInstance[]=[];
beforeAll(async()=>{
  const pair=await generateKeyPair('RS256',{extractable:true});
  signingKey=pair.privateKey;
  const publicKey=await exportJWK(pair.publicKey);
  jwks=createLocalJWKSet({keys:[{...publicKey,kid:'local-test-key',use:'sig',alg:'RS256'}]});
});
afterEach(async()=>{
  await Promise.all(opened.map(x=>x.close()));
  opened.length=0;
  current=NOW;
});
const cookie=(res:{headers:Record<string,unknown>},key:string)=>{
  const raw=res.headers['set-cookie'];
  const headers=Array.isArray(raw)?raw:[raw];
  const entry=headers.find(x=>typeof x==='string'&&x.startsWith(key+'='));
  return String(entry??'').split(';')[0]!;
};
async function jwt(nonce:string,options:{email?:string;hd?:string;subject?:string}={}){
  const sec=Math.floor(current.getTime()/1000);
  return new SignJWT({
    email:options.email??'judge@gmail.com',email_verified:true,
    ...(options.hd?{hd:options.hd}:{}),
    nonce,sub:options.subject??'google-account-01',
  }).setProtectedHeader({alg:'RS256',kid:'local-test-key'})
    .setIssuer('https://accounts.google.com')
    .setAudience(CLIENT).setIssuedAt(sec-10).setExpirationTime(sec+1800)
    .sign(signingKey);
}
function harness(options:{authorizeBeta?:boolean;email?:string;hd?:string}={}){
  const store=new MemoryGoogleAuthStore();
  const invitations=new MemoryReviewerAccessStore();
  let nonce='';
  let exchanged=0;
  let verifierCalls=0;
  const verify=createGoogleIdTokenVerifier({clientId:CLIENT,jwks,now:()=>current});
  const flow=createGoogleAuthFlow({
    clientId:CLIENT,
    redirectUri:ORIGIN+'/api/auth/google/callback',
    allowedOrigin:ORIGIN,
    store,
    now:()=>current,
    exchangeCode:async(input)=>{
      exchanged++;
      expect(input.code).toBe('synthetic-code');
      expect(input.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(input.redirectUri).toBe(ORIGIN+'/api/auth/google/callback');
      expect(input.clientId).toBe(CLIENT);
      return jwt(nonce,options);
    },
    verifyIdToken:async(id,expectedNonce)=>{
      verifierCalls++;
      return verify(id,expectedNonce);
    },
    ...(options.authorizeBeta?{authorizeBeta:async()=>{
      return {schoolMailProofExpiresAt:new Date(current.getTime()+1000*600).toISOString()};
    }}:{}),
  });
  const app=createApi({
    allowedOrigin:ORIGIN,
    repository:closedRepository,
    reviewerAccess:invitations,
    googleAuth:flow,
    now:()=>current.toISOString(),
  });
  opened.push(app);
  const begin=async(intent:'REVIEWER'|'BETA'='REVIEWER')=>{
    const res=await app.inject({
      method:'GET',url:'/api/auth/google/start?intent='+intent,
      headers:{'sec-fetch-site':'same-origin'},
    });
    const redirect=new URL(String(res.headers.location??ORIGIN));
    nonce=redirect.searchParams.get('nonce')??'';
    return {res,url:redirect,state:redirect.searchParams.get('state')??'',
      binding:cookie(res,'__Host-hufs_login')};
  };
  const complete=async(state:string,binding:string)=>{
    return app.inject({
      method:'GET',
      url:'/api/auth/google/callback?state='+state+'&code=synthetic-code',
      headers:{cookie:binding,'sec-fetch-site':'cross-site'},
    });
  };
  return {app,store,invitations,flow,begin,complete,
    exchanged:()=>exchanged,verified:()=>verifierCalls};
}

describe('Google OAuth callback, cookie binding and one-time session',()=>{
  it('only exposes public auth endpoints with an explicitly injected adapter',async()=>{
    const sealed=createApi({repository:closedRepository,allowedOrigin:ORIGIN});
    opened.push(sealed);
    expect((await sealed.inject('/api/auth/google/start')).statusCode).toBe(401);
    expect((await sealed.inject('/api/auth/google/callback')).statusCode).toBe(401);
    expect((await sealed.inject('/api/auth/csrf')).statusCode).toBe(401);
  });

  it('issues strict HttpOnly cookies, opaque one-hour-capped sessions, and CSRF proof',async()=>{
    const h=harness();
    const begun=await h.begin();
    expect(begun.res.statusCode).toBe(303);
    expect(begun.url.origin).toBe('https://accounts.google.com');
    expect(begun.binding).toMatch(/^__Host-hufs_login=[A-Za-z0-9_-]{43}$/);
    expect(String(begun.res.headers['set-cookie'])).toContain('HttpOnly; Secure; SameSite=Lax');
    expect((await h.app.inject('/api/auth/csrf')).statusCode).toBe(401);
    const callback=await h.complete(begun.state,begun.binding);
    expect(callback.statusCode).toBe(303);
    expect(callback.headers.location).toBe('/reviewer');
    const session=cookie(callback,'__Host-hufs_session');
    expect(session).toMatch(/^__Host-hufs_session=[A-Za-z0-9_-]{43}$/);
    expect(String(callback.headers['set-cookie'])).not.toContain('synthetic-code');
    expect((await h.app.inject({url:'/api/auth/session',headers:{cookie:session}})).statusCode).toBe(403);
    const proof=await h.app.inject({url:'/api/auth/csrf',headers:{cookie:session}});
    expect(proof.statusCode).toBe(200);
    expect(proof.json().csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(proof.headers['cache-control']).toBe('no-store');
    expect(h.exchanged()).toBe(1);
    expect(h.verified()).toBe(1);
  });

  it('uses the CSRF endpoint to enroll a reviewer; cannot read student data',async()=>{
    const h=harness();
    const invite=await issueReviewerInvitation(h.invitations,{
      startsAt:'2026-10-31T11:00:00.000Z',endsAt:'2026-11-02T00:00:00.000Z',
      label:'Synthetic judge access',maxAccounts:5,
    },{now:'2026-10-31T10:00:00.000Z'});
    const begun=await h.begin();
    const callback=await h.complete(begun.state,begun.binding);
    const session=cookie(callback,'__Host-hufs_session');
    const proof=(await h.app.inject({url:'/api/auth/csrf',headers:{cookie:session}})).json().csrfToken;
    const redeem=await h.app.inject({
      method:'POST',url:'/api/reviewer/invitations/redeem',
      headers:{cookie:session,origin:ORIGIN,'x-csrf-token':proof},
      payload:{enrollmentCode:invite.enrollmentCode},
    });
    expect(redeem.statusCode).toBe(200);
    expect(redeem.json()).toMatchObject({role:'REVIEWER',sandboxOnly:true});
    expect((await h.app.inject({url:'/api/auth/session',headers:{cookie:session}})).statusCode).toBe(200);
    expect((await h.app.inject({url:'/api/demo/profiles',headers:{cookie:session}})).statusCode).toBe(503);
    expect((await h.app.inject({url:'/api/reviewer/capabilities',headers:{cookie:session}}))
      .json().sandboxOnly).toBe(true);
    const logout=await h.app.inject({
      method:'POST',url:'/api/auth/logout',
      headers:{cookie:session,origin:ORIGIN,'x-csrf-token':proof},payload:{},
    });
    expect(logout.statusCode).toBe(204);
    expect(String(logout.headers['set-cookie'])).toContain('__Host-hufs_session=;');
    expect((await h.app.inject({url:'/api/auth/csrf',headers:{cookie:session}})).statusCode).toBe(401);
  });

  it('rejects wrong browser cookie, consumes state and never calls token exchange',async()=>{
    const h=harness();
    const b=await h.begin();
    const bad=await h.complete(b.state,'__Host-hufs_login='+Buffer.alloc(32,8).toString('base64url'));
    expect(bad.statusCode).toBe(403);
    expect(h.exchanged()).toBe(0);
    expect((await h.complete(b.state,b.binding)).statusCode).toBe(403);
    expect(h.exchanged()).toBe(0);
  });

  it('one callback wins under parallel replay; there is no double login',async()=>{
    const h=harness();
    const b=await h.begin();
    const [first,second]=await Promise.all([
      h.complete(b.state,b.binding),h.complete(b.state,b.binding),
    ]);
    expect([first.statusCode,second.statusCode].sort()).toEqual([303,403]);
    expect(h.exchanged()).toBe(1);
  });

  it('rejects missing cookie, expired state and cross-site start requests',async()=>{
    const h=harness();
    const cross=await h.app.inject({
      url:'/api/auth/google/start',headers:{'sec-fetch-site':'cross-site'},
    });
    expect(cross.statusCode).toBe(403);
    const b=await h.begin();
    current=new Date(current.getTime()+300_000);
    expect((await h.complete(b.state,b.binding)).statusCode).toBe(403);
    expect(h.exchanged()).toBe(0);
    const b2=await h.begin();
    expect((await h.complete(b2.state,'')).statusCode).toBe(403);
  });

  it('never elevates a signed Google email to BETA without school and explicit policy',async()=>{
    const a=harness();
    expect((await a.begin('BETA')).res.statusCode).toBe(403);
    const b=harness({authorizeBeta:true,email:'judge@gmail.com'});
    const begun=await b.begin('BETA');
    expect((await b.complete(begun.state,begun.binding)).statusCode).toBe(403);
    const ok=harness({authorizeBeta:true,email:'sample@hufs.ac.kr',hd:'hufs.ac.kr'});
    const begin=await ok.begin('BETA');
    const result=await ok.complete(begin.state,begin.binding);
    expect(result.statusCode).toBe(303);
    const session=cookie(result,'__Host-hufs_session');
    const who=await ok.app.inject({url:'/api/auth/session',headers:{cookie:session}});
    expect(who.statusCode).toBe(200);
    expect(who.json().role).toBe('BETA');
  });

  it('rejects duplicated cookies, forged sessions, expired proofs and non-CSRF logout',async()=>{
    const h=harness();
    const b=await h.begin();
    const success=await h.complete(b.state,b.binding);
    const session=cookie(success,'__Host-hufs_session');
    expect((await h.app.inject({url:'/api/auth/csrf',
      headers:{cookie:session+'; '+session},
    })).statusCode).toBe(401);
    expect((await h.app.inject({url:'/api/auth/csrf',
      headers:{cookie:'__Host-hufs_session='+Buffer.alloc(32,8).toString('base64url')},
    })).statusCode).toBe(401);
    expect((await h.app.inject({method:'POST',url:'/api/auth/logout',
      headers:{cookie:session,origin:ORIGIN,'x-csrf-token':'bad'},payload:{},
    })).statusCode).toBe(403);
    current=new Date(current.getTime()+3600_000);
    expect((await h.app.inject({url:'/api/auth/csrf',headers:{cookie:session}})).statusCode).toBe(401);
  });
});
