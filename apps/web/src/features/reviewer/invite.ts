/**
 * REVIEWER invite plumbing for the UI. The raw code is captured by
 * consumeReviewerInviteFragment (integrations) in main.tsx before any network call,
 * then held here in memory for exactly one redeem. Never stored, logged or put in a URL.
 */

/** Canonical public origin (A14.1a). URL() yields the punycode form browsers report. */
export const PUBLIC_ORIGIN = new URL('https://외대.온라인.한국').origin;

export interface InviteCodeHolder {
  /** Returns the code once, then null forever. */
  take(): string | null;
  /** True while a code is held and not yet taken. */
  readonly present: boolean;
}

export function holdInviteCode(code: string | null): InviteCodeHolder {
  let held = code;
  return {
    take() { const c = held; held = null; return c; },
    get present() { return held !== null; },
  };
}

/** The subset of HufsApiClient the invite page needs (HufsApiClient satisfies it structurally). */
export interface InvitePort {
  getSession(signal?: AbortSignal): Promise<{readonly role: 'BETA' | 'ADMIN' | 'REVIEWER'}>;
  redeemReviewerInvite(code: string, signal?: AbortSignal): Promise<{readonly accessEndsAt: string; readonly dataMode: 'SYNTHETIC'}>;
}

const endFmt = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** Server UTC end time shown in KST (display only; the server's clock is authoritative). */
export function accessEndText(iso: string): string {
  return `${endFmt.format(Date.parse(iso))}(한국 시간)까지`;
}
