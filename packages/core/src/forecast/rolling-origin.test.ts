import {describe, expect, it} from 'vitest';
import type {OfferingObservation, OfficialAcademicEvent} from './offering.js';
import {
  EVALUATION_METHODS, evaluateOfferingOutlook,
  type EvaluationCourse, type EvaluationMethod, type RollingOriginReport,
} from './rolling-origin.js';

// Synthetic course ids only (SYN-*). Spring catalogs are published on 1/25 and verified on 1/26.
const ORIGIN_2025 = {asOf:'2025-01-01T00:00:00.000+09:00', targetTerm:'2025-1'};
const ORIGIN_2026 = {asOf:'2026-01-01T00:00:00.000+09:00', targetTerm:'2026-1'};
const TRUTH_AS_OF = '2026-11-01T00:00:00.000+09:00';

type State = OfferingObservation['state'];
const row = (term:string, state:State, over:Partial<OfferingObservation> = {}):OfferingObservation => ({
  term, state, coverage:'COMPLETE_TERM_CATALOG', sourceRef:`SYN-SRC-${term}-${state}`,
  publishedAt:`${term.slice(0, 4)}-01-25T00:00:00.000+09:00`,
  verifiedAt:`${term.slice(0, 4)}-01-26T00:00:00.000+09:00`, ...over,
});
/** O = offered, N = confirmed not offered, one spring term per letter from 2021-1. */
const springs = (pattern:string):OfferingObservation[] => [...pattern].map((letter, index) =>
  row(`${2021 + index}-1`, letter === 'O' ? 'OFFERED' : 'CONFIRMED_NOT_OFFERED'));
const course = (courseId:string, observations:readonly OfferingObservation[],
  officialEvents?:readonly OfficialAcademicEvent[]):EvaluationCourse =>
  officialEvents === undefined ? {courseId, observations} : {courseId, observations, officialEvents};
const event = (kind:OfficialAcademicEvent['kind'], impact:OfficialAcademicEvent['impact'], courseId:string,
  publishedAt:string, year:number):OfficialAcademicEvent => ({
  eventId:`SYN-EVENT-${kind}-${year}`, kind, sourceRef:`SYN-SRC-${kind}-${year}`, publishedAt, verifiedAt:publishedAt,
  effectiveFrom:`${year}-03-01T00:00:00.000+09:00`, effectiveUntil:`${year}-06-30T00:00:00.000+09:00`,
  impact, affectedCourseIds:[courseId],
});

/** Seasons 2021-1..2026-1. Each course is built so that the methods disagree somewhere. */
const COURSES:EvaluationCourse[] = [
  course('SYN-ALWAYS', springs('OOOOOO')),
  course('SYN-NEVER', springs('NNNNNN')),
  course('SYN-FLIP', springs('OOONNN')),
  course('SYN-SHORT', springs('OOOOOO').slice(2)),
  course('SYN-TIE', springs('ONONOO')),
  course('SYN-LEAVE', springs('OOOOOO'),
    [event('RESEARCH_LEAVE', 'POTENTIAL_ASSIGNMENT_CHANGE', 'SYN-LEAVE', '2024-12-01T00:00:00.000+09:00', 2025)]),
  course('SYN-CANCEL', springs('OOOOON'),
    [event('COURSE_CANCELLED', 'EXPLICIT_COURSE_STATUS', 'SYN-CANCEL', '2025-12-15T00:00:00.000+09:00', 2026)]),
  course('SYN-EARLY', [...springs('OOOO'),
    row('2025-1', 'OFFERED', {publishedAt:'2024-12-20T00:00:00.000+09:00', verifiedAt:'2024-12-21T00:00:00.000+09:00'}),
    row('2026-1', 'OFFERED')]),
  course('SYN-PARTIAL', [...springs('OOOOO'), row('2026-1', 'OFFERED', {coverage:'PARTIAL'})]),
  course('SYN-CONFLICT', [...springs('OOOOO'), row('2026-1', 'OFFERED'),
    row('2026-1', 'CONFIRMED_NOT_OFFERED', {sourceRef:'SYN-SRC-2026-1-RECHECK'})]),
];

const evaluate = (courses:readonly EvaluationCourse[] = COURSES, origins = [ORIGIN_2025, ORIGIN_2026], truthAsOf = TRUTH_AS_OF) =>
  evaluateOfferingOutlook({truthAsOf, origins, courses});
