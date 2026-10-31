import {z} from 'zod';
const CreditUnitsSchema=z.number().int().nonnegative(); // 1 unit = 0.5 credit

/**
 * Feedback follow-up to merged TASK-00 PR #13. All V1 wire contracts remain
 * untouched; these strict, additive schemas are opt-in until 4-track review.
 * They validate contract consistency, NOT official university requirements,
 * source completeness, actual recognition or graduation eligibility.
 */
const Id=z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/);
const DateTime=z.iso.datetime({offset:true});
const PositiveUnits=CreditUnitsSchema.refine(value=>value>0,{
  message:'Minimum must be positive',
});
const RequirementRef=z.array(Id).min(1).max(100);
export const AcademicTermVNextSchema=z.string().regex(
  /^(19|20|21)\d{2}-[12]$/,{message:'Regular semester must be YYYY-1 or YYYY-2'},
);
export type AcademicTermVNext=z.infer<typeof AcademicTermVNextSchema>;
export const MajorRoleVNextSchema=z.enum([
  'PRIMARY_MAJOR','DOUBLE_MAJOR','MINOR',
]);
export const AcademicRuleScopeVNextSchema=z.strictObject({
  campus:Id,
  primaryMajor:Id,
  secondaryMajor:Id.optional(),
  majorRole:MajorRoleVNextSchema,
  admissionType:Id,
  curriculumVersion:Id,
  cohortFrom:z.number().int().min(1900).max(2100),
  cohortTo:z.number().int().min(1900).max(2100),
}).superRefine((v,ctx)=>{
  if(v.cohortFrom>v.cohortTo)ctx.addIssue({
    code:'custom',path:['cohortTo'],message:'Reversed admissions cohort',
  });
  if(v.majorRole==='PRIMARY_MAJOR'&&v.secondaryMajor)ctx.addIssue({
    code:'custom',path:['secondaryMajor'],message:'Primary-major scope cannot imply second major',
  });
  if(v.majorRole!=='PRIMARY_MAJOR'&&!v.secondaryMajor)ctx.addIssue({
    code:'custom',path:['secondaryMajor'],message:'Second-major/minor identity required',
  });
});
export type AcademicRuleScopeVNext=z.infer<typeof AcademicRuleScopeVNextSchema>;

const RequirementBase={
  id:Id,
  /** Stable semantic identity across versions, not an ID invented from a title. */
  semanticKey:Id,
  sourceClauseIds:RequirementRef,
  exceptionClauseIds:z.array(Id).max(100),
  evidenceRefs:RequirementRef,
};
export const AcademicRequirementVNextSchema=z.discriminatedUnion('kind',[
  z.strictObject({...RequirementBase,kind:z.literal('CREDIT_TOTAL'),
    requiredCreditUnits:PositiveUnits}),
  z.strictObject({...RequirementBase,kind:z.literal('CATEGORY_MINIMUM'),
    areaId:Id,requiredCreditUnits:PositiveUnits}),
  z.strictObject({...RequirementBase,kind:z.literal('REQUIRED_COURSE'),
    canonicalCourseId:Id}),
  z.strictObject({...RequirementBase,kind:z.literal('K_OF_N'),
    courseIds:z.array(Id).min(2).max(100),
    k:z.number().int().positive()}),
  z.strictObject({...RequirementBase,kind:z.literal('NON_CREDIT'),
    criterionId:Id,verificationMode:z.enum(['OFFICIAL','MANUAL','GPA_NOT_COLLECTED'])}),
]).superRefine((r,ctx)=>{
  for(const key of ['sourceClauseIds','exceptionClauseIds','evidenceRefs'] as const){
    if(new Set(r[key]).size!==r[key].length)ctx.addIssue({
      code:'custom',path:[key],message:'Duplicate reference',
    });
  }
  if(r.kind==='K_OF_N'){
    if(r.k>r.courseIds.length)ctx.addIssue({
      code:'custom',path:['k'],message:'k exceeds available courses',
    });
    if(new Set(r.courseIds).size!==r.courseIds.length)ctx.addIssue({
      code:'custom',path:['courseIds'],message:'Duplicate canonical course IDs',
    });
  }
});
export type AcademicRequirementVNext=z.infer<typeof AcademicRequirementVNextSchema>;

