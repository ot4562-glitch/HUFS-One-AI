import {z} from 'zod';
import {
  SelfConsentSchema,SelfConsentPutSchema,SelfProfileSchema,
  SelfProfilePatchSchema,PersonalPurposeChoicesSchema,
} from '@hufs-one/contracts';
import type {SelfConsent,SelfProfile} from '@hufs-one/contracts';
import type {ReviewerSqlConnection,ReviewerSqlPool} from '../auth/reviewer-postgres.js';

const Actor=z.string().min(1).max(200).regex(/^[A-Za-z0-9_.:@-]+$/);
const Timestamp=z.iso.datetime({offset:true});
type Op='CONSENT_READ'|'CONSENT_WRITE'|'PROFILE_READ'|'PROFILE_WRITE';
export interface SelfAccountAuthority {
  /** Separate, server-owned permission to handle an account's private data.
   * The browser's consent checkboxes do NOT implement this authority. */
  mayAccess(input:{actorId:string;operation:Op;now:string}):Promise<boolean>;
}
export interface SelfAccountPort{
  readProfile(actorId:string):Promise<SelfProfile|null>;
  patchProfile(actorId:string,change:unknown):Promise<SelfProfile>;
  readConsents(actorId:string):Promise<SelfConsent|null>;
  putConsents(actorId:string,change:unknown):Promise<SelfConsent>;
}
export class SelfAccountDenied extends Error{constructor(){super('Owner data access denied');}}
export class SelfAccountConflict extends Error{constructor(){super('Owner version conflict');}}
function datetime(v:unknown):string {
  const iso=v instanceof Date?v.toISOString():v;
  return Timestamp.parse(iso);
}
function version(v:unknown):number{
  const result=Number(v);
  if(!Number.isSafeInteger(result)||result<1)throw new Error('Invalid account version');
  return result;
}
function parseConsent(row:Record<string,unknown>):SelfConsent{
  return SelfConsentSchema.parse({version:version(row.version),choices:row.choices_json,
    updatedAt:datetime(row.updated_at)});
}
function parseProfile(row:Record<string,unknown>):SelfProfile{
  return SelfProfileSchema.parse({version:version(row.version),value:row.profile_json,
    updatedAt:datetime(row.updated_at)});
}
/** No implicit database access, NCP storage, or default permissions. The DB
 * role must be non-owner and FORCE RLS applies to each request transaction. */
export class PostgresSelfAccountStore implements SelfAccountPort{
  constructor(private readonly pool:ReviewerSqlPool,
    private readonly authority:SelfAccountAuthority,
    private readonly now:()=>string=()=>new Date().toISOString()){}

  private async allowed(actorId:string,operation:Op):Promise<void>{
    let permitted=false;
    try{
      const at=Timestamp.parse(this.now());
      permitted=await this.authority.mayAccess({actorId,operation,now:at})===true;
    }catch{/* treat absent/revoked authority as denied */}
    if(!permitted)throw new SelfAccountDenied();
  }
  private async transaction<T>(rawActor:string,operation:Op,
    run:(c:ReviewerSqlConnection,actorId:string)=>Promise<T>):Promise<T>{
    const actorId=Actor.parse(rawActor);
    await this.allowed(actorId,operation);
    const c=await this.pool.connect();let begun=false;
    try{
      await c.query('BEGIN');begun=true;
      await c.query("SET LOCAL statement_timeout='5s'");
      await c.query("SELECT set_config('hufs.self_actor',$1,true)",[actorId]);
      const result=await run(c,actorId);
      // Independent rights can change while awaiting SQL; fail before COMMIT.
      await this.allowed(actorId,operation);
      await c.query('COMMIT');begun=false;
      return result;
    }catch(err){
      if(begun)try{await c.query('ROLLBACK');}catch{/* fail closed */}
      if((err as {code?:string}).code==='23505')throw new SelfAccountConflict();
      throw err;
    }finally{c.release();}
  }
  private async currentConsent(c:ReviewerSqlConnection,actorId:string,lock=false):
    Promise<SelfConsent|null>{
    const row=await c.query(`SELECT version,choices_json,updated_at
      FROM api_self_consents WHERE actor_id=$1${lock?' FOR UPDATE':''}`,[actorId]);
    if(row.rows.length>1)throw new SelfAccountDenied();
    return row.rows[0]?parseConsent(row.rows[0]):null;
  }
  private async requirePersonalStorage(c:ReviewerSqlConnection,actorId:string):Promise<void>{
    const current=await this.currentConsent(c,actorId,true);
    if(!current?.choices.personalStorage)throw new SelfAccountDenied();
  }

