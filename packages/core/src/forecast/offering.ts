import {OfferingOutlookVNextSchema, type OfferingOutlookVNext} from '@hufs-one/contracts';

/**
 * Offering outlook for one courseId + targetTerm.
 * Pure: the caller supplies asOf. No clock, network, or randomness.
 * Same-season history is a past count. It is not a probability and not a guarantee.
 * Decision order follows Architecture.md A09.2.
 */
export const FORECAST_OFFERING_MODEL_VERSION = 'forecast-offering-v1';

const TERM = /^(19|20|21)\d{2}-[12]$/;
const OFFSET = /(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_OBSERVATIONS = 20;
const MAX_EVENTS = 30;
const MAX_COURSES = 20;
const ASSIGNMENT_REVIEW_KINDS = new Set(['RESEARCH_LEAVE', 'RETIREMENT', 'STAFF_CHANGE', 'COURSE_CANCELLED']);
const PERSONNEL_KINDS = new Set(['RESEARCH_LEAVE', 'RETIREMENT', 'STAFF_CHANGE']);

export interface OfferingObservation {
  term:string;
  state:'OFFERED'|'CONFIRMED_NOT_OFFERED'|'UNKNOWN';
  coverage:'COMPLETE_TERM_CATALOG'|'PARTIAL'|'NOTICE_ONLY';
  sourceRef:string;
  publishedAt:string;
  verifiedAt:string;
}

export interface OfficialAcademicEvent {
  eventId:string;
  kind:'RESEARCH_LEAVE'|'RETIREMENT'|'STAFF_CHANGE'|'CURRICULUM_CHANGE'|'COURSE_CANCELLED'|'REPLACEMENT_CONFIRMED';
  sourceRef:string;
  publishedAt:string;
  verifiedAt:string;
  effectiveFrom:string;
  impact:'POTENTIAL_ASSIGNMENT_CHANGE'|'EXPLICIT_COURSE_STATUS';
  affectedCourseIds:readonly string[];
  effectiveUntil?:string;
}

/** Caller-supplied substitute only. This function never invents one. */
export interface OfferingAlternative {
  courseId:string;
  status:'OFFICIALLY_APPROVED'|'NEEDS_REVIEW';
  evidenceRef?:string;
}

export interface ForecastOfferingInput {
  courseId:string;
  targetTerm:string;
  asOf:string;
  observations?:readonly OfferingObservation[];
  officialEvents?:readonly OfficialAcademicEvent[];
  alternatives?:readonly OfferingAlternative[];
}

export interface ForecastCourseInput {
  courseId:string;
  targetTerm:string;
  observations?:readonly OfferingObservation[];
  officialEvents?:readonly OfficialAcademicEvent[];
  alternatives?:readonly OfferingAlternative[];
}

export interface ForecastOfferingsResult {
  asOf:string;
  items:OfferingOutlookVNext[];
  status:'READY'|'INSUFFICIENT_DATA';
}

const READY_SIGNALS:ReadonlySet<OfferingOutlookVNext['signal']> = new Set([
  'CONFIRMED_OFFERED', 'CONFIRMED_NOT_OFFERED', 'HISTORICAL_PATTERN',
]);

interface Timed {
  publishedAt:string;
  verifiedAt:string;
  sourceRef:string;
}

interface Decision {
  signal:OfferingOutlookVNext['signal'];
  caveat:string;
  evidenceRefs:string[];
  sourcePublishedAt?:string;
}

export function forecastOffering(input:ForecastOfferingInput):OfferingOutlookVNext {
  if (!TERM.test(input.targetTerm)) throw new RangeError('targetTerm must be YYYY-1 or YYYY-2');
  const asOfMs = readInstant('asOf', input.asOf);
  if (input.courseId.trim() === '') throw new RangeError('courseId is required');

  const season = input.targetTerm.slice(-1);
  const usable = (input.observations ?? []).filter(row => observationVisible(row, asOfMs));
  const targetRows = usable.filter(row => row.term === input.targetTerm).map(cloneObservation);
  const prior = usable.filter(row => row.term < input.targetTerm && row.term.endsWith(`-${season}`));
  const history = capHistory(dedupe(prior), season);
  const events = (input.officialEvents ?? [])
    .filter(event => event.affectedCourseIds.includes(input.courseId))
    .filter(event => eventApplies(event, input.targetTerm, asOfMs))
    .map(cloneEvent)
    .sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt) || (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0));
  if (events.length > MAX_EVENTS) throw new RangeError('more than 30 official events apply to this course');

  const {n, k} = counts(history, season);
  const decision = decide({n, k, targetRows, history, events, season});
  const value = {
    courseId:input.courseId,
    targetTerm:input.targetTerm,
    asOf:input.asOf,
    modelVersion:FORECAST_OFFERING_MODEL_VERSION,
    signal:decision.signal,
    evidenceRefs:decision.evidenceRefs,
    observations:history,
    officialEvents:events,
    sameSeasonObservedTerms:n,
    sameSeasonOfferedTerms:k,
    alternatives:officialAlternatives(input.courseId, input.alternatives),
    caveat:decision.caveat,
    ...(decision.sourcePublishedAt === undefined ? {} : {sourcePublishedAt:decision.sourcePublishedAt}),
  };
  return OfferingOutlookVNextSchema.parse(value);
}

