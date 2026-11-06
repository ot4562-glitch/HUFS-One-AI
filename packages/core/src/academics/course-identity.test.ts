import {describe, expect, it} from 'vitest';
import {
  buildLedgerWithCourseIdentity, COURSE_IDENTITY_API_CONNECTION,
  type IdentifiedLedgerAttempt, type IdentifiedLedgerRequest, type ResolvedLedgerAttempt, type UnresolvedLedgerAttempt,
} from './course-identity.js';
import {buildAcademicLedger, type LedgerAttempt, type LedgerRequirement} from './ledger.js';

/**
 * #11 (본선 전): rows whose course code or equivalence is not confirmed. Synthetic SYN-* only.
 * 1 credit unit = 0.5학점; 3학점 = 6 units.
 */

const AS_OF = '2026-11-01T00:00:00.000+09:00';

const resolved = (token:string, course:string, over:Partial<LedgerAttempt> = {}):ResolvedLedgerAttempt => ({
  identity:'RESOLVED', attemptToken:token, canonicalCourseId:course, creditUnits:6, ledger:'EARNED',
  areaIds:['SYN-A1'], recognition:'RECOGNIZED', term:'2025-1', ...over,
});
const unresolved = (token:string, over:Partial<UnresolvedLedgerAttempt> = {}):UnresolvedLedgerAttempt => ({
  identity:'NEEDS_REVIEW', attemptToken:token, creditUnits:6, ledger:'EARNED', recognition:'RECOGNIZED', term:'2025-1', ...over,
});

const REQUIREMENTS:LedgerRequirement[] = [
  {id:'SYN-R-TOTAL', kind:'CREDIT_TOTAL', requiredCreditUnits:12, evidenceRefs:['SYN-EV-1']},
  {id:'SYN-R-AREA', kind:'CATEGORY_MINIMUM', areaId:'SYN-A1', requiredCreditUnits:12, evidenceRefs:['SYN-EV-2']},
  {id:'SYN-R-REQ', kind:'REQUIRED_COURSE', canonicalCourseId:'SYN-C1', evidenceRefs:['SYN-EV-3']},
  {id:'SYN-R-KN', kind:'K_OF_N', courseIds:['SYN-C1', 'SYN-C2', 'SYN-C3'], k:2, evidenceRefs:['SYN-EV-4']},
  {id:'SYN-R-SPREAD', kind:'AREA_SPREAD', areaIds:['SYN-A1', 'SYN-A2'], minAreas:2, requiredCreditUnits:12, evidenceRefs:['SYN-EV-5']},
  {id:'SYN-R-GROUP', kind:'GROUP_CHOICE', groups:[['SYN-C1'], ['SYN-C2', 'SYN-C3']], k:1, evidenceRefs:['SYN-EV-6']},
];
const READS_ATTEMPTS = REQUIREMENTS.map(r => r.id);
/** A row that reads no attempt. Unmeasured GPA always keeps the audit from READY. */
const GPA:LedgerRequirement = {id:'SYN-R-GPA', kind:'NON_CREDIT', criterionId:'SYN-GPA', verificationMode:'GPA_NOT_COLLECTED'};

const request = (attempts:IdentifiedLedgerAttempt[], over:Partial<IdentifiedLedgerRequest> = {}):IdentifiedLedgerRequest => ({
  asOf:AS_OF, rulePackVersion:'SYN-PACK-ID', rulePackState:'APPROVED', attempts, requirements:REQUIREMENTS, ...over,
});
const strip = (rows:readonly IdentifiedLedgerAttempt[]):LedgerAttempt[] =>
  rows.filter((r):r is ResolvedLedgerAttempt => r.identity === 'RESOLVED').map(({identity:_identity, ...rest}) => rest);
const states = (result:ReturnType<typeof buildLedgerWithCourseIdentity>) =>
  Object.fromEntries(result.audit.requirements.map(row => [row.requirementId, row.state]));
const reasonOf = (result:ReturnType<typeof buildLedgerWithCourseIdentity>, token:string) =>
  result.audit.excludedAttempts.find(row => row.attemptToken === token)?.reason;

/** Every requirement row SATISFIED on confirmed rows alone. */
const SATISFIED_BASE:IdentifiedLedgerAttempt[] = [
  resolved('SYN-T1', 'SYN-C1'),
  resolved('SYN-T2', 'SYN-C2', {areaIds:['SYN-A1', 'SYN-A2']}),
  resolved('SYN-T3', 'SYN-C3', {areaIds:['SYN-A2']}),
];

