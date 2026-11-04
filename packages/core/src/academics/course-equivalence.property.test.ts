import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {applySameCourseRules, type SameCourseRule} from './course-equivalence.js';
import {buildAcademicLedger, type LedgerAttempt, type LedgerRequirement} from './ledger.js';

/**
 * Seeded properties for 동일 교과목 rules composed with the credit ledger (#202, #189). Synthetic only.
 *
 * Reproduce one seed:  SAME_COURSE_PROP_SEED=<seed> npx vitest run packages/core/src/academics/course-equivalence.property.test.ts
 *
 * Spec the reference model encodes (S1-S4), written from the #189 contract, not from its code:
 * S1 an attempt whose course no rule names as an old course is unchanged.
 * S2 if the rules naming it point to more than one target course (approved or not), it is held AMBIGUOUS.
 * S3 else if none of them is APPROVED, it is held RULE_NOT_APPROVED.
 * S4 else it is rewritten to that single target, recorded under the lowest approved rule id.
 * The result is NEEDS_REVIEW exactly when something is held. Inputs are never modified.
 * Precondition for S1-S4: no approved rule maps to a course another approved rule maps away (a chain);
 * such input must be refused (P9). Nothing here says one course "should" lower or raise credits.
 */

type Rng = () => number;
const mulberry32 = (seed:number):Rng => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(rng:Rng, list:readonly T[]):T => list[Math.floor(rng() * list.length)]!;
const chance = (rng:Rng, p:number) => rng() < p;
const shuffle = <T>(rng:Rng, list:readonly T[]):T[] => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j]!, out[i]!]; }
  return out;
};

const OLD = ['SYN-OLD1', 'SYN-OLD2', 'SYN-OLD3'];
const NEW = ['SYN-NEW1', 'SYN-NEW2'];
const OTHER = ['SYN-OTHER1', 'SYN-OTHER2'];
const COURSES = [...OLD, ...NEW, ...OTHER];
const TERMS = ['2024-1', '2024-2', '2025-1', '2025-2', '2026-2'];
const AREAS = ['SYN-AREA-A', 'SYN-AREA-B'];
const AS_OF = '2026-08-01T00:00:00+09:00'; // 2026-2 has not ended; earlier terms have
const STATES:readonly SameCourseRule['state'][] = ['APPROVED', 'APPROVED', 'DRAFT', 'NEEDS_REVIEW'];

interface Case { attempts:LedgerAttempt[]; rules:SameCourseRule[] }

/** Rules map old courses to new ones only, so approved rules never chain (the S1-S4 precondition). */
function genCase(rng:Rng, size:number):Case {
  const rules:SameCourseRule[] = [];
  const ruleCount = Math.floor(rng() * 4);
  for (let i = 0; i < ruleCount; i++) {
    const from = OLD.filter(() => chance(rng, 0.5));
    if (from.length === 0) from.push(pick(rng, OLD));
    const state = pick(rng, STATES);
    rules.push({id:`SYN-RULE-${i}`, fromCourseIds:from, toCourseId:pick(rng, NEW), state,
      evidenceRefs:state === 'APPROVED' || chance(rng, 0.5) ? [`EV-SYN-${i}`] : []});
  }
  const attempts:LedgerAttempt[] = [];
  const n = 1 + Math.floor(rng() * size);
  for (let i = 0; i < n; i++) {
    const ledger = pick(rng, ['EARNED', 'EARNED', 'EARNED', 'IN_PROGRESS', 'PLANNED'] as const);
    const attempt:LedgerAttempt = {attemptToken:`SYN-T${i}`, canonicalCourseId:pick(rng, COURSES), creditUnits:pick(rng, [4, 6, 6]),
      ledger, areaIds:AREAS.filter(() => chance(rng, 0.4)),
      recognition:pick(rng, ['RECOGNIZED', 'RECOGNIZED', 'RECOGNIZED', 'PENDING'] as const)};
    if (ledger === 'EARNED' || chance(rng, 0.5)) attempt.term = pick(rng, TERMS);
    attempts.push(attempt);
  }
  // A cross-rename retake now and then: an old course earned, then its new course earned later and approved.
  if (n >= 2 && chance(rng, 0.4)) {
    const [a, b] = [attempts[0]!, attempts[1]!];
    Object.assign(a, {canonicalCourseId:pick(rng, OLD), ledger:'EARNED', recognition:'RECOGNIZED', term:'2024-1'});
    Object.assign(b, {canonicalCourseId:pick(rng, NEW), ledger:'EARNED', recognition:'RECOGNIZED', term:'2025-1',
      supersedesAttemptToken:a.attemptToken, retakeApprovalRef:`SYN-RETAKE-${b.attemptToken}`});
  }
  return {attempts, rules};
}

