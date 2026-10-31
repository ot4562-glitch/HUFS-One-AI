import {endOfSeoulDay} from '../notices/notice.js';

export type DeadlineTextResult =
  | {kind:'DATETIME'; iso:string}
  | {kind:'ROLLING'; raw:string}   // 상시채용 · 채용 시 마감 · 수시: no fixed deadline, never a guessed date
  | {kind:'UNKNOWN'; raw:string};

const ROLLING = /^(상시(채용|모집)?|채용\s*시\s*마감|수시(채용|모집)?|충원\s*시\s*마감)$/u;

/**
 * HUFSAbility list text ("마감일시"/"마감기한") → ISO with +09:00, or ROLLING / UNKNOWN.
 * Accepts 2026-11-25, 2026.11.25, 2026/11/25 (end of Seoul day) and an optional HH:mm.
 * Event periods (행사기간) must NOT be passed here: they are not application deadlines.
 */
export function parseDeadlineText(raw:string):DeadlineTextResult {
  const text = raw.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (ROLLING.test(text.replace(/\s/gu, '')) || ROLLING.test(text)) return {kind:'ROLLING', raw};
  const m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})\.?(?:\s*\(?[월화수목금토일]\)?)?(?:\s+(\d{1,2}):(\d{2}))?(?:\s*까지)?$/u.exec(text);
  if (!m) return {kind:'UNKNOWN', raw};
  const date = `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`;
  let end:string;
  try { end = endOfSeoulDay(date); } catch { return {kind:'UNKNOWN', raw}; }
  if (m[4] === undefined) return {kind:'DATETIME', iso:end};
  const hh = Number(m[4]), mm = Number(m[5]);
  if (hh > 23 || mm > 59) return {kind:'UNKNOWN', raw};
  return {kind:'DATETIME', iso:`${date}T${String(hh).padStart(2, '0')}:${m[5]}:00+09:00`};
}
