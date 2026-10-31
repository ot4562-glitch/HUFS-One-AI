import type {VerifiedActor} from '../../types.js';
import type {GoogleOidcAttempt} from './google-oidc.js';

export type GoogleLoginIntent='REVIEWER'|'BETA';

export interface GoogleLoginAttempt extends GoogleOidcAttempt {
  browserDigest:string;
  intent:GoogleLoginIntent;
}
export interface GoogleAuthSession {
  tokenDigest:string;
  actor:VerifiedActor;
  createdAt:string;
}

/**
 * Production implementations must atomically consume a one-time attempt.
 * Session storage is server-side; clients receive opaque random cookies only.
 */
export interface GoogleAuthStore {
  putAttempt(value:GoogleLoginAttempt):Promise<void>;
  consumeAttempt(stateDigest:string):Promise<GoogleLoginAttempt|null>;
  createSession(value:GoogleAuthSession):Promise<void>;
  readSession(tokenDigest:string,at:string):Promise<GoogleAuthSession|null>;
  revokeSession(tokenDigest:string,at:string):Promise<void>;
}

/** A synthetic test adapter, never wire into production. */
export class MemoryGoogleAuthStore implements GoogleAuthStore {
  private attempts=new Map<string,GoogleLoginAttempt>();
  private sessions=new Map<string,GoogleAuthSession>();

  async putAttempt(value:GoogleLoginAttempt):Promise<void>{
    if(this.attempts.size>=512||this.attempts.has(value.stateDigest))
      throw new Error('Unable to create login attempt');
    this.attempts.set(value.stateDigest,structuredClone(value));
  }
  async consumeAttempt(key:string):Promise<GoogleLoginAttempt|null>{
    const value=this.attempts.get(key)??null;
    this.attempts.delete(key);
    return value?structuredClone(value):null;
  }
  async createSession(value:GoogleAuthSession):Promise<void>{
    if(value.actor.role!=='REVIEWER'&&value.actor.role!=='BETA')
      throw new Error('Google OIDC administrative role forbidden');
    if(this.sessions.size>=512||this.sessions.has(value.tokenDigest))
      throw new Error('Unable to create session');
    this.sessions.set(value.tokenDigest,structuredClone(value));
  }
  async readSession(key:string,now:string):Promise<GoogleAuthSession|null>{
    const value=this.sessions.get(key);
    if(!value||!['REVIEWER','BETA'].includes(value.actor.role)
      ||Date.parse(value.actor.sessionExpiresAt)<=Date.parse(now))return null;
    return structuredClone(value);
  }
  async revokeSession(key:string):Promise<void>{this.sessions.delete(key);}
}
