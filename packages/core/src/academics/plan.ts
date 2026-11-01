import {
  AcademicAuditVNextSchema,
  type AcademicAuditVNext,
} from '@hufs-one/contracts';
import {
  AS_OF,
  addUnits,
  assertId,
  assertPositiveUnits,
  buildAcademicLedger,
  byCodeUnit,
  termEndMs,
  termKey,
  type AcademicLedgerRequest,
  type LedgerAttempt,
} from './ledger.js';

/**
 * One-term plan check (A08.4, A08.5 CREDIT-07..CREDIT-09).
 * Checks the approved credit cap, official prerequisites, and officially verified sections.
 * It reports plan issues only. The credit ledger is computed by buildAcademicLedger and
 * is never changed here. No timetable is produced and no section is invented.
 * The detailed timetable solver stays P2.
 */

type PlanIssue = AcademicAuditVNext['planIssues'][number];

export type Weekday = 'MON'|'TUE'|'WED'|'THU'|'FRI'|'SAT'|'SUN';

export interface SectionMeeting {
  day:Weekday;
  /** Minutes after local midnight. A meeting covers [startMinute, endMinute). */
  startMinute:number;
  endMinute:number;
}

/** A section only as the official timetable published it. */
export interface VerifiedSection {
  canonicalCourseId:string;
  sectionId:string;
  term:string;
  /** Empty means no fixed meeting time, so it never overlaps. */
  meetings:readonly SectionMeeting[];
  evidenceRefs:readonly string[];
  /** A section verified after asOf is not used. */
  verifiedAt:string;
}

/** Every listed course must be earned before the course is planned. */
export interface PrerequisiteRule {
  canonicalCourseId:string;
  requiresCourseIds:readonly string[];
  evidenceRefs:readonly string[];
}

export interface TermPlan {
  /** Term being planned, `YYYY-1|S|2|W`. It must not have ended by asOf. */
  term:string;
  /** Approved per-term cap. 1 unit = 0.5학점. */
  creditCapUnits:number;
  capEvidenceRefs:readonly string[];
  prerequisites?:readonly PrerequisiteRule[];
  /** Omitted or empty: no course has a verified section, so each is held for review. */
  sections?:readonly VerifiedSection[];
}

export interface AcademicPlanRequest extends AcademicLedgerRequest {
  termPlan:TermPlan;
}

const WEEKDAYS:ReadonlySet<string> = new Set(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);
const MINUTES_PER_DAY = 24 * 60;
const MAX_TERM_COURSES = 20;
const MAX_PREREQUISITES = 100;
const MAX_SECTIONS = 200;
const MAX_MEETINGS = 10;
const MAX_PLAN_ISSUES = 100;
const MAX_EVIDENCE = 30;
/** A08.4 search bound. Hitting it is reported, not hidden. */
export const MAX_ALLOCATION_STATES = 50_000;

function assertRefs(refs:readonly string[], label:string):string[] {
  if (!Array.isArray(refs) || refs.length === 0) throw new TypeError(`${label} needs official evidence`);
  const seen = new Set<string>();
  for (const ref of refs) {
    assertId(ref, label);
    if (seen.has(ref)) throw new TypeError(`${label} repeats evidence ${ref}`);
    seen.add(ref);
  }
  return [...refs];
}

function instantMs(value:string, label:string):number {
  const ms = Date.parse(value);
  if (!AS_OF.test(value) || !Number.isFinite(ms)) {
    throw new TypeError(`${label} must be an ISO-8601 datetime with a timezone offset`);
  }
  return ms;
}

function union(lists:readonly (readonly string[])[]):string[] {
  const refs = [...new Set(lists.flat())].sort(byCodeUnit);
  if (refs.length > MAX_EVIDENCE) throw new RangeError('too many evidence refs on one plan issue');
  return refs;
}

interface TermCourse {
  courseId:string;
  units:number;
  planned:boolean;
}

