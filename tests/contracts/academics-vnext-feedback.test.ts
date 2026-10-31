import {describe,it,expect} from 'vitest';
import {
  AcademicTermVNextSchema,AcademicRulePackVNextSchema,
  AcademicRequirementVNextSchema,AcademicAuditVNextSchema,
  OfferingOutlookVNextSchema,stableAcademicRequirementIdsVNext,
  selectAcademicRulePackAsOfVNext,validateAcademicAuditAgainstPackVNext,
  verifyAcademicSourceCoverageVNext,parseApprovedAcademicRulePackVNext,
  validateAcademicNoticeRequirementRefsVNext,resolveAcademicCourseCodeVNext,
  RulePackSchema,AcademicSummarySchema,OfferingOutlookSchema,
} from '@hufs-one/contracts';
import {fixture} from './helpers.js';

const AT='2026-10-31T00:00:00.000Z';
const OLD='2026-01-05T00:00:00.000Z';
const PUB='2026-01-01T00:00:00.000Z';
const CLAUSE=(id:string,kind:'RULE'|'EXCEPTION'|'FOOTNOTE'|'SCOPE'|'PROCEDURE',requirementIds:string[])=>({
  clauseId:id,kind,sourceSpanRef:'paragraph-'+id,
  coverage:{state:'LINKED',requirementIds},
});
const common=(id:string,semanticKey:string,sourceClauseId:string)=>({
  id,semanticKey,sourceClauseIds:[sourceClauseId],
  exceptionClauseIds:[],evidenceRefs:['SYN-EVIDENCE-'+id],
});
const REQUIREMENTS=[
  {...common('REQ-TOTAL','total','CLAUSE-1'),kind:'CREDIT_TOTAL',
    requiredCreditUnits:24,exceptionClauseIds:['CLAUSE-EX-1']},
  {...common('REQ-MAJOR','majorA','CLAUSE-2'),kind:'CATEGORY_MINIMUM',
    areaId:'SECONDARY',requiredCreditUnits:6},
  {...common('REQ-COURSE','courseA','CLAUSE-3'),kind:'REQUIRED_COURSE',
    canonicalCourseId:'SYN0001'},
  {...common('REQ-CHOICE','electiveA','CLAUSE-4'),kind:'K_OF_N',
    courseIds:['SYN0002','SYN0003','SYN0004'],k:2},
  {...common('REQ-GPA','gpa','CLAUSE-5'),kind:'NON_CREDIT',
    criterionId:'GPA',verificationMode:'GPA_NOT_COLLECTED'},
];
const CLAUSES=[
  CLAUSE('CLAUSE-1','RULE',['REQ-TOTAL']),
  CLAUSE('CLAUSE-EX-1','EXCEPTION',['REQ-TOTAL']),
  CLAUSE('CLAUSE-2','RULE',['REQ-MAJOR']),
  CLAUSE('CLAUSE-3','RULE',['REQ-COURSE']),
  CLAUSE('CLAUSE-4','RULE',['REQ-CHOICE']),
  CLAUSE('CLAUSE-5','RULE',['REQ-GPA']),
];
const pack={
  version:'SYN-RULE-V2',
  sourceDocumentVersion:'SYN-DOC-1',
  sourceDocumentUrl:'https://official.example.edu/synthetic-rules',
  sourceDocumentSha256:'a'.repeat(64),
  sourcePublishedAt:PUB,
  effectiveFrom:'2025-03-01T00:00:00.000Z',
  scope:{
    campus:'DEMO',
    primaryMajor:'SYN-PRIMARY',
    secondaryMajor:'SYN-SECONDARY',
    majorRole:'DOUBLE_MAJOR' as const,
    admissionType:'REGULAR',
    curriculumVersion:'CUR-2025',
    cohortFrom:2015,cohortTo:2026,
  },
  state:'APPROVED' as const,
  requirements:REQUIREMENTS,
  clauseInventory:CLAUSES,
  validationReport:{checkedAt:'2026-01-30T00:00:00.000Z',
    sourceDocumentSha256:'a'.repeat(64),blockingIssues:[]},
  inventoryReviewedBy:'reviewer-B',
  approvedBy:'reviewer-A',
  independentlyCheckedBy:'reviewer-B',
  approvedAt:'2026-02-01T00:00:00.000Z',
};
const request={
  asOf:AT,campus:'DEMO',primaryMajor:'SYN-PRIMARY',
  secondaryMajor:'SYN-SECONDARY',majorRole:'DOUBLE_MAJOR' as const,
  admissionType:'REGULAR',curriculumVersion:'CUR-2025',admissionYear:2025,
};
const progress=(requirementId:string,state:string,extra:Record<string,unknown>={})=>({
  requirementId,state,evidenceRefs:[],...extra,
});
const audit={
  state:'NEEDS_REVIEW' as const,
  rulePackVersion:pack.version,asOf:AT,
  earnedCreditUnits:12,inProgressCreditUnits:6,
  plannedCreditUnits:6,projectedUniqueCreditUnits:24,
  pendingRecognitionCreditUnits:6,
  areaProgress:[
    {areaId:'PRIMARY',earnedCreditUnits:6,projectedCreditUnits:9},
    {areaId:'SECONDARY',earnedCreditUnits:6,projectedCreditUnits:9},
  ],
  excludedAttempts:[{attemptToken:'ATTEMPT-OLD',reason:'RETAKE_SUPERSEDED' as const}],
  requirements:[
    progress('REQ-TOTAL','UNSATISFIED',{
      requiredCreditUnits:24,earnedCreditUnits:12,remainingCreditUnits:12,
    }),
    progress('REQ-MAJOR','SATISFIED',{
      requiredCreditUnits:6,earnedCreditUnits:6,remainingCreditUnits:0,
      evidenceRefs:['SYN-EVIDENCE-REQ-MAJOR'],
    }),
    progress('REQ-COURSE','NEEDS_REVIEW'),
    progress('REQ-CHOICE','SATISFIED',{
      matchedCoursesCount:2,requiredCoursesCount:2,
      evidenceRefs:['SYN-EVIDENCE-REQ-CHOICE'],
    }),
    progress('REQ-GPA','NOT_CHECKED',{notCheckedReason:'GPA_NOT_COLLECTED'}),
  ],
  planIssues:[{code:'CREDIT_CAP_EXCEEDED' as const,
    reasonCode:'EXCEEDS_APPROVED_LIMIT' as const,courseRefs:['SYN-PLAN-01'],
    evidenceRefs:['SYN-SEMESTER-CAP']}],
  caveats:['Synthetic only; no official graduation ruling'],
};
const observations=[
  {term:'2023-1',state:'OFFERED',coverage:'COMPLETE_TERM_CATALOG',
    sourceRef:'SYN-CAT-23',publishedAt:'2023-02-01T00:00:00.000Z',
    verifiedAt:'2023-02-03T00:00:00.000Z'},
  {term:'2024-1',state:'OFFERED',coverage:'COMPLETE_TERM_CATALOG',
    sourceRef:'SYN-CAT-24',publishedAt:'2024-02-01T00:00:00.000Z',
    verifiedAt:'2024-02-03T00:00:00.000Z'},
  {term:'2025-1',state:'CONFIRMED_NOT_OFFERED',coverage:'COMPLETE_TERM_CATALOG',
    sourceRef:'SYN-CAT-25',publishedAt:'2025-02-01T00:00:00.000Z',
    verifiedAt:'2025-02-03T00:00:00.000Z'},
] as const;
const outlook={
  courseId:'SYN0001',targetTerm:'2027-1',asOf:AT,
  modelVersion:'lexical-rules-v1',
  signal:'HISTORICAL_PATTERN' as const,
  observations:[...observations],
  officialEvents:[],evidenceRefs:['SYN-CAT-23','SYN-CAT-24','SYN-CAT-25'],
  sameSeasonObservedTerms:3,sameSeasonOfferedTerms:2,
  alternatives:[],caveat:'Historical k/n is not calibrated probability',
};

