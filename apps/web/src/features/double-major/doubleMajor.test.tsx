// @vitest-environment jsdom
import {afterEach, describe, expect, it} from 'vitest';
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import type {DemoContext} from '@hufs-one/contracts';
import {DemoController} from '../../app/index.js';
import {HufsApiError} from '../../integrations/api-client.js';
import {SyntheticDemoClient} from '../../dev/syntheticDemoClient.js';
import {syntheticDoubleMajorPort, type DoubleMajorCase} from '../../dev/syntheticDoubleMajor.js';
import {App} from '../../App.js';
import {appPages} from '../../pages/index.js';
import type {HistoryPort} from '../../shell/router.js';
import {buildDoubleMajorView} from './doubleMajorView.js';
import type {DoubleMajorPort} from './DoubleMajorPanel.js';

afterEach(cleanup);
const AS_OF = '2026-11-20T00:00:00.000Z';
const flush = () => act(async () => { for (let i = 0; i < 8; i++) await new Promise(r => setTimeout(r, 0)); });
const S01 = {demoSubjectId: 'S01'} as DemoContext;
const raw = (c: DoubleMajorCase) => syntheticDoubleMajorPort({delayMs: 0, forceCase: c}).forContext(S01, AS_OF, new AbortController().signal);
const view = async (c: DoubleMajorCase) => {
  const r = buildDoubleMajorView(await raw(c), {asOf: AS_OF});
  if (!r.ok) throw new Error('expected a view');
  return r.view;
};

describe('#144 double-major view model', () => {
  it('a shared course without an approved overlap rule holds the dependent row as 확인 필요 and says what it costs', async () => {
    const v = await view('SHARED_UNDECIDED');
    expect(v.selectionText).toBe('이중전공: 선택함');
    expect(v.uniqueCredits.map(c => c.credits)).toEqual(['95학점', '18학점', '12학점']); // = S01 졸업 요건 현황
    expect(v.primary.rulePackText).toBe('적용 규칙 SYN-RULE-DEMO-1');
    expect(v.primary.rows.find(r => r.id === 'SYN-REQ-MAJOR-CORE')!.creditsText).toBe('취득 21학점 / 필요 24학점 · 3학점 남음');
    const held = v.doubleMajor!.rows.find(r => r.id === 'SYN-DM-MAJOR-MIN')!;
    expect(held.badge.text).toBe('확인 필요');
    expect(held.heldText).toMatch(/중복 인정 기준이 확인되지 않아 보류.*3학점이 더 필요합니다/);
    expect(v.overlapText).toMatch(/함께 쓰인 과목 1개\(3학점\).*"확인 필요"로 보류/);
    expect(JSON.stringify(v)).not.toMatch(/충족함|졸업 가능|졸업 확정/);
  });

  it('an approved overlap rule settles the shared course; nothing is held', async () => {
    const v = await view('COVERED');
    expect(v.doubleMajor!.rows.every(r => r.heldText === null)).toBe(true);
    expect(v.doubleMajor!.rows.find(r => r.id === 'SYN-DM-MAJOR-MIN')!.badge.text).toBe('충족');
    expect(v.overlapText).toContain('승인된 중복 인정 기준 안');
  });

  it('NONE, UNSET and missing rules are three different messages and never show a second column', async () => {
    const none = await view('NONE'), unset = await view('UNSET'), missing = await view('RULES_MISSING');
    expect([none.selectionText, unset.selectionText, missing.selectionText]).toEqual(['이중전공: 해당 없음', '이중전공: 입력 필요', '이중전공: 선택함']);
    for (const v of [none, unset, missing]) { expect(v.doubleMajor).toBeNull(); expect(v.overlapText).toBeNull(); }
    expect(new Set([none.doubleMajorNote, unset.doubleMajorNote, missing.doubleMajorNote]).size).toBe(3);
    expect(unset.doubleMajorNote).toContain('계정 설정에서 입력');
    expect(missing.doubleMajorNote).toContain('요건 규칙이 아직 준비되지 않아');
  });

  it('rejects another asOf, totals that disagree between the majors, and malformed wires', async () => {
    const r = await raw('SHARED_UNDECIDED') as Record<string, unknown>;
    expect(buildDoubleMajorView(r, {asOf: '2026-11-21T00:00:00.000Z'}).ok).toBe(false);
    expect(buildDoubleMajorView({...r, uniqueCredits: {...(r.uniqueCredits as object), earnedCreditUnits: 1}}, {asOf: AS_OF}).ok).toBe(false);
    expect(buildDoubleMajorView({...r, doubleMajor: {status: 'CHECKED'}}, {asOf: AS_OF}).ok).toBe(false);
    expect(buildDoubleMajorView({...r, doubleMajor: {status: 'MAYBE'}}, {asOf: AS_OF}).ok).toBe(false);
    expect(buildDoubleMajorView(null, {asOf: AS_OF}).ok).toBe(false);
  });

  it('malformed row impacts and held rows are {ok:false}, never a thrown render (review P2)', async () => {
    const r = await raw('SHARED_UNDECIDED') as Record<string, unknown>;
    const ov = r.overlap as {rowImpacts: {primary: unknown[]; doubleMajor: Record<string, unknown>[]}; heldRequirementIds: {primary: string[]; doubleMajor: string[]}};
    const good = ov.rowImpacts.doubleMajor[0]!;
    const withImpacts = (doubleMajor: unknown, primary: unknown = ov.rowImpacts.primary) =>
      ({...r, overlap: {...ov, rowImpacts: {primary, doubleMajor}}});
    const withHeld = (doubleMajor: unknown) => ({...r, overlap: {...ov, heldRequirementIds: {...ov.heldRequirementIds, doubleMajor}}});
    const bad: unknown[] = [
      withImpacts([null]), withImpacts([null], [null]), withImpacts([[]]), withImpacts(null),
      withImpacts([{...good, requirementId: null}]), withImpacts([{...good, requirementId: ' '}]),
      withImpacts([{...good, decided: 'yes'}]), withImpacts([{...good, extra: 1}]),
      withImpacts([{...good, remainingCreditUnitsWithoutShared: -3}]), withImpacts([{...good, remainingCreditUnitsWithoutShared: 1.5}]),
      withImpacts([{...good, remainingCreditUnitsWithoutShared: Number.MAX_SAFE_INTEGER + 2}]),
      withImpacts([good, good]), withImpacts([{...good, requirementId: 'SYN-DM-NOT-A-ROW'}]),
      withImpacts([{...good, decided: true}]), // the held row would no longer match an undecided impact
      withHeld([null]), withHeld('SYN-DM-MAJOR-MIN'), withHeld([...ov.heldRequirementIds.doubleMajor, 'SYN-DM-REQ']),
      {...r, overlap: {...ov, status: 'COVERED_BY_APPROVED_RULE'}}, {...r, overlap: {...ov, extra: true}},
      {...r, overlap: null}, {...r, doubleMajor: {status: 'NOT_APPLICABLE'}},
    ];
    for (const b of bad) expect(() => buildDoubleMajorView(b, {asOf: AS_OF})).not.toThrow();
    expect(bad.map(b => buildDoubleMajorView(b, {asOf: AS_OF}).ok)).toEqual(bad.map(() => false));
    expect(buildDoubleMajorView(r, {asOf: AS_OF}).ok).toBe(true);
  });
});