/** S1-S4, written straight from the contract text. */
function referenceApply(c:Case) {
  const applied:{attemptToken:string; fromCourseId:string; toCourseId:string; ruleId:string}[] = [];
  const held:{attemptToken:string; courseId:string; ruleIds:string[]; reason:'RULE_NOT_APPROVED'|'AMBIGUOUS'}[] = [];
  const attempts = c.attempts.map(a => {
    const naming = c.rules.filter(r => r.fromCourseIds.includes(a.canonicalCourseId));
    if (naming.length === 0) return {...a};
    const ruleIds = naming.map(r => r.id).sort();
    if (new Set(naming.map(r => r.toCourseId)).size > 1) {
      held.push({attemptToken:a.attemptToken, courseId:a.canonicalCourseId, ruleIds, reason:'AMBIGUOUS'});
      return {...a};
    }
    const approvedIds = naming.filter(r => r.state === 'APPROVED').map(r => r.id).sort();
    if (approvedIds.length === 0) {
      held.push({attemptToken:a.attemptToken, courseId:a.canonicalCourseId, ruleIds, reason:'RULE_NOT_APPROVED'});
      return {...a};
    }
    applied.push({attemptToken:a.attemptToken, fromCourseId:a.canonicalCourseId, toCourseId:naming[0]!.toCourseId, ruleId:approvedIds[0]!});
    return {...a, canonicalCourseId:naming[0]!.toCourseId};
  });
  return {state:held.length > 0 ? 'NEEDS_REVIEW' : 'APPLIED', attempts, applied, held};
}

const requirementsFor = (courseIds:readonly string[]):LedgerRequirement[] => [
  {id:'SYN-REQ-TOTAL', kind:'CREDIT_TOTAL', requiredCreditUnits:12, evidenceRefs:['EV-SYN-REQ']},
  {id:'SYN-REQ-AREA', kind:'CATEGORY_MINIMUM', areaId:'SYN-AREA-A', requiredCreditUnits:6, evidenceRefs:['EV-SYN-REQ']},
  ...courseIds.map((id, i) => ({id:`SYN-REQ-C${i}`, kind:'REQUIRED_COURSE' as const, canonicalCourseId:id, evidenceRefs:['EV-SYN-REQ']})),
];
const ledger = (attempts:readonly LedgerAttempt[]) => buildAcademicLedger({asOf:AS_OF, rulePackVersion:'SYN-PACK', rulePackState:'APPROVED',
  attempts, requirements:requirementsFor(COURSES)});

// ---------------------------------------------------------------------------------------------
// Runner: seeds, shrinking, and a reproducible report

const CODE_SHA = createHash('sha256').update(readFileSync(new URL('./course-equivalence.ts', import.meta.url))).digest('hex').slice(0, 12);
const hash = (v:unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 12);
const SEEDS = process.env.SAME_COURSE_PROP_SEED !== undefined
  ? [Number(process.env.SAME_COURSE_PROP_SEED)]
  : Array.from({length:300}, (_, i) => 20261105 + i);

