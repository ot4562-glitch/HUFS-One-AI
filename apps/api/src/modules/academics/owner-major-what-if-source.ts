import {isDeepStrictEqual} from 'node:util';
import {z} from 'zod';
import {
  AcademicDegreePathVNextSchema,OwnerMajorWhatIfReadySchema,OwnerMajorWhatIfResponseSchema,
  OwnerMajorWhatIfScenarioSchema,verifyAcademicSourceCoverageVNext,
} from '@hufs-one/contracts';
import {
  buildMajorWhatIf,MAJOR_WHAT_IF_CORE_VERSION,
} from '../../../../../packages/core/src/academics/major-what-if.js';
import type {
  DegreePath,ProgramOffer,WhatIfProjection,
} from '../../../../../packages/core/src/academics/major-what-if.js';
import type {DoubleMajorAttempt,MajorRulePack} from '../../../../../packages/core/src/academics/double-major.js';
import type {LedgerRequirement} from '../../../../../packages/core/src/academics/ledger.js';
import type {TrustedOwnerMajorWhatIfSource} from '../profiles/owner-major-what-if-http.js';
import {
  ApprovedOwnerDoubleMajorInputSchema,ownerRulePackDocumentSources,
} from './owner-double-major-source.js';

const Ref=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const Time=z.iso.datetime({offset:true});
const Receipt=z.string().min(8).max(256);
// Reuse the reviewed full VNext/original/source binding and canonical transcript
// formats. Never accept a browser RulePack or reduce it before scope validation.
const RolePack=ApprovedOwnerDoubleMajorInputSchema.shape.primary.unwrap();
const Transcript=ApprovedOwnerDoubleMajorInputSchema.shape.transcript.unwrap();
const Source=RolePack.shape.source;
const Enrollment=z.strictObject({primaryProgramId:Ref,
  secondary:z.strictObject({role:z.enum(['DOUBLE_MAJOR','MINOR']),programId:Ref}).optional()});
const Overlap=z.strictObject({version:Ref,state:z.literal('APPROVED'),
  primaryRulePackVersion:Ref,secondaryRulePackVersion:Ref,
  maxSharedCreditUnits:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  evidenceRefs:z.array(Ref).min(1).max(60),verifiedAt:Time,source:Source});
const Bundle=z.strictObject({version:Ref,degreePath:AcademicDegreePathVNextSchema,enrollment:Enrollment,
  primary:RolePack,secondary:RolePack.optional(),constituentVersions:z.array(Ref).min(1).max(2),
  overlapRule:Overlap.optional()});

/** Server-only, independently reviewed immutable projection. Parsing is a
 * consistency check, not approval. Bundle/policy versions must come from the
 * external approval registry and bind their exact contents; never mint them by
 * concatenating pack versions. No raw intake, default authority or database read. */
export const ApprovedOwnerMajorWhatIfInputSchema=z.strictObject({
  format:z.literal('OWNER_MAJOR_WHAT_IF_V1'),
  profile:z.strictObject({version:Ref,campus:Ref,cohort:z.number().int().min(1900).max(2100),
    admissionType:Ref,curriculumVersion:Ref,track:Ref.optional(),source:Source}),
  transcript:Transcript,current:Bundle,hypothetical:Bundle,
  overlapPolicy:z.strictObject({version:Ref,ruleVersions:z.array(Ref).max(2),verifiedAt:Time}),
  approval:OwnerMajorWhatIfReadySchema.shape.approval,
  evidenceLinks:OwnerMajorWhatIfReadySchema.shape.evidenceLinks,
});
export type ApprovedOwnerMajorWhatIfInput=z.infer<typeof ApprovedOwnerMajorWhatIfInputSchema>;
const Snapshot=z.strictObject({actorId:Ref,asOf:Time,receipt:Receipt,currentVersion:Ref,
  scenario:OwnerMajorWhatIfScenarioSchema,input:z.unknown()});
