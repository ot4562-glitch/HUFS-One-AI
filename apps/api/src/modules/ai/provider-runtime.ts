import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {SafeLlmPacketSchema,AiTaskSchema} from '@hufs-one/contracts';
import type {AiTask} from '@hufs-one/contracts';
import {buildHcxRequest,buildOcrRequest,parseHcxResponse,parseOcrResponse,validateHcxCandidate} from '../../../../../packages/ai/src/clova-wire.js';
import {decodeRasterInWorker} from '../../../../../packages/ai/src/raster-worker.js';
import {normalizeOcrEvidence} from '../../../../../packages/ai/src/ocr-evidence.js';
import type {PostgresAiBudgetLedger} from './budget-postgres.js';
import type {VerifiedActor} from '../../types.js';
import {authorizeSession} from '../auth/gates.js';
import type {PostgresProviderResults,ProviderStoredResult} from './provider-results-postgres.js';

const Ref=z.string().regex(/^[A-Za-z0-9_.:@-]{1,128}$/),Hash=z.string().regex(/^[a-f0-9]{64}$/),Iso=z.iso.datetime({offset:true});
const Operation=z.enum(['OCR_GENERAL','HCX_005','HCX_007']);
const Media=z.strictObject({bytes:z.instanceof(Uint8Array),sourceRevisionId:Ref,assetId:Ref,originalSha256:Hash});
const Snapshot=z.strictObject({actorId:Ref,sessionIdHash:Ref,inputRef:Ref,operation:Operation,asOf:Iso,
  epoch:Ref,grantVersion:Ref,consentVersion:Ref,policyVersion:Ref,approvedBy:Ref,approvedAt:Iso,expiresAt:Iso,
  sources:z.array(z.strictObject({sourceId:Ref,revisionId:Ref,permissionRef:Ref,originalSha256:Hash})).min(1).max(20),
  packet:SafeLlmPacketSchema.optional(),media:Media.optional()});
export type ProviderSnapshot=z.infer<typeof Snapshot>;
const Amount=z.number().int().nonnegative().max(1_000_000_000);
const Policy=z.strictObject({version:Ref,approvedBy:Ref,approvedAt:Iso,expiresAt:Iso,inputUnitsPerToken:Amount,
  outputUnitsPerToken:Amount,tokenizerUnits:Amount,ocrImageUnits:Amount,
  maxInputTokens:z.number().int().min(1).max(3500),maxOutputTokens:z.number().int().min(1).max(1600),
  framingTokens:z.number().int().min(0).max(128)});
