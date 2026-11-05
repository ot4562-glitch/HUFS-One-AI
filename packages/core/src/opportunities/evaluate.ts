import type {Opportunity, TopicCode, RecommendationProfileInput} from '@hufs-one/contracts';

type Eligibility = 'ELIGIBLE'|'INELIGIBLE'|'UNKNOWN';
type Lifecycle = 'UPCOMING'|'OPEN'|'CLOSED'|'UNKNOWN';
type Condition = Opportunity['conditions'][number];
export type ConditionField = Condition['field'];
export type FactValue = string|number|boolean|readonly string[];

/**
 * Recommendation input built by the API from the student's own approved projection.
 * Only explicit choices and approved experience are relevance signals (A05.2-2).
 * Shape shared with the API input contract; approval is still checked by the API.
 */
export type RecommendationProfile = RecommendationProfileInput;

export type ConditionOutcome = 'PASS'|'FAIL'|'UNKNOWN';
export interface ConditionResult {field:ConditionField; operator:Condition['operator']; outcome:ConditionOutcome; evidenceId:string}

export interface OpportunityEvaluation {
  opportunityId:string;
  lifecycle:Lifecycle;
  eligibility:Eligibility;
  dataQuality:Opportunity['dataQuality'];
  /** True when the source conflicts or is incomplete; eligibility is then never ELIGIBLE. */
  needsReview:boolean;
  conditions:ConditionResult[];
  /** Only an external recruitment deadline; undefined when not confirmed. */
  deadline?:string;
  evidenceRefs:string[];
}

function asList(v:FactValue):readonly string[]|undefined {
  return Array.isArray(v) ? v : undefined;
}

/** Fail closed: a type mismatch is UNKNOWN, not a pass and not a silent fail. */
export function evaluateCondition(condition:Condition, facts:RecommendationProfile['facts']):ConditionOutcome {
  const fact = facts[condition.field];
  const {operator, value} = condition;
  if (operator === 'EXISTS') {
    if (typeof value !== 'boolean') return 'UNKNOWN';
    if (fact === undefined) return 'UNKNOWN';
    const present = asList(fact) ? asList(fact)!.length > 0 : true;
    return present === value ? 'PASS' : 'FAIL';
  }
  if (fact === undefined) return 'UNKNOWN';
  const list = asList(fact);
  switch (operator) {
    case 'EQ':
      if (Array.isArray(value)) return 'UNKNOWN';
      if (list) return typeof value === 'string' ? (list.includes(value) ? 'PASS' : 'FAIL') : 'UNKNOWN';
      if (typeof fact !== typeof value) return 'UNKNOWN';
      return fact === value ? 'PASS' : 'FAIL';
    case 'IN':
    case 'NOT_IN': {
      if (!Array.isArray(value)) return 'UNKNOWN';
      const values = list ?? (typeof fact === 'string' ? [fact] : undefined);
      if (!values || values.length === 0) return 'UNKNOWN';
      const hit = values.some(x => value.includes(x));
      return (operator === 'IN' ? hit : !hit) ? 'PASS' : 'FAIL';
    }
    case 'GTE':
    case 'LTE':
      if (typeof value !== 'number' || typeof fact !== 'number') return 'UNKNOWN';
      return (operator === 'GTE' ? fact >= value : fact <= value) ? 'PASS' : 'FAIL';
  }
}

function parseTime(iso:string|undefined):number|undefined {
  if (iso === undefined) return undefined;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : undefined;
}

/**
 * A05.1: event sessions are never copied into the apply deadline, and a RECORD_ONLY page's
 * internal deadline is not an external recruitment deadline.
 */
export function confirmedDeadline(opportunity:Opportunity):string|undefined {
  if (opportunity.actualApplicationRoute === 'RECORD_ONLY') return undefined;
  return parseTime(opportunity.applyClosesAt) === undefined ? undefined : opportunity.applyClosesAt;
}

export function opportunityLifecycle(opportunity:Opportunity, asOf:string):Lifecycle {
  const now = parseTime(asOf);
  if (now === undefined) throw new RangeError('asOf must be an ISO datetime');
  const opens = parseTime(opportunity.applyOpensAt);
  const closes = parseTime(confirmedDeadline(opportunity));
  if (closes !== undefined && closes <= now) return 'CLOSED';
  if (opens !== undefined && opens > now) return 'UPCOMING';
  return closes === undefined ? 'UNKNOWN' : 'OPEN';
}

/**
 * Pure: no clock, network or randomness. Relevance is computed separately in rank.ts.
 * Priority selection and completion rules are not application requirements and are ignored here.
 */
export function evaluateOpportunity(profile:RecommendationProfile, opportunity:Opportunity, asOf:string):OpportunityEvaluation {
  const conditions = opportunity.conditions.map(c => ({
    field:c.field, operator:c.operator, outcome:evaluateCondition(c, profile.facts), evidenceId:c.evidenceId,
  }));
  const needsReview = opportunity.dataQuality !== 'COMPLETE';
  let eligibility:Eligibility;
  if (opportunity.dataQuality === 'CONFLICT') eligibility = 'UNKNOWN'; // never pick the most lenient reading
  else if (conditions.some(c => c.outcome === 'FAIL')) eligibility = 'INELIGIBLE';
  else if (needsReview || conditions.some(c => c.outcome === 'UNKNOWN')) eligibility = 'UNKNOWN';
  else eligibility = 'ELIGIBLE';
  const deadline = confirmedDeadline(opportunity);
  return {
    opportunityId:opportunity.id,
    lifecycle:opportunityLifecycle(opportunity, asOf),
    eligibility,
    dataQuality:opportunity.dataQuality,
    needsReview,
    conditions,
    ...(deadline === undefined ? {} : {deadline}),
    evidenceRefs:[...new Set(conditions.map(c => c.evidenceId))],
  };
}