describe('PR #13 feedback: strict, additive reviewed academic RulePack vNext',()=>{
  it('accepts a synthetic, independently approved scoped rulepack',()=>{
    const r=AcademicRulePackVNextSchema.parse(pack);
    expect(r.scope.cohortFrom).toBe(2015);
    expect(r.requirements[3]?.kind).toBe('K_OF_N');
  });
  it('enforces different first/second/minor roles, cohort ranges and curriculum versions',()=>{
    for(const scope of [
      {...pack.scope,cohortFrom:2027},
      {...pack.scope,majorRole:'PRIMARY_MAJOR',secondaryMajor:'SYN-SECONDARY'},
      {...pack.scope,majorRole:'MINOR',secondaryMajor:undefined},
      {...pack.scope,admissionType:''},
      {...pack.scope,curriculumVersion:''},
    ])expect(AcademicRulePackVNextSchema.safeParse({...pack,scope}).success).toBe(false);
    expect(selectAcademicRulePackAsOfVNext(
      [AcademicRulePackVNextSchema.parse(pack)],request,
    )?.version).toBe(pack.version);
    for(const change of [
      {admissionYear:2014},{admissionYear:2027},
      {majorRole:'PRIMARY_MAJOR' as const},
      {admissionType:'TRANSFER'},{curriculumVersion:'CUR-2026'},
      {campus:'OTHER'},
    ])expect(selectAcademicRulePackAsOfVNext(
      [AcademicRulePackVNextSchema.parse(pack)],{...request,...change},
    )).toBeNull();
  });
  it('requires fields per requirement kind and rejects invalid 2-of-3',()=>{
    const [total,category,course,choice]=REQUIREMENTS;
    for(const value of [
      {...total,requiredCreditUnits:undefined},
      {...category,areaId:undefined},
      {...course,canonicalCourseId:undefined},
      {...choice,k:4},
      {...choice,k:0},
      {...choice,courseIds:['SYN0002','SYN0002','SYN0003']},
      {...choice,courseIds:['SYN0002']},
      {...course,requiredCreditUnits:22},
    ])expect(AcademicRequirementVNextSchema.safeParse(value).success).toBe(false);
  });
  it('rejects duplicate rule IDs and reused semantic requirement keys',()=>{
    expect(AcademicRulePackVNextSchema.safeParse({
      ...pack,requirements:[...REQUIREMENTS,{...REQUIREMENTS[0],semanticKey:'another'}],
    }).success).toBe(false);
    expect(AcademicRulePackVNextSchema.safeParse({
      ...pack,requirements:[...REQUIREMENTS,{...REQUIREMENTS[0],id:'NEW-RULE'}],
    }).success).toBe(false);
  });
  it('catches omitted ※/exception links, even when all numeric values match',()=>{
    const removed=CLAUSES.filter(c=>c.clauseId!=='CLAUSE-EX-1');
    expect(AcademicRulePackVNextSchema.safeParse({
      ...pack,clauseInventory:removed,
    }).success).toBe(false);
    expect(AcademicRulePackVNextSchema.safeParse({
      ...pack,requirements:REQUIREMENTS.map(r=>r.id==='REQ-TOTAL'
        ?{...r,exceptionClauseIds:[]}:r),
    }).success).toBe(false);
  });
  it('cannot APPROVE unreviewed, unrelated or self-exempted source clauses',()=>{
    expect(AcademicRulePackVNextSchema.safeParse({...pack,
      clauseInventory:[...CLAUSES,{clauseId:'EXTRA',kind:'EXCEPTION',
        sourceSpanRef:'SPAN-EXTRA',
        coverage:{state:'UNREVIEWED',reason:'missing reviewer'}}],
    }).success).toBe(false);
    expect(AcademicRulePackVNextSchema.safeParse({...pack,
      clauseInventory:[...CLAUSES,{clauseId:'EXTRA',kind:'EXCEPTION',
        sourceSpanRef:'SPAN-EXTRA',
        coverage:{state:'LINKED',requirementIds:['MADE-UP']}}],
    }).success).toBe(false);
    expect(AcademicRulePackVNextSchema.safeParse({...pack,
      clauseInventory:[...CLAUSES,{clauseId:'EXTRA',kind:'SCOPE',
        sourceSpanRef:'SPAN-EXTRA',
        coverage:{state:'NOT_APPLICABLE',reason:'Does not apply to the synthetic scope',
          independentlyReviewedBy:'reviewer-A'}}],
    }).success).toBe(false);
  });
  it('retains two-person approval and independent original-clause reconciliation',()=>{
    for(const changes of [
      {approvedBy:'reviewer-B'},
      {inventoryReviewedBy:'reviewer-A'},
      {approvedAt:undefined},
      {sourceDocumentSha256:'bad-sha'},
      {sourceDocumentUrl:'http://official.example.edu'},
      {sourceDocumentUrl:'file:///tmp/local'},
    ])expect(AcademicRulePackVNextSchema.safeParse({...pack,...changes}).success).toBe(false);
  });
  it('catches an exception omitted from BOTH candidate and self-authored clause inventory',()=>{
    const omitted=AcademicRulePackVNextSchema.parse({
      ...pack,
      requirements:REQUIREMENTS.map(r=>r.id==='REQ-TOTAL'
        ?{...r,exceptionClauseIds:[]}:r),
      clauseInventory:CLAUSES.filter(c=>c.clauseId!=='CLAUSE-EX-1'),
    });
    // Internal links are consistent: only a separately obtained original
    // clause inventory catches this source-to-candidate missing-※ error.
    const independentlyInventoried={
      sourceDocumentSha256:pack.sourceDocumentSha256,
      clauses:CLAUSES.map(({clauseId,kind,sourceSpanRef})=>({
        clauseId,kind,sourceSpanRef,
      })),
    };
    expect(verifyAcademicSourceCoverageVNext(omitted,independentlyInventoried))
      .toBe(false);
    expect(parseApprovedAcademicRulePackVNext(omitted,independentlyInventoried))
      .toBeNull();
    expect(parseApprovedAcademicRulePackVNext(pack,independentlyInventoried)?.version)
      .toBe(pack.version);
    expect(verifyAcademicSourceCoverageVNext(
      AcademicRulePackVNextSchema.parse(pack),independentlyInventoried,
    )).toBe(true);
    expect(verifyAcademicSourceCoverageVNext(
      AcademicRulePackVNextSchema.parse(pack),{
        ...independentlyInventoried,sourceDocumentSha256:'b'.repeat(64),
      },
    )).toBe(false);
  });
  it('denies approval-storage candidates with warnings despite two valid signatures',()=>{
    const errorCases=[
      {code:'CLAUSE_MISSING'},
      {code:'PROMPT_INJECTION',sourceClauseId:'CLAUSE-EX-1'},
      {code:'SOURCE_CONTRADICTION'},
      {code:'NUMERIC_SOURCE_MISMATCH'},
    ];
    for(const warning of errorCases){
      const flagged={...pack,validationReport:{
        ...pack.validationReport,blockingIssues:[warning],
      }};
      expect(AcademicRulePackVNextSchema.safeParse(flagged).success).toBe(false);
      expect(parseApprovedAcademicRulePackVNext(flagged,{
        sourceDocumentSha256:pack.sourceDocumentSha256,
        clauses:CLAUSES.map(({clauseId,kind,sourceSpanRef})=>({
          clauseId,kind,sourceSpanRef,
        })),
      })).toBeNull();
    }
    for(const validationReport of [
      undefined,
      {...pack.validationReport,sourceDocumentSha256:'b'.repeat(64)},
      {...pack.validationReport,checkedAt:'2026-11-01T00:00:00.000Z'},
    ])expect(AcademicRulePackVNextSchema.safeParse({
      ...pack,validationReport,
    }).success).toBe(false);
  });
  it('rejects fabricated draft approval and invalid published/effective chronology',()=>{
    for(const changes of [
      {state:'DRAFT'},
      {approvedAt:'2025-12-01T00:00:00.000Z'},
      {effectiveUntil:'2025-01-01T00:00:00.000Z'},
      {supersedesVersion:pack.version},
    ])expect(AcademicRulePackVNextSchema.safeParse({...pack,...changes}).success).toBe(false);
    const {approvedBy,independentlyCheckedBy,approvedAt,...draft}=pack;
    expect(AcademicRulePackVNextSchema.safeParse({
      ...draft,state:'NEEDS_REVIEW',
      clauseInventory:[...CLAUSES,{clauseId:'MISSING',kind:'EXCEPTION',
        sourceSpanRef:'SPAN-MISSING',
        coverage:{state:'UNREVIEWED',reason:'Source reconciliation pending'}}],
    }).success).toBe(true);
  });
  it('rejects future approval/source and unknown forks when selecting asOf history',()=>{
    const parsed=AcademicRulePackVNextSchema.parse(pack);
    expect(selectAcademicRulePackAsOfVNext([parsed],{
      ...request,asOf:'2026-01-10T00:00:00.000Z',
    })).toBeNull();
    const newer=AcademicRulePackVNextSchema.parse({
      ...pack,version:'SYN-RULE-V3',supersedesVersion:pack.version,
      approvedAt:'2026-09-01T00:00:00.000Z',
    });
    expect(selectAcademicRulePackAsOfVNext([parsed,newer],request)?.version)
      .toBe('SYN-RULE-V3');
    const fork=AcademicRulePackVNextSchema.parse({
      ...newer,version:'SYN-FORK-V3',
    });
    expect(selectAcademicRulePackAsOfVNext([parsed,newer,fork],request)).toBeNull();
  });
  it('preserves requirement IDs across revisions and refuses semantic-ID repurposing',()=>{
    const oldPack=AcademicRulePackVNextSchema.parse(pack);
    const nextPack=AcademicRulePackVNextSchema.parse({
      ...pack,version:'SYN-RULE-V3',supersedesVersion:pack.version,
      approvedAt:'2026-10-01T00:00:00.000Z',
    });
    expect(stableAcademicRequirementIdsVNext(oldPack,nextPack)).toBe(true);
    expect(stableAcademicRequirementIdsVNext(oldPack,{
      ...nextPack,requirements:nextPack.requirements.map(r=>r.id==='REQ-TOTAL'
        ?{...r,semanticKey:'renamed-total'}:r),
    })).toBe(false);
    expect(stableAcademicRequirementIdsVNext(oldPack,{
      ...nextPack,requirements:nextPack.requirements.map(r=>r.id==='REQ-TOTAL'
        ?{...r,id:'FRESH-ID'}:r),
    })).toBe(false);
  });
  it('matches notice requirementRefs exactly to stable RulePack IDs',()=>{
    const parsed=AcademicRulePackVNextSchema.parse(pack);
    expect(validateAcademicNoticeRequirementRefsVNext(parsed,['REQ-TOTAL','REQ-COURSE']))
      .toBe(true);
    expect(validateAcademicNoticeRequirementRefsVNext(parsed,['REQ-TOTAL','UNKNOWN-ID']))
      .toBe(false);
    expect(validateAcademicNoticeRequirementRefsVNext(parsed,['REQ-TOTAL','REQ-TOTAL']))
      .toBe(false);
  });
});