function shrink(c:Case, fails:(x:Case) => boolean):Case {
  let cur = c;
  for (let changed = true; changed;) {
    changed = false;
    for (const key of ['attempts', 'rules'] as const) {
      for (let i = 0; i < cur[key].length; i++) {
        const next = {...cur, [key]:cur[key].filter((_, j) => j !== i)} as Case;
        // Keep retake links pointing at a token that still exists, or the case changes meaning.
        if (key === 'attempts') next.attempts = next.attempts.map(a =>
          a.supersedesAttemptToken && !next.attempts.some(b => b.attemptToken === a.supersedesAttemptToken)
            ? (({supersedesAttemptToken:_s, retakeApprovalRef:_r, ...rest}) => rest)(a) as LedgerAttempt : a);
        let failing = false;
        try { failing = fails(next); } catch { failing = false; }
        if (failing) { cur = next; changed = true; i--; }
      }
    }
  }
  return cur;
}

function forAll(name:string, size:number, prop:(c:Case, rng:Rng) => string|null, gen:(rng:Rng, size:number) => Case = genCase):void {
  for (const seed of SEEDS) {
    const c = gen(mulberry32(seed), size);
    const check = (x:Case) => prop(x, mulberry32(seed ^ 0x5bd1e995));
    let problem:string|null;
    try { problem = check(c); } catch (error) { problem = `threw: ${(error as Error).message}`; }
    if (problem === null) continue;
    const small = shrink(c, x => check(x) !== null);
    let final = problem;
    try { final = check(small) ?? problem; } catch (error) { final = `threw: ${(error as Error).message}`; }
    throw new Error([`property "${name}" failed: ${final}`,
      `seed=${seed} inputHash=${hash(c)} ruleHash=${hash(small.rules)} shrunkHash=${hash(small)} codeSha=${CODE_SHA}`,
      `repro: SAME_COURSE_PROP_SEED=${seed} npx vitest run packages/core/src/academics/course-equivalence.property.test.ts`,
      `shrunk case: ${JSON.stringify(small)}`].join('\n'));
  }
}
const same = (a:unknown, b:unknown) => JSON.stringify(a) === JSON.stringify(b);
const byToken = (list:readonly {attemptToken:string}[]) => [...list].sort((a, b) => (a.attemptToken < b.attemptToken ? -1 : 1));

// ---------------------------------------------------------------------------------------------

