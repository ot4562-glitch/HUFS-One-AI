import {describe, expect, it} from 'vitest';
import {selectAcademicRulePackAsOfVNext, type AcademicRulePackVNext} from '@hufs-one/contracts';
import {buildAcademicLedger, type LedgerAttempt} from './ledger.js';
import {compareRulePackRevisions, type RulePackRevisionRequest} from './rule-diff.js';

/** Synthetic rule packs and ledger only. 1 unit = 0.5학점, so 3학점 is 6 units. */
const AS_OF = '2026-11-01T00:00:00.000Z';
type Pack = AcademicRulePackVNext;
type Req = Pack['requirements'][number];
type Clause = Pack['clauseInventory'][number];

const total = (units:number, over:Partial<Req> = {}):Req => ({
  id:'REQ-TOTAL', semanticKey:'total', kind:'CREDIT_TOTAL', requiredCreditUnits:units,
  sourceClauseIds:['CL-TOTAL'], exceptionClauseIds:[], evidenceRefs:['SYN-EV-TOTAL'], ...over,
} as Req);
const area = (id:string, areaId:string, units:number):Req => ({
  id, semanticKey:`area-${areaId}`, kind:'CATEGORY_MINIMUM', areaId, requiredCreditUnits:units,
  sourceClauseIds:[`CL-${areaId}`], exceptionClauseIds:[], evidenceRefs:[`SYN-EV-${areaId}`],
});
const choice = (k:number, courseIds = ['SYN-A', 'SYN-B', 'SYN-C']):Req => ({
  id:'REQ-CHOICE', semanticKey:'choice', kind:'K_OF_N', courseIds, k,
  sourceClauseIds:['CL-CHOICE'], exceptionClauseIds:[], evidenceRefs:['SYN-EV-CHOICE'],
});
const core = ():Req => ({
  id:'REQ-CORE', semanticKey:'core', kind:'REQUIRED_COURSE', canonicalCourseId:'SYN-CORE',
  sourceClauseIds:['CL-CORE'], exceptionClauseIds:[], evidenceRefs:['SYN-EV-CORE'],
});
const gpa = ():Req => ({
  id:'REQ-GPA', semanticKey:'gpa', kind:'NON_CREDIT', criterionId:'GPA', verificationMode:'GPA_NOT_COLLECTED',
  sourceClauseIds:['CL-GPA'], exceptionClauseIds:[], evidenceRefs:['SYN-EV-GPA'],
});

const baseRequirements = ():Req[] => [total(12), area('REQ-MAJOR', 'MAJOR', 12), area('REQ-GENERAL', 'GENERAL', 6), choice(2)];

/** Builds a reciprocal clause inventory from the requirements; spans can be overridden to model re-wording. */
function inventory(requirements:readonly Req[], spans:Record<string, string>):Clause[] {
  const byClause = new Map<string, {kind:Clause['kind']; ids:string[]}>();
  for (const req of requirements) {
    for (const id of req.sourceClauseIds) {
      const entry = byClause.get(id) ?? {kind:'RULE', ids:[]};
      entry.ids.push(req.id);
      byClause.set(id, entry);
    }
    for (const id of req.exceptionClauseIds) {
      const entry = byClause.get(id) ?? {kind:'EXCEPTION', ids:[]};
      entry.kind = 'EXCEPTION';
      entry.ids.push(req.id);
      byClause.set(id, entry);
    }
  }
  return [...byClause].map(([clauseId, {kind, ids}]) => ({
    clauseId, kind, sourceSpanRef:spans[clauseId] ?? `span-${clauseId}`,
    coverage:{state:'LINKED', requirementIds:ids},
  }));
}

const SCOPE:Pack['scope'] = {
  campus:'DEMO', primaryMajor:'SYN-PRIMARY', secondaryMajor:'SYN-ECON', majorRole:'DOUBLE_MAJOR',
  admissionType:'REGULAR', curriculumVersion:'CUR-2025', cohortFrom:2023, cohortTo:2026,
};

