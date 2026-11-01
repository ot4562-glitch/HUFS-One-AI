// @vitest-environment jsdom
import {afterEach, describe, expect, it} from 'vitest';
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {DemoOverlayResultSchema, DemoSnapshotSchema} from '@hufs-one/contracts';
import {DemoController} from '../../app/index.js';
import {buildSyntheticCalendar} from '../../dev/syntheticCalendar.js';
import {SyntheticDemoClient} from '../../dev/syntheticDemoClient.js';
import {App, type AppServices} from '../../App.js';
import {appPages} from '../../pages/index.js';
import type {HistoryPort} from '../../shell/router.js';
import {deriveSandbox, nextExperienceId} from './sandboxState.js';
import type {SandboxActionKind} from './useSandbox.js';

afterEach(cleanup);
const flush = () => act(async () => { for (let i = 0; i < 8; i++) await new Promise(r => setTimeout(r, 0)); });
const ALL: SandboxActionKind[] = ['BOOKMARK', 'MARK_READ', 'CHECKLIST', 'EXPERIENCE', 'APPLICATION_DRAFT', 'SIMULATE_APPLICATION',
  'SET_INTERESTS', 'SET_DESIRED_JOBS', 'PLAN_COURSE', 'SET_SEARCH', 'SET_NOTIFICATIONS', 'RESET_SANDBOX'];

function memoryHistory(start: string): HistoryPort {
  const port = {location: {pathname: start}, history: {pushState: (_s: unknown, _t: string, u?: string | URL | null) => { port.location.pathname = String(u); }},
    addEventListener: () => {}, removeEventListener: () => {}};
  return port;
}
function sandboxFor(client: SyntheticDemoClient, allowed: SandboxActionKind[] = ALL): AppServices {
  return {sandbox: {
    allowedActions: new Set(allowed),
    read: (ctx, s) => client.readActions(ctx.contextId, s),
    save: (ctx, a, s) => client.saveAction(ctx.contextId, a, s),
  }};
}
const pick = (i: number) => fireEvent.click(within(screen.getByRole('group', {name: /시연 대상 선택/})).getAllByRole('radio')[i]!);
const tab = (name: string) => fireEvent.click(within(screen.getByRole('navigation', {name: '주요 메뉴'})).getByRole('link', {name}));

async function open(start: string, services?: AppServices, client = new SyntheticDemoClient({delayMs: 0})) {
  const controller = new DemoController(client, 'RUN');
  render(<App controller={controller} historyPort={memoryHistory(start)} pages={appPages}
    services={services ?? sandboxFor(client)} />);
  await flush();
  pick(0);
  await flush();
  return {client, controller};
}
/** Replace the current snapshot without changing epoch or context, as a committed overlay write does. */
async function commitOverlay(controller: DemoController) {
  const before = controller.getState();
  const s = before.snapshot!;
  const receipt = DemoOverlayResultSchema.parse({
    overlay: {version: 1, value: {interestTopics: ['AI_ML']}, updatedAt: s.asOf},
    snapshot: DemoSnapshotSchema.parse({...s, versions: {...s.versions, consent: before.context!.sharingGrantVersion, overlay: 'BETA_OVERLAY:1'}}),
    calendar: buildSyntheticCalendar(s.asOf),
  });
  await act(async () => { expect(await controller.runOverlayOperation(async () => receipt)).not.toBeNull(); });
  const after = controller.getState();
  expect([after.epoch, after.context?.contextId, after.snapshot === s]).toEqual([before.epoch, before.context?.contextId, false]);
}
const value = (label: RegExp) => (screen.queryByLabelText(label) as HTMLTextAreaElement | null)?.value ?? null;

