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
  it('changes the home next-step panel without changing route or inventing student data', async () => {
    await open('/');
    const controls = screen.getByRole('group', {name: '오늘의 활동 선택'});
    const credits = within(controls).getByRole('button', {name: /취득 학점/});
    expect(credits.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(credits);
    expect(credits.getAttribute('aria-pressed')).toBe('true');
    const panel = screen.getByRole('region', {name: '취득 학점 안내'});
    expect(panel.textContent).toContain('공식 판정 아님');
    expect(within(panel).getByRole('link', {name: /졸업지원 보기/}).getAttribute('href')).toBe('/graduation');
  });

  it('filters and resets currently visible opportunities while preserving the source order', async () => {
    await open('/opportunities');
    const region = screen.getByRole('region', {name: '공고 탐색'});
    const input = within(region).getByRole('searchbox', {name: '공고 검색'});
    const initial = within(region).getAllByRole('listitem').map(item => item.textContent);
    expect(initial).toHaveLength(9);
    fireEvent.change(input, {target: {value: '가상 핀테크 데이터 분석가 신입'}});
    expect(within(region).getAllByRole('listitem')).toHaveLength(1);
    fireEvent.click(within(region).getByRole('button', {name: '자격 확인 필요'}));
    expect(within(region).queryByRole('listitem')).toBeNull();
    fireEvent.click(within(region).getByRole('button', {name: '검색 조건 초기화'}));
    expect((input as HTMLInputElement).value).toBe('');
    expect(within(region).getAllByRole('listitem').map(item => item.textContent)).toEqual(initial);
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