export const AcademicClauseVNextSchema=z.strictObject({
  clauseId:Id,
  kind:z.enum(['RULE','EXCEPTION','FOOTNOTE','SCOPE','PROCEDURE']),
  /** Source document must be independently inventoried BEFORE running LLM. */
  sourceSpanRef:Id,
  coverage:z.discriminatedUnion('state',[
    z.strictObject({
      state:z.literal('LINKED'),requirementIds:RequirementRef,
    }),
    z.strictObject({
      state:z.literal('NOT_APPLICABLE'),reason:z.string().trim().min(8).max(300),
      independentlyReviewedBy:Id,
    }),
    z.strictObject({
      state:z.literal('UNREVIEWED'),reason:z.string().trim().min(1),
    }),
  ]),
});
export type AcademicClauseVNext=z.infer<typeof AcademicClauseVNextSchema>;

const sha256=z.string().regex(/^[a-f0-9]{64}$/);
export const AcademicRulePackVNextSchema=z.strictObject({
  version:Id,
  supersedesVersion:Id.optional(),
  sourceDocumentVersion:Id,
  sourceDocumentUrl:z.url().refine(value=>new URL(value).protocol==='https:',{
    message:'Official source must use HTTPS',
  }),
  sourceDocumentSha256:sha256,
  sourcePublishedAt:DateTime,
  effectiveFrom:DateTime,
  effectiveUntil:DateTime.optional(),
  scope:AcademicRuleScopeVNextSchema,
  state:z.enum(['DRAFT','NEEDS_REVIEW','APPROVED']),
  requirements:z.array(AcademicRequirementVNextSchema).min(1).max(200),
  clauseInventory:z.array(AcademicClauseVNextSchema).min(1).max(500),
  /** A checked candidate with ANY blocking warning must not be activated. */
  validationReport:z.strictObject({
    checkedAt:DateTime,
    sourceDocumentSha256:sha256,
    blockingIssues:z.array(z.strictObject({
      code:z.enum([
        'NUMERIC_SOURCE_MISMATCH','CLAUSE_MISSING','EXCEPTION_SCOPE_CONFLICT',
        'SOURCE_CONTRADICTION','PROMPT_INJECTION','UNVERIFIED_ORIGINAL',
        'UNKNOWN_APPLICABILITY','OTHER',
      ]),
      sourceClauseId:Id.optional(),
    })).max(200),
  }).optional(),
  /** Human attests independently checked inventory against original source. */
  inventoryReviewedBy:Id.optional(),
  approvedBy:Id.optional(),
  independentlyCheckedBy:Id.optional(),
  approvedAt:DateTime.optional(),
}).superRefine((v,ctx)=>{
  const problem=(path:(string|number)[],message:string)=>ctx.addIssue({
    code:'custom',path,message,
  });
  if(v.supersedesVersion===v.version)problem(['supersedesVersion'],'Cannot supersede itself');
  if(v.effectiveUntil&&Date.parse(v.effectiveUntil)<=Date.parse(v.effectiveFrom))
    problem(['effectiveUntil'],'Invalid effective period');
  if(v.approvedAt&&Date.parse(v.approvedAt)<Date.parse(v.sourcePublishedAt))
    problem(['approvedAt'],'Approval predates original publication');
  if(Date.parse(v.sourcePublishedAt)>Date.parse(v.effectiveUntil??'9999-12-31T23:59:59.000Z'))
    problem(['sourcePublishedAt'],'Publication after expired effectiveness');
  if(v.state!=='APPROVED'&&(v.approvedBy||v.independentlyCheckedBy||v.approvedAt))
    problem(['state'],'Draft must not carry official sign-off');
  if(v.state==='APPROVED'){
    if(!v.approvedBy||!v.independentlyCheckedBy||!v.approvedAt
      ||v.approvedBy===v.independentlyCheckedBy)
      problem(['approvedBy'],'Approval requires two distinct humans and timestamp');
    if(!v.inventoryReviewedBy||v.inventoryReviewedBy===v.approvedBy)
      problem(['inventoryReviewedBy'],'Independently checked source inventory required');
    if(!v.validationReport||v.validationReport.blockingIssues.length>0
      ||v.validationReport.sourceDocumentSha256!==v.sourceDocumentSha256
      ||(v.approvedAt&&Date.parse(v.validationReport.checkedAt)>Date.parse(v.approvedAt)))
      problem(['validationReport'],'Blocking warnings, unverified source or late check prevent approval');
  }
  const reqIds=new Set<string>(),semanticKeys=new Set<string>();
  for(const [i,req] of v.requirements.entries()){
    if(reqIds.has(req.id))problem(['requirements',i,'id'],'Duplicate requirement ID');
    reqIds.add(req.id);
    if(semanticKeys.has(req.semanticKey))problem([
      'requirements',i,'semanticKey',
    ],'Duplicate semantic requirement key');
    semanticKeys.add(req.semanticKey);
  }
  const inventory=new Map<string,AcademicClauseVNext>();
  for(const [i,c] of v.clauseInventory.entries()){
    if(inventory.has(c.clauseId))problem([
      'clauseInventory',i,'clauseId',
    ],'Duplicate original clause ID');
    inventory.set(c.clauseId,c);
    if(c.coverage.state==='UNREVIEWED'&&v.state==='APPROVED')
      problem(['clauseInventory',i,'coverage'],'Unreviewed original clause');
    if(c.coverage.state==='NOT_APPLICABLE'&&v.state==='APPROVED'
      &&c.coverage.independentlyReviewedBy===v.approvedBy)
      problem(['clauseInventory',i,'coverage'],'One approver cannot self-exempt clause');
    if(c.coverage.state==='LINKED'){
      if(new Set(c.coverage.requirementIds).size!==c.coverage.requirementIds.length)
        problem(['clauseInventory',i,'coverage','requirementIds'],'Duplicate requirement');
      for(const id of c.coverage.requirementIds)
        if(!reqIds.has(id))problem([
          'clauseInventory',i,'coverage','requirementIds',
        ],'Clause links unknown requirement');
    }
  }
  for(const [i,req] of v.requirements.entries()){
    for(const [key,expectedKind] of [
      ['sourceClauseIds','source'],['exceptionClauseIds','exception'],
    ] as const){
      for(const id of req[key]){
        const clause=inventory.get(id);
        if(!clause||clause.coverage.state!=='LINKED'
          ||!clause.coverage.requirementIds.includes(req.id)
          ||(expectedKind==='exception'&&clause.kind!=='EXCEPTION')){
          problem(['requirements',i,key],'Missing reciprocal original clause mapping');
        }
      }
    }
  }
  // A source inventory can still omit clauses: source-level completeness
  // cannot be proven by this JSON. Separate human/source reconciliation required.
  for(const [i,clause] of v.clauseInventory.entries()){
    if(clause.coverage.state!=='LINKED')continue;
    for(const id of clause.coverage.requirementIds){
      const req=v.requirements.find(r=>r.id===id);
      if(req&&!([...req.sourceClauseIds,...req.exceptionClauseIds]
        .includes(clause.clauseId)))
        problem(['clauseInventory',i,'coverage'],'Clause not reciprocally mapped');
    }
  }
});
export type AcademicRulePackVNext=z.infer<typeof AcademicRulePackVNextSchema>;

