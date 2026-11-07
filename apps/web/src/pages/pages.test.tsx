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

  // S01's own generated synthetic data (core buildDemoSnapshot, DEMO_AS_OF).
  const S01_FEATURED = ['가상 데이터 공공문제 공모전', '가상 파이썬 데이터 분석 부트캠프', '가상 핀테크 데이터 분석가 신입'];

  it("shows S01's large matched cards (3), compact list (6), synthetic badge and pinned notices", async () => {
    await open();
    const featured = screen.getByRole('region', {name: '나에게 맞춘 공고'});
    expect(within(featured).getAllByRole('heading', {level: 3}).map(h => h.textContent)).toEqual(S01_FEATURED);
    expect(within(screen.getByRole('region', {name: '다른 공고'})).getAllByRole('listitem')).toHaveLength(6);
    expect(screen.getByRole('link', {name: '전체 보기'})).toBeTruthy();
    expect(within(screen.getByRole('list', {name: '이 화면의 자료'})).getAllByRole('listitem').map(li => li.textContent))
      .toEqual(['합성 자료']);
    const pinned = screen.getByRole('region', {name: '공지사항'});
    expect(within(pinned).getByText(/가상 수강정정 기간 안내/)).toBeTruthy();
    expect(within(pinned).getByText(/가상 졸업인증 서류 제출 안내/)).toBeTruthy();
  });

  it('#318: states where D-day is computed from, next to the deadlines and on 기회', async () => {
    await open();
    const due = screen.getByRole('region', {name: '다가오는 확정 마감'});
    const basis = /^(공고 |공지 )?D-day는 브라우저의 오늘이 아니라 시연 자료의 기준일 \d{4}년 \d{1,2}월 \d{1,2}일로 계산했어요\.$/;
    expect(within(due).getAllByText(basis).length).toBeGreaterThan(0);
    cleanup();
    await open('/opportunities');
    expect(screen.getByText(/^D-day는 브라우저의 오늘이 아니라 시연 자료의 기준일 .+로 계산했어요\.$/)).toBeTruthy();
  });

  it("switching to S02 shows S02's own cards and none of S01's", async () => {
    await open();
    fireEvent.click(within(screen.getByRole('group', {name: /시연 대상 선택/})).getAllByRole('radio')[1]!);
    await flush();
    const titles = within(screen.getByRole('region', {name: '나에게 맞춘 공고'})).getAllByRole('heading', {level: 3}).map(h => h.textContent);
    expect(titles[0]).toBe('가상 무역상사 해외영업 신입');
    for (const t of S01_FEATURED) expect(titles).not.toContain(t);
  });

  it('shows a relevance score only with its "not a pass probability" disclaimer', async () => {
    await open();
    expect(screen.getByText(/^관련도 71 · /)).toBeTruthy();
    expect(screen.getAllByText(/^관련도 [0-9]+ · /)).toHaveLength(3);
    expect(screen.getAllByText(RECOMMENDATION_SCORE_DISCLAIMER)).toHaveLength(3);
  });

  it('opens a card detail with the server eligibility text', async () => {
    await open();
    fireEvent.click(screen.getByRole('link', {name: '가상 핀테크 데이터 분석가 신입'}));
    await flush();
    expect(screen.getByRole('heading', {level: 1}).textContent).toBe('가상 핀테크 데이터 분석가 신입');
    expect(screen.getByText('지원 조건')).toBeTruthy();
    expect(screen.getByRole('region', {name: '이 공고를 보여 준 이유'})).toBeTruthy();
  });

  it('hides the feed when the profile does not share FEED', async () => {
    class NoFeedClient extends SyntheticDemoClient {
      override async listProfiles(): Promise<DemoProfileOption[]> {
        const p = await super.listProfiles();
        return p.map(x => x.demoSubjectId === 'S01' ? {...x, allowedSections: ['NOTICES']} : x);
      }
    }
    await open('/', new NoFeedClient({delayMs: 0}));
    expect(screen.getAllByText('이 항목은 시연 공유 범위 밖입니다.').length).toBeGreaterThan(0);
    expect(screen.queryByText(S01_FEATURED[0]!)).toBeNull();
  });
});

describe('공지 and detail routes', () => {
  it('lists notices with priority, applicability and verification state', async () => {
    await open('/notices');
    const draft = screen.getByRole('link', {name: /가상 교과개편·대체과목 안내/});
    expect(draft.textContent).toContain('확인 전 초안');
    const first = screen.getAllByRole('link').find(a => a.getAttribute('href')?.startsWith('/notices/'))!;
    expect(first.textContent).toContain('고정');
  });

  it('a detail id that is not in the current snapshot is not found (no cross-subject lookup)', async () => {
    await open('/opportunities/SYN-OPP-999');
    expect(screen.getByRole('heading', {level: 1}).textContent).toBe('공고를 찾을 수 없습니다');
  });
});
