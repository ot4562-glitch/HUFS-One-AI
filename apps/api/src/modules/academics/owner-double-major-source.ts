import {z} from 'zod';
import {AcademicRulePackVNextSchema,verifyAcademicSourceCoverageVNext} from '@hufs-one/contracts';
import {OwnerDoubleMajorAuditSchema} from '../../../../../packages/contracts/src/academics/double-major.js';
import type {OwnerDoubleMajorAudit} from '../../../../../packages/contracts/src/academics/double-major.js';
import {buildDoubleMajorAudit} from '../../../../../packages/core/src/academics/double-major.js';
import type {DoubleMajorAttempt,MajorRulePack} from '../../../../../packages/core/src/academics/double-major.js';
import type {LedgerRequirement} from '../../../../../packages/core/src/academics/ledger.js';

const Ref=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const Time=z.iso.datetime({offset:true});
const Units=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const OwnerDoubleMajorSourceRefSchema=z.strictObject({sourceId:Ref,revisionId:Ref,permissionRef:Ref});
const Source=OwnerDoubleMajorSourceRefSchema;
const Secondary=z.discriminatedUnion('status',[
  z.strictObject({status:z.literal('NONE')}),z.strictObject({status:z.literal('UNSET')}),
  z.strictObject({status:z.literal('SELECTED'),majorId:Ref}),
]);
const Profile=z.strictObject({version:Ref,campus:Ref,primaryMajor:Ref,cohort:z.number().int().min(1900).max(2100),
  admissionType:Ref,curriculumVersion:Ref,secondaryMajor:Secondary,source:Source});
const Attempt=z.strictObject({attemptToken:Ref,canonicalCourseId:Ref,creditUnits:Units,
  ledger:z.enum(['EARNED','IN_PROGRESS','PLANNED']),recognition:z.enum(['RECOGNIZED','PENDING','EXCLUDED']),
  term:z.string().regex(/^(19|20|21)\d{2}-[12SW]$/).optional(),supersedesAttemptToken:Ref.optional(),retakeApprovalRef:Ref.optional()});
const RolePack=z.strictObject({pack:AcademicRulePackVNextSchema,
  trustedOriginal:z.strictObject({sourceDocumentSha256:z.string().regex(/^[a-f0-9]{64}$/),clauses:z.array(z.strictObject({
    clauseId:Ref,kind:z.enum(['RULE','EXCEPTION','FOOTNOTE','SCOPE','PROCEDURE']),sourceSpanRef:Ref,
  })).min(1).max(500)}),courseAreas:z.record(Ref,z.array(Ref).max(30)).refine(value=>Object.keys(value).length<=5000),
  source:Source,catalogSource:Source});
/** Private operator format. Never accepted in an HTTP request. Review of the
 * immutable projection is not substituted for a RulePack's independent approval. */
export const ApprovedOwnerDoubleMajorInputSchema=z.strictObject({
  format:z.literal('CURRENT_DOUBLE_MAJOR_V1'),profile:Profile.nullable(),
  transcript:z.strictObject({version:Ref,state:z.literal('APPROVED'),source:Source,attempts:z.array(Attempt).max(2000)}).nullable(),
  primary:RolePack.nullable(),doubleMajor:RolePack.nullable(),
  overlapRule:z.strictObject({version:Ref,state:z.literal('APPROVED'),primaryRulePackVersion:Ref,doubleMajorRulePackVersion:Ref,
    maxSharedCreditUnits:Units,evidenceRefs:z.array(Ref).min(1).max(100),verifiedAt:Time,source:Source}).nullable(),
  approval:z.strictObject({consentVersion:Ref,sourceRightsVersion:Ref,coreVersion:z.literal('double-major-v1'),verifiedAt:Time}),
  evidenceLinks:z.array(z.strictObject({evidenceRef:Ref,href:z.url().refine(value=>{
    const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password;
  }),verifiedAt:Time})).max(200),
  visibility:z.strictObject({mode:z.enum(['REDACTED','OWNER_VERIFIED','GRANT_SCOPED']),allowedCourseRefs:z.array(Ref).max(2000),grantVersion:Ref.optional()}),
});
export type ApprovedOwnerDoubleMajorInput=z.infer<typeof ApprovedOwnerDoubleMajorInputSchema>;
export interface OwnerDoubleMajorSnapshot {actorId:string;asOf:string;receipt:string;projectionVersion:string;input:unknown}
export interface TrustedOwnerDoubleMajorSnapshots {
  load(input:{actorId:string;now:string}):Promise<OwnerDoubleMajorSnapshot|null>;
  /** Live consent, profile/transcript/catalog/RulePack/source heads and actor rights. */
  revalidate(input:{actorId:string;receipt:string;now:string}):Promise<boolean>;
}
export interface TrustedOwnerDoubleMajorSource {
  inspect(input:{actorId:string;now:string}):Promise<{check:OwnerDoubleMajorAudit;receipt:string}>;
  revalidate(input:{actorId:string;receipt:string;now:string}):Promise<boolean>;
}
export function ownerDoubleMajorInputRefs(input:ApprovedOwnerDoubleMajorInput){
  return [input.profile?.source,input.transcript?.source,input.primary?.source,input.primary?.catalogSource,
    input.doubleMajor?.source,input.doubleMajor?.catalogSource,input.overlapRule?.source].filter((value):value is z.infer<typeof Source>=>!!value);
}