/**
 * Forecasts at most 20 courses. A 21st id is refused.
 * READY only when every item is confirmed or a historical pattern.
 */
export function forecastOfferings(input:{asOf:string; courses:readonly ForecastCourseInput[]}):ForecastOfferingsResult {
  if (input.courses.length > MAX_COURSES) throw new RangeError('forecastOfferings refuses more than 20 course ids');
  const items = input.courses.map(course => forecastOffering({
    courseId:course.courseId,
    targetTerm:course.targetTerm,
    asOf:input.asOf,
    ...(course.observations === undefined ? {} : {observations:course.observations}),
    ...(course.officialEvents === undefined ? {} : {officialEvents:course.officialEvents}),
    ...(course.alternatives === undefined ? {} : {alternatives:course.alternatives}),
  }));
  const status = items.every(item => READY_SIGNALS.has(item.signal)) ? 'READY' : 'INSUFFICIENT_DATA';
  return {asOf:input.asOf, items, status};
}

function decide(args:{
  n:number; k:number; season:string;
  targetRows:readonly OfferingObservation[];
  history:readonly OfferingObservation[];
  events:OfferingOutlookVNext['officialEvents'];
}):Decision {
  const confirming = args.targetRows.filter(supportsConfirmation);
  const states = new Set(confirming.map(row => row.state));
  const cancels = args.events.filter(event => event.kind === 'COURSE_CANCELLED' && event.impact === 'EXPLICIT_COURSE_STATUS');
  const offered = states.size === 1 && confirming[0]?.state === 'OFFERED';
  const closedByCatalog = states.size === 1 && confirming[0]?.state === 'CONFIRMED_NOT_OFFERED';
  if (states.size > 1 || (offered && cancels.length > 0)) {
    return {
      signal:'INSUFFICIENT_DATA',
      caveat:'같은 학기 공식 자료가 개설과 미개설로 서로 달라 확정하지 않습니다. 부분 목록은 0회 개설이 아닙니다.',
      evidenceRefs:evidence([...confirming.map(row => row.sourceRef), ...cancels.map(event => event.sourceRef)]),
    };
  }
  if (offered) {
    const source = latest(confirming);
    return {
      signal:'CONFIRMED_OFFERED',
      caveat:'기준 시점까지 공개된 공식 자료에서 이 학기 개설이 확인되었습니다. 교원, 요일, 강의실, 분반은 만들지 않습니다.',
      evidenceRefs:evidence(confirming.map(row => row.sourceRef)),
      sourcePublishedAt:source.publishedAt,
    };
  }
  const assignmentReview = args.events.filter(event =>
    event.impact === 'POTENTIAL_ASSIGNMENT_CHANGE' && ASSIGNMENT_REVIEW_KINDS.has(event.kind));
  if (closedByCatalog && cancels.length === 0 && assignmentReview.length > 0) {
    return {
      signal:'INSUFFICIENT_DATA',
      caveat:'개설 목록은 미개설로 적혀 있으나 담당 변경 가능성이 같은 결과에 있어 미개설로 확정하지 않습니다. 연구학기만으로 폐강으로 보지 않습니다.',
      evidenceRefs:evidence([
        ...confirming.map(row => row.sourceRef),
        ...assignmentReview.map(event => event.sourceRef),
      ]),
    };
  }
  if (closedByCatalog || cancels.length > 0) {
    const rows = closedByCatalog ? confirming : [];
    const source = laterOf(rows.length > 0 ? latest(rows) : undefined, cancels.length > 0 ? latest(cancels) : undefined);
    return {
      signal:'CONFIRMED_NOT_OFFERED',
      caveat:'기준 시점까지 공개된 공식 자료에서 이 학기 미개설이 확인되었습니다. 과거 횟수나 추정으로 정한 값이 아닙니다.',
      evidenceRefs:evidence([...rows.map(row => row.sourceRef), ...cancels.map(event => event.sourceRef)]),
      sourcePublishedAt:source.publishedAt,
    };
  }
  if (assignmentReview.length > 0) {
    return {
      signal:'EVENT_REVIEW',
      caveat:'공식 사건으로 담당 변경 가능성이 있어 확인이 필요합니다. 연구학기, 퇴직, 담당 변경만으로 미개설을 확정하지 않습니다.',
      evidenceRefs:evidence(assignmentReview.map(event => event.sourceRef)),
    };
  }
  const personnelExplicit = args.events.filter(event =>
    event.impact === 'EXPLICIT_COURSE_STATUS' && PERSONNEL_KINDS.has(event.kind));
  if (personnelExplicit.length > 0) {
    return {
      signal:'INSUFFICIENT_DATA',
      caveat:'공식 인사 사건이 있어도 그 사실만으로 미개설을 확정하지 않습니다. 빠진 목록은 0회 개설이 아닙니다.',
      evidenceRefs:evidence(personnelExplicit.map(event => event.sourceRef)),
    };
  }
  const curriculum = args.events.filter(event => event.kind === 'CURRICULUM_CHANGE');
  if (curriculum.length > 0) {
    return {
      signal:'INSUFFICIENT_DATA',
      caveat:'교과 변경 사건이 있어 과거 학기와 같은 과목인지를 확정하지 않습니다. 과거 횟수는 확률도 보장도 아닙니다.',
      evidenceRefs:evidence(curriculum.map(event => event.sourceRef)),
    };
  }
  if (args.n >= 3) {
    return {
      signal:'HISTORICAL_PATTERN',
      caveat:`과거 같은 계절 학기 ${args.n}번 중 ${args.k}번 개설된 횟수입니다. 과거 횟수일 뿐 확률이 아니고 개설을 보장하지 않습니다.`,
      evidenceRefs:evidence(args.history.filter(row => countsToward(row, args.season)).map(row => row.sourceRef)),
    };
  }
  if (args.history.length > 0 || args.events.length > 0) {
    return {
      signal:'INSUFFICIENT_DATA',
      caveat:'완전한 같은 계절 개설 목록이 3개 학기보다 적거나 일부 목록만 있습니다. 부분 목록이나 미확인 학기는 0회 개설이 아닙니다.',
      evidenceRefs:evidence([
        ...args.history.map(row => row.sourceRef),
        ...args.events.map(event => event.sourceRef),
      ]),
    };
  }
  return {
    signal:'UNKNOWN',
    caveat:'기준 시점까지 확인할 수 있는 같은 계절의 완전한 개설 목록이 없습니다. 자료를 모으지 못한 학기를 미개설로 보지 않습니다.',
    evidenceRefs:[],
  };
}