const history = (): HistoryPort => ({location: {pathname: '/graduation'}, history: {pushState: () => {}}, addEventListener: () => {}, removeEventListener: () => {}});
async function open(i: number, doubleMajor: DoubleMajorPort) {
  render(<App controller={new DemoController(new SyntheticDemoClient({delayMs: 0}), 'RUN')} historyPort={history()}
    pages={appPages} services={{doubleMajor}} />);
  await flush();
  fireEvent.click(within(screen.getByRole('group', {name: /시연 대상 선택/})).getAllByRole('radio')[i]!);
  await flush();
}
const region = () => screen.queryByRole('region', {name: '주전공 · 이중전공 요건'});

describe('#144 주전공 · 이중전공 on the 졸업 page', () => {
  it('S01: both majors as labelled lists, held row announced with its reason', async () => {
    await open(0, syntheticDoubleMajorPort({delayMs: 0}));
    const r = region()!;
    expect(within(r).getByRole('status').textContent).toBe('이중전공: 선택함');
    expect(within(r).getByRole('list', {name: '주전공 요건'})).toBeTruthy();
    const dm = within(r).getByRole('list', {name: '이중전공 요건'});
    const held = within(dm).getAllByRole('listitem').find(li => li.getAttribute('aria-label')?.includes('SYN-DM-MAJOR-MIN'))!;
    expect(held.getAttribute('aria-label')).toMatch(/확인 필요.*보류/);
    expect(within(r).getByRole('note').textContent).toContain('공식 졸업 판정이 아닙니다');
  });

  it('a student whose academics are not shown gets no double-major section and no request', async () => {
    let calls = 0;
    await open(2, {forContext: async () => { calls++; return null; }});
    expect(screen.getAllByText('이 항목은 시연 공유 범위 밖입니다.').length).toBeGreaterThan(0);
    expect(region()).toBeNull();
    expect(calls).toBe(0);
  });

  it('a late result for the previous student never appears after switching', async () => {
    const pending: ((v: unknown) => void)[] = [];
    await open(0, {forContext: () => new Promise(resolve => pending.push(resolve))});
    expect(within(region()!).getByText('전공별 요건을 확인하는 중')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('group', {name: /시연 대상 선택/})).getAllByRole('radio')[1]!);
    await flush();
    pending[0]!(await raw('SHARED_UNDECIDED'));
    await flush();
    expect(region()).toBeNull();
    expect(screen.queryByText(/SYN-DM-MAJOR-MIN/)).toBeNull();
  });

  it('a 403 clears the screen like any context error', async () => {
    await open(0, {forContext: async () => { throw new HufsApiError('SHARING_REVOKED', 403); }});
    expect(screen.getByRole('alert').textContent).toContain('공유 허용이 변경되었습니다.');
    expect(region()).toBeNull();
  });
});
