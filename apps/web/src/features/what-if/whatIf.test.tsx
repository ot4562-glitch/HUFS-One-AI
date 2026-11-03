// @vitest-environment jsdom
import {afterEach, describe, expect, it} from 'vitest';
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import type {DemoContext} from '@hufs-one/contracts';
import {DemoController} from '../../app/index.js';
import {HufsApiError} from '../../integrations/api-client.js';
import {SyntheticDemoClient} from '../../dev/syntheticDemoClient.js';
import {syntheticWhatIfPort} from '../../dev/syntheticWhatIf.js';
import {App} from '../../App.js';
import {appPages} from '../../pages/index.js';
import type {HistoryPort} from '../../shell/router.js';
import {buildWhatIfView, type Scenario} from './whatIfView.js';
import type {WhatIfPort} from './WhatIfPanel.js';

afterEach(cleanup);
const AS_OF = '2026-11-20T00:00:00.000Z';
const flush = () => act(async () => { for (let i = 0; i < 8; i++) await new Promise(r => setTimeout(r, 0)); });
const port0 = syntheticWhatIfPort({delayMs: 0});
const S01 = {demoSubjectId: 'S01'} as DemoContext;
const STAT: Scenario = {action: 'CHANGE_DOUBLE_MAJOR', targetMajorId: 'SYN-MAJ-STAT'};
const run = (s: Scenario) => port0.check(S01, s, new AbortController().signal);

describe('#82 what-if view model', () => {
  it('READY: same earned credits, remaining before/after, new requirements first, every row in words', async () => {
    const r = buildWhatIfView(await run(STAT), {scenario: STAT, asOf: AS_OF, targetLabel: '가상 통계학'});
    if (!r.ok || r.view.kind !== 'READY') throw new Error('expected READY');
    expect(r.view).toMatchObject({title: '가상 통계학(으)로 이중전공을 바꾸면', earned: '95학점', remainingBefore: '35학점', remainingAfter: '47학점'});
    expect(r.view.rows.map(x => [x.id, x.badge.text])).toEqual([
      ['SYN-STAT-CORE', '새로 생기는 요건'], ['SYN-DM-MAJOR-MIN', '없어지는 요건'], ['SYN-STAT-METHODS', '새 요건 · 이미 충족'],
      ['SYN-REQ-TOTAL', '그대로'], ['SYN-REQ-MAJOR-CORE', '그대로'],
    ]);
    expect(r.view.rows[0]).toMatchObject({before: '해당 없음', after: '12학점 부족'});
    expect(r.view.rows[1]).toMatchObject({before: '충족', after: '해당 없음'});
    expect(r.view.caveat).toContain('공식 졸업 판정도 아닙니다');
  });

  it('BLOCKED_DEPENDENCY lists every blocker in words and invents no figures', async () => {
    const biz: Scenario = {action: 'CHANGE_DOUBLE_MAJOR', targetMajorId: 'SYN-MAJ-BIZ'};
    const r = buildWhatIfView(await run(biz), {scenario: biz, asOf: AS_OF, targetLabel: '가상 경영학'});
    expect(r).toMatchObject({ok: true, view: {kind: 'BLOCKED', blockers: [
      '가정한 전공의 졸업 규칙이 검수되지 않았습니다.', '과목 중복 인정 기준이 확인되지 않았습니다.',
    ]}});
    expect(JSON.stringify(r)).not.toMatch(/학점/);
  });

  it('rejects a response for another scenario or asOf, and malformed wires', async () => {
    const raw = await run(STAT);
    expect(buildWhatIfView(raw, {scenario: {action: 'CHANGE_DOUBLE_MAJOR', targetMajorId: 'SYN-MAJ-BIZ'}, asOf: AS_OF, targetLabel: null}).ok).toBe(false);
    expect(buildWhatIfView(raw, {scenario: {action: 'REMOVE_DOUBLE_MAJOR'}, asOf: AS_OF, targetLabel: null}).ok).toBe(false);
    expect(buildWhatIfView(raw, {scenario: STAT, asOf: '2026-11-21T00:00:00.000Z', targetLabel: null}).ok).toBe(false);
    expect(buildWhatIfView({state: 'READY'}, {scenario: STAT, asOf: AS_OF, targetLabel: null}).ok).toBe(false);
  });
});