function officialAlternatives(
  courseId:string, input:readonly OfferingAlternative[] | undefined,
):OfferingOutlookVNext['alternatives'] {
  if (input === undefined || input.length === 0) return [];
  if (input.length > MAX_OBSERVATIONS) throw new RangeError('more than 20 alternatives');
  const kept:OfferingOutlookVNext['alternatives'] = [];
  for (const alt of input) {
    if (alt.courseId === courseId) continue;
    if (alt.status !== 'OFFICIALLY_APPROVED' || alt.evidenceRef === undefined || alt.evidenceRef === '') continue;
    kept.push({courseId:alt.courseId, status:'OFFICIALLY_APPROVED', evidenceRef:alt.evidenceRef});
  }
  return kept;
}

/** Complete same-season rows with a known state. Partials, notices, and UNKNOWN do not count. */
function countsToward(row:OfferingObservation, season:string):boolean {
  return row.coverage === 'COMPLETE_TERM_CATALOG' && row.state !== 'UNKNOWN' && row.term.endsWith(`-${season}`);
}

function counts(rows:readonly OfferingObservation[], season:string):{n:number; k:number} {
  const complete = rows.filter(row => countsToward(row, season));
  return {n:complete.length, k:complete.filter(row => row.state === 'OFFERED').length};
}

