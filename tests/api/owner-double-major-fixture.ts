const at='2026-11-03T00:00:00.000Z';
const ref={sourceId:'SYN-SOURCE',revisionId:'SYN-REV',permissionRef:'SYN-PERM'};
/** Invented, independently approved fixture. Contains no student source material. */
export function doubleMajorInput(){
  const pack=(role:'PRIMARY_MAJOR'|'DOUBLE_MAJOR')=>{
    const requirementId=role==='PRIMARY_MAJOR'?'SYN-P-REQ':'SYN-D-REQ';
    const clause={clauseId:role+'-CLAUSE',kind:'RULE' as const,sourceSpanRef:role+'-SPAN',coverage:{state:'LINKED' as const,requirementIds:[requirementId]}};
    return {pack:{version:role+'-V1',sourceDocumentVersion:role+'-SOURCE',sourceDocumentUrl:'https://synthetic.invalid/rules',sourceDocumentSha256:'a'.repeat(64),
      sourcePublishedAt:at,effectiveFrom:at,scope:{campus:'SEOUL',primaryMajor:'SYN-P',...(role==='DOUBLE_MAJOR'?{secondaryMajor:'SYN-D'}:{}),majorRole:role,
        admissionType:'REGULAR',curriculumVersion:'2024',cohortFrom:2024,cohortTo:2024},state:'APPROVED' as const,
      requirements:[{id:requirementId,semanticKey:requirementId,kind:'CATEGORY_MINIMUM' as const,areaId:role+'-AREA',requiredCreditUnits:6,
        sourceClauseIds:[clause.clauseId],exceptionClauseIds:[],evidenceRefs:[role+'-EVIDENCE']}],clauseInventory:[clause],
      validationReport:{checkedAt:at,sourceDocumentSha256:'a'.repeat(64),blockingIssues:[]},inventoryReviewedBy:'SYN-INVENTORY',approvedBy:'SYN-APPROVER',independentlyCheckedBy:'SYN-CHECKER',approvedAt:at},
      trustedOriginal:{sourceDocumentSha256:'a'.repeat(64),clauses:[{clauseId:clause.clauseId,kind:clause.kind,sourceSpanRef:clause.sourceSpanRef}]},
      courseAreas:{'SYN-SHARED':[role+'-AREA']},source:ref,catalogSource:ref};
  };
  return {format:'CURRENT_DOUBLE_MAJOR_V1',profile:{version:'SYN-PROFILE-1',campus:'SEOUL',primaryMajor:'SYN-P',cohort:2024,
    admissionType:'REGULAR',curriculumVersion:'2024',secondaryMajor:{status:'SELECTED',majorId:'SYN-D'},source:ref},
    transcript:{version:'SYN-TRANSCRIPT-1',state:'APPROVED',source:ref,attempts:[{attemptToken:'PRIVATE-ATTEMPT-TOKEN',canonicalCourseId:'SYN-SHARED',creditUnits:6,ledger:'EARNED',recognition:'RECOGNIZED',term:'2025-2'}]},
    primary:pack('PRIMARY_MAJOR'),doubleMajor:pack('DOUBLE_MAJOR'),overlapRule:null,
    approval:{consentVersion:'1',sourceRightsVersion:'SYN-RIGHTS-1',coreVersion:'double-major-v1',verifiedAt:at},
    evidenceLinks:['PRIMARY_MAJOR','DOUBLE_MAJOR'].map(role=>({evidenceRef:role+'-EVIDENCE',href:'https://synthetic.invalid/'+role,verifiedAt:at})),
    visibility:{mode:'OWNER_VERIFIED',allowedCourseRefs:['SYN-SHARED']}};
}