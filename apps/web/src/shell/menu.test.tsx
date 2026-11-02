// @vitest-environment jsdom
import {afterEach, describe, expect, it} from 'vitest';
import {act, cleanup, render, screen, within} from '@testing-library/react';
import {DemoController} from '../app/index.js';
import {SyntheticDemoClient} from '../dev/syntheticDemoClient.js';
import {SyntheticOwnerServer} from '../dev/syntheticOwnerServer.js';
import {HufsApiClient} from '../integrations/index.js';
import {boardPort} from '../features/applications/boardPort.js';
import {App} from '../App.js';
import {appPages} from '../pages/index.js';
import type {HistoryPort} from './router.js';
import {MENU_GROUPS, OFFICIAL_HUFSABILITY_URL} from './menuCatalog.js';

afterEach(cleanup);
const flush = () => act(async () => { for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0)); });
const history = (start: string): HistoryPort => {
  const port = {location: {pathname: start}, history: {pushState: (_s: unknown, _t: string, u?: string | URL | null) => { port.location.pathname = String(u); }},
    addEventListener: () => {}, removeEventListener: () => {}};
  return port;
};
async function open(path: string) {
  const client = new SyntheticDemoClient({delayMs: 0});
  render(<App controller={new DemoController(client, 'RUN')} historyPort={history(path)} pages={appPages}
    services={{applications: boardPort(new HufsApiClient(new SyntheticOwnerServer().fetch))}} />);
  await flush();
}

describe('#124 menu catalog', () => {
  it('keeps HUFSAbility’s 5 official menus and 24 functions plus the 4 public areas, in the official order', () => {
    const official = MENU_GROUPS.filter(g => g.origin === 'HUFSABILITY');
    expect(official.map(g => [g.label, g.items.length])).toEqual([
      ['역량관리', 4], ['교과/비교과', 5], ['채용', 6], ['경력개발', 4], ['통합상담', 5],
    ]);
    expect(official.flatMap(g => g.items.map(i => i.label))).toEqual([
      '핵심역량 소개', 'HUFSAbility 역량 점수', '핵심역량 진단검사', '대학생활적응검사',
      '교과(이수과목/성적)', '비교과 프로그램', '외부비교과 활동', '학습공동체', '장학 신청',
      '채용정보(교내)', '채용정보(워크넷)', '취업멘토링', '직업탐색', '청년인턴/강소기업', '외대친화기업(HUFFi)',
      '진로목표', '진로 로드맵', '포트폴리오', '진로취업도서관리',
      '교수(지도)상담', '진로취업상담', '심리상담', '외국인 유학생 상담', '학습상담',
    ]);
    expect(MENU_GROUPS.find(g => g.origin === 'HUFSABILITY_PUBLIC')!.items.map(i => i.label)).toEqual(['교내비교과', '장학공지', '공지사항', '채용정보']);
  });

  it('only DEMO_AVAILABLE items have a route; HUFS One AI additions are never listed as HUFSAbility functions', () => {
    for (const i of MENU_GROUPS.flatMap(g => g.items)) expect(Boolean(i.route)).toBe(i.status === 'DEMO_AVAILABLE');
    expect(MENU_GROUPS.filter(g => g.origin !== 'HUFS_ONE_AI').flatMap(g => g.items).some(i => i.kind === 'EXTENSION')).toBe(false);
    expect(MENU_GROUPS.filter(g => g.origin === 'HUFS_ONE_AI').flatMap(g => g.items).every(i => i.kind === 'EXTENSION')).toBe(true);
  });

  it('every clickable route opens a real demo screen (no placeholder, no not-found)', async () => {
    const routes = [...new Set(MENU_GROUPS.flatMap(g => g.items).flatMap(i => i.route ? [i.route] : []))];
    for (const route of routes) {
      await open(route);
      const main = screen.getByRole('main');
      expect(main.textContent, route).not.toMatch(/이 화면은 아직 준비 중입니다|페이지를 찾을 수 없습니다/);
      cleanup();
    }
  });
});

describe('#124 menu rendering', () => {
  it('/menu lists every menu; unsupported ones are 🚫 text with no link, not focusable, and say so to screen readers', async () => {
    await open('/menu');
    expect(screen.getByRole('heading', {level: 1}).textContent).toBe('전체 메뉴');
    const page = screen.getByRole('main');
    const off = within(page).getByText('핵심역량 진단검사').closest('.menu__item')!;
    expect(off.tagName).toBe('SPAN');
    expect(off.getAttribute('aria-disabled')).toBe('true');
    expect(off.textContent).toContain('이번 시연 미지원');
    expect(off.querySelector('a, button, [tabindex]')).toBeNull();
    const notices = within(page).getByRole('link', {name: /공지사항/});
    expect(notices.getAttribute('href')).toBe('/notices');
    expect(notices.textContent).toContain('AI 개선');
    expect(within(page).getAllByRole('link').filter(a => a.getAttribute('href')?.startsWith('/')).length).toBe(
      MENU_GROUPS.flatMap(g => g.items).filter(i => i.route).length);
  });

  it('the official site link opens a new tab without opener/referrer and says it is the school site', async () => {
    await open('/menu');
    const link = within(screen.getByRole('main')).getByRole('link', {name: /공식 HUFSAbility에서 열기/});
    expect(link.getAttribute('href')).toBe(OFFICIAL_HUFSABILITY_URL);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.textContent).toContain('학교 공식 사이트');
  });

  it('the sidebar navigation carries the same menu, and an unsupported function has no direct URL', async () => {
    await open('/');
    const nav = screen.getByRole('navigation', {name: '전체 메뉴'});
    expect(within(nav).getByText('외대친화기업(HUFFi)').closest('a')).toBeNull();
    expect(within(nav).getByRole('link', {name: '지원 현황'}).getAttribute('href')).toBe('/applications');
    cleanup();
    await open('/competency-test');
    expect(screen.getByRole('heading', {level: 1}).textContent).toBe('페이지를 찾을 수 없습니다');
  });
});
