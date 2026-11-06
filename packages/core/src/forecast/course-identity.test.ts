import {describe, expect, it} from 'vitest';
import {OfferingOutlookVNextSchema} from '@hufs-one/contracts';
import {
  FORECAST_OFFERING_MODEL_VERSION, forecastOffering, forecastOfferings,
  type ObservationCourseIdentity, type OfferingObservation, type OfficialAcademicEvent,
} from './offering.js';
import {evaluateOfferingOutlook} from './rolling-origin.js';

/**
 * #11 (본선 전): offering rows whose course code or equivalence is not confirmed.
 * Synthetic SYN-* only. Past counts are not a probability or a guarantee.
 */

const ASOF = '2026-02-15T00:00:00.000+09:00';
const UNVERIFIED:ObservationCourseIdentity = {state:'EQUIVALENCE_UNVERIFIED'};
const resolvedAt = (checkedAt:string):ObservationCourseIdentity => ({state:'RESOLVED', revisionRef:'SYN-MAP-R1', checkedAt});

function row(term:string, state:OfferingObservation['state'], over:Partial<OfferingObservation> = {}):OfferingObservation {
  const year = term.slice(0, 4);
  return {term, state, coverage:'COMPLETE_TERM_CATALOG', sourceRef:`SYN-SRC-${term}`,
    publishedAt:`${year}-02-01T00:00:00.000+09:00`, verifiedAt:`${year}-02-02T00:00:00.000+09:00`, ...over};
}

function outlook(input:Parameters<typeof forecastOffering>[0]) {
  const result = forecastOffering(input);
  expect(OfferingOutlookVNextSchema.parse(result)).toEqual(result);
  return result;
}

const HISTORY = [row('2022-1', 'OFFERED'), row('2023-1', 'OFFERED'), row('2024-1', 'CONFIRMED_NOT_OFFERED'), row('2025-1', 'OFFERED')];
const base = {courseId:'SYN-COURSE-ID', targetTerm:'2026-1', asOf:ASOF};

