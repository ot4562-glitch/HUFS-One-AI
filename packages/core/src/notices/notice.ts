import {ISODateTimeSchema, NoticeResultSchema, type AcademicSummary, type NoticeResult, type TopicCode} from '@hufs-one/contracts';
import {byCodeUnit} from '../normalization/dedupe.js';
import {onlyKnownTopics} from '../normalization/topics.js';

type Priority = NoticeResult['items'][number]['priority'];
type AppliesTo = 'YES'|'NO'|'UNKNOWN';
type VerificationState = 'CANDIDATE'|'VERIFIED'|'NEEDS_REVIEW'|'REJECTED';
export type MajorRole = 'PRIMARY'|'DOUBLE'|'MINOR';

/**
 * A07.1 notice input. Core-local until promoted into @hufs-one/contracts by the integration owner.
 * Every scope field is optional: an absent field means the notice did not restrict it.
 * All datetimes must be ISO with an offset; use endOfSeoulDay() for "~까지" date-only deadlines.
 */
export interface Notice {
  id:string;
  sourceSnapshotId:string;
  title:string;
  issuer:string;
  category:'ACADEMIC'|'SCHOLARSHIP'|'EXCHANGE'|'CAREER'|'GENERAL';
  campus?:string;
  college?:string;
  majors?:readonly string[];
  /** e.g. "1전공자만" = ['PRIMARY'], "이중전공 포함·부전공 제외" = ['PRIMARY','DOUBLE']. */
  majorRoles?:readonly MajorRole[];
  /** Four-digit admission years (e.g. 2014), inclusive. */
  cohortRange?:{min?:number; max?:number};
  enrollmentStates?:readonly string[];
  /** e.g. ['FOREIGN'] for "외국인 학생만 해당". */
  admissionTypes?:readonly string[];
  /** Graduation terms the notice is for, e.g. ['2026-2']. */
  graduationTermScope?:readonly string[];
  /** Must be stable RulePack Requirement.id values (= AcademicSummary.deficits[].requirementId). */
  requirementRefs?:readonly string[];
  courseRefs?:readonly string[];
  topicCodes?:readonly TopicCode[];
  /** e.g. GPA / income conditions. Never auto-satisfied because GPA/income are not collected. */
  scholarshipConditions?:readonly string[];
  /** Deadline for the student's own submission. */
  studentDeadline?:string;
  /** Department → university report deadline. Never used as the student's deadline. */
  adminReportDeadline?:string;
  publishedAt?:string;
  validUntil?:string;
  /** Exam / session dates (e.g. 졸업시험). Events, never deadlines: they are not used for priority. */
  eventSessions?:readonly {start:string; end?:string}[];
  verificationState:VerificationState;
  evidenceRefs:readonly string[];
}

/** Verified student scope from the approved projection. Missing values give UNKNOWN. */
export interface NoticeStudent {
  campus?:string;
  college?:string;
  majors?:readonly {major:string; role:MajorRole}[];
  /** Four-digit admission year. Any other value is treated as unknown. */
  cohort?:number;
  enrollmentState?:string;
  admissionType?:string;
  /** Student's target graduation term, e.g. '2028-2' (self-reported unless verified below). */
  targetGraduationTerm?:string;
  /** True only when the academic track confirmed official graduation-candidate status for that term. */
  graduationTermVerified?:boolean;
  /**
   * Open requirement ids, e.g. from openRequirementIds(academicSummary).
   * `null` = academics not shared / PENDING — NOT the same as "no open requirement".
   */
  openRequirementIds:readonly string[]|null;
  /** Current / planned course ids relevant for 수강변경·대체과목 notices. */
  courseIds:readonly string[];
  interestTopics:readonly TopicCode[];
}

export interface NoticeLinks {requirementIds:string[]; courseIds:string[]; topicCodes:TopicCode[]}
export type ScopeField =
  | 'campus'|'college'|'majors'|'cohort'|'enrollmentState'|'admissionType'
  | 'graduationTerm'|'scholarshipConditions'|'academicStatus';

