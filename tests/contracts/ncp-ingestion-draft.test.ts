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
  it('detects incompatible schema versions before deployment',()=>{
    const v={gitSha:'f'.repeat(40),buildSha:shaA,migrationVersion:'migration-1',
      adapterVersion:'adapter-1',datasetRevision:'data-1',schemaVersion:1};
    expect(D.isReaderCompatible(v,{minSchemaVersion:1,maxSchemaVersion:1})).toBe(true);
    expect(D.isReaderCompatible(v,{minSchemaVersion:2,maxSchemaVersion:2})).toBe(false);
    expect(D.isReaderCompatible(v,{minSchemaVersion:2,maxSchemaVersion:1})).toBe(false);
    expect(D.VersionHandshakeDraftSchema.safeParse({...v,gitSha:'untrusted'}).success).toBe(false);
  });
});