describe('course identity: input boundary (#11)', () => {
  it('states that the API does not send unresolved rows yet', () => {
    expect(COURSE_IDENTITY_API_CONNECTION).toBe('NOT_CONNECTED');
  });

  it('with no unresolved row the result is the ordinary ledger', () => {
    const rows = SATISFIED_BASE;
    const result = buildLedgerWithCourseIdentity(request(rows));
    expect(result.audit).toEqual(buildAcademicLedger({...request(rows), attempts:strip(rows)}));
    expect(result.audit.state).toBe('READY');
    expect(result.unresolved).toEqual({attemptTokens:[], linkedAttemptTokens:[], affectedRequirementIds:[]});
  });

  it('refuses a row that does not say which kind it is', () => {
    const {identity:_identity, ...bare} = resolved('SYN-T1', 'SYN-C1');
    expect(() => buildLedgerWithCourseIdentity(request([bare as unknown as IdentifiedLedgerAttempt]))).toThrow(/identity RESOLVED or NEEDS_REVIEW/);
    const odd = {...resolved('SYN-T1', 'SYN-C1'), identity:'UNKNOWN'} as unknown as IdentifiedLedgerAttempt;
    expect(() => buildLedgerWithCourseIdentity(request([odd]))).toThrow(/identity RESOLVED or NEEDS_REVIEW/);
  });

  it('refuses a placeholder course id on an unresolved row', () => {
    for (const placeholder of ['SYN-TMP-1', '', 'UNKNOWN']) {
      const row = {...unresolved('SYN-U1'), canonicalCourseId:placeholder} as unknown as IdentifiedLedgerAttempt;
      expect(() => buildLedgerWithCourseIdentity(request([row])), placeholder).toThrow(/placeholder course id is refused/);
    }
    const undefinedId = {...unresolved('SYN-U1'), canonicalCourseId:undefined} as unknown as IdentifiedLedgerAttempt;
    expect(() => buildLedgerWithCourseIdentity(request([undefinedId]))).toThrow(/placeholder course id is refused/);
  });

  it('refuses areas or unknown fields on an unresolved row', () => {
    const withAreas = {...unresolved('SYN-U1'), areaIds:['SYN-A1']} as unknown as IdentifiedLedgerAttempt;
    expect(() => buildLedgerWithCourseIdentity(request([withAreas]))).toThrow(/areas come from a confirmed course/);
    const extra = {...unresolved('SYN-U1'), guessedCourseId:'SYN-C1'} as unknown as IdentifiedLedgerAttempt;
    expect(() => buildLedgerWithCourseIdentity(request([extra]))).toThrow(/unknown field guessedCourseId/);
  });

  it('a resolved row still needs a valid course id', () => {
    for (const course of ['', 'bad id', undefined]) {
      const row = {...resolved('SYN-T1', 'SYN-C1'), canonicalCourseId:course} as unknown as IdentifiedLedgerAttempt;
      expect(() => buildLedgerWithCourseIdentity(request([row])), String(course)).toThrow(/canonicalCourseId/);
    }
  });

  it('checks unresolved rows like ordinary rows', () => {
    const bad:Partial<UnresolvedLedgerAttempt>[] = [
      {creditUnits:1.5}, {creditUnits:-1}, {term:'2025-3'}, {ledger:'DONE' as never}, {recognition:'MAYBE' as never},
      {supersedesAttemptToken:'bad token'}, {attemptToken:'bad token'},
    ];
    for (const over of bad) {
      expect(() => buildLedgerWithCourseIdentity(request([unresolved('SYN-U1', over)])), JSON.stringify(over)).toThrow(TypeError);
    }
  });

  it('a token is unique across confirmed and unresolved rows', () => {
    expect(() => buildLedgerWithCourseIdentity(request([resolved('SYN-T1', 'SYN-C1'), unresolved('SYN-T1')])))
      .toThrow(/duplicate attempt SYN-T1/);
  });
});