describe('offering outlook: rows not confirmed to be this course (#11)', () => {
  it('names a new model version', () => {
    expect(FORECAST_OFFERING_MODEL_VERSION).toBe('forecast-offering-v3');
  });

  it('rows without courseIdentity keep the earlier result', () => {
    const plain = outlook({...base, observations:HISTORY});
    const marked = outlook({...base, observations:HISTORY.map(r => ({...r, courseIdentity:resolvedAt('2026-01-01T00:00:00.000+09:00')}))});
    expect(marked).toEqual(plain);
    expect([plain.signal, plain.sameSeasonObservedTerms, plain.sameSeasonOfferedTerms]).toEqual(['HISTORICAL_PATTERN', 4, 3]);
  });

  it('an unverified past row is not counted as offered, as closed, or in n', () => {
    for (const [index, wantN, wantK] of [[0, 3, 2], [2, 3, 3]] as const) {
      const rows = HISTORY.map((r, i) => (i === index ? {...r, courseIdentity:UNVERIFIED} : r));
      const result = outlook({...base, observations:rows});
      expect([result.sameSeasonObservedTerms, result.sameSeasonOfferedTerms], `row ${index}`).toEqual([wantN, wantK]);
      expect(result.observations.map(r => r.term), `row ${index}`).not.toContain(HISTORY[index]!.term);
      expect(result.evidenceRefs, `row ${index}`).not.toContain(HISTORY[index]!.sourceRef);
      expect(result.caveat, `row ${index}`).toMatch(/확인되지 않은 관측 1건은 세지 않았습니다/);
    }
  });

  it('unverified rows never make a pattern; with too few left it is not a 0/n count', () => {
    const rows = HISTORY.map((r, i) => (i < 2 ? {...r, courseIdentity:UNVERIFIED} : r));
    const result = outlook({...base, observations:rows});
    expect(result.signal).toBe('INSUFFICIENT_DATA');
    expect([result.sameSeasonObservedTerms, result.sameSeasonOfferedTerms]).toEqual([2, 1]);
    const none = outlook({...base, observations:HISTORY.map(r => ({...r, courseIdentity:UNVERIFIED}))});
    expect([none.signal, none.sameSeasonObservedTerms, none.sameSeasonOfferedTerms, none.observations]).toEqual(['UNKNOWN', 0, 0, []]);
    expect(none.caveat).toMatch(/관측 4건은 세지 않았습니다/);
  });

  it('a partial or notice row that is unverified is still not counted', () => {
    const partial = [row('2024-2', 'OFFERED', {coverage:'PARTIAL'}), row('2025-2', 'OFFERED', {coverage:'NOTICE_ONLY'})];
    const fall = {...base, targetTerm:'2026-2', asOf:'2026-08-01T00:00:00.000+09:00'};
    // Confirmed partial rows make the result "too little data"; unverified ones are not seen at all.
    expect(outlook({...fall, observations:[...HISTORY, ...partial]}).signal).toBe('INSUFFICIENT_DATA');
    const result = outlook({...fall, observations:[...HISTORY, ...partial.map(r => ({...r, courseIdentity:UNVERIFIED}))]});
    expect([result.signal, result.sameSeasonObservedTerms, result.observations]).toEqual(['UNKNOWN', 0, []]);
    expect(result.caveat).toMatch(/관측 2건은 세지 않았습니다/);
  });

  it('an unverified target-term row neither confirms nor closes the term', () => {
    for (const state of ['OFFERED', 'CONFIRMED_NOT_OFFERED'] as const) {
      for (const coverage of ['COMPLETE_TERM_CATALOG', 'NOTICE_ONLY'] as const) {
        const target = row('2026-1', state, {coverage, courseIdentity:UNVERIFIED, publishedAt:'2026-01-20T00:00:00.000+09:00',
          verifiedAt:'2026-01-21T00:00:00.000+09:00'});
        const result = outlook({...base, observations:[...HISTORY, target]});
        expect(result.signal, `${state} ${coverage}`).toBe('INSUFFICIENT_DATA');
        expect(result.sourcePublishedAt, `${state} ${coverage}`).toBeUndefined();
        // History is kept for display, but the target term is not answered from it.
        expect(result.sameSeasonObservedTerms, `${state} ${coverage}`).toBe(4);
      }
    }
  });

  it('a confirmed target row is not overturned by an unverified one', () => {
    const verified = row('2026-1', 'OFFERED', {publishedAt:'2026-01-20T00:00:00.000+09:00', verifiedAt:'2026-01-21T00:00:00.000+09:00'});
    const other = {...verified, state:'CONFIRMED_NOT_OFFERED' as const, sourceRef:'SYN-SRC-OTHER', courseIdentity:UNVERIFIED};
    const result = outlook({...base, observations:[verified, other]});
    expect(result.signal).toBe('CONFIRMED_OFFERED');
    expect(result.evidenceRefs).toEqual(['SYN-SRC-2026-1']);
  });

  it('an unverified row for a past term does not knock out the confirmed row of that term', () => {
    const conflicting = {...HISTORY[1]!, state:'CONFIRMED_NOT_OFFERED' as const, sourceRef:'SYN-SRC-OLD-CODE', courseIdentity:UNVERIFIED};
    const result = outlook({...base, observations:[...HISTORY, conflicting]});
    expect([result.sameSeasonObservedTerms, result.sameSeasonOfferedTerms]).toEqual([4, 3]);
  });

  it('a match checked after asOf is not used at that asOf', () => {
    const late = HISTORY.map((r, i) => (i === 3 ? {...r, courseIdentity:resolvedAt('2026-03-01T00:00:00.000+09:00')} : r));
    const early = outlook({...base, observations:late});
    expect([early.sameSeasonObservedTerms, early.sameSeasonOfferedTerms]).toEqual([3, 2]);
    const later = outlook({...base, asOf:'2026-03-02T00:00:00.000+09:00', observations:late});
    expect([later.sameSeasonObservedTerms, later.sameSeasonOfferedTerms]).toEqual([4, 3]);
  });

  it('an unconfirmed target course is UNKNOWN, even with a confirming catalog and events', () => {
    const cancel:OfficialAcademicEvent = {eventId:'SYN-EV-CANCEL', kind:'COURSE_CANCELLED', sourceRef:'SYN-SRC-CANCEL',
      publishedAt:'2026-01-10T00:00:00.000+09:00', verifiedAt:'2026-01-11T00:00:00.000+09:00',
      effectiveFrom:'2026-03-01T00:00:00.000+09:00', impact:'EXPLICIT_COURSE_STATUS', affectedCourseIds:['SYN-COURSE-ID']};
    const target = row('2026-1', 'OFFERED', {publishedAt:'2026-01-20T00:00:00.000+09:00', verifiedAt:'2026-01-21T00:00:00.000+09:00'});
    const result = outlook({...base, courseIdentity:'EQUIVALENCE_UNVERIFIED', observations:[...HISTORY, target], officialEvents:[cancel],
      alternatives:[{courseId:'SYN-COURSE-ALT', status:'OFFICIALLY_APPROVED', evidenceRef:'SYN-SRC-CANCEL'}]});
    expect(result).toMatchObject({signal:'UNKNOWN', evidenceRefs:[], observations:[], officialEvents:[], alternatives:[],
      sameSeasonObservedTerms:0, sameSeasonOfferedTerms:0});
    expect(result.caveat).toMatch(/대상 과목의 코드나 동등성이 확인되지 않아/);
  });

  it('forecastOfferings passes the target identity through and is not READY', () => {
    const result = forecastOfferings({asOf:ASOF, courses:[
      {courseId:'SYN-COURSE-A', targetTerm:'2026-1', observations:HISTORY},
      {courseId:'SYN-COURSE-B', targetTerm:'2026-1', observations:HISTORY, courseIdentity:'EQUIVALENCE_UNVERIFIED'},
    ]});
    expect(result.items.map(i => i.signal)).toEqual(['HISTORICAL_PATTERN', 'UNKNOWN']);
    expect(result.status).toBe('INSUFFICIENT_DATA');
  });

  it('input order does not change the result', () => {
    const rows = [...HISTORY.map((r, i) => (i % 2 ? {...r, courseIdentity:UNVERIFIED} : r)),
      {...HISTORY[0]!, sourceRef:'SYN-SRC-DUP', courseIdentity:UNVERIFIED}];
    const forward = outlook({...base, observations:rows});
    expect(outlook({...base, observations:[...rows].reverse()})).toEqual(forward);
    expect(outlook({...base, observations:[rows[2]!, rows[4]!, rows[0]!, rows[3]!, rows[1]!]})).toEqual(forward);
  });

  it('refuses a malformed identity, on any row', () => {
    const bad:unknown[] = [
      {state:'MAYBE'}, {state:'RESOLVED'}, {state:'RESOLVED', revisionRef:'bad ref', checkedAt:'2026-01-01T00:00:00.000+09:00'},
      {state:'RESOLVED', revisionRef:'SYN-MAP-R1', checkedAt:'2026-01-01'},
    ];
    for (const courseIdentity of bad) {
      // A future row the outlook would not read is still checked.
      const future = row('2027-1', 'OFFERED', {courseIdentity:courseIdentity as ObservationCourseIdentity});
      expect(() => forecastOffering({...base, observations:[...HISTORY, future]}), JSON.stringify(courseIdentity)).toThrow(RangeError);
    }
    expect(() => forecastOffering({...base, courseIdentity:'MAYBE' as never})).toThrow(/courseIdentity must be/);
  });
});

