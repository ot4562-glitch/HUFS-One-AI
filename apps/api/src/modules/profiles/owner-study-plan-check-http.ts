import type {FastifyInstance} from 'fastify';
import {
  OwnerStudyPlanCheckRequestSchema,OwnerStudyPlanCheckResponseSchema,
} from '@hufs-one/contracts';
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

/** Separate activation gate for current-HEAD-reviewed academic core and RulePack.
 * A source result by itself must never self-authorize READY or an official cap.
 */
export interface ApprovedStudyPlanGate {
  isApproved(input:{
    actorId:string;coreVersion:string;rulePackVersion:string;
    sourceRightsVersion:string;consentVersion:string;
    term:string;asOf:string;now:string;
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
  approvalGate?:ApprovedStudyPlanGate;
}):void{
  const {app,session,source,approvalGate}=options;
  app.post('/api/study-plans/check',async request=>{
    const input=OwnerStudyPlanCheckRequestSchema.parse(request.body);
    const actor=await betaActor(request,session);
    if(!source)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    const now=session.now();
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
    if(safe.state==='READY'||safe.approval||safe.creditCapUnits!==undefined){
      if(!safe.approval||!approvalGate)
        throw new ApiFailure('PROVIDER_UNAVAILABLE');
      let approved=false;
      try{approved=await approvalGate.isApproved({
        actorId:actor.actorId,coreVersion:safe.approval.coreVersion,
        rulePackVersion:safe.approval.rulePackVersion,
        sourceRightsVersion:safe.approval.sourceRightsVersion,
        consentVersion:safe.approval.consentVersion,
        term:safe.term,asOf:safe.asOf,now:session.now(),
      })===true;}catch{/* fail closed */}
      if(!approved)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    }
    let valid=false;
    try{valid=await source.revalidate({
      actorId:actor.actorId,receipt:result.receipt,now:session.now(),
    })===true;}catch{/* revoked/stale source: deny */}
    if(!valid)throw new ApiFailure('FORBIDDEN');
    await betaRecheck(request,session,actor);
    return safe;
  });
}
