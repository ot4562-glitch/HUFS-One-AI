import {afterEach,describe,expect,it} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import type {TrustedGoogleAuthPort,TrustedSchoolMailPort} from '../../apps/api/src/integration.js';

const allowedOrigin='https://synthetic.invalid';
const repo=()=>new MemoryApiRepository({profiles:[]});
const actor={
  actorId:'google:SYN-ACTOR',sessionIdHash:'H'.repeat(40),
  sessionExpiresAt:'2026-11-05T00:00:00.000Z',
  schoolMailProofExpiresAt:'2026-11-04T00:00:00.000Z',
  csrfToken:'C'.repeat(32),betaAllowed:true,role:'BETA' as const,
};
const google:TrustedGoogleAuthPort={
  start:async()=>{},callback:async()=>{},
  verifySession:async()=>actor,revokeSession:async()=>{},
  clearSession:()=>{},
};
const mail:TrustedSchoolMailPort={
  issue:async()=>({challengeId:'A'.repeat(22),expiresAt:'2026-11-01T00:00:00.000Z'}),
  verify:async()=>true,
};
const oldAppEnv=process.env.APP_ENV;
afterEach(()=>{
  if(oldAppEnv===undefined)delete process.env.APP_ENV;
  else process.env.APP_ENV=oldAppEnv;
});

describe('central owner4 composition of Agent1 ports',()=>{
  it('keeps direct test-session integration authenticated but cannot create a fake OAuth route',async()=>{
    const app=createIntegratedApi({
      allowedOrigin,repository:repo(),
      auth:{verifySession:async()=>actor,revokeSession:async()=>{}},
      now:()=> '2026-10-31T00:00:00.000Z',
    });
    try{
      expect(app.hasRoute({method:'GET',url:'/api/auth/google/start'})).toBe(false);
      const response=await app.inject({url:'/api/auth/session'});
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      const spoofed=await app.inject({url:'/api/auth/session',
        headers:{'x-google-sub':'forged','x-role':'ADMIN'}});
      expect(spoofed.statusCode).toBe(200); // identity remains server-supplied BETA
      expect(spoofed.json().role).toBe('BETA');
    }finally{await app.close();}
  });

  it('installs the actual OIDC and authenticated CSRF routes with a trusted Google port',async()=>{
    const app=createIntegratedApi({allowedOrigin,repository:repo(),googleAuth:google,
      now:()=> '2026-10-31T00:00:00.000Z'});
    try {
      expect(app.hasRoute({method:'GET',url:'/api/auth/google/start'})).toBe(true);
      expect(app.hasRoute({method:'GET',url:'/api/auth/google/callback'})).toBe(true);
      const response=await app.inject({url:'/api/auth/csrf'});
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({csrfToken:actor.csrfToken});
      expect(response.headers['cache-control']).toBe('no-store');
    } finally {await app.close();}
  });

  it('rejects mixed verified-session and Google authorities',()=>{
    expect(()=>createIntegratedApi({
      allowedOrigin,repository:repo(),
      googleAuth:google,
      auth:{verifySession:async()=>actor,revokeSession:async()=>{}},
    } as never)).toThrow('Exactly one trusted session');
  });

  it('never accepts a bare school-mail sender without a Google verifier',()=>{
    expect(()=>createIntegratedApi({
      allowedOrigin,repository:repo(),
      auth:{verifySession:async()=>actor,revokeSession:async()=>{}},
      schoolMailProof:mail,
    } as never)).toThrow('Exactly one trusted session');
  });

  it('rejects incomplete Google callbacks and proof services independently',()=>{
    expect(()=>createIntegratedApi({
      allowedOrigin,repository:repo(),
      googleAuth:{...google,clearSession:undefined},
    } as never)).toThrow('Incomplete Google');
    expect(()=>createIntegratedApi({
      allowedOrigin,repository:repo(),
      googleAuth:google,
      schoolMailProof:{...mail,verify:undefined},
    } as never)).toThrow('Incomplete school-mail');
  });

  it('blocks production even if all adapters and endpoint stubs are supplied',()=>{
    process.env.APP_ENV='production';
    expect(()=>createIntegratedApi({
      allowedOrigin,repository:repo(),
      auth:{verifySession:async()=>actor,revokeSession:async()=>{}},
    })).toThrow('Production integration disabled');
    expect(()=>createIntegratedApi({
      allowedOrigin,repository:repo(),googleAuth:google,schoolMailProof:mail,
    })).toThrow('Production integration disabled');
  });

  it('rejects insecure and malformed origins even with trusted ports',()=>{
    for(const origin of ['http://synthetic.invalid','https://synthetic.invalid/path',
      'https://synthetic.invalid?next=1','http://localhost:3000']){
      expect(()=>createIntegratedApi({
        allowedOrigin:origin,repository:repo(),
        auth:{verifySession:async()=>actor,revokeSession:async()=>{}},
      })).toThrow('HTTPS origin');
    }
  });
});
