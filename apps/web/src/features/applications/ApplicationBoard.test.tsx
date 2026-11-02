// @vitest-environment jsdom
import {StrictMode} from 'react';
import {afterEach, describe, expect, it} from 'vitest';
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {DemoController} from '../../app/index.js';
import {SyntheticDemoClient} from '../../dev/syntheticDemoClient.js';
import {SyntheticOwnerServer, type SyntheticOwnerOptions} from '../../dev/syntheticOwnerServer.js';
import {HufsApiClient} from '../../integrations/index.js';
import {App} from '../../App.js';
import {appPages} from '../../pages/index.js';
import type {HistoryPort} from '../../shell/router.js';
import {boardPort} from './boardPort.js';

afterEach(cleanup);
const flush = () => act(async () => { for (let i = 0; i < 20; i++) await new Promise(r => setTimeout(r, 0)); });
const history = (start: string): HistoryPort => {
  const port = {location: {pathname: start}, history: {pushState: (_s: unknown, _t: string, u?: string | URL | null) => { port.location.pathname = String(u); }},
    addEventListener: () => {}, removeEventListener: () => {}};
  return port;
};

function app(server: SyntheticOwnerServer) {
  return <App controller={new DemoController(new SyntheticDemoClient({delayMs: 0}), 'RUN')} historyPort={history('/applications')} pages={appPages}
    services={{applications: boardPort(new HufsApiClient(server.fetch))}} />;
}
/** Real HufsApiClient + owner session controller over the in-memory fictitious owner. */
async function open(options: SyntheticOwnerOptions = {}) {
  const server = new SyntheticOwnerServer(options);
  render(app(server));
  await flush();
  return server;
}
const column = (name: string) => screen.getByRole('region', {name: new RegExp(`^${name}`)});
const cards = (col: string) => within(column(col)).queryAllByRole('listitem').filter(li => li.classList.contains('board__card'));
const prepared = (server: SyntheticOwnerServer) => server.bookmarks.filter(b => b.value.kind === 'BOOKMARK' && b.value.stage === 'PREPARING').length;