  readConsents(actorId:string):Promise<SelfConsent|null>{
    return this.transaction(actorId,'CONSENT_READ',(c,id)=>this.currentConsent(c,id));
  }
  putConsents(actorId:string,change:unknown):Promise<SelfConsent>{
    const parsed=SelfConsentPutSchema.parse(change);
    return this.transaction(actorId,'CONSENT_WRITE',async(c,id)=>{
      const before=await this.currentConsent(c,id,true);
      if((before?.version??0)!==parsed.expectedVersion)throw new SelfAccountConflict();
      if(before&&JSON.stringify(before.choices)===JSON.stringify(parsed.choices))
        return before;
      const changed=Object.keys(PersonalPurposeChoicesSchema.shape)
        .filter(key=>before===null
          ||before.choices[key as keyof typeof before.choices]
            !==parsed.choices[key as keyof typeof parsed.choices]);
      let rows;
      if(before){
        rows=await c.query(`UPDATE api_self_consents
          SET choices_json=$2::jsonb,version=version+1,
          updated_at=clock_timestamp() WHERE actor_id=$1 AND version=$3
          RETURNING version,choices_json,updated_at`,
          [id,JSON.stringify(parsed.choices),before.version]);
      }else{
        rows=await c.query(`INSERT INTO api_self_consents
          (actor_id,version,choices_json) VALUES($1,1,$2::jsonb)
          RETURNING version,choices_json,updated_at`,[id,JSON.stringify(parsed.choices)]);
      }
      if(rows.rows.length!==1)throw new SelfAccountConflict();
      const result=parseConsent(rows.rows[0]!);
      const audited=await c.query(`INSERT INTO api_self_consent_events
        (actor_id,version,changed_purposes) VALUES($1,$2,$3::text[])
        RETURNING version`,[id,result.version,changed]);
      if(audited.rows.length!==1)throw new Error('Consent audit unavailable');
      if(!parsed.choices.personalStorage){
        // A withdrawal immediately removes THIS table's private profile,
        // not external provider copies, raw student intake, or another owner.
        await c.query('DELETE FROM api_self_profiles WHERE actor_id=$1',[id]);
        await c.query('DELETE FROM api_self_workspace_records WHERE actor_id=$1',[id]);
      }
      return result;
    });
  }
  readProfile(actorId:string):Promise<SelfProfile|null>{
    return this.transaction(actorId,'PROFILE_READ',async(c,id)=>{
      await this.requirePersonalStorage(c,id);
      const rows=await c.query(`SELECT version,profile_json,updated_at
        FROM api_self_profiles WHERE actor_id=$1`,[id]);
      if(rows.rows.length>1)throw new SelfAccountDenied();
      return rows.rows[0]?parseProfile(rows.rows[0]):null;
    });
  }
  patchProfile(actorId:string,change:unknown):Promise<SelfProfile>{
    const parsed=SelfProfilePatchSchema.parse(change);
    return this.transaction(actorId,'PROFILE_WRITE',async(c,id)=>{
      await this.requirePersonalStorage(c,id);
      const rows=await c.query(`SELECT version FROM api_self_profiles
        WHERE actor_id=$1 FOR UPDATE`,[id]);
      if(rows.rows.length>1)throw new SelfAccountDenied();
      const existing=rows.rows[0]?version(rows.rows[0]!.version):0;
      if(existing!==parsed.expectedVersion)throw new SelfAccountConflict();
      const value=JSON.stringify(parsed.value);
      if(Buffer.byteLength(value,'utf8')>4000)throw new SelfAccountDenied();
      const saved=existing===0?await c.query(`INSERT INTO api_self_profiles
        (actor_id,version,profile_json) VALUES($1,1,$2::jsonb)
        RETURNING version,profile_json,updated_at`,[id,value])
        :await c.query(`UPDATE api_self_profiles SET version=version+1,
          profile_json=$2::jsonb,updated_at=clock_timestamp()
          WHERE actor_id=$1 AND version=$3 RETURNING version,profile_json,updated_at`,
        [id,value,existing]);
      if(saved.rows.length!==1)throw new SelfAccountConflict();
      // The owner may withdraw personalStorage during a queued request.
      await this.requirePersonalStorage(c,id);
      return parseProfile(saved.rows[0]!);
    });
  }
}