describe('applySameCourseRules + ledger properties (#202)', () => {
  it('the generator reaches every branch it should exercise', () => {
    const seen = {applied:0, ambiguous:0, notApproved:0, untouched:0, renameRetake:0};
    for (const seed of SEEDS) {
      const c = genCase(mulberry32(seed), 8);
      const r = applySameCourseRules(c.attempts, c.rules);
      seen.applied += r.applied.length > 0 ? 1 : 0;
      seen.ambiguous += r.held.some(h => h.reason === 'AMBIGUOUS') ? 1 : 0;
      seen.notApproved += r.held.some(h => h.reason === 'RULE_NOT_APPROVED') ? 1 : 0;
      seen.untouched += r.applied.length === 0 && r.held.length === 0 ? 1 : 0;
      seen.renameRetake += c.attempts.some(a => a.supersedesAttemptToken) && r.applied.some(x => x.attemptToken === 'SYN-T0') ? 1 : 0;
    }
    for (const [branch, count] of Object.entries(seen)) expect(count, branch).toBeGreaterThanOrEqual(15);
  });

  it('P1 matches the reference model (S1-S4)', () => {
    forAll('reference model', 8, c => {
      const got = applySameCourseRules(c.attempts, c.rules), want = referenceApply(c);
      if (got.state !== want.state) return `state: model=${want.state} implementation=${got.state}`;
      for (const key of ['attempts', 'applied', 'held'] as const) {
        if (!same(got[key], want[key])) return `${key}: model=${JSON.stringify(want[key])} implementation=${JSON.stringify(got[key])}`;
      }
      return null;
    });
  });

  // Precondition: none.
  it('P2 never modifies its inputs', () => {
    forAll('inputs untouched', 8, c => {
      const before = JSON.stringify(c);
      const out = applySameCourseRules(c.attempts, c.rules);
      out.attempts.forEach(a => { (a.areaIds as string[]).push('SYN-MUTATED'); a.canonicalCourseId = 'SYN-MUTATED'; });
      return JSON.stringify(c) === before ? null : 'input changed';
    });
  });

  // Precondition: none. Output follows attempt order; per-attempt results do not depend on any order.
  it('P3 per-attempt results do not depend on the order of attempts or rules', () => {
    forAll('order independence', 8, (c, rng) => {
      const a = applySameCourseRules(c.attempts, c.rules);
      const b = applySameCourseRules(shuffle(rng, c.attempts), shuffle(rng, c.rules));
      for (const key of ['attempts', 'applied', 'held'] as const) {
        if (!same(byToken(a[key]), byToken(b[key]))) return `${key} depends on order`;
      }
      return a.state === b.state ? null : 'state depends on order';
    });
  });

  // Precondition: S1-S4 (no approved chain). Targets are never an approved rule's old course.
  it('P4 a second application changes nothing more', () => {
    forAll('idempotent', 8, c => {
      const once = applySameCourseRules(c.attempts, c.rules);
      const twice = applySameCourseRules(once.attempts, c.rules);
      if (twice.applied.length > 0) return `re-applied ${JSON.stringify(twice.applied)}`;
      if (!same(twice.attempts, once.attempts)) return 'attempts changed on the second run';
      return same(twice.held, once.held) ? null : 'held changed on the second run';
    });
  });

  // Precondition: no rule is APPROVED.
  it('P5 unapproved rules leave every ledger figure as it was and hold every attempt they name', () => {
    forAll('unapproved is a no-op', 8, c => {
      const rules = c.rules.map(r => ({...r, state:r.state === 'APPROVED' ? 'DRAFT' as const : r.state}));
      const out = applySameCourseRules(c.attempts, rules);
      if (!same(ledger(out.attempts), ledger(c.attempts))) return 'ledger changed';
      const named = c.attempts.filter(a => rules.some(r => r.fromCourseIds.includes(a.canonicalCourseId))).map(a => a.attemptToken).sort();
      const held = out.held.map(h => h.attemptToken).sort();
      if (!same(held, named)) return `held ${JSON.stringify(held)} but rules name ${JSON.stringify(named)}`;
      return out.applied.length === 0 ? null : 'applied an unapproved rule';
    });
  });

  // Precondition: S1-S4. The ledger sees exactly the transcript the model rewrote, field for field.
  it('P6 the ledger after the rules equals the ledger of the model-rewritten transcript', () => {
    forAll('ledger composition', 8, c => {
      const got = ledger(applySameCourseRules(c.attempts, c.rules).attempts);
      const want = ledger(referenceApply(c).attempts);
      return same(got, want) ? null : `ledger differs: ${JSON.stringify(got.requirements)} vs ${JSON.stringify(want.requirements)}`;
    });
  });

  // Precondition: one approved, unambiguous rule old -> new; exactly one attempt of either course, on the
  // old course, EARNED, RECOGNIZED, term ended by asOf, no retake link. Then the new course's required row is met.
  it('P7 one earned old course meets the requirement on its new course', () => {
    const gen = (rng:Rng):Case => {
      const from = pick(rng, OLD), to = pick(rng, NEW);
      const filler = Array.from({length:Math.floor(rng() * 4)}, (_, i):LedgerAttempt => ({attemptToken:`SYN-F${i}`,
        canonicalCourseId:pick(rng, OTHER), creditUnits:6, ledger:'EARNED', areaIds:[], recognition:'RECOGNIZED', term:'2024-2'}));
      return {rules:[{id:'SYN-RULE-ONLY', fromCourseIds:[from], toCourseId:to, state:'APPROVED', evidenceRefs:['EV-SYN-ONLY']}],
        attempts:[...filler, {attemptToken:'SYN-OLD-ATTEMPT', canonicalCourseId:from, creditUnits:pick(rng, [4, 6]), ledger:'EARNED',
          areaIds:[], recognition:'RECOGNIZED', term:pick(rng, TERMS.slice(0, 4))}]};
    };
    forAll('old course meets new requirement', 0, c => {
      const to = c.rules[0]!.toCourseId;
      const before = ledger(c.attempts).requirements.find(r => r.requirementId === `SYN-REQ-C${COURSES.indexOf(to)}`)!;
      const after = ledger(applySameCourseRules(c.attempts, c.rules).attempts).requirements
        .find(r => r.requirementId === `SYN-REQ-C${COURSES.indexOf(to)}`)!;
      if (before.state !== 'UNSATISFIED') return `before the rule the new course row is ${before.state}`;
      return after.state === 'SATISFIED' ? null : `after the rule the new course row is ${after.state}`;
    }, gen);
  });

  // Precondition: old course earned in an ended term, its new course earned in a later ended term with an
  // approved retake link to the old attempt, one approved rule old -> new, nothing else on either course.
  it('P8 an approved retake across the rename is recognized only after the rule', () => {
    const gen = (rng:Rng):Case => {
      const from = pick(rng, OLD), to = pick(rng, NEW), i = Math.floor(rng() * 3);
      return {rules:[{id:'SYN-RULE-ONLY', fromCourseIds:[from], toCourseId:to, state:'APPROVED', evidenceRefs:['EV-SYN-ONLY']}],
        attempts:[
          {attemptToken:'SYN-FIRST', canonicalCourseId:from, creditUnits:6, ledger:'EARNED', areaIds:[], recognition:'RECOGNIZED', term:TERMS[i]!},
          {attemptToken:'SYN-RETAKE', canonicalCourseId:to, creditUnits:6, ledger:'EARNED', areaIds:[], recognition:'RECOGNIZED', term:TERMS[i + 1]!,
            supersedesAttemptToken:'SYN-FIRST', retakeApprovalRef:'SYN-RETAKE-APPROVAL'},
        ]};
    };
    forAll('rename retake', 0, c => {
      const reason = (out:ReturnType<typeof ledger>, token:string) => out.excludedAttempts.find(e => e.attemptToken === token)?.reason;
      const before = ledger(c.attempts), after = ledger(applySameCourseRules(c.attempts, c.rules).attempts);
      if (reason(before, 'SYN-RETAKE') !== 'NEEDS_REVIEW') return `before: retake is ${reason(before, 'SYN-RETAKE')}`;
      if (reason(after, 'SYN-FIRST') !== 'RETAKE_SUPERSEDED') return `after: first attempt is ${reason(after, 'SYN-FIRST')}`;
      return reason(after, 'SYN-RETAKE') === undefined ? null : `after: retake is ${reason(after, 'SYN-RETAKE')}`;
    }, gen);
  });

  // Precondition: an approved rule maps to a course another approved rule maps away.
  it('P9 approved chains are refused; the same chain with one rule unapproved is accepted', () => {
    forAll('chains', 6, (c, rng) => {
      const [a, b] = [pick(rng, OLD), pick(rng, NEW)];
      const c2 = pick(rng, OTHER);
      const chain:SameCourseRule[] = [
        {id:'SYN-CHAIN-1', fromCourseIds:[a], toCourseId:b, state:'APPROVED', evidenceRefs:['EV-SYN-C1']},
        {id:'SYN-CHAIN-2', fromCourseIds:[b], toCourseId:c2, state:'APPROVED', evidenceRefs:['EV-SYN-C2']},
      ];
      let refused = false;
      try { applySameCourseRules(c.attempts, shuffle(rng, chain)); } catch { refused = true; }
      if (!refused) return 'an approved chain was accepted';
      applySameCourseRules(c.attempts, [chain[0]!, {...chain[1]!, state:'DRAFT'}]);
      return null;
    });
  });

  it('a failure report carries the seed, hashes, code SHA, repro command and a shrunk case that still fails', () => {
    // Deliberately false property: "no attempt is ever rewritten". The runner must report and shrink it.
    let message = '';
    try { forAll('demo: nothing rewritten', 8, c => (applySameCourseRules(c.attempts, c.rules).applied.length > 0 ? 'rewritten' : null)); }
    catch (error) { message = (error as Error).message; }
    expect(message).toMatch(/^property "demo: nothing rewritten" failed: rewritten$/m);
    const seed = Number(/seed=(\d+)/.exec(message)![1]);
    expect(message).toContain(`inputHash=${hash(genCase(mulberry32(seed), 8))}`);
    expect(message).toContain(`codeSha=${CODE_SHA}`);
    expect(message).toContain(`repro: SAME_COURSE_PROP_SEED=${seed} npx vitest run`);
    const small = JSON.parse(/^shrunk case: (.*)$/m.exec(message)![1]!) as Case;
    expect(message).toContain(`ruleHash=${hash(small.rules)} shrunkHash=${hash(small)}`);
    // Minimal: one attempt and one approved rule, and it still fails.
    expect([small.attempts.length, small.rules.length]).toEqual([1, 1]);
    expect(applySameCourseRules(small.attempts, small.rules).applied).toHaveLength(1);
  });

  it('the reference model agrees with hand-checked cases', () => {
    const at = (attemptToken:string, canonicalCourseId:string):LedgerAttempt =>
      ({attemptToken, canonicalCourseId, creditUnits:6, ledger:'EARNED', areaIds:[], recognition:'RECOGNIZED', term:'2025-1'});
    const rule = (id:string, from:string[], to:string, state:SameCourseRule['state'] = 'APPROVED'):SameCourseRule =>
      ({id, fromCourseIds:from, toCourseId:to, state, evidenceRefs:['EV-SYN-H']});
    // OLD1 -> NEW1 by two approved rules (lowest id wins), OLD2 named by rules to NEW1 and NEW2 (ambiguous),
    // OLD3 only by a draft rule, OTHER1 by none.
    const c:Case = {attempts:[at('SYN-A', 'SYN-OLD1'), at('SYN-B', 'SYN-OLD2'), at('SYN-C', 'SYN-OLD3'), at('SYN-D', 'SYN-OTHER1')],
      rules:[rule('SYN-R2', ['SYN-OLD1'], 'SYN-NEW1'), rule('SYN-R1', ['SYN-OLD1', 'SYN-OLD2'], 'SYN-NEW1'),
        rule('SYN-R3', ['SYN-OLD2'], 'SYN-NEW2', 'DRAFT'), rule('SYN-R4', ['SYN-OLD3'], 'SYN-NEW2', 'NEEDS_REVIEW')]};
    const want = {
      state:'NEEDS_REVIEW',
      attempts:[{...at('SYN-A', 'SYN-NEW1')}, at('SYN-B', 'SYN-OLD2'), at('SYN-C', 'SYN-OLD3'), at('SYN-D', 'SYN-OTHER1')],
      applied:[{attemptToken:'SYN-A', fromCourseId:'SYN-OLD1', toCourseId:'SYN-NEW1', ruleId:'SYN-R1'}],
      held:[{attemptToken:'SYN-B', courseId:'SYN-OLD2', ruleIds:['SYN-R1', 'SYN-R3'], reason:'AMBIGUOUS'},
        {attemptToken:'SYN-C', courseId:'SYN-OLD3', ruleIds:['SYN-R4'], reason:'RULE_NOT_APPROVED'}],
    };
    expect(referenceApply(c)).toEqual(want);
    expect(applySameCourseRules(c.attempts, c.rules)).toEqual(want);
  });
});
