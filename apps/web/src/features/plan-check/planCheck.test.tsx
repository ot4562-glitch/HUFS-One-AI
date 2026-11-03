// @vitest-environment jsdom
import {afterEach, describe, expect, it} from 'vitest';
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {OwnerStudyPlanCheckResponseSchema, type DemoContext} from '@hufs-one/contracts';
import {DemoController} from '../../app/index.js';
import {HufsApiError} from '../../integrations/api-client.js';
import {SyntheticDemoClient} from '../../dev/syntheticDemoClient.js';
import {syntheticPlanCheckPort} from '../../dev/syntheticPlanCheck.js';
import {App} from '../../App.js';
import {appPages} from '../../pages/index.js';
import type {HistoryPort} from '../../shell/router.js';
import {buildPlanCheckView} from './planCheckView.js';
import type {PlanCheckPort} from './PlanCheckPanel.js';

afterEach(cleanup);
const AS_OF = '2026-11-20T00:00:00.000Z';
const flush = () => act(async () => { for (let i = 0; i < 8; i++) await new Promise(r => setTimeout(r, 0)); });
const port0 = syntheticPlanCheckPort({delayMs: 0});
const S01 = {demoSubjectId: 'S01'} as DemoContext;
const sample = () => port0.check(S01, '2027-1', new AbortController().signal) as Promise<Record<string, unknown>>;

/** A schema-valid response with an approved receipt, to show what a confirmed warning looks like. */
const approved = () => OwnerStudyPlanCheckResponseSchema.parse({
  state: 'NEEDS_REVIEW', asOf: AS_OF, term: '2027-1',
  versions: {plan: 'SYN-PLAN-1', rulePack: 'SYN-RULE-1', catalog: 'SYN-CAT-1', transcript: 'SYN-TR-1'},
  termLoadCreditUnits: 44, creditCapUnits: 42,
  planIssues: [
    {code: 'NEEDS_REVIEW', courseRefs: [], evidenceRefs: []},
    {code: 'CREDIT_CAP_EXCEEDED', courseRefs: [], evidenceRefs: ['EV-SYN-CAP'], reasonCode: 'EXCEEDS_APPROVED_LIMIT'},
  ],
  unchecked: [], evidenceLinks: [{evidenceRef: 'EV-SYN-CAP', href: 'https://example.org/rule', verifiedAt: AS_OF}],
  caveats: ['NOT_OFFICIAL_REGISTRATION', 'NOT_GRADUATION_DECISION'],
  disclosure: {mode: 'REDACTED', visibleCourseRefs: []},
  approval: {rulePackState: 'APPROVED', rulePackVersion: 'SYN-RULE-1', officialEvidenceRefs: ['EV-SYN-CAP'],
    verifiedAt: AS_OF, sourceRightsVersion: 'SYN-R-1', consentVersion: 'SYN-C-1', coreVersion: 'SYN-CORE-1'},
});

describe('#81 plan check view model', () => {
  it('unreviewed rules: no cap shown, finding is 검토 필요, unchecked course and caveats in words', async () => {
    const r = buildPlanCheckView(await sample(), {term: '2027-1', asOf: AS_OF});
    if (!r.ok) throw new Error('expected a view');
    expect(r.view).toMatchObject({term: '2027년 1학기', stateText: '검토가 필요한 결과', loadText: '이 학기 계획 18학점', capText: null});
    expect(r.view.issues).toEqual([expect.objectContaining({badge: {text: '검토 필요', icon: '?'}, courses: 'SYN-C-STAT201'})]);
    expect(r.view.issues[0]!.text).toContain('개설 미확인');
    expect(r.view.unchecked).toEqual(['SYN-C-ML301 · 학점 확인 불가']);
    expect(r.view.caveats).toEqual(expect.arrayContaining(['실제 수강신청이 아닙니다.', '공식 졸업 판정이 아닙니다.']));
  });

  it('with an approved receipt the cap appears and the confirmed warning comes first; redacted courses stay hidden', () => {
    const r = buildPlanCheckView(approved(), {term: '2027-1', asOf: AS_OF});
    if (!r.ok) throw new Error();
    expect(r.view.capText).toBe('승인된 최대 21학점');
    expect(r.view.issues.map(i => i.badge.text)).toEqual(['확인됨', '검토 필요']);
    expect(r.view.redactedText).toContain('과목명을 표시하지 않습니다');
  });

  it('rejects another term or asOf, and anything the contract refuses (an unverified cap)', async () => {
    const raw = await sample();
    expect(buildPlanCheckView(raw, {term: '2027-2', asOf: AS_OF}).ok).toBe(false);
    expect(buildPlanCheckView(raw, {term: '2027-1', asOf: '2026-11-21T00:00:00.000Z'}).ok).toBe(false);
    expect(buildPlanCheckView({...raw, creditCapUnits: 42}, {term: '2027-1', asOf: AS_OF}).ok).toBe(false);
  });
});

