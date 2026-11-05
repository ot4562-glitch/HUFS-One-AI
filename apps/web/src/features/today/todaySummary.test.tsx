// @vitest-environment jsdom
import {afterEach, describe, expect, it} from 'vitest';
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {DemoController} from '../../app/index.js';
import {SyntheticDemoClient} from '../../dev/syntheticDemoClient.js';
import {App} from '../../App.js';
import {appPages} from '../../pages/index.js';
import type {HistoryPort} from '../../shell/router.js';

afterEach(cleanup);
const flush = () => act(async () => { for (let i = 0; i < 8; i++) await new Promise(r => setTimeout(r, 0)); });
function history(start: string): HistoryPort {
  const port = {location: {pathname: start}, history: {pushState: (_s: unknown, _t: string, u?: string | URL | null) => { port.location.pathname = String(u); }},
    addEventListener: () => {}, removeEventListener: () => {}};
  return port;
}
async function open(path: string, i: number) {
  render(<App controller={new DemoController(new SyntheticDemoClient({delayMs: 0}), 'RUN')} historyPort={history(path)} pages={appPages} />);
  await flush();
  fireEvent.click(within(screen.getByRole('group', {name: /시연 대상 선택/})).getAllByRole('radio')[i]!);
  await flush();
}
const cards = () => within(screen.getByRole('region', {name: '오늘의 요약'})).getAllByRole('heading', {level: 2}).map(h => h.closest('.summary__card')!.textContent);

describe('#9 v5 home', () => {
  it('S01: three summary cards counted from the screen itself; matched = the cards listed below', async () => {
    await open('/', 0);
    expect(screen.getByRole('heading', {level: 1}).textContent).toBe('오늘');
    const [matched, due, credits] = cards();
    const listed = within(screen.getByRole('region', {name: '나에게 맞춘 공고'})).getAllByRole('article').length;
    expect(matched).toContain(`${listed}건`);
    expect(due).toMatch(/\d+건7일 안에 확정 마감/);
    expect(credits).toContain('95학점');
    expect(credits).toContain('공식 판정 아님');
  });

  it('a student whose academics are not shared sees words, never 0, on that card', async () => {
    await open('/', 2);
    const credits = cards()[2]!;
    expect(credits).toContain('시연 공유 범위 밖');
    expect(credits).not.toMatch(/\d+학점/);
  });

  it('other pages: category block + breadcrumb above the h1', async () => {
    await open('/graduation/what-if', 0);
    const crumb = screen.getByRole('navigation', {name: '현재 위치'});
    expect(crumb.textContent?.replace(/\s+/g, ' ').trim()).toBe('홈 › 졸업지원 › 전공 가정 분석');
    expect(within(crumb).getByRole('link', {name: '졸업지원'}).getAttribute('href')).toBe('/graduation');
    expect(crumb.compareDocumentPosition(screen.getByRole('heading', {level: 1})) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
