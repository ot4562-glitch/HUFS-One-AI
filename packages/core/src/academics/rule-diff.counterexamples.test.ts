import {describe, expect, it} from 'vitest';
import {AcademicRulePackVNextSchema, type AcademicRulePackVNext} from '@hufs-one/contracts';
import type {LedgerAttempt} from './ledger.js';
import {compareRulePackRevisions, type ChangedField, type RevisionBlockerCode} from './rule-diff.js';

/**
 * #11 (본선 전): independent counterexamples for the RulePack revision diff (#87).
 * Two synthetic versions differ in one known way; the expected outcome is written by hand
 * from that one change, not computed by the engine. Every value is synthetic (SYN-*).
 *
 * Approval: the engine compares only APPROVED versions. A DRAFT pair is checked to stay blocked.
 * The approved fixtures below carry synthetic reviewer ids for test data only; they are not a
 * school rule approval and no real rule text is used.
 * 1 unit = 0.5학점.
 */

type Pack = AcademicRulePackVNext;
type Req = Pack['requirements'][number];
const AS_OF = '2026-11-01T00:00:00.000Z';

const refs = (id:string) => ({sourceClauseIds:[`CL-${id}`], exceptionClauseIds:[] as string[], evidenceRefs:[`SYN-EV-${id}`]});
const BASE:Req[] = [
  {id:'R-TOTAL', semanticKey:'total', kind:'CREDIT_TOTAL', requiredCreditUnits:24, ...refs('TOTAL')},
  {id:'R-MAJOR', semanticKey:'major', kind:'CATEGORY_MINIMUM', areaId:'MAJOR', requiredCreditUnits:12, ...refs('MAJOR')},
  {id:'R-GENERAL', semanticKey:'general', kind:'CATEGORY_MINIMUM', areaId:'GENERAL', requiredCreditUnits:6, ...refs('GENERAL')},
  {id:'R-CHOICE', semanticKey:'choice', kind:'K_OF_N', courseIds:['SYN-K1', 'SYN-K2', 'SYN-K3'], k:2, ...refs('CHOICE')},
  {id:'R-SPREAD', semanticKey:'spread', kind:'AREA_SPREAD', areaIds:['HUM', 'SOC', 'SCI'], minAreas:2,
    requiredCreditUnits:12, ...refs('SPREAD')},
  {id:'R-GROUP', semanticKey:'group', kind:'GROUP_CHOICE', groups:[['SYN-G1'], ['SYN-G2', 'SYN-G3']], k:1, ...refs('GROUP')},
  {id:'R-CORE', semanticKey:'core', kind:'REQUIRED_COURSE', canonicalCourseId:'SYN-CORE', ...refs('CORE')},
];

function inventory(requirements:readonly Req[]):Pack['clauseInventory'] {
  const linked = new Map<string, {kind:'RULE'|'EXCEPTION'; ids:string[]}>();
  for (const req of requirements) {
    for (const id of req.sourceClauseIds) {
      const entry = linked.get(id) ?? {kind:'RULE', ids:[]};
      entry.ids.push(req.id);
      linked.set(id, entry);
    }
    for (const id of req.exceptionClauseIds) {
      const entry = linked.get(id) ?? {kind:'EXCEPTION', ids:[]};
      entry.kind = 'EXCEPTION';
      entry.ids.push(req.id);
      linked.set(id, entry);
    }
  }
  return [...linked].map(([clauseId, {kind, ids}]) => ({
    clauseId, kind, sourceSpanRef:`span-${clauseId}`, coverage:{state:'LINKED', requirementIds:ids},
  }));
}

const SCOPE:Pack['scope'] = {
  campus:'SYN-CAMPUS', primaryMajor:'SYN-PRIMARY', majorRole:'PRIMARY_MAJOR', admissionType:'REGULAR',
  curriculumVersion:'SYN-CUR', degreePath:'ADVANCED_SINGLE', cohortFrom:2023, cohortTo:2026,
};

