// @vitest-environment jsdom
import {afterEach, describe, expect, it} from 'vitest';
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {RECOMMENDATION_SCORE_DISCLAIMER, type DemoProfileOption} from '@hufs-one/contracts';
import {DemoController} from '../app/index.js';
import {SyntheticDemoClient} from '../dev/syntheticDemoClient.js';
import {App} from '../App.js';
import {appPages} from './index.js';
import type {HistoryPort} from '../shell/router.js';

afterEach(cleanup);

function memoryHistory(start: string): HistoryPort {
  const port = {
    location: {pathname: start},
    history: {pushState: (_s: unknown, _t: string, url?: string | URL | null) => { port.location.pathname = String(url); }},
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  return port;
}

const flush = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)); });

async function open(start = '/', client = new SyntheticDemoClient({delayMs: 0})) {
  render(<App controller={new DemoController(client, 'TEST-RUN')} historyPort={memoryHistory(start)} pages={appPages} />);
  await flush();
  fireEvent.click(within(screen.getByRole('group', {name: /시연 대상 선택/})).getAllByRole('radio')[0]!);
  await flush();
}

describe('오늘 page', () => {
  it('asks to pick a subject before any data', async () => {
    render(<App controller={new DemoController(new SyntheticDemoClient({delayMs: 0}), 'TEST-RUN')} historyPort={memoryHistory('/')} pages={appPages} />);
    await flush();
    expect(screen.getByText(/시연 대상을 고르면/)).toBeTruthy();
    expect(screen.queryByRole('region', {name: '나에게 맞춘 공고'})).toBeNull();
  });

  it('shows large matched cards, the compact list, synthetic/AI-mock badges and pinned notices', async () => {
    await open();
    const featured = screen.getByRole('region', {name: '나에게 맞춘 공고'});
    expect(within(featured).getAllByRole('article')).toHaveLength(2);
    expect(within(featured).getAllByRole('heading', {level: 3}).map(h => h.textContent)).toEqual(['가상 데이터 체험', '가상 통상 활동']);
    expect(within(screen.getByRole('region', {name: '다른 공고'})).getAllByRole('listitem')).toHaveLength(1);
    expect(within(screen.getByRole('list', {name: '이 화면의 자료'})).getAllByRole('listitem').map(li => li.textContent))
      .toEqual(['합성 자료', 'AI 예시(모의)']);
    expect(within(screen.getByRole('region', {name: '고정 알림'})).getByText(/가상 학사 확인 안내/)).toBeTruthy();
  });

  it('shows a relevance score only with its "not a pass probability" disclaimer', async () => {
    await open();
    expect(screen.getByText('관련도 50 · 보통')).toBeTruthy();
    expect(screen.getAllByText(RECOMMENDATION_SCORE_DISCLAIMER)).toHaveLength(1);
  });

  it('opens a card detail with server eligibility text verbatim', async () => {
    await open();
    fireEvent.click(screen.getByRole('link', {name: '가상 통상 활동'}));
    await flush();
    expect(screen.getByRole('heading', {level: 1}).textContent).toBe('가상 통상 활동');
    expect(screen.getByText('지원 조건 충족')).toBeTruthy();
  });

  it('hides the feed when the profile does not share FEED', async () => {
    class NoFeedClient extends SyntheticDemoClient {
      override async listProfiles(): Promise<DemoProfileOption[]> {
        const p = await super.listProfiles();
        return p.map(x => x.demoSubjectId === 'S01' ? {...x, allowedSections: ['NOTICES']} : x);
      }
    }
    await open('/', new NoFeedClient({delayMs: 0}));
    expect(screen.getByText('이 항목은 시연 공유 범위 밖입니다.')).toBeTruthy();
    expect(screen.queryByText('가상 데이터 체험')).toBeNull();
  });
});

describe('공지 and detail routes', () => {
  it('lists notices with priority, applicability and verification state', async () => {
    await open('/notices');
    const row = screen.getByRole('link', {name: /가상 학사 확인 안내/});
    expect(row.textContent).toContain('학사 필수');
    expect(row.textContent).toContain('해당 여부 확인 필요');
    expect(row.textContent).toContain('확인 전 초안');
  });

  it('a detail id that is not in the current snapshot is not found (no cross-subject lookup)', async () => {
    await open('/opportunities/SYN-OPP-999');
    expect(screen.getByRole('heading', {level: 1}).textContent).toBe('공고를 찾을 수 없습니다');
  });
});