const history = (): HistoryPort => ({location: {pathname: '/graduation'}, history: {pushState: () => {}}, addEventListener: () => {}, removeEventListener: () => {}});
async function open(i: number, planCheck: PlanCheckPort) {
  render(<App controller={new DemoController(new SyntheticDemoClient({delayMs: 0}), 'RUN')} historyPort={history()}
    pages={appPages} services={{planCheck}} />);
  await flush();
  fireEvent.click(within(screen.getByRole('group', {name: /시연 대상 선택/})).getAllByRole('radio')[i]!);
  await flush();
}
const panel = () => screen.queryByRole('region', {name: '수강계획 검사'});

describe('#81 수강계획 검사 next to 졸업 요건 현황', () => {
  it('S01: both sections in one pair, result for the chosen term, switching term asks again', async () => {
    await open(0, port0);
    const p = panel()!;
    expect(p.closest('.grad-pair')!.contains(screen.getByRole('region', {name: '졸업 요건 현황'}))).toBe(true);
    expect(within(p).getByRole('status').textContent).toBe('2027년 1학기 · 검토가 필요한 결과');
    expect(within(p).getByText(/최대 학점은 규칙 검수 전이라 표시하지 않습니다/)).toBeTruthy();
    fireEvent.change(within(p).getByLabelText('검사할 학기'), {target: {value: '2027-2'}});
    await flush();
    expect(within(p).getByText('이 학기에 저장된 수강계획이 없습니다.')).toBeTruthy();
  });

  it('a student whose academics are not shown gets no plan section and no request', async () => {
    let calls = 0;
    await open(2, {terms: ['2027-1'], check: async () => { calls++; return null; }});
    expect(panel()).toBeNull();
    expect(calls).toBe(0);
  });

  it('409 stays in the panel with a retry; 503 says the check is not available; neither clears the screen', async () => {
    let n = 0;
    await open(0, {terms: ['2027-1'], check: async (ctx, term, signal) => {
      if (n++ === 0) throw new HufsApiError('VERSION_CONFLICT', 409);
      return port0.check(ctx, term, signal);
    }});
    expect(within(panel()!).getByText(/그 사이 계획이 바뀌었습니다/)).toBeTruthy();
    fireEvent.click(within(panel()!).getByRole('button', {name: '다시 검사'}));
    await flush();
    expect(within(panel()!).getByRole('status').textContent).toContain('2027년 1학기');
    cleanup();
    await open(0, {terms: ['2027-1'], check: async () => { throw new HufsApiError('PROVIDER_UNAVAILABLE', 503); }});
    expect(within(panel()!).getByRole('status').textContent).toContain('지금은 계획 검사를 사용할 수 없습니다');
    expect(screen.getByRole('region', {name: '졸업 요건 현황'})).toBeTruthy();
  });

  it('403 clears the screen; a late result for the previous student never appears', async () => {
    await open(0, {terms: ['2027-1'], check: async () => { throw new HufsApiError('SHARING_REVOKED', 403); }});
    expect(screen.getByRole('alert').textContent).toContain('공유 허용이 변경되었습니다.');
    expect(panel()).toBeNull();
    cleanup();
    const pending: ((v: unknown) => void)[] = [];
    await open(0, {terms: ['2027-1'], check: () => new Promise(resolve => pending.push(resolve))});
    fireEvent.click(within(screen.getByRole('group', {name: /시연 대상 선택/})).getAllByRole('radio')[1]!);
    await flush();
    pending[0]!(await sample());
    await flush();
    expect(screen.queryByText(/SYN-C-STAT201/)).toBeNull();
  });
});
