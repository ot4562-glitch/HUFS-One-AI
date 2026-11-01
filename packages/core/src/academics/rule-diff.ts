import {
  AcademicRulePackVNextSchema,
  stableAcademicRequirementIdsVNext,
  type AcademicAuditVNext,
  type AcademicRulePackVNext,
} from '@hufs-one/contracts';
import {AS_OF, buildAcademicLedger, byCodeUnit, type LedgerAttempt, type LedgerRequirement} from './ledger.js';

/**
 * RulePack revision impact (#87). Applies two APPROVED versions of one rule pack to the same
 * credit ledger and reports, per stable requirement id, how the rule and its result changed.
 * It never activates either pack and never decides graduation.
 * A pair that is not one clean revision is blocked: no row is returned, so a stale SATISFIED
 * result cannot be carried across an unverified change.
 * Pure: the caller supplies asOf. No clock, network, or storage.
 */

type Pack = AcademicRulePackVNext;
type Requirement = Pack['requirements'][number];
type ProgressRow = AcademicAuditVNext['requirements'][number];
type ProgressState = ProgressRow['state'];

export type RevisionBlockerCode =
  | 'NOT_APPROVED'
  | 'NOT_APPROVED_BY_AS_OF'
  | 'SAME_VERSION'
  | 'NOT_SUPERSEDING'
  | 'REQUIREMENT_ID_UNSTABLE'
  | 'SCOPE_MISMATCH'
  | 'HISTORY_INVERTED'
  | 'EFFECTIVE_GAP'
  | 'EFFECTIVE_OVERLAP';

export interface RevisionBlocker {
  code:RevisionBlockerCode;
  /** Which input it concerns, when only one side is at fault. */
  side?:'previous'|'next';
}

export type DefinitionChange = 'UNCHANGED'|'CHANGED'|'ADDED'|'REMOVED';
/** SAME, GAINED (now satisfied), LOST (no longer satisfied), or UNKNOWN when either side is unverified. */
export type StateChange = 'SAME'|'GAINED'|'LOST'|'UNKNOWN';
export type ChangedField =
  | 'kind'|'requiredCreditUnits'|'areaId'|'canonicalCourseId'|'courseIds'|'k'
  | 'criterionId'|'verificationMode'|'sourceClauseIds'|'exceptionClauseIds'|'clauses';

interface SideResult {
  state:ProgressState;
  requiredCreditUnits?:number;
  earnedCreditUnits?:number;
  remainingCreditUnits?:number;
  projectedCreditUnits?:number;
  /** Source and exception clause ids, sorted. */
  clauseIds:string[];
}

export interface RequirementRevision {
  requirementId:string;
  semanticKey:string;
  definition:DefinitionChange;
  changedFields:ChangedField[];
  /** Present only when the requirement exists in both versions. */
  stateChange?:StateChange;
  previous?:SideResult;
  next?:SideResult;
}

export interface RulePackRevisionDiff {
  state:'READY'|'NEEDS_REVIEW';
  asOf:string;
  previousVersion?:string;
  nextVersion?:string;
  /** AMENDMENT replaces the previous version from next.effectiveFrom; CORRECTION re-issues the same period. */
  revisionKind?:'AMENDMENT'|'CORRECTION';
  /** Which version is in effect at asOf: effectiveFrom <= asOf < effectiveUntil, as in #70. */
  inEffectAtAsOf:'PREVIOUS'|'NEXT'|'NONE'|'BOTH';
  blockers:RevisionBlocker[];
  requirements:RequirementRevision[];
  caveats:string[];
}

export interface RulePackRevisionRequest {
  asOf:string;
  previous:unknown;
  next:unknown;
  /** The same ledger rows are applied to both versions. */
  attempts:readonly LedgerAttempt[];
}

const UNVERIFIED:ReadonlySet<ProgressState> = new Set(['NEEDS_REVIEW', 'NOT_CHECKED', 'NOT_APPLICABLE']);

