import {createHash} from 'node:crypto';
import {z} from 'zod';
import {blankDemoProfileValue,blankDemoProfileWorkspace,DemoProfileRecordSchema,DemoProfileSaveSchema,DemoProfileResetSchema,
  DemoProfileWorkspaceSaveSchema,
  type DemoProfileRecord,type DemoProfileValue,type DemoProfileSave,type DemoProfileReset,
  type DemoProfileWorkspace,type DemoProfileWorkspaceSave} from '@hufs-one/contracts';
import type {ReviewerSqlConnection,ReviewerSqlPool} from '../auth/reviewer-postgres.js';
import {DemoProfileConflict,type DemoProfileStore} from './demo-profile.js';

const Actor=z.string().regex(/^[A-Za-z0-9_.:@-]{1,200}$/);
const Version=z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER-1);
function record(row:Record<string,unknown>|undefined):DemoProfileRecord{
  if(!row)return {version:0,value:blankDemoProfileValue(),workspace:blankDemoProfileWorkspace(),updatedAt:null};
  return DemoProfileRecordSchema.parse({version:Version.parse(row.version),value:row.value_json,workspace:row.workspace_json,
    updatedAt:row.updated_at instanceof Date?row.updated_at.toISOString():row.updated_at});
}
/** Dedicated synthetic table only. No self-profile consent/intake/transcript/overlay access.
 * Deploy with a non-owner, non-superuser, NOBYPASSRLS role and FORCE RLS enabled. */
export class PostgresDemoProfileStore implements DemoProfileStore {
  constructor(private readonly pool:ReviewerSqlPool){}
  private async transaction<T>(rawActor:string,mutation:boolean,
    run:(c:ReviewerSqlConnection,actorId:string)=>Promise<T>):Promise<T>{
    const actorId=Actor.parse(rawActor),c=await this.pool.connect();let begun=false;
    try{
      await c.query('BEGIN');begun=true;
      await c.query("SET LOCAL statement_timeout='5s'");
      await c.query("SELECT set_config('hufs.demo_profile_actor',$1,true)",[actorId]);
      // Serializes both absent-row inserts and updates without locking any personal table.
      if(mutation)await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`hufs.empty-demo:${actorId}`]);
      const result=await run(c,actorId);
      await c.query('COMMIT');begun=false;return result;
    }catch(error){
      if(begun)try{await c.query('ROLLBACK');}catch{/* preserve failure */}
      if((error as {code?:string}).code==='23505')throw new DemoProfileConflict();
      throw error;
    }finally{c.release();}
  }
  private async current(c:ReviewerSqlConnection,id:string,lock=false){
    const result=await c.query(`SELECT version,value_json,workspace_json,updated_at,last_operation,last_expected_version
      FROM api_demo_profiles WHERE actor_id=$1${lock?' FOR UPDATE':''}`,[id]);
    if(result.rows.length>1)throw Error('Invalid synthetic profile cardinality');
    return result.rows[0];
  }
  read(actorId:string):Promise<DemoProfileRecord>{
    return this.transaction(actorId,false,async(c,id)=>record(await this.current(c,id)));
  }
  private change(actorId:string,expectedVersion:number,kind:'SAVE'|'WORKSPACE'|'RESET',payload?:DemoProfileValue|DemoProfileWorkspace){
    const operation=createHash('sha256').update(JSON.stringify({kind,expectedVersion,payload})).digest('hex');
    return this.transaction(actorId,true,async(c,id)=>{
      const row=await this.current(c,id,true),before=record(row);
      // Only the immediately preceding exact operation is replayable. A later write/reset
      // invalidates this receipt, so an old tab cannot revive its previous settings.
      if(before.version!==expectedVersion){
        if(before.version===expectedVersion+1&&row?.last_operation===operation
          &&Number(row.last_expected_version)===expectedVersion)return before;
        throw new DemoProfileConflict();
      }
      if(before.version>=Number.MAX_SAFE_INTEGER-1)throw new DemoProfileConflict();
      const value=kind==='RESET'?blankDemoProfileValue():kind==='SAVE'?payload as DemoProfileValue:before.value;
      const workspace=kind==='RESET'?blankDemoProfileWorkspace():kind==='WORKSPACE'?payload as DemoProfileWorkspace:before.workspace;
      const params=[id,JSON.stringify(value),operation,expectedVersion,JSON.stringify(workspace)];
      const result=before.version===0?await c.query(`INSERT INTO api_demo_profiles
        (actor_id,version,value_json,last_operation,last_expected_version,workspace_json)
        VALUES($1,1,$2::jsonb,$3,$4,$5::jsonb)
        RETURNING version,value_json,workspace_json,updated_at,last_operation,last_expected_version`,params)
        :await c.query(`UPDATE api_demo_profiles SET version=version+1,value_json=$2::jsonb,
          workspace_json=$5::jsonb,last_operation=$3,last_expected_version=$4,updated_at=clock_timestamp()
          WHERE actor_id=$1 AND version=$4
          RETURNING version,value_json,workspace_json,updated_at,last_operation,last_expected_version`,params);
      if(result.rows.length!==1)throw new DemoProfileConflict();
      const saved=record(result.rows[0]);
      if(saved.version!==expectedVersion+1||JSON.stringify(saved.value)!==JSON.stringify(value)
        ||JSON.stringify(saved.workspace)!==JSON.stringify(workspace))
        throw Error('Invalid synthetic profile write result');
      return saved;
    });
  }
  async save(actorId:string,raw:DemoProfileSave):Promise<DemoProfileRecord>{
    const input=DemoProfileSaveSchema.parse(raw);
    return this.change(actorId,input.expectedVersion,'SAVE',input.value);
  }
  async reset(actorId:string,raw:DemoProfileReset):Promise<DemoProfileRecord>{
    const input=DemoProfileResetSchema.parse(raw);
    return this.change(actorId,input.expectedVersion,'RESET');
  }
  async saveWorkspace(actorId:string,raw:DemoProfileWorkspaceSave):Promise<DemoProfileRecord>{
    const input=DemoProfileWorkspaceSaveSchema.parse(raw);
    return this.change(actorId,input.expectedVersion,'WORKSPACE',input.workspace);
  }
}
