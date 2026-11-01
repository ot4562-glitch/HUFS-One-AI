import {validateCalendarWire, type CalendarEntry, type CalendarResult} from '@hufs-one/contracts';

/**
 * #51 "내 주요 일정" mini calendar view model. Pure: no fetch, clock or storage.
 * Dates, overdue and applicability come from the server's CalendarResult as-is; the UI only groups
 * and labels them. ambiguousNoticeIds are audit-only and never rendered.
 */

/** Marker category: never conveyed by colour alone — each has an icon name and text. */
export type MarkerCategory = 'REQUIRED_DEADLINE' | 'EVENT' | 'MY_DEADLINE';

export interface MarkerStyle {
  readonly text: string;
  /** Lucide-style icon name for the future React layer; shape differs per category. */
  readonly icon: 'alert-circle' | 'calendar-days' | 'bookmark';
}

export const MARKERS: Readonly<Record<MarkerCategory, MarkerStyle>> = {
  REQUIRED_DEADLINE: {text: '필수 마감', icon: 'alert-circle'},
  EVENT: {text: '시험·행사', icon: 'calendar-days'},
  MY_DEADLINE: {text: '관심 공고 마감', icon: 'bookmark'},
};

export interface CalendarItemView {
  readonly id: string;
  readonly title: string;
  readonly category: MarkerCategory;
  /** '일정' for EVENT so an event day never reads as a deadline. */
  readonly kindText: '일정' | '마감';
  readonly importanceText: string;
  readonly timeText: string;
  readonly endText: string | null;
  /** Calm wording, no alarm styling (Architecture feed principle). */
  readonly overdueText: string | null;
  readonly link: {readonly source: CalendarEntry['source']; readonly refId: string; readonly path: string};
  readonly ariaLabel: string;
}

export interface CalendarDayView {
  readonly seoulDate: string;
  readonly dayLabel: string;
  readonly isAsOfDay: boolean;
  readonly markers: readonly MarkerCategory[];
  readonly items: readonly CalendarItemView[];
  readonly ariaLabel: string;
}

export interface CalendarScreenView {
  /** Demo/as-of instant, shown as "기준 시각" — never as the real current time. */
  readonly asOfText: string;
  readonly days: readonly CalendarDayView[];
  /** Entries dated before the grid (e.g. overdue deadlines earlier this window): listed, not dropped. */
  readonly earlier: readonly CalendarItemView[];
  readonly laterCount: number;
  readonly undated: readonly {readonly title: string; readonly reasonText: string; readonly path: string}[];
  readonly needsConfirmation: readonly {readonly title: string; readonly text: string}[];
}

export type CalendarViewResult =
  | {readonly ok: true; readonly view: CalendarScreenView}
  | {readonly ok: false};

const IMPORTANCE_TEXT: Record<CalendarEntry['importance'], string> = {
  CRITICAL: '필수',
  REQUIRED: '필수',
  PERSONAL: '내 관련',
  RECOMMENDED: '추천',
  SAVED: '저장함',
};

const UNDATED_TEXT = {ROLLING: '상시 모집', DEADLINE_UNKNOWN: '마감일 미정'} as const;

const SCOPE_TEXT: Readonly<Record<string, string>> = {
  campus: '캠퍼스', college: '단과대학', major: '전공', cohort: '학번', admissionType: '입학 유형',
  graduationTerm: '졸업예정학기', enrollment: '학적 상태', course: '수강 과목', requirement: '졸업요건',
};

const MARKER_ORDER: readonly MarkerCategory[] = ['REQUIRED_DEADLINE', 'EVENT', 'MY_DEADLINE'];
const DAY_MS = 86_400_000;

