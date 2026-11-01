import {z} from 'zod';
import type {SubjectAlias} from '@hufs-one/contracts';
import type {ReviewerSqlPool,ReviewerSqlConnection} from './reviewer-postgres.js';
import {
  ReviewerSandboxActionSchema,
} from './reviewer-sandbox.js';
import type {ReviewerSandboxAction,ReviewerSandboxResult,ReviewerSandboxStore} from './reviewer-sandbox.js';
import {ApiFailure} from './gates.js';

const Ref=z.string().min(1).max(128).regex(/^[A-Za-z0-9_:.@-]+$/);
const Subject=z.enum(['S01','S02','S03','S04','S05']);
const Actions=z.array(ReviewerSandboxActionSchema).max(200);
const State=z.object({actions:z.unknown()});

/** Per invite/account/synthetic slot storage. A revoked/expired invite blocks reads
 * and writes immediately. All updates are transactionally serialized through
 * the invitation row lock; this also blocks concurrent revocation until commit.
 * No student transcript, source URLs or NCP credentials are stored here. */
export class PostgresReviewerSandboxStore implements ReviewerSandboxStore{
  constructor(private readonly pool:ReviewerSqlPool){}

  private async transaction<T>(
    input:{inviteId:string;actorId:string;subjectId:SubjectAlias},
    callback:(c:ReviewerSqlConnection,keys:[string,string,SubjectAlias])=>Promise<T>,
  ):Promise<T>{
    const inviteId=Ref.parse(input.inviteId),actorId=Ref.parse(input.actorId);
    const subjectId=Subject.parse(input.subjectId);
    const c=await this.pool.connect();
    let started=false;
    try{
      await c.query('BEGIN');started=true;
      await c.query("SET LOCAL statement_timeout='5s'");
      const valid=await c.query('SELECT reviewer_sandbox_allowed($1,$2) AS allowed',
        [inviteId,actorId]);
      if(valid.rows.length!==1||valid.rows[0]?.allowed!==true)
        throw new ApiFailure('FORBIDDEN');
      // PostgreSQL RLS is FORCEd even for the app role; never rely only on a
      // WHERE clause or a caller-supplied browser identity.
      await c.query(`SELECT set_config('hufs.reviewer_invite',$1,true),
        set_config('hufs.reviewer_actor',$2,true),
        set_config('hufs.reviewer_subject',$3,true)`,
        [inviteId,actorId,subjectId]);
      const result=await callback(c,[inviteId,actorId,subjectId]);
      await c.query('COMMIT');started=false;
      return result;
    }catch(e){
      if(started)try{await c.query('ROLLBACK');}catch{/* deny, never expose stale data */}
      throw e;
    }finally{c.release();}
  }

  async read(input:{inviteId:string;actorId:string;subjectId:SubjectAlias}):Promise<ReviewerSandboxResult>{
    return this.transaction(input,async(c,[inviteId,actorId,subjectId])=>{
      const response=await c.query(`SELECT actions FROM reviewer_sandbox_state
        WHERE invite_id=$1 AND actor_id=$2 AND subject_id=$3`,
      [inviteId,actorId,subjectId]);
      if(response.rows.length>1)throw new Error('Unexpected synthetic sandbox records');
      const actions=response.rows.length?Actions.parse(State.parse(response.rows[0]).actions):[];
      return {subjectId,mode:'SYNTHETIC_SANDBOX',actions};
    });
  }

  async save(input:{inviteId:string;actorId:string;subjectId:SubjectAlias;action:ReviewerSandboxAction}):
    Promise<ReviewerSandboxResult>{
    const action=ReviewerSandboxActionSchema.parse(input.action);
    return this.transaction(input,async(c,keys)=>{
      const [inviteId,actorId,subjectId]=keys;
      // Serialize FIRST under the invitation row lock, so concurrent initial
      // saves cannot overwrite the first action with the second action.
      const stored=await c.query(`SELECT actions FROM reviewer_sandbox_state
        WHERE invite_id=$1 AND actor_id=$2 AND subject_id=$3 FOR UPDATE`,keys);
      if(stored.rows.length>1)throw new Error('Duplicate synthetic sandbox records');
      const prev=stored.rows.length?Actions.parse(State.parse(stored.rows[0]).actions):[];
      const actions=action.kind==='RESET_SANDBOX'?[]:[...prev,action];
      if(actions.length>200)throw new ApiFailure('RATE_LIMITED');
      const encoded=JSON.stringify(actions);
      if(Buffer.byteLength(encoded)>60_000)throw new ApiFailure('RATE_LIMITED');
      const saved=await c.query(`INSERT INTO reviewer_sandbox_state
        (invite_id,actor_id,subject_id,actions) VALUES($1,$2,$3,$4::jsonb)
        ON CONFLICT(invite_id,actor_id,subject_id)
        DO UPDATE SET actions=EXCLUDED.actions,version=reviewer_sandbox_state.version+1,
          updated_at=clock_timestamp() RETURNING version`,
      [...keys,encoded]);
      if(saved.rows.length!==1)throw new Error('Sandbox storage unavailable');
      return {subjectId,mode:'SYNTHETIC_SANDBOX',actions};
    });
  }
}
