import {createHash,randomBytes} from 'node:crypto';
import {z} from 'zod';
import {SyntheticClubAdminRecordSchema,SyntheticClubProfileSchema,type SyntheticClubAdminRecord} from '@hufs-one/contracts';
import type {ReviewerSqlConnection,ReviewerSqlPool} from '../auth/reviewer-postgres.js';
import type {TrustedSyntheticClubReadPort,TrustedSyntheticClubModerationPort} from './synthetic-clubs-http.js';
import {createClubRecord,editClubRecord,decideClubRecord,clubDecisionReceipt,
  SyntheticClubConflict,SyntheticClubDenied,type ClubAdminScope,
  type TrustedSyntheticClubPublicationPort} from './synthetic-club-publication.js';

const Ref=z.string().regex(/^SYNTHETIC_[A-Z0-9_]{1,110}$/);
const Actor=z.string().regex(/^[A-Za-z0-9_.:@-]{1,200}$/);
const integer=(v:unknown):number=>{const n=Number(v);
  if(!Number.isSafeInteger(n)||n<0)throw new Error('Invalid synthetic revision');return n;};
const iso=(v:unknown):string=>{if(v instanceof Date)return v.toISOString();
  if(typeof v!=='string'||!z.iso.datetime({offset:true}).safeParse(v).success)throw new Error('Invalid synthetic time');
  return new Date(v).toISOString();};
const digest=(v:string)=>createHash('sha256').update(v).digest('hex');
type Scope={actorId:string;role:'ADMIN'|'BETA'};
type Catalog={revision:number;asOf:string;now:string};

/** Server composition must supply a least-privilege pool and a provisioned
 * synthetic source. This adapter never creates grants, profiles or DB roles.
 * Catalog time is independent from authentication expiry and is read from SQL. */