const dateFmt = new Intl.DateTimeFormat('ko-KR', {timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'long'});
const shortDateFmt = new Intl.DateTimeFormat('ko-KR', {timeZone: 'Asia/Seoul', month: 'long', day: 'numeric'});
const timeFmt = new Intl.DateTimeFormat('ko-KR', {timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
const dateTimeFmt = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function categoryOf(e: CalendarEntry): MarkerCategory {
  if (e.kind === 'EVENT') return 'EVENT';
  return e.importance === 'CRITICAL' || e.importance === 'REQUIRED' ? 'REQUIRED_DEADLINE' : 'MY_DEADLINE';
}

function pathFor(source: CalendarEntry['source'], refId: string): string {
  return `${source === 'NOTICE' ? '/notices/' : '/opportunities/'}${encodeURIComponent(refId)}`;
}

/** Noon UTC of a Seoul calendar day, so formatting in Asia/Seoul lands on the same date. */
function seoulNoon(seoulDate: string): number {
  return Date.parse(`${seoulDate}T03:00:00.000Z`);
}

function seoulDateOf(ms: number): string {
  const v = new Date(ms + 9 * 3_600_000);
  return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
}

/** Monday of the Seoul week containing asOf. */
function weekStart(asOfSeoulDate: string): number {
  const noon = seoulNoon(asOfSeoulDate);
  const weekday = (new Date(noon).getUTCDay() + 6) % 7;
  return noon - weekday * DAY_MS;
}

function itemView(e: CalendarEntry): CalendarItemView {
  const category = categoryOf(e);
  const kindText = e.kind === 'EVENT' ? '일정' : '마감';
  const timeText = timeFmt.format(Date.parse(e.at));
  const endText = e.end === undefined ? null
    : seoulDateOf(Date.parse(e.end)) === e.seoulDate ? `~ ${timeFmt.format(Date.parse(e.end))}`
    : `~ ${shortDateFmt.format(Date.parse(e.end))}`;
  const overdueText = e.overdue ? '기한 경과 · 담당부서 확인' : null;
  const importanceText = IMPORTANCE_TEXT[e.importance];
  return {
    id: e.id, title: e.title, category, kindText, importanceText, timeText, endText, overdueText,
    link: {source: e.source, refId: e.refId, path: pathFor(e.source, e.refId)},
    ariaLabel: [MARKERS[category].text, category === 'MY_DEADLINE' ? importanceText : null, e.title,
      `${timeText}${endText ? ' ' + endText : ''}`, overdueText].filter(Boolean).join(', '),
  };
}

/**
 * Validates the wire (including asOf match) and builds a two-week Monday-start grid.
 * An invalid payload yields {ok:false}: render the error state, never partial or guessed dates.
 */
export function buildCalendarView(payload: unknown, expectedAsOf: string, weeks = 2): CalendarViewResult {
  let cal: CalendarResult;
  try {
    cal = validateCalendarWire(payload, expectedAsOf);
  } catch {
    return {ok: false};
  }
  const asOfDay = seoulDateOf(Date.parse(cal.asOf));
  const start = weekStart(asOfDay);
  const dayDates = Array.from({length: weeks * 7}, (_, i) => seoulDateOf(start + i * DAY_MS));
  const byDay = new Map<string, CalendarEntry[]>(dayDates.map(d => [d, []]));
  const earlier: CalendarEntry[] = [];
  let laterCount = 0;
  for (const e of [...cal.entries].sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id))) {
    const bucket = byDay.get(e.seoulDate);
    if (bucket) bucket.push(e);
    else if (e.seoulDate < dayDates[0]!) earlier.push(e);
    else laterCount++;
  }
  const days = dayDates.map((seoulDate): CalendarDayView => {
    const items = byDay.get(seoulDate)!.map(itemView);
    const markers = MARKER_ORDER.filter(m => items.some(i => i.category === m));
    const dayLabel = dateFmt.format(seoulNoon(seoulDate));
    const deadlines = items.filter(i => i.kindText === '마감').length;
    const events = items.length - deadlines;
    const counts = items.length === 0 ? '일정 없음'
      : [deadlines ? `마감 ${deadlines}건` : '', events ? `일정 ${events}건` : ''].filter(Boolean).join(', ');
    return {
      seoulDate, dayLabel, isAsOfDay: seoulDate === asOfDay, markers, items,
      ariaLabel: `${dayLabel}${seoulDate === asOfDay ? ' (기준일)' : ''}, ${counts}`,
    };
  });
  return {
    ok: true,
    view: {
      asOfText: `기준 시각 ${dateTimeFmt.format(Date.parse(cal.asOf))}`,
      days,
      earlier: earlier.map(itemView),
      laterCount,
      undated: cal.undated.map(u => ({title: u.title, reasonText: UNDATED_TEXT[u.reason], path: pathFor(u.source, u.refId)})),
      needsConfirmation: cal.needsConfirmation.map(n => ({
        title: n.title,
        text: `적용 여부 확인 필요: ${n.unknownScope.map(s => SCOPE_TEXT[s] ?? '적용 대상').filter((v, i, a) => a.indexOf(v) === i).join('·')}`,
      })),
    },
  };
}
