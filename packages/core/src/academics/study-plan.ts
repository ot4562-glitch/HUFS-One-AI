import {
  OwnerWorkspaceValueSchema,
  type AcademicAuditVNext,
  type OwnerStudyPlanCheckResponse,
  type OwnerWorkspaceValue,
} from '@hufs-one/contracts';
import {AS_OF, assertId, assertPositiveUnits, byCodeUnit, termEndMs, type LedgerAttempt, type RulePackGate} from './ledger.js';
import {checkAcademicPlan, type PrerequisiteRule, type VerifiedSection} from './plan.js';

/**
 * simulateStudyPlan (A13, #81): the server-side plan check behind the graduation + plan view.
 * It turns the owner's saved STUDY_PLAN items into PLANNED ledger rows, runs the #62 plan
 * check for one regular term, and returns only what the screen needs: plan issues, the
 * term load, the approved cap, and the planned courses it could not check.
 * It never returns transcript rows, attempt tokens, or grades, and it never changes the ledger.
 * The result is the core part of the #103 OwnerStudyPlanCheckResponse: caveats are its codes,
 * and without an APPROVED pack no confirmed warning is emitted. The server adds evidence
 * links, disclosure, and the approval receipt.
 * Pure: the caller supplies asOf. No clock, network, or storage.
 */

type PlanIssue = AcademicAuditVNext['planIssues'][number];
export type StudyPlanCaveat = OwnerStudyPlanCheckResponse['caveats'][number];
export type StudyPlanItem = Extract<OwnerWorkspaceValue, {kind:'STUDY_PLAN'}>;

export type UncheckedReason = 'TERM_UNDECIDED'|'TERM_ENDED'|'CREDITS_UNKNOWN';

export interface StudyPlanCheckRequest {
  asOf:string;
  /** Regular term to check, `YYYY-1|YYYY-2` (STUDY_PLAN targetTerm has no 계절학기). */
  term:string;
  rulePack:{version:string; state:RulePackGate};
  /** EARNED and IN_PROGRESS rows from the owner's approved transcript. Plans come only from studyPlan. */
  attempts:readonly LedgerAttempt[];
  /** Saved STUDY_PLAN workspace values. Items with planned=false are ignored. */
  studyPlan:readonly unknown[];
  /** Catalog credit units per course id (1 unit = 0.5학점). */
  courseCreditUnits:Readonly<Record<string, number>>;
  /** From the approved rule pack: per-term cap and official prerequisites. */
  termRules:{creditCapUnits:number; capEvidenceRefs:readonly string[]; prerequisites?:readonly PrerequisiteRule[]};
  sections?:readonly VerifiedSection[];
  /** Echoed so the screen can drop a result computed for an older plan or catalog. */
  versions?:Partial<Record<'rulePack'|'plan'|'catalog'|'transcript', string>>;
}

export interface StudyPlanCheck {
  state:'READY'|'NEEDS_REVIEW'|'INSUFFICIENT_DATA';
  asOf:string;
  term:string;
  versions:Partial<Record<'rulePack'|'plan'|'catalog'|'transcript', string>>;
  /** Unique PLANNED + IN_PROGRESS units in the term. Shown apart from earned credits. */
  termLoadCreditUnits:number;
  /** Present only with an APPROVED rule pack. */
  creditCapUnits?:number;
  planIssues:PlanIssue[];
  unchecked:{courseId:string; reason:UncheckedReason}[];
  caveats:StudyPlanCaveat[];
}

const REGULAR_TERM = /^(19|20|21)\d{2}-[12]$/;
const MAX_PLAN_ITEMS = 200;
const VERSION_KEYS = ['rulePack', 'plan', 'catalog', 'transcript'] as const;
const REVIEW_CODES:ReadonlySet<PlanIssue['code']> = new Set(['NEEDS_REVIEW', 'SEARCH_LIMIT_REVIEW']);

/**
 * #62 holds cap and prerequisite blockers under an unapproved pack but still reports a timetable
 * conflict. The #103 wire forbids every confirmed warning without approval, so the conflict is
 * held here too, keeping its reason so the screen can still say the verified sections overlap.
 */
function holdUnapproved(issue:PlanIssue):PlanIssue {
  return issue.code === 'TIMETABLE_CONFLICT' ? {...issue, code:'NEEDS_REVIEW'} : issue;
}

function readPlan(raw:readonly unknown[]):StudyPlanItem[] {
  if (!Array.isArray(raw)) throw new TypeError('studyPlan must be an array');
  if (raw.length > MAX_PLAN_ITEMS) throw new RangeError(`studyPlan accepts at most ${MAX_PLAN_ITEMS} items`);
  return raw.map((item, index) => {
    const parsed = OwnerWorkspaceValueSchema.safeParse(item);
    if (!parsed.success || parsed.data.kind !== 'STUDY_PLAN') throw new TypeError(`studyPlan[${index}] is not a STUDY_PLAN item`);
    return parsed.data;
  });
}