export class PostgresSyntheticClubStore{
  private readonly sourceRef:string;
  constructor(private readonly pool:ReviewerSqlPool,options:{sourceRef:string}){
    this.sourceRef=Ref.parse(options.sourceRef);
  }
  private async transaction<T>(scope:Scope,work:(c:ReviewerSqlConnection)=>Promise<T>):Promise<T>{
    Actor.parse(scope.actorId);const c=await this.pool.connect();let open=false;
    try{
      await c.query('BEGIN');open=true;
      await c.query("SET LOCAL statement_timeout = '5s'");
      await c.query("SET LOCAL lock_timeout = '3s'");
      await c.query("SELECT set_config('hufs.club_actor',$1,true),set_config('hufs.club_role',$2,true),set_config('hufs.club_source',$3,true)",
        [scope.actorId,scope.role,this.sourceRef]);
      const value=await work(c);
      await c.query('COMMIT');open=false;return value;
    }catch(error){
      if(open)try{await c.query('ROLLBACK');}catch{/* A failed transaction never grants access. */}
      if(error&&typeof error==='object'&&'code'in error&&['23505','40001','40P01'].includes(String(error.code)))
        throw new SyntheticClubConflict();
      throw error;
    }finally{c.release();}
  }
  private async grant(c:ReviewerSqlConnection,scope:Scope){
    const row=(await c.query(`SELECT role,profile_json,grant_version FROM synthetic_club_grants
      WHERE actor_id=$1 AND source_ref=$2 AND role=$3 AND revoked_at IS NULL
        AND starts_at<=clock_timestamp() AND ends_at>clock_timestamp() FOR SHARE`,
      [scope.actorId,this.sourceRef,scope.role])).rows[0];
    if(!row||row.role!==scope.role)throw new SyntheticClubDenied();
    return row;
  }
  private async catalog(c:ReviewerSqlConnection,mutate:boolean):Promise<Catalog>{
    const result=await c.query(`SELECT revision,as_of,clock_timestamp() AS recorded_at
      FROM synthetic_club_catalog WHERE source_ref=$1 ${mutate?'FOR UPDATE':''}`,[this.sourceRef]);
    const row=result.rows[0];if(!row)throw new SyntheticClubDenied();
    return {revision:integer(row.revision),asOf:iso(row.as_of),now:iso(row.recorded_at)};
  }
  private record(value:unknown):SyntheticClubAdminRecord{
    const record=SyntheticClubAdminRecordSchema.parse(value);
    if(record.sourceRef!==this.sourceRef)throw new SyntheticClubDenied();return record;
  }
  private async finishAdmin(c:ReviewerSqlConnection,input:ClubAdminScope):Promise<void>{
    if(!await input.assertCurrentAdmin())throw new SyntheticClubDenied();
    await this.grant(c,{actorId:input.adminActorId,role:'ADMIN'});
  }
  private async admin<T>(input:ClubAdminScope,mutate:boolean,
    work:(c:ReviewerSqlConnection,catalog:Catalog)=>Promise<T>):Promise<T>{
    const scope:Scope={actorId:input.adminActorId,role:'ADMIN'};
    return this.transaction(scope,async c=>{
      await this.grant(c,scope);
      if(!await input.assertCurrentAdmin())throw new SyntheticClubDenied();
      const head=await this.catalog(c,mutate),result=await work(c,head);
      await this.finishAdmin(c,input);return result;
    });
  }
  readonly publication:TrustedSyntheticClubPublicationPort={
    list:input=>this.admin(input,false,async(c,head)=>{
      const rows=await c.query('SELECT record_json FROM synthetic_club_posts WHERE source_ref=$1 ORDER BY club_id LIMIT 101',[this.sourceRef]);
      if(rows.rows.length>100)throw new SyntheticClubDenied();
      return {mode:'SYNTHETIC_DEMO',asOf:head.asOf,records:rows.rows.map(row=>this.record(row.record_json))};
    }),
    create:input=>this.admin(input,true,async(c,head)=>{
      const count=integer((await c.query('SELECT count(*) AS count FROM synthetic_club_posts WHERE source_ref=$1',[this.sourceRef])).rows[0]?.count);
      if(count>=100)throw new SyntheticClubConflict();
      const next=createClubRecord({...input,asOf:head.asOf,now:head.now,sourceRef:this.sourceRef});
      const rows=await c.query(`INSERT INTO synthetic_club_posts(source_ref,club_id,version,record_json)
        VALUES($1,$2,$3,$4::jsonb) RETURNING record_json`,[this.sourceRef,input.postId,next.version,JSON.stringify(next)]);
      if(rows.rows.length!==1)throw new SyntheticClubConflict();
      return {record:this.record(rows.rows[0]!.record_json)};
    }),
    edit:input=>this.admin(input,true,async(c,head)=>{
      const old=await this.current(c,input.postId);
      const next=editClubRecord(old,{...input,asOf:head.asOf,now:head.now});
      return {record:await this.update(c,old,next)};
    }),
  };
  private async current(c:ReviewerSqlConnection,id:string){
    const row=(await c.query('SELECT record_json FROM synthetic_club_posts WHERE source_ref=$1 AND club_id=$2 FOR UPDATE',
      [this.sourceRef,id])).rows[0];if(!row)throw new SyntheticClubDenied();return this.record(row.record_json);
  }
  private async update(c:ReviewerSqlConnection,old:SyntheticClubAdminRecord,next:SyntheticClubAdminRecord){
    const result=await c.query(`UPDATE synthetic_club_posts SET version=$3,record_json=$4::jsonb
      WHERE source_ref=$1 AND club_id=$2 AND version=$5 RETURNING record_json`,
      [this.sourceRef,old.post.id,next.version,JSON.stringify(next),old.version]);
    if(result.rows.length!==1)throw new SyntheticClubConflict();return this.record(result.rows[0]!.record_json);
  }
  readonly moderation:TrustedSyntheticClubModerationPort={
    decide:input=>this.admin(input,true,async(c,head)=>{
      const old=await this.current(c,input.postId);
      const next=decideClubRecord(old,{...input,asOf:head.asOf,now:head.now});
      return clubDecisionReceipt(await this.update(c,old,next));
    }),
  };
  readonly source:TrustedSyntheticClubReadPort={
    read:({actorId})=>this.transaction({actorId,role:'BETA'},async c=>{
      const grant=await this.grant(c,{actorId,role:'BETA'}),profile=SyntheticClubProfileSchema.parse(grant.profile_json);
      const head=await this.catalog(c,false);
      const rows=await c.query('SELECT record_json FROM synthetic_club_posts WHERE source_ref=$1 ORDER BY club_id LIMIT 101',[this.sourceRef]);
      if(rows.rows.length>100)throw new SyntheticClubDenied();
      await c.query('DELETE FROM synthetic_club_read_receipts WHERE actor_id=$1 AND source_ref=$2 AND expires_at<=clock_timestamp()',[actorId,this.sourceRef]);
      const token=randomBytes(32).toString('hex');
      await c.query(`INSERT INTO synthetic_club_read_receipts(token_digest,actor_id,source_ref,revision,as_of,profile_digest,grant_version,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp()+interval '30 seconds')`,[digest(token),actorId,this.sourceRef,head.revision,head.asOf,digest(JSON.stringify(profile)),integer(grant.grant_version)]);
      await this.grant(c,{actorId,role:'BETA'});
      return {profile,posts:rows.rows.map(row=>this.record(row.record_json).post),asOf:head.asOf,
        receipt:token,revision:'syn-club-rev-'+head.revision};
    }),
    revalidate:async({actorId,receipt,revision})=>{
      if(!/^[0-9a-f]{64}$/.test(receipt)||!/^syn-club-rev-[0-9]+$/.test(revision))return false;
      try{return await this.transaction({actorId,role:'BETA'},async c=>{
        const grant=await this.grant(c,{actorId,role:'BETA'});const head=await this.catalog(c,false);
        const profile=SyntheticClubProfileSchema.parse(grant.profile_json);
        const row=(await c.query(`DELETE FROM synthetic_club_read_receipts WHERE token_digest=$1 AND actor_id=$2 AND source_ref=$3
          RETURNING revision,as_of,profile_digest,grant_version,(expires_at>clock_timestamp()) AS active`,[digest(receipt),actorId,this.sourceRef])).rows[0];
        return row!==undefined&&row.active===true&&integer(row.revision)===head.revision
          &&row.profile_digest===digest(JSON.stringify(profile))&&integer(row.grant_version)===integer(grant.grant_version)
          &&iso(row.as_of)===head.asOf&&revision==='syn-club-rev-'+head.revision;
      });}catch(error){if(error instanceof SyntheticClubDenied)return false;throw error;}
    },
  };
}
