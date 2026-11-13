/** #512 private original-byte ledger. No public URL, filename or model input.
 * This adapter does not provision storage or grant source rights. A current
 * owner authority and independently deployed file-inspection service are required.
 * Production private DB encryption/backups and real inspection remain gates.
 */
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {PersonalPurposeChoicesSchema,FeatureAdditions as V} from '@hufs-one/contracts';
import type {ReviewerSqlConnection,ReviewerSqlPool} from '../auth/reviewer-postgres.js';
import {withProofDeadline} from './recognition-cleanup-postgres.js';
import {recognitionProofId} from '../owner-recognition-proof-service.js';
const Actor=z.string().regex(/^[A-Za-z0-9_.:@-]{1,200}$/),Id=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const Iso=z.iso.datetime({offset:true}),Version=z.number().int().min(1).max(Number.MAX_SAFE_INTEGER-1);
const Hash=z.string().regex(/^[a-f0-9]{64}$/),Mime=V.RecognitionAssetMimeSchema;
const RequestId=V.RecognitionAssetRequestIdSchema;
export const RecognitionAssetGrantSchema=z.strictObject({actorId:Actor,activityId:Id,storageConsentVersion:Version,
  consentVersion:Id,rightsVersion:Id,expiresAt:Iso});
export type RecognitionAssetGrant=z.infer<typeof RecognitionAssetGrantSchema>;
export type RecognitionAssetPurpose='INTAKE'|'METADATA'|'ORIGINAL_READ';
export interface RecognitionAssetAuthority{
  grant(input:{actorId:string;activityId:string;purpose:RecognitionAssetPurpose;now:string;signal:AbortSignal}):Promise<unknown>;
  revalidate(input:{receipt:RecognitionAssetGrant;purpose:RecognitionAssetPurpose;now:string;signal:AbortSignal}):Promise<boolean>;
  /** Current authenticated erasure authority, independent of personalStorage. */
  mayErase(input:{actorId:string;activityId:string;assetId:string;now:string;signal:AbortSignal}):Promise<boolean>;
}
export interface RecognitionFileInspector{
  /** Must validate the full container, malware and resource limits in isolation.
   * MIME header sniffing below is NOT inspection. Never send bytes to an
   * unapproved external scanner or model. CLEAN is bound to these exact bytes. */
  inspect(input:{bytes:Buffer;sha256:string;mimeType:z.infer<typeof Mime>;signal:AbortSignal}):Promise<unknown>;
}
const Inspection=z.strictObject({state:z.literal('CLEAN'),sha256:Hash,mimeType:Mime,receiptId:Id,inspectorVersion:Id,
  inspectedAt:Iso,expiresAt:Iso});
export const RecognitionAssetMetadataSchema=V.RecognitionAssetMetadataSchema;
export type RecognitionAssetMetadata=V.RecognitionAssetMetadata;
export class RecognitionAssetDenied extends Error{constructor(){super('Recognition asset access denied');}}
export class RecognitionAssetConflict extends Error{constructor(){super('Recognition asset context or request changed');}}
export class RecognitionAssetQuota extends Error{constructor(){super('Recognition asset storage limit reached');}}
const hash=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const live=(signal:AbortSignal)=>{if(signal.aborted)throw new RecognitionAssetDenied();};
const time=(value:unknown)=>Iso.parse(value instanceof Date?value.toISOString():value);
function metadata(row:Record<string,unknown>):RecognitionAssetMetadata{
  return RecognitionAssetMetadataSchema.parse({assetId:row.asset_id,assetVersion:row.asset_version,proofId:row.proof_item_id,
    activityId:row.activity_id,mimeType:row.mime_type,size:Number(row.size_bytes),sha256:row.original_sha256,recordedAt:time(row.created_at),
    provenance:'OWNER_UPLOADED_UNVERIFIED',officiallyRecognized:false,modelInputAllowed:false});
}
function sniff(bytes:Buffer,mime:z.infer<typeof Mime>){
  const png=bytes.length>=33&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.toString('ascii',12,16)==='IHDR';
  const jpeg=bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217;
  const pdf=bytes.length>=14&&bytes.toString('ascii',0,5)==='%PDF-'&&bytes.subarray(-1024).includes(Buffer.from('%%EOF'));
  if(!(mime==='image/png'?png:mime==='image/jpeg'?jpeg:pdf))throw new RecognitionAssetDenied();
}
const columns='asset_id,asset_version,proof_item_id,activity_id,mime_type,size_bytes,original_sha256,created_at';