function approved(version:string, requirements:Req[], over:Partial<Pack> = {}):Pack {
  const sha = (version === 'SYN-V1' ? 'a' : 'b').repeat(64);
  const later = version !== 'SYN-V1';
  return AcademicRulePackVNextSchema.parse({
    version,
    ...(later ? {supersedesVersion:'SYN-V1'} : {}),
    sourceDocumentVersion:`DOC-${version}`,
    sourceDocumentUrl:'https://official.example.edu/synthetic-rules',
    sourceDocumentSha256:sha,
    sourcePublishedAt:later ? '2026-07-01T00:00:00.000Z' : '2025-01-01T00:00:00.000Z',
    effectiveFrom:later ? '2026-09-01T00:00:00.000Z' : '2025-03-01T00:00:00.000Z',
    ...(later ? {} : {effectiveUntil:'2026-09-01T00:00:00.000Z'}),
    scope:SCOPE,
    state:'APPROVED',
    requirements,
    clauseInventory:inventory(requirements),
    validationReport:{checkedAt:later ? '2026-07-20T00:00:00.000Z' : '2025-01-20T00:00:00.000Z',
      sourceDocumentSha256:sha, blockingIssues:[]},
    inventoryReviewedBy:'SYN-REVIEWER-B', approvedBy:'SYN-REVIEWER-A', independentlyCheckedBy:'SYN-REVIEWER-B',
    approvedAt:later ? '2026-08-01T00:00:00.000Z' : '2025-02-01T00:00:00.000Z',
    ...over,
  });
}

function draft(pack:Pack):Pack {
  const {approvedBy:_a, independentlyCheckedBy:_b, approvedAt:_c, ...rest} = pack;
  return AcademicRulePackVNextSchema.parse({...rest, state:'DRAFT'});
}

const attempt = (token:string, courseId:string, areaIds:string[], over:Partial<LedgerAttempt> = {}):LedgerAttempt => ({
  attemptToken:token, canonicalCourseId:courseId, creditUnits:6, ledger:'EARNED', areaIds,
  recognition:'RECOGNIZED', term:'2025-2', ...over,
});
const ATTEMPTS:LedgerAttempt[] = [
  attempt('T-M1', 'SYN-M1', ['MAJOR']),
  attempt('T-M2', 'SYN-M2', ['MAJOR']),
  attempt('T-A', 'SYN-A', ['GENERAL', 'HUM']),
  attempt('T-K1', 'SYN-K1', ['SOC']),
  attempt('T-K2', 'SYN-K2', ['SCI']),
  attempt('T-G1', 'SYN-G1', ['HUM']),
];

const clone = <T>(value:T):T => structuredClone(value);
const replace = (requirements:Req[], id:string, patch:Record<string, unknown>):Req[] =>
  requirements.map(req => (req.id === id ? {...req, ...patch} as Req : req));

/** One labeled change to the next version, and what a correct diff must report for it. */
interface Mutation {
  name:string;
  requirements?:(reqs:Req[]) => Req[];
  pack?:Partial<Pack>;
  expect:{changed:Array<[string, ChangedField]>; added?:string[]; removed?:string[]} | {blocked:RevisionBlockerCode};
}

