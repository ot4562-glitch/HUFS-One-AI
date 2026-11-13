import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {ReviewerSqlPool,ReviewerSqlConnection} from '../auth/reviewer-postgres.js';
const Actor=z.string().regex(/^[A-Za-z0-9_.:@-]{1,200}$/),Id=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const Item=z.string().regex(/^[A-Za-z0-9_-]{1,90}$/),Version=z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const Iso=z.iso.datetime({offset:true}),Operation=z.enum(['PURGE_EXTRACTION','PURGE_DOCUMENT']);
export const ProofCleanupJobSchema=z.strictObject({actorId:Actor,itemId:Item,assetId:Id,assetVersion:Id,recordVersion:Version,operation:Operation});
export type ProofCleanupJob=z.infer<typeof ProofCleanupJobSchema>;
const Receipt=z.strictObject({receiptId:Id,actorId:Actor,assetId:Id,assetVersion:Id,operation:Operation,erasedAt:Iso,
  erasedComponents:z.array(z.enum(['ORIGINAL_ASSET','OCR_CACHE','DERIVED_FIELDS','MODEL_INPUTS'])).max(4)
    .refine(v=>new Set(v).size===v.length)});
export interface ProofCleanupAuthority{
  /** Cleanup authority is independent from storage consent, solely for erasure.
   * It must bind a current owner/operator and must never authorize reads of payloads. */
  mayCleanup(input:{actorId:string;operation:'DISCOVER'|'READ'|'ACK';now:string;job?:ProofCleanupJob;assetId?:string;signal?:AbortSignal}):Promise<boolean>;
}
export class ProofCleanupDenied extends Error{constructor(){super('Proof cleanup access denied');}}
export interface ProofCleanupOutbox{
  list(input:{actorId:string;limit:number;signal?:AbortSignal;target?:ProofCleanupJob}):Promise<ProofCleanupJob[]>;
  find(input:{job:ProofCleanupJob}):Promise<{state:'PENDING'|'ERASED';receiptId:string|null}|null>;
  blockedProofIds(input:{actorId:string;itemIds:readonly string[]}):Promise<string[]>;
  acknowledge(input:{job:ProofCleanupJob;receiptId:string;signal?:AbortSignal}):Promise<boolean>;
  isAssetBlocked(input:{actorId:string;assetId:string}):Promise<boolean>;
}
function jobFromRow(row:Record<string,unknown>):ProofCleanupJob{
  return ProofCleanupJobSchema.parse({actorId:row.actor_id,itemId:row.item_id,assetId:row.asset_id,
    assetVersion:row.asset_version,recordVersion:Number(row.record_version),operation:row.operation});
}
function live(signal:AbortSignal){if(signal.aborted)throw new ProofCleanupDenied();}
async function bounded<T>(run:(signal:AbortSignal)=>Promise<T>,timeoutMs:number,parent?:AbortSignal):Promise<T>{
  const controller=new AbortController(),signal=parent?AbortSignal.any([parent,controller.signal]):controller.signal;
  let listener:()=>void=()=>{};
  const timeout=new Promise<never>((_resolve,reject)=>{listener=()=>reject(new ProofCleanupDenied());signal.addEventListener('abort',listener,{once:true});});
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{live(signal);return await Promise.race([run(signal),timeout]);}
  finally{clearTimeout(timer);signal.removeEventListener('abort',listener);controller.abort();}
}
export const withProofDeadline=bounded;
/** This table has no candidate text/coordinates/hash. Triggers alone enqueue,
 * so crash or withdrawal cannot commit a payload removal without its purge job. */
