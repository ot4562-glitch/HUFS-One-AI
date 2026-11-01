import {AcademicAuditVNextSchema, type AcademicAuditVNext} from '@hufs-one/contracts';

/**
 * Three credit ledgers (A08.2, A08.5 CREDIT-01..CREDIT-06).
 * 1 credit unit = 0.5학점. A 3학점 course is 6 units. Sums are integer additions only.
 * The same canonical course counts once toward the unique total. Approved area
 * allocation may still apply that one course to every listed area.
 * `asOf` is the caller's instant. This module does not read a clock, a network, or randomness.
 * READY means an approved pack was checked. It is not a graduation decision.
 */

const ID = /^[A-Za-z0-9_.:-]{1,128}$/;
const AS_OF = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export type LedgerSlot = 'EARNED'|'IN_PROGRESS'|'PLANNED';
export type LedgerRecognition = 'RECOGNIZED'|'PENDING'|'EXCLUDED';
export type RulePackGate = 'MISSING'|'DRAFT'|'NEEDS_REVIEW'|'APPROVED';

export interface LedgerAttempt {
  attemptToken:string;
  canonicalCourseId:string;
  /** Non-negative safe integer. 1 unit = 0.5학점. Non-integers are refused, not rounded. */
  creditUnits:number;
  ledger:LedgerSlot;
  /** Official allocation. One course may list several areas; the unique total still counts it once. */
  areaIds:readonly string[];
  recognition:LedgerRecognition;
  /** Academic term `YYYY-1|S|2|W`. Required on both sides of a retake. */
  term?:string;
  /**
   * Explicit approved retake (repeatPolicy EXPLICIT_APPROVED_ATTEMPT).
   * The named attempt is excluded as RETAKE_SUPERSEDED only when both attempts are the
   * same course, both are EARNED, this one is RECOGNIZED in a later term, and
   * `retakeApprovalRef` is present. Otherwise this attempt alone is held as NEEDS_REVIEW
   * and the earlier earned credit stays counted.
   */
  supersedesAttemptToken?:string;
  /** Reference to the official retake approval. A bare supersede link is not enough. */
  retakeApprovalRef?:string;
}

interface RequirementBase {
  id:string;
  /** Copied onto a SATISFIED row. Empty evidence cannot be reported as satisfied. */
  evidenceRefs?:readonly string[];
}

export type LedgerRequirement =
  | (RequirementBase & {kind:'CREDIT_TOTAL'; requiredCreditUnits:number})
  | (RequirementBase & {kind:'CATEGORY_MINIMUM'; areaId:string; requiredCreditUnits:number})
  | (RequirementBase & {kind:'REQUIRED_COURSE'; canonicalCourseId:string})
  | (RequirementBase & {kind:'K_OF_N'; courseIds:readonly string[]; k:number})
  | (RequirementBase & {
    kind:'NON_CREDIT';
    criterionId:string;
    verificationMode:'OFFICIAL'|'MANUAL'|'GPA_NOT_COLLECTED';
  });

export interface AcademicLedgerRequest {
  /** Caller-supplied ISO-8601 datetime with a timezone offset. */
  asOf:string;
  rulePackVersion:string;
  /**
   * MISSING → audit state INSUFFICIENT_DATA.
   * Any other state than APPROVED → NEEDS_REVIEW.
   * Neither state claims graduation, and requirement rows are not marked SATISFIED.
   */
  rulePackState:RulePackGate;
  attempts:readonly LedgerAttempt[];
  requirements:readonly LedgerRequirement[];
}

type ProgressState = 'SATISFIED'|'UNSATISFIED'|'NEEDS_REVIEW'|'NOT_APPLICABLE'|'NOT_CHECKED';
type ExclusionReason = 'RETAKE_SUPERSEDED'|'DUPLICATE'|'PENDING_RECOGNITION'|'OFFICIAL_EXCLUSION'|'NEEDS_REVIEW';

interface ProgressRow {
  requirementId:string;
  state:ProgressState;
  evidenceRefs:string[];
  requiredCreditUnits?:number;
  earnedCreditUnits?:number;
  remainingCreditUnits?:number;
  projectedCreditUnits?:number;
  matchedCoursesCount?:number;
  requiredCoursesCount?:number;
  notCheckedReason?:'GPA_NOT_COLLECTED';
}

