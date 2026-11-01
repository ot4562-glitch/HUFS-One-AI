import {z} from 'zod';
import {
  OwnerWorkspaceValueSchema,OwnerWorkspaceRecordSchema,WorkspaceKindSchema,
  PersonalPurposeChoicesSchema,
} from '@hufs-one/contracts';
import type {OwnerWorkspaceValue,OwnerWorkspaceRecord,WorkspaceKind} from '@hufs-one/contracts';
import type {ReviewerSqlConnection,ReviewerSqlPool} from '../auth/reviewer-postgres.js';

const Actor=z.string().min(1).max(200).regex(/^[A-Za-z0-9_.:@-]+$/);
const Id=z.string().regex(/^[A-Za-z0-9_-]{1,90}$/);
const Version=z.number().int().min(1).max(Number.MAX_SAFE_INTEGER-1);
const Clock=z.iso.datetime({offset:true});
export interface SelfWorkspaceAuthority{
  /** An external policy/fixture gate: must not grant SYNTHETIC merely because
   * browser labels a payload SYNTHETIC. For real data require owner authority.
   */
  mayOperate(input:{actorId:string;kind:WorkspaceKind;
    operation:'DISCOVER'|'READ'|'WRITE';itemId?:string;value?:OwnerWorkspaceValue;
    now:string}):Promise<boolean>;
}
export interface OwnerWorkspacePort{
  list(input:{actorId:string;kind:WorkspaceKind;limit:number;afterId?:string}):
    Promise<{items:OwnerWorkspaceRecord[];nextCursor:string|null}>;
  read(input:{actorId:string;kind:WorkspaceKind;itemId:string}):
    Promise<OwnerWorkspaceRecord|null>;
  create(input:{actorId:string;itemId:string;value:OwnerWorkspaceValue}):
    Promise<OwnerWorkspaceRecord>;
  update(input:{actorId:string;kind:WorkspaceKind;itemId:string;expectedVersion:number;
    value:OwnerWorkspaceValue}):Promise<OwnerWorkspaceRecord>;
  delete(input:{actorId:string;kind:WorkspaceKind;itemId:string;expectedVersion:number}):
    Promise<{version:number}>;
}
export class WorkspaceDenied extends Error{constructor(){super('Owner workspace access denied');}}
export class WorkspaceConflict extends Error{constructor(){super('Owner workspace version conflict');}}
export class WorkspaceQuota extends Error{constructor(){super('Owner workspace storage limit reached');}}
function iso(value:unknown):string{
  return Clock.parse(value instanceof Date?value.toISOString():value);
}
function stored(row:Record<string,unknown>,kind:WorkspaceKind,id:string):OwnerWorkspaceRecord{
  const result=OwnerWorkspaceRecordSchema.parse({
    itemId:row.item_id,version:Number(row.version),
    value:row.value_json,updatedAt:iso(row.updated_at),
  });
  if(result.itemId!==id||result.value.kind!==kind||row.kind!==kind)
    throw new WorkspaceDenied();
  return result;
}
/** Actor-owned private workspace. Unlike DemoOverlay, no subject is selected
 * and no SharingGrant ever authorizes editing another student's records.
 */
