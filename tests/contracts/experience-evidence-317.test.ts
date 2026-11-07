import {describe,expect,it} from 'vitest';
import {OwnerWorkspaceValueSchema,OwnerExperienceReferenceUrlSchema,CareerTimelineEntrySchema}
  from '@hufs-one/contracts';

const owner={
  kind:'EXPERIENCE',dataMode:'OWNER_CONSENTED',state:'SELF_REPORTED',
  title:'직접 기록한 프로젝트',summary:'허가된 자기기록',
  achievement:'데이터 자료를 정리했음 (검증 전)',
  referenceUrl:'https://www.example.com/project',
} as const;

describe('#317 owner reference and achievement metadata are strictly self-reported',()=>{
  it('preserves optional private data without claiming institutional certification',()=>{
    expect(OwnerWorkspaceValueSchema.parse(owner)).toMatchObject(owner);
    expect(OwnerWorkspaceValueSchema.safeParse({...owner,achievement:'x'.repeat(241)}).success).toBe(false);
    expect(CareerTimelineEntrySchema.safeParse({
      itemId:'exp-a',title:owner.title,summary:owner.summary,achievement:owner.achievement,
      referenceUrl:owner.referenceUrl,category:'PROJECT',dataMode:'OWNER_CONSENTED',
      updatedAt:'2026-11-07T00:00:00Z',evidence:{state:'NOT_CERTIFIED'},
      certification:'NOT_INSTITUTION_VERIFIED',
    }).success).toBe(true);
  });
  it.each([
    'http://www.example.com/project',
    'https://localhost/admin',
    'https://service.internal/reports',
    'https://127.0.0.1/private',
    'https://user:secret@www.example.com/project',
    'https://www.example.com/search?token=secret',
    'https://www.example.com/page#user',
    'https://example.com:8443/private',
    'file:///private/data',
  ])('blocks unsafe and tokenized references: %s',url=>{
    expect(OwnerExperienceReferenceUrlSchema.safeParse(url).success).toBe(false);
    expect(OwnerWorkspaceValueSchema.safeParse({...owner,referenceUrl:url}).success).toBe(false);
  });
});
