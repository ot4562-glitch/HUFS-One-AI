import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {buildAcademicLedger, type AcademicLedgerRequest, type LedgerAttempt, type LedgerRequirement, type RulePackGate} from './ledger.js';

/**
 * #202: seeded, reproducible property tests for buildAcademicLedger. Synthetic SYN-* data only; no
 * student record or school rule is generated or guessed.
 *
 * Expected values never come from calling buildAcademicLedger again. Small cases are compared with
 * `referenceLedger`, a separate model written from the ledger's documented rules below; large cases
 * are checked only against relations that follow from those rules. Each property states what it
 * assumes. A failure prints the seed, a shrunk case, the rule hash, and the ledger source hash.
 *
 * Reproduce one seed:  LEDGER_PROP_SEED=<seed> npx vitest run packages/core/src/academics/ledger.property.test.ts
 * More seeds:          LEDGER_PROP_RUNS=2000 npx vitest run packages/core/src/academics/ledger.property.test.ts
 *
 * Documented rules the model follows (ledger.ts header and LedgerAttempt docs):
 * R1 an EARNED attempt counts only if its term is known and ended by asOf (Asia/Seoul); otherwise it
 *    is held as NEEDS_REVIEW.
 * R2 a supersede link removes the earlier attempt (RETAKE_SUPERSEDED) only when exactly one attempt
 *    claims it, both are EARNED and the same course, the later one is RECOGNIZED, in a later term,
 *    has a retakeApprovalRef, and has itself ended by asOf; any other claimer is held, and attempts on
 *    a supersede cycle are held.
 * R3 per course, RECOGNIZED attempts left over count once: the highest slot wins (EARNED, then
 *    IN_PROGRESS, then PLANNED) and the rest are DUPLICATE; two left in the same slot hold them all.
 * R4 a PENDING attempt is credit awaiting recognition when it is the only pending one for a course
 *    with no winner; with a winner it is DUPLICATE; otherwise held. EXCLUDED is OFFICIAL_EXCLUSION.
 * R5 totals and areas sum winners; one course counts once in the total and fully in each of its areas.
 * R6 rows: totals and areas by earned units, a required course by an EARNED winner, K_OF_N by earned
 *    winners; a row stays NEEDS_REVIEW unless the pack is APPROVED, and GPA_NOT_COLLECTED is NOT_CHECKED.
 * R7 state: MISSING pack -> INSUFFICIENT_DATA; not approved, any hold, or any review row -> NEEDS_REVIEW.
 */

// ---------------------------------------------------------------------------------------------
// Seeded generator (mulberry32; same seed, same case on any machine)

type Rng = () => number;
function mulberry32(seed:number):Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(rng:Rng, list:readonly T[]):T => list[Math.floor(rng() * list.length)]!;
const chance = (rng:Rng, p:number) => rng() < p;

const TERMS = ['2023-1', '2023-2', '2024-1', '2024-W', '2024-2', '2025-1', '2025-S', '2025-2', '2026-1'] as const;
const AS_OF = ['2024-07-02T00:00:00+09:00', '2025-03-01T09:00:00+09:00', '2026-01-01T00:00:00+09:00', '2026-12-20T12:00:00+09:00'] as const;
const COURSES = ['SYN-C1', 'SYN-C2', 'SYN-C3', 'SYN-C4', 'SYN-C5'] as const;
const AREAS = ['SYN-A1', 'SYN-A2', 'SYN-A3'] as const;
const STATES:readonly RulePackGate[] = ['APPROVED', 'APPROVED', 'APPROVED', 'DRAFT', 'NEEDS_REVIEW', 'MISSING'];

export interface Case extends AcademicLedgerRequest {
  attempts:LedgerAttempt[];
  requirements:LedgerRequirement[];
}

