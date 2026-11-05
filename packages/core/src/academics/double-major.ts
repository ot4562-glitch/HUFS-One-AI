import {AcademicAuditVNextSchema, type AcademicAuditVNext} from '@hufs-one/contracts';
import {assertId, assertUnits, buildAcademicLedger, type LedgerAttempt, type LedgerRequirement, type RulePackGate} from './ledger.js';

/**
 * buildDoubleMajorAudit (#144): the current primary major and the double major the student
 * actually chose, checked side by side on one transcript. Not a hypothetical change (#82).
 *
 * Each major's rule pack runs through buildAcademicLedger on the same attempts, with its own
 * course-to-area allocation, so the unique total still counts every course once.
 * A counted course that both packs use is shared. Without an approved overlap rule it is not
 * known whether that course may count for both, so each row a shared course feeds is worked out
 * twice, with and without the shared courses. A row whose result is the same either way keeps
 * it; a row whose result depends on the overlap is held as NEEDS_REVIEW in either major. Both
 * sets of figures are reported. An approved rule covers the overlap only while all shared
 * credits fit its limit. Nothing here is a graduation decision.
 * Pure: the caller supplies asOf. No clock, network, or storage.
 */

/** The transcript row without an area list: areas belong to each pack, not to the attempt. */
export type DoubleMajorAttempt = Omit<LedgerAttempt, 'areaIds'>;

export interface MajorRulePack {
  rulePackVersion:string;
  rulePackState:RulePackGate;
  requirements:readonly LedgerRequirement[];
  /** This pack's official allocation: course id to its areas in this pack. */
  courseAreas:Readonly<Record<string, readonly string[]>>;
}

/** An official rule on how many credits may count toward both majors. */
export interface OverlapRule {
  maxSharedCreditUnits:number;
  evidenceRefs:readonly string[];
}

export type DoubleMajorSelection =
  | {status:'NONE'}
  | {status:'UNSET'}
  | {status:'SELECTED'; pack?:MajorRulePack & {overlapRule?:OverlapRule}};

export interface DoubleMajorRequest {
  asOf:string;
  attempts:readonly DoubleMajorAttempt[];
  primary:MajorRulePack;
  doubleMajor:DoubleMajorSelection;
}

export interface SharedCourse {
  courseId:string;
  ledger:LedgerAttempt['ledger'];
  creditUnits:number;
  primaryAreaIds:string[];
  doubleMajorAreaIds:string[];
}

export type OverlapStatus = 'NONE'|'NO_APPROVED_RULE'|'COVERED_BY_APPROVED_RULE'|'OVER_APPROVED_LIMIT';

/**
 * One requirement row a shared course feeds, worked out with and without the shared courses.
 * `met` uses earned credit only, like the ledger. The without-shared figures are the
 * conservative reading if the overlap is not allowed.
 */
export interface OverlapRowImpact {
  requirementId:string;
  /** The row's result is the same with or without the shared courses. */
  decided:boolean;
  metWithShared:boolean;
  metWithoutShared:boolean;
  earnedCreditUnitsWithoutShared?:number;
  remainingCreditUnitsWithoutShared?:number;
  projectedCreditUnitsWithoutShared?:number;
  matchedCoursesCountWithoutShared?:number;
}

export interface DoubleMajorAudit {
  state:'READY'|'NEEDS_REVIEW'|'INSUFFICIENT_DATA';
  asOf:string;
  /** One transcript: each course counts once, whichever majors use it. */
  uniqueCredits:{earnedCreditUnits:number; inProgressCreditUnits:number; plannedCreditUnits:number; projectedCreditUnits:number};
  primary:AcademicAuditVNext;
  doubleMajor:
    | {status:'NOT_APPLICABLE'}
    | {status:'INPUT_REQUIRED'}
    | {status:'RULES_MISSING'}
    | {status:'CHECKED'; audit:AcademicAuditVNext};
  overlap:{
    status:OverlapStatus;
    sharedCourses:SharedCourse[];
    /** Every slot: earned, in progress, and planned shared credits. */
    sharedCreditUnits:number;
    evidenceRefs:string[];
    /** Rows held as NEEDS_REVIEW because their result depends on the overlap. */
    heldRequirementIds:{primary:string[]; doubleMajor:string[]};
    /** Every row a shared course feeds, when the overlap is not covered by an approved rule. */
    rowImpacts:{primary:OverlapRowImpact[]; doubleMajor:OverlapRowImpact[]};
  };
  caveats:string[];
}

const MAX_AREAS_PER_COURSE = 30;

