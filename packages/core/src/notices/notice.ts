import {NoticeResultSchema, type AcademicSummary, type NoticeResult, type TopicCode} from '@hufs-one/contracts';
import {byCodeUnit} from '../normalization/dedupe.js';
import {onlyKnownTopics} from '../normalization/topics.js';

type Priority = NoticeResult['items'][number]['priority'];
type AppliesTo = 'YES'|'NO'|'UNKNOWN';
type VerificationState = 'CANDIDATE'|'VERIFIED'|'NEEDS_REVIEW'|'REJECTED';

/**
 * A07.1 notice input. Core-local until promoted into @hufs-one/contracts by the integration owner.
 * Every scope field is optional: an absent field means the notice did not restrict it.
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
  cohortRange?:{min?:number; max?:number};
  enrollmentStates?:readonly string[];
  /** Requirements / courses this notice directly concerns (전필·인증·졸업시험·수강변경). */
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
  verificationState:VerificationState;
  evidenceRefs:readonly string[];
}

/** Verified student scope from the approved projection. Missing values give UNKNOWN. */
export interface NoticeStudent {
  campus?:string;
  college?:string;
  majors?:readonly string[];
  cohort?:number;
  enrollmentState?:string;
  /** Open requirement ids, e.g. from openRequirementIds(academicSummary). */
  openRequirementIds:readonly string[];
  /** Current / planned course ids relevant for 수강변경·대체과목 notices. */
  courseIds:readonly string[];
  interestTopics:readonly TopicCode[];
}

export interface NoticeLinks {requirementIds:string[]; courseIds:string[]; topicCodes:TopicCode[]}
export type ScopeField = 'campus'|'college'|'majors'|'cohort'|'enrollmentState'|'scholarshipConditions';

export interface NoticeEvaluation {
  noticeId:string;
  priority:Priority;
  appliesTo:AppliesTo;
  /** Scope fields that made appliesTo UNKNOWN (what the UI should ask to confirm). */
  unknownScope:ScopeField[];
  /** Student deadline passed: belongs to the "해결 필요/담당부서 확인" area, never pinned. */
  overdue:boolean;
  links:NoticeLinks;
  studentDeadline?:string;
  adminReportDeadline?:string;
}

export const CRITICAL_DUE_DAYS = 7;
export const PINNED_MAX = 2;
const DAY_MS = 86_400_000;

function time(iso:string|undefined):number|undefined {
  if (iso === undefined) return undefined;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : undefined;
}

/** Requirements the academic track still reports as open; NEEDS_REVIEW/UNKNOWN count as open. */
export function openRequirementIds(summary:AcademicSummary):string[] {
  return [...new Set(summary.deficits.map(d => d.requirementId))].sort(byCodeUnit);
}

/** A07.2-1: explicit scope only. Mismatch → NO, missing student value → UNKNOWN. */
export function noticeAppliesTo(student:NoticeStudent, notice:Notice):{appliesTo:AppliesTo; unknownScope:ScopeField[]} {
  const unknown:ScopeField[] = [];
  let mismatch = false;
  const one = (field:ScopeField, required:string|undefined, actual:string|undefined) => {
    if (required === undefined) return;
    if (actual === undefined) unknown.push(field);
    else if (actual !== required) mismatch = true;
  };
  one('campus', notice.campus, student.campus);
  one('college', notice.college, student.college);
  if (notice.majors && notice.majors.length > 0) {
    if (!student.majors || student.majors.length === 0) unknown.push('majors');
    else if (!student.majors.some(m => notice.majors!.includes(m))) mismatch = true;
  }
  const range = notice.cohortRange;
  if (range && (range.min !== undefined || range.max !== undefined)) {
    if (student.cohort === undefined) unknown.push('cohort');
    else if ((range.min !== undefined && student.cohort < range.min) || (range.max !== undefined && student.cohort > range.max)) mismatch = true;
  }
  if (notice.enrollmentStates && notice.enrollmentStates.length > 0) {
    if (student.enrollmentState === undefined) unknown.push('enrollmentState');
    else if (!notice.enrollmentStates.includes(student.enrollmentState)) mismatch = true;
  }
  if (mismatch) return {appliesTo:'NO', unknownScope:[]};
  if (notice.scholarshipConditions && notice.scholarshipConditions.length > 0) unknown.push('scholarshipConditions');
  return {appliesTo:unknown.length > 0 ? 'UNKNOWN' : 'YES', unknownScope:unknown};
}