function genCase(rng:Rng, size:number):Case {
  const attempts:LedgerAttempt[] = [];
  const count = Math.floor(rng() * (size + 1));
  for (let i = 0; i < count; i++) {
    const ledger = pick(rng, ['EARNED', 'EARNED', 'EARNED', 'IN_PROGRESS', 'PLANNED'] as const);
    const areaIds = AREAS.filter(() => chance(rng, 0.35));
    const attempt:LedgerAttempt = {
      attemptToken:`SYN-T${i}`, canonicalCourseId:pick(rng, COURSES), creditUnits:pick(rng, [0, 1, 2, 4, 6, 6, 6]),
      ledger, areaIds, recognition:pick(rng, ['RECOGNIZED', 'RECOGNIZED', 'RECOGNIZED', 'PENDING', 'EXCLUDED'] as const),
    };
    if (ledger === 'EARNED' ? chance(rng, 0.93) : chance(rng, 0.4)) attempt.term = pick(rng, TERMS);
    attempts.push(attempt);
  }
  // Supersede links: mostly well-formed retakes, plus broken ones (no approval, wrong order, fork, cycle).
  for (const attempt of attempts) {
    if (attempts.length < 2 || !chance(rng, 0.3)) continue;
    const target = pick(rng, attempts);
    if (target === attempt && !chance(rng, 0.2)) continue;
    attempt.supersedesAttemptToken = target.attemptToken;
    if (target !== attempt && chance(rng, 0.5)) {
      // A well-formed approved retake: same course, both earned and recognized, the later one in a later term.
      const first = Math.floor(rng() * (TERMS.length - 1));
      const later = first + 1 + Math.floor(rng() * (TERMS.length - first - 1));
      Object.assign(target, {ledger:'EARNED', term:TERMS[first]});
      Object.assign(attempt, {ledger:'EARNED', recognition:'RECOGNIZED', canonicalCourseId:target.canonicalCourseId,
        term:TERMS[later], retakeApprovalRef:`SYN-RETAKE-${attempt.attemptToken}`});
      continue;
    }
    if (chance(rng, 0.7)) attempt.retakeApprovalRef = `SYN-RETAKE-${attempt.attemptToken}`;
    if (chance(rng, 0.6)) attempt.canonicalCourseId = target.canonicalCourseId;
  }
  const requirements:LedgerRequirement[] = [];
  const ev = (id:string) => (chance(rng, 0.9) ? {evidenceRefs:[`SYN-EV-${id}`]} : {});
  if (chance(rng, 0.8)) requirements.push({id:'SYN-R-TOTAL', kind:'CREDIT_TOTAL', requiredCreditUnits:pick(rng, [1, 6, 12, 18]), ...ev('TOTAL')});
  AREAS.forEach((areaId, i) => {
    if (chance(rng, 0.5)) requirements.push({id:`SYN-R-AREA${i}`, kind:'CATEGORY_MINIMUM', areaId, requiredCreditUnits:pick(rng, [1, 6, 12]), ...ev(`AREA${i}`)});
  });
  if (chance(rng, 0.6)) requirements.push({id:'SYN-R-REQ', kind:'REQUIRED_COURSE', canonicalCourseId:pick(rng, COURSES), ...ev('REQ')});
  if (chance(rng, 0.6)) {
    const courseIds = COURSES.filter(() => chance(rng, 0.6));
    if (courseIds.length >= 2) requirements.push({id:'SYN-R-KOFN', kind:'K_OF_N', courseIds, k:1 + Math.floor(rng() * courseIds.length), ...ev('KOFN')});
  }
  if (chance(rng, 0.3)) requirements.push({id:'SYN-R-GPA', kind:'NON_CREDIT', criterionId:'SYN-GPA', verificationMode:'GPA_NOT_COLLECTED'});
  if (chance(rng, 0.3)) requirements.push({id:'SYN-R-EXAM', kind:'NON_CREDIT', criterionId:'SYN-EXAM', verificationMode:'MANUAL', ...ev('EXAM')});
  return {asOf:pick(rng, AS_OF), rulePackVersion:'SYN-PACK-PROP', rulePackState:pick(rng, STATES), attempts, requirements};
}

// ---------------------------------------------------------------------------------------------
// Independent reference model (R1-R7), written for small cases and readability, not speed.

const SEASON = {'1':0, S:1, '2':2, W:3} as const;
const order = (term:string) => Number(term.slice(0, 4)) * 4 + SEASON[term.slice(5) as keyof typeof SEASON];
/** First instant (Asia/Seoul) after which a term's grade exists: 1 -> 7/1, S -> 9/1, 2 -> next 1/1, W -> next 3/1. */
function endsAt(term:string):number {
  const year = Number(term.slice(0, 4));
  const [y, m] = ({'1':[year, 7], S:[year, 9], '2':[year + 1, 1], W:[year + 1, 3]} as const)[term.slice(5) as '1'|'S'|'2'|'W'];
  return Date.UTC(y, m - 1, 1) - 9 * 3600_000;
}

