import type {FastifyInstance} from 'fastify';
import {
  OwnerStudyPlanCheckRequestSchema,OwnerStudyPlanCheckResponseSchema,
} from '@hufs-one/contracts';
import type {OwnerStudyPlanCheckResponse} from '@hufs-one/contracts';
import {termEndMs} from '../../../../../packages/core/src/academics/ledger.js';
import {ApiFailure} from '../auth/gates.js';
import {betaActor,betaRecheck} from './self-account-http.js';
import type {BetaRouteVerifier} from './self-account-http.js';

/** Agent 02 / academics handoff: this port must be bound only to a trusted,
 * rights-scoped server reader. It must load the owner's immutable approved
 * transcript, effective human-reviewed RulePack, verified term rules,
 * current catalog and official sections, then invoke the approved #91 core.
 * No such live adapter is provided by Agent 05; absence is HTTP 503.
 */
export interface TrustedOwnerStudyPlanSource {
  inspect(input:{actorId:string;term:string;now:string;expectedPlanVersion?:string}):
    Promise<{check:unknown;receipt:string}>;
  /** Current consent, actor, source rights, rule and plan heads; no cache-only grant. */
  revalidate(input:{actorId:string;receipt:string;now:string}):Promise<boolean>;
}

/** Rights and course/evidence visibility are checked by an independent
 * server authority, not the academic result provider or the browser. In
 * particular, a self-described OWNER_VERIFIED/GRANT_SCOPED disclosure in a
 * provider response is not proof of a current consent or SharingGrant.
 */
export interface TrustedOwnerStudyPlanRights {
  /** Must pass BEFORE an owner transcript or study plan can be inspected. */
  mayInspect(input:{actorId:string;term:string;now:string}):Promise<boolean>;
  authorize(input:{
    actorId:string;term:string;asOf:string;sourceReceipt:string;now:string;
    planVersion?:string;disclosureMode:'REDACTED'|'OWNER_VERIFIED'|'GRANT_SCOPED';
    sharingGrantVersion?:string;courseRefs:readonly string[];
    evidenceRefs:readonly string[];
    /** Check exact trusted href and verifiedAt bindings, not just the ref name. */
    evidenceLinks:readonly OwnerStudyPlanCheckResponse['evidenceLinks'][number][];
  }):Promise<{allowed:boolean;rightsReceipt:string}>;
  /** Must still hold after all other awaited operations and source checks. */
  revalidate(input:{
    actorId:string;sourceReceipt:string;rightsReceipt:string;now:string;
  }):Promise<boolean>;
}

/** Separate activation gate for current-HEAD-reviewed academic core and RulePack.
 * A source result by itself must never self-authorize READY or an official cap.
 * Independently bind the full approval, official evidence refs, exact link URLs
 * and verification instants to the supplied source receipt and current heads.
 */
export interface ApprovedStudyPlanGate {
  isApproved(input:{
    actorId:string;coreVersion:string;rulePackVersion:string;
    sourceRightsVersion:string;consentVersion:string;
    term:string;asOf:string;now:string;
    sourceReceipt:string;
    approval:NonNullable<OwnerStudyPlanCheckResponse['approval']>;
    evidenceLinks:readonly OwnerStudyPlanCheckResponse['evidenceLinks'][number][];
  }):Promise<boolean>;
}

/** Read-only calculation; POST only to enforce Origin/CSRF on private owner
 * requests in the existing Fastify hooks. Does not store a plan, register
 * courses, or expose a transcript/attempt/grade to the browser.
 *
 * Agent 01 owns registration in integration.ts and must supply these trusted
 * ports only after #91 is reviewed/merged and real approval/rights are wired.
 */
