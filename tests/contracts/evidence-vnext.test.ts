import {describe,expect,it} from 'vitest';
import {
  SourceRevisionVNextSchema,SourceSpanVNextSchema,VerifiedClaimVNextSchema,
  RetrievalEnvelopeVNextSchema,RevisionInvalidationVNextSchema,
  DecisionAdviceVNextSchema,EvidenceBoundPacketVNextSchema,
  matchesTextSpan,matchesImageSpan,EvidenceScopeSchema,matchesEvidenceScope,
} from '@hufs-one/contracts';

const A='a'.repeat(64),B='b'.repeat(64);
const stamp='2026-10-20T00:00:00.000Z';
const later='2026-10-21T00:00:00.000Z';
const rev={
  revisionId:'rev-01',sourceId:'source-01',
  originalSha256:A,contentSha256:B,mediaKind:'HTML' as const,
  sourceClass:'SYNTHETIC' as const,
  permissionRef:'permission-01',provenance:'SYNTHETIC' as const,
  status:'ACTIVE' as const,changeKind:'NEW' as const,
  publishedAt:'2026-10-19T00:00:00.000Z',
  fetchedAt:stamp,lastCheckedAt:stamp,lastVerifiedAt:later,
  applicableScope:{campuses:['SEOUL'],cohortRange:[2020,2026] as [number,number]},
  topicCodes:['DATA_ANALYTICS'] as const,
};
const paragraph='😀정정 공고 모집마감 11월 20일';
const txt={kind:'TEXT' as const,sourceRevisionId:'rev-01',
  paragraphId:'p1',startCodePoint:1,endCodePoint:3,quote:'정정'};
const img={kind:'IMAGE' as const,sourceRevisionId:'rev-01',
  assetId:'asset-01',originalSha256:A,pageIndex:0,
  bboxNorm:[0.1,0.2,0.8,0.9] as [number,number,number,number],
  ocrLineIds:['line-1','line-2'],quote:'학생 모집',
  extractionEngine:'CLOVA_OCR_GENERAL' as const,transformVersion:'v1'};
const verified={
  claimId:'c-01',sourceRevisionId:'rev-01',field:'studentDeadline',
  value:'2026-11-20T16:00:00+09:00',dateKind:'STUDENT' as const,
  evidence:[txt],state:'VERIFIED' as const,risk:'HIGH' as const,
  reviewerId:'reviewer-01',claimCheckedAt:later,
};
const retrieval={
  queryVersion:'q-v1',asOf:'2026-11-01T00:00:00.000Z',
  sourceRevisionIds:['rev-01'],permissionPolicyVersion:'perm-v1',
  retrievalConfigVersion:'lexical-v1',retrievalState:'READY' as const,
  evidence:[txt],
};
const packet={
  packetId:'opaque-packet-01',task:'opportunity_terms' as const,
  providerInputClass:'SYNTHETIC_CLEARED' as const,
  sourceTokens:[{token:'tok-1',paragraphs:[{id:'p1',text:paragraph}]}],
  allowedTopicCodes:['DATA_ANALYTICS' as const],
  allowedObjectTokens:['object-1'],approvedFacts:[{
    token:'tok-1',key:'deadline-type',value:'STUDENT',
  }],
  schemaVersion:'base-v1',promptVersion:'rules-v1',
};