export type OwnerMajorWhatIfSnapshot=z.infer<typeof Snapshot>;
type Inspect=Parameters<TrustedOwnerMajorWhatIfSource['inspect']>[0];
type Revalidate=Parameters<TrustedOwnerMajorWhatIfSource['revalidate']>[0];
export interface TrustedOwnerMajorWhatIfLoader {
  /** Current consent/source/owner heads, verified profile/transcript, exact
   * scenario and independently registered bundle manifests, read atomically.
   * The HTTP route calls independent mayInspect before this private read. */
  load(input:Inspect):Promise<OwnerMajorWhatIfSnapshot|null>;
  /** Bind ALL fields, receipt and current owner/profile/transcript/catalog/
   * RulePack/approval/permission heads. Refuse replay, expiry and revocation.
   * This is required even for a blocked calculation, and must never default true. */
  revalidate(input:Revalidate):Promise<boolean>;
}
const InspectRequest=z.strictObject({actorId:Ref,scenario:OwnerMajorWhatIfScenarioSchema,
  now:Time,expectedCurrentVersion:Ref.optional()});
const RevalidateRequest=InspectRequest.omit({expectedCurrentVersion:true}).extend({
  asOf:Time,sourceReceipt:Receipt,currentVersion:Ref,
});
type Input=ApprovedOwnerMajorWhatIfInput;
type RuleBinding=Input['current']['primary'];
type RuleBundle=Input['current'];

function degreePath(bundle:RuleBundle):DegreePath {
  const second=bundle.enrollment.secondary;
  if(!second)return 'ADVANCED_SINGLE';
  switch(second.role){
    case 'DOUBLE_MAJOR':return 'DOUBLE_MAJOR';
    case 'MINOR':return 'ADVANCED_PLUS_MINOR';
  }
}
function corePack(binding:RuleBinding):MajorRulePack {
  const requirements:LedgerRequirement[]=binding.pack.requirements.map(requirement=>{
    const {sourceClauseIds:_clauses,exceptionClauseIds:_exceptions,semanticKey:_semantic,...core}=requirement;
    return core;
  });
  return {rulePackVersion:binding.pack.version,rulePackState:binding.pack.state,
    requirements,courseAreas:binding.courseAreas};
}
function validateBinding(input:Input,bundle:RuleBundle,binding:RuleBinding,
  role:'PRIMARY_MAJOR'|'DOUBLE_MAJOR'|'MINOR',asOf:number,links:Set<string>):void {
  const {pack,trustedOriginal}=binding,scope=pack.scope,profile=input.profile;
  const second=bundle.enrollment.secondary;
  ownerRulePackDocumentSources(binding);
  if(scope.majorRole!==role||scope.primaryMajor!==bundle.enrollment.primaryProgramId
    ||role!=='PRIMARY_MAJOR'&&scope.secondaryMajor!==second?.programId
    ||scope.campus!==profile.campus||scope.admissionType!==profile.admissionType
    ||scope.curriculumVersion!==profile.curriculumVersion
    ||profile.cohort<scope.cohortFrom||profile.cohort>scope.cohortTo
    ||role==='PRIMARY_MAJOR'&&scope.degreePath===undefined
     ||scope.degreePath!==undefined&&scope.degreePath!==bundle.degreePath
    ||scope.track!==undefined&&scope.track!==profile.track
    ||Date.parse(pack.sourcePublishedAt)>asOf||Date.parse(pack.effectiveFrom)>asOf
    ||pack.effectiveUntil!==undefined&&Date.parse(pack.effectiveUntil)<=asOf
    ||pack.approvedAt!==undefined&&Date.parse(pack.approvedAt)>asOf
    ||pack.validationReport!==undefined&&Date.parse(pack.validationReport.checkedAt)>asOf
    ||pack.sourceDocuments?.some(document=>Date.parse(document.publishedAt)>asOf)
    ||!verifyAcademicSourceCoverageVNext(pack,trustedOriginal))
    throw new Error('Academic RulePack outside the verified role, scope, original or time');
  if(role!=='PRIMARY_MAJOR'&&pack.requirements.some(r=>r.kind==='CREDIT_TOTAL'))
    throw new Error('Secondary program cannot redefine unique graduation totals');
  if(pack.requirements.some(r=>r.evidenceRefs.some(ref=>!links.has(ref))))
    throw new Error('Unbound academic requirement evidence');
}

/** Validate both original bundles before dropping source/scope metadata for core.
 * Shared offers must be identical. The core has one secondary offer per role/ID;
 * incompatible scopes during a primary change remain unavailable, not merged. */
