import {describe,expect,it} from 'vitest';
import {NcpIngestionDraft as D} from '@hufs-one/contracts';

const shaA='a'.repeat(64),shaB='b'.repeat(64);
const revision={
  schemaVersion:1,sourceId:'SYN-SOURCE',revisionId:'SYN-REV-1',permissionRef:'SYN-GRANT',
  rawObjectKey:'sources/SYN-SOURCE/SYN-REV-1.html',
  originalSha256:shaA,normalizedSha256:shaB,extractedFromOriginalSha256:shaA,
  ingestedBy:'SYN-WORKER',fetchedAt:'2026-11-01T00:00:00Z',
  stage:'PARSED',provenance:'SYNTHETIC',
  rights:{collect:true,store:true,search:false},
} as const;
const reviewed={...revision,provenance:'REAL_APPROVED' as const,stage:'APPROVED' as const,
  rights:{collect:true,store:true,search:true},
  review:{decision:'APPROVED' as const,reviewerId:'SYN-REVIEWER',
    reviewedAt:'2026-11-02T00:00:00Z',originalSha256:shaA,normalizedSha256:shaB}};

describe('#449 pre-NCP ingestion draft contract (synthetic only)',()=>{
  it('keeps operating source inventory as a shape only',()=>{
    const source={sourceId:'SYN-SOURCE',canonicalUrl:'https://example.org/notices/1',
      permissionRef:'SYN-GRANT',publisher:'Synthetic Organization',sourceClass:'PUBLIC_WEB',
      observedAt:'2026-11-01T00:00:00Z',
      rights:{collect:true,store:true,search:false,externalTransfer:false}};
    expect(D.SourceRegistrationDraftSchema.parse(source).rights.search).toBe(false);
    expect(D.SourceRegistrationDraftSchema.safeParse({...source,
      canonicalUrl:'https://127.0.0.1/admin'}).success).toBe(false);
    expect(D.SourceRegistrationDraftSchema.safeParse({...source,
      privateStudentRecord:'secret'}).success).toBe(false);
  });
  it('does not allow a synthetic or unreviewed revision to become active',()=>{
    expect(D.SourceRevisionDraftSchema.parse(revision).stage).toBe('PARSED');
    expect(D.SourceRevisionDraftSchema.safeParse({...revision,stage:'ACTIVE'}).success).toBe(false);
    expect(D.SourceRevisionDraftSchema.safeParse({...reviewed,stage:'ACTIVE'}).success).toBe(true);
    expect(D.SourceRevisionDraftSchema.safeParse({...reviewed,
      provenance:'SYNTHETIC',stage:'ACTIVE'}).success).toBe(false);
  });
  it('requires distinct independent review and matching byte/normalized hashes',()=>{
    for(const item of [
      {...reviewed,review:{...reviewed.review,reviewerId:'SYN-WORKER'}},
      {...reviewed,review:{...reviewed.review,normalizedSha256:shaA}},
      {...reviewed,review:{...reviewed.review,reviewedAt:'2026-10-01T00:00:00Z'}},
      {...reviewed,extractedFromOriginalSha256:shaB},
      {...reviewed,rights:{collect:true,store:false,search:true},stage:'ACTIVE'},
    ]) expect(D.SourceRevisionDraftSchema.safeParse(item).success).toBe(false);
  });
  it('refuses URLs/parent traversal as private object keys and invalid effective ranges',()=>{
    for(const rawObjectKey of ['https://example.org/file','../secret','/private/secret',
      'a\\b','s/../secret','s/%2e%2e/secret','s/%252f/secret',
      's//secret','s?key=1','s#fragment','s/./%2f'])
      expect(D.SourceRevisionDraftSchema.safeParse({...revision,rawObjectKey}).success).toBe(false);
    expect(D.SourceRevisionDraftSchema.safeParse({...revision,
      effectiveFrom:'2026-11-05T00:00:00Z',effectiveUntil:'2026-11-01T00:00:00Z'}).success).toBe(false);
  });
  it('requires paragraph-level provenance for KNOWN values but not unknowns',()=>{
    const own={sourceId:'SYN-SOURCE',revisionId:'SYN-REV-1',paragraphId:'p-4'};
    const known={state:'KNOWN',value:'2026-12-31',provenance:'SOURCE_VERIFIED',
      evidence:[own],observedAt:'2026-11-10T00:00:00Z'};
    expect(D.NormalizedFieldDraftSchema.parse(known).state).toBe('KNOWN');
    for(const invalid of [
      {...known,evidence:[]},
      {...known,provenance:'OWNER_SELF_REPORTED'},
      {...known,value:null},
      {state:'UNKNOWN',value:'do not guess',reason:'not listed'},
      {state:'NOT_APPLICABLE',value:false,reason:'does not apply'},
    ]) expect(D.NormalizedFieldDraftSchema.safeParse(invalid).success).toBe(false);
    expect(D.NormalizedFieldDraftSchema.parse({state:'UNKNOWN',reason:'not stated'}))
      .toEqual({state:'UNKNOWN',reason:'not stated'});
    expect(D.NormalizedFieldDraftSchema.parse({state:'NOT_APPLICABLE',reason:'no deadline'}))
      .toEqual({state:'NOT_APPLICABLE',reason:'no deadline'});
    expect(D.NormalizedEvidenceRecordDraftSchema.safeParse({
      sourceId:'SYN-SOURCE',revisionId:'SYN-REV-1',
      fields:{deadline:known,campus:{state:'UNKNOWN',reason:'not stated'}},
    }).success).toBe(true);
    expect(D.NormalizedEvidenceRecordDraftSchema.safeParse({
      sourceId:'SYN-SOURCE',revisionId:'SYN-REV-2',
      fields:{deadline:known},
    }).success).toBe(false);
  });
  it('binds a correction or cancellation to evidence from the new version',()=>{
    const reference={sourceId:'SYN-SOURCE',revisionId:'SYN-REV-2',paragraphId:'p-1'};
    const change={sourceId:'SYN-SOURCE',revisionId:'SYN-REV-2',
      previousRevisionId:'SYN-REV-1',kind:'CANCELLED',
      observedAt:'2026-11-10T00:00:00Z',reasonEvidence:[reference]};
    expect(D.SourceChangeDraftSchema.parse(change).kind).toBe('CANCELLED');
    expect(D.SourceChangeDraftSchema.safeParse({
      ...change,previousRevisionId:'SYN-REV-2',
    }).success).toBe(false);
    expect(D.SourceChangeDraftSchema.safeParse({
      ...change,reasonEvidence:[{...reference,revisionId:'SYN-REV-1'}],
    }).success).toBe(false);
    expect(D.SourceChangeDraftSchema.safeParse({
      ...change,reasonEvidence:[],
    }).success).toBe(false);
  });
  it('validates scoped public discovery policies without granting crawl rights',()=>{
    const scope={sourceId:'SYN-SOURCE',approvedOrigin:'https://example.org/',
      pathPrefixes:['/notices','/files'],robotsStatus:'UNKNOWN' as const,
      termsStatus:'UNKNOWN' as const,policyRef:'SYN-POLICY',observedAt:'2026-11-11T00:00:00Z'};
    expect(D.CrawlScopeDraftSchema.parse(scope).robotsStatus).toBe('UNKNOWN');
    for(const changed of [
      {...scope,approvedOrigin:'https://example.org/notices'},
      {...scope,approvedOrigin:'https://127.0.0.1/'},
      {...scope,pathPrefixes:['/notices/../secret']},
      {...scope,pathPrefixes:['/notices/%2e%2e']},
      {...scope,pathPrefixes:['/notices','/notices']},
    ]) expect(D.CrawlScopeDraftSchema.safeParse(changed).success).toBe(false);
  });
  it('keeps a discovered document proposal in REVIEW_REQUIRED and bound to its origin',()=>{
    const candidate={sourceId:'SYN-SOURCE',discoveredFromRevisionId:'SYN-REV-1',
      sourceCanonicalUrl:'https://example.org/notices/index',
      proposedUrl:'https://example.org/notices/2',
      kind:'DOCUMENT' as const,seenAt:'2026-11-11T00:00:00Z',
      reviewState:'REVIEW_REQUIRED' as const};
    expect(D.DiscoveryCandidateDraftSchema.parse(candidate).kind).toBe('DOCUMENT');
    for(const changed of [
      {...candidate,reviewState:'APPROVED'},
      {...candidate,proposedUrl:'https://evil.example.net/notices/2'},
      {...candidate,proposedUrl:'http://example.org/notices/2'},
      {...candidate,secret:'private-data'},
    ]) expect(D.DiscoveryCandidateDraftSchema.safeParse(changed).success).toBe(false);
  });

  it('maps Crawlee review-only candidates into scoped draft records without approval',()=>{
    const scope={sourceId:'SYN-SOURCE',approvedOrigin:'https://example.org/',
      pathPrefixes:['/notices','/files'],robotsStatus:'UNKNOWN' as const,
      termsStatus:'UNKNOWN' as const,policyRef:'SYN-POLICY',
      observedAt:'2026-11-11T00:00:00Z'};
    const discovered={state:'REVIEW_REQUIRED',kind:'SITEMAP',scanned:6,
      sourceUrl:'https://example.org/notices/index',
      candidates:[
        {url:'https://example.org/notices/2',type:'DOCUMENT'},
        {url:'https://example.org/notices/2',type:'DOCUMENT'},
        {url:'https://example.org/files/a.pdf',type:'ATTACHMENT'},
        {url:'https://example.org/notices-old/3',type:'DOCUMENT'},
        {url:'https://example.org/private/4',type:'DOCUMENT'},
        {url:'https://example.org/notices/%252e%252e/admin',type:'DOCUMENT'},
      ]};
    const registration={sourceId:'SYN-SOURCE',
      canonicalUrl:'https://example.org/notices/index',permissionRef:'SYN-GRANT',
      publisher:'Synthetic Official',sourceClass:'PUBLIC_WEB' as const,
      observedAt:'2026-11-01T00:00:00Z',
      rights:{collect:true,store:true,search:false,externalTransfer:false}};
    const bound={registration,revision};
    const drafts=D.prepareDiscoveryReviewDrafts({
      ...bound,
      sourceId:'SYN-SOURCE',revisionId:'SYN-REV-1',
      seenAt:'2026-11-11T02:00:00Z',scope,discovered,
    });
    expect(drafts).toHaveLength(2);
    expect(drafts.map(x=>x.proposedUrl)).toEqual([
      'https://example.org/notices/2','https://example.org/files/a.pdf',
    ]);
    expect(drafts.every(x=>x.reviewState==='REVIEW_REQUIRED')).toBe(true);
    const item=drafts[0]!;
    expect(D.isDiscoveryCandidateInScopeForReview(item,scope)).toBe(true);
    expect(D.isDiscoveryCandidateInScopeForReview(item,{...scope,sourceId:'OTHER'})).toBe(false);
    expect(D.isDiscoveryCandidateInScopeForReview({
      ...item,proposedUrl:'https://example.org/notices-old/3'},scope)).toBe(false);
    expect(D.isDiscoveryCandidateInScopeForReview({
      ...item,proposedUrl:'https://example.org/notices/%2fadmin'},scope)).toBe(false);
    expect(()=>D.prepareDiscoveryReviewDrafts({
      ...bound,sourceId:'OTHER',revisionId:'SYN-REV-1',seenAt:'2026-11-11T02:00:00Z',
      scope,discovered,
    })).toThrow();
    expect(()=>D.prepareDiscoveryReviewDrafts({
      ...bound,sourceId:'SYN-SOURCE',revisionId:'SYN-REV-1',seenAt:'2026-11-11T02:00:00Z',
      scope,discovered:{...discovered,state:'ACTIVE'},
    })).toThrow();
  });

  it('requires the captured source and immutable revision to match the discovered batch',()=>{
    const registration={sourceId:'SYN-SOURCE',canonicalUrl:'https://example.org/notices/index',
      permissionRef:'SYN-GRANT',publisher:'Synthetic Official',
      sourceClass:'PUBLIC_WEB' as const,observedAt:'2026-11-01T00:00:00Z',
      rights:{collect:true,store:true,search:false,externalTransfer:false}};
    const scope={sourceId:'SYN-SOURCE',approvedOrigin:'https://example.org/',
      pathPrefixes:['/notices'],robotsStatus:'UNKNOWN' as const,
      termsStatus:'UNKNOWN' as const,policyRef:'SYN-POLICY',
      observedAt:'2026-11-11T00:00:00Z'};
    const discovered={state:'REVIEW_REQUIRED',kind:'HTML',scanned:1,
      sourceUrl:registration.canonicalUrl,
      candidates:[{url:'https://example.org/notices/2',type:'DOCUMENT'}]};
    const build=(changes:Record<string,unknown>={})=>D.prepareDiscoveryReviewDrafts({
      sourceId:'SYN-SOURCE',revisionId:'SYN-REV-1',
      seenAt:'2026-11-11T02:00:00Z',registration,revision,scope,discovered,
      ...changes,
    });
    expect(build()).toHaveLength(1);
    for(const changed of [
      {registration:{...registration,canonicalUrl:'https://example.org/notices/other'}},
      {registration:{...registration,permissionRef:'OTHER'}},
      {registration:{...registration,rights:{...registration.rights,store:false}}},
      {revision:{...revision,revisionId:'SYN-REV-2'}},
      {revision:{...revision,stage:'FETCHED'}},
      {revision:{...revision,fetchedAt:'2026-12-01T00:00:00Z'}},
      {discovered:{...discovered,sourceUrl:'https://example.org/notices/other'}},
    ])expect(()=>build(changed)).toThrow();
  });

  it('preflights permissions, robots/terms, retry-after and budgets without network',()=>{
    const registration={sourceId:'SYN-SOURCE',canonicalUrl:'https://example.org/notices/index',
      permissionRef:'SYN-GRANT',publisher:'Synthetic Official',
      sourceClass:'PUBLIC_WEB' as const,observedAt:'2026-11-01T00:00:00Z',
      rights:{collect:true,store:true,search:false,externalTransfer:false}};
    const scope={sourceId:'SYN-SOURCE',approvedOrigin:'https://example.org/',
      pathPrefixes:['/notices'],robotsStatus:'REVIEWED_PERMITTED' as const,
      termsStatus:'REVIEWED_PERMITTED' as const,policyRef:'SYN-POLICY',
      observedAt:'2026-11-01T00:00:00Z'};
    const good={registration,scope,pageUrl:registration.canonicalUrl,
      now:'2026-11-11T00:00:00Z',remainingRequests:2,remainingBytes:10000};
    expect(D.evaluateSourceRefreshPreflight(good)).toEqual({
      state:'READY_FOR_OPERATOR_RECHECK',reasons:[],
    });
    const cases=[
      [{registration:{...registration,rights:{...registration.rights,collect:false}}},
        'PURPOSE_RIGHTS_NOT_REVIEWED'],
      [{scope:{...scope,robotsStatus:'UNKNOWN'}},'ROBOTS_NOT_PERMITTED'],
      [{scope:{...scope,termsStatus:'RESTRICTED'}},'TERMS_NOT_PERMITTED'],
      [{remainingRequests:0},'BUDGET_EXHAUSTED'],
      [{remainingBytes:0},'BUDGET_EXHAUSTED'],
      [{retryAfter:'2026-11-11T00:05:00Z'},'RETRY_AFTER'],
      [{pageUrl:'https://example.org/notices/other'},'UNREGISTERED_SOURCE'],
      [{scope:{...scope,pathPrefixes:['/files']}},'PATH_NOT_APPROVED'],
      [{registration:{...registration,observedAt:'2026-12-01T00:00:00Z'}},
        'FUTURE_REVIEW'],
    ] as const;
    for(const [change,reason] of cases){
      const result=D.evaluateSourceRefreshPreflight({...good,...change});
      expect(result.state).toBe('BLOCKED');
      expect(result.reasons).toContain(reason);
    }
    expect(D.evaluateSourceRefreshPreflight({...good,remainingRequests:-1})).toEqual({
      state:'BLOCKED',reasons:['INVALID_CONFIGURATION'],
    });
  });

  it('detects incompatible schema versions before deployment',()=>{
    const v={gitSha:'f'.repeat(40),buildSha:shaA,migrationVersion:'migration-1',
      adapterVersion:'adapter-1',datasetRevision:'data-1',schemaVersion:1};
    expect(D.isReaderCompatible(v,{minSchemaVersion:1,maxSchemaVersion:1})).toBe(true);
    expect(D.isReaderCompatible(v,{minSchemaVersion:2,maxSchemaVersion:2})).toBe(false);
    expect(D.isReaderCompatible(v,{minSchemaVersion:2,maxSchemaVersion:1})).toBe(false);
    expect(D.VersionHandshakeDraftSchema.safeParse({...v,gitSha:'untrusted'}).success).toBe(false);
  });
});