function supportsConfirmation(row:OfferingObservation):boolean {
  if (row.state === 'UNKNOWN' || row.coverage === 'PARTIAL') return false;
  return row.coverage === 'COMPLETE_TERM_CATALOG' || row.coverage === 'NOTICE_ONLY';
}

function observationVisible(row:OfferingObservation, asOfMs:number):boolean {
  if (!TERM.test(row.term)) throw new RangeError('observation term must be YYYY-1 or YYYY-2');
  const published = readInstant('observation.publishedAt', row.publishedAt);
  const verified = readInstant('observation.verifiedAt', row.verifiedAt);
  if (verified < published) throw new RangeError('verifiedAt cannot precede publishedAt');
  return published <= asOfMs && verified <= asOfMs;
}

function eventApplies(event:OfficialAcademicEvent, targetTerm:string, asOfMs:number):boolean {
  const published = readInstant('event.publishedAt', event.publishedAt);
  const verified = readInstant('event.verifiedAt', event.verifiedAt);
  if (verified < published) throw new RangeError('verifiedAt cannot precede publishedAt');
  const from = readInstant('event.effectiveFrom', event.effectiveFrom);
  const until = event.effectiveUntil === undefined
    ? Number.POSITIVE_INFINITY
    : readInstant('event.effectiveUntil', event.effectiveUntil);
  if (until <= from) throw new RangeError('effectiveUntil must be after effectiveFrom');
  if (published > asOfMs || verified > asOfMs) return false;
  const window = termWindow(targetTerm);
  return from < window.end && until > window.start;
}

/**
 * Asia/Seoul regular-semester bounds used only to test whether an official event's
 * effective period meets the target term. Season 1 is March–June; season 2 is September–December.
 */
function termWindow(term:string):{start:number; end:number} {
  const year = Number(term.slice(0, 4));
  if (term.endsWith('-1')) {
    return {
      start:Date.parse(`${year}-03-01T00:00:00.000+09:00`),
      end:Date.parse(`${year}-07-01T00:00:00.000+09:00`),
    };
  }
  return {
    start:Date.parse(`${year}-09-01T00:00:00.000+09:00`),
    end:Date.parse(`${year + 1}-01-01T00:00:00.000+09:00`),
  };
}