describe('course identity: what an unresolved row holds (#11)', () => {
  it('an already satisfied audit is held, and the counted numbers do not move', () => {
    const rows = [...SATISFIED_BASE, unresolved('SYN-U1')];
    const result = buildLedgerWithCourseIdentity(request(rows));
    const base = buildAcademicLedger({...request(rows), attempts:strip(rows)});
    expect(base.state).toBe('READY');
    expect(result.audit.state).toBe('NEEDS_REVIEW');
    for (const id of READS_ATTEMPTS) expect(states(result)[id], id).toBe('NEEDS_REVIEW');
    const withGpa = buildLedgerWithCourseIdentity(request(rows, {requirements:[...REQUIREMENTS, GPA]}));
    expect(states(withGpa)['SYN-R-GPA']).toBe('NOT_CHECKED');
    expect(withGpa.unresolved.affectedRequirementIds).toEqual(READS_ATTEMPTS);
    expect({...result.audit, state:base.state, requirements:[], excludedAttempts:[], caveats:[]})
      .toEqual({...base, requirements:[], excludedAttempts:[], caveats:[]});
    expect(result.audit.requirements.map(r => ({...r, state:'X'}))).toEqual(base.requirements.map(r => ({...r, state:'X'})));
    expect(reasonOf(result, 'SYN-U1')).toBe('NEEDS_REVIEW');
    expect(result.unresolved).toEqual({attemptTokens:['SYN-U1'], linkedAttemptTokens:[], affectedRequirementIds:READS_ATTEMPTS});
    expect(result.audit.caveats.join(' ')).toMatch(/1 course row\(s\) have no confirmed course code/);
  });

  it('an unsatisfied required course, K-of-N or area row is not reported as unsatisfied', () => {
    // Confirmed rows give 6 units in no course of the K-of-N; the unresolved row could be SYN-C1.
    const rows = [resolved('SYN-T9', 'SYN-C9', {areaIds:['SYN-A2']}), unresolved('SYN-U1')];
    const base = buildAcademicLedger({...request(rows), attempts:strip(rows)});
    const result = buildLedgerWithCourseIdentity(request(rows));
    for (const id of ['SYN-R-REQ', 'SYN-R-KN', 'SYN-R-AREA', 'SYN-R-TOTAL', 'SYN-R-SPREAD', 'SYN-R-GROUP']) {
      expect(base.requirements.find(r => r.requirementId === id)!.state, id).toBe('UNSATISFIED');
      expect(states(result)[id], id).toBe('NEEDS_REVIEW');
    }
    expect(result.audit.earnedCreditUnits).toBe(6);
  });

  it('several unresolved rows are all listed, in input order', () => {
    const rows = [unresolved('SYN-U2'), ...SATISFIED_BASE, unresolved('SYN-U1', {ledger:'PLANNED'})];
    const result = buildLedgerWithCourseIdentity(request(rows));
    expect(result.unresolved.attemptTokens).toEqual(['SYN-U2', 'SYN-U1']);
    expect(result.audit.excludedAttempts.filter(r => r.reason === 'NEEDS_REVIEW').map(r => r.attemptToken)).toEqual(['SYN-U2', 'SYN-U1']);
    expect(result.audit.caveats.join(' ')).toMatch(/2 course row\(s\)/);
  });

  it('a same-course collision is held, not subtracted', () => {
    // If SYN-U1 were SYN-C1, the ordinary ledger would hold both SYN-C1 rows. So the required
    // course is not confirmed, but SYN-T1's credit stays counted until the code is known.
    const rows = [...SATISFIED_BASE, unresolved('SYN-U1')];
    const asC1 = buildAcademicLedger({...request(rows), attempts:[...strip(rows),
      {attemptToken:'SYN-U1', canonicalCourseId:'SYN-C1', creditUnits:6, ledger:'EARNED', areaIds:['SYN-A1'], recognition:'RECOGNIZED', term:'2025-1'}]});
    expect(asC1.requirements.find(r => r.requirementId === 'SYN-R-REQ')!.state).toBe('UNSATISFIED');
    const result = buildLedgerWithCourseIdentity(request(rows));
    expect(states(result)['SYN-R-REQ']).toBe('NEEDS_REVIEW');
    expect(reasonOf(result, 'SYN-T1')).toBeUndefined();
    expect(result.audit.earnedCreditUnits).toBe(18);
  });

  it('an unresolved in-progress row can still change an earned course, so it holds too', () => {
    // SYN-C1 is earned and also in progress. A second in-progress SYN-C1 row would make the
    // ordinary ledger hold the whole course, so the required course is not confirmed.
    const rows = [...SATISFIED_BASE, resolved('SYN-T5', 'SYN-C1', {ledger:'IN_PROGRESS', term:'2026-2'}),
      unresolved('SYN-U1', {ledger:'IN_PROGRESS', term:'2026-2'})];
    const base = buildAcademicLedger({...request(rows), attempts:strip(rows)});
    expect(base.requirements.find(r => r.requirementId === 'SYN-R-REQ')!.state).toBe('SATISFIED');
    const asC1 = buildAcademicLedger({...request(rows), attempts:[...strip(rows),
      {attemptToken:'SYN-U1', canonicalCourseId:'SYN-C1', creditUnits:6, ledger:'IN_PROGRESS', areaIds:[], recognition:'RECOGNIZED', term:'2026-2'}]});
    expect(asC1.requirements.find(r => r.requirementId === 'SYN-R-REQ')!.state).toBe('UNSATISFIED');
    const result = buildLedgerWithCourseIdentity(request(rows));
    expect(states(result)['SYN-R-REQ']).toBe('NEEDS_REVIEW');
    expect(result.audit.earnedCreditUnits).toBe(base.earnedCreditUnits);
  });

  it('an unresolved retake of a confirmed row keeps that row counted', () => {
    // Even a PENDING unresolved row holds the audit when it is linked.
    const rows = [...SATISFIED_BASE,
      unresolved('SYN-U1', {term:'2025-2', supersedesAttemptToken:'SYN-T1', retakeApprovalRef:'SYN-RETAKE-1', recognition:'PENDING'})];
    const result = buildLedgerWithCourseIdentity(request(rows));
    expect(reasonOf(result, 'SYN-T1')).toBeUndefined();
    expect(result.audit.earnedCreditUnits).toBe(18);
    expect(result.unresolved.linkedAttemptTokens).toEqual(['SYN-T1']);
    for (const id of READS_ATTEMPTS) expect(states(result)[id], id).toBe('NEEDS_REVIEW');
    expect(result.audit.caveats.join(' ')).toMatch(/retake link touches/);
  });

  it('a confirmed retake of an unresolved row is held, as a retake with a missing target is', () => {
    const rows = [...SATISFIED_BASE,
      resolved('SYN-T4', 'SYN-C4', {term:'2025-2', supersedesAttemptToken:'SYN-U1', retakeApprovalRef:'SYN-RETAKE-1'}),
      unresolved('SYN-U1', {term:'2024-2'})];
    const result = buildLedgerWithCourseIdentity(request(rows));
    expect(reasonOf(result, 'SYN-T4')).toBe('NEEDS_REVIEW');
    expect(result.audit.earnedCreditUnits).toBe(18);
    expect(result.unresolved.linkedAttemptTokens).toEqual(['SYN-T4']);
    expect(result.audit.state).toBe('NEEDS_REVIEW');
  });

  it('a retake cycle through an unresolved row is held without throwing', () => {
    const rows = [...SATISFIED_BASE,
      resolved('SYN-T4', 'SYN-C4', {supersedesAttemptToken:'SYN-U1', retakeApprovalRef:'SYN-RETAKE-1'}),
      unresolved('SYN-U1', {supersedesAttemptToken:'SYN-T4', retakeApprovalRef:'SYN-RETAKE-2'})];
    const result = buildLedgerWithCourseIdentity(request(rows));
    expect(reasonOf(result, 'SYN-T4')).toBe('NEEDS_REVIEW');
    expect(reasonOf(result, 'SYN-U1')).toBe('NEEDS_REVIEW');
    expect(result.unresolved.linkedAttemptTokens).toEqual(['SYN-T4']);
    for (const id of READS_ATTEMPTS) expect(states(result)[id], id).toBe('NEEDS_REVIEW');
  });

  it('an unlinked PENDING or EXCLUDED unresolved row keeps row states but blocks READY', () => {
    for (const recognition of ['PENDING', 'EXCLUDED'] as const) {
      const rows = [...SATISFIED_BASE, unresolved('SYN-U1', {recognition})];
      const result = buildLedgerWithCourseIdentity(request(rows));
      const base = buildAcademicLedger({...request(rows), attempts:strip(rows)});
      expect(result.audit.requirements, recognition).toEqual(base.requirements);
      expect(result.audit.state, recognition).toBe('NEEDS_REVIEW');
      expect(result.audit.pendingRecognitionCreditUnits, recognition).toBe(base.pendingRecognitionCreditUnits);
      expect(result.unresolved.affectedRequirementIds, recognition).toEqual([]);
    }
  });

  it('a missing rule pack stays INSUFFICIENT_DATA', () => {
    const result = buildLedgerWithCourseIdentity(request([...SATISFIED_BASE, unresolved('SYN-U1')], {rulePackState:'MISSING'}));
    expect(result.audit.state).toBe('INSUFFICIENT_DATA');
  });

  it('once the code is confirmed, the row is an ordinary attempt', () => {
    // The caller re-runs with the newer resolution; nothing from the unresolved run is kept.
    const before = buildLedgerWithCourseIdentity(request([...SATISFIED_BASE, unresolved('SYN-U1')]));
    const rows = [...SATISFIED_BASE, resolved('SYN-U1', 'SYN-C5', {areaIds:[]})];
    const after = buildLedgerWithCourseIdentity(request(rows));
    expect(before.audit.state).toBe('NEEDS_REVIEW');
    expect(after.audit).toEqual(buildAcademicLedger({...request(rows), attempts:strip(rows)}));
    expect(after.audit.state).toBe('READY');
    expect(after.audit.earnedCreditUnits).toBe(24);
  });

  it('asOf and rule pack version are the caller\'s', () => {
    const rows = [...SATISFIED_BASE, unresolved('SYN-U1', {term:'2026-2'})];
    const early = buildLedgerWithCourseIdentity(request(rows, {asOf:'2026-11-01T00:00:00.000+09:00', rulePackVersion:'SYN-PACK-V1'}));
    const late = buildLedgerWithCourseIdentity(request(rows, {asOf:'2027-02-01T00:00:00.000+09:00', rulePackVersion:'SYN-PACK-V2'}));
    expect([early.audit.asOf, early.audit.rulePackVersion]).toEqual(['2026-11-01T00:00:00.000+09:00', 'SYN-PACK-V1']);
    expect([late.audit.asOf, late.audit.rulePackVersion]).toEqual(['2027-02-01T00:00:00.000+09:00', 'SYN-PACK-V2']);
    // A term that has since ended does not make an unresolved row count.
    expect(late.audit.earnedCreditUnits).toBe(18);
    expect(late.unresolved.attemptTokens).toEqual(['SYN-U1']);
  });
});

