import {describe, expect, it} from 'vitest';
import {OfferingOutlookVNextSchema, type OfferingOutlookVNext} from '@hufs-one/contracts';
import {forecastOffering, type OfferingObservation, type OfficialAcademicEvent} from './offering.js';
import {applyOfferingAssumptions, OFFERING_SCENARIO_CORE_VERSION, type OfferingAssumption} from './scenario.js';
import * as forecastIndex from './index.js';

// Synthetic course ids only (SYN-*). Every base outlook below is real forecastOffering output.
const ASOF = '2026-02-15T00:00:00.000Z';
const TERM = '2026-1';
const catalog = (term:string, state:OfferingObservation['state']):OfferingObservation => ({
  term, state, coverage:'COMPLETE_TERM_CATALOG', sourceRef:`SYN-SRC-${term}-${state}`,
  publishedAt:`${term.slice(0, 4)}-02-01T00:00:00.000Z`, verifiedAt:`${term.slice(0, 4)}-02-02T00:00:00.000Z`,
});
const offeredThreeSprings = [catalog('2023-1', 'OFFERED'), catalog('2024-1', 'OFFERED'), catalog('2025-1', 'OFFERED')];
const event = (kind:OfficialAcademicEvent['kind'], impact:OfficialAcademicEvent['impact'], courseId:string,
  over:Partial<OfficialAcademicEvent> = {}):OfficialAcademicEvent => ({
  eventId:`SYN-EVENT-${kind}`, kind, sourceRef:`SYN-SRC-${kind}`, publishedAt:'2026-01-10T00:00:00.000Z',
  verifiedAt:'2026-01-11T00:00:00.000Z', effectiveFrom:'2026-03-01T00:00:00.000+09:00',
  effectiveUntil:'2026-06-30T00:00:00.000+09:00', impact, affectedCourseIds:[courseId], ...over,
});
const outlook = (courseId:string, observations:readonly OfferingObservation[], officialEvents:readonly OfficialAcademicEvent[] = [],
  alternatives?:Parameters<typeof forecastOffering>[0]['alternatives']) =>
  forecastOffering({courseId, targetTerm:TERM, asOf:ASOF, observations, officialEvents,
    ...(alternatives === undefined ? {} : {alternatives})});

const HIST = outlook('SYN-HIST', offeredThreeSprings);
const OPEN = outlook('SYN-OPEN', [...offeredThreeSprings.map(row => ({...row, sourceRef:row.sourceRef + '-O'})), catalog(TERM, 'OFFERED')]);
const CLOSED = outlook('SYN-CLOSED', [catalog(TERM, 'CONFIRMED_NOT_OFFERED')]);
const LEAVE = outlook('SYN-LEAVE', offeredThreeSprings, [event('RESEARCH_LEAVE', 'POTENTIAL_ASSIGNMENT_CHANGE', 'SYN-LEAVE')]);
const REPL = outlook('SYN-REPL', offeredThreeSprings,
  [event('REPLACEMENT_CONFIRMED', 'EXPLICIT_COURSE_STATUS', 'SYN-REPL', {replacementCourseIds:['SYN-SUB']})],
  [{courseId:'SYN-SUB', status:'OFFICIALLY_APPROVED', evidenceRef:'SYN-SRC-REPLACEMENT_CONFIRMED'},
    {courseId:'SYN-GUESS', status:'NEEDS_REVIEW'}]);
const BASE = [HIST, OPEN, CLOSED, LEAVE, REPL];

const notOffered = (assumptionId:string, courseId:string,
  reason:Extract<OfferingAssumption, {assume:'NOT_OFFERED'}>['reason'] = 'RESEARCH_LEAVE'):OfferingAssumption =>
  ({assumptionId, courseId, targetTerm:TERM, assume:'NOT_OFFERED', reason});
const offered = (assumptionId:string, courseId:string):OfferingAssumption =>
  ({assumptionId, courseId, targetTerm:TERM, assume:'OFFERED', reason:'NEW_SECTION'});
const run = (assumptions:readonly OfferingAssumption[], base:readonly OfferingOutlookVNext[] = BASE) =>
  applyOfferingAssumptions({base, assumptions});

