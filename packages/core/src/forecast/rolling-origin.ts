import type {OfferingOutlookVNext} from '@hufs-one/contracts';
import {
  FORECAST_OFFERING_MODEL_VERSION, forecastOffering, termWindow,
  type OfferingObservation, type OfficialAcademicEvent,
} from './offering.js';

/**
 * Rolling-origin evaluation of the offering outlook (Architecture A09, TASK-17).
 *
 * An origin is a past instant plus a later target term. At each origin the outlook and every
 * baseline see only rows published and verified by that instant. The answer comes from the
 * complete term catalogs visible at `truthAsOf`. Every method is scored on the same items.
 *
 * The report holds counts only: no probability, no rounded rate and no IoU. Overlap between
 * two terms' course lists is not forecast accuracy. To score a HISTORICAL_PATTERN outlook, the
 * evaluator reads the shown k/n as a majority. The product still shows k/n as a past count.
 * Pure: no clock, network or randomness.
 */
export const ROLLING_ORIGIN_EVALUATOR_VERSION = 'forecast-offering-rolling-origin-v1';

const TERM = /^(19|20|21)\d{2}-[12]$/;
const OFFSET = /(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_ORIGINS = 16;
const MAX_COURSES = 200;

export const EVALUATION_METHODS = ['OUTLOOK', 'RECENT_SAME_SEASON', 'HISTORY_MAJORITY', 'ALWAYS_OFFERED'] as const;
export type EvaluationMethod = typeof EVALUATION_METHODS[number];
type Signal = OfferingOutlookVNext['signal'];
const SIGNALS:readonly Signal[] = [
  'CONFIRMED_OFFERED', 'CONFIRMED_NOT_OFFERED', 'HISTORICAL_PATTERN', 'EVENT_REVIEW', 'INSUFFICIENT_DATA', 'UNKNOWN',
];
type Answer = 'OFFERED'|'NOT_OFFERED'|'ABSTAIN';
type Truth = 'OFFERED'|'NOT_OFFERED';

export interface EvaluationCourse {
  courseId:string;
  /** Every collected row, including rows published after some origins. */
  observations:readonly OfferingObservation[];
  officialEvents?:readonly OfficialAcademicEvent[];
}

export interface EvaluationOrigin {
  asOf:string;
  targetTerm:string;
}

export interface RollingOriginRequest {
  /** When the answers are read. Not earlier than any origin. */
  truthAsOf:string;
  origins:readonly EvaluationOrigin[];
  courses:readonly EvaluationCourse[];
}

/** Positive class is OFFERED. answered + abstained equals the scored item count. */
export interface MethodScore {
  truePositive:number;
  falsePositive:number;
  falseNegative:number;
  trueNegative:number;
  answered:number;
  correct:number;
  abstained:number;
}

export interface HistoryCount {
  offeredTerms:number;
  observedTerms:number;
  /** Scored items whose outlook showed this k/n. */
  shown:number;
  /** How many of those were then offered. */
  thenOffered:number;
}

export interface EvaluationTally {
  courses:number;
  /** Not scored: the target term's own status was already published at the origin. */
  alreadyPublished:number;
  /** Not scored: no complete catalog with a known state for the target term at truthAsOf. */
  truthUnavailable:number;
  /** Not scored: complete catalogs disagree about the target term. */
  truthConflicting:number;
  scored:number;
  truth:{offered:number; notOffered:number};
  methods:Record<EvaluationMethod, MethodScore>;
  outlookSignals:Record<Signal, number>;
  historyCounts:HistoryCount[];
}

export interface OriginReport extends EvaluationTally {
  asOf:string;
  targetTerm:string;
}

export interface RollingOriginReport {
  evaluatorVersion:typeof ROLLING_ORIGIN_EVALUATOR_VERSION;
  modelVersion:typeof FORECAST_OFFERING_MODEL_VERSION;
  truthAsOf:string;
  /** READY needs at least two distinct origin instants that each scored an item. */
  status:'READY'|'INSUFFICIENT_DATA';
  origins:OriginReport[];
  total:EvaluationTally;
}

function instant(label:string, value:unknown):number {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  if (typeof value !== 'string' || !Number.isFinite(parsed) || !OFFSET.test(value)) {
    throw new RangeError(`${label} must be an ISO datetime with a timezone offset`);
  }
  return parsed;
}

function assertTerm(label:string, value:unknown):asserts value is string {
  if (typeof value !== 'string' || !TERM.test(value)) throw new RangeError(`${label} must be YYYY-1 or YYYY-2`);
}

function checkCourse(course:EvaluationCourse):void {
  if (typeof course.courseId !== 'string' || course.courseId.trim() === '') throw new RangeError('courseId is required');
  if (!Array.isArray(course.observations)) throw new TypeError(`observations of ${course.courseId} must be an array`);
  for (const row of course.observations) {
    assertTerm(`observation term of ${course.courseId}`, row.term);
    const published = instant('observation.publishedAt', row.publishedAt);
    if (instant('observation.verifiedAt', row.verifiedAt) < published) {
      throw new RangeError('verifiedAt cannot precede publishedAt');
    }
  }
}

function emptyScore():MethodScore {
  return {truePositive:0, falsePositive:0, falseNegative:0, trueNegative:0, answered:0, correct:0, abstained:0};
}

function emptyTally():EvaluationTally {
  const methods = {} as Record<EvaluationMethod, MethodScore>;
  for (const method of EVALUATION_METHODS) methods[method] = emptyScore();
  const outlookSignals = {} as Record<Signal, number>;
  for (const signal of SIGNALS) outlookSignals[signal] = 0;
  return {
    courses:0, alreadyPublished:0, truthUnavailable:0, truthConflicting:0, scored:0,
    truth:{offered:0, notOffered:0}, methods, outlookSignals, historyCounts:[],
  };
}

/** The target term's own status was public at the origin, even if not yet verified there. */
function publishedBy(rows:readonly OfferingObservation[], term:string, originMs:number):boolean {
  return rows.some(row => row.term === term && row.state !== 'UNKNOWN' && Date.parse(row.publishedAt) <= originMs);
}

function answerAt(rows:readonly OfferingObservation[], term:string, truthMs:number):Truth|'UNAVAILABLE'|'CONFLICTING' {
  const states = new Set(rows
    .filter(row => row.term === term && row.coverage === 'COMPLETE_TERM_CATALOG' && row.state !== 'UNKNOWN'
      && Date.parse(row.publishedAt) <= truthMs && Date.parse(row.verifiedAt) <= truthMs)
    .map(row => row.state));
  if (states.size === 0) return 'UNAVAILABLE';
  if (states.size > 1) return 'CONFLICTING';
  return states.has('OFFERED') ? 'OFFERED' : 'NOT_OFFERED';
}

/** A tie, including 0/0, is no answer. */
function majority(offered:number, observed:number):Answer {
  if (2 * offered > observed) return 'OFFERED';
  if (2 * offered < observed) return 'NOT_OFFERED';
  return 'ABSTAIN';
}

/** Every baseline reads the same-season history the outlook itself kept at this origin. */
function predict(method:EvaluationMethod, outlook:OfferingOutlookVNext):Answer {
  switch (method) {
    case 'OUTLOOK':
      if (outlook.signal === 'CONFIRMED_OFFERED') return 'OFFERED';
      if (outlook.signal === 'CONFIRMED_NOT_OFFERED') return 'NOT_OFFERED';
      if (outlook.signal === 'HISTORICAL_PATTERN') {
        return majority(outlook.sameSeasonOfferedTerms, outlook.sameSeasonObservedTerms);
      }
      return 'ABSTAIN';
    case 'RECENT_SAME_SEASON': {
      const complete = outlook.observations.filter(row => row.coverage === 'COMPLETE_TERM_CATALOG' && row.state !== 'UNKNOWN');
      const last = complete[complete.length - 1];
      if (!last) return 'ABSTAIN';
      return last.state === 'OFFERED' ? 'OFFERED' : 'NOT_OFFERED';
    }
    case 'HISTORY_MAJORITY':
      return majority(outlook.sameSeasonOfferedTerms, outlook.sameSeasonObservedTerms);
    case 'ALWAYS_OFFERED':
      return 'OFFERED';
  }
}

function score(target:MethodScore, answer:Answer, truth:Truth):void {
  if (answer === 'ABSTAIN') {
    target.abstained += 1;
    return;
  }
  target.answered += 1;
  if (answer === 'OFFERED') {
    if (truth === 'OFFERED') target.truePositive += 1;
    else target.falsePositive += 1;
  } else if (truth === 'OFFERED') target.falseNegative += 1;
  else target.trueNegative += 1;
  target.correct = target.truePositive + target.trueNegative;
}

function addHistory(list:HistoryCount[], offeredTerms:number, observedTerms:number, offered:boolean):void {
  let row = list.find(item => item.offeredTerms === offeredTerms && item.observedTerms === observedTerms);
  if (!row) {
    row = {offeredTerms, observedTerms, shown:0, thenOffered:0};
    list.push(row);
  }
  row.shown += 1;
  if (offered) row.thenOffered += 1;
}

function sortHistory(list:HistoryCount[]):HistoryCount[] {
  return list.sort((a, b) => a.observedTerms - b.observedTerms || a.offeredTerms - b.offeredTerms);
}

function evaluateOrigin(origin:EvaluationOrigin, originMs:number, courses:readonly EvaluationCourse[], truthMs:number):OriginReport {
  const tally = emptyTally();
  for (const course of courses) {
    tally.courses += 1;
    if (publishedBy(course.observations, origin.targetTerm, originMs)) {
      tally.alreadyPublished += 1;
      continue;
    }
    const truth = answerAt(course.observations, origin.targetTerm, truthMs);
    if (truth === 'UNAVAILABLE') {
      tally.truthUnavailable += 1;
      continue;
    }
    if (truth === 'CONFLICTING') {
      tally.truthConflicting += 1;
      continue;
    }
    // The outlook gets every row and filters by origin itself; the evaluator does not pre-filter for it.
    const outlook = forecastOffering({
      courseId:course.courseId, targetTerm:origin.targetTerm, asOf:origin.asOf,
      observations:course.observations, officialEvents:course.officialEvents ?? [],
    });
    tally.scored += 1;
    if (truth === 'OFFERED') tally.truth.offered += 1;
    else tally.truth.notOffered += 1;
    tally.outlookSignals[outlook.signal] += 1;
    for (const method of EVALUATION_METHODS) score(tally.methods[method], predict(method, outlook), truth);
    if (outlook.signal === 'HISTORICAL_PATTERN') {
      addHistory(tally.historyCounts, outlook.sameSeasonOfferedTerms, outlook.sameSeasonObservedTerms, truth === 'OFFERED');
    }
  }
  sortHistory(tally.historyCounts);
  return {asOf:origin.asOf, targetTerm:origin.targetTerm, ...tally};
}

function addTally(total:EvaluationTally, part:EvaluationTally):void {
  total.courses += part.courses;
  total.alreadyPublished += part.alreadyPublished;
  total.truthUnavailable += part.truthUnavailable;
  total.truthConflicting += part.truthConflicting;
  total.scored += part.scored;
  total.truth.offered += part.truth.offered;
  total.truth.notOffered += part.truth.notOffered;
  for (const method of EVALUATION_METHODS) {
    const into = total.methods[method], from = part.methods[method];
    into.truePositive += from.truePositive;
    into.falsePositive += from.falsePositive;
    into.falseNegative += from.falseNegative;
    into.trueNegative += from.trueNegative;
    into.answered += from.answered;
    into.correct += from.correct;
    into.abstained += from.abstained;
  }
  for (const signal of SIGNALS) total.outlookSignals[signal] += part.outlookSignals[signal];
  for (const row of part.historyCounts) {
    let into = total.historyCounts.find(item =>
      item.offeredTerms === row.offeredTerms && item.observedTerms === row.observedTerms);
    if (!into) {
      into = {offeredTerms:row.offeredTerms, observedTerms:row.observedTerms, shown:0, thenOffered:0};
      total.historyCounts.push(into);
    }
    into.shown += row.shown;
    into.thenOffered += row.thenOffered;
  }
}

/**
 * Scores the outlook and three naive baselines at each origin on the same items.
 * Items whose target term was already published at the origin, or whose answer is unknown or
 * contradictory at truthAsOf, are counted and left out of every method alike.
 */
export function evaluateOfferingOutlook(input:RollingOriginRequest):RollingOriginReport {
  const truthMs = instant('truthAsOf', input.truthAsOf);
  if (!Array.isArray(input.origins) || !Array.isArray(input.courses)) {
    throw new TypeError('origins and courses must be arrays');
  }
  if (input.origins.length > MAX_ORIGINS) throw new RangeError(`more than ${MAX_ORIGINS} origins`);
  if (input.courses.length > MAX_COURSES) throw new RangeError(`more than ${MAX_COURSES} courses`);

  const seenCourses = new Set<string>();
  for (const course of input.courses) {
    checkCourse(course);
    if (seenCourses.has(course.courseId)) throw new TypeError(`duplicate course ${course.courseId}`);
    seenCourses.add(course.courseId);
  }
  const courses = [...input.courses].sort((a, b) => (a.courseId < b.courseId ? -1 : a.courseId > b.courseId ? 1 : 0));

  const seenOrigins = new Set<string>();
  const origins = input.origins.map(origin => {
    const ms = instant('origin.asOf', origin.asOf);
    assertTerm('origin.targetTerm', origin.targetTerm);
    if (termWindow(origin.targetTerm).start <= ms) throw new RangeError('an origin must come before its target term starts');
    if (ms > truthMs) throw new RangeError('truthAsOf must not precede an origin');
    const key = `${ms}|${origin.targetTerm}`;
    if (seenOrigins.has(key)) throw new TypeError(`duplicate origin ${origin.asOf} -> ${origin.targetTerm}`);
    seenOrigins.add(key);
    return {origin, ms};
  }).sort((a, b) => a.ms - b.ms || (a.origin.targetTerm < b.origin.targetTerm ? -1 : 1));

  const reports = origins.map(({origin, ms}) => evaluateOrigin(origin, ms, courses, truthMs));
  const total = emptyTally();
  for (const report of reports) addTally(total, report);
  sortHistory(total.historyCounts);
  const scoredInstants = new Set(origins.filter((_, index) => reports[index]!.scored > 0).map(({ms}) => ms));
  return {
    evaluatorVersion:ROLLING_ORIGIN_EVALUATOR_VERSION,
    modelVersion:FORECAST_OFFERING_MODEL_VERSION,
    truthAsOf:input.truthAsOf,
    status:scoredInstants.size >= 2 ? 'READY' : 'INSUFFICIENT_DATA',
    origins:reports,
    total,
  };
}
