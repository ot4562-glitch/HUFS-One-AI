// @vitest-environment jsdom
import {afterEach, describe, expect, it} from 'vitest';
import {useLayoutEffect} from 'react';
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {DemoController} from '../../app/index.js';
import {HufsApiError} from '../../integrations/api-client.js';
import {SyntheticDemoClient} from '../../dev/syntheticDemoClient.js';
import {syntheticRevisionPort} from '../../dev/syntheticRevisions.js';
import {App} from '../../App.js';
import {appPages} from '../../pages/index.js';
import type {HistoryPort} from '../../shell/router.js';
import {buildRevisionView} from './revisionView.js';
import {RevisionComparison, type RevisionPort} from './RevisionComparison.js';
import type {DemoViewState} from '../../app/index.js';

afterEach(cleanup);
const AS_OF = '2026-11-20T00:00:00.000Z';
const flush = () => act(async () => { for (let i = 0; i < 8; i++) await new Promise(r => setTimeout(r, 0)); });
const signal = () => new AbortController().signal;
const port0 = syntheticRevisionPort({delayMs: 0});

describe('#119 revision view model', () => {
  it('deadline extension: labelled 연장, both revisions shown with capture/check/verify kept apart', async () => {
    const r = buildRevisionView(await port0.forOpportunity('SYN-OPP-002', AS_OF, signal()), {opportunityId: 'SYN-OPP-002', asOf: AS_OF});
    if (!r.ok || r.view.kind !== 'READY') throw new Error('expected READY');
    expect(r.view.summary).toBe('정정된 항목 1개: 모집 마감 연장');
    expect(r.view.rows.map(x => [x.field, x.state, x.badge.text])).toEqual([
      ['DEADLINE', 'CHANGED', '연장'], ['ELIGIBILITY', 'UNKNOWN', '확인 필요'], ['STATUS', 'UNCHANGED', '그대로'],
    ]);
    expect(r.view.rows[0]!.before).toBe('2026년 11월 27일 09:00');
    expect(r.view.rows[0]!.after).toBe('2026년 12월 2일 09:00');
    expect(r.view.rows[0]!.ariaLabel).toContain('모집 마감: 연장. 정정 전 2026년 11월 27일 09:00, 정정 후 2026년 12월 2일 09:00');
    expect(r.view.after).toMatchObject({delivery: '검증된 캐시', evidenceCount: 2});
    expect(r.view.synthetic).toBe(true);
  });

  it('cancellation and eligibility change are named; missing claims stay "확인 필요", never "없음"', async () => {
    const c = buildRevisionView(await port0.forOpportunity('SYN-OPP-008', AS_OF, signal()), {opportunityId: 'SYN-OPP-008', asOf: AS_OF});
    if (!c.ok || c.view.kind !== 'READY') throw new Error();
    expect(c.view.rows[0]).toMatchObject({field: 'STATUS', after: '모집 취소', badge: {text: '취소'}});
    expect(c.view.rows.find(x => x.field === 'DEADLINE')).toMatchObject({state: 'UNKNOWN', before: '확인 필요', after: '확인 필요'});
    const e = buildRevisionView(await port0.forOpportunity('SYN-OPP-021', AS_OF, signal()), {opportunityId: 'SYN-OPP-021', asOf: AS_OF});
    if (!e.ok || e.view.kind !== 'READY') throw new Error();
    expect(e.view.rows[0]).toMatchObject({field: 'ELIGIBILITY', before: '학적 = 재학', after: '학적 중 하나: 재학, 졸업', badge: {text: '변경'}});
  });

  it('NEEDS_REVIEW never states the change and says the old revision is not restored', async () => {
    const r = buildRevisionView(await port0.forOpportunity('SYN-OPP-029', AS_OF, signal()), {opportunityId: 'SYN-OPP-029', asOf: AS_OF});
    expect(r).toMatchObject({ok: true, view: {kind: 'NEEDS_REVIEW'}});
    if (r.ok && r.view.kind === 'NEEDS_REVIEW') expect(r.view.text).toMatch(/검토 중.*확정하지 않았고.*되돌리지도 않았습니다/);
  });

  it('rejects a response bound to another opportunity or asOf, and malformed wires', async () => {
    const raw = await port0.forOpportunity('SYN-OPP-002', AS_OF, signal());
    expect(buildRevisionView(raw, {opportunityId: 'SYN-OPP-008', asOf: AS_OF}).ok).toBe(false);
    expect(buildRevisionView(raw, {opportunityId: 'SYN-OPP-002', asOf: '2026-11-21T00:00:00.000Z'}).ok).toBe(false);
    expect(buildRevisionView({state: 'READY'}, {opportunityId: 'SYN-OPP-002', asOf: AS_OF}).ok).toBe(false);
  });
});

