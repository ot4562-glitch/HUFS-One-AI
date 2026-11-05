import {z} from 'zod';
import {AcademicAuditVNextSchema} from './vnext.js';

const Ref=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const Time=z.iso.datetime({offset:true});
const Units=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const Refs=z.array(Ref).max(200);
const {excludedAttempts:_attempts,planIssues:_issues,...AuditFields}=AcademicAuditVNextSchema.shape;
/** Browser projection: no transcript rows, attempt tokens, grades or raw identity. */
export const OwnerDoubleMajorRoleAuditSchema=z.strictObject(AuditFields).superRefine((value,ctx)=>{
  if(!AcademicAuditVNextSchema.safeParse({...value,excludedAttempts:[],planIssues:[]}).success)
    ctx.addIssue({code:'custom',message:'Inconsistent role ledger'});
});
const Pack=z.strictObject({version:Ref.nullable(),state:z.enum(['MISSING','DRAFT','NEEDS_REVIEW','APPROVED'])})
  .refine(value=>(value.state==='MISSING')===(value.version===null),{message:'Missing packs cannot imply a version'});
const RoleFields={majorId:Ref.nullable(),rulePack:Pack,audit:OwnerDoubleMajorRoleAuditSchema.nullable()};
const Impact=z.strictObject({requirementId:Ref,decided:z.boolean(),metWithShared:z.boolean(),metWithoutShared:z.boolean(),
  earnedCreditUnitsWithoutShared:Units.optional(),remainingCreditUnitsWithoutShared:Units.optional(),
  projectedCreditUnitsWithoutShared:Units.optional(),matchedCoursesCountWithoutShared:Units.optional()});
