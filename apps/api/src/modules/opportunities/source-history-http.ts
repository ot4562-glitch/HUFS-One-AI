import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import type {ApiOptions,VerifySession} from '../../types.js';
import {ApiFailure,authorizeSession} from '../auth/gates.js';

const Path=z.strictObject({sourceId:z.string().trim().min(1).max(128)});

/**
 * Integration-only read route. Main's unconfigured local server does not
 * expose an adapter or invent a reviewed source-rights registry.
 */
export function registerSourceRevisionHistoryRoute(
  app:FastifyInstance,
  history:NonNullable<ApiOptions['sourceHistory']>,
  verifier:VerifySession,
  now:()=>string,
):void{
  app.get('/api/evidence/sources/:sourceId/revisions',async request=>{
    z.strictObject({}).parse(request.query);
    const actor=authorizeSession(await verifier(request),now());
    if(actor.role!=='BETA')throw new ApiFailure('FORBIDDEN');
    const {sourceId}=Path.parse(request.params);
    const result=await history.read({actor,sourceId,now:now()});
    if(!result)throw new ApiFailure('FORBIDDEN');
    const rechecked=authorizeSession(await verifier(request),now());
    if(rechecked.role!==actor.role||rechecked.actorId!==actor.actorId
      ||rechecked.sessionIdHash!==actor.sessionIdHash)throw new ApiFailure('FORBIDDEN');
    return result;
  });
}
