import {byCodeUnit} from '../normalization/dedupe.js';
import type {ComposedNotices, Notice} from '../notices/notice.js';
import type {ComposedFeed} from './feed.js';
import type {RankedOpportunity} from './rank.js';

/**
 * "내 주요 일정" mini calendar: confirmed dates only, from the student's own notices and recommended /
 * saved opportunities. Pure and deterministic; no clock, network or randomness.
 * - Student deadlines and confirmed apply deadlines are DEADLINE entries; exam / event sessions are EVENT
 *   entries and are never presented as deadlines.
 * - Admin report deadlines are never shown (not a student task). Unconfirmed / rolling dates are listed
 *   in `undated` instead of being placed on a day.
 * - Only notices that are shown as important (not GENERAL, not review-pending, scope not NO) and
 *   opportunities visible in the feed (or explicitly saved and still visible) are included.
 */
export type CalendarImportance = 'CRITICAL'|'REQUIRED'|'PERSONAL'|'RECOMMENDED'|'SAVED';
export type CalendarEntryKind = 'STUDENT_DEADLINE'|'APPLY_DEADLINE'|'EVENT';

export interface CalendarEntry {
  /** Stable id: `${source}:${refId}:${kind}:${n}` (no personal data). */
  id:string;
  source:'NOTICE'|'OPPORTUNITY';
  refId:string;
  title:string;
  kind:CalendarEntryKind;
  importance:CalendarImportance;
  /** Exact instant (ISO, as given by the source). */
  at:string;
  /** Event end, when known. */
  end?:string;
  /** Asia/Seoul calendar day of `at`, YYYY-MM-DD (Korea has no DST). */
  seoulDate:string;
  /** A deadline at or before asOf. Events in the past are not returned. */
  overdue:boolean;
  evidenceRefs:string[];
}

export interface UndatedItem {
  source:'NOTICE'|'OPPORTUNITY';
  refId:string;
  title:string;
  reason:'ROLLING'|'DEADLINE_UNKNOWN';
  importance:CalendarImportance;
}

export interface CalendarOptions {
  asOf:string;
  /** Days ahead to include (default 60). */
  daysAhead?:number;
  /** Days back for overdue deadlines still needing action (default 7). Past events are dropped. */
  overdueDays?:number;
  /** Opportunity ids the student saved; only included while still visible in the feed. */
  savedOpportunityIds?:readonly string[];
}

export interface CalendarResult {
  asOf:string;
  from:string;
  to:string;
  entries:CalendarEntry[];
  undated:UndatedItem[];
}

const DAY_MS = 86_400_000;
const IMPORTANCE_RANK:Record<CalendarImportance, number> = {CRITICAL:0, REQUIRED:1, PERSONAL:2, RECOMMENDED:3, SAVED:4};

export function seoulDate(iso:string):string {
  const d = new Date(Date.parse(iso) + 9 * 3_600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function buildCalendar(
  feed:Pick<ComposedFeed, 'feed'|'all'>, notices:ComposedNotices, noticeInputs:readonly Notice[], options:CalendarOptions,
):CalendarResult {
  const now = Date.parse(options.asOf);
  if (!Number.isFinite(now)) throw new RangeError('asOf must be an ISO datetime');
  const ahead = options.daysAhead ?? 60, back = options.overdueDays ?? 7;
  if (!Number.isInteger(ahead) || ahead < 0 || !Number.isInteger(back) || back < 0) throw new RangeError('day ranges must be non-negative integers');
  const from = now - back * DAY_MS, to = now + ahead * DAY_MS;
  const entries:CalendarEntry[] = [];
  const undated:UndatedItem[] = [];

  const push = (e:Omit<CalendarEntry, 'id'|'seoulDate'|'overdue'>, n:number) => {
    const t = Date.parse(e.at);
    if (!Number.isFinite(t)) return;
    const isDeadline = e.kind !== 'EVENT';
    const overdue = isDeadline && t <= now;
    // Past events and deadlines older than the overdue window are not shown; nothing beyond `to`.
    if (t > to || (isDeadline ? t < from : Date.parse(e.end ?? e.at) < now)) return;
    entries.push({...e, id:`${e.source}:${e.refId}:${e.kind}:${n}`, seoulDate:seoulDate(e.at), overdue});
  };

  // Notices: only those shown as important to this student.
  const inputById = new Map(noticeInputs.map(n => [n.id, n]));
  for (const ev of notices.evaluations) {
    if (ev.appliesTo === 'NO' || ev.reviewPending || ev.priority === 'GENERAL') continue;
    const n = inputById.get(ev.noticeId);
    if (!n) continue;
    const importance:CalendarImportance = ev.priority === 'CRITICAL_DUE' ? 'CRITICAL' : ev.priority === 'ACADEMIC_REQUIRED' ? 'REQUIRED' : 'PERSONAL';
    const base = {source:'NOTICE' as const, refId:n.id, title:n.title, importance, evidenceRefs:[...n.evidenceRefs]};
    if (n.studentDeadline !== undefined) push({...base, kind:'STUDENT_DEADLINE', at:n.studentDeadline}, 0);
    (n.eventSessions ?? []).forEach((s, i) => push({...base, kind:'EVENT', at:s.start, ...(s.end === undefined ? {} : {end:s.end})}, i));
    if (n.studentDeadline === undefined && (n.eventSessions ?? []).length === 0) {
      undated.push({source:'NOTICE', refId:n.id, title:n.title, reason:'DEADLINE_UNKNOWN', importance});
    }
  }

  // Opportunities: shown cards (recommended) plus saved ones that are still visible.
  const shown = new Set([...feed.feed.featured, ...feed.feed.compact].map(c => c.opportunityId));
  const saved = new Set(options.savedOpportunityIds ?? []);
  for (const r of feed.all as readonly RankedOpportunity[]) {
    const id = r.opportunity.id;
    const importance:CalendarImportance|undefined = saved.has(id) ? 'SAVED' : shown.has(id) && r.relevant ? 'RECOMMENDED' : undefined;
    if (!importance) continue;
    const base = {source:'OPPORTUNITY' as const, refId:id, title:r.opportunity.title, importance, evidenceRefs:[...r.evaluation.evidenceRefs]};
    if (r.evaluation.deadline !== undefined) push({...base, kind:'APPLY_DEADLINE', at:r.evaluation.deadline}, 0);
    // deadlineKind arrives with contracts #47; read it structurally so this works before and after.
    else undated.push({source:'OPPORTUNITY', refId:id, title:r.opportunity.title, reason:(r.opportunity as {deadlineKind?:string}).deadlineKind === 'ROLLING' ? 'ROLLING' : 'DEADLINE_UNKNOWN', importance});
    r.opportunity.eventSessions.forEach((s, i) => push({...base, kind:'EVENT', at:s.start, end:s.end}, i));
  }

  entries.sort((a, b) => (Date.parse(a.at) - Date.parse(b.at)) || (IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance]) || byCodeUnit(a.id, b.id));
  undated.sort((a, b) => (IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance]) || byCodeUnit(`${a.source}:${a.refId}`, `${b.source}:${b.refId}`));
  return {asOf:options.asOf, from:new Date(from).toISOString(), to:new Date(to).toISOString(), entries, undated};
}
