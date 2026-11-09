import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {FeatureAdditions as V} from '@hufs-one/contracts';
import type {FeatureAdditions as C} from '@hufs-one/contracts';
import {routeCounselingV2} from '../../../../packages/core/src/feature-additions/counseling-v2.js';
import {ApiFailure,requireStateChangeProof} from './auth/gates.js';
import {betaActor,betaRecheck,type BetaRouteVerifier} from './profiles/self-account-http.js';

const Id=z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/);
const Input=z.strictObject({
  purposes:z.array(Id).min(1).max(5).refine(xs=>new Set(xs).size===xs.length),
  campus:Id.optional(),language:Id.optional(),
});
const Iso=z.iso.datetime({offset:true});
type Receipt={actorId:string;sourceVersion:string;expiresAt:string};
export interface TrustedOwnerCounselingSource {
  /** Caller supplies no source records or actor IDs; the operator resolves current actor, purpose and rights. */
  read(input:{actorId:string;asOf:string}):Promise<{items:readonly C.CounselingService[];receipt:Receipt}|null>;
  /** Must check current actor/consent/rights/source HEAD, not only compare a cached token. */
  revalidate(input:{actorId:string;receipt:Receipt;now:string}):Promise<boolean>;
}

export interface TrustedOwnerCounselingQuota {
  /** Atomic and durable across replicas. Admit BEFORE the approved source is read. */
  consume(input:{actorId:string;operation:'V2_OWNER_COUNSELING';now:string}):Promise<boolean>;
}
export interface OwnerCounselingServices {
  source:TrustedOwnerCounselingSource;
  quota:TrustedOwnerCounselingQuota;
}
export function validateOwnerCounselingServices(value:OwnerCounselingServices):void{
  if(!value||typeof value.source?.read!=='function'
    ||typeof value.source?.revalidate!=='function'
    ||typeof value.quota?.consume!=='function')
    throw new Error('Owner counseling requires current rights source and durable quota');
}

/** #366: first end-to-end owner consumer of the feature-additions v2 cores.
 * A configured service port never means the student is eligible or a source is current.
 * No source means NOT_CONNECTED rather than fallback to a synthetic catalog. */
export function registerOwnerCounselingRoutes(input:{
  app:FastifyInstance;session:BetaRouteVerifier;allowedOrigin:string;
  services?:OwnerCounselingServices;
}):void{
  const {app,session,services}=input;
  if(services)validateOwnerCounselingServices(services);
  app.post('/api/owner/counseling/routes',async(req,reply)=>{
    reply.header('Cache-Control','no-store');
    const actor=await betaActor(req,session);
    requireStateChangeProof(req,actor,input.allowedOrigin);
    const query=Input.parse(req.body);
    const asOf=Iso.parse(session.now());
    if(!services){
      await betaRecheck(req,session,actor);
      return {state:'NOT_CONNECTED' as const,asOf};
    }
    let admitted=false;
    try{admitted=await services.quota.consume({actorId:actor.actorId,
      operation:'V2_OWNER_COUNSELING',now:asOf});}
    catch{throw new ApiFailure('PROVIDER_UNAVAILABLE');}
    if(!admitted)throw new ApiFailure('RATE_LIMITED');
    await betaRecheck(req,session,actor);
    let snapshot:Awaited<ReturnType<TrustedOwnerCounselingSource['read']>>;
    try{snapshot=await services.source.read({actorId:actor.actorId,asOf});}
    catch{throw new ApiFailure('PROVIDER_UNAVAILABLE');}
    if(!snapshot)throw new ApiFailure('FORBIDDEN');
    const validReceipt=():boolean=>{
      const at=Date.parse(session.now()),end=Date.parse(snapshot!.receipt.expiresAt);
      return Number.isFinite(at)&&Number.isFinite(end)&&end>at
        &&snapshot!.receipt.actorId===actor.actorId
        &&snapshot!.receipt.sourceVersion.trim().length>0;
    };
    if(!validReceipt())throw new ApiFailure('PROVIDER_UNAVAILABLE');
    let guide:C.CounselingService[]|never;
    let report:z.infer<typeof V.CounselingGuideV2Schema>;
    try{
      guide=V.CounselingServiceSchema.array().max(500).parse(snapshot.items);
      // #345: reject an unnamed or ungrounded office BEFORE the core's top-three
      // ranking. Otherwise three invalid higher-scoring offices can hide a valid
      // fourth match and falsely report NO_MATCH. Quarantine duplicate IDs across
      // the full unfiltered source, not merely across the remaining named offices.
      const seen=new Set<string>(),duplicateIds=new Set<string>();
      for(const service of guide){
        if(seen.has(service.id))duplicateIds.add(service.id);
        seen.add(service.id);
      }
      const named=guide.filter(service=>{
        const name=service.verifiedName;
        return !duplicateIds.has(service.id)&&!!name?.text.trim()
          &&service.source.evidenceSpanIds.includes(name.sourceSpanId);
      });
      const core=routeCounselingV2({
        purposes:query.purposes,services:named,asOf,
        ...(query.campus?{campus:query.campus}:{}),
        ...(query.language?{language:query.language}:{}),
        // Audience codes must come from current trusted identity; never from browser input.
      });
      const byId=new Map(named.map(service=>[service.id,service]));
      const matches=core.matches.flatMap(match=>{
        const name=byId.get(match.serviceId)?.verifiedName;
        return name?[{...match,serviceName:name.text}]:[];
      });
      report=V.CounselingGuideV2Schema.parse({
        ...core,matches,
        excluded:core.excluded+guide.length-named.length,
        status:matches.length?'MATCHES':core.status==='NO_PURPOSE'?'NO_PURPOSE':'NO_MATCH',
      });
    }catch{throw new ApiFailure('PROVIDER_UNAVAILABLE');}
    await betaRecheck(req,session,actor);
    let current=false;
    try{current=await services.source.revalidate({actorId:actor.actorId,receipt:snapshot.receipt,now:session.now()})===true;}
    catch{/* no permission if current source cannot be checked */}
    if(!current)throw new ApiFailure('FORBIDDEN');
    if(!validReceipt())throw new ApiFailure('PROVIDER_UNAVAILABLE');
    await betaRecheck(req,session,actor);
    return {state:'READY' as const,asOf,sourceVersion:snapshot.receipt.sourceVersion,guide:report};
  });
}
