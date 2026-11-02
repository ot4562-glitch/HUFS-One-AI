// @vitest-environment jsdom
import {StrictMode} from 'react';
import {afterEach, describe, expect, it} from 'vitest';
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {HufsApiError} from '../../integrations/api-client.js';
import {DemoController} from '../../app/index.js';
import {SyntheticDemoClient} from '../../dev/syntheticDemoClient.js';
import {syntheticDemoProfilePort} from '../../dev/syntheticDemoProfile.js';
import {App} from '../../App.js';
import {appPages} from '../../pages/index.js';
import type {HistoryPort} from '../../shell/router.js';
import {DemoProfileSettings} from './DemoProfileSettings.js';
import {BLANK_PROFILE, draftOf, isBlank, missingFields, validateDraft, type DemoProfilePort, type ProfileDraft} from './demoProfile.js';

afterEach(cleanup);
const flush = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise(r => setTimeout(r, 0)); });
const port0 = () => syntheticDemoProfilePort({delayMs: 0});
const filled: ProfileDraft = {primaryMajor: '가상통계학과', credits: '95.5', interestTopics: ['DATA_ANALYTICS'], doubleMajorKind: 'NONE', doubleMajor: ''};

describe('#132 profile model', () => {
  it('starts blank: nothing set, every field reported as needing setup', () => {
    expect(isBlank(BLANK_PROFILE)).toBe(true);
    expect(missingFields(BLANK_PROFILE)).toEqual(['주전공', '취득 학점', '관심 분야', '이중전공 여부']);
    expect(draftOf(BLANK_PROFILE)).toEqual({primaryMajor: '', credits: '', interestTopics: [], doubleMajorKind: '', doubleMajor: ''});
  });

  it('requires all four inputs; empty credits is not 0, and 0 is accepted', () => {
    const r = validateDraft({...filled, primaryMajor: ' ', credits: '', interestTopics: [], doubleMajorKind: ''});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['credits', 'doubleMajorKind', 'interestTopics', 'primaryMajor']);
    const zero = validateDraft({...filled, credits: '0'});
    expect(zero.ok && zero.value.earnedCreditUnits).toBe(0);
  });

  it('credits: 0.5 steps, no negatives/garbage, at most 250; stored as units (×2)', () => {
    for (const bad of ['-1', 'abc', '1e2', '10.3', '251', '12,5']) expect(validateDraft({...filled, credits: bad}).ok, bad).toBe(false);
    const ok = validateDraft(filled);
    expect(ok.ok && ok.value.earnedCreditUnits).toBe(191);
  });

  it('double major: NONE needs no department, DOUBLE requires one', () => {
    expect(validateDraft({...filled, doubleMajorKind: 'NONE', doubleMajor: 'ignored'})).toMatchObject({ok: true, value: {doubleMajor: {kind: 'NONE'}}});
    expect(validateDraft({...filled, doubleMajorKind: 'DOUBLE', doubleMajor: ''}).ok).toBe(false);
    expect(validateDraft({...filled, doubleMajorKind: 'DOUBLE', doubleMajor: '가상경영학과'})).toMatchObject({ok: true, value: {doubleMajor: {kind: 'DOUBLE', major: '가상경영학과'}}});
  });
});

async function openForm<P extends DemoProfilePort>(port: P): Promise<P> {
  render(<DemoProfileSettings port={port} />);
  await flush();
  return port;
}
function fill(d: Partial<ProfileDraft> = {}) {
  const v = {...filled, ...d};
  fireEvent.change(screen.getByLabelText(/^주전공/), {target: {value: v.primaryMajor}});
  fireEvent.change(screen.getByLabelText(/^취득 학점/), {target: {value: v.credits}});
  for (const t of v.interestTopics) fireEvent.click(screen.getByRole('checkbox', {name: t === 'DATA_ANALYTICS' ? '데이터 분석' : 'AI·머신러닝'}));
  if (v.doubleMajorKind) fireEvent.click(within(screen.getByRole('group', {name: /이중전공/})).getByRole('radio', {name: v.doubleMajorKind === 'NONE' ? '없음' : '있음'}));
  if (v.doubleMajorKind === 'DOUBLE') fireEvent.change(screen.getByLabelText(/^이중전공 학과/), {target: {value: v.doubleMajor}});
}

