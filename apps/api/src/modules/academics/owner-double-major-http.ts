import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import {OwnerDoubleMajorAuditSchema} from '../../../../../packages/contracts/src/academics/double-major.js';
import type {OwnerDoubleMajorAudit} from '../../../../../packages/contracts/src/academics/double-major.js';
import type {TrustedOwnerDoubleMajorSource} from './owner-double-major-source.js';
import {ApiFailure} from '../auth/gates.js';
import {ReceiptAdmissionError} from '../auth/owner-receipts.js';
import {betaActor,betaRecheck} from '../profiles/self-account-http.js';
import type {BetaRouteVerifier} from '../profiles/self-account-http.js';

export interface TrustedOwnerDoubleMajorRights {
  mayInspect(input:{actorId:string;now:string}):Promise<boolean>;
  /** Match this exact DTO against the current independently reviewed scope,
   * consent, disclosure, official evidence and two pack versions. No raw rows. */
  authorize(input:{actorId:string;sourceReceipt:string;check:unknown;now:string}):Promise<{allowed:boolean;rightsReceipt?:string}>;
  revalidate(input:{actorId:string;sourceReceipt:string;rightsReceipt:string;now:string}):Promise<boolean>;
}
const Empty=z.strictObject({});
/** Read-only current majors, not a hypothetical major change or graduation verdict. */
export function registerOwnerDoubleMajorRoutes(options:{app:FastifyInstance;session:BetaRouteVerifier;
  source?:TrustedOwnerDoubleMajorSource;rights?:TrustedOwnerDoubleMajorRights}):void {
  const {app,session,source,rights}=options;
  app.get('/api/academics/double-major',async(request,reply)=>{
    reply.header('cache-control','no-store');
    Empty.parse(request.query);
    const actor=await betaActor(request,session);
    if(!source||!rights)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    const now=session.now();
    let inspect=false;
    try{inspect=await rights.mayInspect({actorId:actor.actorId,now})===true;}catch{throw new ApiFailure('PROVIDER_UNAVAILABLE');}
    if(!inspect)throw new ApiFailure('FORBIDDEN');
    await betaRecheck(request,session,actor);
    let loaded:{check:OwnerDoubleMajorAudit;receipt:string};
    try{loaded=await source.inspect({actorId:actor.actorId,now});}
    catch(error){if(error instanceof ReceiptAdmissionError)throw error;throw new ApiFailure('PROVIDER_UNAVAILABLE');}
    if(!loaded||typeof loaded.receipt!=='string'||loaded.receipt.length<8||loaded.receipt.length>256)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    const parsed=OwnerDoubleMajorAuditSchema.safeParse(loaded.check);
    if(!parsed.success||parsed.data.asOf!==now)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    const safe=structuredClone(parsed.data);
    await betaRecheck(request,session,actor);
    let authorization:Awaited<ReturnType<TrustedOwnerDoubleMajorRights['authorize']>>;
    try{authorization=await rights.authorize({actorId:actor.actorId,sourceReceipt:loaded.receipt,check:structuredClone(safe),now:session.now()});}
    catch(error){if(error instanceof ReceiptAdmissionError)throw error;throw new ApiFailure('PROVIDER_UNAVAILABLE');}
    if(!authorization?.allowed)throw new ApiFailure('FORBIDDEN');
    if(typeof authorization.rightsReceipt!=='string'||authorization.rightsReceipt.length<8||authorization.rightsReceipt.length>256)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    const revalidate=async()=>{
      let current=false;
      try{current=await source.revalidate({actorId:actor.actorId,receipt:loaded.receipt,now:session.now()})===true;}catch{/* deny */}
      if(!current)throw new ApiFailure('FORBIDDEN');
    };
    await revalidate();
    let allowed=false;
    try{allowed=await rights.revalidate({actorId:actor.actorId,sourceReceipt:loaded.receipt,rightsReceipt:authorization.rightsReceipt,now:session.now()})===true;}catch{/* deny */}
    if(!allowed)throw new ApiFailure('FORBIDDEN');
    await betaRecheck(request,session,actor);
    // Rights/session work can await storage while a source/profile/consent head changes.
    await revalidate();
    return safe;
  });
}
