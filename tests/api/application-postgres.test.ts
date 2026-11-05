import {afterEach,describe,expect,it,vi} from 'vitest';
import {createPostgresApplication} from '../../apps/api/src/application-postgres.js';

function pool(){return {connect:vi.fn(async()=>{throw Error('Synthetic SQL unavailable');})};}
function config(){
  const pools={sessions:pool(),admission:pool(),attempts:pool()};
  return {auth:{pools,attemptDigestKey:Buffer.alloc(32,7),
    google:{clientId:'synthetic.apps.googleusercontent.com',allowedOrigin:'https://example.test',
      redirectUri:'https://example.test/api/auth/google/callback',
      exchangeCode:vi.fn(async()=>{throw Error('No Google request permitted');})}},
    platform:{pools:{projections:pool(),calendar:pool(),personal:pool(),evidence:pool()},
      evidenceRights:{resolveFor:vi.fn(async()=>null)}}};
}
const opened:Array<ReturnType<typeof createPostgresApplication>>=[];
afterEach(async()=>{await Promise.all(opened.splice(0).map(app=>app.close()));vi.unstubAllEnvs();});
describe('server-owned durable PostgreSQL application assembly',()=>{
  it('constructs an unbound Fastify application without connecting to any pool or external service',async()=>{
    const c=config(),app=createPostgresApplication(c);opened.push(app);
    expect(app.server.listening).toBe(false);
    expect((await app.inject({url:'/api/health'})).statusCode).toBe(401);
    for(const p of [...Object.values(c.auth.pools),...Object.values(c.platform.pools)])
      expect(p.connect).not.toHaveBeenCalled();
    expect(c.auth.google.exchangeCode).not.toHaveBeenCalled();
  });
  it('fails closed on anonymous owner/API/OTP requests without reading projections',async()=>{
    const c=config(),app=createPostgresApplication(c);opened.push(app);
    for(const url of ['/api/profile','/api/consents','/api/academics/double-major','/api/demo-profile','/api/auth/session'])
      expect((await app.inject({url})).statusCode).toBe(401);
    expect((await app.inject({method:'POST',url:'/api/auth/school-mail/request',payload:{schoolEmail:'synthetic@hufs.ac.kr'}})).statusCode).toBe(401);
    for(const p of Object.values(c.platform.pools))expect(p.connect).not.toHaveBeenCalled();
  });
  it('uses the dedicated durable limiter before login and never falls back to Google on outage',async()=>{
    const c=config(),app=createPostgresApplication(c);opened.push(app);
    expect((await app.inject({url:'/api/auth/google/start?intent=BETA'})).statusCode).toBe(503);
    expect(c.auth.pools.attempts.connect).toHaveBeenCalledOnce();
    expect(c.auth.pools.sessions.connect).not.toHaveBeenCalled();
    expect(c.auth.google.exchangeCode).not.toHaveBeenCalled();
  });
  it.each(['projections','calendar','personal','evidence'] as const)('requires a dedicated %s pool',key=>{
    const c=config();(c.platform.pools as any)[key]=undefined;
    expect(()=>createPostgresApplication(c)).toThrow(/platform PostgreSQL pools/);
  });
  it('requires an explicit rights resolver and never constructs only half of REVIEWER persistence',()=>{
    const c:any=config();c.platform.evidenceRights=undefined;
    expect(()=>createPostgresApplication(c)).toThrow(/evidence rights/);
    c.platform.evidenceRights={resolveFor:async()=>null};c.platform.reviewerSandbox=pool();
    expect(()=>createPostgresApplication(c)).toThrow(/reviewer/);
    delete c.platform.reviewerSandbox;c.reviewer={invitations:pool(),demo:{listProfiles:async()=>[],readSnapshot:async()=>null}};
    expect(()=>createPostgresApplication(c)).toThrow(/reviewer/);
  });
  it('does not expose an unusable OTP stage without the dedicated reviewer stores',()=>{
    const c=config();
    expect(()=>createPostgresApplication({...c,schoolMailProof:{issue:async()=>({challengeId:'A'.repeat(22),expiresAt:'2026-11-04T01:00:00Z'}),
      verify:async()=>false}})).toThrow(/School mail login stage requires explicit reviewer/);
  });
  it('accepts explicitly paired synthetic REVIEWER storage without activating it or connecting',()=>{
    const c=config(),invitations=pool(),sandbox=pool();
    const app=createPostgresApplication({...c,platform:{...c.platform,reviewerSandbox:sandbox},
      reviewer:{invitations,demo:{listProfiles:async()=>[],readSnapshot:async()=>null}}});
    opened.push(app);expect(app.server.listening).toBe(false);
    expect(invitations.connect).not.toHaveBeenCalled();expect(sandbox.connect).not.toHaveBeenCalled();
  });
  it('wires an explicit ADMIN usage pool without opening it or bypassing anonymous denial',async()=>{
    const c=config(),usage=pool(),authority={isApproved:vi.fn(async()=>true)};
    const app=createPostgresApplication({...c,platform:{...c.platform,adminUsage:{pool:usage,authority}}});
    opened.push(app);
    expect((await app.inject({url:'/api/admin/usage'})).statusCode).toBe(401);
    expect(usage.connect).not.toHaveBeenCalled();
  });
  it.each(['APP_ENV','NODE_ENV'])('retains the production refusal through %s',name=>{
    vi.stubEnv(name,'production');
    const c=config();expect(()=>createPostgresApplication(c)).toThrow(/Production integration disabled/);
    for(const p of Object.values(c.platform.pools))expect(p.connect).not.toHaveBeenCalled();
  });
});