export interface ModelResult {
  state:string; earned:number; inProgress:number; planned:number; pending:number;
  areas:Record<string, [number, number]>; excluded:Record<string, string>;
  rows:Record<string, {state:string; earned?:number; remaining?:number; matched?:number}>;
}

export function referenceLedger(c:Case):ModelResult {
  const asOf = Date.parse(c.asOf);
  const byToken = new Map(c.attempts.map(a => [a.attemptToken, a]));
  const ended = (a:LedgerAttempt) => a.term !== undefined && endsAt(a.term) <= asOf;
  const held = new Set<string>();
  // R1
  for (const a of c.attempts) if (a.ledger === 'EARNED' && !ended(a)) held.add(a.attemptToken);
  // R2 cycles: walk the links from every linked attempt; reaching a token twice means a cycle, and every
  // token walked on the way (the lead-in included) is held.
  const cycleTokens = new Set<string>();
  for (const a of c.attempts) {
    if (!a.supersedesAttemptToken) continue;
    const walked:string[] = [];
    let t:string|undefined = a.attemptToken;
    while (t !== undefined && !walked.includes(t)) { walked.push(t); t = byToken.get(t)?.supersedesAttemptToken; }
    if (t !== undefined) walked.forEach(s => cycleTokens.add(s));
  }
  cycleTokens.forEach(t => held.add(t));
  const superseded = new Set<string>();
  const claims = new Map<string, LedgerAttempt[]>();
  for (const a of c.attempts) if (a.supersedesAttemptToken) claims.set(a.supersedesAttemptToken, [...(claims.get(a.supersedesAttemptToken) ?? []), a]);
  for (const [target, claimers] of claims) {
    if (cycleTokens.has(target) || claimers.some(x => cycleTokens.has(x.attemptToken))) continue;
    const old = byToken.get(target);
    const only = claimers.length === 1 ? claimers[0]! : undefined;
    const ok = old !== undefined && only !== undefined && ended(only)
      && old.canonicalCourseId === only.canonicalCourseId && old.ledger === 'EARNED' && only.ledger === 'EARNED'
      && only.recognition === 'RECOGNIZED' && only.retakeApprovalRef !== undefined
      && old.term !== undefined && only.term !== undefined && order(only.term) > order(old.term);
    if (ok) superseded.add(target); else claimers.forEach(x => held.add(x.attemptToken));
  }
  const excluded:Record<string, string> = {};
  const put = (t:string, r:string) => { excluded[t] ??= r; };
  // R3/R4
  const live = c.attempts.filter(a => {
    if (held.has(a.attemptToken)) { put(a.attemptToken, 'NEEDS_REVIEW'); return false; }
    if (superseded.has(a.attemptToken)) { put(a.attemptToken, 'RETAKE_SUPERSEDED'); return false; }
    if (a.recognition === 'EXCLUDED') { put(a.attemptToken, 'OFFICIAL_EXCLUSION'); return false; }
    return true;
  });
  let anyHold = held.size > 0;
  const winners = new Map<string, LedgerAttempt>();
  const blocked = new Set<string>();
  for (const course of new Set(live.map(a => a.canonicalCourseId))) {
    const rec = live.filter(a => a.canonicalCourseId === course && a.recognition === 'RECOGNIZED');
    if (rec.length === 0) continue;
    const slots = rec.map(a => a.ledger);
    if (new Set(slots).size !== slots.length) { anyHold = true; blocked.add(course); rec.forEach(a => put(a.attemptToken, 'NEEDS_REVIEW')); continue; }
    const rank = {EARNED:0, IN_PROGRESS:1, PLANNED:2} as const;
    const win = [...rec].sort((x, y) => rank[x.ledger] - rank[y.ledger])[0]!;
    winners.set(course, win);
    rec.filter(a => a !== win).forEach(a => put(a.attemptToken, 'DUPLICATE'));
  }
  let pending = 0;
  for (const course of new Set(live.map(a => a.canonicalCourseId))) {
    const pen = live.filter(a => a.canonicalCourseId === course && a.recognition === 'PENDING');
    if (pen.length === 0) continue;
    if (pen.length === 1 && !winners.has(course) && !blocked.has(course)) { pending += pen[0]!.creditUnits; put(pen[0]!.attemptToken, 'PENDING_RECOGNITION'); continue; }
    if (pen.length !== 1 || blocked.has(course)) anyHold = true;
    pen.forEach(a => put(a.attemptToken, winners.has(course) && pen.length === 1 ? 'DUPLICATE' : 'NEEDS_REVIEW'));
  }
  // R5
  let earned = 0, inProgress = 0, planned = 0;
  const areas:Record<string, [number, number]> = {};
  for (const w of winners.values()) {
    if (w.ledger === 'EARNED') earned += w.creditUnits; else if (w.ledger === 'IN_PROGRESS') inProgress += w.creditUnits; else planned += w.creditUnits;
    for (const area of w.areaIds) {
      const cur = areas[area] ?? [0, 0];
      areas[area] = [cur[0] + (w.ledger === 'EARNED' ? w.creditUnits : 0), cur[1] + w.creditUnits];
    }
  }
  // R6
  const approved = c.rulePackState === 'APPROVED';
  const rows:ModelResult['rows'] = {};
  for (const r of c.requirements) {
    const evidence = (r.evidenceRefs ?? []).length > 0;
    let row:ModelResult['rows'][string];
    if (r.kind === 'NON_CREDIT') row = {state:r.verificationMode === 'GPA_NOT_COLLECTED' ? 'NOT_CHECKED' : 'NEEDS_REVIEW'};
    else if (r.kind === 'CREDIT_TOTAL') row = {state:earned >= r.requiredCreditUnits ? 'SATISFIED' : 'UNSATISFIED', earned, remaining:Math.max(0, r.requiredCreditUnits - earned)};
    else if (r.kind === 'CATEGORY_MINIMUM') {
      const e = areas[r.areaId]?.[0] ?? 0;
      row = {state:e >= r.requiredCreditUnits ? 'SATISFIED' : 'UNSATISFIED', earned:e, remaining:Math.max(0, r.requiredCreditUnits - e)};
    } else if (r.kind === 'REQUIRED_COURSE') row = {state:winners.get(r.canonicalCourseId)?.ledger === 'EARNED' ? 'SATISFIED' : 'UNSATISFIED'};
    else {
      // This generator/reference model covers the five original kinds; new kinds have separate counterexamples.
      if (r.kind !== 'K_OF_N') throw new TypeError('Unsupported requirement in legacy reference model');
      const hit = r.courseIds.map(id => winners.get(id)).filter(w => w?.ledger === 'EARNED');
      row = {state:hit.length >= r.k ? 'SATISFIED' : 'UNSATISFIED', earned:hit.reduce((s, w) => s + w!.creditUnits, 0), matched:hit.length};
    }
    if (row.state !== 'NOT_CHECKED' && (!approved || (row.state === 'SATISFIED' && !evidence))) row = {...row, state:'NEEDS_REVIEW'};
    rows[r.id] = row;
  }
  // R7
  const review = Object.values(rows).some(r => r.state === 'NEEDS_REVIEW' || r.state === 'NOT_CHECKED');
  const state = c.rulePackState === 'MISSING' ? 'INSUFFICIENT_DATA' : !approved || anyHold || review ? 'NEEDS_REVIEW' : 'READY';
  return {state, earned, inProgress, planned, pending, areas, excluded, rows};
}