describe('TASK-18 vNext immutable SourceRevision contract',()=>{
  it('accepts approved revision with separate published/fetched/checked/verified times',()=>{
    const v=SourceRevisionVNextSchema.parse(rev);
    expect(v.publishedAt).not.toBe(v.fetchedAt);
    expect(v.lastCheckedAt).not.toBe(v.lastVerifiedAt);
    expect(v.topicCodes).toEqual(['DATA_ANALYTICS']);
  });
  it('defaults optional topics only, without mutating v0.1 data contracts',()=>{
    const {topicCodes:_t,...withoutTopic}=rev;
    expect(SourceRevisionVNextSchema.parse(withoutTopic).topicCodes).toEqual([]);
  });
  it('rejects altered content hashes and missing permission references',()=>{
    expect(SourceRevisionVNextSchema.safeParse({...rev,contentSha256:'short'}).success).toBe(false);
    expect(SourceRevisionVNextSchema.safeParse({...rev,originalSha256:'not-a-digest'}).success).toBe(false);
    expect(SourceRevisionVNextSchema.safeParse({...rev,permissionRef:''}).success).toBe(false);
  });
  it('rejects earlier lastChecked and earlier verification than fetch',()=>{
    expect(SourceRevisionVNextSchema.safeParse({...rev,lastCheckedAt:'2026-10-19T00:00:00.000Z'}).success).toBe(false);
    expect(SourceRevisionVNextSchema.safeParse({...rev,lastVerifiedAt:'2026-10-19T00:00:00.000Z'}).success).toBe(false);
  });
  it('refuses unsupported active states without independent verification or rights',()=>{
    expect(SourceRevisionVNextSchema.safeParse({...rev,lastVerifiedAt:undefined}).success).toBe(false);
    expect(SourceRevisionVNextSchema.safeParse({...rev,provenance:'RESEARCH_ONLY'}).success).toBe(false);
    expect(SourceRevisionVNextSchema.safeParse({...rev,sourceClass:'RESEARCH_REFERENCE_ONLY'}).success).toBe(false);
  });
  it('requires immutable linked revision chains and rejects cancelled-active conflict',()=>{
    expect(SourceRevisionVNextSchema.safeParse({...rev,supersedes:'rev-01'}).success).toBe(false);
    expect(SourceRevisionVNextSchema.safeParse({...rev,changeKind:'CORRECTED'}).success).toBe(false);
    expect(SourceRevisionVNextSchema.safeParse({...rev,changeKind:'CANCELLED',supersedes:'rev-00'}).success).toBe(false);
    expect(SourceRevisionVNextSchema.parse({...rev,changeKind:'EXTENDED',
      revisionId:'rev-02',supersedes:'rev-01'}).supersedes).toBe('rev-01');
  });
  it('rejects inverted effective windows, invalid cohorts and duplicate scope',()=>{
    expect(SourceRevisionVNextSchema.safeParse({...rev,validFrom:later,validUntil:stamp}).success).toBe(false);
    expect(SourceRevisionVNextSchema.safeParse({...rev,applicableScope:{cohortRange:[2026,2020]}}).success).toBe(false);
    expect(SourceRevisionVNextSchema.safeParse({...rev,applicableScope:{campuses:['SEOUL','SEOUL']}}).success).toBe(false);
  });
  it('rejects unknown topics and duplicate closed-vocabulary topics',()=>{
    expect(SourceRevisionVNextSchema.safeParse({...rev,topicCodes:['INVENTED']}).success).toBe(false);
    expect(SourceRevisionVNextSchema.safeParse({...rev,topicCodes:['AI_ML','AI_ML']}).success).toBe(false);
  });
});

