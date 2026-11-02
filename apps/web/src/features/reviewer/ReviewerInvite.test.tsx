// @vitest-environment jsdom
import {StrictMode} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {HufsApiError} from '../../integrations/api-client.js';
import {ReviewerInvite} from './ReviewerInvite.js';
import {accessEndText, holdInviteCode, PUBLIC_ORIGIN, type InvitePort} from './invite.js';

afterEach(cleanup);
const flush = () => act(async () => { for (let i = 0; i < 4; i++) await new Promise(r => setTimeout(r, 0)); });
const CODE = 'A'.repeat(43);

function port(over: Partial<InvitePort> = {}): InvitePort & {redeemed: string[]} {
  const redeemed: string[] = [];
  return {
    redeemed,
    getSession: async () => ({role: 'REVIEWER'}),
    redeemReviewerInvite: async (code: string) => { redeemed.push(code); return {accessEndsAt: '2026-12-09T15:00:00.000Z', dataMode: 'SYNTHETIC'}; },
    ...over,
  };
}

describe('invite plumbing', () => {
  it('canonical origin is the punycode form of 외대.온라인.한국', () => {
    expect(PUBLIC_ORIGIN).toBe('https://xn--vk1b528a.xn--oi2b61z32a.xn--3e0b707e');
  });
  it('holder gives the code exactly once', () => {
    const h = holdInviteCode(CODE);
    expect(h.present).toBe(true);
    expect(h.take()).toBe(CODE);
    expect(h.take()).toBeNull();
    expect(h.present).toBe(false);
  });
  it('shows the server end time in KST', () => {
    expect(accessEndText('2026-12-09T15:00:00.000Z')).toBe('2026년 12월 10일 00:00(한국 시간)까지');
  });
});