const origin = (report:RollingOriginReport, targetTerm:string) => {
  const found = report.origins.find(item => item.targetTerm === targetTerm);
  if (!found) throw new Error(`no origin for ${targetTerm}`);
  return found;
};
/** What each method answered for one course at one origin, as TP/FP/FN/TN/ABSTAIN. */
const outcomes = (courseId:string, targetTerm:string) => {
  const one = COURSES.find(item => item.courseId === courseId)!;
  const methods = origin(evaluate([one]), targetTerm).methods;
  return Object.fromEntries(EVALUATION_METHODS.map(method => {
    const s = methods[method];
    const label = s.truePositive ? 'TP' : s.falsePositive ? 'FP' : s.falseNegative ? 'FN' : s.trueNegative ? 'TN'
      : s.abstained ? 'ABSTAIN' : 'NOT_SCORED';
    return [method, label];
  })) as Record<EvaluationMethod, string>;
};

describe('evaluateOfferingOutlook: same items for every method', () => {
  it('scores every method on the same denominator and accounts for every course', () => {
    const report = evaluate();
    for (const tally of [...report.origins, report.total]) {
      expect(tally.scored + tally.alreadyPublished + tally.truthUnavailable + tally.truthConflicting).toBe(tally.courses);
      expect(tally.truth.offered + tally.truth.notOffered).toBe(tally.scored);
      expect(Object.values(tally.outlookSignals).reduce((sum, value) => sum + value, 0)).toBe(tally.scored);
      for (const method of EVALUATION_METHODS) {
        const s = tally.methods[method];
        expect(s.answered + s.abstained).toBe(tally.scored);
        expect(s.truePositive + s.falsePositive + s.falseNegative + s.trueNegative).toBe(s.answered);
        expect(s.correct).toBe(s.truePositive + s.trueNegative);
      }
    }
    expect(report.status).toBe('READY');
  });

  it('gives the expected answer per course, method and origin', () => {
    expect(outcomes('SYN-ALWAYS', '2025-1')).toEqual({OUTLOOK:'TP', RECENT_SAME_SEASON:'TP', HISTORY_MAJORITY:'TP', ALWAYS_OFFERED:'TP'});
    expect(outcomes('SYN-NEVER', '2026-1')).toEqual({OUTLOOK:'TN', RECENT_SAME_SEASON:'TN', HISTORY_MAJORITY:'TN', ALWAYS_OFFERED:'FP'});
    // 3 of 4 springs offered, then closed: the majority reading is wrong, the latest term is right.
    expect(outcomes('SYN-FLIP', '2025-1')).toEqual({OUTLOOK:'FP', RECENT_SAME_SEASON:'TN', HISTORY_MAJORITY:'FP', ALWAYS_OFFERED:'FP'});
    // Two complete springs are not a pattern for the outlook, but the naive baselines answer.
    expect(outcomes('SYN-SHORT', '2025-1')).toEqual({OUTLOOK:'ABSTAIN', RECENT_SAME_SEASON:'TP', HISTORY_MAJORITY:'TP', ALWAYS_OFFERED:'TP'});
    expect(outcomes('SYN-SHORT', '2026-1')).toEqual({OUTLOOK:'TP', RECENT_SAME_SEASON:'TP', HISTORY_MAJORITY:'TP', ALWAYS_OFFERED:'TP'});
    // 2 of 4 is a tie: no answer from a majority reading.
    expect(outcomes('SYN-TIE', '2025-1')).toEqual({OUTLOOK:'ABSTAIN', RECENT_SAME_SEASON:'FN', HISTORY_MAJORITY:'ABSTAIN', ALWAYS_OFFERED:'TP'});
    // A research leave sends the outlook to review; it does not call the course closed.
    expect(outcomes('SYN-LEAVE', '2025-1')).toEqual({OUTLOOK:'ABSTAIN', RECENT_SAME_SEASON:'TP', HISTORY_MAJORITY:'TP', ALWAYS_OFFERED:'TP'});
    expect(outcomes('SYN-LEAVE', '2026-1')).toEqual({OUTLOOK:'TP', RECENT_SAME_SEASON:'TP', HISTORY_MAJORITY:'TP', ALWAYS_OFFERED:'TP'});
    // An official cancellation published before the origin is a real forecast input.
    expect(outcomes('SYN-CANCEL', '2026-1')).toEqual({OUTLOOK:'TN', RECENT_SAME_SEASON:'FP', HISTORY_MAJORITY:'FP', ALWAYS_OFFERED:'FP'});
    // Before that notice was published, the 2025 origin saw only history.
    expect(outcomes('SYN-CANCEL', '2025-1')).toEqual({OUTLOOK:'TP', RECENT_SAME_SEASON:'TP', HISTORY_MAJORITY:'TP', ALWAYS_OFFERED:'TP'});
  });

  it('records which outlook signals were scored', () => {
    expect(origin(evaluate(), '2025-1').outlookSignals).toEqual({
      CONFIRMED_OFFERED:0, CONFIRMED_NOT_OFFERED:0, HISTORICAL_PATTERN:7, EVENT_REVIEW:1, INSUFFICIENT_DATA:1, UNKNOWN:0,
    });
    expect(origin(evaluate(), '2026-1').outlookSignals).toEqual({
      CONFIRMED_OFFERED:0, CONFIRMED_NOT_OFFERED:1, HISTORICAL_PATTERN:7, EVENT_REVIEW:0, INSUFFICIENT_DATA:0, UNKNOWN:0,
    });
  });
});