describe('sandbox log fold', () => {
  it('latest action per item wins and RESET clears what came before', () => {
    const s = deriveSandbox([
      {kind: 'BOOKMARK', itemId: 'SYN-OPP-001', saved: true},
      {kind: 'BOOKMARK', itemId: 'SYN-OPP-002', saved: true},
      {kind: 'RESET_SANDBOX'},
      {kind: 'BOOKMARK', itemId: 'SYN-OPP-003', saved: true},
      {kind: 'BOOKMARK', itemId: 'SYN-OPP-003', saved: false},
      {kind: 'BOOKMARK', itemId: 'SYN-OPP-004', saved: true},
      {kind: 'EXPERIENCE', experienceId: 'SYN-EXP-1', note: 'a'},
      {kind: 'SET_NOTIFICATIONS', enabled: true},
    ]);
    expect([...s.bookmarks]).toEqual(['SYN-OPP-004']);
    expect(s.notifications).toBe(true);
    expect(nextExperienceId(s)).toBe('SYN-EXP-2');
  });
});

describe('REVIEWER sandbox screens (synthetic)', () => {
  it('without a sandbox port, 보관함/경험/설정 explain and detail pages show no actions', async () => {
    await open('/saved', {});
    expect(screen.getByText(/심사용 합성 시연에서 먼저 제공됩니다/)).toBeTruthy();
  });

  it('save + practice application from a card detail appear in 보관함, labelled as not real', async () => {
    await open('/opportunities/SYN-OPP-002');
    expect(screen.getByText('심사용 합성 시연 — 실제로 저장·제출되지 않습니다.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', {name: '보관함에 저장'}));
    await flush();
    expect(screen.getByRole('button', {name: '보관함에서 빼기'}).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', {name: '모의 지원하기'}));
    await flush();
    expect(screen.getByText('모의 지원 완료(실제 제출 아님)')).toBeTruthy();
    tab('보관함');
    await flush();
    const saved = screen.getByRole('region', {name: '저장한 공고'});
    expect(within(saved).getByRole('link', {name: '가상 데이터 공공문제 공모전'})).toBeTruthy();
    expect(within(screen.getByRole('region', {name: '모의 지원'})).getAllByRole('link')).toHaveLength(1);
  });

  it("S01's saved items never appear for S02", async () => {
    await open('/opportunities/SYN-OPP-002');
    fireEvent.click(screen.getByRole('button', {name: '보관함에 저장'}));
    await flush();
    tab('보관함');
    pick(1);
    await flush();
    expect(within(screen.getByRole('region', {name: '저장한 공고'})).queryAllByRole('link')).toHaveLength(0);
  });

  it('only server-allowed actions are offered', async () => {
    const client = new SyntheticDemoClient({delayMs: 0});
    await open('/opportunities/SYN-OPP-002', sandboxFor(client, ['BOOKMARK']), client);
    expect(screen.getByRole('button', {name: '보관함에 저장'})).toBeTruthy();
    expect(screen.queryByRole('button', {name: '모의 지원하기'})).toBeNull();
    expect(screen.queryByLabelText(/지원서 초안/)).toBeNull();
  });

  it('경험: adds a note with a SYN- id and lists its first line as the title', async () => {
    await open('/experience');
    fireEvent.change(screen.getByLabelText(/새 경험/), {target: {value: '가상 동아리 회계 담당\n예산 정리와 결산 보고'}});
    fireEvent.click(screen.getByRole('button', {name: '경험 저장'}));
    await flush();
    expect(screen.getByText('가상 동아리 회계 담당')).toBeTruthy();
    expect(screen.getByText('예산 정리와 결산 보고')).toBeTruthy();
  });

  it('설정: at most 5 interests, then reset asks for confirmation and clears the log', async () => {
    await open('/settings');
    const boxes = within(screen.getByRole('group', {name: /관심 분야/})).getAllByRole('checkbox');
    for (const b of boxes.slice(0, 6)) fireEvent.click(b);
    expect(boxes.filter(b => (b as HTMLInputElement).checked)).toHaveLength(5);
    expect((boxes[5] as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', {name: '관심 분야 저장'}));
    await flush();
    fireEvent.click(screen.getByRole('button', {name: '시연 기록 초기화'}));
    expect(screen.getByRole('alert').textContent).toContain('시연 기록을 모두 지울까요?');
    fireEvent.click(screen.getByRole('button', {name: '모두 지우기'}));
    await flush();
    expect(within(screen.getByRole('group', {name: /관심 분야/})).getAllByRole('checkbox').filter(b => (b as HTMLInputElement).checked)).toHaveLength(0);
  });
});

describe('REVIEWER sandbox isolation (#75 review)', () => {
  it('an unsaved application draft on S01 is gone after switching to S02', async () => {
    await open('/opportunities/SYN-OPP-002');
    fireEvent.change(screen.getByLabelText(/지원서 초안/), {target: {value: 'S01 미저장 초안'}});
    pick(1);
    await flush();
    expect([null, '']).toContain(value(/지원서 초안/));
    expect(screen.queryByDisplayValue('S01 미저장 초안')).toBeNull();
  });

  it('an unsaved experience note and interest picks on S01 are gone after switching to S02', async () => {
    await open('/experience');
    fireEvent.change(screen.getByLabelText(/새 경험/), {target: {value: 'S01 미저장 메모'}});
    pick(1);
    await flush();
    expect(value(/새 경험/)).toBe('');
    cleanup();
    await open('/settings');
    const boxes = () => within(screen.getByRole('group', {name: /관심 분야/})).getAllByRole('checkbox') as HTMLInputElement[];
    fireEvent.click(boxes()[0]!);
    fireEvent.click(screen.getByRole('button', {name: '시연 기록 초기화'}));
    pick(1);
    await flush();
    expect(boxes().filter(b => b.checked)).toHaveLength(0);
    expect(screen.queryByRole('alert')).toBeNull(); // reset confirmation does not carry over either
  });

  it('a same-context snapshot replacement hides the log at once and drops the unsaved note', async () => {
    const client = new SyntheticDemoClient({delayMs: 0});
    const domAtRead: boolean[] = [];
    let reads = 0;
    const services: AppServices = {sandbox: {
      allowedActions: new Set(ALL),
      read: (ctx, sig) => {
        domAtRead.push(screen.queryByLabelText(/새 경험/) !== null);
        return ++reads === 1 ? client.readActions(ctx.contextId, sig) : new Promise(() => {});
      },
      save: (ctx, a, sig) => client.saveAction(ctx.contextId, a, sig),
    }};
    const {controller} = await open('/experience', services, client);
    fireEvent.change(screen.getByLabelText(/새 경험/), {target: {value: '이전 snapshot의 미저장 메모'}});
    await commitOverlay(controller);
    await flush();
    expect(domAtRead).toEqual([false, false]); // the old editor was never committed under the new snapshot
    expect(screen.getByText('시연 기록을 불러오는 중')).toBeTruthy();
    expect(screen.queryByDisplayValue('이전 snapshot의 미저장 메모')).toBeNull();
  });

  it('a save that resolves after switching subjects is not applied to the new subject', async () => {
    const client = new SyntheticDemoClient({delayMs: 0});
    const late: (() => void)[] = [];
    const services: AppServices = {sandbox: {
      allowedActions: new Set(ALL),
      read: (ctx, sig) => client.readActions(ctx.contextId, sig),
      save: (ctx, a, sig) => new Promise(resolve => late.push(() => resolve(client.saveAction(ctx.contextId, a, sig)))),
    }};
    await open('/opportunities/SYN-OPP-002', services, client);
    fireEvent.click(screen.getByRole('button', {name: '보관함에 저장'}));
    pick(1);
    await flush();
    late.forEach(go => go());
    await flush();
    expect(screen.queryByRole('button', {name: '보관함에서 빼기'})).toBeNull();
  });
});
