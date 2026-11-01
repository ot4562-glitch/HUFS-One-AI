// @vitest-environment jsdom
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
