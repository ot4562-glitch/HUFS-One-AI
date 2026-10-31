import {z} from 'zod';
import type {FastifyRequest} from 'fastify';
import type {ApiErrorCode} from '@hufs-one/contracts';
import type {VerifiedActor} from '../../types.js';

const Base={
  actorId:z.string().trim().min(1),sessionIdHash:z.string().min(8),
  sessionExpiresAt:z.iso.datetime({offset:true}),csrfToken:z.string().min(16),
};
const VerifiedActorSchema=z.discriminatedUnion('role',[
  z.strictObject({...Base,role:z.enum(['BETA','ADMIN']),
    schoolMailProofExpiresAt:z.iso.datetime({offset:true}),betaAllowed:z.boolean()}),
  z.strictObject({...Base,role:z.literal('REVIEWER'),
    verifiedEmail:z.email().max(254),identityProofExpiresAt:z.iso.datetime({offset:true})}),
]);
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
  if(actor.data.role==='REVIEWER') {
    if(Date.parse(actor.data.identityProofExpiresAt)<=at)throw new ApiFailure('FORBIDDEN');
  } else if(!actor.data.betaAllowed||Date.parse(actor.data.schoolMailProofExpiresAt)<=at) {
    throw new ApiFailure('FORBIDDEN');
  }
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