describe('applyOfferingAssumptions: a separate hypothetical layer', () => {
  it('fixture: the base outlooks cover each signal the overlay must respect', () => {
    expect(BASE.map(item => item.signal)).toEqual([
      'HISTORICAL_PATTERN', 'CONFIRMED_OFFERED', 'CONFIRMED_NOT_OFFERED', 'EVENT_REVIEW', 'HISTORICAL_PATTERN',
    ]);
    expect(REPL.alternatives).toEqual([{courseId:'SYN-SUB', status:'OFFICIALLY_APPROVED', evidenceRef:'SYN-SRC-REPLACEMENT_CONFIRMED'}]);
  });

  it('returns the base unchanged, in input order, and never shares objects with the input', () => {
    const input = structuredClone(BASE);
    const result = run([notOffered('A1', 'SYN-HIST'), offered('A2', 'SYN-CLOSED')], input);
    expect(result.coreVersion).toBe(OFFERING_SCENARIO_CORE_VERSION);
    expect(result.base).toEqual(BASE);
    expect(input).toEqual(BASE);
    result.base[0]!.alternatives.push({courseId:'SYN-X', status:'NEEDS_REVIEW'});
    (result.base[1] as {signal:string}).signal = 'UNKNOWN';
    expect(input).toEqual(BASE);
  });

  it('no assumption, no hypothetical row', () => {
    expect(run([]).scenario).toEqual([]);
  });

  it('a course assumed not offered keeps its base reading and lists only official substitutes', () => {
    const [row] = run([notOffered('A1', 'SYN-REPL', 'NO_REPLACEMENT_SECTION')]).scenario;
    expect(row).toEqual({
      layer:'HYPOTHETICAL', assumptionId:'A1', courseId:'SYN-REPL', targetTerm:TERM, assume:'NOT_OFFERED',
      reason:'NO_REPLACEMENT_SECTION', baseSignal:'HISTORICAL_PATTERN', contradictsOfficial:false,
      officialAlternatives:[{courseId:'SYN-SUB', evidenceRef:'SYN-SRC-REPLACEMENT_CONFIRMED'}],
      caveat:'학생이 정한 가정입니다. 이 과목이 이 학기에 열리지 않는다고 놓고 본 결과이며, 공식 개설 정보나 예측이 아닙니다.',
    });
  });

  it('a research-leave assumption is the student\'s; the base still says review, not closed', () => {
    const result = run([notOffered('A1', 'SYN-LEAVE')]);
    expect(result.base.find(item => item.courseId === 'SYN-LEAVE')!.signal).toBe('EVENT_REVIEW');
    expect(result.scenario[0]).toMatchObject({assume:'NOT_OFFERED', reason:'RESEARCH_LEAVE', baseSignal:'EVENT_REVIEW',
      contradictsOfficial:false, officialAlternatives:[]});
  });

  it('an assumption against an official confirmation says so, both ways', () => {
    const rows = run([notOffered('A1', 'SYN-OPEN', 'CANCELLATION'), offered('A2', 'SYN-CLOSED'), offered('A3', 'SYN-HIST')]).scenario;
    expect(rows.map(row => [row.courseId, row.contradictsOfficial])).toEqual([
      ['SYN-CLOSED', true], ['SYN-HIST', false], ['SYN-OPEN', true],
    ]);
    expect(rows.find(row => row.courseId === 'SYN-OPEN')!.caveat).toContain('공식 자료로 확인된 상태와 반대되는 가정입니다.');
    expect(rows.find(row => row.courseId === 'SYN-HIST')!.caveat).not.toContain('반대되는');
  });

  it('a substitute still under review is not offered as one, whatever the base carries', () => {
    const withGuess = {...HIST, alternatives:[{courseId:'SYN-GUESS', status:'NEEDS_REVIEW' as const}]};
    expect(OfferingOutlookVNextSchema.safeParse(withGuess).success).toBe(true);
    expect(run([notOffered('A1', 'SYN-HIST')], [withGuess]).scenario[0]!.officialAlternatives).toEqual([]);
  });

  it('a course assumed offered lists no substitutes', () => {
    expect(run([offered('A1', 'SYN-REPL')]).scenario[0]!.officialAlternatives).toEqual([]);
  });

  it('a hypothetical row cannot pass as an outlook, so credits, plans or recommendations cannot read it as one', () => {
    const rows = run([notOffered('A1', 'SYN-HIST'), offered('A2', 'SYN-CLOSED')]).scenario;
    for (const row of rows) {
      expect(OfferingOutlookVNextSchema.safeParse(row).success).toBe(false);
      expect(row.layer).toBe('HYPOTHETICAL');
      expect('signal' in row).toBe(false);
    }
  });

  it('does not depend on the order of assumptions', () => {
    const assumptions = [notOffered('A1', 'SYN-HIST'), offered('A2', 'SYN-CLOSED'), notOffered('A3', 'SYN-REPL')];
    expect(run([...assumptions].reverse())).toEqual(run(assumptions));
    expect(run(assumptions).scenario.map(row => row.courseId)).toEqual(['SYN-CLOSED', 'SYN-HIST', 'SYN-REPL']);
  });

  it('refuses assumptions it cannot place or that would leave the answer to list order', () => {
    expect(() => run([notOffered('A1', 'SYN-NOT-IN-BASE')])).toThrow(/no base outlook/);
    expect(() => run([{...notOffered('A1', 'SYN-HIST'), targetTerm:'2026-2'}])).toThrow(/no base outlook/);
    expect(() => run([notOffered('A1', 'SYN-HIST'), offered('A2', 'SYN-HIST')])).toThrow(/two assumptions/);
    expect(() => run([notOffered('A1', 'SYN-HIST'), notOffered('A1', 'SYN-OPEN')])).toThrow(/duplicate assumption/);
    expect(() => run([notOffered('bad id', 'SYN-HIST')])).toThrow(TypeError);
    expect(() => run([{...offered('A1', 'SYN-HIST'), reason:'RESEARCH_LEAVE'} as never])).toThrow(/does not fit OFFERED/);
    expect(() => run([{...notOffered('A1', 'SYN-HIST'), reason:'NEW_SECTION'} as never])).toThrow(/does not fit NOT_OFFERED/);
    expect(() => run([{...notOffered('A1', 'SYN-HIST'), assume:'MAYBE'} as never])).toThrow(/assume must be/);
    expect(() => run([], [HIST, HIST])).toThrow(/two base outlooks/);
    expect(() => run([], [{...HIST, signal:'CONFIRMED_OFFERED'}])).toThrow();
    expect(() => run([], Array.from({length:21}, (_, index) => ({...HIST, courseId:`SYN-C${index}`})))).toThrow(RangeError);
    expect(() => run(Array.from({length:21}, (_, index) => notOffered(`A${index}`, 'SYN-HIST')))).toThrow(RangeError);
  });

  it('keeps its invariants on 300 seeded random scenarios', () => {
    let seed = 1105;
    const random = () => {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = <T>(values:readonly T[]):T => values[Math.floor(random() * values.length)]!;
    // A schema-valid base row that mixes an approved substitute with one still under review.
    const mixed = {...HIST, courseId:'SYN-MIXED', alternatives:[
      {courseId:'SYN-SUB2', status:'OFFICIALLY_APPROVED' as const, evidenceRef:'SYN-SRC-SUB2'},
      {courseId:'SYN-GUESS2', status:'NEEDS_REVIEW' as const},
    ]};
    const pool = [...BASE, mixed];
    const approvedOf = (item:OfferingOutlookVNext) => item.alternatives.flatMap(alternative =>
      alternative.status === 'OFFICIALLY_APPROVED' && alternative.evidenceRef !== undefined
        ? [{courseId:alternative.courseId, evidenceRef:alternative.evidenceRef}] : []);
    let rows = 0, contradictions = 0, substitutes = 0;
    for (let round = 0; round < 300; round += 1) {
      const base = pool.filter(() => random() < 0.7);
      const assumptions:OfferingAssumption[] = base.filter(() => random() < 0.6).map((item, index) => random() < 0.5
        ? {assumptionId:`R${round}-${index}`, courseId:item.courseId, targetTerm:item.targetTerm, assume:'NOT_OFFERED',
          reason:pick(['RESEARCH_LEAVE', 'NO_REPLACEMENT_SECTION', 'CANCELLATION', 'OTHER'] as const)}
        : {assumptionId:`R${round}-${index}`, courseId:item.courseId, targetTerm:item.targetTerm, assume:'OFFERED',
          reason:pick(['NEW_SECTION', 'OTHER'] as const)});
      const result = run(assumptions, base);
      expect(result.base).toEqual(base);
      expect(result.scenario.map(row => row.assumptionId).sort()).toEqual(assumptions.map(item => item.assumptionId).sort());
      for (const row of result.scenario) {
        const item = base.find(value => value.courseId === row.courseId && value.targetTerm === row.targetTerm)!;
        expect(row.baseSignal).toBe(item.signal);
        expect(row.contradictsOfficial).toBe(row.assume === 'NOT_OFFERED'
          ? item.signal === 'CONFIRMED_OFFERED' : item.signal === 'CONFIRMED_NOT_OFFERED');
        expect(row.officialAlternatives).toEqual(row.assume === 'NOT_OFFERED' ? approvedOf(item) : []);
        expect(OfferingOutlookVNextSchema.safeParse(row).success).toBe(false);
        rows += 1;
        if (row.contradictsOfficial) contradictions += 1;
        if (row.officialAlternatives.length) substitutes += 1;
      }
      expect(run([...assumptions].reverse(), base)).toEqual(result);
    }
    // The random cases reach every branch, not only the easy one.
    expect(Math.min(rows, contradictions, substitutes)).toBeGreaterThan(20);
  });

  it('is exported from the forecast index', () => {
    expect(forecastIndex.applyOfferingAssumptions).toBe(applyOfferingAssumptions);
  });
});