function history(start: string): HistoryPort {
  const port = {location: {pathname: start}, history: {pushState: (_s: unknown, _t: string, u?: string | URL | null) => { port.location.pathname = String(u); }},
    addEventListener: () => {}, removeEventListener: () => {}};
  return port;
}
async function open(path: string, i: number, whatIf: WhatIfPort) {
  render(<App controller={new DemoController(new SyntheticDemoClient({delayMs: 0}), 'RUN')} historyPort={history(path)}
    pages={appPages} services={{whatIf}} />);
  await flush();
  fireEvent.click(within(screen.getByRole('group', {name: /시연 대상 선택/})).getAllByRole('radio')[i]!);
  await flush();
}
const panel = () => screen.queryByRole('region', {name: '전공을 바꾸면? 가정 분석'});
const submit = async () => { fireEvent.click(within(panel()!).getByRole('button', {name: '가정 분석하기'})); await flush(); };

describe('#82 /graduation/what-if', () => {
  it('reached from 졸업; nothing runs until asked; READY result is a labelled table marked as an example', async () => {
    let calls = 0;
    const counting: WhatIfPort = {...port0, check: (c, s, sig) => { calls++; return port0.check(c, s, sig); }};
    await open('/graduation', 0, counting);
    fireEvent.click(screen.getByRole('link', {name: '전공을 바꾸면? 가정 분석해 보기'}));
    await flush();
    expect(screen.getByRole('heading', {level: 1}).textContent).toBe('전공 가정 분석');
    expect(within(panel()!).getByRole('note').textContent).toContain('가정 분석입니다');
    expect(calls).toBe(0);
    await submit();
    expect(calls).toBe(1);
    const p = panel()!;
    expect(within(p).getByRole('heading', {level: 3}).textContent).toBe('가상 통계학(으)로 이중전공을 바꾸면합성 예시');
    const row = within(p).getAllByRole('row').find(r => r.getAttribute('aria-label')?.startsWith('SYN-STAT-CORE'))!;
    expect(row.getAttribute('aria-label')).toBe('SYN-STAT-CORE: 새로 생기는 요건. 지금 해당 없음, 가정 12학점 부족');
  });

  it('removing needs no target; editing the form clears the old result; blocked answers show reasons only', async () => {
    await open('/graduation/what-if', 0, port0);
    await submit();
    expect(within(panel()!).getByRole('table')).toBeTruthy();
    fireEvent.change(within(panel()!).getByLabelText('가정'), {target: {value: 'REMOVE_DOUBLE_MAJOR'}});
    expect(within(panel()!).queryByLabelText('가정할 전공')).toBeNull();
    expect(within(panel()!).queryByRole('table')).toBeNull();
    await submit();
    expect(within(panel()!).getByText(/이중전공을 그만두면: 지금은 분석할 수 없습니다/)).toBeTruthy();
    expect(within(panel()!).getByText('가정 분석 계산 기능이 아직 준비되지 않았습니다.')).toBeTruthy();
  });

  it('a student whose academics are not shown gets no form and no request', async () => {
    let calls = 0;
    await open('/graduation/what-if', 2, {programs: [], check: async () => { calls++; return null; }});
    expect(panel()).toBeNull();
    expect(screen.getByText('이 항목은 시연 공유 범위 밖입니다.')).toBeTruthy();
    expect(calls).toBe(0);
  });

  it('409/503 stay in the panel; 403 clears the screen; a late answer for the previous student never shows', async () => {
    await open('/graduation/what-if', 0, {...port0, check: async () => { throw new HufsApiError('VERSION_CONFLICT', 409); }});
    await submit();
    expect(within(panel()!).getByText(/현재 학업 정보가 바뀌었습니다/)).toBeTruthy();
    cleanup();
    await open('/graduation/what-if', 0, {...port0, check: async () => { throw new HufsApiError('PROVIDER_UNAVAILABLE', 503); }});
    await submit();
    expect(within(panel()!).getByText(/지금은 가정 분석을 사용할 수 없습니다/)).toBeTruthy();
    cleanup();
    await open('/graduation/what-if', 0, {...port0, check: async () => { throw new HufsApiError('SHARING_REVOKED', 403); }});
    await submit();
    expect(screen.getByRole('alert').textContent).toContain('공유 허용이 변경되었습니다.');
    expect(panel()).toBeNull();
    cleanup();
    const pending: ((v: unknown) => void)[] = [];
    await open('/graduation/what-if', 0, {...port0, check: () => new Promise(resolve => pending.push(resolve))});
    await submit();
    fireEvent.click(within(screen.getByRole('group', {name: /시연 대상 선택/})).getAllByRole('radio')[1]!);
    await flush();
    pending[0]!(await run(STAT));
    await flush();
    expect(screen.queryByText(/SYN-STAT-CORE/)).toBeNull();
  });
});