/**
 * Compare the submitted inventory with an INDEPENDENT inventory of the trusted
 * original document. A self-authored inventory can omit the same clause as
 * an LLM candidate, so inner Zod validation alone is never approval evidence.
 * This helper does not decide whether that independent inventory is correct.
 */
export function verifyAcademicSourceCoverageVNext(
  pack:AcademicRulePackVNext,
  original:{
    sourceDocumentSha256:string;
    clauses:readonly Pick<AcademicClauseVNext,'clauseId'|'kind'|'sourceSpanRef'>[];
  },
):boolean{
  if(pack.sourceDocumentSha256!==original.sourceDocumentSha256
    ||pack.clauseInventory.length!==original.clauses.length)return false;
  const actual=new Map<string,AcademicClauseVNext>();
  for(const clause of pack.clauseInventory){
    if(actual.has(clause.clauseId))return false;
    actual.set(clause.clauseId,clause);
  }
  const seen=new Set<string>();
  for(const clause of original.clauses){
    if(seen.has(clause.clauseId))return false;
    seen.add(clause.clauseId);
    const supplied=actual.get(clause.clauseId);
    if(!supplied||supplied.kind!==clause.kind
      ||supplied.sourceSpanRef!==clause.sourceSpanRef)return false;
  }
  return true;
}

