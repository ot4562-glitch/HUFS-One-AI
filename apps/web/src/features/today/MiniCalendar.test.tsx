// @vitest-environment jsdom
import {afterEach, describe, expect, it} from 'vitest';
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import type {DemoContext} from '@hufs-one/contracts';
import {DemoController} from '../../app/index.js';
import {SyntheticDemoClient} from '../../dev/syntheticDemoClient.js';
import {buildSyntheticCalendar} from '../../dev/syntheticCalendar.js';
import {App, type AppServices} from '../../App.js';
import {appPages} from '../../pages/index.js';
import type {HistoryPort} from '../../shell/router.js';

afterEach(cleanup);

const history = (): HistoryPort => {
  const port = {location: {pathname: '/'}, history: {pushState: (_s: unknown, _t: string, u?: string | URL | null) => { port.location.pathname = String(u); }},
    addEventListener: () => {}, removeEventListener: () => {}};
  return port;
};
const flush = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise(r => setTimeout(r, 0)); });
// Must equal the snapshot asOf (DEMO_AS_OF): Fri 2026-11-20 09:00 Seoul → grid Mon 11-16 … Sun 11-29.
const SNAPSHOT_AS_OF = '2026-11-20T00:00:00.000Z';

async function open(services: AppServices, subjectIndex = 0) {
  const client = new SyntheticDemoClient({delayMs: 0});
  render(<App controller={new DemoController(client, 'TEST-RUN')} historyPort={history()} pages={appPages} services={services} />);
  await flush();
  pick(subjectIndex);
  await flush();
  return client;
}
function pick(i: number) {
  fireEvent.click(within(screen.getByRole('group', {name: /시연 대상 선택/})).getAllByRole('radio')[i]!);
}
const calendar = () => screen.getByRole('region', {name: '내 주요 일정'});

describe('#51 MiniCalendar on 오늘', () => {
  it('says "not connected" when no calendar port exists (real API before #71)', async () => {
    await open({});
    expect(within(calendar()).getByText('일정 정보 연결을 준비하고 있습니다.')).toBeTruthy();
  });

  it('renders a 14-day Seoul grid with the as-of day selected and its legend in text', async () => {
    await open({loadCalendar: async () => buildSyntheticCalendar(SNAPSHOT_AS_OF)});
    const days = within(calendar()).getAllByRole('button');
    expect(days).toHaveLength(14);
    const pressed = days.filter(d => d.getAttribute('aria-pressed') === 'true');
    expect(pressed.map(d => d.getAttribute('aria-label'))).toEqual(['11월 20일 금요일 (기준일), 일정 없음']);
    expect(within(screen.getByRole('list', {name: '표시 기호'})).getAllByRole('listitem').map(li => li.textContent?.trim()))
      .toEqual(['필수 마감', '시험·행사', '관심 공고 마감']);
    expect(within(calendar()).getByText(/기준 시각 2026년 11월 20일 09:00/)).toBeTruthy();
  });

  it('tapping a day lists its items as 마감/일정 with links to the card', async () => {
    await open({loadCalendar: async () => buildSyntheticCalendar(SNAPSHOT_AS_OF)});
    fireEvent.click(within(calendar()).getByRole('button', {name: '11월 24일 화요일, 마감 1건'}));
    const link = within(calendar()).getByRole('link', {name: /가상 졸업인증 서류 제출/});
    expect(link.getAttribute('href')).toBe('/notices/SYN-NOT-001');
    expect(link.textContent).toContain('마감 09:00');
    fireEvent.click(within(calendar()).getByRole('button', {name: '11월 29일 일요일, 일정 1건'}));
    expect(within(calendar()).getByRole('link', {name: /가상 통상 활동 설명회/}).textContent).toContain('일정 09:00 ~ 11월 30일');
  });

  it('keeps overdue, later, undated and needs-confirmation outside the grid', async () => {
    await open({loadCalendar: async () => buildSyntheticCalendar(SNAPSHOT_AS_OF)});
    const c = calendar();
    expect(within(c).getByRole('button', {name: '11월 18일 수요일, 마감 1건'})).toBeTruthy();
    fireEvent.click(within(c).getByRole('button', {name: '11월 18일 수요일, 마감 1건'}));
    expect(within(c).getByRole('link', {name: /가상 수강정정 신청/}).textContent).toContain('기한 경과 · 담당부서 확인');
    expect(within(c).getByText('2주 뒤에도 일정 2건이 더 있어요.')).toBeTruthy();
    expect(within(c).getByRole('link', {name: /가상 상시 채용/}).textContent).toContain('상시 모집');
    expect(within(c).getByText('적용 여부 확인 필요: 캠퍼스')).toBeTruthy();
  });

  it('shows an error, not guessed dates, when the wire asOf differs from the snapshot', async () => {
    await open({loadCalendar: async () => buildSyntheticCalendar('2026-11-21T00:00:00.000Z')});
    expect(within(calendar()).getByRole('alert').textContent).toBe('일정 자료를 확인할 수 없어 표시하지 않았습니다.');
    expect(within(calendar()).queryAllByRole('button')).toHaveLength(0);
  });

  it('never shows the previous subject calendar after switching, even if it resolves late', async () => {
    const resolvers: {ctx: DemoContext; resolve: (v: unknown) => void}[] = [];
    await open({loadCalendar: ctx => new Promise(resolve => resolvers.push({ctx, resolve}))});
    expect(within(calendar()).getByText('일정을 불러오는 중')).toBeTruthy();
    pick(1); // S02
    await flush();
    resolvers.find(r => r.ctx.demoSubjectId === 'S01')!.resolve(buildSyntheticCalendar(SNAPSHOT_AS_OF));
    await flush();
    expect(within(calendar()).getByText('일정을 불러오는 중')).toBeTruthy();
    expect(within(calendar()).queryAllByRole('button')).toHaveLength(0);
    resolvers.find(r => r.ctx.demoSubjectId === 'S02')!.resolve(buildSyntheticCalendar(SNAPSHOT_AS_OF));
    await flush();
    expect(within(calendar()).getAllByRole('button')).toHaveLength(14);
  });
});
