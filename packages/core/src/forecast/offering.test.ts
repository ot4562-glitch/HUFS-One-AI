import {describe, expect, it} from 'vitest';
import {OfferingOutlookVNextSchema} from '@hufs-one/contracts';
import {
  forecastOffering, forecastOfferings,
  type OfferingObservation, type OfficialAcademicEvent,
} from './offering.js';
import * as forecastIndex from './index.js';

// Synthetic course ids only. Past counts are not a probability or a guarantee.
const ASOF = '2026-02-15T00:00:00.000Z';

function catalog(
  term:string,
  state:OfferingObservation['state'],
  coverage:OfferingObservation['coverage'] = 'COMPLETE_TERM_CATALOG',
  publishedAt?:string,
  verifiedAt?:string,
):OfferingObservation {
  const year = term.slice(0, 4);
  const published = publishedAt ?? `${year}-02-01T00:00:00.000Z`;
  const verified = verifiedAt ?? (publishedAt === undefined ? `${year}-02-02T00:00:00.000Z` : published);
  return {term, state, coverage, sourceRef:`SYN-SRC-${term}`, publishedAt:published, verifiedAt:verified};
}

function personnel(
  kind:'RESEARCH_LEAVE'|'RETIREMENT'|'STAFF_CHANGE', courseId:string,
):OfficialAcademicEvent {
  return {
    eventId:`SYN-EVENT-${kind}`,
    kind,
    sourceRef:`SYN-SRC-${kind}`,
    publishedAt:'2026-01-10T00:00:00.000Z',
    verifiedAt:'2026-01-11T00:00:00.000Z',
    effectiveFrom:'2026-03-01T00:00:00.000+09:00',
    effectiveUntil:'2026-06-30T00:00:00.000+09:00',
    impact:'POTENTIAL_ASSIGNMENT_CHANGE',
    affectedCourseIds:[courseId],
  };
}

const threeClosed = [
  catalog('2023-1', 'CONFIRMED_NOT_OFFERED'),
  catalog('2024-1', 'CONFIRMED_NOT_OFFERED'),
  catalog('2025-1', 'CONFIRMED_NOT_OFFERED'),
];

function outlook(input:Parameters<typeof forecastOffering>[0]) {
  const result = forecastOffering(input);
  expect(OfferingOutlookVNextSchema.parse(result)).toEqual(result);
  return result;
}