function dedupe(rows:readonly OfferingObservation[]):OfferingObservation[] {
  const groups = new Map<string, OfferingObservation[]>();
  for (const row of rows) {
    const group = groups.get(row.term);
    if (group) group.push(row);
    else groups.set(row.term, [row]);
  }
  const kept:OfferingObservation[] = [];
  for (const group of groups.values()) {
    const chosen = chooseObservation(group);
    if (chosen) kept.push(cloneObservation(chosen));
  }
  kept.sort((a, b) => (a.term < b.term ? -1 : a.term > b.term ? 1 : 0));
  return kept;
}

function chooseObservation(group:readonly OfferingObservation[]):OfferingObservation | undefined {
  const best = Math.max(...group.map(row => coverageRank(row.coverage)));
  const top = group.filter(row => coverageRank(row.coverage) === best);
  const explicit = new Set(top.filter(row => row.state !== 'UNKNOWN').map(row => row.state));
  if (explicit.size > 1) return undefined;
  return latest(top);
}

function coverageRank(coverage:OfferingObservation['coverage']):number {
  if (coverage === 'COMPLETE_TERM_CATALOG') return 3;
  if (coverage === 'NOTICE_ONLY') return 2;
  return 1;
}

function capHistory(rows:readonly OfferingObservation[], season:string):OfferingObservation[] {
  const counting = rows.filter(row => countsToward(row, season));
  if (counting.length > MAX_OBSERVATIONS) throw new RangeError('more than 20 complete same-season observations');
  if (rows.length <= MAX_OBSERVATIONS) return [...rows];
  const countedTerms = new Set(counting.map(row => row.term));
  const rest = rows.filter(row => !countedTerms.has(row.term));
  const room = MAX_OBSERVATIONS - counting.length;
  const trimmed = [...counting, ...rest.slice(rest.length - room)];
  trimmed.sort((a, b) => (a.term < b.term ? -1 : a.term > b.term ? 1 : 0));
  return trimmed;
}

function cloneObservation(row:OfferingObservation):OfferingObservation {
  return {
    term:row.term,
    state:row.state,
    coverage:row.coverage,
    sourceRef:row.sourceRef,
    publishedAt:row.publishedAt,
    verifiedAt:row.verifiedAt,
  };
}

function cloneEvent(event:OfficialAcademicEvent):OfferingOutlookVNext['officialEvents'][number] {
  const copy = {
    eventId:event.eventId,
    kind:event.kind,
    sourceRef:event.sourceRef,
    publishedAt:event.publishedAt,
    verifiedAt:event.verifiedAt,
    effectiveFrom:event.effectiveFrom,
    impact:event.impact,
    affectedCourseIds:[...event.affectedCourseIds],
  };
  if (event.effectiveUntil === undefined) return copy;
  return {...copy, effectiveUntil:event.effectiveUntil};
}

function latest<T extends Timed>(rows:readonly T[]):T {
  const picked = rows.reduce<T | undefined>((best, row) => (best === undefined || after(row, best) ? row : best), undefined);
  if (picked === undefined) throw new RangeError('expected at least one dated record');
  return picked;
}

function laterOf(a:Timed | undefined, b:Timed | undefined):Timed {
  if (a === undefined) {
    if (b === undefined) throw new RangeError('expected at least one dated record');
    return b;
  }
  if (b === undefined) return a;
  return after(a, b) ? a : b;
}

function after(a:Timed, b:Timed):boolean {
  const verified = Date.parse(a.verifiedAt) - Date.parse(b.verifiedAt);
  if (verified !== 0) return verified > 0;
  const published = Date.parse(a.publishedAt) - Date.parse(b.publishedAt);
  if (published !== 0) return published > 0;
  return a.sourceRef > b.sourceRef;
}

function evidence(ids:readonly string[]):string[] {
  const unique = [...new Set(ids)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (unique.length > 50) throw new RangeError('more than 50 evidence refs');
  return unique;
}

function readInstant(label:string, iso:string):number {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed) || !OFFSET.test(iso)) {
    throw new RangeError(`${label} must be an ISO datetime with a timezone offset`);
  }
  return parsed;
}