export interface NoticeEvaluation {
  noticeId:string;
  priority:Priority;
  appliesTo:AppliesTo;
  /** Scope fields that made appliesTo UNKNOWN (what the UI should ask to confirm). */
  unknownScope:ScopeField[];
  /** Student deadline passed (scope not NO): "해결 필요/담당부서 확인", sorted last in its tier, never pinned. */
  overdue:boolean;
  /** Would be ACADEMIC/PERSONAL but the notice is not VERIFIED: review queue, shown as GENERAL. */
  reviewPending:boolean;
  links:NoticeLinks;
  studentDeadline?:string;
  adminReportDeadline?:string;
}

export type NoticeExclusionReason = 'REJECTED'|'EXPIRED'|'FUTURE_PUBLICATION'|'INVALID_DATETIME'|'INVALID_COHORT';
export interface NoticeExclusion {noticeId:string; reason:NoticeExclusionReason}

export const CRITICAL_DUE_DAYS = 7;
export const PINNED_MAX = 2;
const DAY_MS = 86_400_000;
const isCohort = (n:unknown):n is number => Number.isInteger(n) && (n as number) >= 1900 && (n as number) <= 2100;

function time(iso:string|undefined):number|undefined {
  if (iso === undefined) return undefined;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : undefined;
}

/** "~까지 2026-11-25" → 2026-11-25T23:59:59+09:00 (Seoul end of day). Rejects impossible dates. */
export function endOfSeoulDay(date:string):string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);
  const d = m ? new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!)) : undefined;
  if (!m || !d || d.getUTCFullYear() !== +m[1]! || d.getUTCMonth() !== +m[2]! - 1 || d.getUTCDate() !== +m[3]!) {
    throw new RangeError(`not a calendar date: ${date}`);
  }
  return `${date}T23:59:59+09:00`;
}

/** Requirements the academic track still reports as open; NEEDS_REVIEW/UNKNOWN count as open. */
export function openRequirementIds(summary:AcademicSummary):string[] {
  return [...new Set(summary.deficits.map(d => d.requirementId))].sort(byCodeUnit);
}

/** Per-notice input check so one malformed notice never fails the whole list. */
export function validateNotice(notice:Notice):NoticeExclusionReason|undefined {
  const sessionTimes = (notice.eventSessions ?? []).flatMap(e => [e.start, e.end]);
  for (const v of [notice.studentDeadline, notice.adminReportDeadline, notice.publishedAt, notice.validUntil, ...sessionTimes]) {
    if (v !== undefined && !ISODateTimeSchema.safeParse(v).success) return 'INVALID_DATETIME';
  }
  const r = notice.cohortRange;
  if (r && ((r.min !== undefined && !isCohort(r.min)) || (r.max !== undefined && !isCohort(r.max)))) return 'INVALID_COHORT';
  return undefined;
}

/** A07.2-1: explicit scope only. Mismatch → NO, missing/unconfirmed student value → UNKNOWN. */
export function noticeAppliesTo(student:NoticeStudent, notice:Notice):{appliesTo:AppliesTo; unknownScope:ScopeField[]} {
  const unknown:ScopeField[] = [];
  let mismatch = false;
  const one = (field:ScopeField, required:readonly string[]|undefined, actual:string|undefined) => {
    if (!required || required.length === 0) return;
    if (actual === undefined) unknown.push(field);
    else if (!required.includes(actual)) mismatch = true;
  };
  one('campus', notice.campus === undefined ? undefined : [notice.campus], student.campus);
  one('college', notice.college === undefined ? undefined : [notice.college], student.college);
  one('enrollmentState', notice.enrollmentStates, student.enrollmentState);
  one('admissionType', notice.admissionTypes, student.admissionType);

  const majors = notice.majors ?? [];
  const roles = notice.majorRoles ?? [];
  if (majors.length > 0 || roles.length > 0) {
    if (!student.majors || student.majors.length === 0) unknown.push('majors');
    else if (!student.majors.some(m => (majors.length === 0 || majors.includes(m.major)) && (roles.length === 0 || roles.includes(m.role)))) mismatch = true;
  }

  const range = notice.cohortRange;
  if (range && (range.min !== undefined || range.max !== undefined)) {
    if (!isCohort(student.cohort)) unknown.push('cohort');
    else if ((range.min !== undefined && student.cohort < range.min) || (range.max !== undefined && student.cohort > range.max)) mismatch = true;
  }

  const terms = notice.graduationTermScope ?? [];
  if (terms.length > 0) {
    if (student.targetGraduationTerm === undefined) unknown.push('graduationTerm');
    else if (!terms.includes(student.targetGraduationTerm)) mismatch = true;
    // A07.1: a self-reported target term alone never confirms graduation-candidate status.
    else if (student.graduationTermVerified !== true) unknown.push('graduationTerm');
  }

  if (mismatch) return {appliesTo:'NO', unknownScope:[]};
  if (notice.scholarshipConditions && notice.scholarshipConditions.length > 0) unknown.push('scholarshipConditions');
  return {appliesTo:unknown.length > 0 ? 'UNKNOWN' : 'YES', unknownScope:unknown};
}

