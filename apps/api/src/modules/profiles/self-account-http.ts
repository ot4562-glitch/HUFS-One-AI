import {z} from 'zod';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import {SelfConsentPutSchema,SelfProfilePatchSchema} from '@hufs-one/contracts';
import type {VerifySession,VerifiedTeamActor} from '../../types.js';
import {ApiFailure,authorizeSession} from '../auth/gates.js';
import type {SelfAccountPort} from './self-account-postgres.js';
import {SelfAccountConflict,SelfAccountDenied} from './self-account-postgres.js';

export interface BetaRouteVerifier{
  verify:VerifySession;now:()=>string;
}
export async function betaActor(request:FastifyRequest,
  provider:BetaRouteVerifier):Promise<VerifiedTeamActor>{
  let identity:Awaited<ReturnType<VerifySession>>;
  try{identity=await provider.verify(request);}
  catch{throw new ApiFailure('UNAUTHENTICATED');}
  const actor=authorizeSession(identity,provider.now());
  if(actor.role!=='BETA')throw new ApiFailure('FORBIDDEN');
  return actor;
}
export async function betaRecheck(request:FastifyRequest,
  provider:BetaRouteVerifier,original:VerifiedTeamActor):Promise<void>{
  const current=await betaActor(request,provider);
  if(current.actorId!==original.actorId
    ||current.sessionIdHash!==original.sessionIdHash
    ||current.role!==original.role
    ||current.schoolMailProofExpiresAt!==original.schoolMailProofExpiresAt)
    throw new ApiFailure('FORBIDDEN');
}
export async function safeOwnerStore<T>(fn:()=>Promise<T>):Promise<T>{
  try{return await fn();}
  catch(error){
    if(error instanceof SelfAccountDenied)throw new ApiFailure('FORBIDDEN');
    if(error instanceof SelfAccountConflict)throw new ApiFailure('VERSION_CONFLICT');
    if(error instanceof z.ZodError)throw error;
    throw new ApiFailure('PROVIDER_UNAVAILABLE');
  }
}
const Empty=z.strictObject({});
export function registerSelfAccountRoutes(
  app:FastifyInstance,store:SelfAccountPort,
  verifier:BetaRouteVerifier,
):void {
  app.get('/api/profile',async request=>{
    Empty.parse(request.query);
    const actor=await betaActor(request,verifier);
    const profile=await safeOwnerStore(()=>store.readProfile(actor.actorId));
    await betaRecheck(request,verifier,actor);
    return {profile};
  });
  app.patch('/api/profile',async request=>{
    Empty.parse(request.query);
    const actor=await betaActor(request,verifier);
    const input=SelfProfilePatchSchema.parse(request.body);
    const profile=await safeOwnerStore(()=>store.patchProfile(actor.actorId,input));
    await betaRecheck(request,verifier,actor);
    return {profile};
  });
  app.get('/api/consents',async request=>{
    Empty.parse(request.query);
    const actor=await betaActor(request,verifier);
    const consents=await safeOwnerStore(()=>store.readConsents(actor.actorId));
    await betaRecheck(request,verifier,actor);
    return {consents};
  });
  app.put('/api/consents',async request=>{
    Empty.parse(request.query);
    const actor=await betaActor(request,verifier);
    const input=SelfConsentPutSchema.parse(request.body);
    const consents=await safeOwnerStore(()=>store.putConsents(actor.actorId,input));
    await betaRecheck(request,verifier,actor);
    return {consents};
  });
}
