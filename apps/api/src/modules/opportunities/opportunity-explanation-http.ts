import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import {
  OpportunityExplanationRequestSchema,OpportunityExplanationResponseSchema,
} from '@hufs-one/contracts';
import type {OpportunityExplanationRequest,OpportunityExplanationResponse} from '@hufs-one/contracts';
import {ApiFailure} from '../auth/gates.js';
import {betaActor,betaRecheck} from '../profiles/self-account-http.js';
import type {BetaRouteVerifier} from '../profiles/self-account-http.js';

type Query=OpportunityExplanationRequest&{actorId:string;opportunityId:string;now:string};
/** Adapter to the reviewed recommendation core, not a model explanation.
 * Must use the same scoped inputs/config/current approved source as the feed.
 * A missing or unreviewed core is unavailable, never a guessed reason.
 */
export interface TrustedOpportunityExplanationSource {
  inspect(input:Query):Promise<{explanation:unknown;receipt:string;coreVersion:string}>;
  revalidate(input:{actorId:string;receipt:string;now:string}):Promise<boolean>;
}
export interface TrustedOpportunityExplanationRights {
  /** Includes visible-candidate lookup and current purpose consent. No hidden ID oracle. */
  mayInspect(input:Query):Promise<boolean>;
  /** Must bind exact candidate, revision, asOf, rank, safe decision and evidence. */
  authorize(input:{actorId:string;sourceReceipt:string;now:string;
    explanation:OpportunityExplanationResponse}):Promise<{allowed:boolean;receipt:string}>;
  revalidate(input:{actorId:string;sourceReceipt:string;rightsReceipt:string;now:string}):Promise<boolean>;
}
export interface ApprovedOpportunityExplanationGate {
  isApproved(input:{actorId:string;coreVersion:string;sourceReceipt:string;now:string;
    explanation:OpportunityExplanationResponse}):Promise<boolean>;
}
const Receipt=z.string().regex(/^[A-Za-z0-9_.:-]{8,256}$/);
const Ref=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const Params=z.strictObject({opportunityId:Ref});
export function registerOpportunityExplanationRoutes(options:{
  app:FastifyInstance;session:BetaRouteVerifier;
  source?:TrustedOpportunityExplanationSource;rights?:TrustedOpportunityExplanationRights;
  approval?:ApprovedOpportunityExplanationGate;
}):void{
  const {app,session,source,rights,approval}=options;
  app.post('/api/opportunities/:opportunityId/explanation',async request=>{
    z.strictObject({}).parse(request.query);
    const actor=await betaActor(request,session);
    const {opportunityId}=Params.parse(request.params);
    const query=OpportunityExplanationRequestSchema.parse(request.body);
    if(Date.parse(query.asOf)>Date.parse(session.now()))throw new ApiFailure('INVALID_INPUT');
    if(!source||!rights||!approval)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    const input={...query,opportunityId,actorId:actor.actorId,now:session.now()};
    const available=async<T>(perform:()=>Promise<T>):Promise<T>=>{
      try{return await perform();}catch{throw new ApiFailure('PROVIDER_UNAVAILABLE');}
    };
    if(await available(()=>rights.mayInspect(input))!==true)throw new ApiFailure('FORBIDDEN');
    await betaRecheck(request,session,actor);
    const raw=await available(()=>source.inspect(input));
    if(!raw||!Receipt.safeParse(raw.receipt).success||!Ref.safeParse(raw.coreVersion).success)
      throw new ApiFailure('PROVIDER_UNAVAILABLE');
    const parsed=OpportunityExplanationResponseSchema.safeParse(raw.explanation);
    if(!parsed.success)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    const safe=parsed.data;
    if(safe.opportunityId!==opportunityId||safe.sourceRevisionId!==query.sourceRevisionId
      ||safe.rankConfigVersion!==query.rankConfigVersion
      ||Date.parse(safe.asOf)!==Date.parse(query.asOf))throw new ApiFailure('VERSION_CONFLICT');
    const permission=await available(()=>rights.authorize({actorId:actor.actorId,
      sourceReceipt:raw.receipt,now:session.now(),explanation:safe}));
    if(permission?.allowed!==true)throw new ApiFailure('FORBIDDEN');
    if(!Receipt.safeParse(permission.receipt).success)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    const recheckApproval=async()=>{
      if(await available(()=>approval.isApproved({actorId:actor.actorId,coreVersion:raw.coreVersion,
        sourceReceipt:raw.receipt,explanation:safe,now:session.now()}))!==true)
        throw new ApiFailure('PROVIDER_UNAVAILABLE');
    };
    await recheckApproval();
    if(await available(()=>source.revalidate({actorId:actor.actorId,receipt:raw.receipt,
      now:session.now()}))!==true)throw new ApiFailure('FORBIDDEN');
    if(await available(()=>rights.revalidate({actorId:actor.actorId,sourceReceipt:raw.receipt,
      rightsReceipt:permission.receipt,now:session.now()}))!==true)throw new ApiFailure('FORBIDDEN');
    await recheckApproval();
    await betaRecheck(request,session,actor);
    return safe;
  });
}