describe('#132 blank demo account settings', () => {
  it('first visit shows empty fields and "설정 필요", labelled as synthetic and separate from team/S01–S05', async () => {
    await openForm(port0());
    expect(screen.getByText(/아직 아무것도 설정하지 않았어요/)).toBeTruthy();
    expect((screen.getByLabelText(/^주전공/) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/^취득 학점/) as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('note').textContent).toMatch(/S01~S05와 분리된.*빈 시연 계정.*합성 시연 전용/);
    expect(screen.getByRole('note').textContent).toContain('성적(평점)이나 공식 이수 확인이 아닙니다');
  });

  it('saving with missing input shows field errors tied to the inputs and sends nothing', async () => {
    const p = await openForm(port0());
    fireEvent.click(screen.getByRole('button', {name: '저장'}));
    await flush();
    expect(p.current.version).toBe(1);
    const major = screen.getByLabelText(/^주전공/);
    expect(major.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(major.getAttribute('aria-describedby')!)!.textContent).toBe('주전공을 입력해 주세요.');
    expect(screen.getByText(/없으면 0을 입력합니다/)).toBeTruthy();
  });

  it('save → server record shown; double major branch; cancel restores the saved values', async () => {
    const p = await openForm(port0());
    fill({doubleMajorKind: 'DOUBLE', doubleMajor: '가상경영학과'});
    fireEvent.click(screen.getByRole('button', {name: '저장'}));
    await flush();
    expect(p.current.value).toEqual({primaryMajor: '가상통계학과', earnedCreditUnits: 191, interestTopics: ['DATA_ANALYTICS'], doubleMajor: {kind: 'DOUBLE', major: '가상경영학과'}});
    expect(screen.getAllByRole('status').map(s => s.textContent).join(' ')).toContain('저장된 설정 · 주전공 가상통계학과 · 취득 95.5학점');
    fireEvent.change(screen.getByLabelText(/^주전공/), {target: {value: '바꾼 값'}});
    fireEvent.click(screen.getByRole('button', {name: '취소'}));
    expect((screen.getByLabelText(/^주전공/) as HTMLInputElement).value).toBe('가상통계학과');
  });

  it('reset asks first, then returns this account to blank', async () => {
    const p = await openForm(port0());
    fill();
    fireEvent.click(screen.getByRole('button', {name: '저장'}));
    await flush();
    fireEvent.click(screen.getByRole('button', {name: '시연 계정 초기화'}));
    expect(screen.getByRole('alert').textContent).toContain('S01~S05는 바뀌지 않습니다');
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', {name: '초기화'}));
    await flush();
    expect(isBlank(p.current.value)).toBe(true);
    expect((screen.getByLabelText(/^주전공/) as HTMLInputElement).value).toBe('');
    expect(screen.getByText(/아직 아무것도 설정하지 않았어요/)).toBeTruthy();
  });

  it('409 from another tab keeps the typed input and offers to reload; never overwrites silently', async () => {
    const p = port0();
    await openForm(p);
    await p.save(1, {...BLANK_PROFILE, primaryMajor: '다른 탭'}, new AbortController().signal); // another tab saves first
    fill();
    fireEvent.click(screen.getByRole('button', {name: '저장'}));
    await flush();
    expect(p.current.value.primaryMajor).toBe('다른 탭');
    expect(screen.getByText(/다른 탭에서 먼저 바뀌었어요/)).toBeTruthy();
    expect((screen.getByLabelText(/^주전공/) as HTMLInputElement).value).toBe('가상통계학과');
    fireEvent.click(screen.getByRole('button', {name: '최신 설정 불러오기'}));
    await flush();
    expect((screen.getByLabelText(/^주전공/) as HTMLInputElement).value).toBe('다른 탭');
  });

  it.each([['UNAUTHENTICATED', 401, false], ['FORBIDDEN', 403, false], ['PROVIDER_UNAVAILABLE', 503, true]] as const)(
    '%s on load shows no profile data (retry: %s)', async (code, status, retry) => {
      await openForm({get: async () => { throw new HufsApiError(code, status); }, save: async () => ({}), reset: async () => ({})});
      expect(screen.getByRole('alert')).toBeTruthy();
      expect(screen.queryByLabelText(/^주전공/)).toBeNull();
      expect(!!screen.queryByRole('button', {name: '다시 불러오기'})).toBe(retry);
    });

  it('a malformed server record is not shown', async () => {
    await openForm({get: async () => ({version: 1, value: {primaryMajor: 1}, updatedAt: 'x'}), save: async () => ({}), reset: async () => ({})});
    expect(screen.getByRole('alert').textContent).toContain('표시하지 않았습니다');
  });

  it('StrictMode + late responses: a load that settles after unmount changes nothing', async () => {
    let resolveLate!: (v: unknown) => void;
    const signals: AbortSignal[] = [];
    const port: DemoProfilePort = {
      get: s => { signals.push(s); return new Promise(r => { resolveLate = r; }); },
      save: async () => ({}), reset: async () => ({}),
    };
    const {unmount} = render(<StrictMode><DemoProfileSettings port={port} /></StrictMode>);
    await flush();
    unmount();
    expect(signals.every(s => s.aborted)).toBe(true);
    resolveLate({version: 9, value: {...BLANK_PROFILE, primaryMajor: '늦은 응답'}, updatedAt: '2026-11-20T00:00:00.000Z'});
    await flush();
    expect(document.body.textContent).toBe('');
  });
});

describe('#132 settings entry next to the account switcher', () => {
  it('설정 sits beside the demo subject switcher and opens the profile without choosing a subject', async () => {
    const history: HistoryPort = {location: {pathname: '/'}, history: {pushState: (_s, _t, u) => { history.location.pathname = String(u); }},
      addEventListener: () => {}, removeEventListener: () => {}} as HistoryPort & {location: {pathname: string}};
    render(<App controller={new DemoController(new SyntheticDemoClient({delayMs: 0}), 'RUN')} historyPort={history}
      pages={appPages} services={{demoProfile: port0()}} />);
    await flush();
    const account = document.querySelector('.app__account')!;
    expect(account.querySelector('details.selector')).toBeTruthy();
    const link = within(account as HTMLElement).getByRole('link', {name: '설정'});
    fireEvent.click(link);
    await flush();
    expect(screen.getByRole('heading', {level: 1}).textContent).toBe('설정');
    expect(screen.getByRole('heading', {level: 2, name: '시연 계정 설정'})).toBeTruthy();
    expect(screen.getByText(/아직 아무것도 설정하지 않았어요/)).toBeTruthy();
  });
});