describe('forecastOffering', () => {
  it('lets a confirmed open catalog override same-season history', () => {
    const result = outlook({
      courseId:'SYN-COURSE-OPEN',
      targetTerm:'2026-1',
      asOf:ASOF,
      observations:[
        ...threeClosed,
        catalog('2026-1', 'OFFERED', 'COMPLETE_TERM_CATALOG', '2026-02-01T00:00:00.000Z', '2026-02-02T00:00:00.000Z'),
      ],
    });
    expect(result.signal).toBe('CONFIRMED_OFFERED');
    expect(result.sourcePublishedAt).toBe('2026-02-01T00:00:00.000Z');
    expect(result.evidenceRefs).toEqual(['SYN-SRC-2026-1']);
    expect(result.observations.map(row => row.term)).toEqual(['2023-1', '2024-1', '2025-1']);
    expect(result.sameSeasonObservedTerms).toBe(3);
    expect(result.sameSeasonOfferedTerms).toBe(0);
    expect(result.alternatives).toEqual([]);
    expect(result).not.toHaveProperty('referenceScore');
  });

  it('keeps research leave, retirement, and staff change as EVENT_REVIEW', () => {
    for (const kind of ['RESEARCH_LEAVE', 'RETIREMENT', 'STAFF_CHANGE'] as const) {
      const courseId = 'SYN-COURSE-LEAVE';
      const result = outlook({
        courseId, targetTerm:'2026-1', asOf:ASOF,
        observations:threeClosed,
        officialEvents:[personnel(kind, courseId)],
      });
      expect(result.signal).toBe('EVENT_REVIEW');
      expect(result.signal).not.toBe('CONFIRMED_NOT_OFFERED');
      expect(result.officialEvents.map(event => event.kind)).toEqual([kind]);
      expect(result.caveat).toContain('미개설을 확정하지 않습니다');
    }
    const ignored = outlook({
      courseId:'SYN-COURSE-LEAVE',
      targetTerm:'2026-1',
      asOf:ASOF,
      observations:threeClosed,
      officialEvents:[personnel('RESEARCH_LEAVE', 'SYN-COURSE-OTHER')],
    });
    expect(ignored.signal).toBe('HISTORICAL_PATTERN');
    expect(ignored.officialEvents).toEqual([]);
  });

  it('does not turn a partial catalog into 0/n', () => {
    const result = outlook({
      courseId:'SYN-COURSE-PARTIAL',
      targetTerm:'2026-1',
      asOf:ASOF,
      observations:[
        catalog('2023-1', 'CONFIRMED_NOT_OFFERED', 'PARTIAL'),
        catalog('2024-1', 'CONFIRMED_NOT_OFFERED', 'PARTIAL'),
        catalog('2025-1', 'CONFIRMED_NOT_OFFERED', 'PARTIAL'),
      ],
    });
    expect(result.signal).toBe('INSUFFICIENT_DATA');
    expect(result.observations.map(row => row.coverage)).toEqual(['PARTIAL', 'PARTIAL', 'PARTIAL']);
    expect(result.sameSeasonObservedTerms).toBe(0);
    expect(result.sameSeasonOfferedTerms).toBe(0);
    expect(result.sameSeasonObservedTerms).not.toBe(result.observations.length);
    expect(result.caveat).toContain('0회 개설이 아닙니다');
  });

  it('reports a complete 0 of 3 as a historical count', () => {
    const result = outlook({
      courseId:'SYN-COURSE-NONE',
      targetTerm:'2026-1',
      asOf:ASOF,
      observations:threeClosed,
    });
    expect(result.signal).toBe('HISTORICAL_PATTERN');
    expect(result.sameSeasonObservedTerms).toBe(3);
    expect(result.sameSeasonOfferedTerms).toBe(0);
    expect(result.caveat).toBe(
      '과거 같은 계절 학기 3번 중 0번 개설된 횟수입니다. 과거 횟수일 뿐 확률이 아니고 개설을 보장하지 않습니다.',
    );
    expect(result).not.toHaveProperty('referenceScore');
    expect(JSON.stringify(result)).not.toContain('(k+1)');
  });

  it('returns INSUFFICIENT_DATA when only two complete terms are visible', () => {
    const result = outlook({
      courseId:'SYN-COURSE-TWO',
      targetTerm:'2026-1',
      asOf:ASOF,
      observations:[
        catalog('2024-1', 'OFFERED'),
        catalog('2025-1', 'OFFERED'),
      ],
    });
    expect(result.signal).toBe('INSUFFICIENT_DATA');
    expect(result.sameSeasonObservedTerms).toBe(2);
    expect(result.sameSeasonOfferedTerms).toBe(2);
  });

  it('excludes an observation whose publishedAt or verifiedAt is after asOf', () => {
    const result = outlook({
      courseId:'SYN-COURSE-FUTURE',
      targetTerm:'2026-1',
      asOf:'2025-03-01T00:00:00.000Z',
      observations:[
        catalog('2022-1', 'OFFERED', 'COMPLETE_TERM_CATALOG', '2022-02-01T00:00:00.000Z', '2025-08-01T00:00:00.000Z'),
        catalog('2023-1', 'OFFERED'),
        catalog('2024-1', 'OFFERED'),
        catalog('2025-1', 'OFFERED', 'COMPLETE_TERM_CATALOG', '2025-06-01T00:00:00.000Z', '2025-06-02T00:00:00.000Z'),
      ],
      officialEvents:[{
        ...personnel('RESEARCH_LEAVE', 'SYN-COURSE-FUTURE'),
        publishedAt:'2025-07-01T00:00:00.000Z',
        verifiedAt:'2025-07-02T00:00:00.000Z',
      }],
    });
    expect(result.observations.map(row => row.term)).toEqual(['2023-1', '2024-1']);
    expect(result.sameSeasonObservedTerms).toBe(2);
    expect(result.sameSeasonOfferedTerms).toBe(2);
    expect(result.signal).toBe('INSUFFICIENT_DATA');
    expect(result.officialEvents).toEqual([]);
  });

  it('uses two asOf cutoffs so a later offering stays hidden from the earlier one', () => {
    const observations = [
      catalog('2022-1', 'CONFIRMED_NOT_OFFERED'),
      catalog('2023-1', 'CONFIRMED_NOT_OFFERED'),
      catalog('2024-1', 'OFFERED', 'COMPLETE_TERM_CATALOG', '2024-06-01T00:00:00.000Z', '2024-06-02T00:00:00.000Z'),
    ];
    const snapshot = JSON.stringify(observations);
    const early = outlook({
      courseId:'SYN-COURSE-CUTOFF', targetTerm:'2026-1', asOf:'2024-01-01T00:00:00.000Z', observations,
    });
    const late = outlook({
      courseId:'SYN-COURSE-CUTOFF', targetTerm:'2026-1', asOf:'2024-07-01T00:00:00.000Z', observations,
    });
    expect(JSON.stringify(observations)).toBe(snapshot);
    expect(early.observations.map(row => row.term)).toEqual(['2022-1', '2023-1']);
    expect(early.sameSeasonObservedTerms).toBe(2);
    expect(early.sameSeasonOfferedTerms).toBe(0);
    expect(early.signal).toBe('INSUFFICIENT_DATA');
    expect(late.observations.map(row => row.term)).toEqual(['2022-1', '2023-1', '2024-1']);
    expect(late.observations.find(row => row.term === '2024-1')?.state).toBe('OFFERED');
    expect(late.sameSeasonObservedTerms).toBe(3);
    expect(late.sameSeasonOfferedTerms).toBe(1);
    expect(late.signal).toBe('HISTORICAL_PATTERN');
  });

  it('confirms a published cancellation and does not treat curriculum change as closure', () => {
    const cancelled = outlook({
      courseId:'SYN-COURSE-CANCEL',
      targetTerm:'2026-1',
      asOf:ASOF,
      officialEvents:[{
        eventId:'SYN-EVENT-CANCEL',
        kind:'COURSE_CANCELLED',
        sourceRef:'SYN-SRC-CANCEL',
        publishedAt:'2026-01-20T00:00:00.000Z',
        verifiedAt:'2026-01-21T00:00:00.000Z',
        effectiveFrom:'2026-03-01T00:00:00.000+09:00',
        effectiveUntil:'2026-06-30T00:00:00.000+09:00',
        impact:'EXPLICIT_COURSE_STATUS',
        affectedCourseIds:['SYN-COURSE-CANCEL'],
      }],
    });
    expect(cancelled.signal).toBe('CONFIRMED_NOT_OFFERED');
    expect(cancelled.sourcePublishedAt).toBe('2026-01-20T00:00:00.000Z');
    expect(cancelled.evidenceRefs).toEqual(['SYN-SRC-CANCEL']);

    const closedDespiteLeave = outlook({
      courseId:'SYN-COURSE-CLOSED',
      targetTerm:'2026-1',
      asOf:ASOF,
      observations:[catalog('2026-1', 'CONFIRMED_NOT_OFFERED', 'COMPLETE_TERM_CATALOG', '2026-02-01T00:00:00.000Z', '2026-02-02T00:00:00.000Z')],
      officialEvents:[personnel('RESEARCH_LEAVE', 'SYN-COURSE-CLOSED')],
    });
    expect(closedDespiteLeave.signal).toBe('INSUFFICIENT_DATA');
    expect(closedDespiteLeave.evidenceRefs).toEqual(['SYN-SRC-2026-1', 'SYN-SRC-RESEARCH_LEAVE']);
    expect(closedDespiteLeave.caveat).toContain('미개설로 확정하지 않습니다');

    const conflict = outlook({
      courseId:'SYN-COURSE-CONFLICT',
      targetTerm:'2026-1',
      asOf:ASOF,
      observations:[catalog('2026-1', 'OFFERED', 'COMPLETE_TERM_CATALOG', '2026-02-01T00:00:00.000Z', '2026-02-02T00:00:00.000Z')],
      officialEvents:[{
        eventId:'SYN-EVENT-CANCEL-CONFLICT',
        kind:'COURSE_CANCELLED',
        sourceRef:'SYN-SRC-CANCEL-CONFLICT',
        publishedAt:'2026-02-03T00:00:00.000Z',
        verifiedAt:'2026-02-04T00:00:00.000Z',
        effectiveFrom:'2026-03-01T00:00:00.000+09:00',
        effectiveUntil:'2026-06-30T00:00:00.000+09:00',
        impact:'EXPLICIT_COURSE_STATUS',
        affectedCourseIds:['SYN-COURSE-CONFLICT'],
      }],
    });
    expect(conflict.signal).toBe('INSUFFICIENT_DATA');
    expect(conflict.evidenceRefs).toEqual(['SYN-SRC-2026-1', 'SYN-SRC-CANCEL-CONFLICT']);

    const changed = outlook({
      courseId:'SYN-COURSE-CHANGE',
      targetTerm:'2026-1',
      asOf:ASOF,
      observations:[
        catalog('2023-1', 'OFFERED'),
        catalog('2024-1', 'OFFERED'),
        catalog('2025-1', 'OFFERED'),
      ],
      officialEvents:[{
        eventId:'SYN-EVENT-CURRICULUM',
        kind:'CURRICULUM_CHANGE',
        sourceRef:'SYN-SRC-CURRICULUM',
        publishedAt:'2026-01-04T00:00:00.000Z',
        verifiedAt:'2026-01-05T00:00:00.000Z',
        effectiveFrom:'2026-03-01T00:00:00.000+09:00',
        impact:'EXPLICIT_COURSE_STATUS',
        affectedCourseIds:['SYN-COURSE-CHANGE'],
      }],
    });
    expect(changed.signal).toBe('INSUFFICIENT_DATA');
    expect(changed.sameSeasonObservedTerms).toBe(3);
    expect(changed.sameSeasonOfferedTerms).toBe(3);
  });

  it('keeps alternatives empty unless the caller supplies an officially evidenced substitute', () => {
    const bare = outlook({
      courseId:'SYN-COURSE-ALT-NONE', targetTerm:'2026-1', asOf:ASOF, observations:threeClosed,
    });
    expect(bare.alternatives).toEqual([]);
    const replaced = outlook({
      courseId:'SYN-COURSE-ALT-NONE',
      targetTerm:'2026-1',
      asOf:ASOF,
      observations:threeClosed,
      officialEvents:[{
        eventId:'SYN-EVENT-REPLACE',
        kind:'REPLACEMENT_CONFIRMED',
        sourceRef:'SYN-SRC-REPLACE',
        publishedAt:'2026-01-02T00:00:00.000Z',
        verifiedAt:'2026-01-03T00:00:00.000Z',
        effectiveFrom:'2026-03-01T00:00:00.000+09:00',
        impact:'EXPLICIT_COURSE_STATUS',
        affectedCourseIds:['SYN-COURSE-ALT-NONE'],
      }],
      alternatives:[
        {courseId:'SYN-COURSE-ALT', status:'OFFICIALLY_APPROVED', evidenceRef:'SYN-SRC-REPLACE'},
        {courseId:'SYN-COURSE-BARE', status:'OFFICIALLY_APPROVED'},
        {courseId:'SYN-COURSE-REVIEW', status:'NEEDS_REVIEW'},
      ],
    });
    expect(replaced.signal).toBe('HISTORICAL_PATTERN');
    expect(replaced.alternatives).toEqual([
      {courseId:'SYN-COURSE-ALT', status:'OFFICIALLY_APPROVED', evidenceRef:'SYN-SRC-REPLACE'},
    ]);
    expect(replaced).not.toHaveProperty('instructor');
    expect(replaced).not.toHaveProperty('weekday');
    expect(replaced).not.toHaveProperty('classroom');
    expect(replaced).not.toHaveProperty('section');
  });
});

