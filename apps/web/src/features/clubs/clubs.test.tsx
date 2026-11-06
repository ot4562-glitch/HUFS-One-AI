// @vitest-environment jsdom
import {afterEach, describe, expect, it} from 'vitest';
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import type {DemoContext} from '@hufs-one/contracts';
import {DemoController} from '../../app/index.js';
import {SyntheticDemoClient} from '../../dev/syntheticDemoClient.js';
import {syntheticClubPort} from '../../dev/syntheticClubs.js';
import {App, type AppServices} from '../../App.js';
import {appPages} from '../../pages/index.js';
import type {HistoryPort} from '../../shell/router.js';
import type {ClubBoard} from '../../../../../packages/core/src/opportunities/clubs.js';
import {DEMO_AS_OF, DEMO_CLUB_POSTS, DEMO_STUDENTS, composeClubBoard, demoClubProfile} from '../../../../../packages/core/src/opportunities/index.js';
import {buildClubBoard, filterClubs, NO_FILTER} from './clubView.js';

afterEach(cleanup);
const flush = () => act(async () => { for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0)); });
const history = (start: string): HistoryPort => {
  const port = {location: {pathname: start}, history: {pushState: (_s: unknown, _t: string, u?: string | URL | null) => { port.location.pathname = String(u); }},
    addEventListener: () => {}, removeEventListener: () => {}};
  return port;
};
const pick = (i: number) => fireEvent.click(within(screen.getByRole('group', {name: /시연 대상 선택/})).getAllByRole('radio')[i]!);
async function open(path: string, services: AppServices = {clubs: syntheticClubPort()}, subject = 0) {
  render(<App controller={new DemoController(new SyntheticDemoClient({delayMs: 0}), 'RUN')} historyPort={history(path)} pages={appPages} services={services} />);
  await flush();
  pick(subject);
  await flush();
}
const boardFor = (subject: string) => composeClubBoard(demoClubProfile(DEMO_STUDENTS.find(s => s.subject === subject)!), DEMO_CLUB_POSTS, {asOf: DEMO_AS_OF});
const HIDDEN = ['SYN-CLUB-013', 'SYN-CLUB-014', 'SYN-CLUB-015', 'SYN-CLUB-016', 'SYN-CLUB-017', 'SYN-CLUB-018'];

describe('#123 club view model', () => {
  it('rejects a board for another asOf or with non-synthetic posts instead of guessing', () => {
    expect(buildClubBoard(boardFor('S01'), '2026-12-01T00:00:00.000Z').ok).toBe(false);
    const b = boardFor('S01');
    const real = {...b, all: b.all.map((r, i) => i === 0 ? {...r, post: {...r.post, dataMode: 'REAL'}} : r)} as unknown as ClubBoard;
    expect(buildClubBoard(real, DEMO_AS_OF).ok).toBe(false);
  });

  it('filters only narrow the list: campus keeps 두 캠퍼스 posts, closed ones need opt-in, search matches text', () => {
    const v = buildClubBoard(boardFor('S01'), DEMO_AS_OF);
    if (!v.ok) throw new Error('invalid');
    const all = v.view.all;
    expect(filterClubs(all, NO_FILTER).every(c => c.recruitable)).toBe(true);
    expect(filterClubs(all, {...NO_FILTER, includeClosed: true})).toHaveLength(all.length);
    expect(filterClubs(all, {...NO_FILTER, campus: 'GLOBAL'}).every(c => c.campus === 'GLOBAL' || c.campus === 'BOTH')).toBe(true);
    expect(filterClubs(all, {...NO_FILTER, query: '공방'}).map(c => c.id)).toEqual(['SYN-CLUB-002']);
    expect(all.some(c => HIDDEN.includes(c.id))).toBe(false);
  });
});