const pack = (version:string, requirements:Req[], over:Partial<Pack> = {}, spans:Record<string, string> = {}):Pack => {
  const sha = (over.sourceDocumentSha256 ?? (version === 'SYN-V1' ? 'a' : 'b').repeat(64));
  return {
    version,
    sourceDocumentVersion:`DOC-${version}`,
    sourceDocumentUrl:'https://official.example.edu/synthetic-rules',
    sourceDocumentSha256:sha,
    sourcePublishedAt:'2025-01-01T00:00:00.000Z',
    effectiveFrom:'2025-03-01T00:00:00.000Z',
    scope:SCOPE,
    state:'APPROVED',
    requirements,
    clauseInventory:inventory(requirements, spans),
    validationReport:{checkedAt:'2025-01-20T00:00:00.000Z', sourceDocumentSha256:sha, blockingIssues:[]},
    inventoryReviewedBy:'reviewer-B',
    approvedBy:'reviewer-A',
    independentlyCheckedBy:'reviewer-B',
    approvedAt:'2025-02-01T00:00:00.000Z',
    ...over,
  };
};

const V1_OVER:Partial<Pack> = {effectiveUntil:'2026-09-01T00:00:00.000Z'};
const V2_OVER:Partial<Pack> = {
  supersedesVersion:'SYN-V1',
  sourcePublishedAt:'2026-07-01T00:00:00.000Z',
  effectiveFrom:'2026-09-01T00:00:00.000Z',
  validationReport:{checkedAt:'2026-07-20T00:00:00.000Z', sourceDocumentSha256:'b'.repeat(64), blockingIssues:[]},
  approvedAt:'2026-08-01T00:00:00.000Z',
};
const v1 = (requirements = baseRequirements(), over:Partial<Pack> = {}) => pack('SYN-V1', requirements, {...V1_OVER, ...over});
const v2 = (requirements = baseRequirements(), over:Partial<Pack> = {}, spans:Record<string, string> = {}) =>
  pack('SYN-V2', requirements, {...V2_OVER, ...over}, spans);

const attempt = (token:string, courseId:string, over:Partial<LedgerAttempt> = {}):LedgerAttempt => ({
  attemptToken:token, canonicalCourseId:courseId, creditUnits:6, ledger:'EARNED',
  areaIds:['MAJOR'], recognition:'RECOGNIZED', term:'2025-2', ...over,
});
/** SYN-A is recognized in two areas; the unique total still counts it once. SYN-C is planned. */
const ATTEMPTS:LedgerAttempt[] = [
  attempt('SYN-T-A', 'SYN-A', {areaIds:['MAJOR', 'GENERAL']}),
  attempt('SYN-T-B', 'SYN-B'),
  attempt('SYN-T-C', 'SYN-C', {ledger:'PLANNED', term:'2027-1'}),
];

const request = (previous:unknown, next:unknown, over:Partial<RulePackRevisionRequest> = {}):RulePackRevisionRequest =>
  // The same rows for both versions: area membership is stated as unchanged (see nextAttempts).
  ({asOf:AS_OF, previous, next, attempts:ATTEMPTS, nextAttempts:ATTEMPTS, ...over});
const row = (diff:ReturnType<typeof compareRulePackRevisions>, id:string) => diff.requirements.find(r => r.requirementId === id);