interface AreaTotals {
  earned:number;
  projected:number;
}

const SLOT_RANK:Record<LedgerSlot, number> = {EARNED:0, IN_PROGRESS:1, PLANNED:2};
const TERM = /^(\d{4})-(1|S|2|W)$/;
const SEASON_RANK:Record<string, number> = {'1':0, S:1, '2':2, W:3};

function termKey(term:string):number {
  const match = TERM.exec(term);
  if (!match) throw new TypeError(`term must be YYYY-1|S|2|W; refused ${term}`);
  return Number(match[1]) * 4 + SEASON_RANK[match[2]!]!;
}

function isApprovedRetake(target:LedgerAttempt, successor:LedgerAttempt):boolean {
  return target.canonicalCourseId === successor.canonicalCourseId
    && target.ledger === 'EARNED'
    && successor.ledger === 'EARNED'
    && successor.recognition === 'RECOGNIZED'
    && successor.retakeApprovalRef !== undefined
    && target.term !== undefined
    && successor.term !== undefined
    && termKey(successor.term) > termKey(target.term);
}

function refuse(label:string, value:unknown):never {
  throw new TypeError(`${label} must be a non-negative safe integer credit unit (1 unit = 0.5 credit); refused ${String(value)}`);
}

function assertUnits(value:unknown, label:string):asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) refuse(label, value);
}

function assertPositiveUnits(value:unknown, label:string):asserts value is number {
  assertUnits(value, label);
  if (value <= 0) refuse(label, value);
}

function assertId(value:unknown, label:string):asserts value is string {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new TypeError(`${label} must be a synthetic id token`);
  }
}

function addUnits(sum:number, units:number):number {
  const next = sum + units;
  if (!Number.isSafeInteger(next)) refuse('credit unit sum', next);
  return next;
}

function byCodeUnit(a:string, b:string):number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function evidenceOf(requirement:LedgerRequirement):string[] {
  const refs = requirement.evidenceRefs ?? [];
  const seen = new Set<string>();
  for (const ref of refs) {
    assertId(ref, `${requirement.id} evidence`);
    if (seen.has(ref)) throw new TypeError(`${requirement.id} repeats evidence ${ref}`);
    seen.add(ref);
  }
  return [...refs];
}

function applyPackGate(row:ProgressRow, packApproved:boolean):ProgressRow {
  if (row.state === 'NOT_CHECKED') return row;
  if (!packApproved || (row.state === 'SATISFIED' && row.evidenceRefs.length === 0)) {
    return {...row, state:'NEEDS_REVIEW'};
  }
  return row;
}

interface Classified {
  winners:Map<string, LedgerAttempt>;
  reasons:Map<string, ExclusionReason>;
  pendingUnits:number;
  ambiguous:boolean;
}

