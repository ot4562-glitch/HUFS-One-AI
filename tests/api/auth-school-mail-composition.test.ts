import {describe,expect,it,vi} from 'vitest';
import {createPostgresSchoolMailAuth} from '../../apps/api/src/auth-postgres.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';

function config(){
  const connect=vi.fn(async()=>{throw Error('No construction IO permitted');});
  const pool:ReviewerSqlPool={connect};
  return {pools:{sessions:pool,admission:pool,attempts:pool},attemptDigestKey:Buffer.alloc(32,7),
    google:{clientId:'synthetic.apps.googleusercontent.com',allowedOrigin:'https://example.test',
      redirectUri:'https://example.test/api/auth/google/callback',
      exchangeCode:vi.fn(async()=>{throw Error('No construction network permitted');})},
    schoolMail:{pools:{challenges:pool,proofUpdates:pool},digestKey:Buffer.alloc(32,8),
      sender:{send:vi.fn(async()=>{})}}};
}
describe('explicit durable school mailbox auth composition',()=>{
  it('returns both existing HTTP ports without SQL, sender or Google IO',()=>{
    const c=config(),ports=createPostgresSchoolMailAuth(c);
    expect(typeof ports.googleAuth.verifySession).toBe('function');
    expect(typeof ports.schoolMailProof.issue).toBe('function');
    expect(typeof ports.schoolMailProof.verify).toBe('function');
    expect(c.pools.sessions.connect).not.toHaveBeenCalled();
    expect(c.schoolMail.sender.send).not.toHaveBeenCalled();
    expect(c.google.exchangeCode).not.toHaveBeenCalled();
  });
  it.each(['challenges','proofUpdates'] as const)('requires an explicit %s pool',key=>{
    const c=config();(c.schoolMail.pools as any)[key]=undefined;
    expect(()=>createPostgresSchoolMailAuth(c)).toThrow(/school mail PostgreSQL pools/);
    expect(c.pools.sessions.connect).not.toHaveBeenCalled();
  });
  it.each(['sessions','admission','attempts'] as const)('retains the required %s auth pool',key=>{
    const c=config();(c.pools as any)[key]=undefined;
    expect(()=>createPostgresSchoolMailAuth(c)).toThrow(/auth PostgreSQL pools/);
  });
  it('requires an explicit approved sender and protected OTP digest key',()=>{
    const c=config();(c.schoolMail as any).sender=undefined;
    expect(()=>createPostgresSchoolMailAuth(c)).toThrow(/sender/);
    c.schoolMail.sender={send:vi.fn(async()=>{})};c.schoolMail.digestKey=Buffer.alloc(8);
    expect(()=>createPostgresSchoolMailAuth(c)).toThrow(/digest key/);
    expect(c.pools.sessions.connect).not.toHaveBeenCalled();
  });
  it('requires a trusted socket IP before any ledger access or delivery',async()=>{
    const c=config(),ports=createPostgresSchoolMailAuth(c);
    await expect(ports.schoolMailProof.issue({googleSubject:'SYN-SUBJECT',
      schoolEmail:'synthetic@hufs.ac.kr'})).rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE'});
    expect(c.pools.sessions.connect).not.toHaveBeenCalled();
    expect(c.schoolMail.sender.send).not.toHaveBeenCalled();
  });
});
