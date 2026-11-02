// @vitest-environment jsdom
import {StrictMode} from 'react';
import {afterEach, describe, expect, it} from 'vitest';
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {DemoController} from '../../app/index.js';
import {SyntheticDemoClient} from '../../dev/syntheticDemoClient.js';
import {App, type AppServices} from '../../App.js';
import {appPages} from '../../pages/index.js';
import type {HistoryPort} from '../../shell/router.js';
import {compareFeeds} from './overlayCompare.js';

afterEach(cleanup);
const flush = () => act(async () => { for (let i = 0; i < 12; i++) await new Promise(r => setTimeout(r, 0)); });
const history = (start: string): HistoryPort => {
  const port = {location: {pathname: start}, history: {pushState: (_s: unknown, _t: string, u?: string | URL | null) => { port.location.pathname = String(u); }},
    addEventListener: () => {}, removeEventListener: () => {}};
  return port;
};
const pick = (i: number) => fireEvent.click(within(screen.getByRole('group', {name: /시연 대상 선택/})).getAllByRole('radio')[i]!);

async function open(strict = false) {
  const client = new SyntheticDemoClient({delayMs: 0});
  const controller = new DemoController(client, 'RUN');
  const services: AppServices = {overlay: {
    get: (c, s) => client.getDemoOverlay(c, s),
    set: (c, ch, s) => client.setDemoOverlay(c, ch, s),
    reset: (c, v, s) => client.resetDemoOverlay(c, v, s),
  }};
  const app = <App controller={controller} historyPort={history('/settings')} pages={appPages} services={services} />;
  render(strict ? <StrictMode>{app}</StrictMode> : app);
  await flush();
  pick(0);
  await flush();
  return {client, controller, ctxId: () => controller.getState().context!.contextId};
}
const interests = () => within(screen.getByRole('group', {name: /^관심 분야/})).getAllByRole('checkbox') as HTMLInputElement[];
const featured = (controller: DemoController) => controller.getState().snapshot!.feed.featured.map(c => c.opportunityId);
/** Choose interests far from S01's own (AI/SW) so the large cards change. */
function chooseTrade() {
  const box = (label: string) => within(screen.getByRole('group', {name: /^관심 분야/})).getByRole('checkbox', {name: label});
  fireEvent.click(box('무역·통상'));
}

describe('#85 compareFeeds', () => {
  it('compares only the same context, subject and asOf; identical feeds have no changes', async () => {
    const client = new SyntheticDemoClient({delayMs: 0});
    const ctx = await client.createContext('S01', 'RUN');
    const snap = await client.getSnapshot(ctx.contextId);
    const same = compareFeeds(snap, snap)!;
    expect([same.added.length, same.removed.length, same.kept.length]).toEqual([0, 0, snap.feed.featured.length]);
    expect(compareFeeds(snap, {...snap, asOf: '2026-12-01T00:00:00.000Z'})).toBeNull();
    expect(compareFeeds(snap, {...snap, contextId: 'SYN-OTHER'})).toBeNull();
  });
});

describe('#85 맞춤 설정 바꿔 보기 (BETA overlay, synthetic)', () => {
  it('apply shows a same-asOf before/after with overlay versions, and the feed itself changes', async () => {
    const {controller} = await open();
    expect(screen.getByRole('heading', {name: '맞춤 설정 바꿔 보기'})).toBeTruthy();
    expect(screen.getByText(/현재 설정 버전 0/)).toBeTruthy();
    const before = featured(controller);
    chooseTrade();
    fireEvent.click(screen.getByRole('button', {name: '바꿔서 비교하기'}));
    await flush();
    const compare = screen.getByRole('region', {name: '바꾸기 전과 후'});
    expect(compare.textContent).toContain('BETA_OVERLAY:0 → BETA_OVERLAY:1');
    expect(compare.textContent).toContain('같은 기준 시각');
    expect(compare.textContent).toContain('더 좋아졌다는 뜻이 아니라');
    expect(featured(controller)).not.toEqual(before);
    expect(within(compare).getByRole('heading', {name: /새로 큰 카드가 된 공고 \([1-9]/})).toBeTruthy();
  });

  it('되돌리기 is a new CAS write that restores the original feed', async () => {
    const {controller} = await open();
    const original = featured(controller);
    chooseTrade();
    fireEvent.click(screen.getByRole('button', {name: '바꿔서 비교하기'}));
    await flush();
    fireEvent.click(screen.getByRole('button', {name: '되돌리기'}));
    await flush();
    expect(featured(controller)).toEqual(original);
    expect(controller.getState().snapshot!.versions.overlay).toBe('BETA_OVERLAY:2');
    expect(screen.getByRole('region', {name: '바꾸기 전과 후'}).textContent).toContain('BETA_OVERLAY:1 → BETA_OVERLAY:2');
  });

  it('409 (changed in another tab): nothing old stays — no comparison, no form, the banner explains', async () => {
    const {client, controller, ctxId} = await open();
    client.touchOverlay(ctxId());
    chooseTrade();
    fireEvent.click(screen.getByRole('button', {name: '바꿔서 비교하기'}));
    await flush();
    expect(controller.getState().status).toBe('CONFLICT');
    expect(screen.queryByRole('region', {name: '바꾸기 전과 후'})).toBeNull();
    expect(screen.queryByRole('heading', {name: '맞춤 설정 바꿔 보기'})).toBeNull();
  });

  it('403 sharing revoked on write clears the student screen', async () => {
    const {client, controller, ctxId} = await open();
    client.failNextOverlay.set(ctxId(), 'SHARING_REVOKED');
    chooseTrade();
    fireEvent.click(screen.getByRole('button', {name: '바꿔서 비교하기'}));
    await flush();
    expect(controller.getState().status).toBe('REVOKED');
    expect(screen.queryByRole('group', {name: /^관심 분야/})).toBeNull();
  });

  it('unsaved picks and an old comparison never carry over to another student', async () => {
    await open();
    chooseTrade();
    fireEvent.click(screen.getByRole('button', {name: '바꿔서 비교하기'}));
    await flush();
    fireEvent.click(interests().find(b => !b.checked && !b.disabled)!);
    pick(1);
    await flush();
    expect(screen.queryByRole('region', {name: '바꾸기 전과 후'})).toBeNull();
    expect(interests().filter(b => b.checked)).toHaveLength(0);
    expect(screen.getByText(/현재 설정 버전 0/)).toBeTruthy();
  });

  it('loads under StrictMode (the cleaned-up first effect must not leave the form stuck loading)', async () => {
    await open(true);
    expect(screen.getByText(/현재 설정 버전 0/)).toBeTruthy();
  });
});
