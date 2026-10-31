import {ReviewerRecordSchema,normalizeReviewerEmail} from './reviewer.js';
import type {ReviewerAccessStore,ReviewerGrant,ReviewerRecord} from './reviewer.js';

/**
 * Database-neutral PostgreSQL pool boundary. Pass a real pool that executes all
 * statements on the same transaction connection. The API does not connect to
 * NCP nor instantiate a database by itself.
 */
export interface SqlResult {rows:Array<Record<string,unknown>>}
export interface ReviewerSqlConnection {
  query(sql:string,params?:readonly unknown[]):Promise<SqlResult>;
  release():void;
}
export interface ReviewerSqlPool {
  connect():Promise<ReviewerSqlConnection>;
}
const utc=(v:unknown):string=>{
  if(v instanceof Date)return v.toISOString();
  if(typeof v==='string') {
    const parsed=new Date(v);
    if(Number.isFinite(parsed.getTime()))return parsed.toISOString();
  }
  throw new Error('Invalid database timestamp');
};
const str=(v:unknown):string=>{
  if(typeof v!=='string')throw new Error('Invalid database string');
  return v;
};
function parsedRow(row:Record<string,unknown>):ReviewerRecord {
  const r=ReviewerRecordSchema.parse({
    id:str(row.id),recipientEmail:str(row.recipient_email),
    startsAt:utc(row.starts_at),endsAt:utc(row.ends_at),
    label:str(row.label),tokenDigest:str(row.token_digest),
    issuedAt:utc(row.issued_at),
    ...(row.enrolled_actor_id?{enrolledActorId:str(row.enrolled_actor_id)}:{}),
    ...(row.enrolled_at?{enrolledAt:utc(row.enrolled_at)}:{}),
    ...(row.revoked_at?{revokedAt:utc(row.revoked_at)}:{}),
  });
  return r;
}
const grant=(r:ReviewerRecord):ReviewerGrant=>({
  inviteId:r.id,actorId:r.enrolledActorId!,
  recipientEmail:r.recipientEmail,startsAt:r.startsAt,endsAt:r.endsAt,label:r.label,
});
const within=(r:ReviewerRecord,now:string)=>
  !r.revokedAt&&Date.parse(r.startsAt)<=Date.parse(now)&&Date.parse(now)<Date.parse(r.endsAt);

/** Durable, account-bound reviewer grant adapter for a trusted PostgreSQL pool. */
export class PostgresReviewerAccessStore implements ReviewerAccessStore {
  constructor(private readonly pool:ReviewerSqlPool){}
  async saveIssued(value:ReviewerRecord):Promise<void> {
    const v=ReviewerRecordSchema.parse(value);
    const c=await this.pool.connect();
    try {
      await c.query(`INSERT INTO reviewer_invitations
        (id,recipient_email,starts_at,ends_at,label,token_digest,issued_at,
         enrolled_actor_id,enrolled_at,revoked_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [v.id,v.recipientEmail,v.startsAt,v.endsAt,v.label,v.tokenDigest,v.issuedAt,
         v.enrolledActorId??null,v.enrolledAt??null,v.revokedAt??null]);
    } finally {c.release();}
  }
  async redeem(input:{tokenDigest:string;actorId:string;verifiedEmail:string;now:string}):Promise<ReviewerGrant|null> {
    const email=normalizeReviewerEmail(input.verifiedEmail);
    const c=await this.pool.connect();
    let begun=false;
    try {
      await c.query('BEGIN');
      begun=true;
      const found=await c.query(`SELECT id,recipient_email,starts_at,ends_at,
         label,token_digest,issued_at,enrolled_actor_id,enrolled_at,revoked_at
         FROM reviewer_invitations WHERE token_digest=$1 FOR UPDATE`,[input.tokenDigest]);
      const raw=found.rows[0];
      if(!raw){
        await c.query('COMMIT');begun=false;return null;
      }
      let v=parsedRow(raw);
      if(!within(v,input.now)||v.recipientEmail!==email||
         (v.enrolledActorId && v.enrolledActorId!==input.actorId)){
        await c.query('COMMIT');begun=false;return null;
      }
      if(!v.enrolledActorId){
        const updated=await c.query(`UPDATE reviewer_invitations
          SET enrolled_actor_id=$2,enrolled_at=$3 WHERE id=$1
          RETURNING id,recipient_email,starts_at,ends_at,label,token_digest,
            issued_at,enrolled_actor_id,enrolled_at,revoked_at`,
          [v.id,input.actorId,input.now]);
        if(updated.rows.length!==1)throw new Error('Failed enrollment transaction');
        v=parsedRow(updated.rows[0]!);
      }
      await c.query('COMMIT');begun=false;
      return grant(v);
    } catch(e) {
      if(begun) {
        try {await c.query('ROLLBACK');}catch{ /* DB failure: never approve grant */ }
      }
      throw e;
    } finally {c.release();}
  }
  async readActive(input:{actorId:string;verifiedEmail:string;now:string}):Promise<ReviewerGrant|null> {
    const email=normalizeReviewerEmail(input.verifiedEmail);
    const c=await this.pool.connect();
    try {
      const r=await c.query(`SELECT id,recipient_email,starts_at,ends_at,
        label,token_digest,issued_at,enrolled_actor_id,enrolled_at,revoked_at
        FROM reviewer_invitations
        WHERE enrolled_actor_id=$1 AND recipient_email=$2
          AND starts_at<=$3 AND ends_at>$3 AND revoked_at IS NULL
        ORDER BY ends_at DESC LIMIT 1`,
        [input.actorId,email,input.now]);
      return r.rows[0]?grant(parsedRow(r.rows[0])):null;
    } finally {c.release();}
  }
  async revoke(inviteId:string,now:string):Promise<boolean> {
    const c=await this.pool.connect();
    try {
      const r=await c.query(`UPDATE reviewer_invitations
        SET revoked_at=COALESCE(revoked_at,$2) WHERE id=$1 RETURNING id`,[inviteId,now]);
      return r.rows.length>0;
    } finally {c.release();}
  }
}
