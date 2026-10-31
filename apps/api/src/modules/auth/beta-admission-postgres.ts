import {BetaAdmissionProofSchema} from './beta-admission.js';
import type {BetaAdmissionStore,BetaAdmissionProof} from './beta-admission.js';
import type {ReviewerSqlPool} from './reviewer-postgres.js';

function timestamp(raw:unknown):string{
  if(raw instanceof Date&&!Number.isNaN(raw.getTime()))return raw.toISOString();
  if(typeof raw==='string'&&!Number.isNaN(Date.parse(raw)))
    return new Date(raw).toISOString();
  throw new Error('Invalid school proof timestamp');
}
function text(raw:unknown):string{
  if(typeof raw!=='string')throw new Error('Invalid school proof value');
  return raw;
}

export class PostgresBetaAdmissionStore implements BetaAdmissionStore {
  constructor(private readonly pool:ReviewerSqlPool){}
  async readApproved(input:{
    googleSubject:string;schoolEmail:string;at:string;
  }):Promise<BetaAdmissionProof|null>{
    const c=await this.pool.connect();
    try{
      const r=await c.query(`SELECT google_subject, school_email, method,
        proof_verified_at,proof_expires_at,approved_until,revoked_at
        FROM beta_school_proofs
        WHERE google_subject=$1 AND school_email=$2
          AND proof_verified_at<=$3 AND proof_expires_at>$3
          AND approved_until>$3 AND revoked_at IS NULL
        LIMIT 1`,[input.googleSubject,input.schoolEmail,input.at]);
      const x=r.rows[0];
      if(!x)return null;
      return BetaAdmissionProofSchema.parse({
        googleSubject:text(x.google_subject),
        schoolEmail:text(x.school_email),
        method:text(x.method),
        proofVerifiedAt:timestamp(x.proof_verified_at),
        proofExpiresAt:timestamp(x.proof_expires_at),
        approvedUntil:timestamp(x.approved_until),
        revokedAt:x.revoked_at?timestamp(x.revoked_at):null,
      });
    }finally{c.release();}
  }
}
