import {describe, expect, it} from 'vitest';
import {FeedCardSchema, FeedResultSchema, NoticeResultSchema, type DemoSnapshot} from '@hufs-one/contracts';
import {ddayBasisText, ddayOf} from './dday.js';
import {deadlineBasisText} from '../../pages/homeParts.js';
import {buildNoticeList} from '../notices/noticeView.js';
import {buildCalendarView} from '../today/calendarView.js';
import {buildSyntheticCalendar} from '../../dev/syntheticCalendar.js';
import {buildDemoScreenView} from './sectionView.js';
import {SyntheticDemoClient} from '../../dev/syntheticDemoClient.js';

// Fri 2026-11-20 09:00 Seoul (synthetic demo time).
const AS_OF = '2026-11-20T00:00:00.000Z';

describe('#79 ddayOf: Seoul calendar days from the server asOf', () => {
  it('counts Seoul dates, not 24h blocks', () => {
    expect(ddayOf('2026-11-24T00:00:00.000Z', AS_OF)).toEqual({text: 'D-4', spoken: '4일 남음', days: 4});
    // 11-20 23:59 Seoul is still today; 11-21 00:00 Seoul is tomorrow even though only 15h later.
    expect(ddayOf('2026-11-20T14:59:00.000Z', AS_OF)).toEqual({text: '오늘 마감', spoken: '오늘 마감', days: 0});
    expect(ddayOf('2026-11-20T15:00:00.000Z', AS_OF)).toEqual({text: 'D-1', spoken: '1일 남음', days: 1});
  });
  it('asOf late in the Seoul day: a deadline early next morning is D-1', () => {
    expect(ddayOf('2026-11-21T00:30:00+09:00', '2026-11-20T23:30:00+09:00')).toEqual({text: 'D-1', spoken: '1일 남음', days: 1});
  });
  it('past or exactly-at-asOf deadlines and invalid input give no D-day (no D+N)', () => {
    expect(ddayOf('2026-11-18T00:00:00.000Z', AS_OF)).toBeNull();
    expect(ddayOf(AS_OF, AS_OF)).toBeNull();
    expect(ddayOf('2026-11-19T23:00:00.000Z', AS_OF)).toBeNull(); // earlier the same Seoul day
    expect(ddayOf('not-a-date', AS_OF)).toBeNull();
  });
  it('does not use the browser clock', () => {
    // A far-past asOf still gives a count relative to that asOf, whatever today is.
    expect(ddayOf('2020-01-03T00:00:00.000Z', '2020-01-01T00:00:00.000Z')?.text).toBe('D-2');
  });
});

describe('#79 where D-day appears', () => {
  it('calendar: deadlines get D-day, EVENT and overdue never do; spoken form is in the aria label', () => {
    const r = buildCalendarView(buildSyntheticCalendar(AS_OF), AS_OF);
    if (!r.ok) throw new Error('calendar invalid');
    const all = [...r.view.days.flatMap(d => d.items), ...r.view.earlier];
    const deadline = all.find(i => i.title.includes('가상 졸업인증 서류 제출'))!;
    expect(deadline.dday?.text).toBe('D-4');
    expect(deadline.ariaLabel).toContain('4일 남음');
    expect(all.filter(i => i.kindText === '일정').every(i => i.dday === null)).toBe(true);
    expect(all.filter(i => i.overdueText !== null).every(i => i.dday === null)).toBe(true);
    expect(all.some(i => i.kindText === '일정')).toBe(true);
    expect(all.some(i => i.overdueText !== null)).toBe(true);
  });

  it('notices: only an upcoming student deadline that may apply to me', () => {
    const list = buildNoticeList(NoticeResultSchema.parse({
      asOf: AS_OF, pinnedIds: [],
      items: [
        {noticeId: 'SYN-N-A', title: 'a', priority: 'CRITICAL_DUE', appliesTo: 'YES', studentDeadline: '2026-11-24T00:00:00.000Z',
          overdue: false, evidenceRefs: [], verificationState: 'VERIFIED'},
        {noticeId: 'SYN-N-B', title: 'b', priority: 'GENERAL', appliesTo: 'YES', studentDeadline: '2026-11-18T00:00:00.000Z',
          overdue: true, evidenceRefs: [], verificationState: 'VERIFIED'},
        {noticeId: 'SYN-N-C', title: 'c', priority: 'GENERAL', appliesTo: 'NO', studentDeadline: '2026-11-24T00:00:00.000Z',
          overdue: false, evidenceRefs: [], verificationState: 'VERIFIED'},
        {noticeId: 'SYN-N-D', title: 'd', priority: 'GENERAL', appliesTo: 'UNKNOWN', evidenceRefs: [], verificationState: 'VERIFIED'},
      ],
    }));
    expect(list.map(n => [n.noticeId, n.dday?.text ?? null])).toEqual([
      ['SYN-N-A', 'D-4'], ['SYN-N-B', null], ['SYN-N-C', null], ['SYN-N-D', null],
    ]);
  });

  it('opportunity cards: only a CONFIRMED deadline of a card that is not CLOSED', async () => {
    const client = new SyntheticDemoClient({delayMs: 0});
    const ctx = await client.createContext('S01', 'RUN');
    const snapshot = await client.getSnapshot(ctx.contextId) as DemoSnapshot;
    const base = snapshot.feed.featured[0]!;
    if (!base.explanation) throw new Error('synthetic card has no explanation');
    const ex = base.explanation;
    const card = (id: string, deadline: typeof ex.deadline, lifecycle = base.lifecycle) =>
      FeedCardSchema.parse({...base, opportunityId: id, lifecycle, explanation: {...ex, opportunityId: id, deadline}});
    const feed = FeedResultSchema.parse({...snapshot.feed, featured: [
      card('SYN-C-OPEN', {kind: 'CONFIRMED', iso: '2026-11-26T14:59:00.000Z', text: '11월 26일 23:59'}, 'OPEN'),
      card('SYN-C-ROLL', {kind: 'ROLLING', text: '상시 모집'}, 'OPEN'),
      card('SYN-C-CLOSED', {kind: 'CONFIRMED', iso: '2026-11-26T14:59:00.000Z', text: '11월 26일 23:59'}, 'CLOSED'),
    ], compact: []});
    const view = buildDemoScreenView({...snapshot, feed}, ['FEED']);
    if (view.feed.kind !== 'SHOW') throw new Error('feed hidden');
    expect(view.feed.data.featured.map(c => [c.opportunityId, c.dday?.text ?? null])).toEqual([
      ['SYN-C-OPEN', 'D-6'], ['SYN-C-ROLL', null], ['SYN-C-CLOSED', null],
    ]);
  });
});

