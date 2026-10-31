import {authorizeSession} from './gates.js';
import type {ReviewerSqlPool} from './reviewer-postgres.js';
import type {
  GoogleAuthSession,GoogleAuthStore,GoogleLoginAttempt,GoogleLoginIntent,
} from './google-auth-store.js';

const digest=/^[0-9a-f]{64}$/;
const opaque=/^[A-Za-z0-9_-]{43}$/;
function requiredText(x:unknown):string{
  if(typeof x!=='string')throw new Error('Invalid database text');
  return x;
}
function date(x:unknown):string{
  if(x instanceof Date&&!Number.isNaN(x.getTime()))return x.toISOString();
  if(typeof x==='string'&&!Number.isNaN(Date.parse(x)))
    return new Date(x).toISOString();
  throw new Error('Invalid database time');
}
function attempt(row:Record<string,unknown>):GoogleLoginAttempt{
  const stateDigest=requiredText(row.state_digest);
  const browserDigest=requiredText(row.browser_digest);
  const nonce=requiredText(row.nonce);
  const codeVerifier=requiredText(row.code_verifier);
  const intent=requiredText(row.intent);
  const createdAt=date(row.created_at);
  const expiresAt=date(row.expires_at);
  if(!digest.test(stateDigest)||!digest.test(browserDigest)
    ||!opaque.test(nonce)||!opaque.test(codeVerifier)
    ||(intent!=='BETA'&&intent!=='REVIEWER')
    ||Date.parse(expiresAt)<=Date.parse(createdAt)
    ||Date.parse(expiresAt)-Date.parse(createdAt)>300_000)
    throw new Error('Invalid database login state');
  return {stateDigest,browserDigest,nonce,codeVerifier,
    intent:intent as GoogleLoginIntent,createdAt,expiresAt};
}

/** No connection is created by the constructor, only a bound SQL adapter. */
export class PostgresGoogleAuthStore implements GoogleAuthStore{
  constructor(private readonly pool:ReviewerSqlPool){}

  async putAttempt(value:GoogleLoginAttempt):Promise<void>{
    const c=await this.pool.connect();
    try{
      await c.query(`INSERT INTO google_login_attempts
        (state_digest,browser_digest,nonce,code_verifier,intent,created_at,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,[
        value.stateDigest,value.browserDigest,value.nonce,value.codeVerifier,
        value.intent,value.createdAt,value.expiresAt,
      ]);
    }finally{c.release();}
  }

  async consumeAttempt(stateDigest:string):Promise<GoogleLoginAttempt|null>{
    if(!digest.test(stateDigest))return null;
    const c=await this.pool.connect();
    try{
      // PostgreSQL DELETE ... RETURNING is atomic across all instances.
      const found=await c.query(`DELETE FROM google_login_attempts
        WHERE state_digest=$1
        RETURNING state_digest,browser_digest,nonce,code_verifier,
          intent,created_at,expires_at`,[stateDigest]);
      return found.rows[0]?attempt(found.rows[0]):null;
    }finally{c.release();}
  }

  async createSession(value:GoogleAuthSession):Promise<void>{
    if(!digest.test(value.tokenDigest)
      ||value.tokenDigest!==value.actor.sessionIdHash)
      throw new Error('Invalid session digest');
    const c=await this.pool.connect();
    try{
      await c.query(`INSERT INTO google_app_sessions
        (token_digest,actor_payload,created_at,expires_at)
        VALUES($1,$2::jsonb,$3,$4)`,[
        value.tokenDigest,JSON.stringify(value.actor),
        value.createdAt,value.actor.sessionExpiresAt,
      ]);
    }finally{c.release();}
  }

  async readSession(tokenDigest:string,now:string):Promise<GoogleAuthSession|null>{
    if(!digest.test(tokenDigest))return null;
    const c=await this.pool.connect();
    try{
      const read=await c.query(`SELECT token_digest,actor_payload,created_at
        FROM google_app_sessions
        WHERE token_digest=$1 AND revoked_at IS NULL AND expires_at>$2
        LIMIT 1`,[tokenDigest,now]);
      const row=read.rows[0];
      if(!row)return null;
      const actor=authorizeSession(row.actor_payload,now);
      if(actor.sessionIdHash!==tokenDigest||row.token_digest!==tokenDigest)return null;
      return {tokenDigest,actor,createdAt:date(row.created_at)};
    }catch{return null;}finally{c.release();}
  }

  async revokeSession(tokenDigest:string,now:string):Promise<void>{
    if(!digest.test(tokenDigest))throw new Error('Invalid session digest');
    const c=await this.pool.connect();
    try{
      await c.query(`UPDATE google_app_sessions SET revoked_at=COALESCE(revoked_at,$2)
        WHERE token_digest=$1`,[tokenDigest,now]);
    }finally{c.release();}
  }
}
