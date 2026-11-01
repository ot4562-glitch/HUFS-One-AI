import {z} from 'zod';
import {
  ExperienceTagApprovalSchema,ExperienceTagApprovalPutSchema,
  ExperienceTagApprovalDeleteSchema,OwnerWorkspaceValueSchema,
  PersonalPurposeChoicesSchema,TopicCodeSchema,TOPIC_DICTIONARY_VERSION,
} from '@hufs-one/contracts';
import type {ExperienceTagApproval,TopicCode} from '@hufs-one/contracts';
import type {ReviewerSqlConnection,ReviewerSqlPool} from '../auth/reviewer-postgres.js';

const Actor=z.string().min(1).max(200).regex(/^[A-Za-z0-9_.:@-]+$/);
const Id=z.string().regex(/^[A-Za-z0-9_-]{1,90}$/);
const Version=z.number().int().min(1).max(Number.MAX_SAFE_INTEGER-1);
const Timestamp=z.iso.datetime({offset:true});
const Address=z.strictObject({actorId:Actor,experienceId:Id});
export interface ExperienceApprovalAuthority{
  /** Independently approved owner/fixture authority, never a browser checkbox
   * or a demo SharingGrant. Local selection does not authorize external AI.
   */
  mayOperate(input:{actorId:string;experienceId:string;
    operation:'READ'|'APPROVE'|'REVOKE';now:string}):Promise<boolean>;
}
export interface ApprovedExperienceTopicsProjection{
  experienceId:string;approvalVersion:number;contentVersion:number;consentVersion:number;
  topics:TopicCode[];topicVersion:typeof TOPIC_DICTIONARY_VERSION;
  provenance:'LOCAL_USER_SELECTION';
}
export interface ExperienceApprovalPort{
  read(input:{actorId:string;experienceId:string}):Promise<ExperienceTagApproval>;
  approve(input:{actorId:string;experienceId:string}&
    z.infer<typeof ExperienceTagApprovalPutSchema>):Promise<ExperienceTagApproval>;
  revoke(input:{actorId:string;experienceId:string}&
    z.infer<typeof ExperienceTagApprovalDeleteSchema>):Promise<ExperienceTagApproval>;
  /** Provider-neutral owner projection only. No recommendation consumption,
   * sharing/publication, provider packet construction or paid call implied.
   */
  readApprovedTopics(input:{actorId:string;experienceId:string;
    expectedContentVersion:number;expectedConsentVersion:number}):
    Promise<ApprovedExperienceTopicsProjection|null>;
}
export class ExperienceApprovalDenied extends Error{
  constructor(){super('Experience approval access denied');}
}
export class ExperienceApprovalConflict extends Error{
  constructor(){super('Experience approval version conflict');}
}
type Binding={contentVersion:number|null;consentVersion:number|null;storage:boolean;
  approval:Record<string,unknown>|undefined};
function approvalVersion(row:Record<string,unknown>|undefined):number{
  return row?Version.parse(Number(row.version)):0;
}
function publicState(binding:Binding):ExperienceTagApproval{
  const {approval,contentVersion,consentVersion,storage}=binding;
  const version=approvalVersion(approval);
  const inactive=(reason:'NOT_APPROVED'|'STALE'|'REVOKED'|'CONSENT_REQUIRED'|'NOT_FOUND')=>
    ({state:'INACTIVE' as const,version,reason});
  if(!storage)return inactive('CONSENT_REQUIRED');
  if(contentVersion===null)return inactive('NOT_FOUND');
  if(!approval)return inactive('NOT_APPROVED');
  if(approval.state==='REVOKED')return inactive('REVOKED');
  if(approval.state!=='ACTIVE'||Number(approval.content_version)!==contentVersion
    ||Number(approval.consent_version)!==consentVersion)return inactive('STALE');
  return ExperienceTagApprovalSchema.parse({
    state:'ACTIVE',version,contentVersion,consentVersion,
    topics:approval.topics,approvedAt:approval.approved_at instanceof Date
      ?approval.approved_at.toISOString():approval.approved_at,
    provenance:'LOCAL_USER_SELECTION',
  });
}
/** Used INSIDE existing owner mutations. Consent lock precedes content lock
 * everywhere; approval invalidation/audit is part of that same transaction.
 * Only ACTIVE rows advance. No raw record or selected topic is copied to audit.
 */