function project(c:Case):ModelResult {
  const out = buildAcademicLedger(c);
  return {
    state:out.state, earned:out.earnedCreditUnits, inProgress:out.inProgressCreditUnits, planned:out.plannedCreditUnits,
    pending:out.pendingRecognitionCreditUnits,
    areas:Object.fromEntries(out.areaProgress.map(a => [a.areaId, [a.earnedCreditUnits, a.projectedCreditUnits] as [number, number]])),
    excluded:Object.fromEntries(out.excludedAttempts.map(e => [e.attemptToken, e.reason])),
    rows:Object.fromEntries(out.requirements.map(r => [r.requirementId, {
      state:r.state,
      ...(r.earnedCreditUnits !== undefined ? {earned:r.earnedCreditUnits} : {}),
      ...(r.remainingCreditUnits !== undefined ? {remaining:r.remainingCreditUnits} : {}),
      ...(r.matchedCoursesCount !== undefined ? {matched:r.matchedCoursesCount} : {}),
    }])),
  };
}

// ---------------------------------------------------------------------------------------------
// Runner: seeds, shrinking, and a reproducible failure report

const LEDGER_SHA = createHash('sha256').update(readFileSync(new URL('./ledger.ts', import.meta.url))).digest('hex').slice(0, 12);
const ruleHash = (c:Case) => createHash('sha256').update(JSON.stringify(c.requirements)).digest('hex').slice(0, 12);
const SEEDS = process.env.LEDGER_PROP_SEED !== undefined
  ? [Number(process.env.LEDGER_PROP_SEED)]
  : Array.from({length:Number(process.env.LEDGER_PROP_RUNS ?? 400)}, (_, i) => 20261104 + i);

