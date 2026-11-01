import type {NoticeResult} from '@hufs-one/contracts';

type NoticeItem = NoticeResult['items'][number];

export interface NoticeItemView {
  readonly noticeId: string;
  readonly title: string;
  readonly pinned: boolean;
  readonly priorityText: string;
  readonly appliesText: string;
  /** Student submission deadline only; the department's internal report deadline is never shown as one. */
  readonly deadlineText: string | null;
  readonly overdueText: string | null;
  readonly verificationText: string | null;
  readonly evidenceCount: number;
  readonly path: string;
}

const PRIORITY_TEXT: Record<NoticeItem['priority'], string> = {
  CRITICAL_DUE: '기한 임박 필수',
  ACADEMIC_REQUIRED: '학사 필수',
  PERSONAL_OPPORTUNITY: '내 관련 기회',
  GENERAL: '일반',
};

const APPLIES_TEXT: Record<NoticeItem['appliesTo'], string> = {
  YES: '나에게 해당',
  NO: '해당 없음',
  UNKNOWN: '해당 여부 확인 필요',
};

/** VERIFIED needs no badge; REJECTED items are not shown at all. */
const VERIFICATION_TEXT: Record<Exclude<NoticeItem['verificationState'], 'REJECTED'>, string | null> = {
  VERIFIED: null,
  CANDIDATE: '확인 전 초안',
  NEEDS_REVIEW: '검토 필요',
};

const deadlineFmt = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** Pinned first (server order), then the server's order. Values are displayed, never recomputed. */
export function buildNoticeList(result: NoticeResult): NoticeItemView[] {
  const pinned = new Set(result.pinnedIds);
  const visible = result.items.filter(i => i.verificationState !== 'REJECTED');
  const ordered = [
    ...result.pinnedIds.map(id => visible.find(i => i.noticeId === id)).filter((i): i is NoticeItem => i !== undefined),
    ...visible.filter(i => !pinned.has(i.noticeId)),
  ];
  return ordered.map(i => ({
    noticeId: i.noticeId,
    title: i.title,
    pinned: pinned.has(i.noticeId),
    priorityText: PRIORITY_TEXT[i.priority],
    appliesText: APPLIES_TEXT[i.appliesTo],
    deadlineText: i.studentDeadline ? `제출 마감 ${deadlineFmt.format(Date.parse(i.studentDeadline))}` : null,
    overdueText: i.overdue === true ? '기한 경과 · 담당부서 확인' : null,
    verificationText: VERIFICATION_TEXT[i.verificationState as Exclude<NoticeItem['verificationState'], 'REJECTED'>],
    evidenceCount: i.evidenceRefs.length,
    path: `/notices/${encodeURIComponent(i.noticeId)}`,
  }));
}
