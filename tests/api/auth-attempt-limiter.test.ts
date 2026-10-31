import {describe,expect,it} from 'vitest';
import {
  AUTH_ATTEMPT_RULES,MemoryAuthAttemptLimiter,authAttemptWindow,
} from '../../apps/api/src/modules/auth/auth-attempt-limiter.js';
import {PostgresAuthAttemptLimiter} from
  '../../apps/api/src/modules/auth/auth-attempt-limiter-postgres.js';
import type {ReviewerSqlConnection,ReviewerSqlPool} from
  '../../apps/api/src/modules/auth/reviewer-postgres.js';

const TIME='2026-10-31T12:01:00.000Z';
const KEY=Buffer.alloc(32,17); // Deterministic tests only. Never use in production.
const start=(identifier='ip:192.0.2.17',at=TIME)=>({
  kind:'GOOGLE_START' as const,identifier,at,
});

describe('shared auth attempt windows: scopes and hard UTC boundaries',()=>{
  it('rejects invalid/forged scopes and untrusted timestamps',()=>{
    for(const input of [
      {...start(),identifier:''},
      {...start(),identifier:'ip:\nspoofed'},
      {...start(),at:'yesterday'},
      {...start(),at:'2026-10-31T12:01:00+09:00'},
      {...start(),kind:'UNBOUNDED'},
    ]){
      expect(()=>authAttemptWindow(input as Parameters<typeof authAttemptWindow>[0])).toThrow();
    }
    expect(authAttemptWindow(start()).startedAt).toBe('2026-10-31T12:00:00.000Z');
    expect(AUTH_ATTEMPT_RULES.REVIEWER_REDEEM.maxAttempts).toBe(5);
  });

  it('limits the same source to ten starts, independent of alternate scopes',async()=>{
    const limiter=new MemoryAuthAttemptLimiter();
    for(let n=0;n<10;n++)expect(await limiter.consume(start())).toBe(true);
    expect(await limiter.consume(start())).toBe(false);
    expect(await limiter.consume(start('ip:192.0.2.18'))).toBe(true);
    expect(await limiter.consume({
      ...start(),kind:'GOOGLE_CALLBACK',
    })).toBe(true);
    expect(await limiter.consume(start('ip:192.0.2.17','2026-10-31T12:15:00.000Z')))
      .toBe(true);
  });

  it('uses reviewer Google actor identity, with five attempts but unlimited visits',async()=>{
    const limiter=new MemoryAuthAttemptLimiter();
    const event={
      kind:'REVIEWER_REDEEM' as const,identifier:'google:subject-01',at:TIME,
    };
    for(let n=0;n<5;n++)expect(await limiter.consume(event)).toBe(true);
    expect(await limiter.consume(event)).toBe(false);
    expect(await limiter.consume({...event,identifier:'google:subject-02'})).toBe(true);
    // Page visits are deliberately not restricted by enrollment-attempt limits.
  });

  it('supports OTP issue and confirm as separate protected operation classes',async()=>{
    const limiter=new MemoryAuthAttemptLimiter();
    const issue={kind:'SCHOOL_OTP_ISSUE' as const,identifier:'google:subject-01',at:TIME};
    for(let i=0;i<3;i++)expect(await limiter.consume(issue)).toBe(true);
    expect(await limiter.consume(issue)).toBe(false);
    expect(await limiter.consume({...issue,kind:'SCHOOL_OTP_CONFIRM'})).toBe(true);
  });
});

describe('Postgres rate limiter: single atomic statement and no plaintext account/IP',()=>{
  it('caps competing reservations from independent limiter instances via a shared SQL key',async()=>{
    const seen:Array<{query:string;params:readonly unknown[]}>=[],counts=new Map<string,number>();
    let released=0;
    const connection:ReviewerSqlConnection={
      query:async(sql,params=[])=>{
        seen.push({query:sql,params});
        if(!sql.includes('INSERT INTO auth_attempt_windows'))throw Error('Unexpected SQL');
        const key=[params[0],params[1],params[2]].join('/');
        const next=(counts.get(key)??0)+1;
        if(next>Number(params[3]))return {rows:[]};
        counts.set(key,next);
        return {rows:[{attempts:next}]};
      },
      release:()=>{released++;},
    };
    const pool:ReviewerSqlPool={connect:async()=>connection};
    const a=new PostgresAuthAttemptLimiter(pool,KEY);
    const b=new PostgresAuthAttemptLimiter(pool,KEY);
    const outcomes=await Promise.all(Array.from({length:22},(_,i)=>
      (i%2?a:b).consume(start())));
    expect(outcomes.filter(Boolean)).toHaveLength(10);
    expect(outcomes.filter(v=>!v)).toHaveLength(12);
    expect(released).toBe(22);
    expect(seen[0]?.query).toContain('ON CONFLICT (kind,identity_digest,window_started_at)');
    expect(seen[0]?.query).toContain('WHERE auth_attempt_windows.attempts<$4');
    expect(seen[0]?.query).toContain('RETURNING attempts');
    expect(seen[0]?.params).toHaveLength(4);
    expect(seen[0]?.params[0]).toBe('GOOGLE_START');
    expect(seen[0]?.params[1]).toMatch(/^[a-f0-9]{64}$/);
    expect(seen[0]?.params[2]).toBe('2026-10-31T12:00:00.000Z');
    expect(seen[0]?.params[3]).toBe(10);
    expect(JSON.stringify(seen)).not.toContain('192.0.2.17');
    expect(JSON.stringify(seen)).not.toContain('subject-01');
  });

  it('never opens a DB connection on malformed input or a weak digest key',async()=>{
    let connected=0;
    const pool:ReviewerSqlPool={connect:async()=>{
      connected++;
      return {query:async()=>({rows:[]}),release:()=>{}};
    }};
    expect(()=>new PostgresAuthAttemptLimiter(pool,Buffer.alloc(12))).toThrow();
    const limiter=new PostgresAuthAttemptLimiter(pool,KEY);
    await expect(limiter.consume({...start(),at:'2026/10/31'})).rejects.toThrow();
    expect(connected).toBe(0);
  });

  it('denies on PostgreSQL outages rather than falling back to a process-local counter',async()=>{
    const limiter=new PostgresAuthAttemptLimiter({
      connect:async()=>{throw new Error('database unavailable');},
    },KEY);
    await expect(limiter.consume(start())).rejects.toThrow();
  });
});
