import {OfferingOutlookVNextSchema, type OfferingOutlookVNext} from '@hufs-one/contracts';

/**
 * Student assumptions laid over the offering outlook (Architecture A09, #11 TASK-17).
 *
 * A student can ask "what if this course is not offered (research leave, no replacement section,
 * cancellation)?" or "what if it is offered?". The answer is a separate HYPOTHETICAL layer:
 * - The base outlooks are returned unchanged, so the official and historical picture stays visible.
 * - Every hypothetical row names the one assumption that produced it. No assumption, no row.
 * - A row whose assumption goes against an official confirmation in the base says so.
 * - Substitutes come only from the base outlook's officially approved alternatives.
 * A hypothetical row is not an OfferingOutlookVNext and never feeds credits, plans or
 * recommendations as if it were one. Pure: no clock, network, storage or randomness.
 */
export const OFFERING_SCENARIO_CORE_VERSION = 'forecast-offering-scenario-v1';

const ID = /^[A-Za-z0-9_.:-]{1,128}$/;
const MAX_BASE = 20;
const MAX_ASSUMPTIONS = 20;
const NOT_OFFERED_REASONS = ['RESEARCH_LEAVE', 'NO_REPLACEMENT_SECTION', 'CANCELLATION', 'OTHER'] as const;
const OFFERED_REASONS = ['NEW_SECTION', 'OTHER'] as const;

export type OfferingAssumption =
  | {assumptionId:string; courseId:string; targetTerm:string; assume:'NOT_OFFERED'; reason:typeof NOT_OFFERED_REASONS[number]}
  | {assumptionId:string; courseId:string; targetTerm:string; assume:'OFFERED'; reason:typeof OFFERED_REASONS[number]};

export interface OfferingScenarioRequest {
  /** Outlooks exactly as forecastOffering produced them, one per course and target term. */
  base:readonly OfferingOutlookVNext[];
  assumptions:readonly OfferingAssumption[];
}

export interface OfferingScenarioRow {
  layer:'HYPOTHETICAL';
  assumptionId:string;
  courseId:string;
  targetTerm:string;
  assume:'OFFERED'|'NOT_OFFERED';
  reason:OfferingAssumption['reason'];
  /** The base outlook's own reading, shown next to the assumption. */
  baseSignal:OfferingOutlookVNext['signal'];
  /** The assumption is the opposite of an official confirmation for this term. */
  contradictsOfficial:boolean;
  /** Officially approved substitutes from the base outlook. Listed only when the course is assumed not offered. */
  officialAlternatives:{courseId:string; evidenceRef:string}[];
  caveat:string;
}

export interface OfferingScenarioResult {
  coreVersion:typeof OFFERING_SCENARIO_CORE_VERSION;
  /** Unchanged copies of the input outlooks, in input order. */
  base:OfferingOutlookVNext[];
  /** One row per assumption, sorted by course, term and assumption id. */
  scenario:OfferingScenarioRow[];
}

const CAVEAT_NOT_OFFERED = '학생이 정한 가정입니다. 이 과목이 이 학기에 열리지 않는다고 놓고 본 결과이며, 공식 개설 정보나 예측이 아닙니다.';
const CAVEAT_OFFERED = '학생이 정한 가정입니다. 이 과목이 이 학기에 열린다고 놓고 본 결과이며, 공식 개설 정보나 예측이 아닙니다.';
const CAVEAT_CONTRADICTS = ' 공식 자료로 확인된 상태와 반대되는 가정입니다.';

const key = (courseId:string, targetTerm:string) => JSON.stringify([courseId, targetTerm]);
const byCodeUnit = (a:string, b:string) => (a < b ? -1 : a > b ? 1 : 0);

function assertId(value:unknown, label:string):asserts value is string {
  if (typeof value !== 'string' || !ID.test(value)) throw new TypeError(`${label} must match ${ID}; refused ${String(value)}`);
}