describe('compareRulePackRevisions: clean amendment', () => {
  it('reports every requirement unchanged when only the version changes', () => {
    const diff = compareRulePackRevisions(request(v1(), v2()));
    expect(diff.state).toBe('READY');
    expect(diff.revisionKind).toBe('AMENDMENT');
    expect(diff.inEffectAtAsOf).toBe('NEXT');
    expect(diff.blockers).toEqual([]);
    expect(diff.requirements.map(r => [r.requirementId, r.definition, r.stateChange])).toEqual([
      ['REQ-CHOICE', 'UNCHANGED', 'SAME'],
      ['REQ-GENERAL', 'UNCHANGED', 'SAME'],
      ['REQ-MAJOR', 'UNCHANGED', 'SAME'],
      ['REQ-TOTAL', 'UNCHANGED', 'SAME'],
    ]);
  });

  it('matches buildAcademicLedger row for row on each side', () => {
    const diff = compareRulePackRevisions(request(v1(), v2([total(16), area('REQ-MAJOR', 'MAJOR', 18)])));
    const ledgerRows = (p:Pack) => buildAcademicLedger({
      asOf:AS_OF, rulePackVersion:p.version, rulePackState:'APPROVED', attempts:ATTEMPTS,
      requirements:p.requirements.map(r => r.kind === 'CREDIT_TOTAL'
        ? {id:r.id, kind:r.kind, requiredCreditUnits:r.requiredCreditUnits, evidenceRefs:r.evidenceRefs}
        : r.kind === 'CATEGORY_MINIMUM'
          ? {id:r.id, kind:r.kind, areaId:r.areaId, requiredCreditUnits:r.requiredCreditUnits, evidenceRefs:r.evidenceRefs}
          : {id:r.id, kind:'K_OF_N', courseIds:(r as Extract<Req, {kind:'K_OF_N'}>).courseIds, k:(r as Extract<Req, {kind:'K_OF_N'}>).k, evidenceRefs:r.evidenceRefs}),
    }).requirements;
    const after = ledgerRows(v2([total(16), area('REQ-MAJOR', 'MAJOR', 18)]));
    for (const ledgerRow of after) {
      const revision = row(diff, ledgerRow.requirementId)!;
      expect(revision.next?.state).toBe(ledgerRow.state);
      expect(revision.next?.remainingCreditUnits).toBe(ledgerRow.remainingCreditUnits);
    }
  });

  it('flags a raised credit total that the same ledger no longer meets', () => {
    const diff = compareRulePackRevisions(request(v1(), v2([total(16), area('REQ-MAJOR', 'MAJOR', 12), area('REQ-GENERAL', 'GENERAL', 6), choice(2)])));
    expect(row(diff, 'REQ-TOTAL')).toMatchObject({
      definition:'CHANGED', changedFields:['requiredCreditUnits'], stateChange:'LOST',
      previous:{state:'SATISFIED', requiredCreditUnits:12, remainingCreditUnits:0},
      next:{state:'UNSATISFIED', requiredCreditUnits:16, remainingCreditUnits:4, projectedCreditUnits:18},
    });
    expect(diff.caveats.some(text => text.includes('no longer satisfied') || text.includes('not satisfied under the next'))).toBe(true);
  });

  it('flags a raised area minimum and keeps planned credits separate from earned', () => {
    const diff = compareRulePackRevisions(request(v1(), v2([total(12), area('REQ-MAJOR', 'MAJOR', 18), area('REQ-GENERAL', 'GENERAL', 6), choice(2)])));
    expect(row(diff, 'REQ-MAJOR')).toMatchObject({
      stateChange:'LOST',
      previous:{state:'SATISFIED', earnedCreditUnits:12, projectedCreditUnits:18},
      next:{state:'UNSATISFIED', earnedCreditUnits:12, remainingCreditUnits:6, projectedCreditUnits:18},
    });
  });

  it('flags an area that relied on a course recognized in two areas', () => {
    const diff = compareRulePackRevisions(request(v1(), v2([total(12), area('REQ-MAJOR', 'MAJOR', 12), area('REQ-GENERAL', 'GENERAL', 12), choice(2)])));
    expect(row(diff, 'REQ-GENERAL')).toMatchObject({stateChange:'LOST', next:{earnedCreditUnits:6, remainingCreditUnits:6}});
    expect(row(diff, 'REQ-TOTAL')?.stateChange).toBe('SAME');
  });

  it('flags a K-of-N that now needs more courses and ignores a reordered course list', () => {
    const raised = compareRulePackRevisions(request(v1(), v2([total(12), area('REQ-MAJOR', 'MAJOR', 12), area('REQ-GENERAL', 'GENERAL', 6), choice(3)])));
    expect(row(raised, 'REQ-CHOICE')).toMatchObject({definition:'CHANGED', changedFields:['k'], stateChange:'LOST'});
    const reordered = compareRulePackRevisions(request(v1(), v2([total(12), area('REQ-MAJOR', 'MAJOR', 12), area('REQ-GENERAL', 'GENERAL', 6), choice(2, ['SYN-C', 'SYN-A', 'SYN-B'])])));
    expect(row(reordered, 'REQ-CHOICE')).toMatchObject({definition:'UNCHANGED', changedFields:[], stateChange:'SAME'});
  });

  it('reports added and removed requirements with the side that has them', () => {
    const diff = compareRulePackRevisions(request(v1(), v2([total(12), area('REQ-MAJOR', 'MAJOR', 12), choice(2), core()])));
    expect(row(diff, 'REQ-CORE')).toMatchObject({definition:'ADDED', next:{state:'UNSATISFIED', clauseIds:['CL-CORE']}});
    expect(row(diff, 'REQ-CORE')?.stateChange).toBeUndefined();
    expect(row(diff, 'REQ-GENERAL')).toMatchObject({definition:'REMOVED', previous:{state:'SATISFIED'}});
  });

  it('reports a new exception clause as a rule change with its clause ids', () => {
    const next = baseRequirements().map(r => r.id === 'REQ-TOTAL' ? total(12, {exceptionClauseIds:['CL-EX-TRANSFER']}) : r);
    const diff = compareRulePackRevisions(request(v1(), v2(next)));
    expect(row(diff, 'REQ-TOTAL')).toMatchObject({
      definition:'CHANGED', changedFields:['exceptionClauseIds'], stateChange:'SAME',
      previous:{clauseIds:['CL-TOTAL']}, next:{clauseIds:['CL-EX-TRANSFER', 'CL-TOTAL']},
    });
  });

  it('reports re-worded clause text even when the clause ids are the same', () => {
    const diff = compareRulePackRevisions(request(v1(), v2(baseRequirements(), {}, {'CL-MAJOR':'span-CL-MAJOR-rev2'})));
    expect(row(diff, 'REQ-MAJOR')).toMatchObject({definition:'CHANGED', changedFields:['clauses']});
  });

  it('does not count a new evidence reference as a rule change', () => {
    const next = baseRequirements().map(r => r.id === 'REQ-TOTAL' ? total(12, {evidenceRefs:['SYN-EV-TOTAL-2027']}) : r);
    expect(row(compareRulePackRevisions(request(v1(), v2(next))), 'REQ-TOTAL')?.definition).toBe('UNCHANGED');
  });

  it('marks an unmeasured GPA requirement UNKNOWN rather than SAME', () => {
    const diff = compareRulePackRevisions(request(v1([...baseRequirements(), gpa()]), v2([...baseRequirements(), gpa()])));
    expect(row(diff, 'REQ-GPA')?.stateChange).toBe('UNKNOWN');
    expect(diff.state).toBe('NEEDS_REVIEW');
  });

  it('accepts a correction that re-issues the same effective period', () => {
    const correction = v2(baseRequirements(), {effectiveFrom:'2025-03-01T00:00:00.000Z', effectiveUntil:'2026-09-01T00:00:00.000Z'});
    const diff = compareRulePackRevisions(request(v1(), correction));
    expect(diff.revisionKind).toBe('CORRECTION');
    expect(diff.blockers).toEqual([]);
    expect(diff.inEffectAtAsOf).toBe('NONE');
  });
});