describe('#123 동아리 모집 page (synthetic)', () => {
  it('shows the demo note, up to 3 recommendations with reasons, the full list, and labelled synthetic posters', async () => {
    await open('/clubs');
    expect(screen.getByRole('heading', {level: 1}).textContent).toBe('동아리 모집');
    expect(screen.getByRole('note').textContent).toContain('실제 학교 동아리와 무관한 가상 데이터');
    const rec = screen.getByRole('region', {name: '나에게 맞는 동아리'});
    const recCards = within(rec).getAllByRole('listitem').filter(li => li.classList.contains('club'));
    expect(recCards.length).toBeGreaterThan(0);
    expect(recCards.length).toBeLessThanOrEqual(3);
    expect(within(rec).getAllByText(/관심 분야|희망 활동|승인한 경험/).length).toBeGreaterThan(0);
    expect(within(rec).getAllByText('가상 관리자 승인(시연)').length).toBe(recCards.length);
    const poster = within(rec).getAllByRole('img')[0]!;
    expect(poster.getAttribute('alt')).toContain('합성');
    expect(poster.closest('figure')?.querySelector('figcaption')?.textContent).toBe('합성 예시 · 실제 모집 아님');
  });

  it('never lists or opens a post that is not (or no longer) approved at asOf, even by direct URL', async () => {
    await open('/clubs');
    fireEvent.click(screen.getByLabelText('마감된 모집도 보기'));
    const text = screen.getByRole('main').textContent!;
    for (const name of ['초안 모임', '검토 대기 모임', '반려된 모임', '철회된 모임', '내일 승인될 모임', '승인 후 수정된 모임']) expect(text).not.toContain(name);
    cleanup();
    for (const id of HIDDEN) {
      await open(`/clubs/${id}`);
      expect(screen.getByRole('main').textContent).toContain('지금 볼 수 있는 모집 글이 아니에요');
      cleanup();
    }
  });

  it('a visible post opens with times, synthetic source, 확인 필요 conditions and no real application', async () => {
    await open('/clubs/SYN-CLUB-003');
    const main = screen.getByRole('main');
    expect(main.textContent).toContain('가상동아리 모의유엔 라운드테이블');
    expect(main.textContent).toMatch(/작성.*수정.*검수\(가상 승인\)/s);
    expect(main.textContent).toContain('출처: 합성 데이터');
    expect(main.textContent).toContain('가입 신청·연락·결제는 할 수 없어요');
    expect(within(main).queryByRole('button', {name: /신청|가입/})).toBeNull();
  });

  it('recommendations differ by synthetic student, and filters reset when the student changes', async () => {
    await open('/clubs');
    const names = () => within(screen.getByRole('region', {name: '나에게 맞는 동아리'})).queryAllByRole('heading', {level: 3}).map(h => h.textContent);
    const s01 = names();
    fireEvent.change(screen.getByLabelText('검색'), {target: {value: '번역'}});
    pick(1);
    await flush();
    expect(names()).not.toEqual(s01);
    expect((screen.getByLabelText('검색') as HTMLInputElement).value).toBe('');
  });

  it('a board that arrives after switching students is never shown for the new student', async () => {
    const pending: {ctx: DemoContext; resolve: (b: ClubBoard) => void}[] = [];
    await open('/clubs', {clubs: {loadBoard: ctx => new Promise(resolve => pending.push({ctx, resolve}))}});
    pick(1);
    await flush();
    pending.find(p => p.ctx.demoSubjectId === 'S01')!.resolve(boardFor('S01'));
    await flush();
    expect(screen.queryByRole('region', {name: '나에게 맞는 동아리'})).toBeNull();
    pending.find(p => p.ctx.demoSubjectId === 'S02')!.resolve(boardFor('S02'));
    await flush();
    expect(screen.getByRole('region', {name: '나에게 맞는 동아리'})).toBeTruthy();
  });

  it('without a club port (no API yet) it says so instead of showing anything', async () => {
    await open('/clubs', {});
    expect(screen.getByRole('main').textContent).toContain('합성 시연 모드에서 제공돼요');
  });
});