const Overlap=z.strictObject({
  status:z.enum(['NONE','NO_APPROVED_RULE','COVERED_BY_APPROVED_RULE','OVER_APPROVED_LIMIT']),
  sharedCourses:z.array(z.strictObject({courseId:Ref,ledger:z.enum(['EARNED','IN_PROGRESS','PLANNED']),creditUnits:Units,
    primaryAreaIds:Refs,doubleMajorAreaIds:Refs})).max(2000),
  sharedCreditUnits:Units,evidenceRefs:Refs,
  heldRequirementIds:z.strictObject({primary:Refs,doubleMajor:Refs}),
  rowImpacts:z.strictObject({primary:z.array(Impact).max(200),doubleMajor:z.array(Impact).max(200)}),
});
export const OwnerDoubleMajorAuditSchema=z.strictObject({
  status:z.enum(['CHECKED','INPUT_REQUIRED']),state:z.enum(['READY','NEEDS_REVIEW','INSUFFICIENT_DATA']),asOf:Time,
  selection:z.enum(['NONE','UNSET','SELECTED','INPUT_MISSING']),
  missingInputs:z.array(z.enum(['CURRENT_PROFILE','TRANSCRIPT','PRIMARY_RULEPACK','DEGREE_PATH','TRACK'])).max(5),
  uniqueCredits:z.strictObject({earnedCreditUnits:Units,inProgressCreditUnits:Units,plannedCreditUnits:Units,projectedCreditUnits:Units}).nullable(),
  primary:z.strictObject({...RoleFields,role:z.literal('PRIMARY_MAJOR')}),
  doubleMajor:z.strictObject({...RoleFields,role:z.literal('DOUBLE_MAJOR'),status:z.enum(['NOT_CHECKED','NOT_APPLICABLE','INPUT_REQUIRED','RULES_MISSING','CHECKED'])}),
  overlap:Overlap.nullable(),
  disclosure:z.strictObject({mode:z.enum(['REDACTED','OWNER_VERIFIED','GRANT_SCOPED']),visibleCourseRefs:z.array(Ref).max(2000),
    withheldSharedCourseCount:z.number().int().nonnegative().max(2000),grantVersion:Ref.optional()}),
  evidenceLinks:z.array(z.strictObject({evidenceRef:Ref,href:z.url().refine(value=>{
    const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password;
  }),verifiedAt:Time})).max(200),
  versions:z.strictObject({profile:Ref.nullable(),transcript:Ref.nullable(),projection:Ref}),
  caveats:z.array(z.string().min(1).max(300)).min(1).max(50),
}).superRefine((value,ctx)=>{
  const problem=(message:string)=>ctx.addIssue({code:'custom',message});
  if(!value.caveats.includes('NOT_OFFICIAL_GRADUATION_DECISION'))problem('Computed advice must disclaim official graduation');
  if(new Set(value.missingInputs).size!==value.missingInputs.length)problem('Duplicate missing inputs');
  if(value.status==='INPUT_REQUIRED'){
    if(value.state!=='INSUFFICIENT_DATA'||!value.missingInputs.length||value.uniqueCredits!==null||value.primary.audit!==null||
      value.doubleMajor.audit!==null||value.doubleMajor.status!=='NOT_CHECKED'||value.overlap!==null)problem('Missing input cannot produce an audit');
  }else{
    if(value.missingInputs.length||!value.uniqueCredits||!value.primary.audit||!value.primary.majorId||!value.overlap||value.selection==='INPUT_MISSING')problem('Checked input requires a complete primary projection');
    const unique=value.uniqueCredits,primary=value.primary.audit;
    if(unique&&primary&&(unique.earnedCreditUnits!==primary.earnedCreditUnits||unique.inProgressCreditUnits!==primary.inProgressCreditUnits||
      unique.plannedCreditUnits!==primary.plannedCreditUnits||unique.projectedCreditUnits!==primary.projectedUniqueCreditUnits))problem('Unique totals do not match the one transcript');
    if(value.selection==='NONE'&&(value.doubleMajor.status!=='NOT_APPLICABLE'||value.doubleMajor.majorId!==null))problem('NONE is not an unset or selected major');
    if(value.selection==='UNSET'&&(value.doubleMajor.status!=='INPUT_REQUIRED'||value.doubleMajor.majorId!==null||value.state==='READY'))problem('UNSET needs explicit input');
    if(value.selection==='SELECTED'&&(!value.doubleMajor.majorId||!['RULES_MISSING','CHECKED'].includes(value.doubleMajor.status)))problem('Selected major needs matching role status');
    if(value.doubleMajor.status==='CHECKED'&&!value.doubleMajor.audit)problem('Checked double major needs its own audit');
    if(value.doubleMajor.status!=='CHECKED'&&value.doubleMajor.audit!==null)problem('Unchecked double major cannot carry audit');
  }
  for(const role of [value.primary,value.doubleMajor]){
    if(role.audit&&(role.audit.rulePackVersion!==role.rulePack.version||role.audit.asOf!==value.asOf))problem('Role pack/asOf mismatch');
    if(role.audit?.state==='READY'&&role.rulePack.state!=='APPROVED')problem('Unapproved pack cannot claim READY');
    const audit=role.audit,unique=value.uniqueCredits;
    if(audit&&unique&&(audit.earnedCreditUnits!==unique.earnedCreditUnits||audit.inProgressCreditUnits!==unique.inProgressCreditUnits||
      audit.plannedCreditUnits!==unique.plannedCreditUnits||audit.projectedUniqueCreditUnits!==unique.projectedCreditUnits))problem('Both roles must read the same unique transcript totals');
  }
  if(value.state==='READY'&&(value.primary.audit?.state!=='READY'||value.primary.rulePack.state!=='APPROVED'||
    value.selection==='SELECTED'&&(value.doubleMajor.audit?.state!=='READY'||value.doubleMajor.rulePack.state!=='APPROVED')))problem('READY needs approved role audits');
  if(value.primary.rulePack.version!==null&&value.doubleMajor.rulePack.version===value.primary.rulePack.version)problem('Roles require different rule packs');
  const visible=new Set(value.disclosure.visibleCourseRefs);
  if(visible.size!==value.disclosure.visibleCourseRefs.length||value.disclosure.mode==='REDACTED'&&visible.size)problem('Invalid course disclosure');
  if(value.disclosure.mode==='GRANT_SCOPED'&&!value.disclosure.grantVersion)problem('Grant scope needs a current grant version');
  const overlap=value.overlap;
  if(overlap){
    if(new Set(overlap.sharedCourses.map(course=>course.courseId)).size!==overlap.sharedCourses.length||
      overlap.sharedCourses.some(course=>!visible.has(course.courseId))||overlap.sharedCourses.reduce((sum,course)=>sum+course.creditUnits,0)>overlap.sharedCreditUnits)problem('Invalid shared-course disclosure/totals');
    if(overlap.status==='COVERED_BY_APPROVED_RULE'&&(!overlap.evidenceRefs.length||value.doubleMajor.rulePack.state!=='APPROVED'))problem('Covered overlap needs approved evidence');
    if(overlap.status==='NONE'&&(overlap.sharedCreditUnits!==0||overlap.sharedCourses.length||value.disclosure.withheldSharedCourseCount))problem('No overlap cannot carry shared credits');
    for(const role of ['primary','doubleMajor'] as const){
      const rows=value[role].audit?.requirements??[];
      const impacts=overlap.rowImpacts[role],held=overlap.heldRequirementIds[role];
      if(new Set(held).size!==held.length||new Set(impacts.map(row=>row.requirementId)).size!==impacts.length||
        impacts.some(row=>!rows.some(item=>item.requirementId===row.requirementId))||held.some(id=>
          !rows.some(row=>row.requirementId===id&&row.state==='NEEDS_REVIEW')||!impacts.some(row=>row.requirementId===id&&!row.decided))||
        impacts.some(row=>!row.decided&&!held.includes(row.requirementId)))problem('Uncertain overlap rows must remain held');
    }
  }
  if(value.evidenceLinks.some(link=>Date.parse(link.verifiedAt)>Date.parse(value.asOf)))problem('Future evidence');
});
export type OwnerDoubleMajorAudit=z.infer<typeof OwnerDoubleMajorAuditSchema>;
