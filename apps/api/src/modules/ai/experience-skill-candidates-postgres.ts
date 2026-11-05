import {createHash} from 'node:crypto';
import {z} from 'zod';
import {
  ExperienceSkillCandidateResponseSchema,ExperienceSkillPrepareResponseSchema,ApprovedProviderInputsSchema,
} from '@hufs-one/contracts';
import type {ApprovedProviderInputs} from '@hufs-one/contracts';
import type {ExperienceSkillCandidateResponse,ExperienceSkillPrepareResponse} from '@hufs-one/contracts';
import type {ReviewerSqlPool} from '../auth/reviewer-postgres.js';
import type {VerifiedActor} from '../../types.js';
import {authorizeSession} from '../auth/gates.js';
import type {PostgresProviderResults} from './provider-results-postgres.js';
import type {createProviderExecutor} from './provider-runtime.js';

const Id=z.string().regex(/^[A-Za-z0-9_-]{1,90}$/);
const Ref=z.string().regex(/^[A-Za-z0-9_.:@-]{1,128}$/);
const Utc=z.iso.datetime({offset:true});
const Time=z.preprocess(v=>v instanceof Date?v.toISOString():v,Utc);
const Version=z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const Row=z.object({
  projection_id:Ref,experience_id:Id,content_version:Version,
  consent_version:Version,source_id:Ref,source_revision_id:Ref,
  input_ref:Ref,operation:z.literal('HCX_007'),approved_at:Time,as_of:Time,
  erased_at:Time.nullable(),safe_packet:z.object({task:z.literal('experience_skills'),
    providerInputClass:z.literal('PERSONAL_CONSENTED_CLEARED')}).passthrough(),
  record_version:Version,deleted_at:Time.nullable(),current_consent_version:Version,
  choices_json:z.object({personalStorage:z.literal(true),externalAi:z.literal(true)}).passthrough(),
});
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
type Executor=Pick<ReturnType<typeof createProviderExecutor>,'readJob'>;
export interface ExperienceSkillCandidatePort {
  read(input:{actor:VerifiedActor;experienceId:string;jobId:string}):
    Promise<ExperienceSkillCandidateResponse|null>;
  prepare(input:{actor:VerifiedActor;experienceIds:readonly string[]}):
    Promise<ExperienceSkillPrepareResponse>;
}

/** Same-session, same-owner current source/experience/consent candidate read.
 * Results.get binds actual SETTLED job to inputRef; executor.readJob performs
 * its own source-head, grant, budget, epoch and input-state revalidation.
 * This reader checks the experience binding twice to reject intervening edits,
 * deletion and withdrawal. Never converts a candidate into a selected tag. */