describe('TASK-18 Unicode paragraph and original IMAGE bbox references',()=>{
  it('validates exact Unicode codepoint offsets instead of UTF-16 units',()=>{
    expect(SourceSpanVNextSchema.parse(txt).kind).toBe('TEXT');
    expect(matchesTextSpan(txt,{revisionId:'rev-01',paragraphId:'p1',text:paragraph})).toBe(true);
    expect(matchesTextSpan(txt,{revisionId:'rev-01',paragraphId:'p1',text:'정정 공고'})).toBe(false);
  });
  it('rejects invented or truncated quote, invalid offset and foreign paragraph',()=>{
    expect(SourceSpanVNextSchema.safeParse({...txt,quote:'가짜'}).success).toBe(true);
    expect(matchesTextSpan({...txt,quote:'가짜'},{revisionId:'rev-01',paragraphId:'p1',text:paragraph})).toBe(false);
    expect(SourceSpanVNextSchema.safeParse({...txt,startCodePoint:3,endCodePoint:1}).success).toBe(false);
    expect(SourceSpanVNextSchema.safeParse({...txt,quote:'정'}).success).toBe(false);
    expect(matchesTextSpan(txt,{revisionId:'rev-02',paragraphId:'p1',text:paragraph})).toBe(false);
    expect(matchesTextSpan(txt,{revisionId:'rev-01',paragraphId:'p2',text:paragraph})).toBe(false);
  });
  it('accepts a normalized bbox only with image hash, OCR lines and transform version',()=>{
    expect(SourceSpanVNextSchema.parse(img).kind).toBe('IMAGE');
    expect(matchesImageSpan(img,{
      revisionId:'rev-01',assetId:'asset-01',originalSha256:A,
      pageCount:1,transformVersion:'v1',ocrLines:[
        {id:'line-1',text:'학생'}, {id:'line-2',text:'모집 공고'},
      ],
    })).toBe(true);
  });
  it('rejects inverted/degenerate and outside image boxes',()=>{
    for(const bboxNorm of [[0.6,0.2,0.4,0.9],[0,0,0,1],[-0.1,0,1,1],[0,0,1,1.1]]){
      expect(SourceSpanVNextSchema.safeParse({...img,bboxNorm}).success).toBe(false);
    }
  });
  it('rejects missing page, extraction version, OCR line, original hash or page limits',()=>{
    for(const patch of [
      {pageIndex:-1},{pageIndex:200},{transformVersion:''},{ocrLineIds:[]},
      {ocrLineIds:['line-1','line-1']},{originalSha256:'wrong'},
      {extractionEngine:'HTML'},
    ])expect(SourceSpanVNextSchema.safeParse({...img,...patch}).success).toBe(false);
  });
  it('rejects cross-image hash, page, transform or OCR content for a trusted original',()=>{
    const original={revisionId:'rev-01',assetId:'asset-01',originalSha256:A,
      pageCount:1,transformVersion:'v1',
      ocrLines:[{id:'line-1',text:'학생'},{id:'line-2',text:'모집 공고'}]};
    expect(matchesImageSpan(img,{...original,originalSha256:B})).toBe(false);
    expect(matchesImageSpan(img,{...original,pageCount:0})).toBe(false);
    expect(matchesImageSpan(img,{...original,transformVersion:'v2'})).toBe(false);
    expect(matchesImageSpan(img,{...original,ocrLines:[{id:'line-1',text:'학생'}]})).toBe(false);
    expect(matchesImageSpan({...img,quote:'비자 발급'},original)).toBe(false);
  });
});

describe('TASK-18 VerifiedClaim and retrieval envelope fail closed',()=>{
  it('parses independently human-verified date-kind claim and its source revision',()=>{
    const v=VerifiedClaimVNextSchema.parse(verified);
    expect(v.risk).toBe('HIGH');
    expect(v.dateKind).toBe('STUDENT');
  });
  it('denies VERIFIED claims without explicit reviewer or check timestamp',()=>{
    expect(VerifiedClaimVNextSchema.safeParse({...verified,reviewerId:undefined}).success).toBe(false);
    expect(VerifiedClaimVNextSchema.safeParse({...verified,claimCheckedAt:undefined}).success).toBe(false);
  });
  it('keeps candidate/uncertain claims unverified rather than falsely upgrading',()=>{
    expect(VerifiedClaimVNextSchema.parse({...verified,state:'NEEDS_REVIEW',
      reviewerId:undefined,claimCheckedAt:undefined}).state).toBe('NEEDS_REVIEW');
  });
  it('rejects mixed revision spans and student/admin deadlines without zoned dates',()=>{
    expect(VerifiedClaimVNextSchema.safeParse({...verified,evidence:[{...txt,sourceRevisionId:'rev-02'}]}).success).toBe(false);
    expect(VerifiedClaimVNextSchema.safeParse({...verified,value:'11월20일'}).success).toBe(false);
    expect(VerifiedClaimVNextSchema.safeParse({...verified,value:20261120}).success).toBe(false);
  });
  it('returns only authorized READY excerpts and consistent revision identities',()=>{
    expect(RetrievalEnvelopeVNextSchema.parse(retrieval).retrievalState).toBe('READY');
    expect(RetrievalEnvelopeVNextSchema.safeParse({...retrieval,sourceRevisionIds:['another']}).success).toBe(false);
    expect(RetrievalEnvelopeVNextSchema.safeParse({...retrieval,evidence:[]}).success).toBe(false);
    expect(RetrievalEnvelopeVNextSchema.safeParse({...retrieval,sourceRevisionIds:['rev-01','rev-01']}).success).toBe(false);
  });
  it('does not leak citations or previous revision when no permission/current evidence exists',()=>{
    for(const retrievalState of ['NO_EVIDENCE','STALE','CONFLICT','BLOCKED_RIGHTS','UNKNOWN']){
      expect(RetrievalEnvelopeVNextSchema.parse({
        ...retrieval,retrievalState,sourceRevisionIds:[],evidence:[],
      }).retrievalState).toBe(retrievalState);
      expect(RetrievalEnvelopeVNextSchema.safeParse({...retrieval,retrievalState}).success).toBe(false);
    }
  });
});

