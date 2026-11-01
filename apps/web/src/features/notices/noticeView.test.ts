import {describe, expect, it} from 'vitest';
import {NoticeResultSchema} from '@hufs-one/contracts';
import {buildNoticeList} from './noticeView.js';

const AS_OF = '2026-11-20T00:00:00.000Z';
const result = NoticeResultSchema.parse({
  asOf: AS_OF,
  pinnedIds: ['SYN-NOT-003'],
  items: [
    {noticeId: 'SYN-NOT-001', title: '가상 졸업인증 서류 제출', priority: 'CRITICAL_DUE', appliesTo: 'YES',
      studentDeadline: '2026-11-24T00:00:00.000Z', overdue: false, adminReportDeadline: '2026-11-22T00:00:00.000Z',
      evidenceRefs: ['EV-1'], verificationState: 'VERIFIED'},
    {noticeId: 'SYN-NOT-002', title: '가상 교과개편 초안', priority: 'ACADEMIC_REQUIRED', appliesTo: 'UNKNOWN',
      evidenceRefs: ['EV-2'], verificationState: 'CANDIDATE'},
    {noticeId: 'SYN-NOT-003', title: '가상 지난 장학 신청', priority: 'GENERAL', appliesTo: 'YES',
      studentDeadline: '2026-11-18T00:00:00.000Z', overdue: true, evidenceRefs: [], verificationState: 'VERIFIED'},
    {noticeId: 'SYN-NOT-004', title: '가상 반려된 공지', priority: 'GENERAL', appliesTo: 'YES',
      evidenceRefs: [], verificationState: 'REJECTED'},
  ],
});

describe('notice list view', () => {
  const list = buildNoticeList(result);

  it('puts pinned first, keeps server order otherwise, and hides REJECTED', () => {
    expect(list.map(n => n.noticeId)).toEqual(['SYN-NOT-003', 'SYN-NOT-001', 'SYN-NOT-002']);
    expect(list[0]!.pinned).toBe(true);
  });

  it('shows only the student deadline, in Seoul time, never the admin report deadline', () => {
    const n = list.find(x => x.noticeId === 'SYN-NOT-001')!;
    expect(n.deadlineText).toBe('제출 마감 11월 24일 (화) 09:00');
    expect(JSON.stringify(n)).not.toContain('11월 22일');
  });

  it('uses calm overdue wording and labels unverified and unknown applicability', () => {
    expect(list[0]!.overdueText).toBe('기한 경과 · 담당부서 확인');
    const draft = list.find(x => x.noticeId === 'SYN-NOT-002')!;
    expect(draft.verificationText).toBe('확인 전 초안');
    expect(draft.appliesText).toBe('해당 여부 확인 필요');
    expect(draft.deadlineText).toBeNull();
  });
});
