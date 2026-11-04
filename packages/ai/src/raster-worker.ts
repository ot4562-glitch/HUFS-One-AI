import {createHash} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {z} from 'zod';
import type {ClovaRaster} from './clova-wire.js';

const MAX_BYTES=5*1024*1024;
const Token=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const Identity=z.strictObject({sourceRevisionId:Token,assetId:Token,originalSha256:z.string().regex(/^[a-f0-9]{64}$/)});
const Metadata=Identity.extend({format:z.enum(['png','jpeg']),width:z.number().int().min(1).max(2240),height:z.number().int().min(1).max(2240),
  transformVersion:z.literal('raster-identity-v1')}).refine(v=>v.width*v.height<=4_000_000);
const Reply=z.strictObject({ok:z.literal(true),metadata:Metadata});
type RasterIdentity=z.infer<typeof Identity>;
export interface RasterWorkerOptions {signal?:AbortSignal;timeoutMs?:number}
export class RasterWorkerError extends Error {
  constructor(){super('RASTER_WORKER_UNAVAILABLE');this.name='RasterWorkerError';}
}
// The checked-in helper imports only the built, fixed decoder path. No worker,
// model, subprocess, filesystem read or network activity occurs on module import.
const ENTRYPOINT=new URL(import.meta.url.endsWith('.ts')?'../../../infra/ai/raster-worker.mjs':'../../../../infra/ai/raster-worker.mjs',import.meta.url);

/** Server-only composition hook for trusted local helpers/test fixtures. Never
 * accept an entrypoint from HTTP, a provider response, environment or a dataset. */
export function createRasterWorkerDecoder(options:{entrypoint:URL}){
  const entrypoint=new URL(options.entrypoint.href);
  if(entrypoint.protocol!=='file:'||entrypoint.search||entrypoint.hash)throw new RasterWorkerError();
  return async function decode(bytes:Uint8Array,identity:RasterIdentity,options:RasterWorkerOptions={}):Promise<ClovaRaster>{
    let snapshot:Buffer,checkedIdentity:RasterIdentity,timeoutMs:number;
    try{
      if(options.signal?.aborted||!(bytes instanceof Uint8Array)||bytes.byteLength===0||bytes.byteLength>MAX_BYTES)throw Error();
      timeoutMs=z.number().int().min(1).max(20000).parse(options.timeoutMs??5000);
      // Pick only provenance fields: the executor may supply a wider media
      // object. No caller dimensions, format, path or transformation is trusted.
      checkedIdentity=Identity.parse({sourceRevisionId:identity.sourceRevisionId,assetId:identity.assetId,originalSha256:identity.originalSha256});
      snapshot=Buffer.from(bytes);
      if(createHash('sha256').update(snapshot).digest('hex')!==checkedIdentity.originalSha256)throw Error();
    }catch{throw new RasterWorkerError();}
    return new Promise<ClovaRaster>((resolve,reject)=>{
      if(options.signal?.aborted){reject(new RasterWorkerError());return;}
      let worker:Worker;
      try{worker=new Worker(entrypoint,{workerData:{bytes:snapshot,identity:checkedIdentity},env:{},execArgv:[],argv:[],
        stdout:true,stderr:true,trackUnmanagedFds:true,name:'hufs-approved-raster',
        // V8 limits are not an OS RSS cap; typed-array/zlib allocations are
        // separately bounded by raster.ts byte/pixel/inflation/decoder limits.
        resourceLimits:{maxOldGenerationSizeMb:128,maxYoungGenerationSizeMb:16,codeRangeSizeMb:16,stackSizeMb:4}});
      }catch{reject(new RasterWorkerError());return;}
      worker.stdout?.resume();worker.stderr?.resume();
      let settled=false;
      const finish=async(value?:ClovaRaster)=>{
        if(settled)return;settled=true;clearTimeout(timer);options.signal?.removeEventListener('abort',abort);
        // Resolve/reject only after termination: callers can safely account for
        // one active worker and cannot accidentally accumulate expired decoders.
        try{await worker.terminate();}catch{value=undefined;}
        worker.removeAllListeners();
        if(value&&!options.signal?.aborted)resolve(value);else reject(new RasterWorkerError());
      };
      const abort=()=>{void finish();};
      const timer=setTimeout(abort,timeoutMs);
      options.signal?.addEventListener('abort',abort,{once:true});
      worker.on('error',abort);
      worker.on('exit',()=>{if(!settled)void finish();});
      worker.on('message',(raw:unknown)=>{
        try{
          const m=Reply.parse(raw).metadata;
          const signature=snapshot.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png'
            :snapshot[0]===0xff&&snapshot[1]===0xd8?'jpeg':undefined;
          if(m.originalSha256!==checkedIdentity.originalSha256||m.sourceRevisionId!==checkedIdentity.sourceRevisionId
            ||m.assetId!==checkedIdentity.assetId||m.format!==signature)throw Error();
          void finish({...m,bytes:snapshot});
        }catch{void finish();}
      });
      if(options.signal?.aborted)abort();
    });
  };
}
export const decodeRasterInWorker=createRasterWorkerDecoder({entrypoint:ENTRYPOINT});