// ---------------------------------------------------------------------------------------------
// Brute force: try every course and area set an unresolved row could turn out to be.

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
const SEEDS = Array.from({length:Number(process.env.COURSE_ID_PROP_RUNS ?? 300)}, (_, i) => 20261106 + i);

const COURSES = ['SYN-C1', 'SYN-C2', 'SYN-C3'] as const;
const AREA_SETS:readonly (readonly string[])[] = [[], ['SYN-A1'], ['SYN-A2'], ['SYN-A1', 'SYN-A2']];
const TERMS = ['2024-2', '2025-1', '2025-2', '2026-2'] as const;

function genRows(rng:Rng):IdentifiedLedgerAttempt[] {
  const rows:IdentifiedLedgerAttempt[] = [];
  const count = 1 + Math.floor(rng() * 4);
  for (let i = 0; i < count; i++) {
    rows.push(resolved(`SYN-T${i}`, pick(rng, COURSES), {
      creditUnits:pick(rng, [1, 6, 6]), ledger:pick(rng, ['EARNED', 'EARNED', 'IN_PROGRESS', 'PLANNED'] as const),
      areaIds:pick(rng, AREA_SETS), recognition:pick(rng, ['RECOGNIZED', 'RECOGNIZED', 'PENDING', 'EXCLUDED'] as const),
      term:pick(rng, TERMS),
    }));
  }
  const unresolvedCount = chance(rng, 0.7) ? 1 : 2;
  for (let i = 0; i < unresolvedCount; i++) {
    rows.push(unresolved(`SYN-U${i}`, {
      creditUnits:pick(rng, [1, 6]), ledger:pick(rng, ['EARNED', 'IN_PROGRESS', 'PLANNED'] as const),
      recognition:pick(rng, ['RECOGNIZED', 'PENDING', 'EXCLUDED', 'PENDING', 'EXCLUDED'] as const), term:pick(rng, TERMS),
    }));
  }
  const tokens = rows.map(r => r.attemptToken);
  for (const row of rows) {
    if (!chance(rng, 0.2)) continue;
    row.supersedesAttemptToken = pick(rng, tokens);
    if (chance(rng, 0.7)) row.retakeApprovalRef = 'SYN-RETAKE-1';
  }
  return rows;
}

