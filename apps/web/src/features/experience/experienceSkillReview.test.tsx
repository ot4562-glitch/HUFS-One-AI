// @vitest-environment jsdom
import {afterEach, describe, expect, it} from 'vitest';
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {DemoController} from '../../app/index.js';
import {HufsApiError} from '../../integrations/api-error.js';
import {SyntheticDemoClient} from '../../dev/syntheticDemoClient.js';
import {syntheticExperienceSkillPort} from '../../dev/syntheticExperienceSkills.js';
import {approvalInput, buildExperienceReviewView} from './skillReviewView.js';
import {ExperienceSkillReview, type ExperienceSkillPort} from './ExperienceSkillReview.js';

afterEach(cleanup);
// Several act() rounds: a write settles, then the re-read effect only starts once act flushes the state update.
const flush = async () => { for (let n = 0; n < 3; n++) await act(async () => { for (let i = 0; i < 8; i++) await new Promise(r => setTimeout(r, 0)); }); };
const signal = () => new AbortController().signal;

async function setup(port: ExperienceSkillPort) {
  const controller = new DemoController(new SyntheticDemoClient({delayMs: 0}), 'RUN');
  await controller.select('S01');
  const view = render(<ExperienceSkillReview state={controller.getState()} controller={controller} port={port} />);
  await flush();
  const refresh = async () => { view.rerender(<ExperienceSkillReview state={controller.getState()} controller={controller} port={port} />); await flush(); };
  return {controller, refresh};
}
const card = (title: RegExp) => screen.getByRole('article', {name: title});

describe('#258 experience review view model', () => {
  it('keeps evidence, NEEDS_REVIEW candidate and ACTIVE approval as three separate stages', async () => {
    const r = buildExperienceReviewView(await syntheticExperienceSkillPort().load(signal()));
    if (!r.ok) throw new Error('expected view');
    const [a, b, c] = r.view.cards;
    expect(a).toMatchObject({synthetic: true, versionText: '내용 2판 · 동의 3판', approval: {kind: 'INACTIVE', canApprove: true}});
    expect(a!.candidate.kind === 'READY' && a!.candidate.topics.map(t => [t.label, t.quotes.length])).toEqual([['데이터 분석', 1], ['미디어·콘텐츠', 1]]);
    expect(a!.options.every(o => !o.approved)).toBe(true);
    expect(b).toMatchObject({candidate: {kind: 'NONE'}, approval: {kind: 'ACTIVE', topics: [{label: '통번역·언어서비스'}]}});
    // candidate for content v3 while the card is v4: never offered as a suggestion
    expect(c).toMatchObject({candidate: {kind: 'STALE'}, approval: {kind: 'INACTIVE'}, options: []});
  });

  it('treats an ACTIVE approval for another content or consent version as not current', async () => {
    const page = await syntheticExperienceSkillPort().load(signal()) as {consentVersion: number};
    const r = buildExperienceReviewView({...page, consentVersion: 4});
    if (!r.ok) throw new Error('expected view');
    expect(r.view.cards[1]!.approval).toMatchObject({kind: 'INACTIVE', text: expect.stringContaining('다시 확인')});
    expect(r.view.cards[0]!.candidate.kind).toBe('STALE');
  });

  it('rejects malformed pages and only sends 1–5 offered topics with the shown versions', async () => {
    expect(buildExperienceReviewView({items: []}).ok).toBe(false);
    const r = buildExperienceReviewView(await syntheticExperienceSkillPort().load(signal()));
    if (!r.ok) throw new Error();
    const a = r.view.cards[0]!;
    expect(approvalInput(a, [])).toBeNull();
    expect(approvalInput(a, ['MEDIA_CONTENT', 'AI_ML', 'DATA_ANALYTICS'])).toEqual({
      expectedApprovalVersion: 0, expectedContentVersion: 2, expectedConsentVersion: 3, topics: ['DATA_ANALYTICS', 'MEDIA_CONTENT'],
    });
  });
});