/** Pure: no clock, network or randomness; `asOf` is required. */
export function evaluateNotice(student:NoticeStudent, notice:Notice, asOf:string):NoticeEvaluation {
  const now = time(asOf);
  if (now === undefined) throw new RangeError('asOf must be an ISO datetime');
  const {appliesTo, unknownScope} = noticeAppliesTo(student, notice);
  const links:NoticeLinks = {
    requirementIds:(notice.requirementRefs ?? []).filter(r => student.openRequirementIds.includes(r)),
    courseIds:(notice.courseRefs ?? []).filter(c => student.courseIds.includes(c)),
    topicCodes:onlyKnownTopics(notice.topicCodes ?? []).filter(t => student.interestTopics.includes(t)),
  };
  const academicLink = links.requirementIds.length + links.courseIds.length > 0;
  const due = time(notice.studentDeadline);
  const overdue = academicLink && due !== undefined && due <= now;

  let priority:Priority;
  if (appliesTo === 'NO') priority = 'GENERAL';
  else if (academicLink && appliesTo === 'YES' && notice.verificationState === 'VERIFIED' &&
    due !== undefined && due > now && due - now <= CRITICAL_DUE_DAYS * DAY_MS) priority = 'CRITICAL_DUE';
  // A required notice is never dropped for an unknown scope (저학년 필수공지); it keeps its UNKNOWN badge.
  else if (academicLink) priority = 'ACADEMIC_REQUIRED';
  else if (notice.category === 'SCHOLARSHIP' || notice.category === 'EXCHANGE' || links.topicCodes.length > 0) priority = 'PERSONAL_OPPORTUNITY';
  else priority = 'GENERAL';

  return {
    noticeId:notice.id, priority, appliesTo, unknownScope, overdue, links,
    ...(notice.studentDeadline === undefined ? {} : {studentDeadline:notice.studentDeadline}),
    ...(notice.adminReportDeadline === undefined ? {} : {adminReportDeadline:notice.adminReportDeadline}),
  };
}

const TIER:Record<Priority, number> = {CRITICAL_DUE:0, ACADEMIC_REQUIRED:1, PERSONAL_OPPORTUNITY:2, GENERAL:3};

export interface ComposedNotices {
  /** Wire object validated with NoticeResultSchema. */
  result:NoticeResult;
  evaluations:NoticeEvaluation[];
  /** Ids whose student deadline passed while linked to an open requirement. */
  overdueIds:string[];
  /** Excluded: REJECTED or validUntil ≤ asOf. */
  excludedIds:string[];
}

/** A07.2 ordering: tier → student deadline asc (unknown last) → publishedAt desc (unknown last) → id. */
export function composeNotices(student:NoticeStudent, notices:readonly Notice[], options:{asOf:string}):ComposedNotices {
  const now = time(options.asOf);
  if (now === undefined) throw new RangeError('asOf must be an ISO datetime');
  const excluded:string[] = [];
  const active:{notice:Notice; ev:NoticeEvaluation}[] = [];
  for (const notice of notices) {
    const until = time(notice.validUntil);
    if (notice.verificationState === 'REJECTED' || (until !== undefined && until <= now)) excluded.push(notice.id);
    else active.push({notice, ev:evaluateNotice(student, notice, options.asOf)});
  }
  const key = (x:{notice:Notice; ev:NoticeEvaluation}) => ({
    tier:TIER[x.ev.priority],
    due:x.ev.overdue ? Number.POSITIVE_INFINITY : time(x.notice.studentDeadline) ?? Number.POSITIVE_INFINITY,
    pub:time(x.notice.publishedAt) ?? Number.NEGATIVE_INFINITY,
  });
  active.sort((a, b) => {
    const ka = key(a), kb = key(b);
    return (ka.tier - kb.tier) || (ka.due - kb.due) || (kb.pub - ka.pub) || byCodeUnit(a.notice.id, b.notice.id);
  });
  // Home pins: only applicable, verified, not-overdue required notices (A07.2-6). The feed's 3 cards stay separate.
  const pinnedIds = active
    .filter(({notice, ev}) => (ev.priority === 'CRITICAL_DUE' || ev.priority === 'ACADEMIC_REQUIRED') &&
      ev.appliesTo === 'YES' && !ev.overdue && notice.verificationState === 'VERIFIED')
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
    excludedIds:excluded.sort(byCodeUnit),
  };
}
