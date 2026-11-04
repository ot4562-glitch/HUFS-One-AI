import {
  isConsistentMajorWhatIfDelta, OwnerMajorWhatIfScenarioSchema,
  type MajorWhatIfDeltaRow, type MajorWhatIfRequirementProgress, type OwnerMajorWhatIfRequest,
} from '@hufs-one/contracts';
import {buildDoubleMajorAudit, type DoubleMajorAttempt, type MajorRulePack, type OverlapRowImpact, type OverlapRule} from './double-major.js';
import {assertId, type LedgerRequirement} from './ledger.js';

/**
 * buildMajorWhatIf (#11, #82): one student's transcript checked against the programs they have
 * now and against one hypothetical change (primary major, double major or minor). The result is
 * the calculation the #107 owner What-if contract carries: two projections and a requirement diff.
 *
 * - Each side runs the double-major core (#144) on the same attempts, so the unique earned total
 *   is the same on both sides and every course still counts once.
 * - A primary major can have a different pack per degree path (double major, 전공심화, 전공심화 +
 *   minor), so dropping or adding a second program can switch the primary pack too.
 * - Only earned credit counts. A row the core cannot decide (a shared course without an approved
 *   overlap rule, pending recognition, a non-credit check) is reported as MISSING with the
 *   conservative figures, and listed in reviewRequirementIds so a caller can show it needs review.
 * - Every pack used must be APPROVED; otherwise the result is BLOCKED_DEPENDENCY. A target the
 *   catalog does not have, or a change that does not fit the current programs, is
 *   TARGET_PROGRAM_UNAVAILABLE. Nothing here is an official graduation or program decision.
 * - The caller (server) adds cohort, overlap-policy, transcript and approval versions, evidence
 *   links, consent and rights checks. This module never builds an approval proof.
 * Pure: the caller supplies asOf. No clock, network, or storage.
 */

export const MAJOR_WHAT_IF_CORE_VERSION = 'hufs-major-what-if-1';

export type WhatIfScenario = OwnerMajorWhatIfRequest['scenario'];
export type DegreePath = 'DOUBLE_MAJOR'|'MAJOR_DEEPENING'|'MAJOR_DEEPENING_MINOR';
export type SecondaryRole = 'DOUBLE_MAJOR'|'MINOR';

/** The programs a student is enrolled in. At most one second program: a double major or a minor. */
export interface ProgramEnrollment {
  primaryProgramId:string;
  secondary?:{role:SecondaryRole; programId:string};
}

/** One approved (or not yet approved) pack in the caller's catalog for this student's cohort. */
export type ProgramOffer =
  | {role:'PRIMARY_MAJOR'; programId:string; degreePath:DegreePath; pack:MajorRulePack}
  | {role:SecondaryRole; programId:string; pack:MajorRulePack & {overlapRule?:OverlapRule}};

export interface MajorWhatIfRequest {
  asOf:string;
  attempts:readonly DoubleMajorAttempt[];
  current:ProgramEnrollment;
  scenario:WhatIfScenario;
  programs:readonly ProgramOffer[];
}

export type MajorWhatIfBlocker = 'CURRENT_RULEPACK_NOT_APPROVED'|'RULEPACK_NOT_APPROVED'|'TARGET_PROGRAM_UNAVAILABLE';

export interface WhatIfProjection {
  role:'CURRENT'|'HYPOTHETICAL';
  asOf:string;
  enrollment:ProgramEnrollment;
  degreePath:DegreePath;
  /** Primary pack first, then the second program's pack. The caller registers their combined version. */
  rulePackVersions:string[];
  /** Same unique earned ledger on both sides. */
  earnedCreditUnits:number;
  /** Earned-only shortfall of the primary pack's graduation credit total. */
  remainingCreditUnits:number;
  requirements:MajorWhatIfRequirementProgress[];
  /** Rows reported as MISSING because the core could not decide them; a person must review them. */
  reviewRequirementIds:string[];
}

export type MajorWhatIfResult =
  | {state:'BLOCKED_DEPENDENCY'; asOf:string; scenario:WhatIfScenario; blockers:MajorWhatIfBlocker[]; coreVersion:string}
  | {
    state:'READY'; asOf:string; scenario:WhatIfScenario; coreVersion:string;
    current:WhatIfProjection; hypothetical:WhatIfProjection;
    delta:(MajorWhatIfDeltaRow & {evidenceRefs:string[]})[];
  };

const MAX_REQUIREMENTS = 200;
const MAX_DELTA_EVIDENCE = 20;

