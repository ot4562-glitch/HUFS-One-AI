import {isNextBookmarkStage, type BookmarkOutcome, type BookmarkStage, type OpportunityCatalogDetail, type OwnerWorkspaceRecord} from '@hufs-one/contracts';
import {ddayOf, type DDayView} from '../demo/dday.js';

/**
 * #80 지원 현황 보드 view model. Pure: no fetch, clock or storage.
 * Every stage after 관심 is the student's own record (USER_ENTERED_UNVERIFIED): never shown as an actual
 * submission, school/employer confirmation or acceptance. A missing or changed posting never removes a record.
 */

export const STAGES: readonly BookmarkStage[] = ['INTERESTED', 'PREPARING', 'SUBMITTED_SELF_REPORTED', 'AWAITING_RESULT', 'RESULT_RECORDED'];

export const STAGE_TEXT: Readonly<Record<BookmarkStage, string>> = {
  INTERESTED: '관심',
  PREPARING: '준비 중',
  SUBMITTED_SELF_REPORTED: '지원 완료',
  AWAITING_RESULT: '결과 대기',
  RESULT_RECORDED: '결과 기록',
};

/** Button label for moving a card into that stage. */
const ADVANCE_TEXT: Readonly<Record<BookmarkStage, string>> = {
  INTERESTED: '',
  PREPARING: '준비 시작',
  SUBMITTED_SELF_REPORTED: '지원했다고 기록',
  AWAITING_RESULT: '결과 대기로',
  RESULT_RECORDED: '결과 기록하기',
};

export const RESULT_TEXT: Readonly<Record<BookmarkOutcome['result'], string>> = {
  ACCEPTED: '합격',
  NOT_ACCEPTED: '불합격',
  WAITLISTED: '대기',
  WITHDRAWN: '지원 취소',
  OTHER: '기타',
};

export const SELF_REPORT_TEXT = '내가 기록함 · 확인되지 않음';

export interface BoardTask {
  readonly itemId: string;
  readonly task: string;
  readonly done: boolean;
}

export interface BoardCard {
  readonly itemId: string;
  readonly opportunityId: string;
  /** Posting title from the catalog; null when the posting could not be read (record is kept). */
  readonly title: string | null;
  readonly stage: BookmarkStage;
  readonly stageText: string;
  /** True from 지원 완료 on: the badge SELF_REPORT_TEXT must stay visible. */
  readonly selfReported: boolean;
  readonly next: {readonly stage: BookmarkStage; readonly label: string} | null;
  readonly deadlineText: string | null;
  readonly dday: DDayView | null;
  readonly outcomeText: string | null;
  readonly synthetic: boolean;
  readonly tasks: readonly BoardTask[];
}

export interface BoardColumn {
  readonly stage: BookmarkStage;
  readonly title: string;
  readonly cards: readonly BoardCard[];
}

const deadlineFmt = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

const SEQUENCE = STAGES;
function nextOf(stage: BookmarkStage): BoardCard['next'] {
  const n = SEQUENCE[SEQUENCE.indexOf(stage) + 1];
  return n && isNextBookmarkStage(stage, n) ? {stage: n, label: ADVANCE_TEXT[n]} : null;
}

/**
 * Confirmed deadline only: applyClosesAt present and not marked rolling/unknown. D-day needs the server
 * asOf; without it the date is shown alone.
 */
function deadlineOf(detail: OpportunityCatalogDetail | null | undefined, asOf: string | null) {
  const o = detail?.opportunity;
  if (!o?.applyClosesAt || o.deadlineKind === 'ROLLING' || o.deadlineKind === 'UNKNOWN') return {deadlineText: null, dday: null, at: Infinity};
  const at = Date.parse(o.applyClosesAt);
  return {deadlineText: `마감 ${deadlineFmt.format(at)}`, dday: asOf ? ddayOf(o.applyClosesAt, asOf) : null, at};
}

export function buildBoard(
  bookmarks: readonly OwnerWorkspaceRecord[],
  actions: readonly OwnerWorkspaceRecord[],
  details: ReadonlyMap<string, OpportunityCatalogDetail | null>,
  asOf: string | null,
): BoardColumn[] {
  const cards = bookmarks.flatMap(r => {
    if (r.value.kind !== 'BOOKMARK') return [];
    const v = r.value;
    const stage = v.stage ?? 'INTERESTED'; // legacy SAVED rows start at 관심
    const detail = details.get(v.opportunityId);
    const d = deadlineOf(detail, asOf);
    const tasks = actions.flatMap(a => a.value.kind === 'ACTION_PLAN' && a.value.opportunityId === v.opportunityId
      ? [{itemId: a.itemId, task: a.value.task, done: a.value.done}] : []);
    const card: BoardCard & {at: number} = {
      itemId: r.itemId,
      opportunityId: v.opportunityId,
      title: detail?.opportunity.title ?? null,
      stage,
      stageText: STAGE_TEXT[stage],
      selfReported: SEQUENCE.indexOf(stage) >= SEQUENCE.indexOf('SUBMITTED_SELF_REPORTED'),
      next: nextOf(stage),
      deadlineText: d.deadlineText,
      dday: d.dday,
      outcomeText: v.outcome ? `${RESULT_TEXT[v.outcome.result]}${v.outcome.note ? ` · ${v.outcome.note}` : ''}` : null,
      synthetic: v.dataMode === 'SYNTHETIC',
      tasks,
      at: d.at,
    };
    return [card];
  });
  return STAGES.map(stage => ({
    stage,
    title: STAGE_TEXT[stage],
    // Nearest deadline first; undated last; stable by item id.
    cards: cards.filter(c => c.stage === stage)
      .sort((a, b) => (a.at - b.at) || (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0))
      .map(({at: _at, ...c}) => c),
  }));
}