describe('items left out of every method alike', () => {
  it('counts a target term already published at the origin, even before it was verified', () => {
    const report = evaluate();
    expect(origin(report, '2025-1').alreadyPublished).toBe(1);
    expect(outcomes('SYN-EARLY', '2025-1').OUTLOOK).toBe('NOT_SCORED');
    const unverified = course('SYN-UNVERIFIED', [...springs('OOOO'),
      row('2025-1', 'OFFERED', {publishedAt:'2024-12-20T00:00:00.000+09:00', verifiedAt:'2025-01-26T00:00:00.000+09:00'})]);
    expect(origin(evaluate([unverified]), '2025-1').alreadyPublished).toBe(1);
  });

  it('counts a partial target catalog as no answer, and disagreeing complete catalogs as conflicting', () => {
    const report = origin(evaluate(), '2026-1');
    expect(report.truthUnavailable).toBe(1);
    expect(report.truthConflicting).toBe(1);
    expect(report.scored).toBe(8);
  });

  it('does not read an answer that was not yet published or verified at truthAsOf', () => {
    const late = course('SYN-LATE', [...springs('OOOO'),
      row('2025-1', 'OFFERED', {publishedAt:'2025-01-25T00:00:00.000+09:00', verifiedAt:'2026-12-01T00:00:00.000+09:00'})]);
    expect(origin(evaluate([late]), '2025-1').truthUnavailable).toBe(1);
  });
});

describe('no leakage from after the origin', () => {
  it('rows and events published after an origin do not change any answer at that origin', () => {
    const before = origin(evaluate(), '2025-1');
    const withLateRows = COURSES.map(item => ({
      ...item,
      observations:[...item.observations,
        // A correction of an old term published after the 2025 origin.
        row('2023-1', 'CONFIRMED_NOT_OFFERED', {sourceRef:'SYN-SRC-LATE-FIX', publishedAt:'2025-05-01T00:00:00.000+09:00',
          verifiedAt:'2025-05-02T00:00:00.000+09:00'}),
      ],
      officialEvents:[...(item.officialEvents ?? []),
        event('COURSE_CANCELLED', 'EXPLICIT_COURSE_STATUS', item.courseId, '2025-02-15T00:00:00.000+09:00', 2025)],
    }));
    const after = origin(evaluate(withLateRows), '2025-1');
    expect(after.methods).toEqual(before.methods);
    expect(after.outlookSignals).toEqual(before.outlookSignals);
    expect(after.historyCounts).toEqual(before.historyCounts);
  });
});

