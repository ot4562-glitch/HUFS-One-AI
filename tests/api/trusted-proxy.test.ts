import {afterEach,describe,expect,it} from 'vitest';
import {ReceiptAdmissionError} from '../../apps/api/src/modules/auth/owner-receipts.js';
import type {ApiOptions} from '../../apps/api/src/types.js';
import {createApi} from '../../apps/api/src/server.js';
import {closedRepository} from '../../apps/api/src/repository.js';
import {createGoogleAuthFlow} from '../../apps/api/src/modules/auth/google-auth-flow.js';
import {MemoryGoogleAuthStore} from '../../apps/api/src/modules/auth/google-auth-store.js';
import {MemoryAuthAttemptLimiter} from '../../apps/api/src/modules/auth/auth-attempt-limiter.js';

const ORIGIN='https://synthetic.invalid',NOW='2026-10-31T00:00:00.000Z';
const actor={actorId:'SYN-ACTOR-01',role:'BETA' as const,betaAllowed:true,
  sessionIdHash:'H'.repeat(32),csrfToken:'C'.repeat(32),
  sessionExpiresAt:'2026-11-05T00:00:00.000Z',schoolMailProofExpiresAt:'2026-11-05T00:00:00.000Z'};
const opened:Array<ReturnType<typeof createApi>>=[];
afterEach(async()=>{await Promise.all(opened.splice(0).map(app=>app.close()));});
function makeApp(trusted?:unknown,google=false){
  const options:ApiOptions={allowedOrigin:ORIGIN,repository:closedRepository,now:()=>NOW};
  // Deliberately exercise runtime configuration, including malformed JS callers.
  if(trusted!==undefined)Object.assign(options,{trustedProxyAddresses:trusted});
  if(google)options.googleAuth=createGoogleAuthFlow({
    clientId:'9876543210-synthetic.apps.googleusercontent.com',
    redirectUri:ORIGIN+'/api/auth/google/callback',allowedOrigin:ORIGIN,
    store:new MemoryGoogleAuthStore(),attemptLimiter:new MemoryAuthAttemptLimiter(),
    now:()=>new Date(NOW),exchangeCode:async()=>{throw new Error('No external exchange in this test');},
    verifyIdToken:async()=>{throw new Error('No external identity in this test');},
  });
  else options.verifySession=async()=>actor;
  const app=createApi(options);opened.push(app);
  // Test-only observation of the same request.ip used by OAuth and OTP.
  app.get('/api/synthetic/client-ip',async req=>({ip:req.ip}));
  return app;
}
const probe=(app:ReturnType<typeof createApi>,remoteAddress:string,forwarded?:string)=>
  app.inject({url:'/api/synthetic/client-ip',remoteAddress,
    ...(forwarded===undefined?{}:{headers:{'x-forwarded-for':forwarded}})});

describe('owner receipt rate-limit response (#227)',()=>{
  it('returns 429 without falsely diagnosing a provider outage',async()=>{
    const app=makeApp();
    app.get('/api/synthetic/receipt-cap',async()=>{throw new ReceiptAdmissionError();});
    const response=await app.inject({url:'/api/synthetic/receipt-cap'});
    expect(response.statusCode).toBe(429);
    expect(response.json().code).toBe('RATE_LIMITED');
    expect(response.headers['cache-control']).toBe('no-store');
  });
});

describe('explicit immediate-proxy client identity (#226)',()=>{
  it('keeps caller-supplied forwarding untrusted by default',async()=>{
    const result=await probe(makeApp(),'198.51.100.4','203.0.113.8');
    expect(result.statusCode).toBe(200);expect(result.json().ip).toBe('198.51.100.4');
  });
  it('uses a single forwarded client only from the configured proxy address',async()=>{
    const app=makeApp(['10.20.0.2']);
    const trusted=await probe(app,'10.20.0.2','203.0.113.8');
    expect(trusted.statusCode).toBe(200);expect(trusted.json().ip).toBe('203.0.113.8');
    expect((await probe(app,'10.20.0.3','203.0.113.8')).json().ip).toBe('10.20.0.3');
  });
  it('compares equivalent IPv6 and IPv4-mapped proxy addresses by bits',async()=>{
    const v6=await probe(makeApp(['fd00::2']),'fd00:0:0:0:0:0:0:2','2001:db8::5');
    expect(v6.statusCode).toBe(200);expect(v6.json().ip).toBe('2001:db8::5');
    const mapped=await probe(makeApp(['10.20.0.2']),'::ffff:10.20.0.2','203.0.113.9');
    expect(mapped.statusCode).toBe(200);expect(mapped.json().ip).toBe('203.0.113.9');
  });
  it.each([undefined,'','203.0.113.8, 203.0.113.9','unknown','203.0.113.8:1234','fe80::1%eth0'])
    ('rejects missing or ambiguous forwarding from a trusted immediate proxy: %s',async value=>{
      const result=await probe(makeApp(['10.20.0.2']),'10.20.0.2',value);
      expect(result.statusCode).toBe(403);
      expect(result.headers['cache-control']).toBe('no-store');
    });
  it.each([true,1,'loopback',[],['localhost'],['0.0.0.0/0'],['::/0'],['10.20.0.2/32'],['::'],['0.0.0.0']].map(value=>({value})))
    ('rejects broad or malformed proxy configuration: $value',({value})=>{
      expect(()=>makeApp(value)).toThrow();
    });
  it('allows twelve independent Google start clients through one trusted proxy',async()=>{
    const app=makeApp(['10.20.0.2'],true);
    for(let i=1;i<=12;i++){
      const result=await app.inject({url:'/api/auth/google/start',remoteAddress:'10.20.0.2',
        headers:{'x-forwarded-for':`203.0.113.${i}`}});
      expect(result.statusCode).toBe(303);
    }
  });
  it('still rate-limits one client and cannot bypass it using untrusted forwarding',async()=>{
    for(const trusted of [true,false]){
      const app=makeApp(['10.20.0.2'],true);
      for(let i=1;i<=11;i++){
        const result=await app.inject({url:'/api/auth/google/start',
          remoteAddress:trusted?'10.20.0.2':'198.51.100.4',
          headers:{'x-forwarded-for':trusted?'203.0.113.8':`203.0.113.${i}`}});
        expect(result.statusCode).toBe(i<=10?303:429);
      }
    }
  });
});