function toLedger(requirement:Requirement):LedgerRequirement {
  const base = {id:requirement.id, evidenceRefs:requirement.evidenceRefs};
  switch (requirement.kind) {
    case 'CREDIT_TOTAL': return {...base, kind:'CREDIT_TOTAL', requiredCreditUnits:requirement.requiredCreditUnits};
    case 'CATEGORY_MINIMUM':
      return {...base, kind:'CATEGORY_MINIMUM', areaId:requirement.areaId, requiredCreditUnits:requirement.requiredCreditUnits};
    case 'REQUIRED_COURSE': return {...base, kind:'REQUIRED_COURSE', canonicalCourseId:requirement.canonicalCourseId};
    case 'K_OF_N': return {...base, kind:'K_OF_N', courseIds:requirement.courseIds, k:requirement.k};
    case 'NON_CREDIT':
      return {...base, kind:'NON_CREDIT', criterionId:requirement.criterionId, verificationMode:requirement.verificationMode};
  }
}

function sorted(values:readonly string[]):string[] {
  return [...values].sort(byCodeUnit);
}

function sameList(a:readonly string[], b:readonly string[]):boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** Rule fields that decide the result. evidenceRefs is provenance and is not compared. */
function ruleFields(requirement:Requirement):Partial<Record<ChangedField, string>> {
  const fields:Partial<Record<ChangedField, string>> = {
    kind:requirement.kind,
    sourceClauseIds:sorted(requirement.sourceClauseIds).join('\u0000'),
    exceptionClauseIds:sorted(requirement.exceptionClauseIds).join('\u0000'),
  };
  if (requirement.kind === 'CREDIT_TOTAL') fields.requiredCreditUnits = String(requirement.requiredCreditUnits);
  if (requirement.kind === 'CATEGORY_MINIMUM') {
    fields.areaId = requirement.areaId;
    fields.requiredCreditUnits = String(requirement.requiredCreditUnits);
  }
  if (requirement.kind === 'REQUIRED_COURSE') fields.canonicalCourseId = requirement.canonicalCourseId;
  if (requirement.kind === 'K_OF_N') {
    fields.courseIds = sorted(requirement.courseIds).join('\u0000');
    fields.k = String(requirement.k);
  }
  if (requirement.kind === 'NON_CREDIT') {
    fields.criterionId = requirement.criterionId;
    fields.verificationMode = requirement.verificationMode;
  }
  return fields;
}

const FIELD_ORDER:readonly ChangedField[] = [
  'kind', 'requiredCreditUnits', 'areaId', 'canonicalCourseId', 'courseIds', 'k',
  'criterionId', 'verificationMode', 'sourceClauseIds', 'exceptionClauseIds', 'clauses',
];

function clauseIdsOf(requirement:Requirement):string[] {
  return sorted([...new Set([...requirement.sourceClauseIds, ...requirement.exceptionClauseIds])]);
}

/** Same clause ids can still point at re-worded text: compare kind and source span. */
function clausesReworded(previous:Pack, next:Pack, ids:readonly string[]):boolean {
  const before = new Map(previous.clauseInventory.map(clause => [clause.clauseId, clause]));
  const after = new Map(next.clauseInventory.map(clause => [clause.clauseId, clause]));
  return ids.some(id => {
    const a = before.get(id), b = after.get(id);
    return !a || !b || a.kind !== b.kind || a.sourceSpanRef !== b.sourceSpanRef;
  });
}

function changedFields(previous:Pack, next:Pack, a:Requirement, b:Requirement):ChangedField[] {
  const before = ruleFields(a), after = ruleFields(b);
  const changed = FIELD_ORDER.filter(field => field !== 'clauses' && before[field] !== after[field]);
  const ids = clauseIdsOf(a);
  if (sameList(ids, clauseIdsOf(b)) && clausesReworded(previous, next, ids)) changed.push('clauses');
  return changed;
}

function side(requirement:Requirement, row:ProgressRow):SideResult {
  const result:SideResult = {state:row.state, clauseIds:clauseIdsOf(requirement)};
  if (row.requiredCreditUnits !== undefined) result.requiredCreditUnits = row.requiredCreditUnits;
  if (row.earnedCreditUnits !== undefined) result.earnedCreditUnits = row.earnedCreditUnits;
  if (row.remainingCreditUnits !== undefined) result.remainingCreditUnits = row.remainingCreditUnits;
  if (row.projectedCreditUnits !== undefined) result.projectedCreditUnits = row.projectedCreditUnits;
  return result;
}