function history(start: string): HistoryPort {
  const port = {location: {pathname: start}, history: {pushState: (_s: unknown, _t: string, u?: string | URL | null) => { port.location.pathname = String(u); }},
    addEventListener: () => {}, removeEventListener: () => {}};
  return port;
}
async function open(path: string, revisions: RevisionPort) {
  render(<App controller={new DemoController(new SyntheticDemoClient({delayMs: 0}), 'RUN')} historyPort={history(path)}
    pages={appPages} services={{revisions}} />);
  await flush();
  fireEvent.click(within(screen.getByRole('group', {name: /시연 대상 선택/})).getAllByRole('radio')[0]!);
  await flush();
}
const region = () => screen.queryByRole('region', {name: '정정 내역'});

describe('#119 정정 내역 on the opportunity detail', () => {
  it('hides an old comparison before effects when the same context gets a replacement snapshot', async () => {
    const controller = new DemoController(new SyntheticDemoClient({delayMs: 0}), 'RUN');
    await controller.select('S01');
    const before = controller.getState();
    let calls = 0;
    const port: RevisionPort = {forOpportunity: (id, asOf, signal) => ++calls === 1
      ? port0.forOpportunity(id, asOf, signal) : new Promise(() => {})};
    const observed: boolean[] = [];
    function View({state}: {state: DemoViewState}) {
      useLayoutEffect(() => { observed.push(Boolean(document.querySelector('.rev__table'))); }, [state]);
      return <RevisionComparison opportunityId="SYN-OPP-002" state={state} controller={controller} port={port} />;
    }
    const view = render(<View state={before} />);
    await flush();
    expect(screen.getByRole('table')).toBeTruthy();
    const after = {...before, snapshot: {...before.snapshot!, versions: {...before.snapshot!.versions, overlay: 'NEXT-OVERLAY'}}};
    view.rerender(<View state={after} />);
    expect(observed.at(-1)).toBe(false);
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows a before/after table, changed row first, with text badges and the capture≠verification note', async () => {
    await open('/opportunities/SYN-OPP-002', port0);
    const r = region()!;
    expect(within(r).getByRole('status').textContent).toContain('정정된 항목 1개: 모집 마감 연장');
    const rows = within(r).getAllByRole('row').slice(1);
    expect(rows[0]!.getAttribute('aria-label')).toContain('모집 마감: 연장');
    expect(within(rows[0]!).getByText('2026년 12월 2일 09:00')).toBeTruthy();
    expect(within(r).getByText(/수집 시각은 사실을 검증한 시각이 아닙니다/)).toBeTruthy();
    expect(within(r).getByText('합성 정정 예시')).toBeTruthy();
  });

  it('a posting with no reviewed correction shows no section at all', async () => {
    await open('/opportunities/SYN-OPP-019', port0);
    expect(screen.getByRole('heading', {level: 1}).textContent).not.toBe('공고를 찾을 수 없습니다');
    await flush();
    expect(region()).toBeNull();
  });

  it('a late comparison for the previous student never appears after switching', async () => {
    const pending: {id: string; resolve: (v: unknown) => void}[] = [];
    const slow: RevisionPort = {forOpportunity: id => new Promise(resolve => pending.push({id, resolve}))};
    await open('/opportunities/SYN-OPP-002', slow);
    expect(within(region()!).getByText('정정 내역을 확인하는 중')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('group', {name: /시연 대상 선택/})).getAllByRole('radio')[1]!);
    await flush();
    pending[0]!.resolve(await port0.forOpportunity('SYN-OPP-002', AS_OF, signal()));
    await flush();
    expect(screen.queryByText(/정정된 항목/)).toBeNull();
  });

  it('a 403 from the comparison clears the screen like any context error', async () => {
    await open('/opportunities/SYN-OPP-002', {forOpportunity: async () => { throw new HufsApiError('SHARING_REVOKED', 403); }});
    expect(screen.getByRole('alert').textContent).toContain('공유 허용이 변경되었습니다.');
    expect(region()).toBeNull();
  });
});