describe('history counts', () => {
  it('tallies each shown k/n with what happened next, without turning it into a rate', () => {
    expect(origin(evaluate(), '2025-1').historyCounts).toEqual([
      {offeredTerms:0, observedTerms:4, shown:1, thenOffered:0},
      {offeredTerms:2, observedTerms:4, shown:1, thenOffered:1},
      {offeredTerms:3, observedTerms:4, shown:1, thenOffered:0},
      {offeredTerms:4, observedTerms:4, shown:4, thenOffered:4},
    ]);
    const total = evaluate().total.historyCounts;
    expect(total.reduce((sum, item) => sum + item.shown, 0)).toBe(14);
    // History looks back 8 semesters, so no count covers more than 4 spring terms.
    expect(total.every(item => item.observedTerms <= 4)).toBe(true);
    // 2/4 was shown three times (TIE in 2025, FLIP and TIE in 2026) and was followed by an offering twice.
    expect(total.find(item => item.offeredTerms === 2 && item.observedTerms === 4)).toEqual(
      {offeredTerms:2, observedTerms:4, shown:3, thenOffered:2});
  });

  it('holds integers only and has no rate, probability, accuracy or IoU field', () => {
    const report = evaluate();
    const walk = (value:unknown, path:string):void => {
      if (typeof value === 'number') expect(Number.isInteger(value), path).toBe(true);
      else if (Array.isArray(value)) value.forEach((item, index) => walk(item, `${path}[${index}]`));
      else if (value && typeof value === 'object') {
        for (const [key, item] of Object.entries(value)) {
          expect(key, path).not.toMatch(/rate|prob|accura|iou|percent|ratio/i);
          walk(item, `${path}.${key}`);
        }
      }
    };
    walk(report, 'report');
  });
});

describe('READY needs two origin instants that scored items', () => {
  it('a single origin is not a rolling-origin evaluation', () => {
    expect(evaluate(COURSES, [ORIGIN_2026]).status).toBe('INSUFFICIENT_DATA');
  });

  it('two targets from one instant still count as one origin', () => {
    const falls = ['2021-2', '2022-2', '2023-2', '2024-2', '2025-2'].map(term => ({
      ...row(term, 'OFFERED'),
      publishedAt:`${term.slice(0, 4)}-07-25T00:00:00.000+09:00`, verifiedAt:`${term.slice(0, 4)}-07-26T00:00:00.000+09:00`,
    }));
    const both = course('SYN-BOTH', [...springs('OOOOO'), ...falls]);
    const report = evaluate([both], [ORIGIN_2025, {asOf:ORIGIN_2025.asOf, targetTerm:'2025-2'}]);
    expect(report.origins.map(item => item.scored)).toEqual([1, 1]);
    expect(report.status).toBe('INSUFFICIENT_DATA');
  });

  it('an origin that scored nothing does not count', () => {
    const report = evaluate([COURSES.find(item => item.courseId === 'SYN-PARTIAL')!]);
    expect(report.origins.map(item => item.scored)).toEqual([1, 0]);
    expect(report.status).toBe('INSUFFICIENT_DATA');
  });
});

describe('input checks and determinism', () => {
  it('does not depend on the order of courses or origins', () => {
    expect(evaluate([...COURSES].reverse(), [ORIGIN_2026, ORIGIN_2025])).toEqual(evaluate());
  });

  it('refuses an origin at or after its target term start, or after truthAsOf', () => {
    expect(() => evaluate(COURSES, [ORIGIN_2025, {asOf:'2026-03-01T00:00:00.000+09:00', targetTerm:'2026-1'}])).toThrow(RangeError);
    expect(() => evaluate(COURSES, [ORIGIN_2025, ORIGIN_2026], '2025-12-31T00:00:00.000+09:00')).toThrow(RangeError);
  });

  it('refuses malformed or duplicate input', () => {
    expect(() => evaluate(COURSES, [ORIGIN_2025, ORIGIN_2025])).toThrow(TypeError);
    expect(() => evaluate([COURSES[0]!, COURSES[0]!])).toThrow(TypeError);
    expect(() => evaluate([course('SYN-BAD', [row('2025-3', 'OFFERED')])])).toThrow(RangeError);
    expect(() => evaluate([course('SYN-BAD', [row('2024-1', 'OFFERED', {publishedAt:'2024-01-25T00:00:00'})])])).toThrow(RangeError);
    expect(() => evaluate([course('SYN-BAD', [row('2024-1', 'OFFERED', {verifiedAt:'2024-01-24T00:00:00.000+09:00'})])])).toThrow(RangeError);
    expect(() => evaluate([course(' ', springs('OOO'))])).toThrow(RangeError);
    expect(() => evaluate(COURSES, [ORIGIN_2025, {asOf:ORIGIN_2026.asOf, targetTerm:'2026-S'}])).toThrow(RangeError);
    expect(() => evaluate(COURSES, [ORIGIN_2025, ORIGIN_2026], '2026-11-01')).toThrow(RangeError);
    expect(() => evaluate(Array.from({length:201}, (_, index) => course(`SYN-${index}`, [])))).toThrow(RangeError);
  });
});