function stateChange(before:ProgressState, after:ProgressState):StateChange {
  if (UNVERIFIED.has(before) || UNVERIFIED.has(after)) return 'UNKNOWN';
  if (before === after) return 'SAME';
  return after === 'SATISFIED' ? 'GAINED' : 'LOST';
}

function inEffect(pack:Pack, asOfMs:number):boolean {
  return Date.parse(pack.effectiveFrom) <= asOfMs
    && (pack.effectiveUntil === undefined || asOfMs < Date.parse(pack.effectiveUntil));
}

function sameScope(a:Pack['scope'], b:Pack['scope']):boolean {
  return a.campus === b.campus && a.primaryMajor === b.primaryMajor
    && a.secondaryMajor === b.secondaryMajor && a.majorRole === b.majorRole
    && a.admissionType === b.admissionType && a.curriculumVersion === b.curriculumVersion
    && a.cohortFrom === b.cohortFrom && a.cohortTo === b.cohortTo;
}

function approvedPack(raw:unknown, sideName:'previous'|'next', asOfMs:number, blockers:RevisionBlocker[]):Pack|undefined {
  const parsed = AcademicRulePackVNextSchema.safeParse(raw);
  if (!parsed.success || parsed.data.state !== 'APPROVED' || !parsed.data.approvedAt) {
    blockers.push({code:'NOT_APPROVED', side:sideName});
    return undefined;
  }
  const pack = parsed.data;
  if (Date.parse(pack.approvedAt!) > asOfMs || Date.parse(pack.sourcePublishedAt) > asOfMs
    || (pack.validationReport && Date.parse(pack.validationReport.checkedAt) > asOfMs)) {
    blockers.push({code:'NOT_APPROVED_BY_AS_OF', side:sideName});
  }
  return pack;
}

/** Revision checks. Returns the kind when the pair is one clean step. */
function checkRevision(previous:Pack, next:Pack, blockers:RevisionBlocker[]):'AMENDMENT'|'CORRECTION'|undefined {
  if (previous.version === next.version) {
    blockers.push({code:'SAME_VERSION'});
    return undefined;
  }
  if (next.supersedesVersion !== previous.version) blockers.push({code:'NOT_SUPERSEDING', side:'next'});
  else if (!stableAcademicRequirementIdsVNext(previous, next)) blockers.push({code:'REQUIREMENT_ID_UNSTABLE', side:'next'});
  if (!sameScope(previous.scope, next.scope)) blockers.push({code:'SCOPE_MISMATCH'});

  const fromPrev = Date.parse(previous.effectiveFrom), fromNext = Date.parse(next.effectiveFrom);
  if (fromNext < fromPrev || Date.parse(next.approvedAt!) < Date.parse(previous.approvedAt!)) {
    blockers.push({code:'HISTORY_INVERTED'});
    return undefined;
  }
  if (fromNext === fromPrev) {
    // A correction re-issues the same period; any other shape is ambiguous.
    if (previous.effectiveUntil !== next.effectiveUntil) blockers.push({code:'EFFECTIVE_OVERLAP'});
    return 'CORRECTION';
  }
  if (previous.effectiveUntil === undefined || Date.parse(previous.effectiveUntil) > fromNext) {
    blockers.push({code:'EFFECTIVE_OVERLAP'});
  } else if (Date.parse(previous.effectiveUntil) < fromNext) {
    blockers.push({code:'EFFECTIVE_GAP'});
  }
  return 'AMENDMENT';
}

function blocked(asOf:string, blockers:RevisionBlocker[], inEffectAtAsOf:RulePackRevisionDiff['inEffectAtAsOf'],
  previous?:Pack, next?:Pack):RulePackRevisionDiff {
  const result:RulePackRevisionDiff = {
    state:'NEEDS_REVIEW', asOf, inEffectAtAsOf, blockers, requirements:[],
    caveats:['Revision comparison is blocked; no requirement result is carried across this change.'],
  };
  if (previous) result.previousVersion = previous.version;
  if (next) result.nextVersion = next.version;
  return result;
}