export class PostgresRecognitionPrivateAssets{
  constructor(private readonly pool:ReviewerSqlPool,private readonly authority:RecognitionAssetAuthority,
    private readonly inspector:RecognitionFileInspector,private readonly now:()=>string=()=>new Date().toISOString()){
    if(!pool||typeof pool.connect!=='function'||!inspector||typeof inspector.inspect!=='function'
      ||['grant','revalidate','mayErase'].some(k=>typeof authority?.[k as keyof RecognitionAssetAuthority]!=='function'))
      throw new Error('Recognition originals require private SQL, current authority and file inspection');
  }
  contextVersion(receipt:RecognitionAssetGrant):string{
    const r=RecognitionAssetGrantSchema.parse(receipt);
    return hash(JSON.stringify([r.actorId,r.activityId,r.storageConsentVersion,r.consentVersion,r.rightsVersion,r.expiresAt]));
  }
  private async permit(receipt:RecognitionAssetGrant,purpose:RecognitionAssetPurpose,signal:AbortSignal){
    live(signal);let allowed=false;
    try{allowed=await this.authority.revalidate({receipt,purpose,now:Iso.parse(this.now()),signal})===true;}catch{/* deny */}
    live(signal);if(!allowed||Date.parse(receipt.expiresAt)<=Date.parse(Iso.parse(this.now())))throw new RecognitionAssetDenied();
  }
  private async grant(actorId:string,activityId:string,purpose:RecognitionAssetPurpose,signal:AbortSignal){
    Actor.parse(actorId);Id.parse(activityId);live(signal);
    const receipt=RecognitionAssetGrantSchema.parse(await this.authority.grant({actorId,activityId,purpose,now:Iso.parse(this.now()),signal}));
    live(signal);if(receipt.actorId!==actorId||receipt.activityId!==activityId)throw new RecognitionAssetDenied();
    await this.permit(receipt,purpose,signal);return receipt;
  }
  private async transaction<T>(actorId:string,signal:AbortSignal,run:(c:ReviewerSqlConnection)=>Promise<T>){
    live(signal);const c=await this.pool.connect();if(signal.aborted){c.release();throw new RecognitionAssetDenied();}let begun=false;
    const checked:ReviewerSqlConnection={release:()=>{},query:async(sql,params)=>{live(signal);const value=await c.query(sql,params);live(signal);return value;}};
    try{
      begun=true;await checked.query('BEGIN');await checked.query("SET LOCAL statement_timeout='5s'");
      await checked.query("SELECT set_config('hufs.self_actor',$1,true)",[Actor.parse(actorId)]);
      const result=await run(checked);live(signal);await checked.query('COMMIT');begun=false;return result;
    }catch(error){if(begun)try{await c.query('ROLLBACK');}catch{/* preserve failure */}
      if((error as {code?:string}).code==='23505')throw new RecognitionAssetConflict();throw error;
    }finally{c.release();}
  }
  private async current(c:ReviewerSqlConnection,receipt:RecognitionAssetGrant,extraExpiry?:string){
    const result=await c.query('SELECT version,choices_json,clock_timestamp() AS database_now FROM api_self_consents WHERE actor_id=$1 FOR UPDATE',[receipt.actorId]);
    const row=result.rows[0];
    if(result.rows.length!==1||Number(row!.version)!==receipt.storageConsentVersion
      ||!PersonalPurposeChoicesSchema.parse(row!.choices_json).personalStorage)throw new RecognitionAssetDenied();
    const latest=Math.max(Date.parse(Iso.parse(this.now())),Date.parse(time(row!.database_now)));
    if(Date.parse(receipt.expiresAt)<=latest||extraExpiry&&Date.parse(extraExpiry)<=latest)throw new RecognitionAssetDenied();
  }
  private async withGrant<T>(receipt:RecognitionAssetGrant,purpose:RecognitionAssetPurpose,signal:AbortSignal,
    run:(c:ReviewerSqlConnection)=>Promise<T>,extraExpiry?:string,guard?:()=>Promise<void>){
    await this.permit(receipt,purpose,signal);await guard?.();live(signal);
    return this.transaction(receipt.actorId,signal,async c=>{
      await this.current(c,receipt,extraExpiry);const result=await run(c);
      await this.permit(receipt,purpose,signal);await guard?.();live(signal);await this.current(c,receipt,extraExpiry);return result;
    });
  }
  policy(input:{actorId:string;activityId:string;signal?:AbortSignal;guard?:()=>Promise<void>}){
    return withProofDeadline(async signal=>{
      const receipt=await this.grant(input.actorId,input.activityId,'INTAKE',signal);
      return this.withGrant(receipt,'INTAKE',signal,async()=>({receipt,contextVersion:this.contextVersion(receipt),maxFileBytes:2*1024*1024,
        maxFilesPerActivity:10,allowedMimeTypes:Mime.options}),undefined,input.guard);
    },5000,input.signal);
  }
  list(input:{actorId:string;activityId:string;signal?:AbortSignal;guard?:()=>Promise<void>}){
    return withProofDeadline(async signal=>{
      const receipt=await this.grant(input.actorId,input.activityId,'METADATA',signal);
      return this.withGrant(receipt,'METADATA',signal,async c=>{
        const rows=await c.query(`SELECT ${columns} FROM api_self_recognition_assets WHERE actor_id=$1 AND activity_id=$2 AND state='LIVE' ORDER BY asset_id LIMIT 11`,[receipt.actorId,receipt.activityId]);
        if(rows.rows.length>10)throw new RecognitionAssetDenied();return {receipt,items:rows.rows.map(metadata)};
      },undefined,input.guard);
    },5000,input.signal);
  }
  async intake(input:{actorId:string;activityId:string;requestId:string;contextVersion:string;mimeType:z.infer<typeof Mime>;bytes:Uint8Array;signal?:AbortSignal;guard?:()=>Promise<void>}){
    // Copy before the first await. Neither caller nor scanner mutation may
    // change what the inspected hash authorizes for persistence.
    if(!(input.bytes instanceof Uint8Array)||input.bytes.byteLength<1||input.bytes.byteLength>2*1024*1024
      ||input.bytes.buffer instanceof SharedArrayBuffer)throw new RecognitionAssetDenied();
    const bytes=Buffer.from(input.bytes),mimeType=Mime.parse(input.mimeType),requestId=RequestId.parse(input.requestId),contextVersion=Hash.parse(input.contextVersion);
    sniff(bytes,mimeType);const sha256=hash(bytes);
    return withProofDeadline(async signal=>{
      const receipt=await this.grant(input.actorId,input.activityId,'INTAKE',signal);
      if(contextVersion!==this.contextVersion(receipt))throw new RecognitionAssetConflict();
      await input.guard?.();live(signal);
      const inspectionBytes=Buffer.from(bytes);
      const scan=Inspection.parse(await this.inspector.inspect({bytes:inspectionBytes,sha256,mimeType,signal}));live(signal);
      const inspectedNow=Date.parse(Iso.parse(this.now()));
      if(scan.sha256!==sha256||scan.mimeType!==mimeType||hash(inspectionBytes)!==sha256
        ||Date.parse(scan.inspectedAt)>inspectedNow||Date.parse(scan.expiresAt)<=inspectedNow
        ||Date.parse(scan.expiresAt)<=Date.parse(scan.inspectedAt))throw new RecognitionAssetDenied();
      const assetId='asset-'+hash(JSON.stringify([receipt.actorId,receipt.activityId,requestId])),assetVersion='original-v1';
      return this.withGrant(receipt,'INTAKE',signal,async c=>{
        const old=await c.query(`SELECT ${columns},state,created_consent_version,rights_version FROM api_self_recognition_assets WHERE actor_id=$1 AND asset_id=$2`,[receipt.actorId,assetId]);
        if(old.rows.length){const row=old.rows[0]!;
          if(old.rows.length!==1||row.state!=='LIVE'||row.original_sha256!==sha256||row.mime_type!==mimeType||Number(row.size_bytes)!==bytes.length
            ||row.rights_version!==receipt.rightsVersion||Number(row.created_consent_version)!==receipt.storageConsentVersion)throw new RecognitionAssetConflict();
          return metadata(row);
        }
        const counts=await c.query(`SELECT count(*)::int AS owner_count,count(*) FILTER(WHERE activity_id=$2)::int AS activity_count FROM api_self_recognition_assets WHERE actor_id=$1 AND state='LIVE'`,[receipt.actorId,receipt.activityId]);
        const count=counts.rows[0];if(!count||Number(count.owner_count)>=50||Number(count.activity_count)>=10)throw new RecognitionAssetQuota();
        const saved=await c.query(`INSERT INTO api_self_recognition_assets(actor_id,asset_id,asset_version,proof_item_id,activity_id,state,version,
          created_consent_version,rights_version,consent_version,mime_type,size_bytes,original_sha256,raw_bytes,inspection_receipt,inspector_version)
          VALUES($1,$2,$3,$4,$5,'LIVE',1,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING ${columns}`,
          [receipt.actorId,assetId,assetVersion,recognitionProofId(receipt.actorId,receipt.activityId,assetId),receipt.activityId,
            receipt.storageConsentVersion,receipt.rightsVersion,receipt.consentVersion,mimeType,bytes.length,sha256,bytes,scan.receiptId,scan.inspectorVersion]);
        if(saved.rows.length!==1)throw new RecognitionAssetDenied();return metadata(saved.rows[0]!);
      },scan.expiresAt,input.guard);
    },5000,input.signal);
  }
  readOriginal(input:{actorId:string;activityId:string;assetId:string;assetVersion:string;signal?:AbortSignal;guard?:()=>Promise<void>}){
    Id.parse(input.assetId);Id.parse(input.assetVersion);
    return withProofDeadline(async signal=>{
      const receipt=await this.grant(input.actorId,input.activityId,'ORIGINAL_READ',signal);
      return this.withGrant(receipt,'ORIGINAL_READ',signal,async c=>{
        const rows=await c.query(`SELECT ${columns},raw_bytes FROM api_self_recognition_assets WHERE actor_id=$1 AND activity_id=$2 AND asset_id=$3 AND asset_version=$4 AND state='LIVE'`,
          [receipt.actorId,receipt.activityId,input.assetId,input.assetVersion]);
        if(rows.rows.length!==1)throw new RecognitionAssetDenied();const row=rows.rows[0]!,item=metadata(row);
        if(!(row.raw_bytes instanceof Uint8Array))throw new RecognitionAssetDenied();const bytes=Buffer.from(row.raw_bytes);
        if(bytes.length!==item.size||hash(bytes)!==item.sha256)throw new RecognitionAssetDenied();return {receipt,item,bytes};
      },undefined,input.guard);
    },5000,input.signal);
  }
  erase(input:{actorId:string;activityId:string;assetId:string;assetVersion:string;signal?:AbortSignal;guard?:()=>Promise<void>}){
    const actorId=Actor.parse(input.actorId),activityId=Id.parse(input.activityId),assetId=Id.parse(input.assetId),assetVersion=Id.parse(input.assetVersion);
    return withProofDeadline(async signal=>{
      const permit=async()=>{live(signal);if(await this.authority.mayErase({actorId,activityId,assetId,now:Iso.parse(this.now()),signal})!==true)throw new RecognitionAssetDenied();live(signal);};
      await permit();await input.guard?.();live(signal);return this.transaction(actorId,signal,async c=>{
        const r=await c.query('SELECT public.api_self_erase_recognition_asset($1,$2,$3,$4) AS erased',[actorId,activityId,assetId,assetVersion]);
        if(r.rows.length!==1||r.rows[0]?.erased!==true)throw new RecognitionAssetConflict();await permit();await input.guard?.();live(signal);
        return {state:'ERASURE_PENDING' as const,assetId,assetVersion,originalErased:true as const};
      });
    },5000,input.signal);
  }
}