describe('PR #13 feedback: detailed non-PII academic result representation',()=>{
  it('accepts synthetic progress with all requirements, area credits and pending recognition',()=>{
    const result=AcademicAuditVNextSchema.parse(audit);
    expect(result.pendingRecognitionCreditUnits).toBe(6);
    expect(result.projectedUniqueCreditUnits).toBe(24);
    expect(result.areaProgress.map(r=>r.areaId)).toEqual(['PRIMARY','SECONDARY']);
    expect(validateAcademicAuditAgainstPackVNext(
      AcademicRulePackVNextSchema.parse(pack),result,
    )).toBe(true);
  });
  it('marks an uncollected GPA as NOT_CHECKED, never SATISFIED',()=>{
    expect(AcademicAuditVNextSchema.safeParse({...audit,
      requirements:audit.requirements.map(x=>x.requirementId==='REQ-GPA'
        ?{...x,state:'NOT_CHECKED',notCheckedReason:undefined}:x),
    }).success).toBe(false);
    expect(AcademicAuditVNextSchema.safeParse({...audit,
      state:'READY',
    }).success).toBe(false);
  });
  it('rejects SATISFIED missing credits and unsupported double-counted total',()=>{
    expect(AcademicAuditVNextSchema.safeParse({...audit,
      requirements:audit.requirements.map(x=>x.requirementId==='REQ-TOTAL'
        ?{...x,state:'SATISFIED',evidenceRefs:['SYN-EV']}:x),
    }).success).toBe(false);
    expect(AcademicAuditVNextSchema.safeParse({
      ...audit,projectedUniqueCreditUnits:27,
    }).success).toBe(false);
    expect(AcademicAuditVNextSchema.safeParse({
      ...audit,projectedUniqueCreditUnits:11,
    }).success).toBe(false);
  });
  it('requires identical result IDs across RulePack revisions and rejects invented results',()=>{
    const parsed=AcademicRulePackVNextSchema.parse(pack);
    const base=AcademicAuditVNextSchema.parse(audit);
    expect(validateAcademicAuditAgainstPackVNext(parsed,{
      ...base,rulePackVersion:'unreviewed-rules',
    })).toBe(false);
    expect(validateAcademicAuditAgainstPackVNext(parsed,{
      ...base,requirements:base.requirements.map(r=>r.requirementId==='REQ-GPA'
        ?{...r,requirementId:'UNKNOWN-ID'}:r),
    })).toBe(false);
    expect(validateAcademicAuditAgainstPackVNext(parsed,{
      ...base,requirements:base.requirements.map(r=>r.requirementId==='REQ-GPA'
        ?{...r,state:'SATISFIED',notCheckedReason:undefined,evidenceRefs:['SYN-EV']}:r),
    })).toBe(false); // GPA is NOT_CHECKED without collected GPA data.
    expect(validateAcademicAuditAgainstPackVNext(parsed,{
      ...base,requirements:base.requirements.map(r=>r.requirementId==='REQ-TOTAL'
        ?{...r,state:'NOT_CHECKED',notCheckedReason:'GPA_NOT_COLLECTED'}:r),
    })).toBe(false);
  });
  it('supports nine A08.5 case output fields without claiming to compute those examples',()=>{
    const base=AcademicAuditVNextSchema.parse(audit);
    const cases=[
      {label:'CREDIT-01',expected:base.areaProgress[1]?.earnedCreditUnits===6},
      {label:'CREDIT-02',expected:base.excludedAttempts[0]?.reason==='RETAKE_SUPERSEDED'},
      {label:'CREDIT-03',expected:base.pendingRecognitionCreditUnits===6},
      {label:'CREDIT-04',expected:base.requirements.find(x=>x.requirementId==='REQ-CHOICE')?.matchedCoursesCount===2},
      {label:'CREDIT-05',expected:base.projectedUniqueCreditUnits===24},
      {label:'CREDIT-06',expected:base.requirements.find(x=>x.requirementId==='REQ-TOTAL')?.remainingCreditUnits===12},
      {label:'CREDIT-07',expected:base.planIssues.some(x=>x.code==='CREDIT_CAP_EXCEEDED')},
      {label:'CREDIT-08',expected:AcademicAuditVNextSchema.safeParse({
        ...base,planIssues:[...base.planIssues,
          {code:'PREREQUISITE_MISSING',reasonCode:'UNMET_OFFICIAL_PREREQUISITE',
            courseRefs:['SYN-COURSE-A'],
            evidenceRefs:['SYN-PREREQ']}],
      }).success},
      {label:'CREDIT-09',expected:AcademicAuditVNextSchema.safeParse({
        ...base,planIssues:[...base.planIssues,
          {code:'TIMETABLE_CONFLICT',reasonCode:'ALL_VERIFIED_SECTIONS_OVERLAP',
            courseRefs:['SYN-A','SYN-B'],
            evidenceRefs:['SYN-CATALOG']}],
      }).success},
    ];
    expect(cases).toHaveLength(9);
    for(const {label,expected} of cases)
      expect(expected, `Representational field not available for ${label}`).toBe(true);
  });
  it('cannot assert a timetable collision without a verified reason code',()=>{
    expect(AcademicAuditVNextSchema.safeParse({
      ...audit,planIssues:[{code:'TIMETABLE_CONFLICT',
        courseRefs:['SYN-A','SYN-B'],evidenceRefs:['SYN-EVIDENCE'],
      }],
    }).success).toBe(false);
    expect(AcademicAuditVNextSchema.safeParse({
      ...audit,planIssues:[{code:'TIMETABLE_CONFLICT',
        reasonCode:'EXCEEDS_APPROVED_LIMIT',
        courseRefs:['SYN-A','SYN-B'],evidenceRefs:['SYN-EVIDENCE'],
      }],
    }).success).toBe(false);
  });
  it('requires secure reason codes and refuses raw student transcript extras',()=>{
    expect(AcademicAuditVNextSchema.safeParse({
      ...audit,studentName:'private',
    }).success).toBe(false);
    expect(AcademicAuditVNextSchema.safeParse({
      ...audit,excludedAttempts:[{attemptToken:'TOKEN',grade:'A+',reason:'RETAKE_SUPERSEDED'}],
    }).success).toBe(false);
    expect(AcademicAuditVNextSchema.safeParse({
      ...audit,requirements:[...audit.requirements,audit.requirements[0]],
    }).success).toBe(false);
  });
  it('requires official evidence for SATISFIED and justification for NOT_APPLICABLE',()=>{
    const result=audit.requirements[1]!;
    expect(AcademicAuditVNextSchema.safeParse({
      ...audit,requirements:audit.requirements.map(x=>x.requirementId===result.requirementId
        ?{...result,evidenceRefs:[]}:x),
    }).success).toBe(false);
    expect(AcademicAuditVNextSchema.safeParse({
      ...audit,requirements:audit.requirements.map(x=>x.requirementId===result.requirementId
        ?{...result,state:'NOT_APPLICABLE'}:x),
    }).success).toBe(false);
  });
});

