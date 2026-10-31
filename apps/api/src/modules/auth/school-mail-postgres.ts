import type {ReviewerSqlPool} from './reviewer-postgres.js';
import type {SchoolMailChallenge,SchoolMailChallengeStore,SchoolProofApprover} from './school-mail-proof.js';

/** PostgreSQL implementations have no network side effects until a pool is injected. */
export class PostgresSchoolMailChallengeStore implements SchoolMailChallengeStore {
  constructor(private readonly pool:ReviewerSqlPool){}

  async issue(input:SchoolMailChallenge):Promise<boolean>{
    const connection=await this.pool.connect();
    let open=false;
    try{
      await connection.query('BEGIN');open=true;
      // UPSERT holds a row lock so competing requests cannot exceed 3 sends/hour.
      const quota=await connection.query(`INSERT INTO beta_mail_issue_windows
        (google_subject,window_started_at,issued_count)
        VALUES ($1,$2,1)
        ON CONFLICT (google_subject) DO UPDATE
        SET window_started_at=CASE WHEN
            beta_mail_issue_windows.window_started_at<=$2::timestamptz-interval '1 hour'
          THEN $2::timestamptz ELSE beta_mail_issue_windows.window_started_at END,
          issued_count=CASE WHEN
            beta_mail_issue_windows.window_started_at<=$2::timestamptz-interval '1 hour'
          THEN 1 ELSE beta_mail_issue_windows.issued_count+1 END
        WHERE beta_mail_issue_windows.issued_count<3
          OR beta_mail_issue_windows.window_started_at<=$2::timestamptz-interval '1 hour'
        RETURNING issued_count`,[
          input.googleSubject,input.createdAt,
        ]);
      if(!quota.rows.length){
        await connection.query('COMMIT');open=false;
        return false;
      }
      const created=await connection.query(`INSERT INTO beta_mail_challenges
        (challenge_id,google_subject,school_email,proof_digest,created_at,expires_at)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING challenge_id`,[
          input.challengeId,input.googleSubject,input.schoolEmail,
          input.proofDigest,input.createdAt,input.expiresAt,
        ]);
      if(created.rows.length!==1)throw new Error('Challenge not stored');
      await connection.query('COMMIT');open=false;
      return true;
    }catch(error){
      if(open)try{await connection.query('ROLLBACK');}catch{/* deny on failure */}
      throw error;
    }finally{connection.release();}
  }

  async check(input:{
    challengeId:string;googleSubject:string;schoolEmail:string;
    proofDigest:string;now:string;
  }):Promise<boolean>{
    const connection=await this.pool.connect();
    try{
      // UPDATE is an atomic compare-and-consume operation across all API replicas.
      const result=await connection.query(`UPDATE beta_mail_challenges
        SET attempts=attempts+1,
          used_at=CASE WHEN proof_digest=$4 THEN $5::timestamptz ELSE used_at END
        WHERE challenge_id=$1 AND google_subject=$2 AND school_email=$3
          AND created_at<=$5 AND expires_at>$5
          AND attempts<5 AND used_at IS NULL
        RETURNING (proof_digest=$4) AS accepted`,[
          input.challengeId,input.googleSubject,input.schoolEmail,
          input.proofDigest,input.now,
        ]);
      return result.rows[0]?.accepted===true;
    }finally{connection.release();}
  }

  async cancel(challengeId:string):Promise<void>{
    const connection=await this.pool.connect();
    try{
      await connection.query(`DELETE FROM beta_mail_challenges
        WHERE challenge_id=$1`,[challengeId]);
    }finally{connection.release();}
  }
}

/** OTP verification can update an existing administrator approval but cannot create one. */
export class PostgresSchoolProofApprover implements SchoolProofApprover {
  constructor(private readonly pool:ReviewerSqlPool){}

  async mayIssue(input:{googleSubject:string;schoolEmail:string;at:string}):Promise<boolean>{
    const connection=await this.pool.connect();
    try{
      const result=await connection.query(`SELECT 1 FROM beta_school_proofs
        WHERE google_subject=$1 AND school_email=$2
          AND approved_until>$3 AND revoked_at IS NULL
        LIMIT 1`,[input.googleSubject,input.schoolEmail,input.at]);
      return result.rows.length===1;
    }finally{connection.release();}
  }

  async confirm(input:{
    googleSubject:string;schoolEmail:string;verifiedAt:string;validUntil:string;
  }):Promise<boolean>{
    const connection=await this.pool.connect();
    try{
      const result=await connection.query(`UPDATE beta_school_proofs
        SET method='MAILBOX_OTP',proof_verified_at=$3::timestamptz,
          proof_expires_at=LEAST($4::timestamptz,approved_until)
        WHERE google_subject=$1 AND school_email=$2
          AND approved_until>$3 AND revoked_at IS NULL
        RETURNING google_subject`,[
          input.googleSubject,input.schoolEmail,input.verifiedAt,input.validUntil,
        ]);
      return result.rows.length===1;
    }finally{connection.release();}
  }
}
