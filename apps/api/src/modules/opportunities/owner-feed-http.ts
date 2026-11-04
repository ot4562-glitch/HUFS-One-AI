import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import {OwnerFeedResponseSchema} from '@hufs-one/contracts';
import type {OwnerFeedResponse} from '@hufs-one/contracts';
import {ApiFailure} from '../auth/gates.js';
import {betaActor,betaRecheck} from '../profiles/self-account-http.js';
import type {BetaRouteVerifier} from '../profiles/self-account-http.js';
import {OwnerRecommendationVersionConflict} from './owner-recommendations.js';

export interface TrustedOwnerFeedSource {
  mayInspect(input:{actorId:string;asOf:string;now:string}):Promise<boolean>;
  inspect(input:{actorId:string;asOf:string;now:string}):Promise<{result:OwnerFeedResponse;receipt:string;coreVersion:string}>;
  revalidate(input:{actorId:string;receipt:string;now:string}):Promise<boolean>;
}
/** Account/private-profile and explicit approval purpose access, independent
 * of source catalog rights. SQL separately verifies current storage consent. */
export interface OwnerRecommendationAuthority {
  mayRead(input:{actorId:string;now:string}):Promise<boolean>;
}
/** Independent reviewed-code/ranking activation registry. This is never a
 * browser flag or an approval inferred from the result's own version label. */
export interface ApprovedOwnerRecommendationGate {
  isApproved(input:{actorId:string;coreVersion:string;rankConfigVersion:string;
    version:string;sourceReceipt:string;now:string}):Promise<boolean>;
}
const Query=z.strictObject({asOf:z.iso.datetime({offset:true}).optional()});
const Receipt=z.string().regex(/^[A-Za-z0-9_.:-]{8,256}$/);
const Core=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);

export function registerOwnerFeedRoutes(options:{app:FastifyInstance;session:BetaRouteVerifier;
  source?:TrustedOwnerFeedSource;approval?:ApprovedOwnerRecommendationGate}):void{
  const {app,session,source,approval}=options;
  app.get('/api/owner/feed',async request=>{
    const actor=await betaActor(request,session),query=Query.parse(request.query),now=session.now();
    const asOf=query.asOf??now;
    if(!Number.isFinite(Date.parse(now))||Date.parse(asOf)>Date.parse(now))throw new ApiFailure('INVALID_INPUT');
    if(!source||!approval)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    const available=async<T>(read:()=>Promise<T>):Promise<T>=>{
      try{return await read();}catch(error){
        if(error instanceof OwnerRecommendationVersionConflict)throw new ApiFailure('VERSION_CONFLICT');
        throw new ApiFailure('PROVIDER_UNAVAILABLE');
      }
    };
    if(await available(()=>source.mayInspect({actorId:actor.actorId,asOf,now}))!==true)throw new ApiFailure('FORBIDDEN');
    await betaRecheck(request,session,actor);
    const raw=await available(()=>source.inspect({actorId:actor.actorId,asOf,now}));
    const parsed=OwnerFeedResponseSchema.safeParse(raw?.result);
    if(!parsed.success||!Receipt.safeParse(raw?.receipt).success||!Core.safeParse(raw?.coreVersion).success
      ||Date.parse(parsed.data.feed.asOf)!==Date.parse(asOf))throw new ApiFailure('PROVIDER_UNAVAILABLE');
    await betaRecheck(request,session,actor);
    const safe=parsed.data;
    const approved=async()=>{
      if(await available(()=>approval.isApproved({actorId:actor.actorId,coreVersion:raw.coreVersion,
        rankConfigVersion:safe.rankConfigVersion,version:safe.version,sourceReceipt:raw.receipt,now:session.now()}))!==true)
        throw new ApiFailure('PROVIDER_UNAVAILABLE');
    };
    await approved();
    if(await available(()=>source.revalidate({actorId:actor.actorId,receipt:raw.receipt,now:session.now()}))!==true)
      throw new ApiFailure('FORBIDDEN');
    await approved();
    if(await available(()=>source.revalidate({actorId:actor.actorId,receipt:raw.receipt,now:session.now()}))!==true)
      throw new ApiFailure('FORBIDDEN');
    await betaRecheck(request,session,actor);
    return safe;
  });
}