describe('PR #13 feedback: offering/outlook event and asOf evidence validation',()=>{
  it('accepts verified historical same-season 2/3 without implying calibrated chance',()=>{
    const value=OfferingOutlookVNextSchema.parse(outlook);
    expect(value.sameSeasonOfferedTerms).toBe(2);
    expect(value.modelVersion).toBe('lexical-rules-v1');
  });
  it('rejects unsupported arbitrary term formats and seasons',()=>{
    for(const term of ['2027-SUMMER','2027-3','2027-0','2027','2027-01','garbage']){
      expect(AcademicTermVNextSchema.safeParse(term).success).toBe(false);
      expect(OfferingOutlookVNextSchema.safeParse({
        ...outlook,targetTerm:term,
      }).success).toBe(false);
    }
  });
  it('blocks future source publication AND verification time for rolling-origin replay',()=>{
    for(const date of [
      {publishedAt:'2027-01-01T00:00:00.000Z'},
      {verifiedAt:'2027-01-01T00:00:00.000Z'},
      {term:'2027-1'},
    ])expect(OfferingOutlookVNextSchema.safeParse({
      ...outlook,observations:[{...observations[0],...date},...observations.slice(1)],
    }).success).toBe(false);
  });
  it('rejects verification dates before the publication of a catalog or official event',()=>{
    expect(OfferingOutlookVNextSchema.safeParse({
      ...outlook,observations:[{...observations[0],
        verifiedAt:'2023-01-01T00:00:00.000Z'},...observations.slice(1)],
    }).success).toBe(false);
    const event={
      eventId:'EV-1',kind:'STAFF_CHANGE',sourceRef:'SYN-EV-STAFF',
      publishedAt:'2026-10-01T00:00:00.000Z',
      verifiedAt:'2026-09-01T00:00:00.000Z',
      effectiveFrom:'2027-02-01T00:00:00.000Z',
      impact:'POTENTIAL_ASSIGNMENT_CHANGE',
      affectedCourseIds:['SYN0001'],
    };
    expect(OfferingOutlookVNextSchema.safeParse({
      ...outlook,signal:'EVENT_REVIEW',officialEvents:[event],
    }).success).toBe(false);
  });
  it('blocks fabricated 0/n from partial catalogs, bad k/n and duplicates',()=>{
    for(const changes of [
      {observations:[{...observations[0],coverage:'PARTIAL'},...observations.slice(1)]},
      {sameSeasonObservedTerms:4},{sameSeasonOfferedTerms:3},
      {observations:[observations[0],observations[0],observations[2]]},
    ])expect(OfferingOutlookVNextSchema.safeParse({
      ...outlook,...changes,
    }).success).toBe(false);
  });
  it('allows EVENT_REVIEW only with independently dated official non-cancellation evidence',()=>{
    const event={
      eventId:'EVENT-1',kind:'RESEARCH_LEAVE',sourceRef:'SYN-EVENT-1',
      publishedAt:'2026-09-01T00:00:00.000Z',
      verifiedAt:'2026-09-02T00:00:00.000Z',
      effectiveFrom:'2027-02-01T00:00:00.000Z',
      impact:'POTENTIAL_ASSIGNMENT_CHANGE',
      affectedCourseIds:['SYN0001'],
    };
    expect(OfferingOutlookVNextSchema.safeParse({
      ...outlook,signal:'EVENT_REVIEW',officialEvents:[event],
    }).success).toBe(true);
    expect(OfferingOutlookVNextSchema.safeParse({
      ...outlook,signal:'CONFIRMED_NOT_OFFERED',
      officialEvents:[event],sourcePublishedAt:event.publishedAt,
      evidenceRefs:['SYN-EVENT-1'],
    }).success).toBe(false);
    expect(OfferingOutlookVNextSchema.safeParse({
      ...outlook,signal:'EVENT_REVIEW',officialEvents:[],
    }).success).toBe(false);
  });
  it('rejects fake official course status, future event and unapproved alternatives',()=>{
    expect(OfferingOutlookVNextSchema.safeParse({
      ...outlook,signal:'CONFIRMED_OFFERED',sourcePublishedAt:undefined,
    }).success).toBe(false);
    expect(OfferingOutlookVNextSchema.safeParse({
      ...outlook,alternatives:[{courseId:'SYN0002',status:'OFFICIALLY_APPROVED'}],
    }).success).toBe(false);
    expect(OfferingOutlookVNextSchema.safeParse({
      ...outlook,alternatives:[{courseId:'SYN0001',status:'NEEDS_REVIEW'}],
    }).success).toBe(false);
  });
  it('keeps original v0.1 data contracts unchanged for all legacy consumers',()=>{
    const legacyRule=RulePackSchema.parse(fixture('synthetic/rulepack.json'));
    expect(legacyRule.scope.admissionYear).toBe(2025);
    expect(AcademicSummarySchema.safeParse(
      fixture('synthetic/academic-summary.json')).success).toBe(true);
    const oldOutlook=fixture<{items:unknown[]}>('synthetic/forecast-summary.json');
    expect(OfferingOutlookSchema.safeParse(oldOutlook.items[0]).success).toBe(true);
  });
});

describe('PR #13 feedback: source-approved course/section splitting only',()=>{
  it('does not guess a course based on missing code or unreviewed format',()=>{
    for(const code of ['', 'abc123401','SYN000101','KOR9999']){
      expect(resolveAcademicCourseCodeVNext({
        rawCode:code,sourceFormatReviewed:false,
        approvedFormat:'COURSE_7_SECTION_2',
      }).status).toBe('NEEDS_REVIEW');
    }
  });
  it('uses an explicitly approved 7+2 source format, never name similarity',()=>{
    const parsed=resolveAcademicCourseCodeVNext({
      rawCode:'syn000101',sourceFormatReviewed:true,
      approvedFormat:'COURSE_7_SECTION_2',
    });
    expect(parsed).toEqual({
      status:'RESOLVED',canonicalCourseId:'SYN0001',sectionId:'01',
    });
    expect(resolveAcademicCourseCodeVNext({
      rawCode:'SYN0001',sourceFormatReviewed:true,
      approvedFormat:'COURSE_7_SECTION_2',
    }).status).toBe('NEEDS_REVIEW');
  });
});