/** Required ingestion boundary for an APPROVED version; caller owns genuine source verification. */
export function parseApprovedAcademicRulePackVNext(
  candidate:unknown,
  trustedOriginal:{
    sourceDocumentSha256:string;
    clauses:readonly Pick<AcademicClauseVNext,'clauseId'|'kind'|'sourceSpanRef'>[];
  },
):AcademicRulePackVNext|null{
  const checked=AcademicRulePackVNextSchema.safeParse(candidate);
  if(!checked.success||checked.data.state!=='APPROVED')return null;
  return verifyAcademicSourceCoverageVNext(checked.data,trustedOriginal)
    ?checked.data:null;
}

export function stableAcademicRequirementIdsVNext(
  previous:AcademicRulePackVNext,next:AcademicRulePackVNext,
):boolean{
  if(next.supersedesVersion!==previous.version)return false;
  const oldKeys=new Map(previous.requirements.map(r=>[r.semanticKey,r.id]));
  const oldIds=new Map(previous.requirements.map(r=>[r.id,r.semanticKey]));
  for(const r of next.requirements){
    if(oldKeys.has(r.semanticKey)&&oldKeys.get(r.semanticKey)!==r.id)return false;
    if(oldIds.has(r.id)&&oldIds.get(r.id)!==r.semanticKey)return false;
  }
  return true;
}
export function selectAcademicRulePackAsOfVNext(
  candidates:readonly AcademicRulePackVNext[],request:{
    asOf:string;campus:string;primaryMajor:string;secondaryMajor?:string;
    majorRole:z.infer<typeof MajorRoleVNextSchema>;admissionType:string;
    curriculumVersion:string;admissionYear:number;
  },
):AcademicRulePackVNext|null{
  const at=Date.parse(request.asOf);
  if(!Number.isFinite(at)||!Number.isInteger(request.admissionYear))return null;
  const applicable=candidates.filter(p=>{
    if(p.state!=='APPROVED'||!p.approvedAt)return false;
    if(Date.parse(p.sourcePublishedAt)>at||Date.parse(p.approvedAt)>at
      ||Date.parse(p.effectiveFrom)>at
      ||(p.effectiveUntil&&Date.parse(p.effectiveUntil)<=at))return false;
    const s=p.scope;
    return s.campus===request.campus&&s.primaryMajor===request.primaryMajor
      &&s.secondaryMajor===request.secondaryMajor
      &&s.majorRole===request.majorRole&&s.admissionType===request.admissionType
      &&s.curriculumVersion===request.curriculumVersion
      &&s.cohortFrom<=request.admissionYear&&request.admissionYear<=s.cohortTo;
  });
  if(!applicable.length)return null;
  // Reject forks, disconnected overlapping rules, or identical version IDs.
  if(new Set(applicable.map(p=>p.version)).size!==applicable.length)return null;
  const byVersion=new Map(applicable.map(p=>[p.version,p]));
  const heads=applicable.filter(p=>!applicable.some(x=>x.supersedesVersion===p.version));
  if(heads.length!==1)return null;
  const head=heads[0]!;
  let cursor:AcademicRulePackVNext|undefined=head;
  const chain=new Set<string>();
  while(cursor&&!chain.has(cursor.version)){
    chain.add(cursor.version);
    if(!cursor.supersedesVersion)break;
    const prior:AcademicRulePackVNext|undefined=byVersion.get(cursor.supersedesVersion);
    if(!prior)break;
    if(!stableAcademicRequirementIdsVNext(prior,cursor))return null;
    cursor=prior;
  }
  return chain.size===applicable.length?head:null;
}