export class PostgresRecognitionCleanupOutbox implements ProofCleanupOutbox{
  constructor(private readonly pool:ReviewerSqlPool,private readonly authority:ProofCleanupAuthority,
    private readonly now:()=>string=()=>new Date().toISOString(),private readonly timeoutMs=5000){z.number().int().min(1).max(5000).parse(timeoutMs);}
  private async permit(input:Omit<Parameters<ProofCleanupAuthority['mayCleanup']>[0],'now'|'signal'>,signal:AbortSignal){
    live(signal);let allowed=false;try{allowed=await this.authority.mayCleanup({...input,now:Iso.parse(this.now()),signal})===true;}catch{/* default deny */}
    live(signal);
    if(!allowed)throw new ProofCleanupDenied();
  }
  private async owner<T>(raw:string,run:(c:ReviewerSqlConnection,actorId:string,signal:AbortSignal)=>Promise<T>,parent?:AbortSignal):Promise<T>{
    const actorId=Actor.parse(raw);
    return bounded(async signal=>{
      await this.permit({actorId,operation:'DISCOVER'},signal);
      const c=await this.pool.connect();if(signal.aborted){c.release();throw new ProofCleanupDenied();}let begun=false;
      const checked:ReviewerSqlConnection={release:()=>{},query:async(sql,params)=>{live(signal);const result=await c.query(sql,params);live(signal);return result;}};
      try{
        begun=true;await checked.query('BEGIN');await checked.query("SET LOCAL statement_timeout='5s'");
        await checked.query("SELECT set_config('hufs.self_actor',$1,true)",[actorId]);
        const result=await run(checked,actorId,signal);await this.permit({actorId,operation:'DISCOVER'},signal);
        await checked.query('COMMIT');begun=false;return result;
      }catch(error){if(begun)try{await c.query('ROLLBACK');}catch{/* preserve failure */}throw error;}
      finally{c.release();}
    },this.timeoutMs,parent);
  }
  list(input:{actorId:string;limit:number;signal?:AbortSignal;target?:ProofCleanupJob}){
    const limit=z.number().int().min(1).max(20).parse(input.limit);
    const target=input.target?ProofCleanupJobSchema.parse(input.target):undefined;
    if(target&&target.actorId!==input.actorId)throw new ProofCleanupDenied();
    return this.owner(input.actorId,async(c,actorId,signal)=>{
      const r=await c.query(`SELECT actor_id,item_id,asset_id,asset_version,record_version,operation
        FROM api_self_proof_cleanup WHERE actor_id=$1 AND status='PENDING'
        AND ($3::text IS NULL OR(item_id=$3 AND asset_id=$4 AND asset_version=$5 AND record_version=$6 AND operation=$7))
        ORDER BY created_at,item_id,asset_version,record_version,operation LIMIT $2`,
        [actorId,limit,target?.itemId??null,target?.assetId??null,target?.assetVersion??null,target?.recordVersion??null,target?.operation??null]);
      const jobs=r.rows.map(jobFromRow);
      for(const job of jobs){if(job.actorId!==actorId)throw new ProofCleanupDenied();await this.permit({actorId,operation:'READ',job},signal);}
      return jobs;
    },input.signal);
  }
  find(input:{job:ProofCleanupJob}){
    const job=ProofCleanupJobSchema.parse(input.job);
    return this.owner(job.actorId,async(c,actorId,signal)=>{
      const r=await c.query(`SELECT status,receipt_id FROM api_self_proof_cleanup WHERE actor_id=$1 AND item_id=$2
        AND asset_version=$3 AND record_version=$4 AND operation=$5 AND asset_id=$6`,
        [actorId,job.itemId,job.assetVersion,job.recordVersion,job.operation,job.assetId]);
      await this.permit({actorId,operation:'READ',job},signal);
      if(r.rows.length===0)return null;if(r.rows.length!==1)throw new ProofCleanupDenied();
      const row=z.strictObject({state:z.enum(['PENDING','ERASED']),receiptId:Id.nullable()}).parse({state:r.rows[0]?.status,receiptId:r.rows[0]?.receipt_id});
      if((row.state==='ERASED')!==(row.receiptId!==null))throw new ProofCleanupDenied();return row;
    });
  }
  blockedProofIds(input:{actorId:string;itemIds:readonly string[]}){
    const itemIds=z.array(Id).max(100).parse(input.itemIds);
    return this.owner(input.actorId,async(c,actorId,signal)=>{
      const r=await c.query(`SELECT DISTINCT item_id FROM api_self_proof_cleanup WHERE actor_id=$1 AND item_id=ANY($2::text[]) ORDER BY item_id`,[actorId,itemIds]);
      await this.permit({actorId,operation:'READ'},signal);
      return r.rows.map(row=>Item.parse(row.item_id));
    });
  }
  isAssetBlocked(input:{actorId:string;assetId:string}){
    const assetId=Id.parse(input.assetId);
    return this.owner(input.actorId,async(c,actorId,signal)=>{
      const r=await c.query(`SELECT EXISTS(SELECT 1 FROM api_self_proof_cleanup WHERE actor_id=$1 AND asset_id=$2) AS blocked`,[actorId,assetId]);
      await this.permit({actorId,operation:'READ',assetId},signal);
      if(typeof r.rows[0]?.blocked!=='boolean')throw new ProofCleanupDenied();return r.rows[0].blocked;
    });
  }
  acknowledge(input:{job:ProofCleanupJob;receiptId:string;signal?:AbortSignal}){
    const job=ProofCleanupJobSchema.parse(input.job),receiptId=Id.parse(input.receiptId);
    return this.owner(job.actorId,async(c,actorId,signal)=>{
      await this.permit({actorId,operation:'ACK',job},signal);
      const params=[actorId,job.itemId,job.assetVersion,job.recordVersion,job.operation,job.assetId,receiptId];
      const r=await c.query(`UPDATE api_self_proof_cleanup SET status='ERASED',receipt_id=$7,acknowledged_at=clock_timestamp()
        WHERE actor_id=$1 AND item_id=$2 AND asset_version=$3 AND record_version=$4 AND operation=$5 AND asset_id=$6
          AND status='PENDING' RETURNING receipt_id`,params);
      await this.permit({actorId,operation:'ACK',job},signal);
      if(r.rows.length===1)return r.rows[0]?.receipt_id===receiptId;
      const old=await c.query(`SELECT status,receipt_id FROM api_self_proof_cleanup WHERE actor_id=$1 AND item_id=$2
        AND asset_version=$3 AND record_version=$4 AND operation=$5 AND asset_id=$6`,params.slice(0,6));
      if(old.rows.length===1&&old.rows[0]?.status==='ERASED'&&old.rows[0]?.receipt_id===receiptId)return true;
      throw new ProofCleanupDenied();
    },input.signal);
  }
}
export interface RecognitionErasurePort{
  /** Must be idempotent across replicas/retries and invalidate readers/model
   * loaders before returning. Withdrawal/deletion erase originals as well. */
  erase(input:{job:ProofCleanupJob;idempotencyKey:string;signal:AbortSignal}):Promise<unknown>;
  /** Independent current storage/provider evidence, not the erase call's assertion. */
  verifyErasure(input:{job:ProofCleanupJob;receipt:z.infer<typeof Receipt>;now:string;signal:AbortSignal}):Promise<boolean>;
}
/** A bounded batch, no scheduler, credentials or synthetic fallback. A late
 * erasure response cannot start ACK. An in-flight COMMIT can have unknown
 * outcome: re-read the idempotent outbox, never claim rollback from a timeout. */