describe('rolling-origin answers use the same identity rule (#11)', () => {
  const origin = {asOf:'2025-02-15T00:00:00.000+09:00', targetTerm:'2025-1'};
  const past = [row('2022-1', 'OFFERED'), row('2023-1', 'OFFERED'), row('2024-1', 'OFFERED')];
  const answer = (over:Partial<OfferingObservation>) => row('2025-1', 'OFFERED', {publishedAt:'2025-02-20T00:00:00.000+09:00',
    verifiedAt:'2025-02-21T00:00:00.000+09:00', ...over});
  const evaluate = (rows:OfferingObservation[]) => evaluateOfferingOutlook({truthAsOf:'2026-01-01T00:00:00.000+09:00', origins:[origin],
    courses:[{courseId:'SYN-COURSE-EVAL', observations:rows}]}).total;

  it('an unverified answer row is no answer', () => {
    expect(evaluate([...past, answer({})]).scored).toBe(1);
    const held = evaluate([...past, answer({courseIdentity:UNVERIFIED})]);
    expect([held.scored, held.truthUnavailable]).toEqual([0, 1]);
  });

  it('an answer row matched after truthAsOf is no answer', () => {
    const held = evaluate([...past, answer({courseIdentity:resolvedAt('2026-02-01T00:00:00.000+09:00')})]);
    expect([held.scored, held.truthUnavailable]).toEqual([0, 1]);
  });

  it('unverified history at the origin is not counted in the outlook it scores', () => {
    const report = evaluate([...past.map((r, i) => (i === 0 ? {...r, courseIdentity:UNVERIFIED} : r)), answer({})]);
    expect(report.scored).toBe(1);
    expect(report.outlookSignals.HISTORICAL_PATTERN).toBe(0);
    expect(report.outlookSignals.INSUFFICIENT_DATA).toBe(1);
  });
});