/** PLANNED or IN_PROGRESS rows in the plan term, one entry per course. */
function termLoad(attempts:readonly LedgerAttempt[], term:string, issues:PlanIssue[]):TermCourse[] {
  const byCourse = new Map<string, TermCourse>();
  const repeated = new Set<string>();
  for (const attempt of attempts) {
    if (attempt.term !== term || attempt.recognition === 'EXCLUDED') continue;
    if (attempt.ledger !== 'PLANNED' && attempt.ledger !== 'IN_PROGRESS') continue;
    const prior = byCourse.get(attempt.canonicalCourseId);
    if (prior) {
      repeated.add(attempt.canonicalCourseId);
      prior.units = Math.max(prior.units, attempt.creditUnits);
      prior.planned ||= attempt.ledger === 'PLANNED';
      continue;
    }
    byCourse.set(attempt.canonicalCourseId, {
      courseId:attempt.canonicalCourseId,
      units:attempt.creditUnits,
      planned:attempt.ledger === 'PLANNED',
    });
  }
  if (byCourse.size > MAX_TERM_COURSES) throw new RangeError(`a term plan accepts at most ${MAX_TERM_COURSES} courses`);
  if (repeated.size > 0) {
    issues.push({
      code:'NEEDS_REVIEW',
      reasonCode:'UNKNOWN',
      courseRefs:[...repeated].sort(byCodeUnit),
      evidenceRefs:[],
    });
  }
  return [...byCourse.values()].sort((a, b) => byCodeUnit(a.courseId, b.courseId));
}

function checkCap(plan:TermPlan, load:readonly TermCourse[], packApproved:boolean, issues:PlanIssue[]):void {
  assertPositiveUnits(plan.creditCapUnits, 'creditCapUnits');
  const evidenceRefs = assertRefs(plan.capEvidenceRefs, 'capEvidenceRefs');
  let total = 0;
  for (const course of load) total = addUnits(total, course.units);
  if (total <= plan.creditCapUnits) return;
  const courseRefs = load.map(course => course.courseId);
  issues.push(packApproved
    ? {code:'CREDIT_CAP_EXCEEDED', reasonCode:'EXCEEDS_APPROVED_LIMIT', courseRefs, evidenceRefs}
    : {code:'NEEDS_REVIEW', reasonCode:'UNKNOWN', courseRefs, evidenceRefs});
}

type PrerequisiteState = 'EARNED'|'REVIEW'|'MISSING';

/**
 * EARNED: a counted earned attempt exists.
 * REVIEW: an earlier-term attempt is still in progress or planned, or an attempt is held.
 * MISSING: nothing else. A same-term attempt is not treated as a co-requisite.
 */
function prerequisiteState(
  courseId:string,
  attempts:readonly LedgerAttempt[],
  excluded:ReadonlyMap<string, string>,
  planTermKey:number,
):PrerequisiteState {
  let review = false;
  for (const attempt of attempts) {
    if (attempt.canonicalCourseId !== courseId) continue;
    const reason = excluded.get(attempt.attemptToken);
    if (reason === undefined && attempt.ledger === 'EARNED') return 'EARNED';
    if (reason === 'NEEDS_REVIEW' || reason === 'PENDING_RECOGNITION') review = true;
    if (reason === undefined && attempt.ledger !== 'EARNED' && attempt.term !== undefined
      && termKey(attempt.term) < planTermKey) review = true;
  }
  return review ? 'REVIEW' : 'MISSING';
}

