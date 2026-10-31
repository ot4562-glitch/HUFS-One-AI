import {z} from 'zod';
import type {FastifyRequest} from 'fastify';
import type {ApiErrorCode} from '@hufs-one/contracts';
import type {VerifiedActor} from '../../types.js';

const VerifiedActorSchema=z.strictObject({
  actorId:z.string().trim().min(1),sessionIdHash:z.string().min(8),
  sessionExpiresAt:z.iso.datetime({offset:true}),
  schoolMailProofExpiresAt:z.iso.datetime({offset:true}),
  betaAllowed:z.boolean(),role:z.enum(['BETA','ADMIN']),csrfToken:z.string().min(16),
});
export class ApiFailure extends Error {
  constructor(readonly code: ApiErrorCode, readonly contextId?:string) {
    super(code);
  }
}
export function authorizeSession(value:unknown,now:string):VerifiedActor {
  if(value===null || value===undefined)throw new ApiFailure('UNAUTHENTICATED');
  const actor=VerifiedActorSchema.safeParse(value);
  if(!actor.success)throw new ApiFailure('UNAUTHENTICATED');
  const at=Date.parse(now);
  if(!Number.isFinite(at)||Date.parse(actor.data.sessionExpiresAt)<=at)throw new ApiFailure('UNAUTHENTICATED');
  if(!actor.data.betaAllowed||Date.parse(actor.data.schoolMailProofExpiresAt)<=at)throw new ApiFailure('FORBIDDEN');
  return actor.data;
}

/** No cookie/header-derived identity is trusted; principal comes from the injected verifier. */
export function requireStateChangeProof(request:FastifyRequest,actor:VerifiedActor,allowedOrigin:string):void {
  const origin=request.headers.origin;
  if(!origin||origin!==allowedOrigin||request.headers['x-csrf-token']!==actor.csrfToken)
    throw new ApiFailure('FORBIDDEN');
  const fetchSite=request.headers['sec-fetch-site'];
  if(fetchSite && fetchSite!=='same-origin' && fetchSite!=='none')throw new ApiFailure('FORBIDDEN');
}