/**
 * Compare two APPROVED versions of one rule pack on the same ledger rows.
 * Each requirement row equals buildAcademicLedger's row for that version.
 */
export function compareRulePackRevisions(input:RulePackRevisionRequest):RulePackRevisionDiff {
  if (!AS_OF.test(input.asOf) || !Number.isFinite(Date.parse(input.asOf))) {
    throw new TypeError('asOf must be an ISO-8601 datetime with a timezone offset');
  }
  const asOfMs = Date.parse(input.asOf);
  const blockers:RevisionBlocker[] = [];
  const previous = approvedPack(input.previous, 'previous', asOfMs, blockers);
  const next = approvedPack(input.next, 'next', asOfMs, blockers);

  const prevOn = previous ? inEffect(previous, asOfMs) : false;
  const nextOn = next ? inEffect(next, asOfMs) : false;
  const inEffectAtAsOf = prevOn && nextOn ? 'BOTH' : prevOn ? 'PREVIOUS' : nextOn ? 'NEXT' : 'NONE';
  if (!previous || !next) return blocked(input.asOf, blockers, inEffectAtAsOf, previous, next);

  const revisionKind = checkRevision(previous, next, blockers);
  if (blockers.length > 0) return blocked(input.asOf, blockers, inEffectAtAsOf, previous, next);

  const audit = (pack:Pack) => buildAcademicLedger({
    asOf:input.asOf,
    rulePackVersion:pack.version,
    rulePackState:'APPROVED',
    attempts:input.attempts,
    requirements:pack.requirements.map(toLedger),
  });
  const before = audit(previous), after = audit(next);
  const rowsBefore = new Map(before.requirements.map(row => [row.requirementId, row]));
  const rowsAfter = new Map(after.requirements.map(row => [row.requirementId, row]));
  const reqBefore = new Map(previous.requirements.map(req => [req.id, req]));
  const reqAfter = new Map(next.requirements.map(req => [req.id, req]));

  const ids = sorted([...new Set([...reqBefore.keys(), ...reqAfter.keys()])]);
  const requirements = ids.map((id):RequirementRevision => {
    const a = reqBefore.get(id), b = reqAfter.get(id);
    if (a && b) {
      const fields = changedFields(previous, next, a, b);
      const prevSide = side(a, rowsBefore.get(id)!), nextSide = side(b, rowsAfter.get(id)!);
      return {
        requirementId:id, semanticKey:b.semanticKey,
        definition:fields.length > 0 ? 'CHANGED' : 'UNCHANGED',
        changedFields:fields,
        stateChange:stateChange(prevSide.state, nextSide.state),
        previous:prevSide, next:nextSide,
      };
    }
    if (b) return {requirementId:id, semanticKey:b.semanticKey, definition:'ADDED', changedFields:[], next:side(b, rowsAfter.get(id)!)};
    return {requirementId:id, semanticKey:a!.semanticKey, definition:'REMOVED', changedFields:[], previous:side(a!, rowsBefore.get(id)!)};
  });

  const unverified = before.state !== 'READY' || after.state !== 'READY'
    || requirements.some(row => row.stateChange === 'UNKNOWN');
  const caveats = ['Comparison only; neither pack is activated and no graduation decision is made.'];
  if (requirements.some(row => row.stateChange === 'LOST')) {
    caveats.push('Some requirements satisfied under the previous version are not satisfied under the next one.');
  }
  if (unverified) caveats.push('Some results are unverified on at least one side; their change is UNKNOWN.');
  return {
    state:unverified ? 'NEEDS_REVIEW' : 'READY',
    asOf:input.asOf,
    previousVersion:previous.version,
    nextVersion:next.version,
    revisionKind:revisionKind!,
    inEffectAtAsOf,
    blockers:[],
    requirements,
    caveats,
  };
}