describe('forecastOfferings', () => {
  it('accepts 20 course ids and refuses a 21st', () => {
    const courses = (count:number) => Array.from({length:count}, (_, index) => ({
      courseId:`SYN-COURSE-${String(index + 1).padStart(2, '0')}`,
      targetTerm:'2026-1',
    }));
    const accepted = forecastOfferings({asOf:ASOF, courses:courses(20)});
    expect(accepted.items).toHaveLength(20);
    expect(accepted.status).toBe('INSUFFICIENT_DATA');
    expect(() => forecastOfferings({asOf:ASOF, courses:courses(21)})).toThrow(/refuses more than 20/);
  });

  it('is READY only when every course is confirmed or a historical pattern', () => {
    const ready = forecastOfferings({
      asOf:ASOF,
      courses:[{courseId:'SYN-COURSE-READY', targetTerm:'2026-1', observations:threeClosed}],
    });
    expect(ready.status).toBe('READY');
    expect(ready.items[0]?.signal).toBe('HISTORICAL_PATTERN');
    const mixed = forecastOfferings({
      asOf:ASOF,
      courses:[
        {courseId:'SYN-COURSE-READY', targetTerm:'2026-1', observations:threeClosed},
        {
          courseId:'SYN-COURSE-LEAVE',
          targetTerm:'2026-1',
          observations:threeClosed,
          officialEvents:[personnel('RESEARCH_LEAVE', 'SYN-COURSE-LEAVE')],
        },
      ],
    });
    expect(mixed.status).toBe('INSUFFICIENT_DATA');
    expect(mixed.items.map(item => item.signal)).toEqual(['HISTORICAL_PATTERN', 'EVENT_REVIEW']);
  });
});

describe('forecast index', () => {
  it('re-exports forecastOffering only', () => {
    expect(forecastIndex.forecastOffering).toBe(forecastOffering);
    expect('forecastOfferings' in forecastIndex).toBe(false);
  });
});
