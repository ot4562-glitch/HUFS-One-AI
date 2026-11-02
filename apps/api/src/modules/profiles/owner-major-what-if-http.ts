import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import {
  OwnerMajorWhatIfRequestSchema,OwnerMajorWhatIfResponseSchema,
} from '@hufs-one/contracts';
import type {OwnerMajorWhatIfRequest,OwnerMajorWhatIfResponse} from '@hufs-one/contracts';
import {ApiFailure} from '../auth/gates.js';
import {betaActor,betaRecheck} from './self-account-http.js';
import type {BetaRouteVerifier} from './self-account-http.js';

type Scenario=OwnerMajorWhatIfRequest['scenario'];
type Ready=Extract<OwnerMajorWhatIfResponse,{state:'READY'}>;
type EvidenceLink=Ready['evidenceLinks'][number];
type OwnerScope={actorId:string;scenario:Scenario;now:string};
type SnapshotScope=OwnerScope&{
  sourceReceipt:string;currentVersion:string;asOf:string;
};

/** Read-only server adapter, not an academic calculation implementation.
 * It must read only this owner's currently permitted immutable transcript,
 * verified cohort/major heads and human-reviewed effective RulePacks. A missing
 * academic core can return #107 BLOCKED_DEPENDENCY; it must never invent READY.
 * `currentVersion` is an opaque aggregate of those actual owner heads, bound
 * to the source receipt. It is not a client claim or hypothetical RulePack.
 * No live adapter, transcript import, or academic engine is installed here.
 */
export interface TrustedOwnerMajorWhatIfSource {
  inspect(input:OwnerScope&{expectedCurrentVersion?:string}):Promise<{
    check:unknown;receipt:string;currentVersion:string;
  }>;
  /** Re-read consent, source/owner heads and receipt scope after all reads. */
  revalidate(input:SnapshotScope):Promise<boolean>;
}

/** Independent of the calculation provider and browser. A result's embedded
 * sourceRightsVersion/ownerConsentVersion does not grant permission.
 */
export interface TrustedOwnerMajorWhatIfRights {
  /** Current owner purpose consent/source rights, BEFORE any transcript read. */
  mayInspect(input:OwnerScope):Promise<boolean>;
  /** Authorize every exact ref+URL+verification timestamp and requirement
   * disclosed by this receipt, including links unused by an individual delta.
   * Resolve trusted sources; do not fetch or trust a provider-selected URL.
   */
  authorize(input:SnapshotScope&{
    evidenceLinks:readonly EvidenceLink[];evidenceRefs:readonly string[];
    requirementRefs:readonly string[];
  }):Promise<{allowed:boolean;rightsReceipt:string}>;
  revalidate(input:SnapshotScope&{rightsReceipt:string}):Promise<boolean>;
}

/** Separately trusted academic activation/approval registry. Validate current
 * core, BOTH RulePacks, cohort applicability, overlap rules, transcript,
 * source rights, purpose consent and the exact official evidence links against
 * independently reviewed records. A self-attested proof is never sufficient.
 * Receipts must bind every supplied field and current version to one snapshot.
 */
export interface ApprovedMajorWhatIfGate {
  authorize(input:SnapshotScope&{
    approval:Ready['approval'];versions:Ready['versions'];
    evidenceLinks:readonly EvidenceLink[];
  }):Promise<{allowed:boolean;approvalReceipt:string}>;
  /** Check current activation/approval heads after source and rights awaits. */
  revalidate(input:SnapshotScope&{
    approvalReceipt:string;rightsReceipt:string;
  }):Promise<boolean>;
}

const Receipt=z.string().min(8).max(256);
const SourceResult=z.strictObject({
  check:z.unknown(),receipt:Receipt,
  currentVersion:z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/),
});
const Empty=z.strictObject({});
async function provider<T>(read:()=>Promise<T>):Promise<T>{
  try{return await read();}
  catch{throw new ApiFailure('PROVIDER_UNAVAILABLE');}
}
async function recheck(read:()=>Promise<boolean>):Promise<void>{
  let valid=false;
  try{valid=await read()===true;}catch{/* Revocation or unavailable authority: deny. */}
  if(!valid)throw new ApiFailure('FORBIDDEN');
}
function receipt(value:unknown):string{
  const parsed=Receipt.safeParse(value);
  if(!parsed.success)throw new ApiFailure('PROVIDER_UNAVAILABLE');
  return parsed.data;
}

