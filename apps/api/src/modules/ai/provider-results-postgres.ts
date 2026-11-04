import {z} from 'zod';
import type {ReviewerSqlPool} from '../auth/reviewer-postgres.js';

const Ref=z.string().regex(/^[A-Za-z0-9_.:@-]{1,128}$/),Session=Ref.min(8),Iso=z.iso.datetime({offset:true});
const Candidate=z.object({reviewState:z.literal('NEEDS_REVIEW')}).passthrough();
const Stored=z.strictObject({jobId:z.uuid(),actorId:Ref,sessionIdHash:Session,inputRef:Ref,operation:z.enum(['OCR_GENERAL','HCX_005','HCX_007']),
  asOf:Iso,phaseId:Ref,idempotencyKey:Ref,requestSha256:z.string().regex(/^[a-f0-9]{64}$/),inputEpoch:z.string().regex(/^input-[a-f0-9]{64}$/),
  expiresAt:Iso,candidate:Candidate});
export interface ProviderStoredResult {
  jobId:string;actorId:string;sessionIdHash:string;inputRef:string;operation:'OCR_GENERAL'|'HCX_005'|'HCX_007';asOf:string;
  phaseId:string;idempotencyKey:string;requestSha256:string;inputEpoch:string;expiresAt:string;candidate:unknown;
}
export class ProviderResultError extends Error {
  constructor(){super('Provider result unavailable');this.name='ProviderResultError';}
}
function json(value:unknown){
  // Provider candidates must be plain bounded JSON, without lossy coercion of
  // undefined/nonfinite values, arbitrary getters/toJSON, cycles or deep trees.
  const stack:Array<{value:unknown;depth:number}>=[{value,depth:0}],seen=new Set<object>();let nodes=0;
  while(stack.length){
    const item=stack.pop()!,v=item.value;if(++nodes>100000||item.depth>64)throw new ProviderResultError();
    if(v===null||typeof v==='string'||typeof v==='boolean')continue;
    if(typeof v==='number'&&Number.isFinite(v))continue;
    if(typeof v!=='object'||seen.has(v))throw new ProviderResultError();seen.add(v);
    if(!Array.isArray(v)&&Object.getPrototypeOf(v)!==Object.prototype&&Object.getPrototypeOf(v)!==null)throw new ProviderResultError();
    for(const key of Object.keys(v)){
      const d=Object.getOwnPropertyDescriptor(v,key);if(!d||!('value' in d))throw new ProviderResultError();
      stack.push({value:d.value,depth:item.depth+1});
    }
    if(Array.isArray(v)&&Object.keys(v).length!==v.length)throw new ProviderResultError();
  }
  const text=JSON.stringify(value);if(Buffer.byteLength(text)>2*1024*1024)throw new ProviderResultError();return text;
}
/** EXECUTE-only durable result port. Current session/source/grant validation
 * still belongs to the executor before any HTTP disclosure. No provider calls,
 * migrations, schedules or automatic cleanup are started by this adapter. */
export class PostgresProviderResults {
  constructor(private readonly pool:ReviewerSqlPool){}
  async put(value:ProviderStoredResult):Promise<void>{
    try{
      // Validate JSON before Zod can traverse arbitrary non-JSON objects.
      const encoded=json(value),v=Stored.parse(JSON.parse(encoded));
      await this.run(v.actorId,v.sessionIdHash,'SELECT public.ai_provider_result_put($1::jsonb) AS stored',[encoded],rows=>{
        if(rows.length!==1||rows[0]!.stored!==true)throw new ProviderResultError();
      });
    }catch{throw new ProviderResultError();}
  }
  async get(actorId:string,sessionIdHash:string,jobId:string):Promise<ProviderStoredResult|null>{
    try{
      Ref.parse(actorId);Session.parse(sessionIdHash);z.uuid().parse(jobId);
      return await this.run(actorId,sessionIdHash,'SELECT public.ai_provider_result_get($1::uuid) AS value',[jobId],rows=>{
        if(rows.length!==1)throw new ProviderResultError();const raw=rows[0]!.value;if(raw===null)return null;
        const v=Stored.parse(JSON.parse(json(raw)));
        if(v.actorId!==actorId||v.sessionIdHash!==sessionIdHash||v.jobId!==jobId)throw new ProviderResultError();return v;
      });
    }catch{throw new ProviderResultError();}
  }
  /** Explicit operator maintenance only. Scrubs expired payloads in batches;
   * deployment must separately grant this function. No timer or job is created. */
  async pruneExpired(maxRows=100):Promise<number>{
    try{
      z.number().int().min(1).max(1000).parse(maxRows);
      return await this.run(null,null,'SELECT public.ai_provider_results_prune($1) AS pruned',[maxRows],rows=>{
        if(rows.length!==1)throw new ProviderResultError();return z.number().int().min(0).max(maxRows).parse(rows[0]!.pruned);
      });
    }catch{throw new ProviderResultError();}
  }
  private async run<T>(actor:string|null,session:string|null,sql:string,params:readonly unknown[],parse:(rows:Record<string,unknown>[])=>T):Promise<T>{
    const c=await this.pool.connect();
    try{
      await c.query('BEGIN');await c.query("SET LOCAL statement_timeout='5s'");
      if(actor!==null)await c.query("SELECT set_config('app.actor_id',$1,true),set_config('app.session_hash',$2,true)",[actor,session]);
      const result=parse((await c.query(sql,params)).rows);await c.query('COMMIT');return result;
    }catch{try{await c.query('ROLLBACK');}catch{/* no payload/SQL logging */}throw new ProviderResultError();}
    finally{c.release();}
  }
}
