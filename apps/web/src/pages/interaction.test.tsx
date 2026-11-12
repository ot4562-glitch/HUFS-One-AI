// @vitest-environment jsdom
import {afterEach, describe, expect, it} from 'vitest';
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {DemoController} from '../app/index.js';
import {SyntheticDemoClient} from '../dev/syntheticDemoClient.js';
import {App} from '../App.js';
import {appPages} from './index.js';
import type {HistoryPort} from '../shell/router.js';

afterEach(cleanup);

function memoryHistory(start: string): HistoryPort {
  const port = {
    location: {pathname: start},
    history: {pushState: (_s: unknown, _t: string, url?: string | URL | null) => {port.location.pathname = String(url);}},
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  return port;
}

const flush = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setTimeout(resolve, 0)); });

async function open(path: string) {
  render(<App controller={new DemoController(new SyntheticDemoClient({delayMs: 0}), 'INTERACTIVE-TEST')}
    historyPort={memoryHistory(path)} pages={appPages} />);
  await flush();
  fireEvent.click(within(screen.getByRole('group', {name: /시연 대상 선택/})).getAllByRole('radio')[0]!);
  await flush();
}

describe('interactive discovery', () => {
  it('shows data destinations directly without duplicate action selectors or marketing copy', async () => {
    await open('/');
    expect(screen.getByRole('heading', {level: 1}).textContent).toBe('오늘');
    expect(screen.queryByText('오늘도 가능성을 넓혀보세요')).toBeNull();
    expect(screen.queryByRole('group', {name: '오늘의 활동 선택'})).toBeNull();
    const links = within(screen.getByRole('region', {name: '오늘의 요약'})).getAllByRole('link');
    expect(links).toHaveLength(3);
    expect(links.map(link => link.getAttribute('href'))).toEqual(['/opportunities', '/opportunities', '/graduation']);
    expect(links[2]!.textContent).toContain('공식 판정 아님');
  });

  it('filters and resets currently visible opportunities while preserving the source order', async () => {
    await open('/opportunities');
    const region = screen.getByRole('region', {name: '공고 탐색'});
    const input = within(region).getByRole('searchbox', {name: '공고 검색'});
    // Only top-level opportunity rows count: nested topic chips are <li> too.
    const cardTitles = () => Array.from(region.querySelectorAll('.opps > .opp .opp__title')).map(item => item.textContent);
    const initial = cardTitles();
    expect(initial.length).toBeGreaterThan(0);
    fireEvent.change(input, {target: {value: '가상 핀테크 데이터 분석가 신입'}});
    expect(cardTitles()).toEqual(['가상 핀테크 데이터 분석가 신입']);
    fireEvent.click(within(region).getByRole('button', {name: '자격 확인 필요'}));
    expect(cardTitles()).toHaveLength(0);
    fireEvent.click(within(region).getByRole('button', {name: '검색 조건 초기화'}));
    expect((input as HTMLInputElement).value).toBe('');
    expect(cardTitles()).toEqual(initial);
  });

  it('never keeps a previous profile search when the demo subject changes', async () => {
    await open('/opportunities');
    const input = screen.getByRole('searchbox', {name: '공고 검색'});
    fireEvent.change(input, {target: {value: '핀테크'}});
    fireEvent.click(within(screen.getByRole('group', {name: /시연 대상 선택/})).getAllByRole('radio')[1]!);
    await flush();
    expect((screen.getByRole('searchbox', {name: '공고 검색'}) as HTMLInputElement).value).toBe('');
    expect(screen.queryByText('가상 핀테크 데이터 분석가 신입')).toBeNull();
  });
});