/** Private calculation uses POST for the central Origin/CSRF hooks; no owner
 * academic state, study plan, source, or approval is written by this route.
 * Registration without trusted source AND independent rights fails with 503.
 */
export function registerOwnerMajorWhatIfRoutes(options:{
  app:FastifyInstance;session:BetaRouteVerifier;
  source?:TrustedOwnerMajorWhatIfSource;rights?:TrustedOwnerMajorWhatIfRights;
  approvalGate?:ApprovedMajorWhatIfGate;
}):void{
  const {app,session,source,rights,approvalGate}=options;
  app.post('/api/academics/major-what-if',async request=>{
    Empty.parse(request.query);
    const input=OwnerMajorWhatIfRequestSchema.parse(request.body);
    const actor=await betaActor(request,session);
    if(!source||!rights)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    const now=session.now();
    const ownerScope={actorId:actor.actorId,scenario:input.scenario};
    if(await provider(()=>rights.mayInspect({...ownerScope,now}))!==true)
      throw new ApiFailure('FORBIDDEN');
    // Session changes while consent was being checked must stop the source read.
    await betaRecheck(request,session,actor);
    const raw=await provider(()=>source.inspect({
      ...ownerScope,now,
      ...(input.expectedCurrentVersion
        ?{expectedCurrentVersion:input.expectedCurrentVersion}:{}),
    }));
    const result=SourceResult.safeParse(raw);
    if(!result.success)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    const parsed=OwnerMajorWhatIfResponseSchema.safeParse(result.data.check);
    if(!parsed.success)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    const safe=parsed.data;
    // Parsing canonicalizes scenario key order. Removal actions contain no target.
    if(JSON.stringify(safe.scenario)!==JSON.stringify(input.scenario)
      ||!Number.isFinite(Date.parse(now))||Date.parse(safe.asOf)>Date.parse(now))
      throw new ApiFailure('PROVIDER_UNAVAILABLE');
    // #107 deliberately omits the actual owner head from the browser DTO.
    // Compare the receipt-bound server head even when the core is blocked.
    if(input.expectedCurrentVersion
      &&input.expectedCurrentVersion!==result.data.currentVersion)
      throw new ApiFailure('VERSION_CONFLICT');
    await betaRecheck(request,session,actor);
    const scope={...ownerScope,asOf:safe.asOf,
      sourceReceipt:result.data.receipt,currentVersion:result.data.currentVersion};
    const evidenceLinks=safe.state==='READY'?safe.evidenceLinks:[];
    const evidenceRefs=safe.state==='READY'?[...new Set([
      ...evidenceLinks.map(link=>link.evidenceRef),
      ...safe.approval.officialEvidenceRefs,
      ...safe.delta.flatMap(row=>row.evidenceRefs),
    ])].sort():[];
    const requirementRefs=safe.state==='READY'?[...new Set([
      ...safe.current.requirements.map(row=>row.requirementId),
      ...safe.hypothetical.requirements.map(row=>row.requirementId),
    ])].sort():[];
    const authorized=await provider(()=>rights.authorize({
      ...scope,now:session.now(),evidenceLinks,evidenceRefs,requirementRefs,
    }));
    if(authorized?.allowed!==true)throw new ApiFailure('FORBIDDEN');
    const rightsReceipt=receipt(authorized.rightsReceipt);
    let approvalReceipt:string|undefined;
    if(safe.state==='READY'){
      if(!approvalGate)throw new ApiFailure('PROVIDER_UNAVAILABLE');
      const approved=await provider(()=>approvalGate.authorize({
        ...scope,now:session.now(),approval:safe.approval,
        versions:safe.versions,evidenceLinks,
      }));
      if(approved?.allowed!==true)throw new ApiFailure('PROVIDER_UNAVAILABLE');
      approvalReceipt=receipt(approved.approvalReceipt);
    }
    await recheck(()=>source.revalidate({...scope,now:session.now()}));
    await recheck(()=>rights.revalidate({...scope,now:session.now(),rightsReceipt}));
    if(approvalReceipt&&approvalGate){
      const boundReceipt=approvalReceipt;
      await recheck(()=>approvalGate.revalidate({
        ...scope,now:session.now(),rightsReceipt,approvalReceipt:boundReceipt,
      }));
    }
    await betaRecheck(request,session,actor);
    return safe;
  });
}