const pathOf = (enrollment:ProgramEnrollment):DegreePath =>
  !enrollment.secondary ? 'MAJOR_DEEPENING' : enrollment.secondary.role === 'DOUBLE_MAJOR' ? 'DOUBLE_MAJOR' : 'MAJOR_DEEPENING_MINOR';

function checkEnrollment(enrollment:ProgramEnrollment, label:string):void {
  assertId(enrollment.primaryProgramId, `${label} primaryProgramId`);
  if (enrollment.secondary === undefined) return;
  if (enrollment.secondary.role !== 'DOUBLE_MAJOR' && enrollment.secondary.role !== 'MINOR') {
    throw new TypeError(`${label} second program role must be DOUBLE_MAJOR or MINOR`);
  }
  assertId(enrollment.secondary.programId, `${label} second programId`);
  if (enrollment.secondary.programId === enrollment.primaryProgramId) {
    throw new TypeError(`${label} second program cannot be the primary major`);
  }
}

/** The enrollment after the scenario, or undefined when the change does not fit the current programs. */
function applyScenario(current:ProgramEnrollment, scenario:WhatIfScenario):ProgramEnrollment|undefined {
  const second = current.secondary;
  const target = 'targetMajorId' in scenario ? scenario.targetMajorId : undefined;
  const fresh = (id:string) => id !== current.primaryProgramId && id !== second?.programId;
  switch (scenario.action) {
    case 'CHANGE_PRIMARY_MAJOR':
      return fresh(target!) ? {primaryProgramId:target!, ...(second ? {secondary:second} : {})} : undefined;
    case 'ADD_DOUBLE_MAJOR':
    case 'ADD_MINOR': {
      const role:SecondaryRole = scenario.action === 'ADD_DOUBLE_MAJOR' ? 'DOUBLE_MAJOR' : 'MINOR';
      return !second && fresh(target!) ? {primaryProgramId:current.primaryProgramId, secondary:{role, programId:target!}} : undefined;
    }
    case 'CHANGE_DOUBLE_MAJOR':
    case 'CHANGE_MINOR': {
      const role:SecondaryRole = scenario.action === 'CHANGE_DOUBLE_MAJOR' ? 'DOUBLE_MAJOR' : 'MINOR';
      return second?.role === role && fresh(target!)
        ? {primaryProgramId:current.primaryProgramId, secondary:{role, programId:target!}} : undefined;
    }
    case 'REMOVE_DOUBLE_MAJOR':
      return second?.role === 'DOUBLE_MAJOR' ? {primaryProgramId:current.primaryProgramId} : undefined;
    case 'REMOVE_MINOR':
      return second?.role === 'MINOR' ? {primaryProgramId:current.primaryProgramId} : undefined;
  }
}

interface Resolved {
  primary?:Extract<ProgramOffer, {role:'PRIMARY_MAJOR'}>;
  secondary?:Extract<ProgramOffer, {role:SecondaryRole}>;
  /** A program the enrollment needs has no pack in the catalog. */
  unavailable:boolean;
}

function resolve(enrollment:ProgramEnrollment, programs:readonly ProgramOffer[]):Resolved {
  const path = pathOf(enrollment);
  const primaries = programs.filter((offer):offer is Extract<ProgramOffer, {role:'PRIMARY_MAJOR'}> =>
    offer.role === 'PRIMARY_MAJOR' && offer.programId === enrollment.primaryProgramId && offer.degreePath === path);
  const second = enrollment.secondary;
  const secondaries = second ? programs.filter((offer):offer is Extract<ProgramOffer, {role:SecondaryRole}> =>
    offer.role === second.role && offer.programId === second.programId) : [];
  const resolved:Resolved = {unavailable:primaries.length === 0 || (second !== undefined && secondaries.length === 0)};
  if (primaries[0]) resolved.primary = primaries[0];
  if (secondaries[0]) resolved.secondary = secondaries[0];
  return resolved;
}

const approved = (resolved:Resolved, enrollment:ProgramEnrollment) =>
  resolved.primary?.pack.rulePackState === 'APPROVED'
  && (!enrollment.secondary || resolved.secondary?.pack.rulePackState === 'APPROVED');

