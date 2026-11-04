import {describe,expect,it,vi} from 'vitest';
import {createPostgresGoogleAuth} from '../../apps/api/src/auth-postgres.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';

function config(){
  const connect=vi.fn(async()=>{throw Error('No construction IO permitted');});
  const pool:ReviewerSqlPool={connect};
  return {pools:{sessions:pool,admission:pool,attempts:pool},attemptDigestKey:Buffer.alloc(32,7),
    google:{clientId:'synthetic.apps.googleusercontent.com',allowedOrigin:'https://example.test',
      redirectUri:'https://example.test/api/auth/google/callback',
      exchangeCode:vi.fn(async()=>{throw Error('No construction network permitted');})}};
}
describe('explicit PostgreSQL Google auth assembly',()=>{
  it('constructs the integrated auth port without connecting or calling Google',()=>{
    const c=config(),flow=createPostgresGoogleAuth(c);
    expect(typeof flow.verifySession).toBe('function');
    expect(typeof flow.revokeSession).toBe('function');
    expect(typeof flow.start).toBe('function');
    expect(typeof flow.clearSession).toBe('function');
    expect(c.pools.sessions.connect).not.toHaveBeenCalled();
    expect(c.google.exchangeCode).not.toHaveBeenCalled();
  });
  it.each(['sessions','admission','attempts'] as const)('requires an explicit %s pool',key=>{
    const c=config();(c.pools as any)[key]=undefined;
    expect(()=>createPostgresGoogleAuth(c)).toThrow('Explicit auth PostgreSQL pools required');
    expect(c.google.exchangeCode).not.toHaveBeenCalled();
  });
  it('requires a server-owned digest key and a same-origin callback',()=>{
    const c=config();c.attemptDigestKey=Buffer.alloc(8);
    expect(()=>createPostgresGoogleAuth(c)).toThrow(/digest key/);
    c.attemptDigestKey=Buffer.alloc(32,7);c.google.redirectUri='https://other.test/api/auth/google/callback';
    expect(()=>createPostgresGoogleAuth(c)).toThrow(/callback URL/);
    expect(c.pools.sessions.connect).not.toHaveBeenCalled();
  });
});