/** Pure: no clock, network or randomness; `asOf` is required. Assumes validateNotice passed. */
export function evaluateNotice(student:NoticeStudent, notice:Notice, asOf:string):NoticeEvaluation {
  const now = time(asOf);
  if (now === undefined) throw new RangeError('asOf must be an ISO datetime');
  const scope = noticeAppliesTo(student, notice);
  let appliesTo = scope.appliesTo;
  const unknownScope = [...scope.unknownScope];

  const open = student.openRequirementIds;
  const requirementRefs = notice.requirementRefs ?? [];
  const links:NoticeLinks = {
    requirementIds:open === null ? [] : requirementRefs.filter(r => open.includes(r)),
    courseIds:(notice.courseRefs ?? []).filter(c => student.courseIds.includes(c)),
    topicCodes:onlyKnownTopics(notice.topicCodes ?? []).filter(t => student.interestTopics.includes(t)),
  };
  // Academics not shared: a requirement notice stays academic with an UNKNOWN badge instead of falling to GENERAL.
  const academicUnknown = open === null && requirementRefs.length > 0;
  const academicLink = links.requirementIds.length + links.courseIds.length > 0;
  if (academicUnknown && appliesTo !== 'NO') {
    appliesTo = 'UNKNOWN';
    unknownScope.push('academicStatus');
  }
  const verified = notice.verificationState === 'VERIFIED';
  const academic = academicLink || academicUnknown;
  const due = time(notice.studentDeadline);
  const overdue = appliesTo !== 'NO' && due !== undefined && due <= now;
  const personal = notice.category === 'SCHOLARSHIP' || notice.category === 'EXCHANGE' || links.topicCodes.length > 0;
  // Any notice that would be raised above GENERAL needs VERIFIED; otherwise it waits in the review queue.
  const reviewPending = appliesTo !== 'NO' && (academic || personal) && !verified;

  let priority:Priority;
  if (appliesTo === 'NO' || reviewPending) priority = 'GENERAL';
  else if (academicLink && appliesTo === 'YES' && !overdue && due !== undefined && due - now <= CRITICAL_DUE_DAYS * DAY_MS) priority = 'CRITICAL_DUE';
  // Verified required notice is kept even with an UNKNOWN scope (저학년 필수공지); the badge says what to confirm.
  else if (academic) priority = 'ACADEMIC_REQUIRED';
  else if (personal) priority = 'PERSONAL_OPPORTUNITY';
  else priority = 'GENERAL';

  return {
    noticeId:notice.id, priority, appliesTo, unknownScope, overdue, reviewPending, links,
    ...(notice.studentDeadline === undefined ? {} : {studentDeadline:notice.studentDeadline}),
    ...(notice.adminReportDeadline === undefined ? {} : {adminReportDeadline:notice.adminReportDeadline}),
  };
}

