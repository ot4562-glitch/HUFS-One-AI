import {DemoOverlayPutSchema,DemoOverlayStateSchema,ISODateTimeSchema} from '@hufs-one/contracts';
import type {DemoOverlayPut,DemoOverlayState} from '@hufs-one/contracts';
import {DemoOverlayKeySchema,DemoOverlayConflict,emptyDemoOverlay} from './demo-overlay.js';
import type {DemoOverlayKey,DemoOverlayStore} from './demo-overlay.js';
import type {ReviewerSqlConnection,ReviewerSqlPool} from './auth/reviewer-postgres.js';

const predicate=`actor_id=$1 AND session_id_hash=$2 AND demo_run_id=$3
  AND demo_subject_id=$4 AND dataset_version=$5 AND projection_version=$6
  AND sharing_grant_version=$7`;
function values(k:DemoOverlayKey):string[]{
  return [k.actorId,k.sessionIdHash,k.demoRunId,k.demoSubjectId,
    k.datasetVersion,k.projectionVersion,k.sharingGrantVersion];
}
function state(row:Record<string,unknown>):DemoOverlayState{
  return DemoOverlayStateSchema.parse({version:Number(row.version),value:row.value_json,
    updatedAt:row.updated_at instanceof Date?row.updated_at.toISOString():row.updated_at});
}

/** Dedicated non-owner pool only. This store has no access to original profiles,
 * grants, source rows or REVIEWER state. Caller authenticates and revalidates them. */
export class PostgresDemoOverlayStore implements DemoOverlayStore{
  constructor(private readonly pool:ReviewerSqlPool){}
  private async transaction<T>(key:DemoOverlayKey,
    run:(c:ReviewerSqlConnection)=>Promise<T>):Promise<T>{
    const c=await this.pool.connect();let begun=false;
    try{
      await c.query('BEGIN');begun=true;
      await c.query("SET LOCAL statement_timeout='5s'");
      await c.query("SELECT set_config('hufs.demo_actor',$1,true)",[key.actorId]);
      const result=await run(c);
      await c.query('COMMIT');begun=false;return result;
    }catch(error){
      if(begun)try{await c.query('ROLLBACK');}catch{/* no fallback */}
      throw error;
    }finally{c.release();}
  }
  async read(raw:DemoOverlayKey):Promise<DemoOverlayState>{
    const key=DemoOverlayKeySchema.parse(raw);
    return this.transaction(key,async c=>{
      const result=await c.query(`SELECT version,value_json,updated_at
        FROM api_demo_overlays WHERE ${predicate}`,values(key));
      if(result.rows.length>1)throw new Error('Ambiguous overlay row');
      return result.rows[0]?state(result.rows[0]):emptyDemoOverlay();
    });
  }
  async put(rawKey:DemoOverlayKey,rawChange:DemoOverlayPut,rawNow:string):Promise<DemoOverlayState>{
    const key=DemoOverlayKeySchema.parse(rawKey),change=DemoOverlayPutSchema.parse(rawChange);
    const now=ISODateTimeSchema.parse(rawNow),json=JSON.stringify(change.value);
    return this.transaction(key,async c=>{
      const result=change.expectedVersion===0
        ?await c.query(`INSERT INTO api_demo_overlays
          (actor_id,session_id_hash,demo_run_id,demo_subject_id,dataset_version,
           projection_version,sharing_grant_version,version,value_json,updated_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,1,$8::jsonb,$9)
          ON CONFLICT DO NOTHING RETURNING version,value_json,updated_at`,[...values(key),json,now])
        :await c.query(`UPDATE api_demo_overlays SET version=version+1,
          value_json=$9::jsonb,updated_at=$10 WHERE ${predicate} AND version=$8
          RETURNING version,value_json,updated_at`,[...values(key),change.expectedVersion,json,now]);
      if(result.rows.length!==1)throw new DemoOverlayConflict();
      const saved=state(result.rows[0]!);
      if(saved.version!==change.expectedVersion+1)throw new DemoOverlayConflict();
      return saved;
    });
  }
}