function readAreas(pack:MajorRulePack, label:string):Map<string, string[]> {
  if (!pack.courseAreas || typeof pack.courseAreas !== 'object') throw new TypeError(`${label} courseAreas must be an object`);
  const map = new Map<string, string[]>();
  for (const [courseId, areas] of Object.entries(pack.courseAreas)) {
    assertId(courseId, `${label} course`);
    if (!Array.isArray(areas) || areas.length > MAX_AREAS_PER_COURSE) throw new TypeError(`${label} areas of ${courseId} must be an array`);
    const seen = new Set<string>();
    for (const areaId of areas) {
      assertId(areaId, `${label} area of ${courseId}`);
      if (seen.has(areaId)) throw new TypeError(`${label} repeats area ${areaId} for ${courseId}`);
      seen.add(areaId);
    }
    map.set(courseId, [...areas]);
  }
  return map;
}

/** Courses a pack names directly in a requirement, apart from its area allocation. */
function namedCourses(requirements:readonly LedgerRequirement[]):Set<string> {
  const named = new Set<string>();
  for (const requirement of requirements) {
    if (requirement.kind === 'REQUIRED_COURSE') named.add(requirement.canonicalCourseId);
    if (requirement.kind === 'K_OF_N') for (const courseId of requirement.courseIds) named.add(courseId);
    if (requirement.kind === 'GROUP_CHOICE') for (const courseId of requirement.groups.flat()) named.add(courseId);
  }
  return named;
}

function runPack(asOf:string, attempts:readonly DoubleMajorAttempt[], pack:MajorRulePack, areas:ReadonlyMap<string, string[]>):AcademicAuditVNext {
  return buildAcademicLedger({
    asOf,
    rulePackVersion:pack.rulePackVersion,
    rulePackState:pack.rulePackState,
    attempts:attempts.map(attempt => ({...attempt, areaIds:areas.get(attempt.canonicalCourseId) ?? []})),
    requirements:pack.requirements,
  });
}

/**
 * Each row in this pack that a shared course feeds, worked out with and without the shared
 * courses from the ledger's own figures. Total and non-credit rows never depend on the overlap.
 */
function rowImpacts(requirements:readonly LedgerRequirement[], audit:AcademicAuditVNext,
  shared:ReadonlyMap<string, SharedCourse>, sharedAreas:(course:SharedCourse) => readonly string[],
  withoutShared:AcademicAuditVNext):OverlapRowImpact[] {
  const rows = new Map(audit.requirements.map(row => [row.requirementId, row]));
  const earned = (course:SharedCourse) => course.ledger === 'EARNED';
  const impacts:OverlapRowImpact[] = [];
  for (const requirement of requirements) {
    const row = rows.get(requirement.id);
    if (!row) continue;
    if (requirement.kind === 'CATEGORY_MINIMUM') {
      const inArea = [...shared.values()].filter(course => sharedAreas(course).includes(requirement.areaId));
      if (inArea.length === 0) continue;
      const earnedWith = row.earnedCreditUnits ?? 0;
      const earnedWithout = earnedWith - inArea.filter(earned).reduce((sum, course) => sum + course.creditUnits, 0);
      const projectedWithout = (row.projectedCreditUnits ?? 0) - inArea.reduce((sum, course) => sum + course.creditUnits, 0);
      const metWithShared = earnedWith >= requirement.requiredCreditUnits;
      const metWithoutShared = earnedWithout >= requirement.requiredCreditUnits;
      impacts.push({requirementId:requirement.id, decided:metWithShared === metWithoutShared, metWithShared, metWithoutShared,
        earnedCreditUnitsWithoutShared:earnedWithout,
        remainingCreditUnitsWithoutShared:Math.max(0, requirement.requiredCreditUnits - earnedWithout),
        projectedCreditUnitsWithoutShared:projectedWithout});
    } else if (requirement.kind === 'REQUIRED_COURSE') {
      const course = shared.get(requirement.canonicalCourseId);
      if (!course) continue;
      const metWithShared = earned(course);
      impacts.push({requirementId:requirement.id, decided:!metWithShared, metWithShared, metWithoutShared:false});
    } else if (requirement.kind === 'AREA_SPREAD' || requirement.kind === 'GROUP_CHOICE') {
      const contributes = requirement.kind === 'AREA_SPREAD'
        ? [...shared.values()].some(course => sharedAreas(course).some(id => requirement.areaIds.includes(id)))
        : requirement.groups.some(group => group.some(id => shared.has(id)));
      if (!contributes) continue;
      const without = withoutShared.requirements.find(item => item.requirementId === requirement.id)!;
      const metWithShared = row.state === 'SATISFIED', metWithoutShared = without.state === 'SATISFIED';
      impacts.push({requirementId:requirement.id,
        decided:row.state !== 'NEEDS_REVIEW' && without.state !== 'NEEDS_REVIEW' && metWithShared === metWithoutShared,
        metWithShared, metWithoutShared});
    } else if (requirement.kind === 'K_OF_N') {
      const inList = requirement.courseIds.flatMap(courseId => shared.get(courseId) ?? []);
      if (inList.length === 0) continue;
      const matchedWith = row.matchedCoursesCount ?? 0;
      const matchedWithout = matchedWith - inList.filter(earned).length;
      const metWithShared = matchedWith >= requirement.k;
      const metWithoutShared = matchedWithout >= requirement.k;
      impacts.push({requirementId:requirement.id, decided:metWithShared === metWithoutShared, metWithShared, metWithoutShared,
        matchedCoursesCountWithoutShared:matchedWithout});
    }
  }
  return impacts;
}