const RULE_MUTATIONS:Mutation[] = [
  {name:'total credits raised', requirements:r => replace(r, 'R-TOTAL', {requiredCreditUnits:26}),
    expect:{changed:[['R-TOTAL', 'requiredCreditUnits']]}},
  {name:'area minimum raised', requirements:r => replace(r, 'R-GENERAL', {requiredCreditUnits:8}),
    expect:{changed:[['R-GENERAL', 'requiredCreditUnits']]}},
  {name:'area renamed', requirements:r => replace(r, 'R-GENERAL', {areaId:'LIBERAL'}),
    expect:{changed:[['R-GENERAL', 'areaId']]}},
  {name:'K-of-N gains a course', requirements:r => replace(r, 'R-CHOICE', {courseIds:['SYN-K1', 'SYN-K2', 'SYN-K3', 'SYN-K4']}),
    expect:{changed:[['R-CHOICE', 'courseIds']]}},
  {name:'K-of-N loses a course', requirements:r => replace(r, 'R-CHOICE', {courseIds:['SYN-K1', 'SYN-K3']}),
    expect:{changed:[['R-CHOICE', 'courseIds']]}},
  {name:'K-of-N swaps a course', requirements:r => replace(r, 'R-CHOICE', {courseIds:['SYN-K1', 'SYN-K2', 'SYN-K9']}),
    expect:{changed:[['R-CHOICE', 'courseIds']]}},
  {name:'K-of-N needs more', requirements:r => replace(r, 'R-CHOICE', {k:3}),
    expect:{changed:[['R-CHOICE', 'k']]}},
  {name:'spread area list changes', requirements:r => replace(r, 'R-SPREAD', {areaIds:['HUM', 'SOC', 'ART']}),
    expect:{changed:[['R-SPREAD', 'areaIds']]}},
  {name:'spread needs more areas', requirements:r => replace(r, 'R-SPREAD', {minAreas:3}),
    expect:{changed:[['R-SPREAD', 'minAreas']]}},
  {name:'group course moves between groups', requirements:r => replace(r, 'R-GROUP', {groups:[['SYN-G1', 'SYN-G2'], ['SYN-G3']]}),
    expect:{changed:[['R-GROUP', 'groups']]}},
  {name:'required course replaced', requirements:r => replace(r, 'R-CORE', {canonicalCourseId:'SYN-CORE-2'}),
    expect:{changed:[['R-CORE', 'canonicalCourseId']]}},
  {name:'new exception clause', requirements:r => replace(r, 'R-MAJOR', {exceptionClauseIds:['CL-MAJOR-EXC']}),
    expect:{changed:[['R-MAJOR', 'exceptionClauseIds']]}},
  {name:'requirement removed', requirements:r => r.filter(req => req.id !== 'R-CORE'),
    expect:{changed:[], removed:['R-CORE']}},
  {name:'requirement added', requirements:r => [...r,
    {id:'R-CORE2', semanticKey:'core2', kind:'REQUIRED_COURSE', canonicalCourseId:'SYN-CORE-B', ...refs('CORE2')}],
    expect:{changed:[], added:['R-CORE2']}},
];

const SCOPE_AND_PERIOD_MUTATIONS:Mutation[] = [
  {name:'cohort range extended', pack:{scope:{...SCOPE, cohortTo:2027}}, expect:{blocked:'SCOPE_MISMATCH'}},
  {name:'cohort range starts later', pack:{scope:{...SCOPE, cohortFrom:2024}}, expect:{blocked:'SCOPE_MISMATCH'}},
  {name:'admission type changes', pack:{scope:{...SCOPE, admissionType:'TRANSFER'}}, expect:{blocked:'SCOPE_MISMATCH'}},
  {name:'curriculum version changes', pack:{scope:{...SCOPE, curriculumVersion:'SYN-CUR-2'}}, expect:{blocked:'SCOPE_MISMATCH'}},
  {name:'degree path changes', pack:{scope:{...SCOPE, degreePath:'ADVANCED_PLUS_MINOR'}}, expect:{blocked:'SCOPE_MISMATCH'}},
  {name:'next starts a term late (gap)', pack:{effectiveFrom:'2027-03-01T00:00:00.000Z'}, expect:{blocked:'EFFECTIVE_GAP'}},
  {name:'next starts a term early (overlap)', pack:{effectiveFrom:'2026-03-01T00:00:00.000Z',
    sourcePublishedAt:'2026-01-01T00:00:00.000Z', approvedAt:'2026-02-01T00:00:00.000Z',
    validationReport:{checkedAt:'2026-01-20T00:00:00.000Z', sourceDocumentSha256:'b'.repeat(64), blockingIssues:[]}},
    expect:{blocked:'EFFECTIVE_OVERLAP'}},
];

function run(mutations:readonly Mutation[], attempts:readonly LedgerAttempt[] = ATTEMPTS) {
  let reqs = clone(BASE), over:Partial<Pack> = {};
  for (const m of mutations) {
    if (m.requirements) reqs = m.requirements(reqs);
    if (m.pack) over = {...over, ...m.pack};
  }
  return compareRulePackRevisions({asOf:AS_OF, previous:approved('SYN-V1', clone(BASE)),
    next:approved('SYN-V2', reqs, over), attempts, nextAttempts:attempts});
}

