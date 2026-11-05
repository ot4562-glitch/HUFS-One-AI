import {AS_OF, assertId, byCodeUnit, classifyLedgerAttempts, termEndMs, type LedgerAttempt} from './ledger.js';

/**
 * Course facts a student may attach to their own experience (#260, for the #255 career feature).
 *
 * The only claim this core makes is "the student-submitted transcript lists this course in
 * this term". It is not a skill, a level, a grade, a competency score or a school check.
 * The input has no grade, GPA, competency score or RulePack. The output never names a retake,
 * an attempt count, credits, an area, a category or a requirement result.
 *
 * Each course is decided by the ledger's own attempt rules (classifyLedgerAttempts), so this
 * view and the credit audit cannot disagree about which attempts count.
 * Pure: no clock, network, storage or randomness. `asOf` is the caller's instant.
 */
export const EXPERIENCE_EVIDENCE_CORE_VERSION = 'academic-experience-evidence-v1';

const MAX_ATTEMPTS = 2000;
const MAX_EXPERIENCES = 200;
const MAX_LINKS = 1000;
const TERM = /^(\d{4})-(1|S|2|W)$/;

/**
 * Purpose-bound access. Pass SHARED only under a current grant to use academic records in
 * the experience feature. A share made for the graduation audit is not that grant (A03).
 * NEEDS_REVIEW means the transcript intake failed. Its empty record list is not "no courses".
 * NOT_SHARED covers never granted, expired and revoked.
 */
export type AcademicEvidenceAccess =
  | {state:'NOT_SHARED'}
  | {state:'NEEDS_REVIEW'}
  | {state:'SHARED'; grantVersion:string; transcriptVersion:string; attempts:readonly LedgerAttempt[]};

/** TAKEN and IN_PROGRESS can be linked. The other states say why a course cannot. */
export type CourseEvidence =
  | {canonicalCourseId:string; state:'TAKEN'|'IN_PROGRESS'; term:string}
  | {canonicalCourseId:string; state:'PLANNED_ONLY'|'NEEDS_REVIEW'|'RECOGNITION_PENDING'|'RECOGNITION_EXCLUDED'};
export type CourseEvidenceState = CourseEvidence['state'];

/**
 * NOT_SHARED and NEEDS_REVIEW carry no course list, so a caller cannot show them as zero.
 * Only SHARED with an empty `courses` list means the transcript has no courses.
 */
export type CourseEvidenceList =
  | {state:'NOT_SHARED'}
  | {state:'NEEDS_REVIEW'}
  | {state:'SHARED'; basis:'STUDENT_SUBMITTED_TRANSCRIPT'; transcriptVersion:string; courses:CourseEvidence[]};

/** A stored link between one of the owner's experiences and one course. */
export interface ExperienceCourseLink {
  experienceId:string;
  canonicalCourseId:string;
  /**
   * STUDENT_CONFIRMED only after the student picked this course for this experience.
   * A link a model or a rule proposed stays SUGGESTED and never links (A06).
   */
  provenance:'STUDENT_CONFIRMED'|'SUGGESTED';
  /** What the student saw when confirming. A change to any of them needs a new confirmation. */
  experienceContentVersion:number;
  grantVersion:string;
  confirmedTerm:string;
  confirmedAt:string;
}

export interface ExperienceCourseLinkRequest {
  asOf:string;
  access:AcademicEvidenceAccess;
  /** The owner's current, undeleted experiences and their content versions. */
  experiences:readonly {experienceId:string; contentVersion:number}[];
  links:readonly ExperienceCourseLink[];
}

export type ExperienceCourseLinkReason =
  | 'NOT_CONFIRMED' | 'EXPERIENCE_NOT_FOUND' | 'STALE' | 'NOT_IN_TRANSCRIPT'
  | Exclude<CourseEvidenceState, 'TAKEN'|'IN_PROGRESS'>;

export type ExperienceCourseLinkRow =
  | {experienceId:string; canonicalCourseId:string; state:'LINKED'; course:'TAKEN'|'IN_PROGRESS'; term:string}
  | {experienceId:string; canonicalCourseId:string; state:'NOT_LINKED'; reason:ExperienceCourseLinkReason};

export type ExperienceCourseLinkResult =
  | {state:'NOT_SHARED'}
  | {state:'NEEDS_REVIEW'}
  | {state:'SHARED'; basis:'STUDENT_SUBMITTED_TRANSCRIPT'; transcriptVersion:string; links:ExperienceCourseLinkRow[]};