/** Drop attempts and requirements one at a time while the property still fails. */
function shrink(c:Case, fails:(x:Case) => boolean):Case {
  let cur = c;
  for (let changed = true; changed;) {
    changed = false;
    for (const key of ['attempts', 'requirements'] as const) {
      for (let i = 0; i < cur[key].length; i++) {
        const next = {...cur, [key]:cur[key].filter((_, j) => j !== i)} as Case;
        let still = false;
        try { still = fails(next); } catch { still = false; }
        if (still) { cur = next; changed = true; i--; }
      }
    }
  }
  return cur;
}

const canonical = (v:unknown):unknown => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, canonical(x)])) : v;
/** Hash of the whole input (attempts, requirements, asOf, pack state), independent of key order. */
const inputHash = (c:Case) => createHash('sha256').update(JSON.stringify(canonical(c))).digest('hex').slice(0, 12);

/** What a failure report carries, so the same case can be rebuilt and checked by hand. */
export function failureReport(name:string, problem:string, seed:number, original:Case, small:Case):string {
  return [`property "${name}" failed: ${problem}`,
    `seed=${seed} inputHash=${inputHash(original)} asOf=${original.asOf} pack=${original.rulePackState} ` +
      `attempts=${original.attempts.length} requirements=${original.requirements.length}`,
    `shrunk: inputHash=${inputHash(small)} ruleHash=${ruleHash(small)} asOf=${small.asOf} pack=${small.rulePackState} ledgerSha=${LEDGER_SHA}`,
    `repro: LEDGER_PROP_SEED=${seed} npx vitest run packages/core/src/academics/ledger.property.test.ts`,
    `shrunk case: ${JSON.stringify(small)}`].join('\n');
}

function forAll(name:string, size:number, prop:(c:Case, rng:Rng) => string|null, seeds:readonly number[] = SEEDS):void {
  for (const seed of seeds) {
    const rng = mulberry32(seed);
    const c = genCase(rng, size);
    const check = (x:Case) => prop(x, mulberry32(seed ^ 0x5bd1e995));
    let problem:string|null;
    try { problem = check(c); } catch (error) { problem = `threw: ${(error as Error).message}`; }
    if (problem !== null) {
      const small = shrink(c, x => check(x) !== null);
      // Re-describe the shrunk case: the first message was about the full case.
      let final = problem;
      try { final = check(small) ?? problem; } catch (error) { final = `threw: ${(error as Error).message}`; }
      throw new Error(failureReport(name, final, seed, c, small));
    }
  }
}
const same = (a:unknown, b:unknown) => JSON.stringify(a) === JSON.stringify(b);
const sortKeys = (o:Record<string, unknown>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));

/** Field-by-field difference between the model and the implementation, one line per field. */
function explain(want:ModelResult, got:ModelResult):string|null {
  const lines:string[] = [];
  for (const key of ['state', 'earned', 'inProgress', 'planned', 'pending'] as const) {
    if (want[key] !== got[key]) lines.push(`${key}: model=${want[key]} implementation=${got[key]}`);
  }
  for (const [label, a, b] of [['area', want.areas, got.areas], ['excluded', want.excluded, got.excluded], ['row', want.rows, got.rows]] as const) {
    for (const id of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
      const x = (a as Record<string, unknown>)[id], y = (b as Record<string, unknown>)[id];
      if (!same(x, y)) lines.push(`${label} ${id}: model=${JSON.stringify(x ?? null)} implementation=${JSON.stringify(y ?? null)}`);
    }
  }
  return lines.length ? lines.join('; ') : null;
}

