import {describe, it, expect} from 'vitest';
import type {CalendarResult} from '@hufs-one/contracts';
import {buildCalendarView, MARKERS} from './calendarView.js';

// Synthetic only. asOf = Fri 2026-11-20 09:00 Seoul → grid Mon 11-16 … Sun 11-29.
const AS_OF = '2026-11-20T00:00:00.000Z';
const entry = (source: 'NOTICE' | 'OPPORTUNITY', refId: string, kind: 'STUDENT_DEADLINE' | 'APPLY_DEADLINE' | 'EVENT',
  importance: CalendarResult['entries'][number]['importance'], at: string, seoulDate: string, extra: {end?: string} = {}) => ({
  id: `${source}:${refId}:${kind}:0`, source, refId, title: `가상 ${refId}`, kind, importance, at, seoulDate,
  overdue: kind !== 'EVENT' && Date.parse(at) <= Date.parse(AS_OF), evidenceRefs: [`EV-${refId}`], ...extra,
});

const CAL = {
  asOf: AS_OF,
  from: '2026-11-01T00:00:00.000Z',
  to: '2026-12-31T00:00:00.000Z',
  entries: [
    entry('NOTICE', 'SYN-NOT-001', 'STUDENT_DEADLINE', 'CRITICAL', '2026-11-24T00:00:00.000Z', '2026-11-24'),
    entry('NOTICE', 'SYN-NOT-003', 'EVENT', 'REQUIRED', '2026-12-05T01:00:00.000Z', '2026-12-05', {end: '2026-12-05T04:00:00.000Z'}),
    // 15:30Z = 00:30 next day in Seoul
    entry('OPPORTUNITY', 'SYN-OPP-002', 'APPLY_DEADLINE', 'RECOMMENDED', '2026-11-20T15:30:00.000Z', '2026-11-21'),
    entry('NOTICE', 'SYN-NOT-007', 'STUDENT_DEADLINE', 'REQUIRED', '2026-11-18T00:00:00.000Z', '2026-11-18'),
    entry('NOTICE', 'SYN-NOT-009', 'STUDENT_DEADLINE', 'PERSONAL', '2026-11-05T00:00:00.000Z', '2026-11-05'),
    entry('OPPORTUNITY', 'SYN-OPP-004', 'EVENT', 'SAVED', '2026-11-25T01:00:00.000Z', '2026-11-25', {end: '2026-11-27T03:00:00.000Z'}),
  ],
  undated: [{source: 'OPPORTUNITY', refId: 'SYN-OPP-009', title: '가상 상시 채용', reason: 'ROLLING', importance: 'RECOMMENDED'}],
  needsConfirmation: [{refId: 'SYN-NOT-004', title: '가상 유학생 시험 안내', unknownScope: ['admissionType', 'unmapped-x', 'unmapped-y']}],
  ambiguousNoticeIds: ['SYN-NOT-099'],
};

function view() {
  const r = buildCalendarView(CAL, AS_OF);
  if (!r.ok) throw new Error('expected valid synthetic calendar');
  return r.view;
}
const day = (d: string) => view().days.find(x => x.seoulDate === d)!;