export class PostgresExperienceSkillCandidateReader implements ExperienceSkillCandidatePort {
  constructor(private readonly pool:ReviewerSqlPool,
    private readonly results:Pick<PostgresProviderResults,'get'>,
    private readonly executor:Executor,
    private readonly now:()=>string=()=>new Date().toISOString(),
    private readonly inputs?:{list(actor:VerifiedActor):Promise<ApprovedProviderInputs>}){}
  private async binding(actor:VerifiedActor,experienceId:string,inputRef:string,asOf:string){
    const connection=await this.pool.connect();let begun=false;
    try{
      await connection.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true;
      await connection.query("SET LOCAL statement_timeout='5s'");
      await connection.query("SELECT set_config('hufs.self_actor',$1,true)",[actor.actorId]);
      const query=await connection.query(`SELECT b.projection_id,b.experience_id,b.content_version,
        b.consent_version,b.source_id,b.source_revision_id,b.input_ref,b.operation,b.approved_at,
        p.as_of,p.erased_at,p.safe_packet,r.version AS record_version,r.deleted_at,
        c.version AS current_consent_version,c.choices_json
        FROM api_ai_experience_bindings b
        JOIN api_ai_provider_input_heads h ON h.projection_id=b.projection_id
          AND h.actor_id=b.actor_id AND h.operation=b.operation AND h.input_ref=b.input_ref
        JOIN api_ai_provider_inputs p ON p.projection_id=b.projection_id
          AND p.actor_id=b.actor_id AND p.input_ref=b.input_ref AND p.operation=b.operation
        JOIN api_self_workspace_records r ON r.actor_id=b.actor_id
          AND r.kind='EXPERIENCE' AND r.item_id=b.experience_id
        JOIN api_self_consents c ON c.actor_id=b.actor_id
        WHERE b.actor_id=$1 AND b.experience_id=$2 AND b.input_ref=$3
          AND b.operation='HCX_007' AND p.input_class='PERSONAL_CONSENTED_CLEARED'
        LIMIT 2`,[actor.actorId,experienceId,inputRef]);
      if(query.rows.length!==1)return null;
      const row=Row.parse(query.rows[0]);
      if(row.erased_at!==null||row.deleted_at!==null||row.content_version!==row.record_version
        ||row.consent_version!==row.current_consent_version||Date.parse(row.as_of)!==Date.parse(asOf)
        ||row.approved_at>row.as_of)return null;
      await connection.query('COMMIT');begun=false;
      return {contentVersion:row.content_version,consentVersion:row.consent_version,
        fingerprint:hash(row)};
    }finally{if(begun)try{await connection.query('ROLLBACK');}catch{/* never expose SQL */}connection.release();}
  }
  /** Explicit selection: no implicit model/paid call, approval, or auto-tag. */
  async prepare(input:{actor:VerifiedActor;experienceIds:readonly string[]}):
    Promise<ExperienceSkillPrepareResponse>{
    const ids=z.array(Id).min(1).max(16).refine(values=>new Set(values).size===values.length)
      .parse(input.experienceIds);
    const actor=input.actor;
    if(actor.role!=='BETA'||!this.inputs)throw new Error('Current approved AI input directory unavailable');
    authorizeSession(actor,Utc.parse(this.now()));
    const listed=ApprovedProviderInputsSchema.parse(await this.inputs.list(actor));
    const matching=listed.items.filter(item=>item.task==='experience_skills'&&item.operation==='HCX_007');
    const items:ExperienceSkillPrepareResponse['items']=[],unavailable:string[]=[];
    for(const experienceId of ids){
      let selected:ExperienceSkillPrepareResponse['items'][number]|null=null;
      // Do not expose other owners' mappings: the SQL query uses exact current actor
      // and each candidate input must have a current reviewed binding.
      for(const entry of matching){
        const row=await this.binding(actor,experienceId,entry.inputRef,entry.asOf);
        if(!row)continue;
        const next={experienceId,inputRef:entry.inputRef,operation:'HCX_007' as const,
          asOf:entry.asOf,expiresAt:entry.expiresAt,
          contentVersion:row.contentVersion,consentVersion:row.consentVersion};
        if(selected){selected=null;break;} // Ambiguous multiple current approvals.
        selected=next;
      }
      if(selected)items.push(selected);else unavailable.push(experienceId);
    }
    authorizeSession(actor,Utc.parse(this.now()));
    // Recheck each selected item again after every awaited directory/SQL read.
    for(const item of items){
      const current=await this.binding(actor,item.experienceId,item.inputRef,item.asOf);
      if(!current||current.contentVersion!==item.contentVersion
        ||current.consentVersion!==item.consentVersion)
        throw new Error('Experience AI preparation changed during request');
    }
    authorizeSession(actor,Utc.parse(this.now()));
    return ExperienceSkillPrepareResponseSchema.parse({items,unavailable});
  }
  async read(raw:{actor:VerifiedActor;experienceId:string;jobId:string}):
    Promise<ExperienceSkillCandidateResponse|null>{
    try{
      const {actor}=raw,experienceId=Id.parse(raw.experienceId),jobId=z.uuid().parse(raw.jobId);
      if(actor.role!=='BETA')return null;
      authorizeSession(actor,Utc.parse(this.now()));
      const stored=await this.results.get(actor.actorId,actor.sessionIdHash,jobId);
      if(!stored||stored.operation!=='HCX_007'||stored.jobId!==jobId
        ||Date.parse(stored.expiresAt)<=Date.parse(Utc.parse(this.now())))return null;
      const first=await this.binding(actor,experienceId,stored.inputRef,stored.asOf);
      if(!first)return null;
      const outcome=await this.executor.readJob(actor,jobId);
      if(outcome?.state!=='NEEDS_REVIEW'||outcome.billing!=='SETTLED'
        ||outcome.jobId!==jobId||!outcome.candidate)return null;
      const second=await this.binding(actor,experienceId,stored.inputRef,stored.asOf);
      if(!second||second.fingerprint!==first.fingerprint)return null;
      authorizeSession(actor,Utc.parse(this.now()));
      const candidate=ExperienceSkillCandidateResponseSchema.parse({
        experienceId,jobId,state:'NEEDS_REVIEW',contentVersion:second.contentVersion,
        consentVersion:second.consentVersion,candidate:outcome.candidate,
      });
      if(candidate.candidate.task!=='experience_skills')return null;
      return candidate;
    }catch{return null;}
  }
}
