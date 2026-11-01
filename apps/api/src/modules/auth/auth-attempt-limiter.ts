/**
 * Fixed-window admission controls for authentication endpoints.
 *
 * Production requires a durable implementation shared by every API process.
 * The memory store below is only for isolated synthetic tests.
 *
 * All callers supply a server-derived IP or verified Google actor identifier;
 * forwarded headers and browser form fields are never trusted as identities.
 */
export const AUTH_ATTEMPT_RULES={
  GOOGLE_START:{maxAttempts:10,windowMs:15*60_000},
  GOOGLE_CALLBACK:{maxAttempts:20,windowMs:15*60_000},
  REVIEWER_REDEEM:{maxAttempts:5,windowMs:15*60_000},
  SCHOOL_OTP_ISSUE:{maxAttempts:3,windowMs:60*60_000},
  SCHOOL_OTP_CONFIRM:{maxAttempts:10,windowMs:10*60_000},
  SCHOOL_OTP_ISSUE_IP:{maxAttempts:10,windowMs:60*60_000},
  SCHOOL_OTP_ISSUE_GLOBAL:{maxAttempts:100,windowMs:60*60_000},
  SCHOOL_OTP_CONFIRM_IP:{maxAttempts:30,windowMs:10*60_000},
} as const;

export type AuthAttemptKind=keyof typeof AUTH_ATTEMPT_RULES;
export interface AuthAttempt {
  kind:AuthAttemptKind;
  /** Prefix with ip: or google:; construct only from the trusted request. */
  identifier:string;
  /** Trusted server time, never a browser-provided timestamp. */
  at:string;
}
export interface AuthAttemptLimiter {
  /** Atomically reserve an attempt. False means a hard denial. Errors fail closed. */
  consume(value:AuthAttempt):Promise<boolean>;
}
export interface AuthAttemptWindow {
  kind:AuthAttemptKind;
  identifier:string;
  startedAt:string;
  maxAttempts:number;
}

export function authAttemptWindow(value:AuthAttempt):AuthAttemptWindow{
  if(!Object.prototype.hasOwnProperty.call(AUTH_ATTEMPT_RULES,value.kind)
    || typeof value.identifier!=='string'
    || value.identifier.length<4 || value.identifier.length>512
    || !/^[\x21-\x7e]+$/.test(value.identifier)
    || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value.at))
    throw new Error('Invalid authentication attempt scope');
  const ms=Date.parse(value.at);
  if(!Number.isFinite(ms))throw new Error('Invalid trusted authentication clock');
  const rule=AUTH_ATTEMPT_RULES[value.kind];
  return {
    kind:value.kind,identifier:value.identifier,
    startedAt:new Date(Math.floor(ms/rule.windowMs)*rule.windowMs).toISOString(),
    maxAttempts:rule.maxAttempts,
  };
}

/** Testing only: real deployments must use PostgresAuthAttemptLimiter. */
export class MemoryAuthAttemptLimiter implements AuthAttemptLimiter {
  private readonly counts=new Map<string,{count:number;startedAt:string}>();
  async consume(value:AuthAttempt):Promise<boolean>{
    const window=authAttemptWindow(value);
    const key=window.kind+'\0'+window.identifier;
    const old=this.counts.get(key);
    if(!old||old.startedAt!==window.startedAt){
      if(this.counts.size>=4096&&!old)throw new Error('Synthetic limiter full');
      this.counts.set(key,{count:1,startedAt:window.startedAt});
      return true;
    }
    if(old.count>=window.maxAttempts)return false;
    old.count++;
    return true;
  }
}