describe('compareRulePackRevisions: effective period agrees with #70 and the as-of selector', () => {
  const selected = (asOf:string) => selectAcademicRulePackAsOfVNext([v1(), v2()], {
    asOf, campus:'DEMO', primaryMajor:'SYN-PRIMARY', secondaryMajor:'SYN-ECON', majorRole:'DOUBLE_MAJOR',
    admissionType:'REGULAR', curriculumVersion:'CUR-2025', admissionYear:2025,
  })?.version;

  it('treats the switch instant as the next version (exclusive end)', () => {
    const at = '2026-09-01T00:00:00.000Z';
    expect(compareRulePackRevisions(request(v1(), v2(), {asOf:at})).inEffectAtAsOf).toBe('NEXT');
    expect(selected(at)).toBe('SYN-V2');
  });

  it('treats the instant before the switch as the previous version', () => {
    const at = '2026-08-31T23:59:59.999Z';
    expect(compareRulePackRevisions(request(v1(), v2(), {asOf:at})).inEffectAtAsOf).toBe('PREVIOUS');
    expect(selected(at)).toBe('SYN-V1');
  });
});

describe('compareRulePackRevisions: blocked pairs return no rows', () => {
  const blockers = (previous:unknown, next:unknown, over:Partial<RulePackRevisionRequest> = {}) => {
    const diff = compareRulePackRevisions(request(previous, next, over));
    expect(diff.state).toBe('NEEDS_REVIEW');
    expect(diff.requirements).toEqual([]);
    return diff.blockers;
  };

  it('blocks an unapproved or invalid version', () => {
    const draft = {...v2(), state:'NEEDS_REVIEW', approvedBy:undefined, independentlyCheckedBy:undefined, approvedAt:undefined};
    expect(blockers(v1(), draft)).toEqual([{code:'NOT_APPROVED', side:'next'}]);
    expect(blockers({version:'SYN-X'}, v2())).toEqual([{code:'NOT_APPROVED', side:'previous'}]);
  });

  it('blocks a version approved after asOf', () => {
    expect(blockers(v1(), v2(), {asOf:'2026-07-25T00:00:00.000Z'})).toEqual([{code:'NOT_APPROVED_BY_AS_OF', side:'next'}]);
  });

  it('blocks the same version, a version that does not supersede, and an unstable requirement id', () => {
    expect(blockers(v1(), v1())).toEqual([{code:'SAME_VERSION'}]);
    expect(blockers(v1(), v2(baseRequirements(), {supersedesVersion:'SYN-V0'}))).toEqual([{code:'NOT_SUPERSEDING', side:'next'}]);
    const renamed = baseRequirements().map(r => r.id === 'REQ-TOTAL' ? total(12, {id:'REQ-TOTAL-2'}) : r);
    expect(blockers(v1(), v2(renamed))).toEqual([{code:'REQUIREMENT_ID_UNSTABLE', side:'next'}]);
  });

  it('blocks a different cohort range or admission type', () => {
    expect(blockers(v1(), v2(baseRequirements(), {scope:{...SCOPE, cohortFrom:2024}}))).toEqual([{code:'SCOPE_MISMATCH'}]);
    expect(blockers(v1(), v2(baseRequirements(), {scope:{...SCOPE, admissionType:'TRANSFER'}}))).toEqual([{code:'SCOPE_MISMATCH'}]);
  });

  it('blocks overlapping and gapped periods', () => {
    expect(blockers(v1(baseRequirements(), {effectiveUntil:undefined}), v2())).toEqual([{code:'EFFECTIVE_OVERLAP'}]);
    expect(blockers(v1(baseRequirements(), {effectiveUntil:'2026-10-01T00:00:00.000Z'}), v2())).toEqual([{code:'EFFECTIVE_OVERLAP'}]);
    expect(blockers(v1(baseRequirements(), {effectiveUntil:'2026-08-01T00:00:00.000Z'}), v2())).toEqual([{code:'EFFECTIVE_GAP'}]);
  });

  it('blocks a correction that changes the end of the period', () => {
    const correction = v2(baseRequirements(), {effectiveFrom:'2025-03-01T00:00:00.000Z', effectiveUntil:'2026-12-01T00:00:00.000Z'});
    expect(blockers(v1(), correction)).toEqual([{code:'EFFECTIVE_OVERLAP'}]);
  });

  it('blocks an inverted history', () => {
    expect(blockers(v1(), v2(baseRequirements(), {effectiveFrom:'2024-03-01T00:00:00.000Z'}))).toEqual([{code:'HISTORY_INVERTED'}]);
    const earlierApproval = v2(baseRequirements(), {approvedAt:'2025-01-25T00:00:00.000Z', sourcePublishedAt:'2025-01-01T00:00:00.000Z',
      validationReport:{checkedAt:'2025-01-20T00:00:00.000Z', sourceDocumentSha256:'b'.repeat(64), blockingIssues:[]}});
    expect(blockers(v1(), earlierApproval)).toEqual([{code:'HISTORY_INVERTED'}]);
  });
});

describe('compareRulePackRevisions: inputs', () => {
  it('does not change either pack or the ledger rows', () => {
    const previous = v1(), next = v2([total(16), area('REQ-MAJOR', 'MAJOR', 18)]);
    const copies = structuredClone({previous, next, ATTEMPTS});
    compareRulePackRevisions(request(previous, next));
    expect({previous, next, ATTEMPTS}).toEqual(copies);
  });

  it('refuses an invalid asOf', () => {
    expect(() => compareRulePackRevisions(request(v1(), v2(), {asOf:'2026-11-01'}))).toThrow(/asOf/);
  });
});