export interface ProviderRequest {
  actor:VerifiedActor;inputRef:string;operation:z.infer<typeof Operation>;asOf:string;phaseId:string;idempotencyKey:string;signal?:AbortSignal;
  task?:AiTask;
}
export interface ProviderPost {
  stage:'TOKENIZE'|'INFER';operation:z.infer<typeof Operation>;requestId:string;body:string;signal:AbortSignal;
  /** Trusted transport must call after DNS/secret awaits, immediately before socket write. */
  beforeSend:()=>Promise<void>;
}
export interface ProviderRuntimeOptions {
  enabled:()=>boolean;liveApproved:()=>boolean;
  authority:{read(input:ProviderRequest&{now:string}):Promise<ProviderSnapshot|null>};
  ledger:Pick<PostgresAiBudgetLedger,'reserve'|'transition'>;
  transport:{post(input:ProviderPost):Promise<Response>};
  policy:z.infer<typeof Policy>;now?:()=>string;timeoutMs?:number;
  decodeRaster?:typeof decodeRasterInWorker;
  maxConcurrent?:number;maxQueued?:number;
  results?:Pick<PostgresProviderResults,'put'|'get'>;
}
export interface ProviderOutcome {
  state:'UNAVAILABLE'|'PENDING'|'NEEDS_REVIEW';jobId?:string;
  billing:'NONE'|'RESERVED'|'DISPATCHED'|'RELEASED'|'SETTLED'|'UNKNOWN_BILLING'|'UNCONFIRMED';candidate?:unknown;
  provenance?:'LIVE'|'CANDIDATE_CACHE';
}
const sha=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const unavailable=(billing:ProviderOutcome['billing']='NONE',jobId?:string):ProviderOutcome=>({state:'UNAVAILABLE',billing,...(jobId?{jobId}:{})});
const countInt=(n:unknown)=>z.number().int().nonnegative().max(128000).parse(n);
/** Count exact model messages/schema; reject mismatched echoes or unrequested tools. */
function tokenCount(raw:any,body:Record<string,any>,framing:number):number {
  if(raw?.status?.code!=='20000'||!Array.isArray(raw.result?.messages)||raw.result.messages.length!==body.messages.length)throw Error();
  let total=framing;
  for(let i=0;i<body.messages.length;i++){
    const expected=body.messages[i],actual=raw.result.messages[i];if(actual?.role!==expected.role)throw Error();
    const inputs=typeof expected.content==='string'?[{type:'text',text:expected.content}]:expected.content;
    const outputs=Array.isArray(actual.content)?actual.content:[actual.content];
    if(!Array.isArray(inputs)||inputs.length!==outputs.length)throw Error();
    inputs.forEach((part:any,j:number)=>{
      const out=outputs[j];if(out?.type!==part.type)throw Error();
      if(part.type==='text'?(out.text!==part.text):(out.dataUri?.data!==part.dataUri?.data))throw Error();
      total+=countInt(out.count);
    });
  }
  if(raw.result.tools&&countInt(raw.result.tools.count)!==0)throw Error();
  if(body.responseFormat){const n=countInt(raw.result.responseFormat?.count);if(n===0)throw Error();total+=n;}
  else if(raw.result.responseFormat&&countInt(raw.result.responseFormat.count)!==0)throw Error();
  if(!Number.isSafeInteger(total)||total<=0||total>128000)throw Error();return total;
}
async function json(response:Response,signal:AbortSignal):Promise<{raw:any;hash:string}> {
  if(response.status!==200||response.redirected||!response.body)throw Error();
  const length=response.headers.get('content-length');
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)>2*1024*1024))throw Error();
  const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0,complete=false;
  try{while(true){if(signal.aborted)throw Error();const r=await reader.read();if(r.done){complete=true;break;}
    size+=r.value.byteLength;if(size>2*1024*1024)throw Error();parts.push(r.value);}
  }finally{if(!complete)await reader.cancel().catch(()=>{});reader.releaseLock();}
  const bytes=Buffer.concat(parts);return {raw:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),hash:sha(bytes)};
}
function bill(units:bigint):number {
  if(units<0n||units>BigInt(Number.MAX_SAFE_INTEGER))throw Error();return Number(units);
}

/** Explicitly constructed server service. No IO by import; no browser-trusted payload/price.
 * A job covers at most one approved tokenizer helper plus one inference, never automatic retries. */