function classify(attempts:readonly LedgerAttempt[]):Classified {
  const byToken = new Map<string, LedgerAttempt>();
  for (const attempt of attempts) {
    assertId(attempt.attemptToken, 'attemptToken');
    assertId(attempt.canonicalCourseId, 'canonicalCourseId');
    assertUnits(attempt.creditUnits, `creditUnits of ${attempt.attemptToken}`);
    if (attempt.ledger !== 'EARNED' && attempt.ledger !== 'IN_PROGRESS' && attempt.ledger !== 'PLANNED') {
      throw new TypeError(`${attempt.attemptToken} has no ledger slot`);
    }
    if (attempt.recognition !== 'RECOGNIZED' && attempt.recognition !== 'PENDING' && attempt.recognition !== 'EXCLUDED') {
      throw new TypeError(`${attempt.attemptToken} has no recognition`);
    }
    const areas = new Set<string>();
    for (const areaId of attempt.areaIds) {
      assertId(areaId, `${attempt.attemptToken} area`);
      if (areas.has(areaId)) throw new TypeError(`${attempt.attemptToken} repeats area ${areaId}`);
      areas.add(areaId);
    }
    if (attempt.supersedesAttemptToken !== undefined) assertId(attempt.supersedesAttemptToken, 'supersedesAttemptToken');
    if (attempt.retakeApprovalRef !== undefined) assertId(attempt.retakeApprovalRef, 'retakeApprovalRef');
    if (attempt.term !== undefined) termKey(attempt.term);
    if (byToken.has(attempt.attemptToken)) throw new TypeError(`duplicate attempt ${attempt.attemptToken}`);
    byToken.set(attempt.attemptToken, attempt);
  }

  const claimers = new Map<string, string[]>();
  for (const attempt of attempts) {
    const target = attempt.supersedesAttemptToken;
    if (target === undefined) continue;
    const list = claimers.get(target) ?? [];
    list.push(attempt.attemptToken);
    claimers.set(target, list);
  }

  const cycles = new Set<string>();
  for (const attempt of attempts) {
    if (attempt.supersedesAttemptToken === undefined) continue;
    const seen = new Set<string>();
    let cursor:string|undefined = attempt.attemptToken;
    while (cursor !== undefined) {
      if (seen.has(cursor)) {
        for (const token of seen) cycles.add(token);
        break;
      }
      seen.add(cursor);
      cursor = byToken.get(cursor)?.supersedesAttemptToken;
    }
  }

  const needsReview = new Set<string>(cycles);
  const superseded = new Set<string>();
  for (const [target, tokens] of claimers) {
    if (cycles.has(target) || tokens.some(token => cycles.has(token))) continue;
    const targetAttempt = byToken.get(target);
    const successor = tokens.length === 1 ? byToken.get(tokens[0]!) : undefined;
    if (!targetAttempt || !successor || !isApprovedRetake(targetAttempt, successor)) {
      for (const token of tokens) needsReview.add(token);
      continue;
    }
    superseded.add(target);
  }

  const reasons = new Map<string, ExclusionReason>();
  const mark = (token:string, reason:ExclusionReason) => {
    if (!reasons.has(token)) reasons.set(token, reason);
  };

  const recognized = new Map<string, LedgerAttempt[]>();
  const pending = new Map<string, LedgerAttempt[]>();
  for (const attempt of attempts) {
    const token = attempt.attemptToken;
    if (needsReview.has(token)) {
      mark(token, 'NEEDS_REVIEW');
      continue;
    }
    if (superseded.has(token)) {
      mark(token, 'RETAKE_SUPERSEDED');
      continue;
    }
    if (attempt.recognition === 'PENDING') {
      const list = pending.get(attempt.canonicalCourseId) ?? [];
      list.push(attempt);
      pending.set(attempt.canonicalCourseId, list);
      continue;
    }
    if (attempt.recognition === 'EXCLUDED') {
      mark(token, 'OFFICIAL_EXCLUSION');
      continue;
    }
    const list = recognized.get(attempt.canonicalCourseId) ?? [];
    list.push(attempt);
    recognized.set(attempt.canonicalCourseId, list);
  }

  const winners = new Map<string, LedgerAttempt>();
  let ambiguous = needsReview.size > 0;
  const blocked = new Set<string>();
  for (const [courseId, group] of recognized) {
    const bySlot = new Map<LedgerSlot, LedgerAttempt[]>();
    for (const attempt of group) {
      const list = bySlot.get(attempt.ledger) ?? [];
      list.push(attempt);
      bySlot.set(attempt.ledger, list);
    }
    const crowded = [...bySlot.values()].some(list => list.length > 1);
    if (crowded) {
      ambiguous = true;
      blocked.add(courseId);
      for (const attempt of group) mark(attempt.attemptToken, 'NEEDS_REVIEW');
      continue;
    }
    const ordered = [...group].sort((a, b) => SLOT_RANK[a.ledger] - SLOT_RANK[b.ledger]);
    const winner = ordered[0];
    if (!winner) continue;
    winners.set(courseId, winner);
    for (const other of ordered.slice(1)) mark(other.attemptToken, 'DUPLICATE');
  }

  let pendingUnits = 0;
  for (const [courseId, group] of pending) {
    if (group.length !== 1 || winners.has(courseId) || blocked.has(courseId)) {
      if (group.length !== 1 || blocked.has(courseId)) ambiguous = true;
      const reason:ExclusionReason = winners.has(courseId) && group.length === 1 ? 'DUPLICATE' : 'NEEDS_REVIEW';
      for (const attempt of group) mark(attempt.attemptToken, reason);
      continue;
    }
    const only = group[0]!;
    pendingUnits = addUnits(pendingUnits, only.creditUnits);
    mark(only.attemptToken, 'PENDING_RECOGNITION');
  }

  return {winners, reasons, pendingUnits, ambiguous};
}

