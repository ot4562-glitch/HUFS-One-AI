/**
 * #79 D-day next to an existing deadline. Pure: the reference time is always the server asOf
 * (synthetic demo time), never the browser clock. Only for a confirmed, still-open deadline:
 * a past deadline keeps its existing wording ("기한 경과 · 담당부서 확인"), no D+N.
 */
export interface DDayView {
  /** Visible short form: "D-4" or "오늘 마감". */
  readonly text: string;
  /** Screen-reader form: "4일 남음" or "오늘 마감". */
  readonly spoken: string;
  /** Whole Seoul calendar days left (0 = today), for counting "마감 임박" without re-parsing text. */
  readonly days: number;
}

const DAY_MS = 86_400_000;
const SEOUL_OFFSET_MS = 9 * 3_600_000;

/** Days since epoch of the Seoul calendar date containing `ms` (Korea has no DST). */
function seoulDayNumber(ms: number): number {
  return Math.floor((ms + SEOUL_OFFSET_MS) / DAY_MS);
}

export function ddayOf(deadlineIso: string, asOfIso: string): DDayView | null {
  const at = Date.parse(deadlineIso);
  const asOf = Date.parse(asOfIso);
  if (!Number.isFinite(at) || !Number.isFinite(asOf) || at <= asOf) return null;
  const days = seoulDayNumber(at) - seoulDayNumber(asOf);
  if (days === 0) return {text: '오늘 마감', spoken: '오늘 마감', days};
  return {text: `D-${days}`, spoken: `${days}일 남음`, days};
}
