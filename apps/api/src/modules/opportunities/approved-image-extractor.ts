import {createHash} from 'node:crypto';
import {z} from 'zod';
import {decodeRasterInWorker} from '../../../../../packages/ai/src/raster-worker.js';
import type {ClovaRaster} from '../../../../../packages/ai/src/clova-wire.js';
import type {normalizeOcrEvidence} from '../../../../../packages/ai/src/ocr-evidence.js';
import {parseSourceImageEvidence,type SourceImageEvidence} from './source-image-evidence.js';

const Ref=z.string().regex(/^[A-Za-z0-9_.:@-]{1,128}$/);
const Token=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const Sha=z.string().regex(/^[a-f0-9]{64}$/),Time=z.iso.datetime({offset:true});
const Identity=z.strictObject({actorRef:Ref,sourceId:Token,sourceRevisionId:Token,
  permissionRef:Token,assetId:Token,originalSha256:Sha,canonicalUrl:z.string().url()});
const Receipt=Identity.omit({assetId:true}).extend({
  receiptId:Token,purpose:z.enum(['TRANSFORM','EXTERNAL_AI']),policyVersion:Token,
  reviewedBy:Ref,reviewedAt:Time,startsAt:Time,expiresAt:Time,revokedAt:z.null(),
}).strict();
type ImageIdentity=z.infer<typeof Identity>;
export type ImageProcessingReceipt=z.infer<typeof Receipt>;
export interface ImageProcessingAuthority {
  /** Private independently reviewed registry, keyed by exact source/revision/hash.
   * Neither the source policy flag nor a browser claim grants image processing. */
  authorize(input:Omit<ImageIdentity,'assetId'>&{
    purpose:'TRANSFORM'|'EXTERNAL_AI';now:string;
  }):Promise<ImageProcessingReceipt|null>;
}
export interface ApprovedSourceImageOcr {
  /** Inject an already guarded/budgeted OCR operation, never a raw HTTP client.
   * The operation owns its billing/UNKNOWN_BILLING state, must honor cancellation
   * and revalidate immediately before any actual external send after its waits.
   * The ordinary provider user authority cannot bootstrap an unreviewed source.
   * No live implementation or default provider is installed by this module. */
  readCandidate(input:{media:ClovaRaster;signal:AbortSignal;
    revalidate:()=>Promise<void>}):Promise<ReturnType<typeof normalizeOcrEvidence>>;
}
export interface SourceImageExtractorInput extends ImageIdentity {
  content:Uint8Array;contentType:string;signal?:AbortSignal;
  /** Current COLLECT/STORE/EXTERNAL_TRANSFER grant bound by the durable executor. */
  assertSourceRights:()=>Promise<void>;
}
export interface SourceImageExtractor {
  extract(input:SourceImageExtractorInput):Promise<{
    evidence:SourceImageEvidence;revalidate:()=>Promise<void>;
  }>;
}
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function denied():never {throw new Error('Approved image extraction unavailable');}

/** Network-free, default-OFF factory. PNG/JPEG identity transforms only.
 * PDF needs a separately reviewed renderer and page/transform contract. */
