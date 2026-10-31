import {createHmac} from 'node:crypto';
import type {ReviewerSqlPool} from './reviewer-postgres.js';
import {authAttemptWindow} from './auth-attempt-limiter.js';
import type {AuthAttempt,AuthAttemptLimiter} from './auth-attempt-limiter.js';

/**
 * Shared across processes and replicas with the SAME protected digest key.
 * No raw IPs, account IDs, tokens or codes are persisted. Never instantiate
 * with a key supplied by a request or a predictable development fixture.
 */
export class PostgresAuthAttemptLimiter implements AuthAttemptLimiter {
  private readonly key:Buffer;

  constructor(
    private readonly pool:ReviewerSqlPool,
    digestKey:Buffer,
  ){
    if(!Buffer.isBuffer(digestKey)||digestKey.length<32)
      throw new Error('Auth rate-limit digest key must be server owned');
    this.key=Buffer.from(digestKey);
  }

  async consume(value:AuthAttempt):Promise<boolean>{
    const window=authAttemptWindow(value);
    const hashed=createHmac('sha256',this.key)
      .update(window.kind,'utf8').update('\0','utf8')
      .update(window.identifier,'utf8').digest('hex');
    const connection=await this.pool.connect();
    try{
      // The conflict row lock serializes every competing reservation, including
      // concurrent requests from separate API replicas. No read-then-write race.
      const result=await connection.query([
        'INSERT INTO auth_attempt_windows',
        ' (kind,identity_digest,window_started_at,attempts)',
        ' VALUES ($1,$2,$3,1)',
        ' ON CONFLICT (kind,identity_digest,window_started_at) DO UPDATE',
        ' SET attempts=auth_attempt_windows.attempts+1',
        ' WHERE auth_attempt_windows.attempts<$4',
        ' RETURNING attempts',
      ].join('\n'),[
        window.kind,hashed,window.startedAt,window.maxAttempts,
      ]);
      return result.rows.length===1;
    }finally{
      connection.release();
    }
  }
}