describe('TASK-19 invalidation event contract',()=>{
  const event={
    eventId:'event-1',sourceId:'source-01',previousRevisionId:'rev-01',
    newRevisionId:'rev-02',changedAt:later,reason:'CANCELLED' as const,
    permissionPolicyVersion:'perm-v2',
    invalidates:['RETRIEVAL','CLAIMS','FEED','NOTICES','AI_CACHE'] as const,
  };
  it('requires invalidation of all derived retrieval and fact caches',()=>{
    const parsed=RevisionInvalidationVNextSchema.parse(event);
    expect(parsed.invalidates).toContain('NOTICES');
  });
  it('rejects silent reactivation, stale feed on cancellation, duplicate targets',()=>{
    expect(RevisionInvalidationVNextSchema.safeParse({...event,newRevisionId:'rev-01'}).success).toBe(false);
    expect(RevisionInvalidationVNextSchema.safeParse({
      ...event,invalidates:['RETRIEVAL','CLAIMS'],
    }).success).toBe(false);
    expect(RevisionInvalidationVNextSchema.safeParse({
      ...event,invalidates:['RETRIEVAL','CLAIMS','FEED','FEED'],
    }).success).toBe(false);
    expect(RevisionInvalidationVNextSchema.safeParse({
      ...event,invalidates:['FEED','NOTICES'],
    }).success).toBe(false);
  });
});

describe('TASK-18 Laya decision and separately gated LLM packet',()=>{
  it('models decision candidate, not a verified fact or eligibility probability',()=>{
    const advice=DecisionAdviceVNextSchema.parse({
      model:'laya-multilingual',modelRevision:'model-r1',inputHash:A,
      optionsVersion:'config-v1',decision:'HUMAN_REVIEW',
      confidence:0.6,policyOverridden:true,
    });
    expect(advice.decision).toBe('HUMAN_REVIEW');
  });
  it('rejects unknown model, bogus confidence and arbitrary extra fields',()=>{
    const base={model:'laya-multilingual',modelRevision:'r1',inputHash:A,
      optionsVersion:'cfg',decision:'OCR_ONLY',policyOverridden:false};
    expect(DecisionAdviceVNextSchema.safeParse({...base,model:'unverified-model'}).success).toBe(false);
    expect(DecisionAdviceVNextSchema.safeParse({...base,confidence:1.1}).success).toBe(false);
    expect(DecisionAdviceVNextSchema.safeParse({...base,studentId:'private'}).success).toBe(false);
  });
  it('allows only explicitly cleared READY evidence packets and matches permission versions',()=>{
    const value={packet,retrieval,providerInputPermission:'ALLOWED',
      sourceVersion:'rev-01',permissionVersion:'perm-v1'};
    expect(EvidenceBoundPacketVNextSchema.safeParse(value).success).toBe(true);
    expect(EvidenceBoundPacketVNextSchema.safeParse({...value,providerInputPermission:'BLOCKED'}).success).toBe(false);
    expect(EvidenceBoundPacketVNextSchema.safeParse({...value,permissionVersion:'perm-old'}).success).toBe(false);
    expect(EvidenceBoundPacketVNextSchema.safeParse({...value,sourceVersion:'rev-old'}).success).toBe(false);
  });
  it('rejects AI payloads that reference unverified image extracts without a version',()=>{
    const value={packet,retrieval:{...retrieval,evidence:[img]},
      providerInputPermission:'ALLOWED',sourceVersion:'rev-01',permissionVersion:'perm-v1'};
    expect(EvidenceBoundPacketVNextSchema.safeParse(value).success).toBe(false);
    expect(EvidenceBoundPacketVNextSchema.safeParse({...value,mediaExtractorVersion:'ocr-v1'}).success).toBe(true);
  });
});

