import {ReviewerRecordSchema,ReviewerEnrollmentSchema,normalizeReviewerEmail} from './reviewer.js';
import type {ReviewerAccessStore,ReviewerGrant,ReviewerRecord} from './reviewer.js';

/** PostgreSQL adapter. No DB connection, NCP resource, or migration is created here. */
export interface SqlResult {rows:Array<Record<string,unknown>>}
export interface ReviewerSqlConnection {
  query(sql:string,params?:readonly unknown[]):Promise<SqlResult>;
  release():void;
}
export interface ReviewerSqlPool {connect():Promise<ReviewerSqlConnection>}
const date=(v:unknown):string=>{
  if(v instanceof Date)return v.toISOString();
  if(typeof v==='string'&&!Number.isNaN(Date.parse(v)))return new Date(v).toISOString();
  throw new Error('Invalid database timestamp');
};
const str=(v:unknown):string=>{
  if(typeof v!=='string')throw new Error('Invalid database text');
  return v;
};
const num=(v:unknown):number=>{
  const n=Number(v);
  if(!Number.isSafeInteger(n))throw new Error('Invalid database integer');
  return n;
};
function record(row:Record<string,unknown>):ReviewerRecord{
  return ReviewerRecordSchema.parse({
    id:str(row.id),startsAt:date(row.starts_at),endsAt:date(row.ends_at),
    label:str(row.label),maxAccounts:num(row.max_accounts),
    tokenDigest:str(row.token_digest),issuedAt:date(row.issued_at),
    ...(row.revoked_at?{revokedAt:date(row.revoked_at)}:{}),
  });
}
const grant=(r:ReviewerRecord,actorId:string,email:string):ReviewerGrant=>({
  inviteId:r.id,actorId,verifiedEmail:email,
  startsAt:r.startsAt,endsAt:r.endsAt,label:r.label,
});
const isActive=(r:ReviewerRecord,now:string)=>!r.revokedAt
  &&Date.parse(r.startsAt)<=Date.parse(now)&&Date.parse(now)<Date.parse(r.endsAt);

export class PostgresReviewerAccessStore implements ReviewerAccessStore {
  constructor(private readonly pool:ReviewerSqlPool){}
  async saveIssued(value:ReviewerRecord):Promise<void>{
    const v=ReviewerRecordSchema.parse(value);
    const c=await this.pool.connect();
    try{
      await c.query(`INSERT INTO reviewer_invitations
        (id,starts_at,ends_at,label,max_accounts,token_digest,issued_at,revoked_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [v.id,v.startsAt,v.endsAt,v.label,v.maxAccounts,v.tokenDigest,v.issuedAt,v.revokedAt??null]);
    }finally{c.release();}
  }
  async redeem(input:{tokenDigest:string;actorId:string;verifiedEmail:string;now:string}):Promise<ReviewerGrant|null>{
    const email=normalizeReviewerEmail(input.verifiedEmail);
    const c=await this.pool.connect();
    let open=false;
    try{
      await c.query('BEGIN');open=true;
      // This row lock SERIALIZES all new enrollments for a shared invitation;
      // otherwise two first-time judges could exceed max_accounts concurrently.
      const found=await c.query(`SELECT id,starts_at,ends_at,label,max_accounts,
        token_digest,issued_at,revoked_at FROM reviewer_invitations
        WHERE token_digest=$1 FOR UPDATE`,[input.tokenDigest]);
      const raw=found.rows[0];
      if(!raw){await c.query('COMMIT');open=false;return null;}
      const invite=record(raw);
      if(!isActive(invite,input.now)){await c.query('COMMIT');open=false;return null;}
      const existing=await c.query(`SELECT invite_id,actor_id,verified_email,enrolled_at
        FROM reviewer_enrollments WHERE invite_id=$1 AND actor_id=$2`,
        [invite.id,input.actorId]);
      if(existing.rows[0]){
        const old=ReviewerEnrollmentSchema.parse({
          inviteId:str(existing.rows[0].invite_id),
          actorId:str(existing.rows[0].actor_id),
          verifiedEmail:str(existing.rows[0].verified_email),
          enrolledAt:date(existing.rows[0].enrolled_at),
        });
        await c.query('COMMIT');open=false;
        return old.verifiedEmail===email?grant(invite,input.actorId,email):null;
      }
      const count=await c.query(`SELECT count(*)::integer AS seats
        FROM reviewer_enrollments WHERE invite_id=$1`,[invite.id]);
      if(num(count.rows[0]?.seats)>=invite.maxAccounts){
        await c.query('COMMIT');open=false;return null;
      }
      const inserted=await c.query(`INSERT INTO reviewer_enrollments
        (invite_id,actor_id,verified_email,enrolled_at)
        VALUES ($1,$2,$3,$4) RETURNING invite_id`,
        [invite.id,input.actorId,email,input.now]);
      if(inserted.rows.length!==1)throw new Error('Enrollment insert failed');
      await c.query('COMMIT');open=false;
      return grant(invite,input.actorId,email);
    }catch(e){
      if(open){try{await c.query('ROLLBACK');}catch{/* do not approve on DB failure */}}
      throw e;
    }finally{c.release();}
  }
  async readActive(input:{actorId:string;verifiedEmail:string;now:string}):Promise<ReviewerGrant|null>{
    const email=normalizeReviewerEmail(input.verifiedEmail);
    const c=await this.pool.connect();
    try{
      const res=await c.query(`SELECT i.id,i.starts_at,i.ends_at,i.label,i.max_accounts,
        i.token_digest,i.issued_at,i.revoked_at
        FROM reviewer_invitations i
        JOIN reviewer_enrollments e ON e.invite_id=i.id
        WHERE e.actor_id=$1 AND e.verified_email=$2
          AND i.starts_at<=$3 AND i.ends_at>$3 AND i.revoked_at IS NULL
        ORDER BY i.ends_at DESC LIMIT 1`,
        [input.actorId,email,input.now]);
      return res.rows[0]?grant(record(res.rows[0]),input.actorId,email):null;
    }finally{c.release();}
  }
  async revoke(inviteId:string,now:string):Promise<boolean>{
    const c=await this.pool.connect();
    try{
      const r=await c.query(`UPDATE reviewer_invitations
        SET revoked_at=COALESCE(revoked_at,$2) WHERE id=$1 RETURNING id`,[inviteId,now]);
      return r.rows.length>0;
    }finally{c.release();}
  }
}
