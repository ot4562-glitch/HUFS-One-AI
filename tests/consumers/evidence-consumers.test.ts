import {describe,expect,it} from 'vitest';
import {
  SourceRevisionVNextSchema,SourceSpanVNextSchema,RetrievalEnvelopeVNextSchema,
  VerifiedClaimVNextSchema,RevisionInvalidationVNextSchema,
  SourceSnapshotSchema,NoticeResultSchema,
} from '@hufs-one/contracts';

const NOW='2026-10-31T00:00:00.000Z';
const hash='a'.repeat(64);
const base={
  revisionId:'revision-r1',sourceId:'approved-synthetic-source',
  originalSha256:hash,contentSha256:hash,mediaKind:'HTML' as const,
  sourceClass:'SYNTHETIC' as const,permissionRef:'synthetic-ref',
  provenance:'SYNTHETIC' as const,status:'ACTIVE' as const,
  changeKind:'NEW' as const,fetchedAt:NOW,lastCheckedAt:NOW,
  lastVerifiedAt:NOW,
};
const span={kind:'TEXT' as const,sourceRevisionId:'revision-r1',
  paragraphId:'paragraph-1',startCodePoint:0,endCodePoint:2,quote:'공고'};
const envelope={
  queryVersion:'q-v1',asOf:NOW,sourceRevisionIds:['revision-r1'],
  permissionPolicyVersion:'permission-v1',retrievalConfigVersion:'keyword-v1',
  retrievalState:'READY' as const,evidence:[span],
};

describe('independent synthetic vNext consumers, without modifying track code',()=>{
  it('UI rejects a source highlight whose image coordinates cannot be verified',()=>{
    expect(SourceSpanVNextSchema.safeParse({...span,kind:'IMAGE'}).success).toBe(false);
    expect(RetrievalEnvelopeVNextSchema.parse(envelope).evidence).toHaveLength(1);
  });
  it('recommendation uses only approved current revisions and can reject revoked sources',()=>{
    expect(SourceRevisionVNextSchema.parse(base).status).toBe('ACTIVE');
    expect(SourceRevisionVNextSchema.safeParse({...base,
      sourceClass:'RESEARCH_REFERENCE_ONLY'}).success).toBe(false);
    expect(RevisionInvalidationVNextSchema.safeParse({
      eventId:'event-01',sourceId:base.sourceId,
      previousRevisionId:base.revisionId,newRevisionId:'revision-r2',
      changedAt:NOW,reason:'CANCELLED',
      permissionPolicyVersion:'permission-v2',
      invalidates:['RETRIEVAL','CLAIMS','FEED','NOTICES'],
    }).success).toBe(true);
  });
  it('academics refuses student deadlines labelled as admin dates or invented temporal claims',()=>{
    const claim={
      claimId:'deadline-01',sourceRevisionId:'revision-r1',
      field:'studentDeadline',value:'2026-11-01T10:00:00+09:00',
      dateKind:'STUDENT' as const,evidence:[span],
      state:'VERIFIED' as const,risk:'HIGH' as const,
      reviewerId:'reviewer-01',claimCheckedAt:NOW,
    };
    expect(VerifiedClaimVNextSchema.safeParse(claim).success).toBe(true);
    expect(VerifiedClaimVNextSchema.safeParse({...claim,
      value:'다음 주'}).success).toBe(false);
  });
  it('API keeps legacy source snapshots and notice results unchanged',()=>{
    const legacy={id:'snapshot-1',class:'SYNTHETIC',fetchedAt:NOW,
      hash:'legacy-snapshot-hash',permissionRef:'synthetic-ref',version:'1',
      paragraphs:[{id:'paragraph-1',text:'공고 확인'}]};
    expect(SourceSnapshotSchema.parse(legacy).id).toBe('snapshot-1');
    const notice={asOf:NOW,items:[{
      noticeId:'notice-1',title:'합성 공지',
      priority:'GENERAL',appliesTo:'UNKNOWN',
      evidenceRefs:['EV-SYN-01'],verificationState:'NEEDS_REVIEW',
    }],pinnedIds:[]};
    expect(NoticeResultSchema.parse(notice).items).toHaveLength(1);
  });
});