function programsFor(input:Input,asOf:string):ProgramOffer[] {
  const at=Date.parse(asOf),links=new Set(input.evidenceLinks.map(link=>link.evidenceRef));
  if(links.size!==input.evidenceLinks.length||input.evidenceLinks.some(link=>Date.parse(link.verifiedAt)>at)
    ||Date.parse(input.approval.verifiedAt)>at||Date.parse(input.overlapPolicy.verifiedAt)>at)
    throw new Error('Ambiguous or future academic evidence');
  if(input.current.version===input.hypothetical.version&&!isDeepStrictEqual(input.current,input.hypothetical))
    throw new Error('Academic bundle version collision');
  const catalog=new Map<string,{offer:ProgramOffer;binding:RuleBinding;overlap?:RuleBundle['overlapRule']}>();
  const overlapRules=new Map<string,NonNullable<RuleBundle['overlapRule']>>();
  const add=(offer:ProgramOffer,binding:RuleBinding,overlap?:RuleBundle['overlapRule'])=>{
    const key=JSON.stringify([offer.role,offer.programId,offer.role==='PRIMARY_MAJOR'?offer.degreePath:offer.primaryProgramId??null]);
    const candidate={offer,binding,...(overlap?{overlap}:{})},previous=catalog.get(key);
    if(previous&&!isDeepStrictEqual(previous,candidate))throw new Error('Conflicting academic program bindings');
    catalog.set(key,candidate);
  };
  for(const bundle of [input.current,input.hypothetical]){
    const second=bundle.enrollment.secondary;
    if(bundle.degreePath!==degreePath(bundle)||!!second!==!!bundle.secondary
      ||second?.programId===bundle.enrollment.primaryProgramId)
      throw new Error('Academic enrollment does not match bundle');
    const versions=[bundle.primary.pack.version,...(bundle.secondary?[bundle.secondary.pack.version]:[])];
    if(new Set(versions).size!==versions.length||!isDeepStrictEqual(versions,bundle.constituentVersions))
      throw new Error('Unattested academic bundle constituents');
    validateBinding(input,bundle,bundle.primary,'PRIMARY_MAJOR',at,links);
    if(second&&bundle.secondary)validateBinding(input,bundle,bundle.secondary,second.role,at,links);
    const overlap=bundle.overlapRule;
    if(overlap){
      if(!bundle.secondary||overlap.primaryRulePackVersion!==bundle.primary.pack.version
        ||overlap.secondaryRulePackVersion!==bundle.secondary.pack.version
        ||Date.parse(overlap.verifiedAt)>at||overlap.evidenceRefs.some(ref=>!links.has(ref))
        ||new Set(overlap.evidenceRefs).size!==overlap.evidenceRefs.length)
        throw new Error('Unbound academic overlap rule');
      const previous=overlapRules.get(overlap.version);
      if(previous&&!isDeepStrictEqual(previous,overlap))throw new Error('Overlap rule version collision');
      overlapRules.set(overlap.version,overlap);
    }
    add({role:'PRIMARY_MAJOR',programId:bundle.enrollment.primaryProgramId,
      degreePath:bundle.degreePath,pack:corePack(bundle.primary)},bundle.primary);
    if(second&&bundle.secondary)add({role:second.role,programId:second.programId,
       primaryProgramId:bundle.enrollment.primaryProgramId,
      pack:{...corePack(bundle.secondary),...(overlap?{overlapRule:{
        maxSharedCreditUnits:overlap.maxSharedCreditUnits,evidenceRefs:overlap.evidenceRefs}}:{})}},
    bundle.secondary,overlap);
  }
  if(new Set(input.overlapPolicy.ruleVersions).size!==input.overlapPolicy.ruleVersions.length
    ||!isDeepStrictEqual([...overlapRules.keys()].sort(),[...input.overlapPolicy.ruleVersions].sort()))
    throw new Error('Unattested overlap policy constituents');
  const approval=input.approval;
  if(approval.currentRulePackVersion!==input.current.version
    ||approval.hypotheticalRulePackVersion!==input.hypothetical.version
    ||approval.cohortApplicabilityVersion!==input.profile.version
    ||approval.transcriptProjectionVersion!==input.transcript.version
    ||approval.overlapPolicyVersion!==input.overlapPolicy.version
    ||approval.coreVersion!==MAJOR_WHAT_IF_CORE_VERSION)
    throw new Error('Academic snapshot does not match independent proof versions');
  return [...catalog.values()].map(item=>item.offer);
}
function projection(core:WhatIfProjection,bundle:RuleBundle) {
  if(!isDeepStrictEqual(core.rulePackVersions,bundle.constituentVersions)
    ||!isDeepStrictEqual(core.enrollment,bundle.enrollment)||core.degreePath!==bundle.degreePath)
    throw new Error('Core selected a different academic bundle');
  // #107 has no review marker. Erasing this list would present an undecided row
  // as a settled shortfall. Until a reviewed wire extension, fail closed.
  if(core.reviewRequirementIds.length)throw new Error('Academic requirements still need review');
  return {role:core.role,asOf:core.asOf,rulePackVersion:bundle.version,
    earnedCreditUnits:core.earnedCreditUnits,remainingCreditUnits:core.remainingCreditUnits,requirements:core.requirements};
}