describe('TASK-18 academic notice scope: verified provenance and one-ended cohort',()=>{
  const scope=EvidenceScopeSchema.parse({
    campuses:['SEOUL'],majorCodes:['ECONOMICS'],majorRoles:['PRIMARY'],
    admissionTypes:['FOREIGN'],graduationTermScope:['2026-2'],cohortMax:2014,
  });
  const actor={
    campus:'SEOUL',majorCode:'ECONOMICS',
    majors:[{code:'ECONOMICS',role:'PRIMARY' as const}],
    admissionType:'FOREIGN',graduationTerm:'2026-2',
    graduationTermVerified:true,cohort:2014,
  };
  it('preserves optional scope on an ACTIVE immutable revision and allows only an exact match',()=>{
    const r=SourceRevisionVNextSchema.parse({...rev,applicableScope:scope});
    expect(r.applicableScope).toEqual(scope);
    expect(matchesEvidenceScope(r.applicableScope,actor)).toBe(true);
  });
  it('does not treat another admission type or major role as matching',()=>{
    expect(matchesEvidenceScope(scope,{...actor,admissionType:'GENERAL'})).toBe(false);
    expect(matchesEvidenceScope(scope,{...actor,majors:[{code:'ECONOMICS',role:'DOUBLE'}]})).toBe(false);
    expect(matchesEvidenceScope(scope,{...actor,majors:[
      {code:'OTHER',role:'PRIMARY'},{code:'ECONOMICS',role:'DOUBLE'},
    ]})).toBe(false); // cannot borrow PRIMARY role from another major
    expect(matchesEvidenceScope(scope,{...actor,majors:undefined})).toBe(false);
  });
  it('does not promote a self-reported or missing graduation term to YES',()=>{
    expect(matchesEvidenceScope(scope,{...actor,graduationTermVerified:false})).toBe(false);
    expect(matchesEvidenceScope(scope,{...actor,graduationTermVerified:undefined})).toBe(false);
    expect(matchesEvidenceScope(scope,{...actor,graduationTerm:'2027-2'})).toBe(false);
    expect(matchesEvidenceScope(scope,{...actor,graduationTerm:undefined})).toBe(false);
  });
  it('supports an upper OR lower cohort bound without requiring the other bound',()=>{
    expect(matchesEvidenceScope(scope,{...actor,cohort:2015})).toBe(false);
    expect(matchesEvidenceScope(EvidenceScopeSchema.parse({cohortMin:2022}),{cohort:2021})).toBe(false);
    expect(matchesEvidenceScope(EvidenceScopeSchema.parse({cohortMin:2022}),{cohort:2024})).toBe(true);
    expect(matchesEvidenceScope(EvidenceScopeSchema.parse({cohortRange:[2020,2026]}),{cohort:2024})).toBe(true);
    expect(matchesEvidenceScope(EvidenceScopeSchema.parse({cohortRange:[2020,2026]}),{cohort:2027})).toBe(false);
  });
  it('rejects contradictory scope representations, duplicates and malformed graduation terms',()=>{
    for(const invalid of [
      {cohortMin:2026,cohortMax:2022},
      {cohortRange:[2020,2026],cohortMax:2025},
      {graduationTermScope:['2026-3']},
      {graduationTermScope:['2026-2','2026-2']},
      {majorRoles:['PRIMARY','PRIMARY']},
      {admissionTypes:[]},
      {campuses:[]},
      {majorCodes:[]},
      {majorRoles:['UNKNOWN']},
    ])expect(EvidenceScopeSchema.safeParse(invalid).success).toBe(false);
    expect(matchesEvidenceScope({unknownStudentCondition:true} as never,actor)).toBe(false);
    expect(matchesEvidenceScope({campuses:[]} as never,actor)).toBe(false);
    expect(matchesEvidenceScope({majorCodes:[]} as never,actor)).toBe(false);
  });
  it('keeps a role-only restriction when major codes are omitted, not emptied',()=>{
    const roleOnly=EvidenceScopeSchema.parse({majorRoles:['DOUBLE']});
    expect(matchesEvidenceScope(roleOnly,{majors:[{code:'ECONOMICS',role:'DOUBLE'}]})).toBe(true);
    expect(matchesEvidenceScope(roleOnly,{majors:[{code:'ECONOMICS',role:'PRIMARY'}]})).toBe(false);
  });
});