export function createProviderExecutor(options:ProviderRuntimeOptions){
  const policy=Policy.parse(options.policy),clock=options.now??(()=>new Date().toISOString());
  const timeoutMs=z.number().int().min(1).max(20000).parse(options.timeoutMs??20000);
  const maxConcurrent=z.number().int().min(1).max(20).parse(options.maxConcurrent??1);
  const maxQueued=z.number().int().min(0).max(16).parse(options.maxQueued??16);
  const pending=new Map<string,{fingerprint:string;expires:number;promise:Promise<ProviderOutcome>}>();
  let active=0;
  const waiting:Array<{grant:()=>void;cancel:()=>void;signal:AbortSignal}>=[];
  const acquire=(signal:AbortSignal):Promise<()=>void>=>new Promise((resolve,reject)=>{
    if(signal.aborted){reject(Error());return;}
    let released=false;
    const release=()=>{if(released)return;released=true;active--;
      while(waiting.length){const next=waiting.shift()!;next.signal.removeEventListener('abort',next.cancel);
        if(next.signal.aborted){next.cancel();continue;}next.grant();break;}};
    const grant=()=>{active++;resolve(release);};
    if(active<maxConcurrent){grant();return;}
    if(waiting.length>=maxQueued){reject(Error());return;}
    const item={grant,cancel:()=>{const at=waiting.indexOf(item);if(at>=0)waiting.splice(at,1);reject(Error());},signal};
    waiting.push(item);signal.addEventListener('abort',item.cancel,{once:true});
  });
  const abortable=async<T>(operation:Promise<T>,signal:AbortSignal):Promise<T>=>{
    if(signal.aborted)throw Error();let abort!:()=>void;
    const stop=new Promise<never>((_resolve,reject)=>{abort=()=>reject(Error());signal.addEventListener('abort',abort,{once:true});});
    try{return await Promise.race([operation,stop]);}finally{signal.removeEventListener('abort',abort);}
  };
  const open=()=>{
    const now=Date.parse(clock());if(!Number.isFinite(now)||options.enabled()!==true||options.liveApproved()!==true
      ||Date.parse(policy.approvedAt)>now||Date.parse(policy.expiresAt)<=now)throw Error();return now;
  };
  const validate=async(req:ProviderRequest):Promise<ProviderSnapshot>=>{
    const at=open();if(req.actor.role!=='BETA')throw Error();authorizeSession(req.actor,new Date(at).toISOString());
    Ref.parse(req.inputRef);Ref.parse(req.phaseId);Ref.parse(req.idempotencyKey);Operation.parse(req.operation);Iso.parse(req.asOf);
    if(Date.parse(req.asOf)>at||req.signal?.aborted)throw Error();
    const value=Snapshot.parse(await options.authority.read({...req,now:new Date(at).toISOString()}));
    const after=open();authorizeSession(req.actor,new Date(after).toISOString());
    if(value.actorId!==req.actor.actorId||value.sessionIdHash!==req.actor.sessionIdHash||value.inputRef!==req.inputRef
      ||value.operation!==req.operation||value.asOf!==req.asOf||value.approvedBy===value.actorId
      ||Date.parse(value.approvedAt)>Math.min(after,Date.parse(req.asOf))||Date.parse(value.expiresAt)<=after)throw Error();
    if((req.operation==='OCR_GENERAL')!==!value.packet||(req.operation!=='HCX_007')!==Boolean(value.media))throw Error();
    if(req.task!==undefined&&(!AiTaskSchema.safeParse(req.task).success||value.packet?.task!==req.task))throw Error();
    if(value.media&&(!value.sources.some(s=>s.revisionId===value.media!.sourceRevisionId&&s.originalSha256===value.media!.originalSha256)
      ||value.media.bytes.byteLength>5*1024*1024))throw Error();
    return value;
  };
  const identity=(v:ProviderSnapshot)=>JSON.stringify({...v,media:v.media?{...v.media,bytes:undefined}:undefined});
  const fingerprint=(v:ProviderSnapshot)=>sha('clova-wire-runtime-v1\0'+identity(v)+JSON.stringify(policy));
  const cached=async(req:ProviderRequest,jobId:string,snapshot:ProviderSnapshot):Promise<ProviderOutcome>=>{
    if(!options.results)return unavailable('SETTLED',jobId);
    const record=await options.results.get(req.actor.actorId,req.actor.sessionIdHash,jobId);
    if(!record||record.requestSha256!==fingerprint(snapshot)||record.inputEpoch!==snapshot.epoch
      ||record.inputRef!==req.inputRef||record.operation!==req.operation||record.asOf!==req.asOf
      ||record.phaseId!==req.phaseId||record.idempotencyKey!==req.idempotencyKey||Date.parse(record.expiresAt)<=open())throw Error();
    const current=await validate(req);if(identity(current)!==identity(snapshot))throw Error();
    if(!record.candidate||typeof record.candidate!=='object'||req.operation==='OCR_GENERAL')return unavailable('SETTLED',jobId);
    const {reviewState,usage,...model}=record.candidate as Record<string,unknown>;
    if(reviewState!=='NEEDS_REVIEW')throw Error();validateHcxCandidate(snapshot.packet,model);
    return {state:'NEEDS_REVIEW',billing:'SETTLED',jobId,candidate:structuredClone(record.candidate),provenance:'CANDIDATE_CACHE'};
  };
  async function work(req:ProviderRequest,start:ProviderSnapshot,requestFingerprint:string):Promise<ProviderOutcome>{
    const controller=new AbortController(),cancel=()=>controller.abort();req.signal?.addEventListener('abort',cancel,{once:true});
    const timer=setTimeout(cancel,timeoutMs);if(req.signal?.aborted)cancel();
    let jobId:string|undefined,reserved=false,dispatched=false,settled=false,release:(()=>void)|undefined;
    const bound=async<T>(operation:Promise<T>):Promise<T>=>{
      if(controller.signal.aborted)throw Error();
      let abort!:()=>void;
      const stop=new Promise<never>((_resolve,reject)=>{abort=()=>reject(Error());controller.signal.addEventListener('abort',abort,{once:true});});
      try{return await Promise.race([operation,stop]);}finally{controller.signal.removeEventListener('abort',abort);}
    };
    const fresh=async()=>{const current=await bound(validate(req));if(identity(current)!==identity(start)||controller.signal.aborted)throw Error();};
    const transition=async(action:'DISPATCHED'|'UNKNOWN_BILLING'|'RELEASED'|'SETTLED',actualUnits?:number,receiptSha256?:string)=>{
      const id={phaseId:req.phaseId,jobId:jobId!,requestSha256:requestFingerprint};
      return action==='SETTLED'?options.ledger.transition(req.actor.actorId,{...id,action,actualUnits:actualUnits!,receiptSha256:receiptSha256!})
        :options.ledger.transition(req.actor.actorId,{...id,action});
    };
    const settle=async(actual:number,receipt:string)=>{await transition('SETTLED',actual,receipt);settled=true;};
    try{
      release=await acquire(controller.signal);await fresh();
      const media=start.media?await bound((options.decodeRaster??decodeRasterInWorker)(start.media.bytes,start.media,
        {signal:controller.signal,timeoutMs:Math.min(timeoutMs,5000)})):undefined;
      const outputLimit=Math.min(policy.maxOutputTokens,start.packet?.task==='opportunity_terms'?1600:start.packet?.task==='experience_skills'?800:600);
      const wire=req.operation==='OCR_GENERAL'?buildOcrRequest(media!,randomUUID(),open()):buildHcxRequest({packet:start.packet!,
        model:req.operation==='HCX_007'?'HCX-007':'HCX-005',maxOutputTokens:outputLimit,...(media?{media}:{})});
      const body=JSON.stringify(wire.body);if(Buffer.byteLength(body)>8*1024*1024)throw Error();
      const cost=req.operation==='OCR_GENERAL'?BigInt(policy.ocrImageUnits):BigInt(policy.tokenizerUnits)
        +BigInt(policy.maxInputTokens)*BigInt(policy.inputUnitsPerToken)+BigInt(outputLimit)*BigInt(policy.outputUnitsPerToken);
      const worst=bill(cost);if(worst<=0||worst>1_000_000_000_000)throw Error();
      const row=await bound(options.ledger.reserve(req.actor.actorId,{phaseId:req.phaseId,task:req.operation,
        idempotencyKey:req.idempotencyKey,requestSha256:requestFingerprint,worstCaseUnits:worst}));
      jobId=row.jobId;reserved=row.changed;
      if(!row.changed){
        if(row.state==='SETTLED')return await bound(cached(req,jobId,start));
        if(row.state==='RELEASED'||row.state==='UNKNOWN_BILLING')return unavailable(row.state,jobId);
        return {state:'PENDING',jobId,billing:row.state};
      }
      await fresh();
      const claim=await bound(transition('DISPATCHED'));if(!claim.changed)return {state:'PENDING',jobId,billing:claim.state};
      dispatched=true;
      const receipts:string[]=[];
      const send=async(stage:ProviderPost['stage'],payload:string)=>{
        await fresh();const response=await bound(options.transport.post({stage,operation:req.operation,requestId:randomUUID(),body:payload,
          signal:controller.signal,beforeSend:fresh}));
        const result=await bound(json(response,controller.signal));receipts.push(result.hash);return result.raw;
      };
      if(req.operation!=='OCR_GENERAL'){
        const full=wire.body as Record<string,any>;
        const tokenizerBody={messages:full.messages,...(full.responseFormat?{responseFormat:full.responseFormat}:{})};
        const counted=tokenCount(await send('TOKENIZE',JSON.stringify(tokenizerBody)),tokenizerBody,policy.framingTokens);
        if(counted>policy.maxInputTokens){await settle(policy.tokenizerUnits,sha(receipts.join(':')));return unavailable('SETTLED',jobId);}
        try{await fresh();}catch{await settle(policy.tokenizerUnits,sha(receipts.join(':')));return unavailable('SETTLED',jobId);}
      }
      const raw=await send('INFER',body);let candidate:unknown;
      if(req.operation==='OCR_GENERAL'){
        const response=raw as any;
        if(response?.version!=='V2'||response.requestId!==(wire.body as any).requestId
          ||!Array.isArray(response.images)||response.images.length!==1||response.images[0]?.name!=='image'
          ||response.images[0]?.inferResult!=='SUCCESS')throw Error();
        await settle(policy.ocrImageUnits,sha(receipts.join(':')));
        candidate=normalizeOcrEvidence(media!,parseOcrResponse(wire.context as ReturnType<typeof buildOcrRequest>['context'],raw));
      }else{
        const usage=z.object({promptTokens:z.number().int().positive().max(128000),completionTokens:z.number().int().positive().max(32768),
          totalTokens:z.number().int().positive().max(160768)}).parse(raw?.result?.usage);
        if(raw?.status?.code!=='20000'||usage.totalTokens!==usage.promptTokens+usage.completionTokens)throw Error();
        await settle(bill(BigInt(policy.tokenizerUnits)+BigInt(usage.promptTokens)*BigInt(policy.inputUnitsPerToken)
          +BigInt(usage.completionTokens)*BigInt(policy.outputUnitsPerToken)),sha(receipts.join(':')));
        if(usage.promptTokens>policy.maxInputTokens||usage.completionTokens>outputLimit)return unavailable('SETTLED',jobId);
        candidate=parseHcxResponse(wire.context as ReturnType<typeof buildHcxRequest>['context'],raw);
      }
      await fresh();
      if(options.results){await options.results.put({jobId,actorId:req.actor.actorId,sessionIdHash:req.actor.sessionIdHash,inputRef:req.inputRef,
        operation:req.operation,asOf:req.asOf,phaseId:req.phaseId,idempotencyKey:req.idempotencyKey,requestSha256:requestFingerprint,
        inputEpoch:start.epoch,expiresAt:new Date(Math.min(Date.parse(start.expiresAt),open()+29*60*1000)).toISOString(),candidate});await fresh();}
      return {state:'NEEDS_REVIEW',jobId,billing:'SETTLED',candidate,provenance:'LIVE'};
    }catch{
      if(settled)return unavailable('SETTLED',jobId);
      if(jobId&&reserved){
        try{await transition(dispatched?'UNKNOWN_BILLING':'RELEASED');return unavailable(dispatched?'UNKNOWN_BILLING':'RELEASED',jobId);}
        catch{return unavailable('UNCONFIRMED',jobId);}
      }
      return unavailable();
    }finally{release?.();clearTimeout(timer);req.signal?.removeEventListener('abort',cancel);controller.abort();}
  }
  return {async execute(input:ProviderRequest):Promise<ProviderOutcome>{
    const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,timeoutMs);
    input.signal?.addEventListener('abort',abort,{once:true});if(input.signal?.aborted)abort();
    try{
      // Freeze server identity/options across every asynchronous boundary; signal remains live.
      const req:ProviderRequest={...input,actor:structuredClone(input.actor),signal:controller.signal};
      const start=await abortable(validate(req),controller.signal),at=open();
      for(const [key,value] of pending)if(value.expires<=at)pending.delete(key);
      const requestFingerprint=fingerprint(start);
      const key=[req.actor.actorId,req.actor.sessionIdHash,req.phaseId,req.operation,req.idempotencyKey].join('\0');
      const existing=pending.get(key);
      if(existing){if(existing.fingerprint!==requestFingerprint)return unavailable();const outcome=await abortable(existing.promise,controller.signal);
        if(identity(await abortable(validate(req),controller.signal))!==identity(start))return unavailable();
        return outcome.state==='NEEDS_REVIEW'?{...outcome,provenance:'CANDIDATE_CACHE'}:outcome;}
      if(pending.size>=200)return unavailable();
      const promise=work(req,start,requestFingerprint);pending.set(key,{fingerprint:requestFingerprint,expires:Date.parse(start.expiresAt),promise});
      return await promise;
    }catch{return unavailable();}
    finally{clearTimeout(timer);input.signal?.removeEventListener('abort',abort);controller.abort();}
  },async readJob(actor:VerifiedActor,jobId:string):Promise<ProviderOutcome|null>{
    try{
      open();if(actor.role!=='BETA'||!options.results)return null;authorizeSession(actor,clock());z.uuid().parse(jobId);
      const record=await options.results.get(actor.actorId,actor.sessionIdHash,jobId);if(!record)return null;
      const req:ProviderRequest={actor:structuredClone(actor),inputRef:record.inputRef,operation:record.operation,asOf:record.asOf,
        phaseId:record.phaseId,idempotencyKey:record.idempotencyKey};
      const snapshot=await validate(req),result=await cached(req,jobId,snapshot);return result.state==='NEEDS_REVIEW'?result:null;
    }catch{return null;}
  }};
}