export const AcademicRequirementProgressVNextSchema=z.strictObject({
  requirementId:Id,
  state:z.enum(['SATISFIED','UNSATISFIED','NEEDS_REVIEW','NOT_APPLICABLE','NOT_CHECKED']),
  requiredCreditUnits:CreditUnitsSchema.optional(),
  earnedCreditUnits:CreditUnitsSchema.optional(),
  remainingCreditUnits:CreditUnitsSchema.optional(),
  projectedCreditUnits:CreditUnitsSchema.optional(),
  matchedCoursesCount:z.number().int().nonnegative().optional(),
  requiredCoursesCount:z.number().int().positive().optional(),
  evidenceRefs:z.array(Id).max(100),
  /** NOT_CHECKED is reserved for missing GPA (never silently pass it). */
  notCheckedReason:z.literal('GPA_NOT_COLLECTED').optional(),
  notApplicableReason:z.string().trim().min(8).max(300).optional(),
}).superRefine((v,ctx)=>{
  if(v.state==='SATISFIED'&&v.remainingCreditUnits!==undefined
    &&v.remainingCreditUnits!==0)ctx.addIssue({
      code:'custom',path:['remainingCreditUnits'],message:'Cannot satisfy missing credits',
    });
  if(v.state==='NOT_CHECKED'&&!v.notCheckedReason)ctx.addIssue({
    code:'custom',path:['notCheckedReason'],message:'Unmeasured GPA must be explicit',
  });
  if(v.state!=='NOT_CHECKED'&&v.notCheckedReason)ctx.addIssue({
    code:'custom',path:['notCheckedReason'],message:'Not-checked reason in wrong state',
  });
  if(v.state==='NOT_APPLICABLE'&&!v.notApplicableReason)
    ctx.addIssue({code:'custom',path:['notApplicableReason'],
      message:'Official nonapplicability needs justification'});
  if(v.state==='SATISFIED'&&!v.evidenceRefs.length)ctx.addIssue({
    code:'custom',path:['evidenceRefs'],message:'Satisfied state requires evidence',
  });
  if(v.matchedCoursesCount!==undefined&&v.requiredCoursesCount!==undefined
    &&v.matchedCoursesCount>v.requiredCoursesCount)ctx.addIssue({
    code:'custom',path:['matchedCoursesCount'],message:'Duplicate required course match',
  });
});
export const AcademicPlanIssueVNextSchema=z.strictObject({
  code:z.enum([
    'CREDIT_CAP_EXCEEDED','PREREQUISITE_MISSING','TIMETABLE_CONFLICT',
    'REQUIRED_COURSE_UNOFFERED','SEARCH_LIMIT_REVIEW','NEEDS_REVIEW',
  ]),
  courseRefs:z.array(Id).max(20),
  evidenceRefs:z.array(Id).max(30),
  reasonCode:z.enum([
    'EXCEEDS_APPROVED_LIMIT','UNMET_OFFICIAL_PREREQUISITE',
    'ALL_VERIFIED_SECTIONS_OVERLAP','COURSE_NOT_CONFIRMED',
    'ALLOCATION_SEARCH_LIMIT','UNKNOWN',
  ]).optional(),
}).superRefine((v,ctx)=>{
  const mandatory:{
    [key:string]:string;
  }={
    CREDIT_CAP_EXCEEDED:'EXCEEDS_APPROVED_LIMIT',
    PREREQUISITE_MISSING:'UNMET_OFFICIAL_PREREQUISITE',
    TIMETABLE_CONFLICT:'ALL_VERIFIED_SECTIONS_OVERLAP',
  };
  if(mandatory[v.code]&&v.reasonCode!==mandatory[v.code])ctx.addIssue({
    code:'custom',path:['reasonCode'],
    message:'Planning blocker needs a verified, specific reason',
  });
});
export const AcademicAuditVNextSchema=z.strictObject({
  state:z.enum(['READY','NEEDS_REVIEW','INSUFFICIENT_DATA']),
  rulePackVersion:Id,
  asOf:DateTime,
  earnedCreditUnits:CreditUnitsSchema,
  inProgressCreditUnits:CreditUnitsSchema,
  plannedCreditUnits:CreditUnitsSchema,
  projectedUniqueCreditUnits:CreditUnitsSchema,
  pendingRecognitionCreditUnits:CreditUnitsSchema,
  areaProgress:z.array(z.strictObject({
    areaId:Id,earnedCreditUnits:CreditUnitsSchema,
    projectedCreditUnits:CreditUnitsSchema,
  })).max(30),
  excludedAttempts:z.array(z.strictObject({
    attemptToken:Id,
    reason:z.enum(['RETAKE_SUPERSEDED','DUPLICATE','PENDING_RECOGNITION',
      'OFFICIAL_EXCLUSION','NEEDS_REVIEW']),
  })).max(150),
  requirements:z.array(AcademicRequirementProgressVNextSchema).max(200),
  planIssues:z.array(AcademicPlanIssueVNextSchema).max(100),
  caveats:z.array(z.string().trim().min(1).max(300)).max(50),
}).superRefine((v,ctx)=>{
  if(v.projectedUniqueCreditUnits<v.earnedCreditUnits
    ||v.projectedUniqueCreditUnits>v.earnedCreditUnits+
      v.inProgressCreditUnits+v.plannedCreditUnits)
    ctx.addIssue({code:'custom',path:['projectedUniqueCreditUnits'],
      message:'Projected credits cannot create extra or lose earned credits'});
  if(new Set(v.areaProgress.map(a=>a.areaId)).size!==v.areaProgress.length)
    ctx.addIssue({code:'custom',path:['areaProgress'],'message':'Duplicate area'});
  if(new Set(v.requirements.map(r=>r.requirementId)).size!==v.requirements.length)
    ctx.addIssue({code:'custom',path:['requirements'],message:'Duplicate requirement result'});
  if(new Set(v.excludedAttempts.map(r=>r.attemptToken)).size!==v.excludedAttempts.length)
    ctx.addIssue({code:'custom',path:['excludedAttempts'],message:'Duplicate attempts'});
  if(v.state==='READY'&&v.requirements.some(r=>r.state==='NEEDS_REVIEW'
    ||r.state==='NOT_CHECKED'))ctx.addIssue({
      code:'custom',path:['state'],message:'Unverified requirements block READY',
    });
});
export type AcademicAuditVNext=z.infer<typeof AcademicAuditVNextSchema>;
export function validateAcademicAuditAgainstPackVNext(
  pack:AcademicRulePackVNext,audit:AcademicAuditVNext,
):boolean{
  if(audit.rulePackVersion!==pack.version||pack.state!=='APPROVED')return false;
  if(!pack.approvedAt||Date.parse(pack.approvedAt)>Date.parse(audit.asOf)
    ||Date.parse(pack.sourcePublishedAt)>Date.parse(audit.asOf)
    ||Date.parse(pack.effectiveFrom)>Date.parse(audit.asOf)
    ||(pack.effectiveUntil&&Date.parse(pack.effectiveUntil)<=Date.parse(audit.asOf)))
    return false;
  const ids=new Set(pack.requirements.map(r=>r.id));
  return audit.requirements.length===ids.size&&audit.requirements.every(r=>ids.has(r.requirementId))
    &&audit.requirements.every(r=>{
      const rule=pack.requirements.find(rule=>rule.id===r.requirementId)!;
      if(rule.kind==='NON_CREDIT'&&rule.verificationMode==='GPA_NOT_COLLECTED')
        return r.state==='NOT_CHECKED'
          &&r.notCheckedReason==='GPA_NOT_COLLECTED';
      return r.state!=='NOT_CHECKED';
    });
}
export function validateAcademicNoticeRequirementRefsVNext(
  pack:AcademicRulePackVNext,refs:readonly string[],
):boolean{
  const ids=new Set(pack.requirements.map(x=>x.id));
  return new Set(refs).size===refs.length&&refs.every(ref=>ids.has(ref));
}