/** Scope/currentness checks apply to drafts too; drafts never become approved by parsing. */
export function validateOwnerDoubleMajorInput(raw:unknown,asOf:string):ApprovedOwnerDoubleMajorInput {
  const input=ApprovedOwnerDoubleMajorInputSchema.parse(raw);
  Time.parse(asOf);
  const profile=input.profile;
  if(!profile&&(input.primary||input.doubleMajor||input.overlapRule))throw new Error('Current academic profile missing');
  if(profile?.secondaryMajor.status!=='SELECTED'&&(input.doubleMajor||input.overlapRule))throw new Error('Unselected secondary pack');
  if(profile?.secondaryMajor.status==='SELECTED'&&profile.primaryMajor===profile.secondaryMajor.majorId)throw new Error('Duplicate major roles');
  if(Date.parse(input.approval.verifiedAt)>Date.parse(asOf)||input.evidenceLinks.some(link=>Date.parse(link.verifiedAt)>Date.parse(asOf)))throw new Error('Future academic approval');
  const links=new Map(input.evidenceLinks.map(link=>[link.evidenceRef,link]));
  if(links.size!==input.evidenceLinks.length)throw new Error('Ambiguous academic evidence');
  for(const [role,binding] of [['PRIMARY_MAJOR',input.primary],['DOUBLE_MAJOR',input.doubleMajor]] as const){
    if(!binding)continue;
    const pack=binding.pack,scope=pack.scope;
    if(!profile||scope.majorRole!==role||scope.campus!==profile.campus||scope.primaryMajor!==profile.primaryMajor||
      scope.admissionType!==profile.admissionType||scope.curriculumVersion!==profile.curriculumVersion||
      profile.cohort<scope.cohortFrom||profile.cohort>scope.cohortTo||
      (role==='DOUBLE_MAJOR'&&(profile.secondaryMajor.status!=='SELECTED'||scope.secondaryMajor!==profile.secondaryMajor.majorId))||
      Date.parse(pack.sourcePublishedAt)>Date.parse(asOf)||Date.parse(pack.effectiveFrom)>Date.parse(asOf)||
      pack.effectiveUntil&&Date.parse(pack.effectiveUntil)<=Date.parse(asOf)||pack.approvedAt&&Date.parse(pack.approvedAt)>Date.parse(asOf)||
      !verifyAcademicSourceCoverageVNext(pack,binding.trustedOriginal))throw new Error('Academic pack outside approved scope/original');
    if(role==='DOUBLE_MAJOR'&&pack.requirements.some(requirement=>requirement.kind==='CREDIT_TOTAL'))throw new Error('Double major cannot redefine unique graduation totals');
    if(pack.requirements.flatMap(requirement=>requirement.evidenceRefs).some(ref=>!links.has(ref)))throw new Error('Unbound requirement evidence');
  }
  if(input.primary&&input.doubleMajor&&input.primary.pack.version===input.doubleMajor.pack.version)throw new Error('Role pack version collision');
  if(input.overlapRule&&(!input.primary||!input.doubleMajor||input.overlapRule.primaryRulePackVersion!==input.primary.pack.version||
    input.overlapRule.doubleMajorRulePackVersion!==input.doubleMajor.pack.version||Date.parse(input.overlapRule.verifiedAt)>Date.parse(asOf)||
    input.overlapRule.evidenceRefs.some(ref=>!links.has(ref))))throw new Error('Unbound overlap approval');
  if(new Set(input.visibility.allowedCourseRefs).size!==input.visibility.allowedCourseRefs.length||
    input.visibility.mode==='REDACTED'&&input.visibility.allowedCourseRefs.length||input.visibility.mode==='GRANT_SCOPED'&&!input.visibility.grantVersion)throw new Error('Invalid academic disclosure');
  return input;
}