function checkPrerequisites(
  plan:TermPlan,
  load:readonly TermCourse[],
  attempts:readonly LedgerAttempt[],
  excluded:ReadonlyMap<string, string>,
  packApproved:boolean,
  issues:PlanIssue[],
):void {
  const rules = plan.prerequisites ?? [];
  if (!Array.isArray(rules)) throw new TypeError('prerequisites must be an array');
  if (rules.length > MAX_PREREQUISITES) throw new RangeError('too many prerequisite rules');
  const byCourse = new Map<string, {requires:string[]; evidenceRefs:string[]}>();
  for (const rule of rules) {
    assertId(rule.canonicalCourseId, 'prerequisite course');
    if (byCourse.has(rule.canonicalCourseId)) {
      throw new TypeError(`duplicate prerequisite rule for ${rule.canonicalCourseId}`);
    }
    if (!Array.isArray(rule.requiresCourseIds) || rule.requiresCourseIds.length === 0) {
      throw new TypeError(`${rule.canonicalCourseId} prerequisite lists no course`);
    }
    const requires = new Set<string>();
    for (const required of rule.requiresCourseIds) {
      assertId(required, `${rule.canonicalCourseId} prerequisite`);
      if (required === rule.canonicalCourseId) throw new TypeError(`${required} cannot require itself`);
      if (requires.has(required)) throw new TypeError(`${rule.canonicalCourseId} repeats prerequisite ${required}`);
      requires.add(required);
    }
    if (requires.size + 1 > 20) throw new RangeError(`${rule.canonicalCourseId} lists too many prerequisites`);
    byCourse.set(rule.canonicalCourseId, {
      requires:[...requires].sort(byCodeUnit),
      evidenceRefs:assertRefs(rule.evidenceRefs, `${rule.canonicalCourseId} prerequisite evidence`),
    });
  }

  const planTermKey = termKey(plan.term);
  for (const course of load) {
    if (!course.planned) continue;
    const rule = byCourse.get(course.courseId);
    if (!rule) continue;
    const missing:string[] = [];
    const review:string[] = [];
    for (const required of rule.requires) {
      const state = prerequisiteState(required, attempts, excluded, planTermKey);
      if (state === 'MISSING') missing.push(required);
      else if (state === 'REVIEW') review.push(required);
    }
    if (missing.length > 0) {
      const courseRefs = [course.courseId, ...missing];
      issues.push(packApproved
        ? {code:'PREREQUISITE_MISSING', reasonCode:'UNMET_OFFICIAL_PREREQUISITE', courseRefs, evidenceRefs:rule.evidenceRefs}
        : {code:'NEEDS_REVIEW', reasonCode:'UNKNOWN', courseRefs, evidenceRefs:rule.evidenceRefs});
    }
    if (review.length > 0) {
      issues.push({
        code:'NEEDS_REVIEW',
        reasonCode:'UNKNOWN',
        courseRefs:[course.courseId, ...review],
        evidenceRefs:rule.evidenceRefs,
      });
    }
  }
}

interface Section {
  sectionId:string;
  meetings:readonly SectionMeeting[];
  evidenceRefs:string[];
}

function validSections(plan:TermPlan, asOfMs:number):Map<string, Section[]> {
  const sections = plan.sections ?? [];
  if (!Array.isArray(sections)) throw new TypeError('sections must be an array');
  if (sections.length > MAX_SECTIONS) throw new RangeError('too many sections');
  const byCourse = new Map<string, Section[]>();
  const seen = new Set<string>();
  for (const section of sections) {
    assertId(section.canonicalCourseId, 'section course');
    assertId(section.sectionId, 'sectionId');
    const key = `${section.canonicalCourseId}\u0000${section.sectionId}`;
    if (seen.has(key)) throw new TypeError(`duplicate section ${section.sectionId} of ${section.canonicalCourseId}`);
    seen.add(key);
    if (section.term !== plan.term) {
      throw new TypeError(`section ${section.sectionId} is for ${section.term}, not ${plan.term}`);
    }
    const evidenceRefs = assertRefs(section.evidenceRefs, `section ${section.sectionId} evidence`);
    if (!Array.isArray(section.meetings) || section.meetings.length > MAX_MEETINGS) {
      throw new RangeError(`section ${section.sectionId} meetings must be an array of at most ${MAX_MEETINGS}`);
    }
    for (const meeting of section.meetings) {
      if (!WEEKDAYS.has(meeting.day)) throw new TypeError(`section ${section.sectionId} has no weekday`);
      const {startMinute:start, endMinute:end} = meeting;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end > MINUTES_PER_DAY || start >= end) {
        throw new TypeError(`section ${section.sectionId} meeting must be whole minutes within one day`);
      }
    }
    if (instantMs(section.verifiedAt, `section ${section.sectionId} verifiedAt`) > asOfMs) continue;
    const list = byCourse.get(section.canonicalCourseId) ?? [];
    list.push({sectionId:section.sectionId, meetings:section.meetings, evidenceRefs});
    byCourse.set(section.canonicalCourseId, list);
  }
  for (const list of byCourse.values()) list.sort((a, b) => byCodeUnit(a.sectionId, b.sectionId));
  return byCourse;
}

function overlaps(a:Section, b:Section):boolean {
  return a.meetings.some(x => b.meetings.some(y => x.day === y.day
    && x.startMinute < y.endMinute && y.startMinute < x.endMinute));
}

type Fit = 'FITS'|'NO_FIT'|'LIMIT';