function checkCatalog(programs:readonly ProgramOffer[]):void {
  if (!Array.isArray(programs)) throw new TypeError('programs must be an array');
  const keys = new Set<string>();
  const versions = new Set<string>();
  for (const offer of programs) {
    if (offer.role !== 'PRIMARY_MAJOR' && offer.role !== 'DOUBLE_MAJOR' && offer.role !== 'MINOR') {
      throw new TypeError('program role must be PRIMARY_MAJOR, DOUBLE_MAJOR or MINOR');
    }
    assertId(offer.programId, 'programId');
    if (offer.role === 'PRIMARY_MAJOR' && !['DOUBLE_MAJOR', 'MAJOR_DEEPENING', 'MAJOR_DEEPENING_MINOR'].includes(offer.degreePath)) {
      throw new TypeError(`${offer.programId} primary pack needs a degree path`);
    }
    const key = JSON.stringify([offer.role, offer.programId, offer.role === 'PRIMARY_MAJOR' ? offer.degreePath : null]);
    if (keys.has(key)) throw new TypeError(`the catalog lists ${offer.role} ${offer.programId} more than once`);
    keys.add(key);
    assertId(offer.pack.rulePackVersion, `${offer.programId} rulePackVersion`);
    if (versions.has(offer.pack.rulePackVersion)) throw new TypeError(`rule pack ${offer.pack.rulePackVersion} is listed twice`);
    versions.add(offer.pack.rulePackVersion);
  }
}

function project(role:WhatIfProjection['role'], input:MajorWhatIfRequest, enrollment:ProgramEnrollment, resolved:Resolved):WhatIfProjection {
  const primary = resolved.primary!.pack;
  const secondary = resolved.secondary?.pack;
  const totals = primary.requirements.filter(requirement => requirement.kind === 'CREDIT_TOTAL');
  if (totals.length !== 1) throw new TypeError(`${primary.rulePackVersion} needs exactly one CREDIT_TOTAL row`);
  const audit = buildDoubleMajorAudit({
    asOf:input.asOf, attempts:input.attempts, primary,
    doubleMajor:secondary ? {status:'SELECTED', pack:secondary} : {status:'NONE'},
  });
  const second = audit.doubleMajor.status === 'CHECKED' ? audit.doubleMajor.audit : undefined;
  const rows = [...audit.primary.requirements, ...(second?.requirements ?? [])];
  const definitions = new Map<string, LedgerRequirement>();
  for (const requirement of [...primary.requirements, ...(secondary?.requirements ?? [])]) {
    if (definitions.has(requirement.id)) {
      throw new TypeError(`requirement ${requirement.id} appears in both the primary and the second program pack`);
    }
    definitions.set(requirement.id, requirement);
  }
  if (rows.length > MAX_REQUIREMENTS) throw new RangeError('too many requirements for one projection');
  const impacts = new Map<string, OverlapRowImpact>();
  for (const impact of [...audit.overlap.rowImpacts.primary, ...audit.overlap.rowImpacts.doubleMajor]) impacts.set(impact.requirementId, impact);

  const requirements:MajorWhatIfRequirementProgress[] = [];
  const reviewRequirementIds:string[] = [];
  for (const row of rows) {
    const definition = definitions.get(row.requirementId)!;
    if (row.state === 'SATISFIED') {
      requirements.push({requirementId:row.requirementId, state:'SATISFIED'});
      continue;
    }
    if (row.state === 'NEEDS_REVIEW' || row.state === 'NOT_CHECKED') reviewRequirementIds.push(row.requirementId);
    const progress:MajorWhatIfRequirementProgress = {requirementId:row.requirementId, state:'MISSING'};
    if (definition.kind === 'CREDIT_TOTAL' || definition.kind === 'CATEGORY_MINIMUM') {
      // A row held over a shared course uses the figures without it: the reading if the overlap is not allowed.
      const impact = impacts.get(row.requirementId);
      const missing = impact && !impact.decided && impact.remainingCreditUnitsWithoutShared !== undefined
        ? impact.remainingCreditUnitsWithoutShared : row.remainingCreditUnits;
      if (missing === undefined) throw new Error(`${row.requirementId} has no remaining credit figure`);
      progress.missingCreditUnits = missing;
    }
    requirements.push(progress);
  }
  const totalRow = audit.primary.requirements.find(row => row.requirementId === totals[0]!.id)!;
  return {
    role, asOf:input.asOf, enrollment, degreePath:pathOf(enrollment),
    rulePackVersions:[primary.rulePackVersion, ...(secondary ? [secondary.rulePackVersion] : [])],
    earnedCreditUnits:audit.uniqueCredits.earnedCreditUnits,
    remainingCreditUnits:totalRow.remainingCreditUnits!,
    requirements, reviewRequirementIds,
  };
}

function evidenceOf(definitions:ReadonlyMap<string, LedgerRequirement>, id:string):string[] {
  return [...(definitions.get(id)?.evidenceRefs ?? [])];
}