function credits(table:Readonly<Record<string, number>>, courseId:string):number|undefined {
  if (!Object.prototype.hasOwnProperty.call(table, courseId)) return undefined;
  const units = table[courseId];
  assertPositiveUnits(units, `courseCreditUnits of ${courseId}`);
  return units;
}

export function simulateStudyPlan(input:StudyPlanCheckRequest):StudyPlanCheck {
  if (!AS_OF.test(input.asOf) || !Number.isFinite(Date.parse(input.asOf))) {
    throw new TypeError('asOf must be an ISO-8601 datetime with a timezone offset');
  }
  if (!REGULAR_TERM.test(input.term)) throw new TypeError('term must be a regular term YYYY-1 or YYYY-2');
  const asOfMs = Date.parse(input.asOf);
  if (termEndMs(input.term) <= asOfMs) throw new TypeError(`term ${input.term} has already ended by asOf`);

  const versions:StudyPlanCheck['versions'] = {};
  for (const key of VERSION_KEYS) {
    const value = input.versions?.[key];
    if (value === undefined) continue;
    assertId(value, `versions.${key}`);
    versions[key] = value;
  }

  for (const attempt of input.attempts) {
    if (attempt.ledger === 'PLANNED') {
      throw new TypeError(`attempt ${attempt.attemptToken} is PLANNED; plans come only from studyPlan`);
    }
  }

  const unchecked = new Map<string, UncheckedReason>();
  const seen = new Set<string>();
  const planned:LedgerAttempt[] = [];
  for (const item of readPlan(input.studyPlan)) {
    if (!item.planned) continue;
    if (item.targetTerm === 'UNDECIDED') {
      if (!unchecked.has(item.courseId)) unchecked.set(item.courseId, 'TERM_UNDECIDED');
      continue;
    }
    if (termEndMs(item.targetTerm) <= asOfMs) {
      if (!unchecked.has(item.courseId)) unchecked.set(item.courseId, 'TERM_ENDED');
      continue;
    }
    const key = `${item.courseId}\u0000${item.targetTerm}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const units = credits(input.courseCreditUnits, item.courseId);
    if (units === undefined) {
      unchecked.set(item.courseId, 'CREDITS_UNKNOWN');
      continue;
    }
    planned.push({
      attemptToken:`PLAN:${item.courseId}:${item.targetTerm}`,
      canonicalCourseId:item.courseId,
      creditUnits:units,
      ledger:'PLANNED',
      areaIds:[],
      recognition:'RECOGNIZED',
      term:item.targetTerm,
    });
  }

  const {audit, termLoadCreditUnits} = checkAcademicPlan({
    asOf:input.asOf,
    rulePackVersion:input.rulePack.version,
    rulePackState:input.rulePack.state,
    attempts:[...input.attempts, ...planned],
    requirements:[],
    termPlan:{
      term:input.term,
      creditCapUnits:input.termRules.creditCapUnits,
      capEvidenceRefs:input.termRules.capEvidenceRefs,
      ...(input.termRules.prerequisites === undefined ? {} : {prerequisites:input.termRules.prerequisites}),
      ...(input.sections === undefined ? {} : {sections:input.sections}),
    },
  });

  const approved = input.rulePack.state === 'APPROVED';
  const planIssues = approved ? audit.planIssues : audit.planIssues.map(holdUnapproved);
  const uncheckedRows = [...unchecked].map(([courseId, reason]) => ({courseId, reason}))
    .sort((a, b) => byCodeUnit(a.courseId, b.courseId));
  const sectionsUnconfirmed = planIssues.some(issue => issue.reasonCode === 'COURSE_NOT_CONFIRMED');
  // READY on the wire needs every version, so a result the screen cannot tie to its inputs is held.
  const versionsComplete = VERSION_KEYS.every(key => versions[key] !== undefined);
  let state:StudyPlanCheck['state'];
  if (input.rulePack.state === 'MISSING') state = 'INSUFFICIENT_DATA';
  else if (!approved || audit.state !== 'READY' || uncheckedRows.length > 0 || !versionsComplete
    || planIssues.some(issue => REVIEW_CODES.has(issue.code))) state = 'NEEDS_REVIEW';
  else state = 'READY';

  const caveats:StudyPlanCaveat[] = ['NOT_OFFICIAL_REGISTRATION', 'NOT_GRADUATION_DECISION'];
  if (!approved) caveats.push('RULEPACK_UNVERIFIED');
  if (sectionsUnconfirmed) caveats.push('SECTIONS_UNCONFIRMED');
  if (uncheckedRows.length > 0) caveats.push('PLAN_PARTIALLY_CHECKED');

  const result:StudyPlanCheck = {
    state, asOf:input.asOf, term:input.term, versions,
    termLoadCreditUnits,
    planIssues,
    unchecked:uncheckedRows,
    caveats,
  };
  if (approved) result.creditCapUnits = input.termRules.creditCapUnits;
  return result;
}