export function createApprovedImageExtractor(options:{
  authority:ImageProcessingAuthority;ocr?:ApprovedSourceImageOcr;
  enabled?:boolean;now?:()=>string;timeoutMs?:number;
  decode?:typeof decodeRasterInWorker;
}):SourceImageExtractor {
  const now=options.now??(()=>new Date().toISOString()),decode=options.decode??decodeRasterInWorker;
  const enabled=options.enabled === true,ocr=options.ocr,authority=options.authority;
  const timeout=options.timeoutMs??20_000;
  return {async extract(input){
    try{
      if(!enabled||!ocr||!authority||!Number.isInteger(timeout)||timeout<1||timeout>20_000
        ||!['image/png','image/jpeg'].includes(input.contentType)
        ||!(input.content instanceof Uint8Array)||!input.content.byteLength
        ||input.content.byteLength>256*1024||typeof input.assertSourceRights !== 'function')denied();
      const identity=Identity.parse({actorRef:input.actorRef,sourceId:input.sourceId,
        sourceRevisionId:input.sourceRevisionId,permissionRef:input.permissionRef,assetId:input.assetId,
        originalSha256:input.originalSha256,canonicalUrl:input.canonicalUrl});
      const url=new URL(identity.canonicalUrl);
      if(url.protocol !== 'https:'||url.href !== identity.canonicalUrl||url.username||url.password||url.hash||url.port)denied();
      const content=Buffer.from(input.content),contentType=input.contentType;
      if(createHash('sha256').update(content).digest('hex') !== identity.originalSha256)denied();
      const signal=AbortSignal.any([AbortSignal.timeout(timeout),...(input.signal?[input.signal]:[])]);
      const sourceRights=input.assertSourceRights;
      async function bounded<T>(run:()=>Promise<T>):Promise<T>{
        if(signal.aborted)denied();
        let abort!:()=>void;
        const stopped=new Promise<never>((_resolve,reject)=>{
          abort=()=>reject(new Error('Approved image extraction unavailable'));
          signal.addEventListener('abort',abort,{once:true});
        });
        const operation=Promise.resolve().then(()=>{if(signal.aborted)denied();return run();});
        try{
          const value=await Promise.race([operation,stopped]);
          if(signal.aborted)denied();
          return value;
        }finally{signal.removeEventListener('abort',abort);}
      }
      const baseline=new Map<'TRANSFORM'|'EXTERNAL_AI',string>();
      async function authorize(purpose:'TRANSFORM'|'EXTERNAL_AI'){
        const at=Time.parse(now()),{assetId:_assetId,...binding}=identity;
        const raw=await bounded(()=>authority.authorize({...binding,purpose,now:at}));
        const receipt=Receipt.parse(raw),after=Time.parse(now());
        for(const key of Object.keys(binding) as Array<keyof typeof binding>)
          if(receipt[key] !== binding[key])denied();
        if(receipt.purpose !== purpose||receipt.reviewedBy === identity.actorRef
          ||Date.parse(receipt.reviewedAt)>Date.parse(receipt.startsAt)
          ||Date.parse(receipt.startsAt)>Math.min(Date.parse(at),Date.parse(after))
          ||Date.parse(receipt.expiresAt)<=Math.max(Date.parse(at),Date.parse(after)))denied();
        const fingerprint=hash(receipt),previous=baseline.get(purpose);
        if(previous!==undefined&&previous !== fingerprint)denied();
        baseline.set(purpose,fingerprint);
        return receipt;
      }
      const revalidate=async()=>{
        try{
          await bounded(sourceRights);
          await authorize('TRANSFORM');await authorize('EXTERNAL_AI');
          await bounded(sourceRights);
        }catch{denied();}
      };
      await bounded(sourceRights);const transform=await authorize('TRANSFORM');
      await bounded(sourceRights);
      const media=structuredClone(await bounded(()=>decode(content,{sourceRevisionId:identity.sourceRevisionId,
        assetId:identity.assetId,originalSha256:identity.originalSha256},{signal,timeoutMs:5000})));
      if(media.sourceRevisionId !== identity.sourceRevisionId||media.assetId !== identity.assetId
        ||media.originalSha256 !== identity.originalSha256||media.transformVersion !== 'raster-identity-v1'
        ||(contentType === 'image/png'?media.format !== 'png':media.format !== 'jpeg')
        ||!Number.isInteger(media.width)||!Number.isInteger(media.height)
        ||media.width<1||media.height<1||media.width>2240||media.height>2240||media.width*media.height>4_000_000
        ||!(media.bytes instanceof Uint8Array)
        ||createHash('sha256').update(media.bytes).digest('hex') !== identity.originalSha256)denied();
      const external=await authorize('EXTERNAL_AI');
      await revalidate();
      // Keep our own bytes/metadata: a trusted dependency may still retain/mutate
      // caller objects after it has returned an asynchronous candidate.
      const candidate=structuredClone(await bounded(()=>ocr.readCandidate({
        media:{...media,bytes:Buffer.from(media.bytes)},signal,revalidate,
      })));
      await revalidate();
      const parsed=parseSourceImageEvidence({
        version:'source-image-v1',sourceId:identity.sourceId,sourceRevisionId:identity.sourceRevisionId,
        permissionRef:identity.permissionRef,assetId:media.assetId,originalSha256:identity.originalSha256,
        rasterSha256:identity.originalSha256,format:media.format,width:media.width,height:media.height,
        transformVersion:media.transformVersion,reviewState:candidate.reviewState,
        transformReceiptId:transform.receiptId,externalAiReceiptId:external.receiptId,
        processingPolicyVersion:'media-'+hash([...baseline]),ocrFields:candidate.fields,
      },{sourceId:identity.sourceId,revisionId:identity.sourceRevisionId,
        permissionRef:identity.permissionRef,originalSha256:identity.originalSha256});
      return {evidence:parsed.evidence,revalidate};
    }catch{denied();}
  }};
}