describe('#258 experience review screen', () => {
  it('labels stages for assistive tech and says approval is not a credential or school record link', async () => {
    await setup(syntheticExperienceSkillPort());
    const a = card(/데이터 분석 동아리/);
    expect(within(a).getByRole('region', {name: '2단계 AI 후보, 검토 필요'})).toBeTruthy();
    expect(within(a).getByText(/승인하기 전에는 추천에 쓰이지 않습니다/)).toBeTruthy();
    expect(within(a).getByText(/역량 증명·자격·채용 적격 판정이 아닙니다/)).toBeTruthy();
    expect(screen.getByText(/학교 시스템의 경험 기록과 연결된 화면이 아닙니다/)).toBeTruthy();
    expect(within(card(/스타트업/)).queryByRole('group')).toBeNull();
  });

  it('approves ticked topics, re-reads, then revokes; the button stays disabled with nothing ticked', async () => {
    const port = syntheticExperienceSkillPort();
    await setup(port);
    const a = () => card(/데이터 분석 동아리/);
    const approve = () => within(a()).getByRole('button', {name: '선택한 주제 승인'}) as HTMLButtonElement;
    expect(approve().disabled).toBe(true);
    fireEvent.click(within(a()).getByRole('checkbox', {name: '데이터 분석'}));
    fireEvent.click(approve());
    await flush();
    expect(screen.getByRole('status').textContent).toContain('주제를 승인했습니다');
    expect(within(a()).getByRole('region', {name: '3단계 내가 승인한 주제'}).querySelector('strong')?.textContent).toBe('데이터 분석');
    fireEvent.click(within(a()).getByRole('button', {name: '승인 취소'}));
    await flush();
    expect(within(a()).getByText('승인을 취소했습니다.')).toBeTruthy();
    expect(port.calls).toEqual(['load', 'approve:SYN-EXP-01', 'load', 'revoke:SYN-EXP-01', 'load']);
  });

  it('409 from another tab: nothing saved, alert shown, latest versions re-read', async () => {
    const base = syntheticExperienceSkillPort();
    const port: ExperienceSkillPort = {...base, approve: async () => { throw new HufsApiError('VERSION_CONFLICT', 409); }};
    await setup(port);
    fireEvent.click(within(card(/데이터 분석 동아리/)).getByRole('checkbox', {name: '데이터 분석'}));
    fireEvent.click(within(card(/데이터 분석 동아리/)).getByRole('button', {name: '선택한 주제 승인'}));
    await flush();
    expect(screen.getByRole('alert').textContent).toContain('다른 탭이나 기기에서 먼저 바뀌어');
    expect(within(card(/데이터 분석 동아리/)).getByText('아직 승인한 주제가 없습니다.')).toBeTruthy();
  });

  it('503 keeps the screen and says nothing changed', async () => {
    const port: ExperienceSkillPort = {...syntheticExperienceSkillPort(), revoke: async () => { throw new HufsApiError('PROVIDER_UNAVAILABLE', 503); }};
    await setup(port);
    fireEvent.click(within(card(/통번역/)).getByRole('button', {name: '승인 취소'}));
    await flush();
    expect(screen.getByRole('alert').textContent).toBe('지금은 저장할 수 없습니다. 바뀐 것은 없습니다.');
  });

  it('a 403 on load is handed to the controller and the section is not shown', async () => {
    const {controller, refresh} = await setup({...syntheticExperienceSkillPort(), load: async () => { throw new HufsApiError('SHARING_REVOKED', 403); }});
    await refresh();
    expect(controller.getState().status).not.toBe('READY');
    expect(screen.queryByRole('heading', {name: '경험에서 고른 관심 주제'})).toBeNull();
  });

  it('a late page for the previous student never appears after switching', async () => {
    const pending: ((v: unknown) => void)[] = [];
    const base = syntheticExperienceSkillPort();
    const {controller, refresh} = await setup({...base, load: () => new Promise(resolve => pending.push(resolve))});
    expect(screen.getByText('경험 기록을 불러오는 중')).toBeTruthy();
    await act(async () => { await controller.select('S02'); });
    await refresh();
    pending[0]!(await base.load(signal()));
    await flush();
    expect(screen.queryByRole('article')).toBeNull();
  });
});