// ---------------------------------------------------------------------------------------------

describe('buildAcademicLedger properties (#202)', () => {
  it('reports a failure with everything needed to rebuild and re-check it', () => {
    // A property that fails on any case with an earned attempt, so the runner has to report and shrink.
    const seed = 20261104;
    let message = '';
    try {
      forAll('demo: no earned attempts', 6, c => (c.attempts.some(a => a.ledger === 'EARNED') ? 'an earned attempt exists' : null), [seed]);
    } catch (error) { message = (error as Error).message; }
    expect(message).toMatch(/^property "demo: no earned attempts" failed: an earned attempt exists$/m);
    const full = genCase(mulberry32(seed), 6);
    expect(message).toContain(`seed=${seed} inputHash=${inputHash(full)} asOf=${full.asOf} pack=${full.rulePackState}`);
    expect(message).toContain(`repro: LEDGER_PROP_SEED=${seed} npx vitest run packages/core/src/academics/ledger.property.test.ts`);
    // The shrunk case in the report parses back, keeps exactly what makes it fail, and its hashes match.
    const small = JSON.parse(/^shrunk case: (.*)$/m.exec(message)![1]!) as Case;
    expect(small.attempts.filter(a => a.ledger === 'EARNED')).toHaveLength(1);
    expect(small.requirements).toEqual([]);
    expect(message).toContain(`shrunk: inputHash=${inputHash(small)} ruleHash=${ruleHash(small)} asOf=${small.asOf} pack=${small.rulePackState} ledgerSha=${LEDGER_SHA}`);
    // The same seed always rebuilds the same case.
    expect(inputHash(genCase(mulberry32(seed), 6))).toBe(inputHash(full));
    // A model mismatch is reported field by field (expected = model, actual = implementation).
    const want = referenceLedger(full), got = {...want, earned:want.earned + 1, rows:{...want.rows, 'SYN-X':{state:'SATISFIED'}}};
    expect(explain(want, got)).toBe(`earned: model=${want.earned} implementation=${want.earned + 1}; row SYN-X: model=null implementation={"state":"SATISFIED"}`);
    expect(explain(want, want)).toBeNull();
  });

  it('the reference model agrees with hand-checked cases', () => {
    // The expected values below are literals worked out by hand from R1-R7, not output of referenceLedger;
    // the model is checked against them first, and only then compared with the implementation.
    // Hand-worked: C1 earned 2024-1 (6) retaken and approved in 2025-1 (6): one counts, total 6.
    const retake:Case = {asOf:'2025-08-01T00:00:00+09:00', rulePackVersion:'SYN-P', rulePackState:'APPROVED', requirements:[], attempts:[
      {attemptToken:'SYN-A', canonicalCourseId:'SYN-C1', creditUnits:6, ledger:'EARNED', areaIds:[], recognition:'RECOGNIZED', term:'2024-1'},
      {attemptToken:'SYN-B', canonicalCourseId:'SYN-C1', creditUnits:6, ledger:'EARNED', areaIds:[], recognition:'RECOGNIZED', term:'2025-1',
        supersedesAttemptToken:'SYN-A', retakeApprovalRef:'SYN-OK'}]};
    expect(referenceLedger(retake)).toMatchObject({earned:6, excluded:{'SYN-A':'RETAKE_SUPERSEDED'}, state:'READY'});
    // Same without approval: the claimer is held, the earlier credit stays (6), state NEEDS_REVIEW.
    const {retakeApprovalRef:_r, ...noApproval} = retake.attempts[1]!;
    expect(referenceLedger({...retake, attempts:[retake.attempts[0]!, noApproval]})).toMatchObject({earned:6, excluded:{'SYN-B':'NEEDS_REVIEW'}, state:'NEEDS_REVIEW'});
    // 2025-2 grade is not in before 2026-01-01 KST: 0 earned at 2025-12-31.
    const future:Case = {...retake, asOf:'2025-12-31T23:59:59+09:00', attempts:[{...retake.attempts[0]!, term:'2025-2'}]};
    expect(referenceLedger(future)).toMatchObject({earned:0, excluded:{'SYN-A':'NEEDS_REVIEW'}});
    expect(referenceLedger({...future, asOf:'2026-01-01T00:00:00+09:00'})).toMatchObject({earned:6, excluded:{}});
    // One course in two areas: total 6, each area 6. Earned + planned of one course: planned is DUPLICATE.
    const shared:Case = {...retake, attempts:[
      {attemptToken:'SYN-A', canonicalCourseId:'SYN-C1', creditUnits:6, ledger:'EARNED', areaIds:['SYN-A1', 'SYN-A2'], recognition:'RECOGNIZED', term:'2024-1'},
      {attemptToken:'SYN-P', canonicalCourseId:'SYN-C1', creditUnits:6, ledger:'PLANNED', areaIds:['SYN-A1'], recognition:'RECOGNIZED'}]};
    expect(referenceLedger(shared)).toMatchObject({earned:6, planned:0, areas:{'SYN-A1':[6, 6], 'SYN-A2':[6, 6]}, excluded:{'SYN-P':'DUPLICATE'}});
    // A pending exchange alone: 0 earned, 6 pending.
    expect(referenceLedger({...retake, attempts:[{...retake.attempts[0]!, recognition:'PENDING'}]})).toMatchObject({earned:0, pending:6});
    // The implementation agrees on every hand case.
    for (const c of [retake, {...retake, attempts:[retake.attempts[0]!, noApproval]}, future, shared]) {
      expect(project(c)).toEqual(referenceLedger(c));
    }
  });

  it('generates every kind of case it claims to test', () => {
    // Guards the generator: if it stopped producing retakes, holds, duplicates, or ready packs, the
    // properties below would pass without testing anything.
    const tally:Record<string, number> = {};
    const bump = (k:string) => { tally[k] = (tally[k] ?? 0) + 1; };
    for (const seed of SEEDS.slice(0, 400)) {
      const c = genCase(mulberry32(seed), 6);
      const out = buildAcademicLedger(c);
      bump(`state:${out.state}`);
      for (const e of out.excludedAttempts) bump(`excluded:${e.reason}`);
      for (const r of out.requirements) bump(`row:${r.state}`);
      if (out.pendingRecognitionCreditUnits > 0) bump('pending');
    }
    const atLeast = Math.max(1, Math.floor(Math.min(SEEDS.length, 400) / 40));
    for (const kind of ['state:READY', 'state:NEEDS_REVIEW', 'state:INSUFFICIENT_DATA', 'excluded:RETAKE_SUPERSEDED',
      'excluded:DUPLICATE', 'excluded:NEEDS_REVIEW', 'excluded:PENDING_RECOGNITION', 'excluded:OFFICIAL_EXCLUSION',
      'row:SATISFIED', 'row:UNSATISFIED', 'row:NEEDS_REVIEW', 'row:NOT_CHECKED', 'pending']) {
      if (SEEDS.length >= 400) expect(tally[kind] ?? 0, kind).toBeGreaterThanOrEqual(atLeast);
    }
  });

  it('matches the reference model on small seeded cases', () => {
    forAll('reference model', 6, c => explain(referenceLedger(c), project(c)));
  });

  // Precondition: none. The ledger reads attempts as a set; only excludedAttempts follows input order.
  it('gives the same result for any attempt order', () => {
    forAll('order independence', 12, (c, rng) => {
      const shuffled = [...c.attempts].map(a => [rng(), a] as const).sort((x, y) => x[0] - y[0]).map(([, a]) => a);
      const a = project(c), b = project({...c, attempts:shuffled});
      return same({...a, excluded:sortKeys(a.excluded)}, {...b, excluded:sortKeys(b.excluded)}) ? null : 'result depends on attempt order';
    });
  });

  // Precondition: none. Units are integers (1 unit = 0.5학점); sums never lose or invent units.
  it('keeps integer units and consistent sums', () => {
    forAll('integer units', 12, c => {
      const out = buildAcademicLedger(c);
      const nums = [out.earnedCreditUnits, out.inProgressCreditUnits, out.plannedCreditUnits, out.projectedUniqueCreditUnits,
        out.pendingRecognitionCreditUnits, ...out.areaProgress.flatMap(a => [a.earnedCreditUnits, a.projectedCreditUnits])];
      if (!nums.every(n => Number.isSafeInteger(n) && n >= 0)) return `non-integer or negative unit in ${JSON.stringify(nums)}`;
      if (out.projectedUniqueCreditUnits !== out.earnedCreditUnits + out.inProgressCreditUnits + out.plannedCreditUnits) return 'projected != earned + in progress + planned';
      // Each course counts once: the unique total is at most the earned units of distinct courses.
      const bound = new Map<string, number>();
      for (const a of c.attempts) if (a.ledger === 'EARNED') bound.set(a.canonicalCourseId, Math.max(bound.get(a.canonicalCourseId) ?? 0, a.creditUnits));
      if (out.earnedCreditUnits > [...bound.values()].reduce((s, n) => s + n, 0)) return 'earned exceeds one attempt per course';
      if (out.areaProgress.some(a => a.earnedCreditUnits > out.earnedCreditUnits || a.earnedCreditUnits > a.projectedCreditUnits)) return 'an area exceeds the unique total';
      const tokens = out.excludedAttempts.map(e => e.attemptToken);
      if (new Set(tokens).size !== tokens.length || tokens.some(t => !c.attempts.some(a => a.attemptToken === t))) return 'an attempt is excluded twice or unknown';
      return null;
    });
    // A repeated attempt token is refused, never counted twice; a fractional unit is refused, never rounded.
    const one:LedgerAttempt = {attemptToken:'SYN-T', canonicalCourseId:'SYN-C1', creditUnits:6, ledger:'EARNED', areaIds:[], recognition:'RECOGNIZED', term:'2024-1'};
    const base = {asOf:'2026-12-20T12:00:00+09:00', rulePackVersion:'SYN-P', rulePackState:'APPROVED' as const, requirements:[]};
    expect(() => buildAcademicLedger({...base, attempts:[one, {...one}]})).toThrow(/duplicate attempt/);
    expect(() => buildAcademicLedger({...base, attempts:[{...one, creditUnits:5.5}]})).toThrow(/integer credit unit/);
  });

  // Precondition: none. A grade exists only after its term ended (R1), so no term ending after asOf adds earned units.
  it('never counts a term that had not ended by asOf', () => {
    forAll('no future credit', 12, c => {
      const out = buildAcademicLedger(c);
      const endedBy = (a:LedgerAttempt) => a.term !== undefined && endsAt(a.term) <= Date.parse(c.asOf);
      const ceiling = c.attempts.filter(a => a.ledger === 'EARNED' && endedBy(a)).reduce((s, a) => s + a.creditUnits, 0);
      if (out.earnedCreditUnits > ceiling) return `earned ${out.earnedCreditUnits} > ${ceiling} from ended terms`;
      const early = buildAcademicLedger({...c, asOf:'2022-01-01T00:00:00+09:00'});
      return early.earnedCreditUnits === 0 ? null : 'credit counted before any term ended';
    });
  });

  // Precondition: none. Without APPROVED nothing is SATISFIED or READY (R6/R7); without an approval ref no retake removes credit (R2).
  it('never passes on an unapproved pack or an unapproved retake', () => {
    forAll('approval gates', 12, c => {
      for (const state of ['DRAFT', 'NEEDS_REVIEW', 'MISSING'] as const) {
        const out = buildAcademicLedger({...c, rulePackState:state});
        if (out.requirements.some(r => r.state === 'SATISFIED')) return `a row is SATISFIED on a ${state} pack`;
        if (out.state === 'READY' || (state === 'MISSING') !== (out.state === 'INSUFFICIENT_DATA')) return `state ${out.state} on a ${state} pack`;
      }
      const stripped = c.attempts.map(({retakeApprovalRef:_r, ...rest}) => rest);
      const out = buildAcademicLedger({...c, attempts:stripped});
      return out.excludedAttempts.some(e => e.reason === 'RETAKE_SUPERSEDED') ? 'a retake without approval removed credit' : null;
    });
  });
});