export function applyOfferingAssumptions(input:OfferingScenarioRequest):OfferingScenarioResult {
  if (!Array.isArray(input.base) || !Array.isArray(input.assumptions)) {
    throw new TypeError('base and assumptions must be arrays');
  }
  if (input.base.length > MAX_BASE) throw new RangeError(`more than ${MAX_BASE} base outlooks`);
  if (input.assumptions.length > MAX_ASSUMPTIONS) throw new RangeError(`more than ${MAX_ASSUMPTIONS} assumptions`);

  // Parsing makes independent copies, so neither the input nor the returned base can be changed through the other.
  const base = input.base.map(outlook => OfferingOutlookVNextSchema.parse(outlook));
  const outlooks = new Map<string, OfferingOutlookVNext>();
  for (const outlook of base) {
    const at = key(outlook.courseId, outlook.targetTerm);
    if (outlooks.has(at)) throw new TypeError(`two base outlooks for ${outlook.courseId} ${outlook.targetTerm}`);
    outlooks.set(at, outlook);
  }

  const ids = new Set<string>();
  const assumed = new Set<string>();
  const scenario = input.assumptions.map((assumption):OfferingScenarioRow => {
    assertId(assumption.assumptionId, 'assumptionId');
    if (ids.has(assumption.assumptionId)) throw new TypeError(`duplicate assumption ${assumption.assumptionId}`);
    ids.add(assumption.assumptionId);
    if (assumption.assume === 'NOT_OFFERED') {
      if (!(NOT_OFFERED_REASONS as readonly string[]).includes(assumption.reason)) {
        throw new TypeError(`reason ${String(assumption.reason)} does not fit NOT_OFFERED`);
      }
    } else if (assumption.assume === 'OFFERED') {
      if (!(OFFERED_REASONS as readonly string[]).includes(assumption.reason)) {
        throw new TypeError(`reason ${String(assumption.reason)} does not fit OFFERED`);
      }
    } else {
      throw new TypeError('assume must be OFFERED or NOT_OFFERED');
    }
    const at = key(assumption.courseId, assumption.targetTerm);
    const outlook = outlooks.get(at);
    if (!outlook) throw new TypeError(`no base outlook for ${String(assumption.courseId)} ${String(assumption.targetTerm)}`);
    // Two assumptions about one course and term would leave the answer to list order.
    if (assumed.has(at)) throw new TypeError(`two assumptions for ${assumption.courseId} ${assumption.targetTerm}`);
    assumed.add(at);

    const contradictsOfficial = assumption.assume === 'NOT_OFFERED'
      ? outlook.signal === 'CONFIRMED_OFFERED'
      : outlook.signal === 'CONFIRMED_NOT_OFFERED';
    const officialAlternatives = assumption.assume === 'NOT_OFFERED'
      ? outlook.alternatives.flatMap(alternative =>
        alternative.status === 'OFFICIALLY_APPROVED' && alternative.evidenceRef !== undefined
          ? [{courseId:alternative.courseId, evidenceRef:alternative.evidenceRef}] : [])
      : [];
    return {
      layer:'HYPOTHETICAL',
      assumptionId:assumption.assumptionId,
      courseId:outlook.courseId,
      targetTerm:outlook.targetTerm,
      assume:assumption.assume,
      reason:assumption.reason,
      baseSignal:outlook.signal,
      contradictsOfficial,
      officialAlternatives,
      caveat:(assumption.assume === 'NOT_OFFERED' ? CAVEAT_NOT_OFFERED : CAVEAT_OFFERED) + (contradictsOfficial ? CAVEAT_CONTRADICTS : ''),
    };
  });
  scenario.sort((a, b) => byCodeUnit(a.courseId, b.courseId) || byCodeUnit(a.targetTerm, b.targetTerm)
    || byCodeUnit(a.assumptionId, b.assumptionId));
  return {coreVersion:OFFERING_SCENARIO_CORE_VERSION, base, scenario};
}