export function buildMajorWhatIf(input:MajorWhatIfRequest):MajorWhatIfResult {
  const parsed = OwnerMajorWhatIfScenarioSchema.safeParse(input.scenario);
  if (!parsed.success) throw new TypeError('scenario is not a valid #107 What-if scenario');
  const scenario = parsed.data;
  checkEnrollment(input.current, 'current');
  checkCatalog(input.programs);
  const coreVersion = MAJOR_WHAT_IF_CORE_VERSION;

  const blockers = new Set<MajorWhatIfBlocker>();
  const now = resolve(input.current, input.programs);
  if (!approved(now, input.current)) blockers.add('CURRENT_RULEPACK_NOT_APPROVED');
  const next = applyScenario(input.current, scenario);
  let then:Resolved|undefined;
  if (!next) blockers.add('TARGET_PROGRAM_UNAVAILABLE');
  else {
    then = resolve(next, input.programs);
    if (then.unavailable) blockers.add('TARGET_PROGRAM_UNAVAILABLE');
    else {
      // A pack both sides use is already reported as CURRENT_RULEPACK_NOT_APPROVED.
      const used = new Set([now.primary, now.secondary].flatMap(offer => (offer ? [offer.pack.rulePackVersion] : [])));
      const fresh = [then.primary!, ...(then.secondary ? [then.secondary] : [])].filter(offer => !used.has(offer.pack.rulePackVersion));
      if (fresh.some(offer => offer.pack.rulePackState !== 'APPROVED')) blockers.add('RULEPACK_NOT_APPROVED');
    }
  }
  if (blockers.size > 0) {
    const order:MajorWhatIfBlocker[] = ['CURRENT_RULEPACK_NOT_APPROVED', 'RULEPACK_NOT_APPROVED', 'TARGET_PROGRAM_UNAVAILABLE'];
    return {state:'BLOCKED_DEPENDENCY', asOf:input.asOf, scenario, blockers:order.filter(code => blockers.has(code)), coreVersion};
  }

  const current = project('CURRENT', input, input.current, now);
  const hypothetical = project('HYPOTHETICAL', input, next!, then!);
  if (current.earnedCreditUnits !== hypothetical.earnedCreditUnits) {
    throw new Error('both sides must read the same unique earned ledger');
  }

  const definitionsBefore = new Map<string, LedgerRequirement>();
  const definitionsAfter = new Map<string, LedgerRequirement>();
  for (const offer of [now.primary!, now.secondary].filter(Boolean)) {
    for (const requirement of offer!.pack.requirements) definitionsBefore.set(requirement.id, requirement);
  }
  for (const offer of [then!.primary!, then!.secondary].filter(Boolean)) {
    for (const requirement of offer!.pack.requirements) definitionsAfter.set(requirement.id, requirement);
  }
  const before = new Map(current.requirements.map(row => [row.requirementId, row]));
  const after = new Map(hypothetical.requirements.map(row => [row.requirementId, row]));
  const ids = [...before.keys(), ...[...after.keys()].filter(id => !before.has(id))];
  if (ids.length > MAX_REQUIREMENTS) throw new RangeError('too many requirements for one What-if diff');
  const delta = ids.map(requirementId => {
    const previous = before.get(requirementId);
    const next = after.get(requirementId);
    let change:MajorWhatIfDeltaRow['change'];
    if (!previous) change = next!.state === 'SATISFIED' ? 'ALREADY_SATISFIED' : 'NEW_REQUIREMENT';
    else if (!next) change = 'REMOVED_REQUIREMENT';
    else change = previous.state === next.state && (previous.missingCreditUnits ?? 0) === (next.missingCreditUnits ?? 0)
      ? 'UNCHANGED' : 'PROGRESS_CHANGED';
    const evidenceRefs = [...new Set([...evidenceOf(definitionsBefore, requirementId), ...evidenceOf(definitionsAfter, requirementId)])];
    if (evidenceRefs.length === 0) throw new TypeError(`${requirementId} has no evidence; an approved pack must cite each requirement`);
    if (evidenceRefs.length > MAX_DELTA_EVIDENCE) throw new RangeError(`${requirementId} cites more than ${MAX_DELTA_EVIDENCE} evidence refs`);
    return {requirementId, change, evidenceRefs};
  });
  if (!isConsistentMajorWhatIfDelta({current:current.requirements, hypothetical:hypothetical.requirements, delta})) {
    throw new Error('internal: the What-if diff does not match its projections');
  }
  return {state:'READY', asOf:input.asOf, scenario, coreVersion, current, hypothetical, delta};
}
