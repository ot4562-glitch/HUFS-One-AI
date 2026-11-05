import {describe, expect, it} from 'vitest';
import {
  buildAcademicLedger,
  type LedgerAttempt,
  type LedgerRequirement,
} from '../../packages/core/src/academics/ledger.js';

const areas = ['SYN-A', 'SYN-B', 'SYN-C'] as const;
const asOf = '2026-11-05T00:00:00.000Z';
type State = 'SATISFIED' | 'UNSATISFIED' | 'NEEDS_REVIEW';

function* layouts(length:number, prefix:number[] = []):Generator<number[]> {
  if (prefix.length === length) {
    yield prefix;
    return;
  }
  for (let mask = 0; mask < 8; mask++) yield* layouts(length, [...prefix, mask]);
}

function candidates(mask:number):string[] {
  return areas.filter((_, index) => (mask & (1 << index)) !== 0);
}

function attempt(id:string, areaIds:string[], ledger:LedgerAttempt['ledger'] = 'EARNED'):LedgerAttempt {
  return {
    attemptToken:id,
    canonicalCourseId:id,
    creditUnits:6,
    ledger,
    areaIds,
    recognition:'RECOGNIZED',
    term:ledger === 'EARNED' ? '2025-2' : '2027-1',
  };
}

function attemptsFor(masks:readonly number[]):LedgerAttempt[] {
  return masks.map((mask, index) => attempt(`SYN-C-${index}`, candidates(mask)));
}

// Independent finite oracle: enumerate every legal single-area assignment.
// It intentionally does not use matching, set cover, or production helpers.
function oracle(masks:readonly number[], minAreas:number, requiredCreditUnits:number) {
  const eligible = masks.map(candidates).filter(options => options.length > 0);
  let assignments:string[][] = [[]];
  for (const options of eligible) {
    assignments = assignments.flatMap(assigned => options.map(area => [...assigned, area]));
  }
  const distinctCounts = assignments.map(assigned => new Set(assigned).size);
  const earnedCreditUnits = eligible.length * 6;
  const enoughCredits = earnedCreditUnits >= requiredCreditUnits;
  const best = Math.max(...distinctCounts);
  const worst = Math.min(...distinctCounts);
  const state:State = !enoughCredits || best < minAreas
    ? 'UNSATISFIED'
    : worst >= minAreas ? 'SATISFIED' : 'NEEDS_REVIEW';
  return {state, earnedCreditUnits, remainingCreditUnits:Math.max(0, requiredCreditUnits - earnedCreditUnits)};
}

function evaluate(attempts:LedgerAttempt[], minAreas:number, requiredCreditUnits:number) {
  const requirement:LedgerRequirement = {
    id:'SYN-AREA',
    kind:'AREA_SPREAD',
    areaIds:[...areas],
    minAreas,
    requiredCreditUnits,
    evidenceRefs:['SYN-REF'],
  };
  return buildAcademicLedger({
    asOf,
    rulePackVersion:'SYN-PACK',
    rulePackState:'APPROVED',
    attempts,
    requirements:[requirement],
  }).requirements[0]!;
}

describe('#223 AREA_SPREAD finite properties', () => {
  it('agrees with all legal allocations for every small earned-course layout', () => {
    const observed:Record<State, number> = {SATISFIED:0, UNSATISFIED:0, NEEDS_REVIEW:0};
    let cases = 0;
    for (let courseCount = 0; courseCount <= 3; courseCount++) {
      for (const masks of layouts(courseCount)) {
        for (let minAreas = 1; minAreas <= 3; minAreas++) {
          for (const requiredCreditUnits of [6, 12]) {
            const expected = oracle(masks, minAreas, requiredCreditUnits);
            const context = JSON.stringify({masks, minAreas, requiredCreditUnits});
            const attempts = attemptsFor(masks);
            expect(evaluate(attempts, minAreas, requiredCreditUnits), context).toMatchObject(expected);
            expect(evaluate([...attempts].reverse(), minAreas, requiredCreditUnits), context)
              .toMatchObject(expected);
            observed[expected.state]++;
            cases++;
          }
        }
      }
    }
    expect(cases).toBe(3510);
    expect(Object.values(observed).every(count => count > 0)).toBe(true);
  });

  it('keeps earned decisions and credits invariant when uncompleted multi-area courses are added', () => {
    let cases = 0;
    for (let courseCount = 0; courseCount <= 3; courseCount++) {
      for (const masks of layouts(courseCount)) {
        const attempts = attemptsFor(masks);
        const expected = oracle(masks, 2, 12);
        for (const ledger of ['PLANNED', 'IN_PROGRESS'] as const) {
          const additional = attempt('SYN-UNCOMPLETED', [...areas], ledger);
          const context = JSON.stringify({masks, ledger});
          expect(evaluate([...attempts, additional], 2, 12), context).toMatchObject({
            ...expected,
            projectedCreditUnits:expected.earnedCreditUnits + 6,
          });
          cases++;
        }
      }
    }
    expect(cases).toBe(1170);
  });
});