function instant(value:unknown, label:string):number {
  if (typeof value !== 'string' || !AS_OF.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`${label} must be an ISO-8601 datetime with a timezone offset`);
  }
  return Date.parse(value);
}

function assertVersion(value:unknown, label:string):asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive safe integer; refused ${String(value)}`);
  }
}

function assertTerm(value:unknown, label:string):asserts value is string {
  if (typeof value !== 'string' || !TERM.test(value)) throw new TypeError(`${label} must be YYYY-1|S|2|W; refused ${String(value)}`);
}

/** Start of a term on the same Asia/Seoul boundaries as termEndMs: each term starts when the previous one ends. */
function termStartMs(term:string):number {
  const match = TERM.exec(term);
  if (!match) throw new TypeError(`term must be YYYY-1|S|2|W; refused ${term}`);
  const year = Number(match[1]);
  const start = {
    '1':`${year}-03-01`,
    S:`${year}-07-01`,
    '2':`${year}-09-01`,
    W:`${year + 1}-01-01`,
  }[match[2] as '1'|'S'|'2'|'W'];
  return Date.parse(`${start}T00:00:00.000+09:00`);
}

/** An IN_PROGRESS row is a current fact only inside its term. Outside it the outcome is unknown. */
function inTerm(term:string|undefined, asOfMs:number):term is string {
  return term !== undefined && termStartMs(term) <= asOfMs && asOfMs < termEndMs(term);
}

function decideCourse(
  courseId:string,
  group:readonly LedgerAttempt[],
  classification:ReturnType<typeof classifyLedgerAttempts>,
  asOfMs:number,
):CourseEvidence {
  const reasons = group.map(attempt => classification.reasons.get(attempt.attemptToken));
  // One unresolved attempt is enough: the core does not pick a term or an attempt for the student.
  if (reasons.includes('NEEDS_REVIEW')) return {canonicalCourseId:courseId, state:'NEEDS_REVIEW'};
  const winner = classification.winners.get(courseId);
  if (winner) {
    if (winner.ledger === 'EARNED') {
      return winner.term === undefined
        ? {canonicalCourseId:courseId, state:'NEEDS_REVIEW'}
        : {canonicalCourseId:courseId, state:'TAKEN', term:winner.term};
    }
    if (winner.ledger === 'IN_PROGRESS') {
      return inTerm(winner.term, asOfMs)
        ? {canonicalCourseId:courseId, state:'IN_PROGRESS', term:winner.term}
        : {canonicalCourseId:courseId, state:'NEEDS_REVIEW'};
    }
    return {canonicalCourseId:courseId, state:'PLANNED_ONLY'};
  }
  if (reasons.includes('PENDING_RECOGNITION')) return {canonicalCourseId:courseId, state:'RECOGNITION_PENDING'};
  if (reasons.includes('OFFICIAL_EXCLUSION')) return {canonicalCourseId:courseId, state:'RECOGNITION_EXCLUDED'};
  return {canonicalCourseId:courseId, state:'NEEDS_REVIEW'};
}

/**
 * The courses a student may choose from when linking an experience, one row per course.
 * This is a pick list for the student. It never proposes a course as an experience or a skill.
 */
export function describeCourseEvidence(input:{asOf:string; access:AcademicEvidenceAccess}):CourseEvidenceList {
  const asOfMs = instant(input.asOf, 'asOf');
  const access = input.access;
  if (access.state === 'NOT_SHARED') return {state:'NOT_SHARED'};
  if (access.state === 'NEEDS_REVIEW') return {state:'NEEDS_REVIEW'};
  if (access.state !== 'SHARED') throw new TypeError('access.state must be NOT_SHARED, NEEDS_REVIEW or SHARED');
  assertId(access.grantVersion, 'grantVersion');
  assertId(access.transcriptVersion, 'transcriptVersion');
  if (!Array.isArray(access.attempts)) throw new TypeError('attempts must be an array');
  if (access.attempts.length > MAX_ATTEMPTS) throw new RangeError('too many attempts');

  const classification = classifyLedgerAttempts(access.attempts, input.asOf);
  const byCourse = new Map<string, LedgerAttempt[]>();
  for (const attempt of access.attempts) {
    const group = byCourse.get(attempt.canonicalCourseId) ?? [];
    group.push(attempt);
    byCourse.set(attempt.canonicalCourseId, group);
  }
  const courses = [...byCourse.keys()].sort(byCodeUnit)
    .map(courseId => decideCourse(courseId, byCourse.get(courseId)!, classification, asOfMs));
  return {state:'SHARED', basis:'STUDENT_SUBMITTED_TRANSCRIPT', transcriptVersion:access.transcriptVersion, courses};
}

/**
 * Whether each stored link still holds as of `asOf`.
 * A link holds only when the student confirmed it, the experience, the grant and the course's
 * term are what the student saw then, and the course is still TAKEN or IN_PROGRESS.
 * A new grant after a revocation does not bring old links back.
 */
export function resolveExperienceCourseLinks(input:ExperienceCourseLinkRequest):ExperienceCourseLinkResult {
  const asOfMs = instant(input.asOf, 'asOf');
  if (!Array.isArray(input.experiences) || !Array.isArray(input.links)) {
    throw new TypeError('experiences and links must be arrays');
  }
  if (input.experiences.length > MAX_EXPERIENCES) throw new RangeError('too many experiences');
  if (input.links.length > MAX_LINKS) throw new RangeError('too many links');

  const versions = new Map<string, number>();
  for (const experience of input.experiences) {
    assertId(experience.experienceId, 'experienceId');
    assertVersion(experience.contentVersion, `contentVersion of ${experience.experienceId}`);
    if (versions.has(experience.experienceId)) throw new TypeError(`duplicate experience ${experience.experienceId}`);
    versions.set(experience.experienceId, experience.contentVersion);
  }
  const seen = new Set<string>();
  for (const link of input.links) {
    assertId(link.experienceId, 'link experienceId');
    assertId(link.canonicalCourseId, 'link canonicalCourseId');
    if (link.provenance !== 'STUDENT_CONFIRMED' && link.provenance !== 'SUGGESTED') {
      throw new TypeError(`link provenance must be STUDENT_CONFIRMED or SUGGESTED; refused ${String(link.provenance)}`);
    }
    assertVersion(link.experienceContentVersion, 'link experienceContentVersion');
    assertId(link.grantVersion, 'link grantVersion');
    assertTerm(link.confirmedTerm, 'link confirmedTerm');
    instant(link.confirmedAt, 'link confirmedAt');
    const key = JSON.stringify([link.experienceId, link.canonicalCourseId]);
    if (seen.has(key)) throw new TypeError(`duplicate link ${link.experienceId} -> ${link.canonicalCourseId}`);
    seen.add(key);
  }

  const evidence = describeCourseEvidence({asOf:input.asOf, access:input.access});
  if (evidence.state !== 'SHARED') return {state:evidence.state};
  const grantVersion = input.access.state === 'SHARED' ? input.access.grantVersion : undefined;
  const courses = new Map(evidence.courses.map(course => [course.canonicalCourseId, course]));

  const links = [...input.links]
    .sort((a, b) => byCodeUnit(a.experienceId, b.experienceId) || byCodeUnit(a.canonicalCourseId, b.canonicalCourseId))
    .map((link):ExperienceCourseLinkRow => {
      const address = {experienceId:link.experienceId, canonicalCourseId:link.canonicalCourseId};
      const notLinked = (reason:ExperienceCourseLinkReason):ExperienceCourseLinkRow =>
        ({...address, state:'NOT_LINKED', reason});
      if (link.provenance !== 'STUDENT_CONFIRMED' || Date.parse(link.confirmedAt) > asOfMs) return notLinked('NOT_CONFIRMED');
      const contentVersion = versions.get(link.experienceId);
      if (contentVersion === undefined) return notLinked('EXPERIENCE_NOT_FOUND');
      if (contentVersion !== link.experienceContentVersion || grantVersion !== link.grantVersion) return notLinked('STALE');
      const course = courses.get(link.canonicalCourseId);
      if (!course) return notLinked('NOT_IN_TRANSCRIPT');
      if (course.state !== 'TAKEN' && course.state !== 'IN_PROGRESS') return notLinked(course.state);
      if (course.term !== link.confirmedTerm) return notLinked('STALE');
      return {...address, state:'LINKED', course:course.state, term:course.term};
    });
  return {state:'SHARED', basis:'STUDENT_SUBMITTED_TRANSCRIPT', transcriptVersion:evidence.transcriptVersion, links};
}