describe('#318 D-day basis date: names where D-day is computed from, never claims it is today', () => {
  it('names the Seoul date of asOf as the source, by dataset mode', () => {
    expect(ddayBasisText(AS_OF, 'SYNTHETIC')).toBe('D-day는 브라우저의 오늘이 아니라 시연 자료의 기준일 2026년 11월 20일로 계산했어요.');
    expect(ddayBasisText(AS_OF, 'MIXED')).toBe('D-day는 브라우저의 오늘이 아니라 자료의 기준일 2026년 11월 20일로 계산했어요.');
    expect(ddayBasisText(AS_OF, 'REAL_CONSENTED')).toBe('D-day는 브라우저의 오늘이 아니라 자료의 기준일 2026년 11월 20일로 계산했어요.');
    // 15:30 UTC is already 00:30 the next day in Seoul; 14:59 UTC is still the same day.
    expect(ddayBasisText('2026-11-20T15:30:00.000Z', 'SYNTHETIC')).toContain('2026년 11월 21일');
    expect(ddayBasisText('2026-11-20T14:59:59.999Z', 'SYNTHETIC')).toContain('2026년 11월 20일');
    expect(ddayBasisText('not-a-date', 'SYNTHETIC')).toBeNull();
  });

  it('never asserts the basis is or is not today, so an asOf that equals the real date stays true', () => {
    for (const mode of ['SYNTHETIC', 'MIXED', 'REAL_CONSENTED'] as const) {
      const text = ddayBasisText(new Date().toISOString(), mode) ?? '';
      expect(text).not.toMatch(/아니에요|오늘 날짜(가|와)|오늘입니다/);
      expect(text).toContain('브라우저의 오늘이 아니라');
    }
  });

  it('screen view: per-source basis by snapshot mode, null for a section the profile does not share', async () => {
    const client = new SyntheticDemoClient({delayMs: 0});
    const ctx = await client.createContext('S01', 'RUN');
    const snapshot = await client.getSnapshot(ctx.contextId) as DemoSnapshot;
    const both = buildDemoScreenView(snapshot, ['FEED', 'NOTICES']);
    expect(both.ddayBasis.feed).toContain('시연 자료의 기준일');
    expect(both.ddayBasis.notices).toContain('시연 자료의 기준일');
    const mixed = buildDemoScreenView({...snapshot, datasetMode: 'MIXED'}, ['FEED', 'NOTICES']);
    expect(mixed.ddayBasis.feed).toMatch(/^D-day는 브라우저의 오늘이 아니라 자료의 기준일 /);
    expect(buildDemoScreenView(snapshot, ['NOTICES']).ddayBasis.feed).toBeNull();
    expect(buildDemoScreenView(snapshot, ['FEED']).ddayBasis.notices).toBeNull();
  });

  it('home deadlines: one line for one date; a labelled line per kind when 공고 and 공지 differ', () => {
    const d = {text: 'D-4', spoken: '4일 남음', days: 4};
    const opp = {key: 'o1', kind: '공고', title: 't', path: '/opportunities/x', dday: d};
    const notice = {key: 'n1', kind: '공지', title: 't', path: '/notices/x', dday: d};
    const a = ddayBasisText(AS_OF, 'SYNTHETIC');
    const b = ddayBasisText('2026-11-22T00:00:00.000Z', 'SYNTHETIC');
    expect(deadlineBasisText([opp, notice], {feed: a, notices: a})).toEqual([a]);
    expect(deadlineBasisText([notice, opp], {feed: a, notices: b})).toEqual([`공지 ${b}`, `공고 ${a}`]);
    // Different instants on the same Seoul date read as one line.
    expect(deadlineBasisText([opp, notice], {feed: a, notices: ddayBasisText('2026-11-20T14:00:00.000Z', 'SYNTHETIC')})).toEqual([a]);
    // Only listed kinds are named: an unlisted (or unshared) section's date never appears.
    expect(deadlineBasisText([notice], {feed: a, notices: b})).toEqual([b]);
    expect(deadlineBasisText([opp], {feed: null, notices: a})).toEqual([]);
    expect(deadlineBasisText([], {feed: a, notices: a})).toEqual([]);
  });
});