/** Explicit opt-in bridge. Rights and academic activation stay independent in
 * owner-major-what-if-http.ts; this source never grants permission or approval. */
export function createOwnerMajorWhatIfSource(loader:TrustedOwnerMajorWhatIfLoader):TrustedOwnerMajorWhatIfSource {
  return {
    inspect:async raw=>{
      const request=InspectRequest.parse(raw);
      const loaded=await loader.load(structuredClone({actorId:request.actorId,scenario:request.scenario,now:request.now,
        ...(request.expectedCurrentVersion===undefined?{}:{expectedCurrentVersion:request.expectedCurrentVersion})}));
      if(!loaded)throw new Error('Approved owner What-if snapshot unavailable');
      const snapshot=Snapshot.parse(structuredClone(loaded));
      if(snapshot.actorId!==request.actorId||!isDeepStrictEqual(snapshot.scenario,request.scenario)
        ||Date.parse(snapshot.asOf)>Date.parse(request.now))throw new Error('Wrong owner What-if snapshot');
      const input=ApprovedOwnerMajorWhatIfInputSchema.parse(snapshot.input);
      const programs=programsFor(input,snapshot.asOf);
      const attempts:DoubleMajorAttempt[]=input.transcript.attempts.map(attempt=>{
        const {term,supersedesAttemptToken,retakeApprovalRef,...required}=attempt;
        return {...required,...(term===undefined?{}:{term}),
          ...(supersedesAttemptToken===undefined?{}:{supersedesAttemptToken}),
          ...(retakeApprovalRef===undefined?{}:{retakeApprovalRef})};
      });
      const enrollment=input.current.enrollment;
      const current={primaryProgramId:enrollment.primaryProgramId,...(enrollment.secondary?{secondary:enrollment.secondary}:{})};
      const result=buildMajorWhatIf({asOf:snapshot.asOf,scenario:request.scenario,current,attempts,programs});
      const base={asOf:result.asOf,scenario:result.scenario,caveat:'HYPOTHETICAL_NOT_OFFICIAL' as const};
      const check=OwnerMajorWhatIfResponseSchema.parse(result.state==='BLOCKED_DEPENDENCY'
        ?{...base,state:result.state,blockers:result.blockers}
        :{...base,state:result.state,current:projection(result.current,input.current),
          hypothetical:projection(result.hypothetical,input.hypothetical),delta:result.delta,
          versions:{currentRulePack:input.current.version,hypotheticalRulePack:input.hypothetical.version,
            cohort:input.profile.version,overlapPolicy:input.overlapPolicy.version,
            transcriptProjection:input.transcript.version,core:result.coreVersion},
          approval:input.approval,evidenceLinks:input.evidenceLinks});
      return {check,receipt:snapshot.receipt,currentVersion:snapshot.currentVersion};
    },
    revalidate:async raw=>{
      const parsed=RevalidateRequest.safeParse(raw);
      if(!parsed.success||Date.parse(parsed.data.asOf)>Date.parse(parsed.data.now))return false;
      try{return await loader.revalidate(structuredClone(parsed.data))===true;}
      catch{return false;}
    },
  };
}