export function registerOwnerStudyPlanCheckRoutes(options:{
  app:FastifyInstance;session:BetaRouteVerifier;
  source?:TrustedOwnerStudyPlanSource;
  rights?:TrustedOwnerStudyPlanRights;
  approvalGate?:ApprovedStudyPlanGate;
}):void{
  const {app,session,source,rights,approvalGate}=options;
  app.post('/api/study-plans/check',async request=>{
    const input=OwnerStudyPlanCheckRequestSchema.parse(request.body);
    const actor=await betaActor(request,session);
    const now=session.now();
    if(termEndMs(input.term)<=Date.parse(now))throw new ApiFailure('INVALID_INPUT');
    if(!source||!rights)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    // A provider that reads the transcript before checking current independent
    // owner purpose consent would leak private data even if HTTP later returned
    // 403. Preauthorization must precede the first source read.
    let mayInspect=false;
    try{mayInspect=await rights.mayInspect({
      actorId:actor.actorId,term:input.term,now,
    })===true;}catch{throw new ApiFailure('PROVIDER_UNAVAILABLE');}
    if(!mayInspect)throw new ApiFailure('FORBIDDEN');
    // Awaited permission checks cannot retain authority for a logged-out or
    // replaced session. Stop before the first private academic read.
    await betaRecheck(request,session,actor);
    let result:Awaited<ReturnType<TrustedOwnerStudyPlanSource['inspect']>>;
    try{result=await source.inspect({
      actorId:actor.actorId,term:input.term,now,
      ...(input.expectedPlanVersion?{expectedPlanVersion:input.expectedPlanVersion}:{}),
    });}catch{throw new ApiFailure('PROVIDER_UNAVAILABLE');}
    if(!result||typeof result.receipt!=='string'
      ||result.receipt.length<8||result.receipt.length>256)
      throw new ApiFailure('PROVIDER_UNAVAILABLE');
    const parsed=OwnerStudyPlanCheckResponseSchema.safeParse(result.check);
    if(!parsed.success)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    const safe=parsed.data;
    if(safe.term!==input.term||Date.parse(safe.asOf)>Date.parse(now))
      throw new ApiFailure('PROVIDER_UNAVAILABLE');
    if(input.expectedPlanVersion&&safe.versions.plan!==input.expectedPlanVersion)
      throw new ApiFailure('VERSION_CONFLICT');
    // Only actual response refs, never an entire private transcript/allowlist,
    // are passed to the independent rights resolver for exact scope checking.
    const evidenceRefs=[...new Set([
      ...safe.evidenceLinks.map(link=>link.evidenceRef),
      ...safe.planIssues.flatMap(issue=>issue.evidenceRefs),
      ...(safe.approval?.officialEvidenceRefs??[]),
    ])].sort();
    let rightsReceipt:string|undefined;
    try{
      const checked=await rights.authorize({
        actorId:actor.actorId,term:safe.term,asOf:safe.asOf,
        sourceReceipt:result.receipt,now:session.now(),
        ...(safe.versions.plan?{planVersion:safe.versions.plan}:{}),
        disclosureMode:safe.disclosure.mode,
        ...(safe.disclosure.grantVersion
          ?{sharingGrantVersion:safe.disclosure.grantVersion}:{}),
        courseRefs:safe.disclosure.visibleCourseRefs,
        evidenceRefs,evidenceLinks:safe.evidenceLinks,
      });
      if(checked?.allowed!==true)throw new ApiFailure('FORBIDDEN');
      if(typeof checked.rightsReceipt!=='string'
        ||checked.rightsReceipt.length<8||checked.rightsReceipt.length>256)
        throw new ApiFailure('PROVIDER_UNAVAILABLE');
      rightsReceipt=checked.rightsReceipt;
    }catch(error){
      if(error instanceof ApiFailure)throw error;
      throw new ApiFailure('PROVIDER_UNAVAILABLE');
    }
    const requiresApproval=safe.state==='READY'||!!safe.approval||safe.creditCapUnits!==undefined;
    const checkApproval=async()=>{
      if(!safe.approval||!approvalGate)
        throw new ApiFailure('PROVIDER_UNAVAILABLE');
      let approved=false;
      try{approved=await approvalGate.isApproved({
        actorId:actor.actorId,coreVersion:safe.approval.coreVersion,
        rulePackVersion:safe.approval.rulePackVersion,
        sourceRightsVersion:safe.approval.sourceRightsVersion,
        consentVersion:safe.approval.consentVersion,
        term:safe.term,asOf:safe.asOf,now:session.now(),
        sourceReceipt:result.receipt,approval:safe.approval,
        evidenceLinks:safe.evidenceLinks,
      })===true;}catch{/* fail closed */}
      if(!approved)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    };
    if(requiresApproval)await checkApproval();
    let valid=false;
    try{valid=await source.revalidate({
      actorId:actor.actorId,receipt:result.receipt,now:session.now(),
    })===true;}catch{/* revoked/stale source: deny */}
    if(!valid)throw new ApiFailure('FORBIDDEN');
    let stillAuthorized=false;
    try{stillAuthorized=await rights.revalidate({
      actorId:actor.actorId,sourceReceipt:result.receipt,
      rightsReceipt:rightsReceipt!,now:session.now(),
    })===true;}catch{/* fail closed on grant or consent changes */}
    if(!stillAuthorized)throw new ApiFailure('FORBIDDEN');
    // Source/rights revalidation may await storage while approval is withdrawn.
    // Recheck the complete receipt and link bindings after those operations.
    if(requiresApproval)await checkApproval();
    await betaRecheck(request,session,actor);
    return safe;
  });
}