/** Every way the unresolved rows could be resolved: an existing course or a fresh one, any area set. */
function resolutions(rows:readonly IdentifiedLedgerAttempt[]):LedgerAttempt[][] {
  let out:LedgerAttempt[][] = [[]];
  for (const row of rows) {
    const options:LedgerAttempt[] = [];
    if (row.identity === 'RESOLVED') {
      const {identity:_identity, ...rest} = row;
      options.push(rest);
    } else {
      const {identity:_identity, ...rest} = row;
      for (const course of [...COURSES, `SYN-FRESH-${row.attemptToken}`]) {
        for (const areaIds of AREA_SETS) options.push({...rest, canonicalCourseId:course, areaIds});
      }
    }
    out = out.flatMap(prefix => options.map(option => [...prefix, option]));
  }
  return out;
}

const shuffled = <T,>(rng:Rng, list:readonly T[]):T[] => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
};

describe('course identity: brute force over every possible resolution (#11)', () => {
  it('a requirement row left SATISFIED or UNSATISFIED has that state under every resolution', () => {
    const seenLive = {held:0, kept:0};
    for (const seed of SEEDS) {
      const rng = mulberry32(seed);
      const rows = genRows(rng);
      const req = request(rows, {rulePackState:chance(rng, 0.85) ? 'APPROVED' : 'DRAFT'});
      const result = buildLedgerWithCourseIdentity(req);
      if (result.unresolved.affectedRequirementIds.length > 0) seenLive.held += 1;
      else seenLive.kept += 1;
      expect(result.audit.state, `seed ${seed}`).not.toBe('READY');
      for (const attempts of resolutions(rows)) {
        const full = buildAcademicLedger({...req, attempts});
        for (const row of result.audit.requirements) {
          if (row.state !== 'SATISFIED' && row.state !== 'UNSATISFIED') continue;
          const other = full.requirements.find(r => r.requirementId === row.requirementId)!;
          if (other.state !== row.state) {
            throw new Error(`seed ${seed}: ${row.requirementId} is ${row.state} but ${other.state} if resolved as `
              + JSON.stringify(attempts.filter(a => a.attemptToken.startsWith('SYN-U'))) + ` rows ${JSON.stringify(rows)}`);
          }
        }
      }
    }
    // Both paths are exercised: rows held, and rows kept because no resolution can move them.
    if (SEEDS.length >= 100) expect(Math.min(seenLive.held, seenLive.kept)).toBeGreaterThan(20);
  });

  it('counted credits and areas come from confirmed rows only', () => {
    for (const seed of SEEDS) {
      const rows = genRows(mulberry32(seed));
      const result = buildLedgerWithCourseIdentity(request(rows));
      // A confirmed row that claims to supersede an unresolved row is held, as with a missing target.
      const base = buildAcademicLedger({...request(rows), attempts:strip(rows)});
      for (const key of ['earnedCreditUnits', 'inProgressCreditUnits', 'plannedCreditUnits', 'projectedUniqueCreditUnits',
        'pendingRecognitionCreditUnits', 'areaProgress'] as const) {
        expect(result.audit[key], `seed ${seed} ${key}`).toEqual(base[key]);
      }
      for (const token of result.unresolved.attemptTokens) expect(reasonOf(result, token), `seed ${seed}`).toBe('NEEDS_REVIEW');
    }
  });

  it('input order does not change the result', () => {
    const norm = (r:ReturnType<typeof buildLedgerWithCourseIdentity>) => ({
      audit:{...r.audit, excludedAttempts:[...r.audit.excludedAttempts].sort((a, b) => (a.attemptToken < b.attemptToken ? -1 : 1))},
      tokens:[...r.unresolved.attemptTokens].sort(), linked:[...r.unresolved.linkedAttemptTokens].sort(),
      affected:r.unresolved.affectedRequirementIds,
    });
    for (const seed of SEEDS) {
      const rng = mulberry32(seed);
      const rows = genRows(rng);
      expect(norm(buildLedgerWithCourseIdentity(request(shuffled(rng, rows)))), `seed ${seed}`)
        .toEqual(norm(buildLedgerWithCourseIdentity(request(rows))));
    }
  });

  it('does not change its input', () => {
    const rows = genRows(mulberry32(20261106));
    const snapshot = JSON.stringify(rows);
    buildLedgerWithCourseIdentity(request(rows));
    expect(JSON.stringify(rows)).toBe(snapshot);
  });
});