export const AcademicCourseCodeResolutionVNextSchema=z.discriminatedUnion('status',[
  z.strictObject({status:z.literal('NEEDS_REVIEW')}),
  z.strictObject({status:z.literal('RESOLVED'),canonicalCourseId:Id,
    sectionId:z.string().regex(/^\d{2}$/).optional()}),
]);
/**
 * Course/section splitting is disabled until the school/source format is
 * independently confirmed. Blank codes or name matches are never guessed.
 */
export function resolveAcademicCourseCodeVNext(input:{
  rawCode:string;
  sourceFormatReviewed:boolean;
  approvedFormat:'COURSE_7_ONLY'|'COURSE_7_SECTION_2';
}):z.infer<typeof AcademicCourseCodeResolutionVNextSchema>{
  if(!input.sourceFormatReviewed)return {status:'NEEDS_REVIEW'};
  const code=input.rawCode.trim().toUpperCase();
  const match=input.approvedFormat==='COURSE_7_SECTION_2'
    ?/^([A-Z0-9]{7})(\d{2})$/.exec(code)
    :/^([A-Z0-9]{7})$/.exec(code);
  if(!match)return {status:'NEEDS_REVIEW'};
  return AcademicCourseCodeResolutionVNextSchema.parse({
    status:'RESOLVED',canonicalCourseId:match[1],
    ...(input.approvedFormat==='COURSE_7_SECTION_2'?{sectionId:match[2]}:{}),
  });
}

