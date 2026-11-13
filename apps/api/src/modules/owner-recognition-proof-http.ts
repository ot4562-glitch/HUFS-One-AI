import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import {FeatureAdditions as V} from '@hufs-one/contracts';
import {betaActor,betaRecheck,type BetaRouteVerifier} from './profiles/self-account-http.js';
import {WorkspaceConflict,WorkspaceDenied,WorkspaceQuota} from './profiles/self-workspace-postgres.js';
import {ProofCleanupDenied,withProofDeadline,drainProofCleanup} from './profiles/recognition-cleanup-postgres.js';
import {ProofReviewStale} from '../../../../packages/core/src/feature-additions/proof-review.js';
import {ApiFailure} from './auth/gates.js';
import {readRecognitionProofPage,extractRecognitionProof,confirmRecognitionProof,redactRecognitionProof,cleanupRecognitionProof,type ProofRequestContext} from './owner-recognition-proof-service.js';
import type {OwnerInsightsServices,OwnerInsightsSnapshot} from './owner-v2-insights-http.js';
const Id=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/),Empty=z.strictObject({});
async function mapped<T>(fn:()=>Promise<T>){try{return await fn();}catch(error){
  if(error instanceof ApiFailure)throw error;
  if(error instanceof WorkspaceConflict||error instanceof ProofReviewStale)throw new ApiFailure('VERSION_CONFLICT');
  if(error instanceof WorkspaceDenied||error instanceof ProofCleanupDenied)throw new ApiFailure('FORBIDDEN');
  if(error instanceof WorkspaceQuota)throw new ApiFailure('RATE_LIMITED');throw new ApiFailure('PROVIDER_UNAVAILABLE');
}}
export function registerRecognitionProofRoutes(options:{app:FastifyInstance;session:BetaRouteVerifier;services:OwnerInsightsServices|undefined;
  parse:(raw:unknown)=>OwnerInsightsSnapshot}){
  const {app,session,services}=options;
  app.get('/api/owner/features/v2/recognition/:activityId/proofs',async(req,reply)=>{
    reply.header('Cache-Control','no-store');const {activityId}=z.strictObject({activityId:Id}).parse(req.params);Empty.parse(req.query);
    const actor=await betaActor(req,session);if(!services?.proofReviews){await betaRecheck(req,session,actor);return {state:'NOT_CONNECTED' as const};}
    return mapped(()=>withProofDeadline(async signal=>{
      const guard=()=>betaRecheck(req,session,actor);await guard();
      if(await services.quota.consume({actorId:actor.actorId,kind:'RECOGNITION',now:session.now()})!==true)throw new ApiFailure('RATE_LIMITED');
      return readRecognitionProofPage({actorId:actor.actorId,activityId,asOf:session.now(),now:session.now,services,signal,guard,parse:options.parse});
    },10000));
  });
  for(const action of ['extract','confirm','redact','cleanup'] as const){
    app.post('/api/owner/features/v2/recognition/:activityId/proofs/:id/'+action,async(req,reply)=>{
      reply.header('Cache-Control','no-store');const {activityId,id}=z.strictObject({activityId:Id,id:Id}).parse(req.params);Empty.parse(req.query);
      const schema=action==='extract'?V.RecognitionProofExtractSchema:action==='confirm'?V.RecognitionProofConfirmSchema:
        action==='redact'?V.RecognitionProofRedactSchema:V.RecognitionProofCleanupSchema;
      schema.parse(req.body);
      const actor=await betaActor(req,session);if(!services?.proofReviews){await betaRecheck(req,session,actor);return {state:'NOT_CONNECTED' as const};}
      return mapped(()=>withProofDeadline(async signal=>{
        const guard=()=>betaRecheck(req,session,actor);await guard();
        if(await services.quota.consume({actorId:actor.actorId,kind:'RECOGNITION',now:session.now()})!==true)throw new ApiFailure('RATE_LIMITED');
        const input:ProofRequestContext={actorId:actor.actorId,activityId,asOf:session.now(),now:session.now,services,signal,guard,parse:options.parse};
        const result=action==='extract'?await extractRecognitionProof(input,id,V.RecognitionProofExtractSchema.parse(req.body))
          :action==='confirm'?await confirmRecognitionProof(input,id,V.RecognitionProofConfirmSchema.parse(req.body))
          :action==='redact'?await redactRecognitionProof(input,id,V.RecognitionProofRedactSchema.parse(req.body))
          :await cleanupRecognitionProof(input,id,V.RecognitionProofCleanupSchema.parse(req.body));
        return V.RecognitionProofMutationSchema.parse(result);
      },10000));
    });
  }
  // Works after personal-storage withdrawal: only metadata-only erasure authority is used.
  app.post('/api/owner/features/v2/recognition/cleanup',async(req,reply)=>{
    reply.header('Cache-Control','no-store');Empty.parse(req.body);Empty.parse(req.query);const actor=await betaActor(req,session);
    if(!services?.proofReviews){await betaRecheck(req,session,actor);return {state:'NOT_CONNECTED' as const};}
    return mapped(()=>withProofDeadline(async signal=>{
      if(await services.quota.consume({actorId:actor.actorId,kind:'RECOGNITION',now:session.now()})!==true)throw new ApiFailure('RATE_LIMITED');
      await betaRecheck(req,session,actor);const p=services.proofReviews!;
      const result=await drainProofCleanup({actorId:actor.actorId,outbox:p.cleanup,...(p.eraser?{eraser:p.eraser}:{}),now:session.now,limit:1,signal});
      await betaRecheck(req,session,actor);return V.RecognitionCleanupBatchSchema.parse(result.state==='NOT_CONNECTED'?{state:'NOT_CONNECTED'}:result);
    },10000));
  });
}