describe('#80 지원 현황 보드 (owner, synthetic)', () => {
  it('shows five stage columns with counts, the self-record note and badges, and keeps an unreadable posting', async () => {
    await open();
    expect(screen.getByRole('heading', {level: 1}).textContent).toBe('지원 현황');
    expect(screen.getByRole('note').textContent).toContain('실제 지원 접수·합격 여부는 각 기관에서 확인');
    expect(['관심', '준비 중', '지원 완료', '결과 대기', '결과 기록'].map(n => cards(n).length)).toEqual([2, 2, 1, 1, 1]);
    for (const col of ['지원 완료', '결과 대기', '결과 기록'])
      expect(within(column(col)).getAllByText('내가 기록함 · 확인되지 않음').length).toBeGreaterThan(0);
    expect(within(column('관심')).queryByText('내가 기록함 · 확인되지 않음')).toBeNull();
    expect(within(column('준비 중')).getByRole('listitem', {name: '공고 정보를 불러올 수 없어요'})).toBeTruthy();
    expect(within(column('결과 기록')).getByText(/대기 · 가상 메모/)).toBeTruthy();
  });

  it('moves a card to the next stage only through the server, then shows it in the new column', async () => {
    const server = await open();
    const first = cards('관심')[0]!;
    const title = first.querySelector('h4')!.textContent!;
    fireEvent.click(within(first).getByRole('button', {name: '준비 시작'}));
    await flush();
    expect(within(column('준비 중')).getByRole('listitem', {name: title})).toBeTruthy();
    expect(prepared(server)).toBe(3);
  });

  it("records a result as the student's own unverified entry", async () => {
    const server = await open();
    const card = cards('결과 대기')[0]!;
    fireEvent.click(within(card).getByRole('button', {name: '결과 기록하기'}));
    fireEvent.change(within(card).getByLabelText('결과 (내가 기록)'), {target: {value: 'ACCEPTED'}});
    fireEvent.click(within(card).getByRole('button', {name: '결과 저장'}));
    await flush();
    expect(server.bookmarks.find(b => b.itemId === 'bm-04')!.value)
      .toMatchObject({stage: 'RESULT_RECORDED', outcome: {provenance: 'USER_ENTERED_UNVERIFIED', result: 'ACCEPTED'}});
    expect(within(column('결과 기록')).getByText(/합격/)).toBeTruthy();
  });

  it('adds and checks off a to-do on a card', async () => {
    const server = await open();
    const title = cards('관심')[0]!.querySelector('h4')!.textContent!;
    const card = () => screen.getByRole('listitem', {name: title});
    fireEvent.change(within(card()).getByLabelText('할 일 추가'), {target: {value: '가상 서류 확인'}});
    fireEvent.click(within(card()).getByRole('button', {name: '추가'}));
    await flush();
    fireEvent.click(within(card()).getByRole('checkbox', {name: '가상 서류 확인'}));
    await flush();
    expect(server.tasks.find(t => t.value.kind === 'ACTION_PLAN' && t.value.task === '가상 서류 확인')?.value)
      .toMatchObject({done: true, dataMode: 'SYNTHETIC'});
  });

  it('409 (changed elsewhere): clears the board, asks to reload, and 다시 불러오기 shows the fresh state', async () => {
    const server = await open();
    const first = cards('관심')[0]!;
    server.touch('bm-01'); // both 관심 cards changed in another tab
    server.touch('bm-06');
    fireEvent.change(within(first).getByLabelText('할 일 추가'), {target: {value: '미저장 메모'}});
    fireEvent.click(within(first).getByRole('button', {name: '준비 시작'}));
    await flush();
    expect(screen.getByRole('alert').textContent).toContain('다른 창이나 기기에서 기록이 바뀌었어요');
    expect(screen.queryByRole('region', {name: /^관심/})).toBeNull();
    fireEvent.click(screen.getByRole('button', {name: '다시 불러오기'}));
    await flush();
    expect(cards('관심')).toHaveLength(2);
    expect(screen.queryByDisplayValue('미저장 메모')).toBeNull();
    expect(prepared(server)).toBe(2); // the conflicting write was not applied
  });

  it('401 while working: every record disappears and sign-in is offered', async () => {
    const server = await open();
    server.sessionError = 'UNAUTHENTICATED';
    fireEvent.click(within(cards('관심')[0]!).getByRole('button', {name: '준비 시작'}));
    await flush();
    expect(screen.getByRole('alert').textContent).toContain('로그인이 필요해요');
    expect(screen.queryByText('내가 기록함 · 확인되지 않음')).toBeNull();
    expect(document.querySelectorAll('.board__card')).toHaveLength(0);
    expect(prepared(server)).toBe(2);
  });

  it('a different account in the same tab ends the scope instead of mixing records', async () => {
    const server = await open();
    server.actorId = 'SYN-OWNER-2';
    fireEvent.click(within(cards('관심')[0]!).getByRole('button', {name: '준비 시작'}));
    await flush();
    expect(screen.getByRole('alert').textContent).toContain('로그인이 필요해요');
    expect(document.querySelectorAll('.board__card')).toHaveLength(0);
    expect(prepared(server)).toBe(2); // write not sent
  });

  it('REVIEWER session: no owner records, explains the synthetic sandbox instead', async () => {
    await open({reviewerSession: true});
    expect(screen.getByRole('alert').textContent).toContain('베타 참여자 본인 기록 전용');
    expect(document.querySelectorAll('.board__card')).toHaveLength(0);
  });

  it('works under StrictMode (session created in the effect, never left disposed)', async () => {
    render(<StrictMode>{app(new SyntheticOwnerServer())}</StrictMode>);
    await flush();
    expect(cards('관심')).toHaveLength(2);
  });
});
