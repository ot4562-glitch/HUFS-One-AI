/** #366/#343/#349: authenticated current-rights preparation, not awarding scholarships or badges.
 * The operator must independently enforce purpose-specific consent, source/issuer rights,
 * latest source heads and owner-only rows in both read and revalidate. No demo fallback.
 */
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {FeatureAdditions as V} from '@hufs-one/contracts';
import type {FeatureAdditions as C} from '@hufs-one/contracts';
import {checkScholarship} from '../../../../packages/core/src/feature-additions/scholarships-v2.js';
import {prepareBadgeV2} from '../../../../packages/core/src/feature-additions/badges-v2.js';
import {ApiFailure} from './auth/gates.js';
import {betaActor,betaRecheck,type BetaRouteVerifier} from './profiles/self-account-http.js';

const Iso=z.iso.datetime({offset:true});
const Id=z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/);
const Receipt=z.strictObject({
  actorId:Id,sourceVersion:Id,consentVersion:Id,rightsVersion:Id,expiresAt:Iso,
});
export type OwnerPreparationReceipt=z.infer<typeof Receipt>;
const Snapshot=z.strictObject({
  receipt:Receipt,
  scholarships:z.array(V.ScholarshipPolicySchema).max(20),
  facts:z.array(V.FeatureVerifiedFactSchema).max(200),
  authorizedFactRevisions:z.array(Id).max(200),
  badges:z.array(V.BadgeDefinitionSchema).max(20),
  badgeEvidence:z.array(V.BadgeEvidenceSchema).max(500),
});
export type OwnerPreparationSnapshot=z.infer<typeof Snapshot>;
export interface TrustedOwnerPreparationSource {
  read(input:{actorId:string;asOf:string}):Promise<OwnerPreparationSnapshot|null>;
  /** Must independently check current actor, purpose-specific consent, head and rights. */
  revalidate(input:{actorId:string;receipt:OwnerPreparationReceipt;now:string}):Promise<boolean>;
}
export interface TrustedOwnerPreparationQuota {
  /** Atomic, durable across replicas. Admission happens BEFORE the source is read. */
  consume(input:{actorId:string;operation:'V2_OWNER_PREPARATION';now:string}):Promise<boolean>;
}
export interface OwnerPreparationServices {
  source:TrustedOwnerPreparationSource;
  quota:TrustedOwnerPreparationQuota;
}
const Empty=z.strictObject({});
export function validateOwnerPreparationServices(value:OwnerPreparationServices):void{
  if(!value||typeof value.source?.read!=='function'
    ||typeof value.source?.revalidate!=='function'
    ||typeof value.quota?.consume!=='function')
    throw new Error('Owner preparation requires current rights source and durable quota');
}
export function registerOwnerPreparationRoutes(input:{
  app:FastifyInstance;session:BetaRouteVerifier;services?:OwnerPreparationServices;
}):void{
  const {app,session,services}=input;
  if(services)validateOwnerPreparationServices(services);
  app.get('/api/owner/features/v2/preparation',async(req,reply)=>{
    reply.header('Cache-Control','no-store');
    Empty.parse(req.query);
    const actor=await betaActor(req,session);
    const asOf=Iso.parse(session.now());
    if(!services){
      await betaRecheck(req,session,actor);
      return V.OwnerPreparationResponseSchema.parse({state:'NOT_CONNECTED',asOf});
    }
    let admitted=false;
    try{
      admitted=await services.quota.consume({actorId:actor.actorId,
        operation:'V2_OWNER_PREPARATION',now:asOf});
    }catch{throw new ApiFailure('PROVIDER_UNAVAILABLE');}
    if(!admitted)throw new ApiFailure('RATE_LIMITED');
    await betaRecheck(req,session,actor);

    let snapshot:OwnerPreparationSnapshot|null;
    try{
      const untrusted=await services.source.read({actorId:actor.actorId,asOf});
      snapshot=untrusted?Snapshot.parse(untrusted):null;
    }catch{throw new ApiFailure('PROVIDER_UNAVAILABLE');}
    if(!snapshot)throw new ApiFailure('FORBIDDEN');
    const expires=Date.parse(snapshot.receipt.expiresAt);
    if(snapshot.receipt.actorId!==actor.actorId
      ||!Number.isFinite(expires)||expires<=Date.parse(session.now()))
      throw new ApiFailure('PROVIDER_UNAVAILABLE');
    // Do not permit duplicate policy identifiers where different official rules
    // could otherwise shadow each other. Never pick a convenient first/last row.
    if(new Set(snapshot.scholarships.map(p=>p.id)).size!==snapshot.scholarships.length
      ||new Set(snapshot.badges.map(b=>b.id)).size!==snapshot.badges.length
      ||new Set(snapshot.facts.map(f=>f.key+'::'+(f.academicTerm??''))).size!==snapshot.facts.length
      ||new Set(snapshot.badgeEvidence.map(e=>e.id)).size!==snapshot.badgeEvidence.length
      ||new Set(snapshot.authorizedFactRevisions).size!==snapshot.authorizedFactRevisions.length)
      throw new ApiFailure('PROVIDER_UNAVAILABLE');
    let result:C.OwnerPreparationResponse;
    try{
      const allowed=new Set(snapshot.authorizedFactRevisions);
      const scholarships=snapshot.scholarships.map(policy=>V.ScholarshipReportV2Schema.parse(
        checkScholarship({policy,verifiedFacts:snapshot.facts,
          authorizedFactRevisions:allowed,asOf,mode:'LIVE'})));
      const badges=snapshot.badges.map(badge=>V.BadgePreparationV2Schema.parse(
        prepareBadgeV2({badge,evidence:snapshot.badgeEvidence,asOf,mode:'LIVE'})));
      result=V.OwnerPreparationResponseSchema.parse({
        state:'READY',asOf,sourceVersion:snapshot.receipt.sourceVersion,
        scholarships,badges,
      });
    }catch{throw new ApiFailure('PROVIDER_UNAVAILABLE');}
    await betaRecheck(req,session,actor);
    let valid=false;
    try{valid=await services.source.revalidate({
      actorId:actor.actorId,receipt:snapshot.receipt,now:session.now()})===true;}
    catch{/* missing independent rights must fail closed */}
    if(!valid)throw new ApiFailure('FORBIDDEN');
    if(Date.parse(snapshot.receipt.expiresAt)<=Date.parse(session.now()))
      throw new ApiFailure('PROVIDER_UNAVAILABLE');
    await betaRecheck(req,session,actor);
    return result;
  });
}