export async function invalidateExperienceTagApprovals(c:ReviewerSqlConnection,
  input:{actorId:string;experienceId?:string}):Promise<void>{
  await c.query(`WITH invalidated AS (
    UPDATE api_experience_tag_approvals
    SET state='INVALIDATED',topics=ARRAY[]::text[],version=version+1,
      updated_at=clock_timestamp()
    WHERE actor_id=$1 AND state='ACTIVE'${input.experienceId?' AND experience_id=$2':''}
    RETURNING actor_id,experience_id,version,content_version,consent_version
  ) INSERT INTO api_experience_tag_events
    (actor_id,experience_id,version,content_version,consent_version,action)
    SELECT actor_id,experience_id,version,content_version,consent_version,'INVALIDATED'
    FROM invalidated`,input.experienceId?[input.actorId,input.experienceId]:[input.actorId]);
}
/** No connections are created until a caller uses an explicitly injected pool.
 * FORCE RLS and exact owner predicates both bind hufs.self_actor per transaction.
 */
export class PostgresExperienceApprovalStore implements ExperienceApprovalPort{
  constructor(private readonly pool:ReviewerSqlPool,
    private readonly authority:ExperienceApprovalAuthority,
    private readonly now:()=>string=()=>new Date().toISOString()){}
  private async permit(actorId:string,experienceId:string,
    operation:'READ'|'APPROVE'|'REVOKE'):Promise<void>{
    let allowed=false;
    try{allowed=await this.authority.mayOperate({actorId,experienceId,
      operation,now:Timestamp.parse(this.now())})===true;}catch{/* deny */}
    if(!allowed)throw new ExperienceApprovalDenied();
  }
  private async transaction<T>(input:{actorId:string;experienceId:string},
    operation:'READ'|'APPROVE'|'REVOKE',
    fn:(c:ReviewerSqlConnection,binding:Binding)=>Promise<T>):Promise<T>{
    const {actorId,experienceId}=Address.parse(input);
    await this.permit(actorId,experienceId,operation);
    const c=await this.pool.connect();let begun=false;
    try{
      await c.query('BEGIN');begun=true;
      await c.query("SET LOCAL statement_timeout='5s'");
      await c.query("SELECT set_config('hufs.self_actor',$1,true)",[actorId]);
      const consent=await c.query(`SELECT version,choices_json FROM api_self_consents
        WHERE actor_id=$1 FOR SHARE`,[actorId]);
      if(consent.rows.length>1)throw new ExperienceApprovalDenied();
      const current=consent.rows[0];
      const storage=current?PersonalPurposeChoicesSchema.parse(current.choices_json).personalStorage:false;
      const consentVersion=current?Version.parse(Number(current.version)):null;
      const lock=operation==='READ'?'SHARE':'UPDATE';
      const record=await c.query(`SELECT version,value_json FROM api_self_workspace_records
        WHERE actor_id=$1 AND kind='EXPERIENCE' AND item_id=$2
          AND deleted_at IS NULL FOR ${lock}`,[actorId,experienceId]);
      if(record.rows.length>1)throw new ExperienceApprovalDenied();
      const experience=record.rows[0];
      if(experience&&OwnerWorkspaceValueSchema.parse(experience.value_json).kind!=='EXPERIENCE')
        throw new ExperienceApprovalDenied();
      const contentVersion=experience?Version.parse(Number(experience.version)):null;
      const approved=await c.query(`SELECT version,content_version,consent_version,
        topics,state,approved_at FROM api_experience_tag_approvals
        WHERE actor_id=$1 AND experience_id=$2 FOR ${lock}`,[actorId,experienceId]);
      if(approved.rows.length>1)throw new ExperienceApprovalDenied();
      const result=await fn(c,{contentVersion,consentVersion,storage,approval:approved.rows[0]});
      await this.permit(actorId,experienceId,operation);
      await c.query('COMMIT');begun=false;return result;
    }catch(error){
      if(begun)try{await c.query('ROLLBACK');}catch{/* preserve failure */}
      if((error as {code?:string}).code==='23505')throw new ExperienceApprovalConflict();
      throw error;
    }finally{c.release();}
  }
  read(input:{actorId:string;experienceId:string}):Promise<ExperienceTagApproval>{
    const address=Address.parse(input);
    return this.transaction(address,'READ',async(_c,binding)=>publicState(binding));
  }
  approve(input:Parameters<ExperienceApprovalPort['approve']>[0]):Promise<ExperienceTagApproval>{
    const parsed=Address.extend(ExperienceTagApprovalPutSchema.shape).parse(input);
    return this.write(parsed,'APPROVE',parsed.topics);
  }
  revoke(input:Parameters<ExperienceApprovalPort['revoke']>[0]):Promise<ExperienceTagApproval>{
    const parsed=Address.extend(ExperienceTagApprovalDeleteSchema.shape).parse(input);
    return this.write(parsed,'REVOKE',[]);
  }
  private write(input:Parameters<ExperienceApprovalPort['revoke']>[0],
    operation:'APPROVE'|'REVOKE',topics:TopicCode[]):Promise<ExperienceTagApproval>{
    const {actorId,experienceId}=input;
    return this.transaction({actorId,experienceId},operation,async(c,binding)=>{
      if(!binding.storage)throw new ExperienceApprovalDenied();
      if(binding.contentVersion!==input.expectedContentVersion
        ||binding.consentVersion!==input.expectedConsentVersion
        ||approvalVersion(binding.approval)!==input.expectedApprovalVersion)
        throw new ExperienceApprovalConflict();
      if(operation==='REVOKE'&&!binding.approval)
        return {state:'INACTIVE',version:0,reason:'NOT_APPROVED'};
      const state=operation==='APPROVE'?'ACTIVE':'REVOKED',at=Timestamp.parse(this.now());
      const params=[actorId,experienceId,binding.contentVersion,binding.consentVersion,
        topics,state,at,input.expectedApprovalVersion];
      // The content row lock serializes first approvals as well as later CAS.
      const saved=binding.approval?await c.query(`UPDATE api_experience_tag_approvals
        SET content_version=$3,consent_version=$4,topics=$5::text[],state=$6,
          approved_at=$7,updated_at=$7,version=version+1
        WHERE actor_id=$1 AND experience_id=$2 AND version=$8
        RETURNING version,content_version,consent_version,topics,state,approved_at`,params)
        :await c.query(`INSERT INTO api_experience_tag_approvals
        (actor_id,experience_id,content_version,consent_version,topics,state,approved_at,updated_at,version)
        VALUES($1,$2,$3,$4,$5::text[],$6,$7,$7,1)
        ON CONFLICT DO NOTHING
        RETURNING version,content_version,consent_version,topics,state,approved_at`,params.slice(0,7));
      if(saved.rows.length!==1
        ||approvalVersion(saved.rows[0])!==input.expectedApprovalVersion+1)
        throw new ExperienceApprovalConflict();
      const result=publicState({...binding,approval:saved.rows[0]});
      await c.query(`INSERT INTO api_experience_tag_events
        (actor_id,experience_id,version,content_version,consent_version,action)
        VALUES($1,$2,$3,$4,$5,$6)`,[actorId,experienceId,result.version,
        binding.contentVersion,binding.consentVersion,operation==='APPROVE'?'APPROVED':'REVOKED']);
      return result;
    });
  }
  async readApprovedTopics(input:Parameters<ExperienceApprovalPort['readApprovedTopics']>[0]):
    Promise<ApprovedExperienceTopicsProjection|null>{
    const parsed=Address.extend({expectedContentVersion:Version,expectedConsentVersion:Version}).parse(input);
    const result=await this.read({actorId:parsed.actorId,experienceId:parsed.experienceId});
    if(result.state!=='ACTIVE'||result.contentVersion!==parsed.expectedContentVersion
      ||result.consentVersion!==parsed.expectedConsentVersion)return null;
    return {experienceId:parsed.experienceId,approvalVersion:result.version,
      contentVersion:result.contentVersion,consentVersion:result.consentVersion,
      topics:result.topics.map(topic=>TopicCodeSchema.parse(topic)),
      topicVersion:TOPIC_DICTIONARY_VERSION,provenance:'LOCAL_USER_SELECTION'};
  }
}
