import {describe,expect,it} from 'vitest';
import {hashParagraphs,LocalTemporalEvidenceIndex} from
  '../../apps/api/src/modules/opportunities/temporal-index.js';

function revision(override:Record<string,unknown>={}){
  const paragraphs=[{id:'p1',text:'가상 데이터 프로그램 모집 마감은 11월 2일입니다.'}];
  return {
    revisionId:'R1',sourceId:'SOURCE1',mediaKind:'HTML',
    contentSha256:hashParagraphs(paragraphs),
    fetchedAt:'2026-10-20T00:00:00.000Z',
    publishedAt:'2026-10-19T00:00:00.000Z',
    lastCheckedAt:'2026-10-20T00:00:00.000Z',
    lastVerifiedAt:'2026-10-20T00:00:00.000Z',
    permissionRef:'PERM-APPROVED',provenance:'SYNTHETIC',status:'ACTIVE',
    paragraphs,...override,
  };
}
const query=(asOf='2026-10-21T00:00:00.000Z')=>({
  query:'데이터 모집',asOf,allowedPermissionRefs:new Set(['PERM-APPROVED']),
});
describe('Local Temporal RAG evidence index (no NCP/IO)',()=>{
  it('returns only exact approved source paragraphs and tracks version IDs',()=>{
    const index=new LocalTemporalEvidenceIndex();
    index.add(revision());
    const res=index.search(query());
    expect(res.state).toBe('READY');
    expect(res.matches).toHaveLength(1);
    expect(res.matches[0]?.revisionId).toBe('R1');
    expect(res.matches[0]?.paragraphId).toBe('p1');
    expect(res.matches[0]?.quote).toContain('11월 2일');
    expect(index.size()).toBe(1);
  });
  it('refuses broken hashes, duplicate IDs and non-monotonic revision history',()=>{
    const index=new LocalTemporalEvidenceIndex();
    expect(()=>index.add(revision({contentSha256:'a'.repeat(64)}))).toThrow(/Hash mismatch/);
    index.add(revision());
    expect(()=>index.add(revision())).toThrow(/Immutable/);
    expect(()=>index.add(revision({revisionId:'R2',supersedes:'R0'}))).toThrow(/Missing previous/);
    expect(()=>index.add(revision({revisionId:'R2',supersedes:'R1'}))).toThrow(/Non-increasing/);
  });
  it('does not leak content published or fetched after a historical asOf',()=>{
    const index=new LocalTemporalEvidenceIndex();index.add(revision());
    const res=index.search(query('2026-10-18T00:00:00.000Z'));
    expect(res.state).toBe('NO_EVIDENCE');
    expect(res.matches).toHaveLength(0);
  });
  it('does not leak a document before human verification, even if downloaded',()=>{
    const index=new LocalTemporalEvidenceIndex();index.add(revision({
      lastVerifiedAt:'2026-10-22T00:00:00.000Z',
    }));
    expect(index.search(query('2026-10-21T00:00:00.000Z')).state).toBe('NO_EVIDENCE');
    expect(index.search(query('2026-10-23T00:00:00.000Z')).state).toBe('READY');
  });
  it('replaces original with corrected version and never falls back to unreviewed old facts',()=>{
    const index=new LocalTemporalEvidenceIndex();index.add(revision());
    const paragraphs=[{id:'p1',text:'정정: 데이터 프로그램 모집 마감은 11월 20일입니다.'}];
    index.add(revision({
      revisionId:'R2',supersedes:'R1',paragraphs,
      contentSha256:hashParagraphs(paragraphs),
      fetchedAt:'2026-10-25T00:00:00.000Z',
      publishedAt:'2026-10-25T00:00:00.000Z',
      lastCheckedAt:'2026-10-25T00:00:00.000Z',
      lastVerifiedAt:'2026-10-26T00:00:00.000Z',
    }));
    expect(index.search(query('2026-10-24T00:00:00.000Z')).matches[0]?.revisionId).toBe('R1');
    expect(index.search(query('2026-10-25T12:00:00.000Z')).state).toBe('NO_EVIDENCE');
    const latest=index.search(query('2026-10-27T00:00:00.000Z'));
    expect(latest.matches[0]?.revisionId).toBe('R2');
    expect(latest.matches[0]?.quote).not.toContain('11월 2일');
  });
  it('hides the entire source after cancellation instead of replaying old active revisions',()=>{
    const index=new LocalTemporalEvidenceIndex();index.add(revision());
    const paragraphs=[{id:'p1',text:'모집이 취소되었습니다.'}];
    index.add(revision({revisionId:'R2',supersedes:'R1',
      fetchedAt:'2026-10-28T00:00:00.000Z',publishedAt:'2026-10-28T00:00:00.000Z',
      lastCheckedAt:'2026-10-28T00:00:00.000Z',lastVerifiedAt:undefined,
      paragraphs,contentSha256:hashParagraphs(paragraphs),status:'RETRACTED'}));
    expect(index.search(query('2026-10-27T00:00:00.000Z')).state).toBe('READY');
    expect(index.search(query('2026-10-29T00:00:00.000Z')).state).toBe('NO_EVIDENCE');
  });
  it('rejects expired effective period, rights mismatch and RESEARCH_ONLY',()=>{
    const index=new LocalTemporalEvidenceIndex();
    index.add(revision({validUntil:'2026-10-21T00:00:00.000Z'}));
    expect(index.search(query('2026-10-21T00:00:00.000Z')).state).toBe('NO_EVIDENCE');
    const second=new LocalTemporalEvidenceIndex();second.add(revision());
    expect(second.search({...query(),allowedPermissionRefs:new Set(['OTHER'])}).state).toBe('NO_EVIDENCE');
    const third=new LocalTemporalEvidenceIndex();third.add(revision({provenance:'RESEARCH_ONLY'}));
    expect(third.search(query()).state).toBe('NO_EVIDENCE');
  });
  it('limits topK, uses deterministic ordering, and rejects invalid time ranges',()=>{
    const index=new LocalTemporalEvidenceIndex();
    index.add(revision());
    expect(()=>index.search({...query(),topK:13})).toThrow();
    expect(()=>index.add(revision({revisionId:'R2',
      supersedes:'R1',fetchedAt:'2026-10-22T00:00:00.000Z',
      lastCheckedAt:'2026-10-22T00:00:00.000Z',
      lastVerifiedAt:'2026-10-22T00:00:00.000Z',
      validFrom:'2026-11-01T00:00:00.000Z',
      validUntil:'2026-10-22T00:00:00.000Z',
    }))).toThrow(/Invalid effective period/);
    expect(index.search(query())).toEqual(index.search(query()));
  });
});
