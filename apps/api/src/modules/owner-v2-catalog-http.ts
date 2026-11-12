import type {FastifyInstance} from 'fastify';
import {FeatureAdditions as V} from '@hufs-one/contracts';
import type {FeatureAdditions as C} from '@hufs-one/contracts';
import {searchApprovedCatalogV2} from '../../../../packages/core/src/feature-additions/catalog-v2.js';
import type {CatalogCursorSigner,CursorRequestContext} from '../../../../packages/core/src/feature-additions/server-cursor.js';
import {ApiFailure} from './auth/gates.js';
import {MAX_VERIFIED_V2_CATALOG_ROWS} from './owner-v2-catalog-limits.js';
import {betaActor,betaRecheck,type BetaRouteVerifier} from './profiles/self-account-http.js';

type Receipt={actorId:string;sourceVersion:string;expiresAt:string};
export interface ApprovedV2CatalogSnapshot {
  /** Source port MUST restrict every record to current owner/rights/purpose. */
  items:readonly C.OpportunityCatalogItem[];
  scopeKey:string;catalogRevision:string;consentVersion:string;
  receipt:Receipt;
}
export interface TrustedOwnerV2SearchQuota {
  /** Must consume atomically under a bounded, per-actor time window in durable SQL.
   * A process-local counter is insufficient for a production multi-replica deployment. */
  consume(input:{actorId:string;now:string;operation:'V2_CATALOG_SEARCH'}):Promise<boolean>;
}
export interface TrustedOwnerV2CatalogSource {
  read(input:{actorId:string;asOf:string}):Promise<ApprovedV2CatalogSnapshot|null>;
  /** Must re-read current actor, consent/rights and source HEAD; no cached allow flag. */
  revalidate(input:{actorId:string;receipt:Receipt;now:string}):Promise<boolean>;
}

/** #366/#348 read-only BETA catalog. For a large actor-authorized view,
 * the operator may supply PostgresOwnerV2StableKeysetSource: it rebuilds the
 * *entire* verified epoch from bounded SQL pages and rechecks it before send.
 * The JS search engine remains the only filter/count/order authority. */

export function registerOwnerV2CatalogRoutes(input:{
  app:FastifyInstance;session:BetaRouteVerifier;
  source?:TrustedOwnerV2CatalogSource;signer?:CatalogCursorSigner;
  quota?:TrustedOwnerV2SearchQuota;
}):void{
  const {app,session,source,signer,quota}=input;
  // Partial activation is forbidden: no live unmetered search route.
  if((source||signer||quota)&&(!source||!signer||!quota))
    throw new Error('V2 catalog requires a trusted source, signer and durable per-actor quota');
  app.get('/api/owner/features/v2/catalog',async(req,reply)=>{
    reply.header('Cache-Control','no-store');
    const actor=await betaActor(req,session);
    const args=V.OwnerV2CatalogQuerySchema.parse(req.query);
    const now=session.now(),nowMs=Date.parse(now);
    const asOf=args.asOf??now,asOfMs=Date.parse(asOf);
    if(!Number.isFinite(nowMs)||!Number.isFinite(asOfMs)
      ||asOfMs>nowMs||nowMs-asOfMs>15*60_000)
      throw new ApiFailure('INVALID_INPUT');
    if(!source||!signer||!quota){
      // Startup rejects any partially supplied trio. This zero-config branch
      // simultaneously narrows all three trusted ports for TypeScript.
      await betaRecheck(req,session,actor);
      return V.OwnerV2CatalogResponseSchema.parse({state:'NOT_CONNECTED',asOf});
    }
    // Quota is consumed BEFORE reading a potentially expensive permission-scoped
    // full catalog; current BETA session is checked again after async admission.
    let admitted=false;
    try{admitted=await quota!.consume({actorId:actor.actorId,now,
      operation:'V2_CATALOG_SEARCH'})===true;}
    catch{throw new ApiFailure('PROVIDER_UNAVAILABLE');}
    if(!admitted)throw new ApiFailure('RATE_LIMITED');
    await betaRecheck(req,session,actor);
    const {cursor:opaque,asOf:_asOf,...filters}=args;
    const query=V.OpportunityQuerySchema.parse({...filters,asOf});
    let snapshot:ApprovedV2CatalogSnapshot|null;
    try{snapshot=await source.read({actorId:actor.actorId,asOf});}
    catch{throw new ApiFailure('PROVIDER_UNAVAILABLE');}
    if(!snapshot)throw new ApiFailure('FORBIDDEN');
    const validReceipt=()=>{
      const expires=Date.parse(snapshot!.receipt.expiresAt),current=Date.parse(session.now());
      return snapshot!.receipt.actorId===actor.actorId
        &&snapshot!.receipt.sourceVersion===snapshot!.catalogRevision
        &&snapshot!.consentVersion.trim().length>0
        &&snapshot!.scopeKey.trim().length>0
        &&Number.isFinite(expires)&&Number.isFinite(current)&&expires>current;
    };
    if(!validReceipt())throw new ApiFailure('PROVIDER_UNAVAILABLE');
    const context:CursorRequestContext={
      actorId:actor.actorId,consentVersion:snapshot.consentVersion,
      scopeKey:snapshot.scopeKey,catalogRevision:snapshot.catalogRevision,
      query,nowMs,
    };
    let cursor:ReturnType<CatalogCursorSigner['verify']>|undefined;
    if(opaque){
      try{cursor=signer.verify(opaque,context);}
      catch{throw new ApiFailure('VERSION_CONFLICT');}
    }
    let page:ReturnType<typeof searchApprovedCatalogV2>;
    try{
      // Strict upper bound shared with the stable PostgreSQL keyset source.
      // 5,001st item is a full deny, never a misleading partial total/count.
      const items=V.OpportunityCatalogItemSchema.array()
        .max(MAX_VERIFIED_V2_CATALOG_ROWS).parse(snapshot.items);
      page=searchApprovedCatalogV2({items,query,scopeKey:snapshot.scopeKey,
        catalogRevision:snapshot.catalogRevision,...(cursor?{cursor}:{})});
    }catch{throw new ApiFailure('PROVIDER_UNAVAILABLE');}
    await betaRecheck(req,session,actor);
    let allowed=false;
    try{allowed=await source.revalidate({actorId:actor.actorId,
      receipt:snapshot.receipt,now:session.now()})===true;}
    catch{/* missing current rights always denies */}
    if(!allowed)throw new ApiFailure('FORBIDDEN');
    if(!validReceipt())throw new ApiFailure('PROVIDER_UNAVAILABLE');
    await betaRecheck(req,session,actor);
    let nextCursor:string|null=null;
    try{nextCursor=page.nextCursor?signer.sign(page.nextCursor,context):null;}
    catch{throw new ApiFailure('PROVIDER_UNAVAILABLE');}
    const signed=V.SignedCatalogPageV2Schema.parse({...page,nextCursor});
    return V.OwnerV2CatalogResponseSchema.parse({
      state:'READY',sourceVersion:snapshot.receipt.sourceVersion,page:signed,
    });
  });
}