const reported = (diff:ReturnType<typeof run>) => ({
  changed:diff.requirements.filter(r => r.definition === 'CHANGED')
    .flatMap(r => r.changedFields.map(field => `${r.requirementId}:${field}`)).sort(),
  added:diff.requirements.filter(r => r.definition === 'ADDED').map(r => r.requirementId).sort(),
  removed:diff.requirements.filter(r => r.definition === 'REMOVED').map(r => r.requirementId).sort(),
});

describe('every single rule change is reported, and only that change', () => {
  it('an unchanged pair reports nothing changed', () => {
    const diff = run([]);
    expect(diff.blockers).toEqual([]);
    expect(reported(diff)).toEqual({changed:[], added:[], removed:[]});
  });

  it.each(RULE_MUTATIONS.map(m => [m.name, m] as const))('%s', (_name, m) => {
    const diff = run([m]);
    const want = m.expect as Exclude<Mutation['expect'], {blocked:RevisionBlockerCode}>;
    expect(diff.blockers).toEqual([]);
    expect(reported(diff)).toEqual({
      changed:want.changed.map(([id, field]) => `${id}:${field}`).sort(),
      added:[...(want.added ?? [])].sort(), removed:[...(want.removed ?? [])].sort(),
    });
  });
});

describe('cohort, scope and effective-term changes are blocked, never compared', () => {
  it.each(SCOPE_AND_PERIOD_MUTATIONS.map(m => [m.name, m] as const))('%s', (_name, m) => {
    const diff = run([m]);
    expect(diff.blockers.map(b => b.code)).toContain((m.expect as {blocked:RevisionBlockerCode}).blocked);
    expect(diff.state).toBe('NEEDS_REVIEW');
    expect(diff.requirements).toEqual([]);
  });
});

describe('DRAFT versions stay DRAFT', () => {
  it('a DRAFT pair, or a DRAFT on either side, is blocked with no rows', () => {
    const v1 = approved('SYN-V1', clone(BASE)), v2 = approved('SYN-V2', replace(clone(BASE), 'R-TOTAL', {requiredCreditUnits:26}));
    for (const [previous, next, sides] of [
      [draft(v1), draft(v2), ['previous', 'next']], [draft(v1), v2, ['previous']], [v1, draft(v2), ['next']],
    ] as const) {
      const diff = compareRulePackRevisions({asOf:AS_OF, previous, next, attempts:ATTEMPTS, nextAttempts:ATTEMPTS});
      expect(diff.requirements).toEqual([]);
      expect(diff.blockers).toEqual(sides.map(side => ({code:'NOT_APPROVED', side})));
    }
  });

  it('a DRAFT cannot be dressed up with sign-off fields', () => {
    const v1 = approved('SYN-V1', clone(BASE));
    expect(AcademicRulePackVNextSchema.safeParse({...v1, state:'DRAFT'}).success).toBe(false);
  });
});