export class PostgresOwnerWorkspaceStore implements OwnerWorkspacePort{
  constructor(private readonly pool:ReviewerSqlPool,
    private readonly authority:SelfWorkspaceAuthority,
    private readonly now:()=>string=()=>new Date().toISOString()){}
  private async permit(input:{actorId:string;kind:WorkspaceKind;
    operation:'DISCOVER'|'READ'|'WRITE';itemId?:string;value?:OwnerWorkspaceValue}){
    let allowed=false;
    try{allowed=await this.authority.mayOperate({...input,now:Clock.parse(this.now())})===true;}
    catch{/* default deny */}
    if(!allowed)throw new WorkspaceDenied();
  }
  private async withOwner<T>(actorRaw:string,kindRaw:WorkspaceKind,
    run:(c:ReviewerSqlConnection,gate:(input:{itemId:string;value:OwnerWorkspaceValue;
      operation:'READ'|'WRITE'})=>Promise<void>)=>Promise<T>):Promise<T>{
    const actorId=Actor.parse(actorRaw),kind=WorkspaceKindSchema.parse(kindRaw);
    const discovery={actorId,kind,operation:'DISCOVER' as const};
    await this.permit(discovery);
    const c=await this.pool.connect();let begun=false;
    try{
      await c.query('BEGIN');begun=true;
      await c.query("SET LOCAL statement_timeout='5s'");
      await c.query("SELECT set_config('hufs.self_actor',$1,true)",[actorId]);
      // Holds a shared row lock. Personal-storage withdrawal must wait until
      // this transaction commits, then purges this user's workspace atomically.
      const consent=await c.query(`SELECT choices_json FROM api_self_consents
        WHERE actor_id=$1 FOR SHARE`,[actorId]);
      if(consent.rows.length!==1||PersonalPurposeChoicesSchema.parse(
        consent.rows[0]?.choices_json).personalStorage!==true)
        throw new WorkspaceDenied();
      const approvals:Array<{itemId:string;value:OwnerWorkspaceValue;operation:'READ'|'WRITE'}>=[];
      const gate=async(v:{itemId:string;value:OwnerWorkspaceValue;operation:'READ'|'WRITE'})=>{
        await this.permit({actorId,kind,...v});approvals.push(v);
      };
      const result=await run(c,gate);
      // Independent authority can be withdrawn while waiting for SQL.
      for(const x of approvals)await this.permit({actorId,kind,...x});
      await this.permit(discovery);
      await c.query('COMMIT');begun=false;
      return result;
    }catch(error){
      if(begun)try{await c.query('ROLLBACK');}catch{/* deny */}
      if((error as {code?:string}).code==='23505')throw new WorkspaceConflict();
      throw error;
    }finally{c.release();}
  }
  private async audit(c:ReviewerSqlConnection,input:{actorId:string;kind:WorkspaceKind;
    itemId:string;version:number;action:'CREATED'|'UPDATED'|'DELETED'}):Promise<void>{
    // This table permits INSERT only. No RETURNING: that would require SELECT.
    await c.query(`INSERT INTO api_self_workspace_events
      (actor_id,kind,item_id,version,action)
      VALUES($1,$2,$3,$4,$5)`,
      [input.actorId,input.kind,input.itemId,input.version,input.action]);
  }
  list(input:{actorId:string;kind:WorkspaceKind;limit:number;afterId?:string}){
    const kind=WorkspaceKindSchema.parse(input.kind);
    const limit=z.number().int().min(1).max(50).parse(input.limit);
    const afterId=input.afterId?Id.parse(input.afterId):'';
    return this.withOwner(input.actorId,kind,async(c,gate)=>{
      const r=await c.query(`SELECT item_id,kind,version,value_json,updated_at
        FROM api_self_workspace_records WHERE actor_id=$1 AND kind=$2
        AND deleted_at IS NULL AND item_id>$3 ORDER BY item_id ASC LIMIT $4`,
        [input.actorId,kind,afterId,limit+1]);
      const selected=r.rows.slice(0,limit);
      const items:OwnerWorkspaceRecord[]=[];
      for(const row of selected){
        const id=Id.parse(row.item_id);
        const val=stored(row,kind,id);
        await gate({itemId:id,value:val.value,operation:'READ'});
        items.push(val);
      }
      return {items,nextCursor:r.rows.length>limit?items.at(-1)?.itemId??null:null};
    });
  }
  read(input:{actorId:string;kind:WorkspaceKind;itemId:string}){
    const kind=WorkspaceKindSchema.parse(input.kind),id=Id.parse(input.itemId);
    return this.withOwner(input.actorId,kind,async(c,gate)=>{
      const r=await c.query(`SELECT item_id,kind,version,value_json,updated_at
        FROM api_self_workspace_records
        WHERE actor_id=$1 AND kind=$2 AND item_id=$3 AND deleted_at IS NULL`,
        [input.actorId,kind,id]);
      if(r.rows.length>1)throw new WorkspaceDenied();
      if(!r.rows[0])return null;
      const record=stored(r.rows[0],kind,id);
      await gate({itemId:id,value:record.value,operation:'READ'});
      return record;
    });
  }
  create(input:{actorId:string;itemId:string;value:OwnerWorkspaceValue}){
    const value=OwnerWorkspaceValueSchema.parse(input.value),itemId=Id.parse(input.itemId);
    return this.withOwner(input.actorId,value.kind,async(c,gate)=>{
      await gate({itemId,value,operation:'WRITE'});
      const raw=JSON.stringify(value);
      if(Buffer.byteLength(raw,'utf8')>8000)throw new WorkspaceDenied();
      // One advisory xact lock per actor/kind prevents parallel first writes
      // from bypassing the bounded, lifetime cap (including tombstones).
      await c.query(`SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))`,
        [input.actorId+'\\0'+value.kind]);
      const cap=await c.query(`SELECT count(*)::int AS n FROM api_self_workspace_records
        WHERE actor_id=$1 AND kind=$2`,[input.actorId,value.kind]);
      if(Number(cap.rows[0]?.n)>=200)throw new WorkspaceQuota();
      const r=await c.query(`INSERT INTO api_self_workspace_records
        (actor_id,kind,item_id,version,value_json)
        VALUES($1,$2,$3,1,$4::jsonb)
        RETURNING item_id,kind,version,value_json,updated_at`,
        [input.actorId,value.kind,itemId,raw]);
      if(r.rows.length!==1)throw new WorkspaceConflict();
      const result=stored(r.rows[0]!,value.kind,itemId);
      await this.audit(c,{actorId:input.actorId,kind:value.kind,
        itemId,version:result.version,action:'CREATED'});
      return result;
    });
  }
  update(input:{actorId:string;kind:WorkspaceKind;itemId:string;
    expectedVersion:number;value:OwnerWorkspaceValue}){
    const kind=WorkspaceKindSchema.parse(input.kind),id=Id.parse(input.itemId);
    const expectedVersion=Version.parse(input.expectedVersion);
    const value=OwnerWorkspaceValueSchema.parse(input.value);
    if(kind!==value.kind)throw new WorkspaceDenied();
    return this.withOwner(input.actorId,kind,async(c,gate)=>{
      await gate({itemId:id,value,operation:'WRITE'});
      const raw=JSON.stringify(value);
      if(Buffer.byteLength(raw,'utf8')>8000)throw new WorkspaceDenied();
      const r=await c.query(`UPDATE api_self_workspace_records
        SET version=version+1,value_json=$4::jsonb,
            updated_at=clock_timestamp()
        WHERE actor_id=$1 AND kind=$2 AND item_id=$3
          AND version=$5 AND deleted_at IS NULL
        RETURNING item_id,kind,version,value_json,updated_at`,
        [input.actorId,kind,id,raw,expectedVersion]);
      if(r.rows.length!==1)throw new WorkspaceConflict();
      const result=stored(r.rows[0]!,kind,id);
      await this.audit(c,{actorId:input.actorId,kind,
        itemId:id,version:result.version,action:'UPDATED'});
      return result;
    });
  }
  delete(input:{actorId:string;kind:WorkspaceKind;itemId:string;expectedVersion:number}){
    const kind=WorkspaceKindSchema.parse(input.kind),id=Id.parse(input.itemId);
    const expectedVersion=Version.parse(input.expectedVersion);
    return this.withOwner(input.actorId,kind,async(c,gate)=>{
      const previous=await c.query(`SELECT item_id,kind,version,value_json,updated_at
        FROM api_self_workspace_records WHERE actor_id=$1 AND kind=$2 AND item_id=$3
          AND deleted_at IS NULL FOR UPDATE`,[input.actorId,kind,id]);
      if(previous.rows.length!==1)throw new WorkspaceConflict();
      const old=stored(previous.rows[0]!,kind,id);
      if(old.version!==expectedVersion)throw new WorkspaceConflict();
      await gate({itemId:id,value:old.value,operation:'WRITE'});
      const r=await c.query(`UPDATE api_self_workspace_records
        SET version=version+1,deleted_at=clock_timestamp(),
            updated_at=clock_timestamp(),
            -- Tombstones retain identity/version for CAS and immutable audit,
            -- but must never retain the deleted owner's private payload.
            value_json=jsonb_build_object('kind',kind,'dataMode',
              value_json->'dataMode')
        WHERE actor_id=$1 AND kind=$2 AND item_id=$3
          AND version=$4 AND deleted_at IS NULL RETURNING version`,
        [input.actorId,kind,id,expectedVersion]);
      if(r.rows.length!==1)throw new WorkspaceConflict();
      const newVersion=Number(r.rows[0]?.version);
      await this.audit(c,{actorId:input.actorId,kind,itemId:id,
        version:newVersion,action:'DELETED'});
      return {version:newVersion};
    });
  }
}
