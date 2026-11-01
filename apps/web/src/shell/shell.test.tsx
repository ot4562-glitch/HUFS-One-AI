// @vitest-environment jsdom
import {afterEach, describe, expect, it} from 'vitest';
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import type {DemoContext, DemoProfileOption, DemoSnapshot, SubjectAlias} from '@hufs-one/contracts';
import {DemoController, type DemoClientPort} from '../app/index.js';
import {HufsApiError} from '../integrations/api-client.js';
import {SyntheticDemoClient} from '../dev/syntheticDemoClient.js';
import {App} from '../App.js';
import type {HistoryPort} from './router.js';

afterEach(cleanup);

function memoryHistory(start = '/'): HistoryPort & {paths: string[]} {
  const listeners = new Set<() => void>();
  const port = {
    paths: [start],
    location: {pathname: start},
    history: {pushState: (_s: unknown, _t: string, url?: string | URL | null) => { port.location.pathname = String(url); port.paths.push(String(url)); }},
    addEventListener: (_: 'popstate', l: () => void) => { listeners.add(l); },
    removeEventListener: (_: 'popstate', l: () => void) => { listeners.delete(l); },
  };
  return port;
}

/** Client whose snapshot responses resolve only when the test says so. */
class ControlledClient implements DemoClientPort {
  readonly inner = new SyntheticDemoClient({delayMs: 0});
  readonly pending = new Map<SubjectAlias, {resolve: () => void; reject: (e: unknown) => void}>();
  private readonly subjectOf = new Map<string, SubjectAlias>();
  listProfiles(): Promise<DemoProfileOption[]> { return this.inner.listProfiles(); }
  async createContext(subject: SubjectAlias, runId: string): Promise<DemoContext> {
    const ctx = await this.inner.createContext(subject, runId);
    this.subjectOf.set(ctx.contextId, subject);
    return ctx;
  }
  getSnapshot(contextId: string, signal?: AbortSignal): Promise<DemoSnapshot> {
    const subject = this.subjectOf.get(contextId)!;
    return new Promise((resolve, reject) => {
      this.pending.set(subject, {resolve: () => resolve(this.inner.getSnapshot(contextId)), reject});
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    });
  }
  logout(): Promise<void> { return Promise.resolve(); }
}

const flush = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)); });

async function setup(client: DemoClientPort = new SyntheticDemoClient({delayMs: 0}), start = '/') {
  const controller = new DemoController(client, 'TEST-RUN-1');
  const history = memoryHistory(start);
  render(<App controller={controller} transportLabel="합성 모의 연결" historyPort={history} />);
  await flush();
  return {controller, history};
}

const radios = () => within(screen.getByRole('group', {name: /시연 대상 선택/})).getAllByRole('radio');

describe('App shell', () => {
  it('shows the synthetic transport label and five selector rows with S05 disabled', async () => {
    await setup();
    expect(screen.getByRole('note').textContent).toContain('합성 모의 연결');
    const r = radios();
    expect(r).toHaveLength(5);
    expect(r.slice(0, 4).every(x => !(x as HTMLInputElement).disabled)).toBe(true);
    expect((r[4] as HTMLInputElement).disabled).toBe(true);
    expect(r[4]!.getAttribute('aria-label')).toContain('선택할 수 없음');
    expect(screen.getByRole('status').textContent).toBe('시연 대상을 선택해 주세요.');
  });

  it('shows loading, then the selected subject; switching drops the old subject even if it resolves late', async () => {
    const client = new ControlledClient();
    await setup(client);
    fireEvent.click(radios()[0]!);
    await flush();
    expect(screen.getByRole('status').textContent).toBe('선택한 학생의 정보를 불러오는 중');
    fireEvent.click(radios()[1]!);
    await flush();
    client.pending.get('S01')!.resolve(); // late S01 answer
    await flush();
    expect(screen.getByRole('status').textContent).toBe('선택한 학생의 정보를 불러오는 중');
    client.pending.get('S02')!.resolve();
    await flush();
    expect(screen.getByRole('status').textContent).toBe('시연 대상: 가상 학생 2 · 해외영업/무역 지망 4학년');
  });

  it('403 revoked: clears and asks for another subject, no retry button', async () => {
    const client = new ControlledClient();
    await setup(client);
    fireEvent.click(radios()[2]!);
    await flush();
    client.pending.get('S03')!.reject(new HufsApiError('SHARING_REVOKED', 403));
    await flush();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('공유 허용이 변경되었습니다.');
    expect(alert.textContent).toContain('이전 화면 정보는 지웠습니다');
    expect(within(alert).queryByRole('button')).toBeNull();
  });

  it('503 offers 다시 시도 which re-requests the same subject', async () => {
    const client = new ControlledClient();
    await setup(client);
    fireEvent.click(radios()[0]!);
    await flush();
    client.pending.get('S01')!.reject(new HufsApiError('PROVIDER_UNAVAILABLE', 503));
    await flush();
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', {name: '다시 시도'}));
    await flush();
    expect(screen.getByRole('status').textContent).toBe('선택한 학생의 정보를 불러오는 중');
    client.pending.get('S01')!.resolve();
    await flush();
    expect(screen.getByRole('status').textContent).toBe('시연 대상: 가상 학생 1 · 데이터/AI 지망 3학년');
  });

  it('401 shows a top-level Google sign-in link, not a fetch', async () => {
    const client = new ControlledClient();
    await setup(client);
    fireEvent.click(radios()[0]!);
    await flush();
    client.pending.get('S01')!.reject(new HufsApiError('UNAUTHENTICATED', 401));
    await flush();
    const link = within(screen.getByRole('alert')).getByRole('link', {name: 'Google로 다시 로그인'});
    expect(link.getAttribute('href')).toBe('/api/auth/google/start?intent=BETA');
  });

  it('bottom tabs navigate in-app, mark the current tab, and move focus to the heading', async () => {
    const {history} = await setup();
    const nav = screen.getByRole('navigation', {name: '주요 메뉴'});
    expect(within(nav).getAllByRole('link').map(a => a.textContent)).toEqual(['오늘', '기회', '경험', '졸업', '보관함']);
    fireEvent.click(within(nav).getByRole('link', {name: '졸업'}));
    await flush();
    expect(history.paths.at(-1)).toBe('/graduation');
    expect(within(nav).getByRole('link', {name: '졸업'}).getAttribute('aria-current')).toBe('page');
    const h1 = screen.getByRole('heading', {level: 1});
    expect(h1.textContent).toBe('졸업');
    expect(document.activeElement).toBe(h1);
    expect(document.title).toBe('졸업 · HUFS One AI');
  });

  it('unknown paths show a not-found page', async () => {
    await setup(undefined, '/nope');
    expect(screen.getByRole('heading', {level: 1}).textContent).toBe('페이지를 찾을 수 없습니다');
  });

  it('a session close from another tab clears this tab', async () => {
    const {controller} = await setup();
    fireEvent.click(radios()[0]!);
    await flush();
    await act(async () => { controller.invalidateLocalSession(); });
    expect(screen.getByRole('alert').textContent).toContain('화면의 정보는 모두 지웠습니다');
  });
});