describe('/reviewer/invite page', () => {
  it('without a code: asks to reopen the link and offers REVIEWER sign-in, no network', async () => {
    const p = port({getSession: vi.fn()});
    render(<ReviewerInvite port={p} holder={holdInviteCode(null)} />);
    await flush();
    expect(screen.getByText(/초대 코드가 없습니다/)).toBeTruthy();
    expect(screen.getByRole('link', {name: 'Google로 로그인'}).getAttribute('href')).toBe('/api/auth/google/start?intent=REVIEWER');
    expect(p.getSession).not.toHaveBeenCalled();
  });

  it('signed out: explains to reopen the link after Google sign-in and never redeems', async () => {
    const p = port({getSession: async () => { throw new HufsApiError('UNAUTHENTICATED', 401); }});
    render(<ReviewerInvite port={p} holder={holdInviteCode(CODE)} />);
    await flush();
    expect(screen.getByRole('alert').textContent).toContain('받은 초대 링크를 다시 열면');
    expect(p.redeemed).toEqual([]);
  });

  it('signed in: redeems only on an explicit click, once, then shows the synthetic access period', async () => {
    const p = port();
    render(<ReviewerInvite port={p} holder={holdInviteCode(CODE)} />);
    await flush();
    expect(p.redeemed).toEqual([]);
    expect(screen.getByText(/실제 학생 정보는 없습니다/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', {name: '초대 등록하기'}));
    await flush();
    expect(p.redeemed).toEqual([CODE]);
    expect(screen.getByRole('status').textContent).toContain('2026년 12월 10일 00:00(한국 시간)까지');
    expect(screen.getByRole('link', {name: '시연 시작하기'}).getAttribute('href')).toBe('/');
  });

  it('expired/revoked invite: explains, and does not offer to resend the same code', async () => {
    const p = port({redeemReviewerInvite: async () => { throw new HufsApiError('FORBIDDEN', 403); }});
    render(<ReviewerInvite port={p} holder={holdInviteCode(CODE)} />);
    await flush();
    fireEvent.click(screen.getByRole('button', {name: '초대 등록하기'}));
    await flush();
    expect(screen.getByRole('alert').textContent).toContain('만료되었거나 중단되었습니다');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('never renders the raw code anywhere on the page', async () => {
    render(<ReviewerInvite port={port()} holder={holdInviteCode(CODE)} />);
    await flush();
    fireEvent.click(screen.getByRole('button', {name: '초대 등록하기'}));
    await flush();
    expect(document.body.innerHTML).not.toContain(CODE);
  });
});

function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
  return {promise, resolve, reject};
}
type Session = {role: 'BETA' | 'REVIEWER'};
type Redeemed = {accessEndsAt: string; dataMode: 'SYNTHETIC'};

describe('/reviewer/invite lifecycle (late responses after cleanup)', () => {
  it('StrictMode: the first, cleaned-up getSession succeeding late does not overwrite the current result', async () => {
    const calls: {d: ReturnType<typeof deferred<Session>>; signal: AbortSignal | undefined}[] = [];
    const p = port({getSession: (signal?: AbortSignal) => { const d = deferred<Session>(); calls.push({d, signal}); return d.promise; }});
    render(<StrictMode><ReviewerInvite port={p} holder={holdInviteCode(CODE)} /></StrictMode>);
    await flush();
    expect(calls).toHaveLength(2);
    expect(calls[0]!.signal?.aborted).toBe(true);
    calls[1]!.d.reject(new HufsApiError('UNAUTHENTICATED', 401));
    await flush();
    calls[0]!.d.resolve({role: 'REVIEWER'}); // stale success
    await flush();
    expect(screen.getByRole('alert').textContent).toContain('먼저 Google로 로그인해 주세요');
    expect(screen.queryByRole('button', {name: '초대 등록하기'})).toBeNull();
  });

  it('a getSession for a replaced port that succeeds late does not show the redeem button', async () => {
    const old = deferred<Session>();
    const holder = holdInviteCode(CODE);
    const {rerender} = render(<ReviewerInvite port={port({getSession: () => old.promise})} holder={holder} />);
    await flush();
    rerender(<ReviewerInvite port={port({getSession: async () => { throw new HufsApiError('FORBIDDEN', 403); }})} holder={holder} />);
    await flush();
    old.resolve({role: 'REVIEWER'});
    await flush();
    expect(screen.getByRole('alert').textContent).toContain('만료되었거나 중단되었습니다');
    expect(screen.queryByRole('button', {name: '초대 등록하기'})).toBeNull();
  });

  it('getSession settling after unmount is ignored and its request is aborted', async () => {
    const d = deferred<Session>();
    let signal: AbortSignal | undefined;
    const {unmount} = render(<ReviewerInvite port={port({getSession: s => { signal = s; return d.promise; }})} holder={holdInviteCode(CODE)} />);
    await flush();
    unmount();
    expect(signal?.aborted).toBe(true);
    d.resolve({role: 'REVIEWER'});
    await flush();
    expect(document.body.textContent).toBe('');
  });

  it('redeem in flight: unmount aborts it, and its late success or failure changes nothing', async () => {
    for (const settle of ['resolve', 'reject'] as const) {
      const d = deferred<Redeemed>();
      let signal: AbortSignal | undefined;
      const calls: string[] = [];
      const p = port({redeemReviewerInvite: (c: string, s?: AbortSignal) => { calls.push(c); signal = s; return d.promise; }});
      const {unmount} = render(<ReviewerInvite port={p} holder={holdInviteCode(CODE)} />);
      await flush();
      fireEvent.click(screen.getByRole('button', {name: '초대 등록하기'}));
      expect(screen.getByRole('button', {name: '등록하는 중'})).toBeTruthy();
      unmount();
      expect(signal?.aborted).toBe(true);
      if (settle === 'resolve') d.resolve({accessEndsAt: '2026-12-09T15:00:00.000Z', dataMode: 'SYNTHETIC'});
      else d.reject(new HufsApiError('FORBIDDEN', 403));
      await flush();
      expect(document.body.textContent).toBe('');
      expect(calls).toEqual([CODE]); // one attempt only
    }
  });

  it('a 401 while redeeming shows the failure once and never resends the code', async () => {
    const p = port({redeemReviewerInvite: async (c: string) => { p.redeemed.push(c); throw new HufsApiError('UNAUTHENTICATED', 401); }});
    render(<ReviewerInvite port={p} holder={holdInviteCode(CODE)} />);
    await flush();
    fireEvent.click(screen.getByRole('button', {name: '초대 등록하기'}));
    await flush();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(p.redeemed).toEqual([CODE]);
  });
});
