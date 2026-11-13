import {z} from 'zod';
const Ref=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/).refine(v=>v!=='.'&&v!=='..');
const Iso=z.iso.datetime({offset:true}),Hash=z.string().regex(/^[a-f0-9]{64}$/);
export const RecognitionAssetIdSchema=z.string().regex(/^asset-[a-f0-9]{64}$/);
export const RecognitionAssetMimeSchema=z.enum(['image/png','image/jpeg','application/pdf']);
export const RecognitionAssetRequestIdSchema=z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
export const RecognitionAssetMetadataSchema=z.strictObject({assetId:RecognitionAssetIdSchema,assetVersion:z.literal('original-v1'),
  proofId:z.string().regex(/^proof-[a-f0-9]{64}$/),activityId:Ref,mimeType:RecognitionAssetMimeSchema,
  size:z.number().int().min(1).max(2*1024*1024),sha256:Hash,recordedAt:Iso,
  provenance:z.literal('OWNER_UPLOADED_UNVERIFIED'),officiallyRecognized:z.literal(false),modelInputAllowed:z.literal(false)});
export type RecognitionAssetMetadata=z.infer<typeof RecognitionAssetMetadataSchema>;
export function recognitionAssetBase64Bytes(value:string):number{
  return value.length/4*3-(value.endsWith('==')?2:value.endsWith('=')?1:0);
}
const Base64=z.string().min(4).max(2_796_204).regex(/^[A-Za-z0-9+/]+={0,2}$/)
  .refine(value=>{
    if(value.length%4!==0)return false;
    const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    return value.endsWith('==')?alphabet.indexOf(value.at(-3)!)%16===0:value.endsWith('=')?alphabet.indexOf(value.at(-2)!)%4===0:true;
  });
export const RecognitionAssetIntakeSchema=z.strictObject({requestId:RecognitionAssetRequestIdSchema,contextVersion:Hash,
  mimeType:RecognitionAssetMimeSchema,size:z.number().int().min(1).max(2*1024*1024),sha256:Hash,fileBase64:Base64})
  .refine(v=>recognitionAssetBase64Bytes(v.fileBase64)===v.size);
export const RecognitionAssetEraseSchema=z.strictObject({assetVersion:z.literal('original-v1')});
const Disconnected=z.strictObject({state:z.literal('NOT_CONNECTED')});
const page={state:z.literal('READY'),activityId:Ref,asOf:Iso,expiresAt:Iso,contextVersion:Hash,dataMode:z.literal('OWNER_CONSENTED')};
const current=(v:{asOf:string;expiresAt:string})=>Date.parse(v.expiresAt)>Date.parse(v.asOf);
export const RecognitionAssetPolicyResponseSchema=z.discriminatedUnion('state',[Disconnected,
  z.strictObject({...page,purpose:z.literal('PERSONAL_RECOGNITION_EVIDENCE'),maxFileBytes:z.literal(2*1024*1024),maxFilesPerActivity:z.literal(10),
    allowedMimeTypes:z.array(RecognitionAssetMimeSchema).min(1).max(3).refine(v=>new Set(v).size===v.length)}).refine(current)]);
export const RecognitionAssetListResponseSchema=z.discriminatedUnion('state',[Disconnected,
  z.strictObject({...page,items:z.array(RecognitionAssetMetadataSchema).max(10)})
    .refine(v=>current(v)&&v.items.every(i=>i.activityId===v.activityId)&&new Set(v.items.map(i=>i.assetId)).size===v.items.length)]);
export const RecognitionAssetIntakeResponseSchema=z.discriminatedUnion('state',[Disconnected,
  z.strictObject({...page,requestId:RecognitionAssetRequestIdSchema,item:RecognitionAssetMetadataSchema})
    .refine(v=>current(v)&&v.item.activityId===v.activityId)]);
/** SQL original deletion is distinct from independently verified external cleanup. */
export const RecognitionAssetEraseResponseSchema=z.discriminatedUnion('state',[Disconnected,
  z.strictObject({state:z.literal('READY'),activityId:Ref,assetId:RecognitionAssetIdSchema,assetVersion:z.literal('original-v1'),
    cleanupState:z.literal('PENDING'),originalErased:z.literal(true),allComponentsErased:z.literal(false)})]);
