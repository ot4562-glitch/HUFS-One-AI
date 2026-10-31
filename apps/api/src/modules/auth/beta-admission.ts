import {z} from 'zod';
import type {GoogleVerifiedIdentity} from './google-oidc.js';
import type {VerifiedTeamActor} from '../../types.js';
import type {SchoolProofApprover} from './school-mail-proof.js';

const Iso=z.iso.datetime({offset:true});
const Email=z.email().max(254);
export const BetaAdmissionProofSchema=z.strictObject({
  googleSubject:z.string().min(1).max(255),
  schoolEmail:Email,
  method:z.enum(['SIGNED_WORKSPACE','MAILBOX_OTP']),
  // One-time challenge verifier/Workspace administrator already checked the proof.
  proofVerifiedAt:Iso.nullable(),
  proofExpiresAt:Iso.nullable(),
  approvedUntil:Iso,
  revokedAt:Iso.nullable(),
}).refine(r=>(r.proofVerifiedAt===null)===(r.proofExpiresAt===null));
export type BetaAdmissionProof=z.output<typeof BetaAdmissionProofSchema>;

export interface BetaAdmissionStore {
  /**
   * Authorized server-side storage only. A browser-supplied email, subject,
   * code or claim must never be accepted as this verified proof record.
   */
  readApproved(input:{googleSubject:string;schoolEmail:string;at:string}):
    Promise<BetaAdmissionProof|null>;
  /** For a personal Google ID separately bound to an approved school mailbox. */
  readApprovedForGoogleSubject?(input:{googleSubject:string;at:string}):
    Promise<BetaAdmissionProof|null>;
}

export interface BetaAdmissionDecision {
  googleSubject:string;
  verifiedEmail:string;
  schoolEmail:string;
  proofMethod:'SIGNED_WORKSPACE'|'MAILBOX_OTP';
  schoolMailProofExpiresAt:string;
}

function isSchoolAddress(value:string):boolean{
  return value===value.toLowerCase()
    &&/^[^\s@]+@hufs\.ac\.kr$/.test(value);
}

/** Beta approval requires both explicit administrator admission and fresh mail proof. */
export function createBetaAdmissionPolicy(
  store:BetaAdmissionStore,
  options:{now?:()=>Date}={},
){
  const clock=options.now??(()=>new Date());
  return async function authorizeBeta(identity:GoogleVerifiedIdentity):
    Promise<BetaAdmissionDecision|null>{
    const now=clock().getTime();
    if(!Number.isFinite(now)||!identity.googleSubject
      ||Date.parse(identity.identityProofExpiresAt)<=now)return null;
    try{
      const raw=isSchoolAddress(identity.verifiedEmail)
        ?await store.readApproved({
          googleSubject:identity.googleSubject,
          schoolEmail:identity.verifiedEmail,
          at:new Date(now).toISOString(),
        })
        :await store.readApprovedForGoogleSubject?.({
          googleSubject:identity.googleSubject,at:new Date(now).toISOString(),
        });
      if(!raw)return null;
      const r=BetaAdmissionProofSchema.parse(raw);
      if(r.googleSubject!==identity.googleSubject||!isSchoolAddress(r.schoolEmail)
        ||r.revokedAt!==null||r.proofVerifiedAt===null||r.proofExpiresAt===null
        ||(r.method==='SIGNED_WORKSPACE'&&(
          !identity.schoolWorkspaceVerified||identity.verifiedEmail!==r.schoolEmail)))
        return null;
      const verified=Date.parse(r.proofVerifiedAt);
      const expiry=Date.parse(r.proofExpiresAt);
      const approvalExpiry=Date.parse(r.approvedUntil);
      // Fresh, bounded proof; don't accept a stale proof revived by later approval.
      if(!Number.isFinite(verified)||verified>now||expiry<=now
        ||expiry<=verified||expiry-verified>24*3600_000||approvalExpiry<=now)
        return null;
      const last=Math.min(expiry,approvalExpiry,Date.parse(identity.identityProofExpiresAt));
      if(!Number.isFinite(last)||last<=now)return null;
      return {
        googleSubject:identity.googleSubject,verifiedEmail:identity.verifiedEmail,
        schoolEmail:r.schoolEmail,proofMethod:r.method,schoolMailProofExpiresAt:new Date(last).toISOString(),
      };
    }catch{
      // DB outage or malformed grant: refuse beta privileges, never downgrade to reviewer.
      return null;
    }
  };
}

