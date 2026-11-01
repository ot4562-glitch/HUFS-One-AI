import {CalendarResultSchema, type CalendarResult} from '@hufs-one/contracts';

/**
 * SYNTHETIC CalendarResult relative to a snapshot asOf, for `--mode synthetic` and tests only.
 * Shapes follow the merged #53 wire (ids, Seoul day, overdue, window rules) and are schema-checked.
 */
const DAY = 86_400_000;

function seoulDay(ms: number): string {
  const v = new Date(ms + 9 * 3_600_000);
  return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
}

export function buildSyntheticCalendar(asOf: string): CalendarResult {
  const t = Date.parse(asOf);
  const iso = (days: number, hours = 0) => new Date(t + days * DAY + hours * 3_600_000).toISOString();
  const entry = (source: 'NOTICE' | 'OPPORTUNITY', refId: string, kind: 'STUDENT_DEADLINE' | 'APPLY_DEADLINE' | 'EVENT',
    importance: CalendarResult['entries'][number]['importance'], title: string, days: number, endDays?: number) => {
    const at = iso(days);
    return {
      id: `${source}:${refId}:${kind}:0`, source, refId, title, kind, importance, at,
      ...(endDays === undefined ? {} : {end: iso(endDays, 3)}),
      seoulDate: seoulDay(Date.parse(at)),
      overdue: kind !== 'EVENT' && Date.parse(at) <= t,
      evidenceRefs: [`EV-${refId}`],
    };
  };
  return CalendarResultSchema.parse({
    asOf,
    from: iso(-14),
    to: iso(45),
    entries: [
      entry('NOTICE', 'SYN-NOT-002', 'STUDENT_DEADLINE', 'REQUIRED', '가상 수강정정 신청', -2),
      entry('NOTICE', 'SYN-NOT-001', 'STUDENT_DEADLINE', 'CRITICAL', '가상 졸업인증 서류 제출', 4),
      entry('OPPORTUNITY', 'SYN-OPP-001', 'APPLY_DEADLINE', 'RECOMMENDED', '가상 데이터 체험', 6),
      entry('OPPORTUNITY', 'SYN-OPP-002', 'EVENT', 'SAVED', '가상 통상 활동 설명회', 9, 10),
      entry('NOTICE', 'SYN-NOT-003', 'EVENT', 'REQUIRED', '가상 졸업시험', 11),
      entry('OPPORTUNITY', 'SYN-OPP-003', 'APPLY_DEADLINE', 'PERSONAL', '가상 문화 지원', 30),
    ],
    undated: [{source: 'OPPORTUNITY', refId: 'SYN-OPP-009', title: '가상 상시 채용', reason: 'ROLLING', importance: 'RECOMMENDED'}],
    needsConfirmation: [{refId: 'SYN-NOT-005', title: '가상 캠퍼스별 장학 안내', unknownScope: ['campus']}],
    ambiguousNoticeIds: [],
  });
}
