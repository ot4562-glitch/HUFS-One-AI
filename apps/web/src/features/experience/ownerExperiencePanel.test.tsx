// @vitest-environment jsdom
import {afterEach, describe, expect, it, vi} from 'vitest';
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {OwnerSessionController} from '../../app/owner-session-controller.js';
import {HufsApiError} from '../../integrations/api-error.js';
import {syntheticExperienceSkillPort} from '../../dev/syntheticExperienceSkills.js';
import {OwnerExperiencePanel} from './OwnerExperiencePanel.js';
import type {ExperienceSkillPort} from './experienceSkillPort.js';

afterEach(cleanup);
const flush = async () => { for (let n = 0; n < 3; n++) await act(async () => { for (let i = 0; i < 6; i++) await new Promise(r => setTimeout(r, 0)); }); };
const beta = (actorId = 'SYN-OWNER-A') => ({actorId, role: 'BETA', schoolMailProofValid: true, betaAllowed: true});
const article = () => screen.getByRole('article', {name: /데이터 분석 동아리/});

describe('#258 independent owner experience review', () => {
  it('requires no S01–S05 selection, creates local user evidence and deletes only after confirmation', async () => {
    const skills = syntheticExperienceSkillPort();
    const session = new OwnerSessionController({getSession: async () => beta()});
    render(<OwnerExperiencePanel port={{session, skills}} />);
    await flush();
    expect(screen.queryByRole('radio')).toBeNull();
    fireEvent.change(screen.getByLabelText('새 경험 제목'), {target: {value: '나만의 합성 경험'}});
    fireEvent.change(screen.getByLabelText('내가 한 일 (최대 500자)'), {target: {value: '혼자 문제를 풀어 보았습니다.'}});
    fireEvent.click(screen.getByRole('button', {name: '내 경험 기록'}));
    await flush();
    const created = screen.getByRole('article', {name: /나만의 합성 경험/});
    expect(within(created).getByText(/이 화면에서 확인된 AI 후보가 없습니다/)).toBeTruthy();
    fireEvent.click(within(created).getByRole('button', {name: '경험 삭제'}));
    fireEvent.click(within(created).getByRole('button', {name: '삭제 취소'}));
    expect(document.activeElement).toBe(within(created).getByRole('button', {name: '경험 삭제'}));
    expect(screen.getByRole('article', {name: /나만의 합성 경험/})).toBeTruthy();
    fireEvent.click(within(created).getByRole('button', {name: '경험 삭제'}));
    fireEvent.click(within(created).getByRole('button', {name: '삭제 확인'}));
    await flush();
    expect(screen.queryByRole('article', {name: /나만의 합성 경험/})).toBeNull();
  });

  it('permits an explicit manual topic correction without treating a candidate or course as a credential', async () => {
    const skills = syntheticExperienceSkillPort();
    const approve = vi.spyOn(skills, 'approve');
    const session = new OwnerSessionController({getSession: async () => beta()});
    render(<OwnerExperiencePanel port={{session, skills}} />);
    await flush();
    fireEvent.click(within(article()).getByRole('checkbox', {name: '다른 관심 주제 직접 고르기'}));
    fireEvent.click(within(article()).getByRole('checkbox', {name: 'AI·머신러닝'}));
    fireEvent.click(within(article()).getByRole('button', {name: '선택한 주제 승인'}));
    await flush();
    expect(approve.mock.calls[0]?.[1]).toEqual({expectedApprovalVersion: 0, expectedContentVersion: 2,
      expectedConsentVersion: 3, topics: ['AI_ML']});
    expect(within(article()).getByText(/역량 증명·자격·채용 적격 판정이 아닙니다/)).toBeTruthy();
    expect(screen.getByText(/미공유 학사 자료는 ‘공유하지 않음’/)).toBeTruthy();
  });

  it('does not request candidates until selection and explicit analysis confirmation', async () => {
    const skills = syntheticExperienceSkillPort(), request = vi.spyOn(skills, 'requestCandidates');
    const session = new OwnerSessionController({getSession: async () => beta()});
    render(<OwnerExperiencePanel port={{session, skills}} />);
    await flush();
    expect(request).not.toHaveBeenCalled();
    const group = screen.getByRole('group', {name: 'AI 후보를 확인할 내 경험 선택 (최대 16개)'});
    fireEvent.click(within(group).getByRole('checkbox', {name: /데이터 분석 동아리/}));
    expect((screen.getByRole('button', {name: '선택한 경험 AI 후보 요청'}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(group).getByRole('checkbox', {name: /선택한 경험의 AI 후보 분석을 요청합니다/}));
    fireEvent.click(screen.getByRole('button', {name: '선택한 경험 AI 후보 요청'}));
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toContain('검토할 후보 1개');
  });

  it('cannot submit a removed selection as an empty analysis batch after re-reading', async () => {
    const skills = syntheticExperienceSkillPort(), request = vi.spyOn(skills, 'requestCandidates');
    const session = new OwnerSessionController({getSession: async () => beta()});
    render(<OwnerExperiencePanel port={{session, skills}} />);
    await flush();
    const group = screen.getByRole('group', {name: 'AI 후보를 확인할 내 경험 선택 (최대 16개)'});
    fireEvent.click(within(group).getByRole('checkbox', {name: /데이터 분석 동아리/}));
    fireEvent.click(within(group).getByRole('checkbox', {name: /선택한 경험의 AI 후보 분석을 요청합니다/}));
    fireEvent.click(within(article()).getByRole('button', {name: '경험 삭제'}));
    fireEvent.click(within(article()).getByRole('button', {name: '삭제 확인'}));
    await flush();
    expect((screen.getByRole('button', {name: '선택한 경험 AI 후보 요청'}) as HTMLButtonElement).disabled).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it.each([['UNAUTHENTICATED', 401], ['FORBIDDEN', 403]] as const)('clears all private display on %s', async (code, status) => {
    const skills = {...syntheticExperienceSkillPort(), load: async () => { throw new HufsApiError(code, status); }};
    const session = new OwnerSessionController({getSession: async () => beta()});
    render(<OwnerExperiencePanel port={{session, skills}} />);
    await flush();
    expect(screen.queryByRole('article')).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('이전 경험과 AI 후보를 비웠습니다');
  });

  it('drops a late owner A response after the cookie session changes to B', async () => {
    const base = syntheticExperienceSkillPort();
    let actor = 'SYN-OWNER-A';
    let resolve!: (raw: unknown) => void;
    const skills: ExperienceSkillPort = {...base, load: () => new Promise(done => { resolve = done; })};
    const session = new OwnerSessionController({getSession: async () => beta(actor)});
    render(<OwnerExperiencePanel port={{session, skills}} />);
    await flush();
    actor = 'SYN-OWNER-B';
    await act(async () => { resolve(await base.load(new AbortController().signal)); });
    await flush();
    expect(session.getState().status).toBe('SIGNED_OUT');
    expect(screen.queryByRole('article')).toBeNull();
  });

  it('refuses a non-BETA session before loading any portfolio', async () => {
    const skills = syntheticExperienceSkillPort(), load = vi.spyOn(skills, 'load');
    const session = new OwnerSessionController({getSession: async () => ({...beta(), role: 'ADMIN'})});
    render(<OwnerExperiencePanel port={{session, skills}} />);
    await flush();
    expect(load).not.toHaveBeenCalled();
    expect(session.getState().status).toBe('FORBIDDEN');
  });
});
