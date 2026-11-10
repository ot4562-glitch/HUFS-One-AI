// @vitest-environment jsdom
import {afterEach, describe, expect, it} from 'vitest';
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {DemoController} from '../app/index.js';
import {SyntheticDemoClient} from '../dev/syntheticDemoClient.js';
import {SyntheticOwnerServer} from '../dev/syntheticOwnerServer.js';
import {HufsApiClient} from '../integrations/index.js';
import {boardPort} from '../features/applications/boardPort.js';
import {App} from '../App.js';
import {appPages} from '../pages/index.js';
import type {HistoryPort} from './router.js';
import {getHufsAbilityManifest} from '@hufs-one/contracts';
import {MENU_GROUPS, OFFICIAL_HUFSABILITY_URL} from './menuCatalog.js';
import {AREAS} from './areas.js';

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

  it('HUFSAbility items are exactly the central manifest: same ids, labels and states, none opened by the UI', () => {
    const m = getHufsAbilityManifest();
    const fromManifest = [...m.categories.flatMap(c => c.items), ...m.publicEntries].map(i => [i.id, i.label, i.state]);
    const shown = MENU_GROUPS.filter(g => g.origin !== 'HUFS_ONE_AI').flatMap(g => g.items).map(i => [i.id, i.label, i.status]);
    expect(shown).toEqual(fromManifest);
    expect(MENU_GROUPS.filter(g => g.origin === 'HUFSABILITY').map(g => g.id)).toEqual(m.categories.map(c => c.id));
    expect(OFFICIAL_HUFSABILITY_URL).toBe(m.officialHomepage);
  });

  it('only DEMO_AVAILABLE items have a route; HUFS One AI additions are never listed as HUFSAbility functions', () => {
    for (const i of MENU_GROUPS.flatMap(g => g.items)) expect(Boolean(i.route)).toBe(i.status === 'DEMO_AVAILABLE');
    expect(MENU_GROUPS.filter(g => g.origin !== 'HUFS_ONE_AI').flatMap(g => g.items).some(i => i.kind === 'EXTENSION' || i.route)).toBe(false);
    expect(MENU_GROUPS.filter(g => g.origin === 'HUFS_ONE_AI').flatMap(g => g.items).every(i => i.kind === 'EXTENSION')).toBe(true);
    // Our own screens stay reachable from the 확장 group instead of borrowing an original menu name.
    expect(MENU_GROUPS[0]!.items.map(i => i.route)).toEqual(expect.arrayContaining(['/opportunities', '/notices']));
  });

  it('links existing owner-only modules without misrepresenting the original menu as implemented',()=>{
    const owners=MENU_GROUPS.find(g=>g.id==='owner-independent')!.items;
    expect(owners).toHaveLength(12);
    expect(owners.every(x=>x.kind==='EXTENSION'&&x.requiresApprovedSource)).toBe(true);
    expect(owners.map(x=>x.route)).toEqual(expect.arrayContaining([
      '/owner-opportunities/v2-catalog','/owner-scholarships','/owner-badges',
      '/owner-insights/MENTORS','/owner-insights/EMPLOYMENT','/counseling',
    ]));
    expect(MENU_GROUPS.filter(g=>g.origin==='HUFSABILITY')
      .flatMap(g=>g.items).some(x=>x.route)).toBe(false);
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
    // Original menus with the same name as one of our screens are still not links to it.
    for (const name of ['비교과 프로그램', '채용정보(교내)']) expect(within(page).getByText(name).closest('a')).toBeNull();
    const tree = page.querySelector('.menu--page') as HTMLElement;
    expect(within(tree).getAllByRole('link').filter(a => a.getAttribute('href')?.startsWith('/')).length).toBe(
      MENU_GROUPS.flatMap(g => g.items).filter(i => i.route).length);
  });

  it('the 4 public areas only link to the official home in a new tab and say the demo does not provide them', async () => {
    await open('/menu');
    const page = screen.getByRole('main');
    for (const name of ['교내비교과', '장학공지', '공지사항', '채용정보']) {
      const link = within(page).getAllByRole('link').find(a => a.textContent?.startsWith('🚫' + name))!;
      expect(link.getAttribute('href'), name).toBe(OFFICIAL_HUFSABILITY_URL);
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
      expect(link.textContent).toMatch(/시연 불가.*학교 공식 HUFSAbility 첫 화면으로 이동.*새 창/);
    }
  });

  it('the official site link opens a new tab without opener/referrer and says it is the school site', async () => {
    await open('/menu');
    const link = within(screen.getByRole('main')).getByRole('link', {name: /공식 HUFSAbility에서 열기/});
    expect(link.getAttribute('href')).toBe(OFFICIAL_HUFSABILITY_URL);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.textContent).toContain('학교 공식 사이트');
  });

  it('the GNB is the 11 observed HUFSAbility areas; an area page lists our screens and the originals as 미지원 text', async () => {
    await open('/');
    const gnb = screen.getByRole('navigation', {name: '전체 메뉴'});
    expect(within(gnb).getAllByRole('link').map(a => a.textContent)).toEqual(AREAS.map(a => a.label));
    expect(within(gnb).getAllByRole('link')).toHaveLength(11);
    fireEvent.click(within(gnb).getByRole('link', {name: '채용/고용24'}));
    await flush();
    expect(screen.getByRole('heading', {level: 1}).textContent).toBe('채용/고용24');
    expect(within(gnb).getByRole('link', {name: '채용/고용24'}).getAttribute('aria-current')).toBe('page');
    const ours = screen.getByRole('region', {name: 'ONE AI에서 쓸 수 있는 화면'});
    expect(within(ours).getByRole('link', {name: '지원 현황'}).getAttribute('href')).toBe('/applications');
    expect(within(ours).getByRole('link', {name: '승인된 공고 전체 검색'}).getAttribute('href'))
      .toBe('/owner-opportunities/v2-catalog');
    const originals = screen.getByRole('region', {name: '원래 메뉴'});
    expect(within(originals).getByText('외대친화기업(HUFFi)').closest('a, button')).toBeNull();
    expect(within(originals).queryAllByRole('link')).toHaveLength(0);
    // The left menu repeats the same split: our screens are links, originals are text.
    const lnb = screen.getByRole('navigation', {name: '채용/고용24 메뉴'});
    expect(within(lnb).getAllByRole('link').map(a => a.textContent)).toEqual(['채용/고용24', '맞춤 기회', '승인된 공고 전체 검색', '지원 현황']);
    expect(within(lnb).getAllByText('미지원')).toHaveLength(AREAS.find(a => a.id === 'jobs')!.observed.length);
    cleanup();
    await open('/competency-test');
    expect(screen.getByRole('heading', {level: 1}).textContent).toBe('페이지를 찾을 수 없습니다');
  });
});
