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
      'a\\b','s/../secret'])
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
  it('detects incompatible schema versions before deployment',()=>{
    const v={gitSha:'f'.repeat(40),buildSha:shaA,migrationVersion:'migration-1',
      adapterVersion:'adapter-1',datasetRevision:'data-1',schemaVersion:1};
    expect(D.isReaderCompatible(v,{minSchemaVersion:1,maxSchemaVersion:1})).toBe(true);
    expect(D.isReaderCompatible(v,{minSchemaVersion:2,maxSchemaVersion:2})).toBe(false);
    expect(D.isReaderCompatible(v,{minSchemaVersion:2,maxSchemaVersion:1})).toBe(false);
    expect(D.VersionHandshakeDraftSchema.safeParse({...v,gitSha:'untrusted'}).success).toBe(false);
  });
});