describe('#51 calendar grid', () => {
  it('builds a Monday-start two-week grid in Seoul time and marks the as-of day', () => {
    const v = view();
    expect(v.days).toHaveLength(14);
    expect(v.days[0]!.seoulDate).toBe('2026-11-16');
    expect(v.days[13]!.seoulDate).toBe('2026-11-29');
    expect(v.days.filter(d => d.isAsOfDay).map(d => d.seoulDate)).toEqual(['2026-11-20']);
    expect(day('2026-11-16').dayLabel).toBe('11월 16일 월요일');
    expect(v.asOfText).toBe('기준 시각 2026년 11월 20일 09:00');
  });

  it('places a late-night UTC deadline on the next Seoul day', () => {
    expect(day('2026-11-20').items).toHaveLength(0);
    expect(day('2026-11-21').items.map(i => i.link.refId)).toEqual(['SYN-OPP-002']);
    expect(day('2026-11-21').items[0]!.timeText).toBe('00:30');
  });

  it('labels events as 일정 and deadlines as 마감, with icon+text markers', () => {
    const exam = day('2026-11-25').items[0]!;
    expect(exam.kindText).toBe('일정');
    expect(exam.category).toBe('EVENT');
    expect(exam.endText).toBe('~ 11월 27일');
    const required = day('2026-11-24').items[0]!;
    expect(required.kindText).toBe('마감');
    expect(required.category).toBe('REQUIRED_DEADLINE');
    expect(day('2026-11-21').items[0]!.category).toBe('MY_DEADLINE');
    for (const m of Object.values(MARKERS)) {
      expect(m.text.length).toBeGreaterThan(0);
      expect(m.icon.length).toBeGreaterThan(0);
    }
    expect(new Set(Object.values(MARKERS).map(m => m.icon)).size).toBe(3);
  });

  it('gives each day a screen-reader summary that does not rely on colour', () => {
    expect(day('2026-11-25').ariaLabel).toBe('11월 25일 수요일, 일정 1건');
    expect(day('2026-11-20').ariaLabel).toBe('11월 20일 금요일 (기준일), 일정 없음');
    expect(day('2026-11-24').items[0]!.ariaLabel).toBe('필수 마감, 가상 SYN-NOT-001, 09:00');
    expect(day('2026-11-21').items[0]!.ariaLabel).toBe('관심 공고 마감, 추천, 가상 SYN-OPP-002, 00:30');
  });

  it('shows overdue calmly and keeps deadlines before the grid in an earlier list', () => {
    const overdue = day('2026-11-18').items[0]!;
    expect(overdue.overdueText).toBe('기한 경과 · 담당부서 확인');
    const v = view();
    expect(v.earlier.map(i => i.link.refId)).toEqual(['SYN-NOT-009']);
    expect(v.earlier[0]!.overdueText).toBe('기한 경과 · 담당부서 확인');
    expect(v.laterCount).toBe(1);
  });

  it('links each item to its notice or opportunity card', () => {
    expect(day('2026-11-24').items[0]!.link.path).toBe('/notices/SYN-NOT-001');
    expect(day('2026-11-21').items[0]!.link.path).toBe('/opportunities/SYN-OPP-002');
  });

  it('lists undated and needs-confirmation items outside the grid; never renders ambiguous ids', () => {
    const v = view();
    expect(v.undated).toEqual([{title: '가상 상시 채용', reasonText: '상시 모집', path: '/opportunities/SYN-OPP-009'}]);
    expect(v.needsConfirmation).toEqual([{title: '가상 유학생 시험 안내', text: '적용 여부 확인 필요: 입학 유형·적용 대상'}]);
    expect(v.days.flatMap(d => d.items).some(i => i.link.refId === 'SYN-NOT-004')).toBe(false);
    expect(JSON.stringify(v)).not.toContain('SYN-NOT-099');
  });
});

describe('#51 calendar wire rejection (render error state, never guessed dates)', () => {
  it('rejects an asOf different from the authorized projection', () => {
    expect(buildCalendarView(CAL, '2026-11-21T00:00:00.000Z').ok).toBe(false);
  });
  it('rejects a client-visible overdue flag that disagrees with asOf', () => {
    const bad = {...CAL, entries: CAL.entries.map(e => e.refId === 'SYN-NOT-001' ? {...e, overdue: true} : e)};
    expect(buildCalendarView(bad, AS_OF).ok).toBe(false);
  });
  it('rejects an ambiguous notice smuggled in as an entry', () => {
    const bad = {...CAL, ambiguousNoticeIds: ['SYN-NOT-001']};
    expect(buildCalendarView(bad, AS_OF).ok).toBe(false);
  });
  it('rejects malformed payloads', () => {
    expect(buildCalendarView(null, AS_OF).ok).toBe(false);
    expect(buildCalendarView({...CAL, entries: [{...CAL.entries[0], seoulDate: '2026-11-25'}]}, AS_OF).ok).toBe(false);
  });
  it('does not mutate the input and is deterministic', () => {
    const before = JSON.stringify(CAL);
    const a = JSON.stringify(view());
    expect(JSON.stringify(view())).toBe(a);
    expect(JSON.stringify(CAL)).toBe(before);
  });
});
