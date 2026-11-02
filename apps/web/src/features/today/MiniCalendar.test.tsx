// @vitest-environment jsdom
import {afterEach, describe, expect, it} from 'vitest';
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {DemoOverlayResultSchema, DemoSnapshotSchema, makeApiError, type DemoContext} from '@hufs-one/contracts';
import {DemoController} from '../../app/index.js';
import {HufsApiClient, type ApiFetch} from '../../integrations/index.js';
import {liveServices} from '../../liveServices.js';
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
  const controller = new DemoController(client, 'TEST-RUN');
  render(<App controller={controller} historyPort={history()} pages={appPages} services={services} />);
  await flush();
  pick(subjectIndex);
  await flush();
  return {client, controller};
}
const respond = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {status, headers: {'content-type': 'application/json'}});
/** Real HufsApiClient over a fake transport, wired exactly as main.tsx does (liveServices). */
function liveApi(reply: (url: string, n: number) => Response | Promise<Response>) {
  const calls: string[] = [];
  const transport: ApiFetch = async url => { calls.push(url); return reply(url, calls.length); };
  return {calls, services: liveServices(new HufsApiClient(transport))};
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

  it('hides the shown calendar in the same render when an overlay commit replaces the snapshot (same epoch+context)', async () => {
    // Grid size in the DOM at the moment each load starts (effects run after commit).
    const domAtLoad: number[] = [];
    const {controller} = await open({loadCalendar: () => {
      domAtLoad.push(document.querySelectorAll('.cal__day').length);
      return domAtLoad.length === 1 ? Promise.resolve(buildSyntheticCalendar(SNAPSHOT_AS_OF)) : new Promise(() => {});
    }});
    await flush();
    expect(within(calendar()).getAllByRole('button')).toHaveLength(14);
    const before = controller.getState();
    const s = before.snapshot!;
    const receipt = DemoOverlayResultSchema.parse({
      overlay: {version: 1, value: {interestTopics: ['AI_ML']}, updatedAt: s.asOf},
      snapshot: DemoSnapshotSchema.parse({...s, versions: {...s.versions, overlay: 'BETA_OVERLAY:1'}}),
      calendar: buildSyntheticCalendar(s.asOf),
    });
    await act(async () => { expect(await controller.runOverlayOperation(async () => receipt)).not.toBeNull(); });
    await flush();
    const after = controller.getState();
    expect([after.epoch, after.context?.contextId, after.snapshot === s]).toEqual([before.epoch, before.context?.contextId, false]);
    expect(domAtLoad).toEqual([0, 0]); // the old 14-day grid was never committed under the new snapshot
    expect(within(calendar()).getByText('일정을 불러오는 중')).toBeTruthy();
  });

  describe('real API port (liveServices → HufsApiClient.getCalendar)', () => {
    it('loads the current context calendar over the authorized GET and renders it', async () => {
      const api = liveApi(() => respond(buildSyntheticCalendar(SNAPSHOT_AS_OF)));
      await open(api.services);
      await flush();
      expect(api.calls.length).toBeGreaterThan(0);
      expect(api.calls.every(u => u.startsWith('/api/demo/contexts/') && u.endsWith('/calendar'))).toBe(true);
      expect(within(calendar()).getAllByRole('button')).toHaveLength(14);
    });

    it.each([
      ['SHARING_REVOKED', 403],
      ['UNAUTHENTICATED', 401],
      ['VERSION_CONFLICT', 409],
    ] as const)('%s/%i on reload clears the shown calendar instead of keeping the old one', async (code, status) => {
      const api = liveApi((_u, n) => n === 1 ? respond(buildSyntheticCalendar(SNAPSHOT_AS_OF)) : respond(makeApiError(code, 'SYN-REQ-01'), status));
      const {controller} = await open(api.services);
      await flush();
      expect(within(calendar()).getAllByRole('button')).toHaveLength(14);
      await act(async () => { await controller.revalidate(); });
      await flush();
      expect(controller.getState().status).not.toBe('READY');
      expect(screen.queryByRole('region', {name: '내 주요 일정'})).toBeNull();
      expect(screen.queryByText(/가상 졸업인증 서류 제출/)).toBeNull();
    });

    it('a 200 that arrives after the same context got a new snapshot is never shown', async () => {
      const pending: ((r: Response) => void)[] = [];
      const api = liveApi(() => new Promise<Response>(resolve => pending.push(resolve)));
      const {controller} = await open(api.services);
      const first = pending.length;
      expect(first).toBeGreaterThan(0);
      await act(async () => { await controller.revalidate(); }); // same epoch + context, new snapshot object
      await flush();
      expect(controller.getState().status).toBe('READY');
      // Old request (wrong asOf on purpose) resolves late: dropped, still loading for the new snapshot.
      for (const r of pending.slice(0, first)) r(respond(buildSyntheticCalendar('2026-11-21T00:00:00.000Z')));
      await flush();
      expect(within(calendar()).getByText('일정을 불러오는 중')).toBeTruthy();
      expect(within(calendar()).queryByRole('alert')).toBeNull();
      for (const r of pending.slice(first)) r(respond(buildSyntheticCalendar(SNAPSHOT_AS_OF)));
      await flush();
      expect(within(calendar()).getAllByRole('button')).toHaveLength(14);
    });
  });
});