function hold(audit:AcademicAuditVNext, ids:readonly string[], caveat:string):AcademicAuditVNext {
  if (ids.length === 0) return audit;
  const held = new Set(ids);
  const requirements = audit.requirements.map(row =>
    held.has(row.requirementId) && row.state !== 'NOT_CHECKED' ? {...row, state:'NEEDS_REVIEW' as const} : row);
  const state = audit.state === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT_DATA' : 'NEEDS_REVIEW';
  const parsed = AcademicAuditVNextSchema.safeParse({...audit, state, requirements, caveats:[...audit.caveats, caveat]});
  if (!parsed.success) {
    throw new TypeError(`double-major result is not a valid audit: ${parsed.error.issues.map(issue => issue.message).join('; ')}`);
  }
  return parsed.data;
}

export function buildDoubleMajorAudit(input:DoubleMajorRequest):DoubleMajorAudit {
  if (!Array.isArray(input.attempts)) throw new TypeError('attempts must be an array');
  for (const attempt of input.attempts) {
    if (Object.prototype.hasOwnProperty.call(attempt, 'areaIds')) {
      throw new TypeError(`${attempt.attemptToken} carries areaIds; areas come from each major's courseAreas`);
    }
  }
  const primaryAreas = readAreas(input.primary, 'primary');
  const primaryRaw = runPack(input.asOf, input.attempts, input.primary, primaryAreas);
  const uniqueCredits = {
    earnedCreditUnits:primaryRaw.earnedCreditUnits,
    inProgressCreditUnits:primaryRaw.inProgressCreditUnits,
    plannedCreditUnits:primaryRaw.plannedCreditUnits,
    projectedCreditUnits:primaryRaw.projectedUniqueCreditUnits,
  };
  const none = {status:'NONE' as const, sharedCourses:[], sharedCreditUnits:0, evidenceRefs:[],
    heldRequirementIds:{primary:[], doubleMajor:[]}, rowImpacts:{primary:[], doubleMajor:[]}};
  const caveats = ['Primary and double major checked on one transcript; not an official graduation decision.'];

  const selection = input.doubleMajor;
  const packMissing = selection.status === 'SELECTED' && (!selection.pack || selection.pack.rulePackState === 'MISSING');
  if (selection.status === 'NONE' || selection.status === 'UNSET' || packMissing) {
    const doubleMajor = selection.status === 'NONE' ? {status:'NOT_APPLICABLE' as const}
      : selection.status === 'UNSET' ? {status:'INPUT_REQUIRED' as const} : {status:'RULES_MISSING' as const};
    if (doubleMajor.status === 'INPUT_REQUIRED') caveats.push('Double major is not entered yet; only the primary major is shown.');
    if (doubleMajor.status === 'RULES_MISSING') caveats.push('No rule pack for the selected double major; its requirements are not shown.');
    const state = primaryRaw.state === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT_DATA'
      : primaryRaw.state === 'READY' && doubleMajor.status === 'NOT_APPLICABLE' ? 'READY' : 'NEEDS_REVIEW';
    return {state, asOf:input.asOf, uniqueCredits, primary:primaryRaw, doubleMajor, overlap:none, caveats};
  }
  if (selection.status !== 'SELECTED') throw new TypeError('doubleMajor status must be NONE, UNSET, or SELECTED');

  const pack = selection.pack!;
  assertId(pack.rulePackVersion, 'double major rulePackVersion');
  if (pack.rulePackVersion === input.primary.rulePackVersion) {
    throw new TypeError('primary and double major must use different rule packs');
  }
  if (pack.requirements.some(requirement => requirement.kind === 'CREDIT_TOTAL')) {
    throw new TypeError('the double major pack cannot hold the graduation credit total; that belongs to the primary pack');
  }
  const doubleAreas = readAreas(pack, 'double major');
  const doubleRaw = runPack(input.asOf, input.attempts, pack, doubleAreas);
  if (doubleRaw.projectedUniqueCreditUnits !== primaryRaw.projectedUniqueCreditUnits
    || doubleRaw.earnedCreditUnits !== primaryRaw.earnedCreditUnits) {
    throw new Error('both majors must read the same transcript totals');
  }

  // Counted courses only: an attempt the ledger excluded (duplicate, retake, pending, official) is not shared.
  const excluded = new Set(primaryRaw.excludedAttempts.map(row => row.attemptToken));
  const primaryNamed = namedCourses(input.primary.requirements);
  const doubleNamed = namedCourses(pack.requirements);
  const shared = new Map<string, SharedCourse>();
  for (const attempt of input.attempts) {
    if (excluded.has(attempt.attemptToken)) continue;
    const id = attempt.canonicalCourseId;
    const inPrimary = (primaryAreas.get(id)?.length ?? 0) > 0 || primaryNamed.has(id);
    const inDouble = (doubleAreas.get(id)?.length ?? 0) > 0 || doubleNamed.has(id);
    if (!inPrimary || !inDouble) continue;
    shared.set(id, {courseId:id, ledger:attempt.ledger, creditUnits:attempt.creditUnits,
      primaryAreaIds:primaryAreas.get(id) ?? [], doubleMajorAreaIds:doubleAreas.get(id) ?? []});
  }
  let sharedCreditUnits = 0;
  for (const course of shared.values()) {
    sharedCreditUnits += course.creditUnits;
    assertUnits(sharedCreditUnits, 'shared credit units');
  }

  const rule = pack.overlapRule;
  let status:OverlapStatus = 'NONE';
  let evidenceRefs:string[] = [];
  if (shared.size > 0) {
    status = 'NO_APPROVED_RULE';
    if (rule && pack.rulePackState === 'APPROVED') {
      assertUnits(rule.maxSharedCreditUnits, 'overlap maxSharedCreditUnits');
      if (!Array.isArray(rule.evidenceRefs) || rule.evidenceRefs.length === 0) {
        throw new TypeError('an overlap rule needs official evidence');
      }
      for (const ref of rule.evidenceRefs) assertId(ref, 'overlap evidence');
      evidenceRefs = [...rule.evidenceRefs];
      status = sharedCreditUnits <= rule.maxSharedCreditUnits ? 'COVERED_BY_APPROVED_RULE' : 'OVER_APPROVED_LIMIT';
    }
  }

  const covered = status === 'NONE' || status === 'COVERED_BY_APPROVED_RULE';
  const independentAttempts = input.attempts.filter(attempt => !shared.has(attempt.canonicalCourseId));
  const impactsPrimary = covered ? [] : rowImpacts(input.primary.requirements, primaryRaw, shared,
    course => course.primaryAreaIds, runPack(input.asOf, independentAttempts, input.primary, primaryAreas));
  const impactsDouble = covered ? [] : rowImpacts(pack.requirements, doubleRaw, shared,
    course => course.doubleMajorAreaIds, runPack(input.asOf, independentAttempts, pack, doubleAreas));
  const heldPrimary = impactsPrimary.filter(impact => !impact.decided).map(impact => impact.requirementId);
  const heldDouble = impactsDouble.filter(impact => !impact.decided).map(impact => impact.requirementId);
  const reason = status === 'OVER_APPROVED_LIMIT'
    ? 'Shared courses exceed the approved overlap limit; rows whose result depends on them are held for review.'
    : 'A course counts toward both majors without an approved overlap rule; rows whose result depends on it are held for review.';
  const primary = hold(primaryRaw, heldPrimary, reason);
  const doubleAudit = hold(doubleRaw, heldDouble, reason);
  if (!covered) caveats.push(reason);

  let state:DoubleMajorAudit['state'];
  if (primary.state === 'INSUFFICIENT_DATA') state = 'INSUFFICIENT_DATA';
  else if (primary.state === 'READY' && doubleAudit.state === 'READY') state = 'READY';
  else state = 'NEEDS_REVIEW';

  return {
    state, asOf:input.asOf, uniqueCredits, primary,
    doubleMajor:{status:'CHECKED', audit:doubleAudit},
    overlap:{
      status,
      sharedCourses:[...shared.values()].sort((a, b) => (a.courseId < b.courseId ? -1 : a.courseId > b.courseId ? 1 : 0)),
      sharedCreditUnits, evidenceRefs,
      heldRequirementIds:{primary:heldPrimary, doubleMajor:heldDouble},
      rowImpacts:{primary:impactsPrimary, doubleMajor:impactsDouble},
    },
    caveats,
  };
}