const TIER:Record<Priority, number> = {CRITICAL_DUE:0, ACADEMIC_REQUIRED:1, PERSONAL_OPPORTUNITY:2, GENERAL:3};

export interface ComposedNotices {
  /** Wire object validated with NoticeResultSchema. */
  result:NoticeResult;
  evaluations:NoticeEvaluation[];
  /**
   * Student deadline passed, scope not NO. Kept outside `result` until the shared contract adds
   * NoticeItem.overdue (approved in principle, pending a contracts PR by the integration owner).
   */
  overdueIds:string[];
  /** Academic or personal-opportunity notices waiting for verification; shown as GENERAL with their verificationState. */
  reviewPendingIds:string[];
  /** Not shown: rejected, expired, published after asOf, or malformed input. */
  excluded:NoticeExclusion[];
}

/** A07.2 ordering: tier → student deadline asc (overdue/unknown last) → publishedAt desc (unknown last) → id. */
export function composeNotices(student:NoticeStudent, notices:readonly Notice[], options:{asOf:string}):ComposedNotices {
  const now = time(options.asOf);
  if (now === undefined) throw new RangeError('asOf must be an ISO datetime');
  const excluded:NoticeExclusion[] = [];
  const active:{notice:Notice; ev:NoticeEvaluation}[] = [];
  for (const notice of notices) {
    const invalid = validateNotice(notice);
    const until = time(notice.validUntil);
    const published = time(notice.publishedAt);
    let reason:NoticeExclusionReason|undefined = invalid;
    if (!reason && notice.verificationState === 'REJECTED') reason = 'REJECTED';
    if (!reason && until !== undefined && until <= now) reason = 'EXPIRED';
    if (!reason && published !== undefined && published > now) reason = 'FUTURE_PUBLICATION';
    if (reason) excluded.push({noticeId:notice.id, reason});
    else active.push({notice, ev:evaluateNotice(student, notice, options.asOf)});
  }
  const key = (x:{notice:Notice; ev:NoticeEvaluation}) => ({
    tier:TIER[x.ev.priority],
    due:x.ev.overdue ? Number.POSITIVE_INFINITY : time(x.notice.studentDeadline) ?? Number.POSITIVE_INFINITY,
    overdue:x.ev.overdue ? 1 : 0,
    pub:time(x.notice.publishedAt) ?? Number.NEGATIVE_INFINITY,
  });
  active.sort((a, b) => {
    const ka = key(a), kb = key(b);
    return (ka.tier - kb.tier) || (ka.overdue - kb.overdue) || (ka.due - kb.due) || (kb.pub - ka.pub) || byCodeUnit(a.notice.id, b.notice.id);
  });
  // Home pins: only applicable, verified, not-overdue required notices (A07.2-6). The feed's 3 cards stay separate.
  const pinnedIds = active
    .filter(({ev}) => (ev.priority === 'CRITICAL_DUE' || ev.priority === 'ACADEMIC_REQUIRED') && ev.appliesTo === 'YES' && !ev.overdue)
    .slice(0, PINNED_MAX)
    .map(x => x.notice.id);
  const result = NoticeResultSchema.parse({
    asOf:options.asOf,
    items:active.map(({notice, ev}) => ({
      noticeId:notice.id, title:notice.title, priority:ev.priority, appliesTo:ev.appliesTo,
      ...(ev.studentDeadline === undefined ? {} : {studentDeadline:ev.studentDeadline}),
      ...(ev.adminReportDeadline === undefined ? {} : {adminReportDeadline:ev.adminReportDeadline}),
      evidenceRefs:[...notice.evidenceRefs],
      verificationState:notice.verificationState,
    })),
    pinnedIds,
  });
  return {
    result,
    evaluations:active.map(x => x.ev),
    overdueIds:active.filter(x => x.ev.overdue).map(x => x.notice.id),
    reviewPendingIds:active.filter(x => x.ev.reviewPending).map(x => x.notice.id),
    excluded:excluded.sort((a, b) => byCodeUnit(a.noticeId, b.noticeId)),
  };
}