function evaluateRequirement(
  requirement:LedgerRequirement,
  earned:number,
  projected:number,
  areas:ReadonlyMap<string, AreaTotals>,
  winners:ReadonlyMap<string, LedgerAttempt>,
):ProgressRow {
  assertId(requirement.id, 'requirement id');
  const evidenceRefs = evidenceOf(requirement);
  if (requirement.kind === 'NON_CREDIT') {
    assertId(requirement.criterionId, `${requirement.id} criterion`);
    if (requirement.verificationMode === 'GPA_NOT_COLLECTED') {
      return {
        requirementId:requirement.id,
        state:'NOT_CHECKED',
        notCheckedReason:'GPA_NOT_COLLECTED',
        evidenceRefs:[],
      };
    }
    return {requirementId:requirement.id, state:'NEEDS_REVIEW', evidenceRefs};
  }
  if (requirement.kind === 'CREDIT_TOTAL') {
    assertPositiveUnits(requirement.requiredCreditUnits, `${requirement.id} requiredCreditUnits`);
    const remaining = Math.max(0, requirement.requiredCreditUnits - earned);
    return {
      requirementId:requirement.id,
      state:earned >= requirement.requiredCreditUnits ? 'SATISFIED' : 'UNSATISFIED',
      requiredCreditUnits:requirement.requiredCreditUnits,
      earnedCreditUnits:earned,
      remainingCreditUnits:remaining,
      projectedCreditUnits:projected,
      evidenceRefs,
    };
  }
  if (requirement.kind === 'CATEGORY_MINIMUM') {
    assertId(requirement.areaId, `${requirement.id} area`);
    assertPositiveUnits(requirement.requiredCreditUnits, `${requirement.id} requiredCreditUnits`);
    const area = areas.get(requirement.areaId) ?? {earned:0, projected:0};
    const remaining = Math.max(0, requirement.requiredCreditUnits - area.earned);
    return {
      requirementId:requirement.id,
      state:area.earned >= requirement.requiredCreditUnits ? 'SATISFIED' : 'UNSATISFIED',
      requiredCreditUnits:requirement.requiredCreditUnits,
      earnedCreditUnits:area.earned,
      remainingCreditUnits:remaining,
      projectedCreditUnits:area.projected,
      evidenceRefs,
    };
  }
  if (requirement.kind === 'REQUIRED_COURSE') {
    assertId(requirement.canonicalCourseId, `${requirement.id} course`);
    const winner = winners.get(requirement.canonicalCourseId);
    const satisfied = winner?.ledger === 'EARNED';
    return {
      requirementId:requirement.id,
      state:satisfied ? 'SATISFIED' : 'UNSATISFIED',
      evidenceRefs,
    };
  }
  const seen = new Set<string>();
  if (requirement.courseIds.length < 2) throw new TypeError(`${requirement.id} needs at least two courses`);
  for (const courseId of requirement.courseIds) {
    assertId(courseId, `${requirement.id} course`);
    if (seen.has(courseId)) throw new TypeError(`${requirement.id} repeats course ${courseId}`);
    seen.add(courseId);
  }
  assertPositiveUnits(requirement.k, `${requirement.id} k`);
  if (requirement.k > requirement.courseIds.length) throw new TypeError(`${requirement.id} k exceeds its courses`);
  let matchedCoursesCount = 0;
  let matchedUnits = 0;
  for (const courseId of requirement.courseIds) {
    const winner = winners.get(courseId);
    if (winner?.ledger !== 'EARNED') continue;
    matchedCoursesCount += 1;
    matchedUnits = addUnits(matchedUnits, winner.creditUnits);
  }
  const row:ProgressRow = {
    requirementId:requirement.id,
    state:matchedCoursesCount >= requirement.k ? 'SATISFIED' : 'UNSATISFIED',
    earnedCreditUnits:matchedUnits,
    matchedCoursesCount,
    evidenceRefs,
  };
  if (matchedCoursesCount <= requirement.k) row.requiredCoursesCount = requirement.k;
  return row;
}

/**
 * Compute unique earned / in-progress / planned credits and the requirement rows
 * for A08.5 CREDIT-01 through CREDIT-06. Non-integer units throw; they are not coerced.
 */