function corePack(binding:NonNullable<ApprovedOwnerDoubleMajorInput['primary']>):MajorRulePack {
  const requirements:LedgerRequirement[]=binding.pack.requirements.map(requirement=>{
    const {sourceClauseIds:_source,exceptionClauseIds:_exceptions,semanticKey:_semantic,...core}=requirement;
    return core;
  });
  return {rulePackVersion:binding.pack.version,rulePackState:binding.pack.state,requirements,courseAreas:binding.courseAreas};
}
export function createTrustedOwnerDoubleMajorSource({snapshots}:{snapshots:TrustedOwnerDoubleMajorSnapshots}):TrustedOwnerDoubleMajorSource {
  return {
    inspect:async request=>{
      Time.parse(request.now);
      const loaded=await snapshots.load(request);
      if(!loaded)throw new Error('Approved current double-major input unavailable');
      const snapshot=structuredClone(loaded);
      if(snapshot.actorId!==request.actorId||snapshot.asOf!==request.now||!Ref.safeParse(snapshot.projectionVersion).success||
        typeof snapshot.receipt!=='string'||snapshot.receipt.length<8||snapshot.receipt.length>256)throw new Error('Wrong owner academic snapshot');
      const input=validateOwnerDoubleMajorInput(snapshot.input,snapshot.asOf);
      const profile=input.profile;
      const selection=profile?.secondaryMajor.status??'INPUT_MISSING';
      const primary={role:'PRIMARY_MAJOR' as const,majorId:profile?.primaryMajor??null,rulePack:{version:input.primary?.pack.version??null,state:input.primary?.pack.state??'MISSING' as const}};
      const secondary={role:'DOUBLE_MAJOR' as const,majorId:profile?.secondaryMajor.status==='SELECTED'?profile.secondaryMajor.majorId:null,
        rulePack:{version:input.doubleMajor?.pack.version??null,state:input.doubleMajor?.pack.state??'MISSING' as const}};
      const missingInputs:OwnerDoubleMajorAudit['missingInputs']=[];
      if(!profile)missingInputs.push('CURRENT_PROFILE');
      if(!input.transcript)missingInputs.push('TRANSCRIPT');
      if(!input.primary)missingInputs.push('PRIMARY_RULEPACK');
      const base={asOf:snapshot.asOf,selection,versions:{profile:profile?.version??null,transcript:input.transcript?.version??null,projection:snapshot.projectionVersion},
        evidenceLinks:[] as ApprovedOwnerDoubleMajorInput['evidenceLinks'],
        disclosure:{mode:input.visibility.mode,visibleCourseRefs:[] as string[],withheldSharedCourseCount:0,...(input.visibility.grantVersion?{grantVersion:input.visibility.grantVersion}:{})},
        caveats:['NOT_OFFICIAL_GRADUATION_DECISION']};
      let check:OwnerDoubleMajorAudit;
      if(missingInputs.length){
        check=OwnerDoubleMajorAuditSchema.parse({...base,status:'INPUT_REQUIRED',state:'INSUFFICIENT_DATA',missingInputs,uniqueCredits:null,
          primary:{...primary,audit:null},doubleMajor:{...secondary,status:'NOT_CHECKED',audit:null},overlap:null});
      }else{
        const overlapRule=input.overlapRule;
        const doubleMajor=selection==='SELECTED'?{status:'SELECTED' as const,...(input.doubleMajor?{pack:{...corePack(input.doubleMajor),
          ...(overlapRule?{overlapRule:{maxSharedCreditUnits:overlapRule.maxSharedCreditUnits,evidenceRefs:overlapRule.evidenceRefs}}:{})}}:{})}:
          {status:selection as 'NONE'|'UNSET'};
        const core=buildDoubleMajorAudit({asOf:snapshot.asOf,attempts:input.transcript!.attempts as DoubleMajorAttempt[],primary:corePack(input.primary!),doubleMajor});
        const safeAudit=(audit:typeof core.primary)=>{const {excludedAttempts:_excluded,planIssues:_plans,...safe}=audit;return safe;};
        const allowed=new Set(input.visibility.allowedCourseRefs);
        const sharedCourses=core.overlap.sharedCourses.filter(course=>allowed.has(course.courseId));
        const evidence=new Set([...core.primary.requirements.flatMap(row=>row.evidenceRefs),
          ...(core.doubleMajor.status==='CHECKED'?core.doubleMajor.audit.requirements.flatMap(row=>row.evidenceRefs):[]),...core.overlap.evidenceRefs]);
        check=OwnerDoubleMajorAuditSchema.parse({...base,status:'CHECKED',state:core.state,missingInputs:[],uniqueCredits:core.uniqueCredits,
          primary:{...primary,audit:safeAudit(core.primary)},doubleMajor:{...secondary,status:core.doubleMajor.status,
            audit:core.doubleMajor.status==='CHECKED'?safeAudit(core.doubleMajor.audit):null},
          overlap:{...core.overlap,sharedCourses},disclosure:{...base.disclosure,visibleCourseRefs:sharedCourses.map(course=>course.courseId),
            withheldSharedCourseCount:core.overlap.sharedCourses.length-sharedCourses.length},
          evidenceLinks:input.evidenceLinks.filter(link=>evidence.has(link.evidenceRef)),caveats:[...base.caveats,...core.caveats]});
      }
      return {check,receipt:snapshot.receipt};
    },
    revalidate:async input=>snapshots.revalidate(input),
  };
}
