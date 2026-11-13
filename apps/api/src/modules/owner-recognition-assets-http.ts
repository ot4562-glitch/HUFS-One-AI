import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import {FeatureAdditions as V} from '@hufs-one/contracts';
import {betaActor,betaRecheck,type BetaRouteVerifier} from './profiles/self-account-http.js';
import {ApiFailure} from './auth/gates.js';
import {withProofDeadline,ProofCleanupDenied} from './profiles/recognition-cleanup-postgres.js';
import {RecognitionAssetGrantSchema,RecognitionAssetDenied,RecognitionAssetConflict,RecognitionAssetQuota,
  type PostgresRecognitionPrivateAssets} from './profiles/recognition-private-assets-postgres.js';
import type {OwnerInsightsServices} from './owner-v2-insights-http.js';
export type RecognitionAssetsPort=Pick<PostgresRecognitionPrivateAssets,'policy'|'list'|'intake'|'erase'|'contextVersion'>;
export function validateRecognitionAssetsPort(value:RecognitionAssetsPort){
  if(!value||['policy','list','intake','erase','contextVersion'].some(k=>typeof value[k as keyof RecognitionAssetsPort]!=='function'))
    throw new Error('Recognition originals require policy, intake, metadata and erasure');
}
const Ref=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/).refine(v=>v!=='.'&&v!=='..'),Empty=z.strictObject({});
async function mapped<T>(fn:()=>Promise<T>){try{return await fn();}catch(error){
  if(error instanceof ApiFailure)throw error;
  if(error instanceof RecognitionAssetDenied||error instanceof ProofCleanupDenied)throw new ApiFailure('FORBIDDEN');
  if(error instanceof RecognitionAssetConflict)throw new ApiFailure('VERSION_CONFLICT');
  if(error instanceof RecognitionAssetQuota)throw new ApiFailure('RATE_LIMITED');
  throw new ApiFailure('PROVIDER_UNAVAILABLE');
}}
export function registerRecognitionAssetRoutes(options:{app:FastifyInstance;session:BetaRouteVerifier;services:OwnerInsightsServices|undefined}){
  const {app,session,services}=options;
  const headers=(reply:import('fastify').FastifyReply)=>{reply.header('Cache-Control','no-store').header('Pragma','no-cache').header('X-Content-Type-Options','nosniff');};
  const page=(receiptRaw:unknown,actorId:string,activityId:string,asOf:string)=>{
    const receipt=RecognitionAssetGrantSchema.parse(receiptRaw);
    if(receipt.actorId!==actorId||receipt.activityId!==activityId)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    if(Date.parse(receipt.expiresAt)<=Date.parse(session.now()))throw new ApiFailure('VERSION_CONFLICT');
    return {state:'READY' as const,activityId,asOf,expiresAt:receipt.expiresAt,
      contextVersion:services!.assets!.contextVersion(receipt),dataMode:'OWNER_CONSENTED' as const};
  };
  const readAsset=(action:'list'|'policy')=>async(req:import('fastify').FastifyRequest,reply:import('fastify').FastifyReply)=>{
      headers(reply);Empty.parse(req.query);const {activityId}=z.strictObject({activityId:Ref}).parse(req.params),actor=await betaActor(req,session);
      if(!services?.assets){await betaRecheck(req,session,actor);return {state:'NOT_CONNECTED' as const};}
      return mapped(()=>withProofDeadline(async signal=>{
        const guard=()=>betaRecheck(req,session,actor),asOf=session.now();await guard();
        if(await services.quota.consume({actorId:actor.actorId,kind:'RECOGNITION',now:asOf})!==true)throw new ApiFailure('RATE_LIMITED');await guard();
        const input={actorId:actor.actorId,activityId,signal,guard};
        if(action==='policy'){
          const result=await services.assets!.policy(input);await guard();
          return V.RecognitionAssetPolicyResponseSchema.parse({...page(result.receipt,actor.actorId,activityId,asOf),
            purpose:'PERSONAL_RECOGNITION_EVIDENCE',maxFileBytes:result.maxFileBytes,maxFilesPerActivity:result.maxFilesPerActivity,allowedMimeTypes:result.allowedMimeTypes});
        }
        const result=await services.assets!.list(input);await guard();
        return V.RecognitionAssetListResponseSchema.parse({...page(result.receipt,actor.actorId,activityId,asOf),items:result.items});
      },10000));
    };
  app.get('/api/owner/features/v2/recognition/:activityId/assets',readAsset('list'));
  app.get('/api/owner/features/v2/recognition/:activityId/assets/policy',readAsset('policy'));
  // Override only this authenticated route. All other APIs retain 64 KiB.
  app.post('/api/owner/features/v2/recognition/:activityId/assets',{bodyLimit:2_800_000},async(req,reply)=>{
    headers(reply);Empty.parse(req.query);const {activityId}=z.strictObject({activityId:Ref}).parse(req.params),input=V.RecognitionAssetIntakeSchema.parse(req.body);
    const actor=await betaActor(req,session);
    if(!services?.assets){await betaRecheck(req,session,actor);return {state:'NOT_CONNECTED' as const};}
    return mapped(()=>withProofDeadline(async signal=>{
      const guard=()=>betaRecheck(req,session,actor),asOf=session.now();await guard();
      if(await services.quota.consume({actorId:actor.actorId,kind:'RECOGNITION',now:asOf})!==true)throw new ApiFailure('RATE_LIMITED');await guard();
      const bytes=Buffer.from(input.fileBase64,'base64');
      if(bytes.length!==input.size||bytes.toString('base64')!==input.fileBase64||createHash('sha256').update(bytes).digest('hex')!==input.sha256)
        throw new ApiFailure('INVALID_INPUT');
      const item=await services.assets!.intake({actorId:actor.actorId,activityId,requestId:input.requestId,contextVersion:input.contextVersion,mimeType:input.mimeType,bytes,signal,guard});
      await guard();
      if(item.activityId!==activityId||item.sha256!==input.sha256||item.size!==input.size||item.mimeType!==input.mimeType)throw new ApiFailure('PROVIDER_UNAVAILABLE');
      // The commit may have completed even if this final policy/session read
      // fails. Return no private receipt and never replay a mutation automatically.
      const policy=await services.assets!.policy({actorId:actor.actorId,activityId,signal,guard});await guard();
      const current=page(policy.receipt,actor.actorId,activityId,asOf);
      if(current.contextVersion!==input.contextVersion)throw new ApiFailure('VERSION_CONFLICT');
      return V.RecognitionAssetIntakeResponseSchema.parse({...current,requestId:input.requestId,item});
    },10000));
  });
  app.post('/api/owner/features/v2/recognition/:activityId/assets/:assetId/erase',async(req,reply)=>{
    headers(reply);Empty.parse(req.query);const {activityId,assetId}=z.strictObject({activityId:Ref,assetId:V.RecognitionAssetIdSchema}).parse(req.params),input=V.RecognitionAssetEraseSchema.parse(req.body);
    const actor=await betaActor(req,session);if(!services?.assets){await betaRecheck(req,session,actor);return {state:'NOT_CONNECTED' as const};}
    return mapped(()=>withProofDeadline(async signal=>{
      const guard=()=>betaRecheck(req,session,actor);await guard();
      if(await services.quota.consume({actorId:actor.actorId,kind:'RECOGNITION',now:session.now()})!==true)throw new ApiFailure('RATE_LIMITED');await guard();
      const result=await services.assets!.erase({actorId:actor.actorId,activityId,assetId,assetVersion:input.assetVersion,signal,guard});await guard();
      if(result.state!=='ERASURE_PENDING'||result.assetId!==assetId||result.assetVersion!==input.assetVersion||result.originalErased!==true)throw new ApiFailure('PROVIDER_UNAVAILABLE');
      return V.RecognitionAssetEraseResponseSchema.parse({state:'READY',activityId,assetId,assetVersion:input.assetVersion,
        cleanupState:'PENDING',originalErased:true,allComponentsErased:false});
    },10000));
  });
}
