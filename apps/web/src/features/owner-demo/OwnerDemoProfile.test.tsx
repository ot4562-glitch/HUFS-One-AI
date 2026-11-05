// @vitest-environment jsdom
import {StrictMode} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {blankDemoProfileValue, type DemoProfileValue} from '@hufs-one/contracts';
import {OwnerSessionController} from '../../app/owner-session-controller.js';
import {HufsApiError} from '../../integrations/api-error.js';
import {recomputeDemoProfile} from '../../../../api/src/modules/profiles/demo-profile.js';
import {OwnerDemoProfile, type OwnerDemoProfilePort} from './OwnerDemoProfile.js';

const now = '2026-11-03T00:00:00.000Z';
const actor = {actorId: 'SYN-OWNER-A', role: 'BETA' as const,
  schoolMailProofValid: true as const, betaAllowed: true as const};
const output = (version: number, value: DemoProfileValue) =>
  recomputeDemoProfile({version, value, updatedAt: version === 0 ? null : now});
function fixture() {
  let identity: unknown = actor;
  let record = output(0, blankDemoProfileValue());
  const getSession = vi.fn(async () => identity);
  const session = new OwnerSessionController({getSession});
  const port: OwnerDemoProfilePort = {
    session,
    read: vi.fn(async () => record),
    save: vi.fn(async input => {
      if (input.expectedVersion !== record.profile.version)
        throw new HufsApiError('VERSION_CONFLICT', 409);
      record = output(input.expectedVersion + 1, input.value);
      return record;
    }),
    reset: vi.fn(async input => {
      if (input.expectedVersion !== record.profile.version)
        throw new HufsApiError('VERSION_CONFLICT', 409);
      record = output(input.expectedVersion + 1, blankDemoProfileValue());
      return record;
    }),
  };
  return {port, setIdentity: (v: unknown) => { identity = v; }, getSession};
}
afterEach(cleanup);

describe('#132 independent EMPTY_DEMO BETA browser UI', () => {
  it('renders blank, saves a real 0 (not missing), recomputes, and CAS-resets all fields', async () => {
    const f = fixture();
    render(<StrictMode><OwnerDemoProfile port={f.port} /></StrictMode>);
    await screen.findByText(/프로필 버전 0/);
    expect(screen.getByText(/EMPTY_DEMO 합성 계정/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('주전공'), {target: {value: '가상 정보학'}});
    fireEvent.change(screen.getByLabelText(/취득 학점/), {target: {value: '0'}});
    const topics = within(screen.getByRole('group', {name: '관심 분야 (1~5개)'})).getAllByRole('checkbox');
    fireEvent.click(topics[0]!);
    fireEvent.change(screen.getByLabelText('이중전공 상태'), {target: {value: 'NONE'}});
    fireEvent.click(screen.getByRole('button', {name: '프로필 저장·재계산'}));
    await waitFor(() => expect(f.port.save).toHaveBeenCalledTimes(1));
    await screen.findByText(/프로필 버전 1/);
    expect(f.port.save).toHaveBeenCalledWith(expect.objectContaining({
      expectedVersion: 0, value: expect.objectContaining({earnedCreditUnits: 0, doubleMajor: {kind: 'NONE'}}),
    }), expect.any(AbortSignal));
    fireEvent.click(screen.getByRole('button', {name: '설정·보관함 전체 초기화'}));
    expect(f.port.reset).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('button',{name:'취소',exact:true}));
    fireEvent.keyDown(screen.getByRole('group',{name:'프로필 초기화 확인'}),{key:'Escape'});
    expect(f.port.reset).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('button',{name:'설정·보관함 전체 초기화'}));
    fireEvent.click(screen.getByRole('button',{name:'설정·보관함 전체 초기화'}));
    fireEvent.click(screen.getByRole('button', {name: '초기화 확인'}));
    await waitFor(() => expect(f.port.reset).toHaveBeenCalledTimes(1));
    await screen.findByText(/프로필 버전 2/);
    expect(f.port.reset).toHaveBeenCalledWith({expectedVersion: 1}, expect.any(AbortSignal));
    expect((screen.getByLabelText('주전공') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/취득 학점/) as HTMLInputElement).value).toBe('');
  });
  it('requires all four settings and never promotes blank student facts', async () => {
    const f = fixture(); render(<OwnerDemoProfile port={f.port} />);
    await screen.findByText(/프로필 버전 0/);
    expect((screen.getByRole('button', {name: '프로필 저장·재계산'}) as HTMLButtonElement).disabled).toBe(true);
    expect(f.port.save).not.toHaveBeenCalled();
    expect(screen.getByText(/학업·개설 전망: 근거 부족/)).toBeTruthy();
  });
  it('drops all previously loaded data on owner identity swap, even during an in-flight read', async () => {
    const f = fixture();
    let finish!: (value: ReturnType<typeof output>) => void;
    const delayed = new Promise<ReturnType<typeof output>>(resolve => { finish = resolve; });
    const read = vi.fn(async () => delayed);
    const port = {...f.port, read};
    render(<OwnerDemoProfile port={port} />);
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    f.setIdentity({...actor, actorId: 'SYN-OWNER-B'});
    await act(async () => { await f.port.session.revalidate(); });
    await act(async () => { finish(output(1, {...blankDemoProfileValue(),
      primaryMajor: 'SHOULD_NOT_LEAK'})); await delayed; });
    expect(screen.queryByText('SHOULD_NOT_LEAK')).toBeNull();
    expect(screen.getByRole('alert').textContent).toMatch(/다른 학생의 이전 설정은 표시하지/);
    expect(port.session.getState().status).not.toBe('READY');
  });
  it('fails closed on a missing live PG provider without showing old synthetic data', async () => {
    const f = fixture();
    const port = {...f.port, read: vi.fn(async () => {
      throw new HufsApiError('PROVIDER_UNAVAILABLE', 503);
    })};
    render(<OwnerDemoProfile port={port} />);
    await screen.findByRole('alert');
    expect(screen.queryByText(/프로필 버전/)).toBeNull();
    expect(port.session.getState().status).toBe('UNAVAILABLE');
  });
});