/** mulberry32: small, seeded, and reproducible from the printed seed. */
function rng(seed:number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('combined rule changes (seeded)', () => {
  it('reports exactly the union of 1–3 independent changes, 300 rounds', () => {
    // At most one mutation per requirement so the expected union stays exact.
    const target = (m:Mutation) => (m.expect as {changed:Array<[string, ChangedField]>}).changed[0]?.[0]
      ?? (m.expect as {removed?:string[]}).removed?.[0] ?? 'ADD';
    for (let seed = 1; seed <= 300; seed += 1) {
      const next = rng(seed), picked:Mutation[] = [], used = new Set<string>();
      const count = 1 + Math.floor(next() * 3);
      while (picked.length < count) {
        const m = RULE_MUTATIONS[Math.floor(next() * RULE_MUTATIONS.length)]!;
        if (used.has(target(m))) continue;
        used.add(target(m));
        picked.push(m);
      }
      const diff = run(picked);
      const want = {changed:[] as string[], added:[] as string[], removed:[] as string[]};
      for (const m of picked) {
        const e = m.expect as Exclude<Mutation['expect'], {blocked:RevisionBlockerCode}>;
        want.changed.push(...e.changed.map(([id, field]) => `${id}:${field}`));
        want.added.push(...(e.added ?? []));
        want.removed.push(...(e.removed ?? []));
      }
      expect(reported(diff), `seed ${seed}: ${picked.map(m => m.name).join(' + ')}`)
        .toEqual({changed:want.changed.sort(), added:want.added.sort(), removed:want.removed.sort()});
    }
  });
});

describe('a course that counts in a different area under the next version', () => {
  // The next version's table moves SYN-A from GENERAL to MAJOR. The rule pack schema has no
  // course-to-area table; area membership arrives on the ledger rows. The requirements are identical.
  const v1 = approved('SYN-V1', clone(BASE)), v2 = approved('SYN-V2', clone(BASE));
  const moved = ATTEMPTS.map(a => (a.attemptToken === 'T-A' ? {...a, areaIds:['MAJOR', 'HUM']} : a));
  const at = (diff:ReturnType<typeof compareRulePackRevisions>, id:string) => diff.requirements.find(r => r.requirementId === id)!;

  it('is reported as an area membership change with the result it causes', () => {
    const diff = compareRulePackRevisions({asOf:AS_OF, previous:v1, next:v2, attempts:ATTEMPTS, nextAttempts:moved});
    expect(at(diff, 'R-GENERAL')).toMatchObject({definition:'CHANGED', changedFields:['areaMembership'], stateChange:'LOST'});
    expect(at(diff, 'R-MAJOR')).toMatchObject({definition:'CHANGED', changedFields:['areaMembership'], stateChange:'SAME'});
    expect(at(diff, 'R-MAJOR').next?.earnedCreditUnits).toBe(18);
    // Requirements that do not read the moved areas are untouched.
    expect(at(diff, 'R-TOTAL')).toMatchObject({definition:'UNCHANGED', stateChange:'SAME'});
    expect(at(diff, 'R-SPREAD')).toMatchObject({definition:'UNCHANGED'});
  });

  it('a spread over a moved area is reported too', () => {
    const toArt = ATTEMPTS.map(a => (a.attemptToken === 'T-G1' ? {...a, areaIds:['ART']} : a));
    const diff = compareRulePackRevisions({asOf:AS_OF, previous:v1, next:v2, attempts:ATTEMPTS, nextAttempts:toArt});
    expect(at(diff, 'R-SPREAD')).toMatchObject({definition:'CHANGED', changedFields:['areaMembership']});
  });

  it('without the next classification, area results are UNKNOWN, not SAME', () => {
    const diff = compareRulePackRevisions({asOf:AS_OF, previous:v1, next:v2, attempts:ATTEMPTS});
    expect(diff.state).toBe('NEEDS_REVIEW');
    for (const id of ['R-MAJOR', 'R-GENERAL', 'R-SPREAD']) expect(at(diff, id).stateChange).toBe('UNKNOWN');
    for (const id of ['R-TOTAL', 'R-CHOICE', 'R-GROUP', 'R-CORE']) expect(at(diff, id).stateChange).not.toBe('UNKNOWN');
    expect(diff.caveats.join(' ')).toMatch(/area/i);
  });

  it('refuses a next classification that changes anything but areas', () => {
    for (const bad of [
      ATTEMPTS.slice(1),
      ATTEMPTS.map(a => (a.attemptToken === 'T-A' ? {...a, creditUnits:4} : a)),
      ATTEMPTS.map(a => (a.attemptToken === 'T-A' ? {...a, term:'2026-1'} : a)),
      ATTEMPTS.map(a => (a.attemptToken === 'T-A' ? {...a, attemptToken:'T-OTHER'} : a)),
      ATTEMPTS.map(a => (a.attemptToken === 'T-A' ? {...a, ledger:'PLANNED' as const} : a)),
      // Same length, but one row twice and another missing.
      ATTEMPTS.map(a => (a.attemptToken === 'T-A' ? ATTEMPTS[0]! : a)),
    ]) {
      // The diff itself refuses the rows, before the ledger sees them.
      expect(() => compareRulePackRevisions({asOf:AS_OF, previous:v1, next:v2, attempts:ATTEMPTS, nextAttempts:bad}))
        .toThrow(/^nextAttempts/);
    }
  });
});