export async function drainProofCleanup(input:{actorId:string;outbox:ProofCleanupOutbox;eraser?:RecognitionErasurePort;
  now:()=>string;limit?:number;timeoutMs?:number;target?:ProofCleanupJob;signal?:AbortSignal}){
  const actorId=Actor.parse(input.actorId),limit=z.number().int().min(1).max(20).parse(input.limit??10);
  const timeout=z.number().int().min(1).max(5000).parse(input.timeoutMs??5000);
  if(!input.eraser)return {state:'NOT_CONNECTED' as const,attempted:0,acknowledged:0,failed:0,batchLimitReached:false};
  const target=input.target?ProofCleanupJobSchema.parse(input.target):undefined;
  if(target&&target.actorId!==actorId)throw new ProofCleanupDenied();
  const eraser=input.eraser,jobs=await bounded(signal=>input.outbox.list({actorId,limit,signal,...(target?{target}:{})}),timeout,input.signal);let acknowledged=0,failed=0;
  if(jobs.length>limit)throw new ProofCleanupDenied();
  for(const raw of jobs){
    if(input.signal)live(input.signal);
    const job=ProofCleanupJobSchema.parse(raw);if(job.actorId!==actorId||target&&JSON.stringify(job)!==JSON.stringify(target))throw new ProofCleanupDenied();
    const controller=new AbortController(),signal=input.signal?AbortSignal.any([input.signal,controller.signal]):controller.signal;
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{
      const work=async()=>{
        const idempotencyKey=createHash('sha256').update(JSON.stringify([job.actorId,job.itemId,job.assetId,job.assetVersion,job.recordVersion,job.operation])).digest('hex');
        const receipt=Receipt.parse(await eraser.erase({job,idempotencyKey,signal}));
        live(signal);
        const components=new Set(receipt.erasedComponents),required=job.operation==='PURGE_DOCUMENT'
          ?['ORIGINAL_ASSET','OCR_CACHE','DERIVED_FIELDS','MODEL_INPUTS']:['OCR_CACHE','DERIVED_FIELDS','MODEL_INPUTS'];
        if(receipt.actorId!==job.actorId||receipt.assetId!==job.assetId||receipt.assetVersion!==job.assetVersion
          ||receipt.operation!==job.operation||required.some(c=>!components.has(c as z.infer<typeof Receipt>['erasedComponents'][number]))
          ||Date.parse(receipt.erasedAt)>Date.parse(Iso.parse(input.now()))
          ||await eraser.verifyErasure({job,receipt,now:Iso.parse(input.now()),signal})!==true
          ||signal.aborted)throw new ProofCleanupDenied();
        return receipt.receiptId;
      };
      const receiptId=await Promise.race([work(),new Promise<never>((_resolve,reject)=>{
        timer=setTimeout(()=>{controller.abort();reject(new ProofCleanupDenied());},timeout);
      })]);
      if(timer){clearTimeout(timer);timer=undefined;}
      if(signal.aborted||await bounded(signal=>input.outbox.acknowledge({job,receiptId,signal}),timeout,input.signal)!==true)throw new ProofCleanupDenied();acknowledged++;
    }catch{failed++;}finally{if(timer)clearTimeout(timer);controller.abort();}
  }
  return {state:'READY' as const,attempted:jobs.length,acknowledged,failed,batchLimitReached:jobs.length===limit};
}
