import type {FastifyInstance} from 'fastify';
import {
  PublicApiDiscoveryRequestSchema,PublicApiDiscoveryResponseSchema,
  type PublicApiProvider,
} from '@hufs-one/contracts';
import {ApiFailure,requireStateChangeProof} from '../auth/gates.js';
import {betaActor,betaRecheck,type BetaRouteVerifier} from '../profiles/self-account-http.js';
import type {OperatorPublicApiDiscovery} from './operator-public-api.js';

export interface OperatorPublicApiDiscoveryAuthority{
  /** Independent server operator admission; ordinary BETA membership is NOT enough. */
  mayManage(input:{actorId:string;sourceId:string;permissionRef:string;now:string}):Promise<boolean>;
}
export interface OperatorPublicApiDiscoveryControl{
  service:OperatorPublicApiDiscovery;
  authority:OperatorPublicApiDiscoveryAuthority;
}
function fail():never{throw new ApiFailure('PROVIDER_UNAVAILABLE');}

/** Explicit POST (one request consumes a provider quota slot). Inert when no
 * root-owned operator module provides service+authority+key+rights+quota.
 * No public/student browse endpoint and no automated refresh. */
export function registerOperatorPublicApiDiscoveryRoute(input:{
  app:FastifyInstance;session:BetaRouteVerifier;allowedOrigin:string;
  control:OperatorPublicApiDiscoveryControl;
}):void{
  const {app,session,control,allowedOrigin}=input;
  if(!control||typeof control.service?.lookup!=='function'
    ||typeof control.service?.permissionRef!=='function'
    ||typeof control.authority?.mayManage!=='function')
    throw new Error('Operator public API lookup requires independent runtime authority');
  const permit=async(actorId:string,provider:PublicApiProvider,permissionRef:string)=>{
    const sourceId='PUBLIC_API:'+provider;
    let allowed=false;
    try{allowed=await control.authority.mayManage({
      actorId,sourceId,permissionRef,now:session.now(),
    });}catch{fail();}
    if(!allowed)throw new ApiFailure('FORBIDDEN');
  };
  app.post('/api/operator/public-api-discovery',async request=>{
    const actor=await betaActor(request,session);
    requireStateChangeProof(request,actor,allowedOrigin);
    const query=PublicApiDiscoveryRequestSchema.parse(request.body);
    // permissionRef is always derived from the trusted service, not the HTTP body.
    const permissionRef=control.service.permissionRef(query.provider);
    if(!permissionRef)fail();
    await permit(actor.actorId,query.provider,permissionRef);
    await betaRecheck(request,session,actor);
    let result:unknown;
    try{result=await control.service.lookup(query);}catch{fail();}
    await permit(actor.actorId,query.provider,permissionRef);
    await betaRecheck(request,session,actor);
    const safe=PublicApiDiscoveryResponseSchema.safeParse(result);
    if(!safe.success||safe.data.provider!==query.provider||safe.data.topic!==query.topic
      ||safe.data.permissionRef!==permissionRef)fail();
    return safe.data;
  });
}