/** Recheck approved evidence on every BETA request, including mid-session revocations. */
export function createBetaSessionRechecker(
  store:BetaAdmissionStore,
  options:{now?:()=>Date}={},
){
  const clock=options.now??(()=>new Date());
  return async function recheckBeta(actor:VerifiedTeamActor):Promise<boolean>{
    if(actor.role!=='BETA'||!actor.actorId.startsWith('google:')
      ||!actor.verifiedSchoolEmail||!isSchoolAddress(actor.verifiedSchoolEmail)
      ||!actor.schoolProofMethod)return false;
    const googleSubject=actor.actorId.slice('google:'.length);
    const at=clock().getTime();
    if(!Number.isFinite(at)||!googleSubject
      ||Date.parse(actor.schoolMailProofExpiresAt)<=at)return false;
    try{
      const raw=await store.readApproved({
        googleSubject,schoolEmail:actor.verifiedSchoolEmail,
        at:new Date(at).toISOString(),
      });
      if(!raw)return false;
      const record=BetaAdmissionProofSchema.parse(raw);
      if(record.proofVerifiedAt===null||record.proofExpiresAt===null)return false;
      const verified=Date.parse(record.proofVerifiedAt);
      const expiry=Date.parse(record.proofExpiresAt);
      return record.googleSubject===googleSubject
        &&record.schoolEmail===actor.verifiedSchoolEmail
        &&record.method===actor.schoolProofMethod
        &&record.revokedAt===null
        &&Number.isFinite(verified)&&verified<=at
        &&expiry>at&&expiry-verified<=24*3600_000
        &&Date.parse(record.approvedUntil)>at;
    }catch{return false;}
  };
}

/** For synthetic unit tests only. No public route is allowed to add a proof. */
export class MemoryBetaAdmissionStore implements BetaAdmissionStore,SchoolProofApprover {
  private readonly approved=new Map<string,BetaAdmissionProof>();
  setApproved(record:BetaAdmissionProof){
    const value=BetaAdmissionProofSchema.parse(record);
    this.approved.set(value.googleSubject,structuredClone(value));
  }
  async readApproved({googleSubject}:{
    googleSubject:string;schoolEmail:string;at:string;
  }):Promise<BetaAdmissionProof|null>{
    const existing=this.approved.get(googleSubject);
    return existing?structuredClone(existing):null;
  }
  async readApprovedForGoogleSubject({googleSubject}:{
    googleSubject:string;at:string;
  }):Promise<BetaAdmissionProof|null>{
    const existing=this.approved.get(googleSubject);
    return existing?structuredClone(existing):null;
  }
  async mayIssue(input:{googleSubject:string;schoolEmail:string;at:string}):Promise<boolean>{
    const record=this.approved.get(input.googleSubject);
    const at=Date.parse(input.at);
    return !!record&&record.schoolEmail===input.schoolEmail
      &&record.revokedAt===null&&Number.isFinite(at)
      &&Date.parse(record.approvedUntil)>at;
  }
  /** Test/admin-only: change proof on an EXISTING authorized row. */
  async confirm(input:{
    googleSubject:string;schoolEmail:string;verifiedAt:string;validUntil:string;
  }):Promise<boolean>{
    const record=this.approved.get(input.googleSubject);
    const at=Date.parse(input.verifiedAt);
    if(!record||record.schoolEmail!==input.schoolEmail||record.revokedAt!==null
      ||!Number.isFinite(at)||Date.parse(record.approvedUntil)<=at
      ||Date.parse(input.validUntil)<=at)return false;
    const updated=BetaAdmissionProofSchema.parse({
      ...record,method:'MAILBOX_OTP',
      proofVerifiedAt:input.verifiedAt,
      proofExpiresAt:new Date(Math.min(
        Date.parse(input.validUntil),Date.parse(record.approvedUntil))).toISOString(),
    });
    this.approved.set(input.googleSubject,updated);
    return true;
  }
}