export const AcademicOfferingObservationVNextSchema=z.strictObject({
  term:AcademicTermVNextSchema,
  state:z.enum(['OFFERED','CONFIRMED_NOT_OFFERED','UNKNOWN']),
  coverage:z.enum(['COMPLETE_TERM_CATALOG','PARTIAL','NOTICE_ONLY']),
  sourceRef:Id,
  publishedAt:DateTime,
  verifiedAt:DateTime,
}).refine(v=>Date.parse(v.verifiedAt)>=Date.parse(v.publishedAt),{
  path:['verifiedAt'],message:'Evidence cannot be verified before publication',
});
export const AcademicOfficialEventVNextSchema=z.strictObject({
  eventId:Id,
  kind:z.enum(['RESEARCH_LEAVE','RETIREMENT','STAFF_CHANGE','CURRICULUM_CHANGE',
    'COURSE_CANCELLED','REPLACEMENT_CONFIRMED']),
  sourceRef:Id,
  publishedAt:DateTime,
  verifiedAt:DateTime,
  effectiveFrom:DateTime,
  impact:z.enum(['POTENTIAL_ASSIGNMENT_CHANGE','EXPLICIT_COURSE_STATUS']),
  affectedCourseIds:z.array(Id).min(1).max(30),
  effectiveUntil:DateTime.optional(),
}).superRefine((v,ctx)=>{
  if(Date.parse(v.verifiedAt)<Date.parse(v.publishedAt))
    ctx.addIssue({code:'custom',path:['verifiedAt'],
      message:'Cannot verify event before publication'});
  if(v.effectiveUntil&&Date.parse(v.effectiveUntil)<=Date.parse(v.effectiveFrom))
    ctx.addIssue({code:'custom',path:['effectiveUntil'],
      message:'Reversed official-event effective period'});
});
export const OfferingOutlookVNextSchema=z.strictObject({
  courseId:Id,
  targetTerm:AcademicTermVNextSchema,
  asOf:DateTime,
  modelVersion:Id,
  signal:z.enum([
    'CONFIRMED_OFFERED','CONFIRMED_NOT_OFFERED','HISTORICAL_PATTERN',
    'EVENT_REVIEW','INSUFFICIENT_DATA','UNKNOWN',
  ]),
  sourcePublishedAt:DateTime.optional(),
  evidenceRefs:z.array(Id).max(50),
  observations:z.array(AcademicOfferingObservationVNextSchema).max(20),
  officialEvents:z.array(AcademicOfficialEventVNextSchema).max(30),
  sameSeasonObservedTerms:z.number().int().nonnegative(),
  sameSeasonOfferedTerms:z.number().int().nonnegative(),
  alternatives:z.array(z.strictObject({
    courseId:Id,
    status:z.enum(['OFFICIALLY_APPROVED','NEEDS_REVIEW']),
    evidenceRef:Id.optional(),
  })).max(20),
  caveat:z.string().trim().min(1).max(300),
}).superRefine((v,ctx)=>{
  const issue=(path:(string|number)[],message:string)=>ctx.addIssue({
    code:'custom',path,message,
  });
  const asOf=Date.parse(v.asOf),term=parseTerm(v.targetTerm);
  if(v.sourcePublishedAt&&Date.parse(v.sourcePublishedAt)>asOf)
    issue(['sourcePublishedAt'],'Published after historical asOf');
  if(new Set(v.observations.map(o=>o.term)).size!==v.observations.length)
    issue(['observations'],'Duplicate term observation');
  const complete=v.observations.filter(o=>o.coverage==='COMPLETE_TERM_CATALOG'
    &&o.state!=='UNKNOWN'&&o.term.endsWith('-'+term.season));
  const count=complete.length,offered=complete.filter(o=>o.state==='OFFERED').length;
  if(v.sameSeasonObservedTerms!==count||v.sameSeasonOfferedTerms!==offered)
    issue(['sameSeasonObservedTerms'],'Counts must equal independently verified observations');
  for(const [i,o] of v.observations.entries()){
    if(o.term>=v.targetTerm||Date.parse(o.publishedAt)>asOf
      ||Date.parse(o.verifiedAt)>asOf)
      issue(['observations',i],'No future offering history in asOf replay');
  }
  for(const [i,e] of v.officialEvents.entries()){
    if(Date.parse(e.publishedAt)>asOf||Date.parse(e.verifiedAt)>asOf)
      issue(['officialEvents',i],'Future official event leakage');
    if(!e.affectedCourseIds.includes(v.courseId))
      issue(['officialEvents',i,'affectedCourseIds'],'Unrelated official event');
  }
  if(v.signal==='HISTORICAL_PATTERN'&&count<3)
    issue(['signal'],'Pattern requires at least 3 complete same-season terms');
  if(v.signal==='EVENT_REVIEW'&&!v.officialEvents.some(e=>
    e.impact==='POTENTIAL_ASSIGNMENT_CHANGE'))
    issue(['signal'],'EVENT_REVIEW needs a reviewed official event');
  if(v.signal==='CONFIRMED_NOT_OFFERED'&&v.officialEvents.some(e=>
    e.impact==='POTENTIAL_ASSIGNMENT_CHANGE')
    &&!v.officialEvents.some(e=>e.kind==='COURSE_CANCELLED'
      &&e.impact==='EXPLICIT_COURSE_STATUS'))
    issue(['signal'],'Research leave or staff changes do not prove non-offering');
  if(v.signal.startsWith('CONFIRMED_')
    &&(!v.sourcePublishedAt||!v.evidenceRefs.length))
    issue(['sourcePublishedAt'],'Confirmed status needs official published evidence');
  for(const [i,a] of v.alternatives.entries()){
    if(a.courseId===v.courseId)issue(['alternatives',i],'Not an alternative');
    if(a.status==='OFFICIALLY_APPROVED'&&!a.evidenceRef)
      issue(['alternatives',i,'evidenceRef'],'Official substitute needs evidence');
  }
});
function parseTerm(term:string):{year:number;season:string}{
  return {year:Number(term.slice(0,4)),season:term.slice(-1)};
}
export type OfferingOutlookVNext=z.infer<typeof OfferingOutlookVNextSchema>;