export function buildAcademicLedger(input:AcademicLedgerRequest):AcademicAuditVNext {
  if (!AS_OF.test(input.asOf) || !Number.isFinite(Date.parse(input.asOf))) {
    throw new TypeError('asOf must be an ISO-8601 datetime with a timezone offset');
  }
  assertId(input.rulePackVersion, 'rulePackVersion');
  if (!Array.isArray(input.attempts) || !Array.isArray(input.requirements)) {
    throw new TypeError('attempts and requirements must be arrays');
  }
  if (input.requirements.length > 200) throw new RangeError('too many requirements');

  const seenRequirements = new Set<string>();
  for (const requirement of input.requirements) {
    if (seenRequirements.has(requirement.id)) throw new TypeError(`duplicate requirement ${requirement.id}`);
    seenRequirements.add(requirement.id);
  }

  const {winners, reasons, pendingUnits, ambiguous} = classify(input.attempts);
  if (reasons.size > 150) throw new RangeError('too many excluded attempts');

  let earned = 0;
  let inProgress = 0;
  let planned = 0;
  const areas = new Map<string, AreaTotals>();
  const winnerList = [...winners.values()].sort((a, b) => byCodeUnit(a.canonicalCourseId, b.canonicalCourseId));
  for (const winner of winnerList) {
    if (winner.ledger === 'EARNED') earned = addUnits(earned, winner.creditUnits);
    else if (winner.ledger === 'IN_PROGRESS') inProgress = addUnits(inProgress, winner.creditUnits);
    else planned = addUnits(planned, winner.creditUnits);
    for (const areaId of winner.areaIds) {
      const area = areas.get(areaId) ?? {earned:0, projected:0};
      area.projected = addUnits(area.projected, winner.creditUnits);
      if (winner.ledger === 'EARNED') area.earned = addUnits(area.earned, winner.creditUnits);
      areas.set(areaId, area);
    }
  }
  if (areas.size > 30) throw new RangeError('too many areas');
  const projected = addUnits(addUnits(earned, inProgress), planned);
  const packApproved = input.rulePackState === 'APPROVED';

  const requirements = input.requirements.map(requirement => applyPackGate(
    evaluateRequirement(requirement, earned, projected, areas, winners),
    packApproved,
  ));

  const excludedAttempts = input.attempts.flatMap(attempt => {
    const reason = reasons.get(attempt.attemptToken);
    return reason ? [{attemptToken:attempt.attemptToken, reason}] : [];
  });
  const areaProgress = [...areas.entries()]
    .sort((a, b) => byCodeUnit(a[0], b[0]))
    .map(([areaId, area]) => ({
      areaId,
      earnedCreditUnits:area.earned,
      projectedCreditUnits:area.projected,
    }));

  const caveats = ['Computed credit ledger only; not an official graduation decision.'];
  if (input.rulePackState === 'MISSING') caveats.push('Approved rule pack is missing; graduation is not claimed.');
  else if (!packApproved) caveats.push('Rule pack is not APPROVED; graduation is not claimed.');
  if (ambiguous) caveats.push('Repeated attempts need one explicit approved retake before they can count.');

  let state:AcademicAuditVNext['state'];
  if (input.rulePackState === 'MISSING') state = 'INSUFFICIENT_DATA';
  else if (!packApproved || ambiguous || requirements.some(row => row.state === 'NEEDS_REVIEW' || row.state === 'NOT_CHECKED')) {
    state = 'NEEDS_REVIEW';
  } else state = 'READY';

  const parsed = AcademicAuditVNextSchema.safeParse({
    state,
    rulePackVersion:input.rulePackVersion,
    asOf:input.asOf,
    earnedCreditUnits:earned,
    inProgressCreditUnits:inProgress,
    plannedCreditUnits:planned,
    projectedUniqueCreditUnits:projected,
    pendingRecognitionCreditUnits:pendingUnits,
    areaProgress,
    excludedAttempts,
    requirements,
    planIssues:[],
    caveats,
  });
  if (!parsed.success) {
    throw new TypeError(`academic ledger result is not a valid audit: ${parsed.error.issues.map(issue => issue.message).join('; ')}`);
  }
  return parsed.data;
}