/** Depth-first search for one non-overlapping choice of verified sections. */
function anyFit(courses:readonly Section[][]):Fit {
  let states = 0;
  const chosen:Section[] = [];
  const visit = (index:number):Fit => {
    if (index === courses.length) return 'FITS';
    for (const section of courses[index]!) {
      states += 1;
      if (states > MAX_ALLOCATION_STATES) return 'LIMIT';
      if (chosen.some(other => overlaps(other, section))) continue;
      chosen.push(section);
      const result = visit(index + 1);
      chosen.pop();
      if (result !== 'NO_FIT') return result;
    }
    return 'NO_FIT';
  };
  return visit(0);
}

function checkTimetable(plan:TermPlan, load:readonly TermCourse[], asOfMs:number, issues:PlanIssue[]):void {
  const sections = validSections(plan, asOfMs);
  const unconfirmed = load.filter(course => !sections.has(course.courseId)).map(course => course.courseId);
  const timed = load.filter(course => sections.has(course.courseId)).map(course => course.courseId);

  let pairConflict = false;
  for (let i = 0; i < timed.length; i += 1) {
    for (let j = i + 1; j < timed.length; j += 1) {
      const a = sections.get(timed[i]!)!;
      const b = sections.get(timed[j]!)!;
      if (!a.every(x => b.every(y => overlaps(x, y)))) continue;
      pairConflict = true;
      issues.push({
        code:'TIMETABLE_CONFLICT',
        reasonCode:'ALL_VERIFIED_SECTIONS_OVERLAP',
        courseRefs:[timed[i]!, timed[j]!],
        evidenceRefs:union([...a, ...b].map(section => section.evidenceRefs)),
      });
    }
  }

  if (!pairConflict && timed.length > 2) {
    const lists = timed.map(courseId => sections.get(courseId)!);
    const fit = anyFit(lists);
    if (fit !== 'FITS') {
      const evidenceRefs = union(lists.flat().map(section => section.evidenceRefs));
      issues.push(fit === 'LIMIT'
        ? {code:'SEARCH_LIMIT_REVIEW', reasonCode:'ALLOCATION_SEARCH_LIMIT', courseRefs:timed, evidenceRefs}
        : {code:'TIMETABLE_CONFLICT', reasonCode:'ALL_VERIFIED_SECTIONS_OVERLAP', courseRefs:timed, evidenceRefs});
    }
  }

  if (unconfirmed.length > 0) {
    issues.push({code:'NEEDS_REVIEW', reasonCode:'COURSE_NOT_CONFIRMED', courseRefs:unconfirmed, evidenceRefs:[]});
  }
}

/**
 * Build the credit ledger, then add plan issues for one term (CREDIT-07..CREDIT-09).
 * Every credit figure, area, exclusion, and requirement row equals buildAcademicLedger's
 * result for the same request. Only planIssues and caveats differ.
 * Without an APPROVED pack, cap and prerequisite blockers are held as NEEDS_REVIEW.
 */
export function buildAcademicPlan(input:AcademicPlanRequest):AcademicAuditVNext {
  const {termPlan:plan, ...ledgerRequest} = input;
  const audit = buildAcademicLedger(ledgerRequest);
  if (!plan || typeof plan !== 'object') throw new TypeError('termPlan is required');
  const asOfMs = Date.parse(input.asOf);
  if (termEndMs(plan.term) <= asOfMs) throw new TypeError(`termPlan.term ${plan.term} has already ended by asOf`);

  const packApproved = input.rulePackState === 'APPROVED';
  const excluded = new Map(audit.excludedAttempts.map(row => [row.attemptToken, row.reason]));
  const issues:PlanIssue[] = [];
  const load = termLoad(input.attempts, plan.term, issues);
  checkCap(plan, load, packApproved, issues);
  checkPrerequisites(plan, load, input.attempts, excluded, packApproved, issues);
  checkTimetable(plan, load, asOfMs, issues);
  if (issues.length > MAX_PLAN_ISSUES) throw new RangeError('too many plan issues');

  const caveats = [...audit.caveats,
    `Plan check for ${plan.term}: approved cap, official prerequisites, and verified sections only. No timetable is produced.`];
  if (!packApproved) caveats.push('Rule pack is not APPROVED; cap and prerequisite blockers are held for review.');

  const parsed = AcademicAuditVNextSchema.safeParse({...audit, planIssues:issues, caveats});
  if (!parsed.success) {
    throw new TypeError(`academic plan result is not a valid audit: ${parsed.error.issues.map(issue => issue.message).join('; ')}`);
  }
  return parsed.data;
}
