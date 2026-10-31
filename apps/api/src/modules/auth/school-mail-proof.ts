import {createHmac,randomBytes,randomInt,timingSafeEqual} from 'node:crypto';

const SCHOOL_MAIL=/^[^\s@]{1,64}@hufs\.ac\.kr$/;
const GOOGLE_SUB=/^[\x21-\x7e]{1,255}$/;
const CODE=/^\d{8}$/;
const ID=/^[A-Za-z0-9_-]{22}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const TEN_MINUTES=10*60_000;
const ONE_HOUR=60*60_000;
const MAX_CHECKS=5;
const MAX_SENDS=3;

export interface SchoolMailChallenge {
  challengeId:string;
  googleSubject:string;
  schoolEmail:string;
  proofDigest:string;
  createdAt:string;
  expiresAt:string;
}
export interface SchoolMailChallengeStore {
  /**
   * Atomic cross-process rate limit: at most 3 issues per Google subject/hour.
   * Return false on quota exceeded, never save a raw mail code.
   */
  issue(challenge:SchoolMailChallenge):Promise<boolean>;
  /**
   * Atomically count the attempt, compare the HMAC digest, and consume on
   * success. A challenge can be checked at most 5 times and used once.
   */
  check(input:{
    challengeId:string;googleSubject:string;schoolEmail:string;
    proofDigest:string;now:string;
  }):Promise<boolean>;
  cancel(challengeId:string):Promise<void>;
}
export interface SchoolMailSender {
  /** Must be wired to an approved provider outside the source repository. */
  send(input:{schoolEmail:string;code:string;expiresAt:string}):Promise<void>;
}
export interface SchoolProofApprover {
  /**
   * Check this specific approved Google subject + school email BEFORE email
   * delivery, without relying on the browser's school-mail claim.
   */
  mayIssue(input:{googleSubject:string;schoolEmail:string;at:string}):Promise<boolean>;
  /**
   * Update a PRE-APPROVED matching account only. Never INSERT an approval.
   * false is returned when administrator admission is absent/revoked.
   */
  confirm(input:{
    googleSubject:string;schoolEmail:string;verifiedAt:string;validUntil:string;
  }):Promise<boolean>;
}
export class SchoolMailProofError extends Error {
  constructor(){super('Unable to verify school mail');}
}
function validate(subject:string,email:string):boolean {
  return GOOGLE_SUB.test(subject)&&SCHOOL_MAIL.test(email)
    &&email===email.toLowerCase();
}
function epoch(value:string):number{return Date.parse(value);}
function sameDigest(a:string,b:string):boolean {
  if(!DIGEST.test(a)||!DIGEST.test(b))return false;
  return timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}
function digest(key:Buffer,id:string,subject:string,email:string,code:string):string {
  return createHmac('sha256',key)
    .update([id,subject,email,code].join('\x00'),'utf8')
    .digest('hex');
}

/** Synthetic single-process store; production must use a transactional adapter. */
export class MemorySchoolMailChallengeStore implements SchoolMailChallengeStore {
  private rows=new Map<string,SchoolMailChallenge&{attempts:number;used:boolean}>();
  private history=new Map<string,number[]>();
  async issue(value:SchoolMailChallenge):Promise<boolean>{
    const now=epoch(value.createdAt);
    if(!validate(value.googleSubject,value.schoolEmail)
      ||!Number.isFinite(now)||epoch(value.expiresAt)-now!==TEN_MINUTES
      ||!ID.test(value.challengeId)||!DIGEST.test(value.proofDigest))return false;
    // Global per-Google-account quota prevents one actor targeting many mailboxes.
    const identity=value.googleSubject;
    const events=(this.history.get(identity)??[]).filter(x=>x>now-ONE_HOUR);
    if(events.length>=MAX_SENDS||this.rows.has(value.challengeId)
      ||this.rows.size>=512||this.history.size>=512)return false;
    events.push(now);
    this.history.set(identity,events);
    this.rows.set(value.challengeId,{...structuredClone(value),attempts:0,used:false});
    return true;
  }
  async check(input:{
    challengeId:string;googleSubject:string;schoolEmail:string;
    proofDigest:string;now:string;
  }):Promise<boolean>{
    const r=this.rows.get(input.challengeId);
    if(!r||r.used||r.attempts>=MAX_CHECKS
      ||r.googleSubject!==input.googleSubject||r.schoolEmail!==input.schoolEmail
      ||epoch(input.now)<epoch(r.createdAt)||epoch(input.now)>=epoch(r.expiresAt))
      return false;
    r.attempts++;
    if(!sameDigest(r.proofDigest,input.proofDigest))return false;
    r.used=true;
    return true;
  }
  async cancel(id:string):Promise<void>{this.rows.delete(id);}
}

export function createSchoolMailProofService(options:{
  store:SchoolMailChallengeStore;
  sender:SchoolMailSender;
  approver:SchoolProofApprover;
  /** 32+ random bytes kept in a protected server runtime only. */
  digestKey:Buffer;
  now?:()=>Date;
}){
  if(!Buffer.isBuffer(options.digestKey)||options.digestKey.length<32)
    throw new Error('School mail digest key must be server-owned');
  const key=Buffer.from(options.digestKey);
  const now=options.now??(()=>new Date());
  const current=()=>{
    const value=now();
    if(!(value instanceof Date)||!Number.isFinite(value.getTime()))
      throw new SchoolMailProofError();
    return value;
  };
  return {
    async issue(input:{googleSubject:string;schoolEmail:string}):
      Promise<{challengeId:string;expiresAt:string}>{
      if(!validate(input.googleSubject,input.schoolEmail))
        throw new SchoolMailProofError();
      const at=current();
      let allowed=false;
      try{
        allowed=await options.approver.mayIssue({
          ...input,at:at.toISOString(),
        });
      }catch{/* Deny on an unavailable or malformed authorization ledger. */}
      if(!allowed)throw new SchoolMailProofError();
      const challengeId=randomBytes(16).toString('base64url');
      const code=String(randomInt(0,100_000_000)).padStart(8,'0');
      const expiresAt=new Date(at.getTime()+TEN_MINUTES).toISOString();
      const created=await options.store.issue({
        challengeId,googleSubject:input.googleSubject,schoolEmail:input.schoolEmail,
        proofDigest:digest(key,challengeId,input.googleSubject,input.schoolEmail,code),
        createdAt:at.toISOString(),expiresAt,
      });
      if(!created)throw new SchoolMailProofError();
      try{
        await options.sender.send({schoolEmail:input.schoolEmail,code,expiresAt});
      }catch{
        try{await options.store.cancel(challengeId);}catch{/* deny even if cleanup fails */}
        throw new SchoolMailProofError();
      }
      // The 8-digit code is exposed only to the approved outbound sender.
      return {challengeId,expiresAt};
    },
    async verify(input:{
      challengeId:string;googleSubject:string;schoolEmail:string;code:string;
    }):Promise<boolean>{
      if(!ID.test(input.challengeId)||!validate(input.googleSubject,input.schoolEmail)
        ||!CODE.test(input.code))return false;
      try{
        const at=current();
        const accepted=await options.store.check({
          ...input,proofDigest:digest(
            key,input.challengeId,input.googleSubject,input.schoolEmail,input.code),
          now:at.toISOString(),
        });
        if(!accepted)return false;
        return await options.approver.confirm({
          googleSubject:input.googleSubject,schoolEmail:input.schoolEmail,
          verifiedAt:at.toISOString(),
          validUntil:new Date(at.getTime()+ONE_HOUR).toISOString(),
        });
      }catch{return false;}
    },
  };
}
