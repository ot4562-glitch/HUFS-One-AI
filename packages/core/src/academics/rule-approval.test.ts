import {describe, expect, it} from 'vitest';
import {AcademicRulePackVNextSchema, type AcademicRulePackVNext} from '@hufs-one/contracts';
import {
  decideRulePackActivation,
  type RulePackActivationRequest,
  type TrustedSourceInventory,
} from './rule-approval.js';

/**
 * Synthetic clauses only, shaped like a department notice: a credit rule, a required
 * course rule, a ※ retake exception that covers 이중전공 but not 부전공, an exam rule,
 * and a form procedure. No real regulation text or student data.
 */
const AS_OF = '2026-11-01T00:00:00.000Z';
const SHA = 'b'.repeat(64);
const RETAKE = 'CL-EX-RETAKE';

type Pack = AcademicRulePackVNext;
type Clause = Pack['clauseInventory'][number];
type Requirement = Pack['requirements'][number];

const linked = (clauseId:string, kind:Clause['kind'], requirementIds:string[]):Clause => ({
  clauseId, kind, sourceSpanRef:`span-${clauseId}`, coverage:{state:'LINKED', requirementIds},
});
const notApplicable = (clauseId:string, kind:Clause['kind']):Clause => ({
  clauseId, kind, sourceSpanRef:`span-${clauseId}`,
  coverage:{state:'NOT_APPLICABLE', reason:'Procedure text only; no credit rule.', independentlyReviewedBy:'reviewer-C'},
});

const requirements = ():Requirement[] => [
  {id:'REQ-CREDITS', semanticKey:'second-major-credits', kind:'CATEGORY_MINIMUM', areaId:'SECONDARY',
    requiredCreditUnits:84, sourceClauseIds:['CL-RULE-CREDITS'], exceptionClauseIds:[], evidenceRefs:['SYN-EV-CREDITS']},
  {id:'REQ-CORE', semanticKey:'core-course', kind:'REQUIRED_COURSE', canonicalCourseId:'SYN-CORE-1',
    sourceClauseIds:['CL-RULE-CORE'], exceptionClauseIds:[RETAKE], evidenceRefs:['SYN-EV-CORE']},
  {id:'REQ-EXAM', semanticKey:'exit-exam', kind:'NON_CREDIT', criterionId:'SYN-EXAM', verificationMode:'MANUAL',
    sourceClauseIds:['CL-RULE-EXAM'], exceptionClauseIds:[], evidenceRefs:['SYN-EV-EXAM']},
];

const clauses = ():Clause[] => [
  linked('CL-RULE-CREDITS', 'RULE', ['REQ-CREDITS']),
  linked('CL-RULE-CORE', 'RULE', ['REQ-CORE']),
  linked(RETAKE, 'EXCEPTION', ['REQ-CORE']),
  linked('CL-RULE-EXAM', 'RULE', ['REQ-EXAM']),
  notApplicable('CL-PROC-FORM', 'PROCEDURE'),
];

const pack = (over:Partial<Pack> = {}):Pack => ({
  version:'SYN-RULE-V2',
  supersedesVersion:'SYN-RULE-V1',
  sourceDocumentVersion:'SYN-DOC-2',
  sourceDocumentUrl:'https://official.example.edu/synthetic-rules',
  sourceDocumentSha256:SHA,
  sourcePublishedAt:'2026-01-01T00:00:00.000Z',
  effectiveFrom:'2026-03-01T00:00:00.000Z',
  scope:{
    campus:'DEMO', primaryMajor:'SYN-PRIMARY', secondaryMajor:'SYN-ECON', majorRole:'DOUBLE_MAJOR',
    admissionType:'REGULAR', curriculumVersion:'CUR-2026', cohortFrom:2015, cohortTo:2026,
  },
  state:'APPROVED',
  requirements:requirements(),
  clauseInventory:clauses(),
  validationReport:{checkedAt:'2026-01-20T00:00:00.000Z', sourceDocumentSha256:SHA, blockingIssues:[]},
  inventoryReviewedBy:'reviewer-B',
  approvedBy:'reviewer-A',
  independentlyCheckedBy:'reviewer-B',
  approvedAt:'2026-02-01T00:00:00.000Z',
  ...over,
});

const ACTIVE = AcademicRulePackVNextSchema.parse(pack({
  version:'SYN-RULE-V1', supersedesVersion:undefined, sourceDocumentVersion:'SYN-DOC-1',
}));

const trusted = (over:Partial<TrustedSourceInventory> = {}):TrustedSourceInventory => ({
  sourceDocumentSha256:SHA,
  clauses:[
    {clauseId:'CL-RULE-CREDITS', kind:'RULE', sourceSpanRef:'span-CL-RULE-CREDITS'},
    {clauseId:'CL-RULE-CORE', kind:'RULE', sourceSpanRef:'span-CL-RULE-CORE'},
    {clauseId:RETAKE, kind:'EXCEPTION', sourceSpanRef:`span-${RETAKE}`,
      appliesToSemanticKeys:['core-course'], includedMajorRoles:['DOUBLE_MAJOR'], excludedMajorRoles:['MINOR']},
    {clauseId:'CL-RULE-EXAM', kind:'RULE', sourceSpanRef:'span-CL-RULE-EXAM'},
    {clauseId:'CL-PROC-FORM', kind:'PROCEDURE', sourceSpanRef:'span-CL-PROC-FORM'},
  ],
  ...over,
});

const request = (candidate:unknown, over:Partial<RulePackActivationRequest> = {}):RulePackActivationRequest => ({
  asOf:AS_OF,
  active:ACTIVE,
  candidate,
  trustedOriginal:trusted(),
  ...over,
});

/** A pack whose own JSON is consistent, so only the independent inventory can catch it. */
const withoutRetake = ():Pack => pack({
  requirements:requirements().map(req => req.id === 'REQ-CORE' ? {...req, exceptionClauseIds:[]} : req),
  clauseInventory:clauses().filter(clause => clause.clauseId !== RETAKE),
});

const minorScope = {...pack().scope, majorRole:'MINOR' as const};

describe('decideRulePackActivation', () => {
  it('activates a candidate that matches the independent inventory and supersedes the active pack', () => {
    const result = decideRulePackActivation(request(pack()));
    expect(result.decision).toBe('ACTIVATED');
    expect(result.issues).toEqual([]);
    expect(result.active?.version).toBe('SYN-RULE-V2');
    expect(result.candidateVersion).toBe('SYN-RULE-V2');
  });

  it('keeps the active pack when the candidate carries a blocking warning', () => {
    const warned = pack({validationReport:{
      checkedAt:'2026-01-20T00:00:00.000Z', sourceDocumentSha256:SHA,
      blockingIssues:[{code:'PROMPT_INJECTION', sourceClauseId:'CL-RULE-CREDITS'}],
    }});
    const result = decideRulePackActivation(request(warned));
    expect(result.decision).toBe('HELD');
    expect(result.active).toBe(ACTIVE);
    expect(result.issues).toEqual([
      {code:'INVALID_PACK'},
      {code:'PROMPT_INJECTION', sourceClauseId:'CL-RULE-CREDITS'},
    ]);
    expect(result.candidateVersion).toBe('SYN-RULE-V2');
  });

  it('holds a draft candidate and still reports its warnings', () => {
    const draft = pack({
      state:'NEEDS_REVIEW', approvedBy:undefined, independentlyCheckedBy:undefined, approvedAt:undefined,
      validationReport:{checkedAt:'2026-01-20T00:00:00.000Z', sourceDocumentSha256:SHA,
        blockingIssues:[{code:'NUMERIC_SOURCE_MISMATCH'}]},
    });
    const result = decideRulePackActivation(request(draft));
    expect(result.decision).toBe('HELD');
    expect(result.active).toBe(ACTIVE);
    expect(result.issues.map(issue => issue.code)).toEqual(['NOT_APPROVED', 'NUMERIC_SOURCE_MISMATCH']);
  });

  it('holds input that is not a rule pack at all', () => {
    const result = decideRulePackActivation(request({version:'SYN-X', validationReport:{blockingIssues:[{code:'made-up'}]}}));
    expect(result).toEqual({decision:'HELD', active:ACTIVE, candidateVersion:'SYN-X', issues:[{code:'INVALID_PACK'}, {code:'OTHER'}]});
  });

  it('does not change the active pack or the candidate', () => {
    const candidate = withoutRetake();
    const activeCopy = structuredClone(ACTIVE);
    const candidateCopy = structuredClone(candidate);
    decideRulePackActivation(request(candidate));
    expect(ACTIVE).toEqual(activeCopy);
    expect(candidate).toEqual(candidateCopy);
  });
});

describe('RULE-EXC-01 a ※ clause missing from the candidate', () => {
  it('passes the contract schema yet is held against the independent inventory', () => {
    const candidate = withoutRetake();
    expect(AcademicRulePackVNextSchema.safeParse(candidate).success).toBe(true);
    const result = decideRulePackActivation(request(candidate));
    expect(result.decision).toBe('HELD');
    expect(result.active).toBe(ACTIVE);
    expect(result.issues).toEqual([{code:'CLAUSE_MISSING', sourceClauseId:RETAKE}]);
  });

  it('holds a ※ exception recorded as an ordinary rule', () => {
    const candidate = pack({clauseInventory:clauses().map(clause => clause.clauseId === RETAKE ? {...clause, kind:'RULE'} : clause),
      requirements:requirements().map(req => req.id === 'REQ-CORE'
        ? {...req, sourceClauseIds:['CL-RULE-CORE', RETAKE], exceptionClauseIds:[]}
        : req)});
    expect(AcademicRulePackVNextSchema.safeParse(candidate).success).toBe(true);
    expect(decideRulePackActivation(request(candidate)).issues).toContainEqual({code:'CLAUSE_MISSING', sourceClauseId:RETAKE});
  });

  it('holds a clause the original does not contain', () => {
    const candidate = pack({
      clauseInventory:[...clauses(), notApplicable('CL-INVENTED', 'FOOTNOTE')],
    });
    expect(decideRulePackActivation(request(candidate)).issues).toEqual([{code:'UNVERIFIED_ORIGINAL', sourceClauseId:'CL-INVENTED'}]);
  });

  it('holds a candidate built from another document', () => {
    const other = 'c'.repeat(64);
    const candidate = pack({sourceDocumentSha256:other,
      validationReport:{checkedAt:'2026-01-20T00:00:00.000Z', sourceDocumentSha256:other, blockingIssues:[]}});
    expect(decideRulePackActivation(request(candidate)).issues).toEqual([{code:'UNVERIFIED_ORIGINAL'}]);
  });
});

describe('RULE-EXC-02 이중전공 included, 부전공 excluded', () => {
  const minorWithoutRetake = () => pack({
    supersedesVersion:undefined, scope:minorScope,
    requirements:requirements().map(req => req.id === 'REQ-CORE' ? {...req, exceptionClauseIds:[]} : req),
    clauseInventory:clauses().map(clause => clause.clauseId === RETAKE ? notApplicable(RETAKE, 'EXCEPTION') : clause),
  });

  it('activates a 부전공 pack that marks the retake exception not applicable', () => {
    expect(decideRulePackActivation(request(minorWithoutRetake(), {active:null})).decision).toBe('ACTIVATED');
  });

  it('holds a 부전공 pack that applies the 이중전공-only exception', () => {
    const result = decideRulePackActivation(request(pack({supersedesVersion:undefined, scope:minorScope}), {active:null}));
    expect(result.decision).toBe('HELD');
    expect(result.active).toBeNull();
    expect(result.issues).toEqual([{code:'EXCEPTION_SCOPE_CONFLICT', sourceClauseId:RETAKE}]);
  });

  it('holds a 이중전공 pack that marks the exception not applicable', () => {
    const candidate = pack({
      requirements:requirements().map(req => req.id === 'REQ-CORE' ? {...req, exceptionClauseIds:[]} : req),
      clauseInventory:clauses().map(clause => clause.clauseId === RETAKE ? notApplicable(RETAKE, 'EXCEPTION') : clause),
    });
    expect(AcademicRulePackVNextSchema.safeParse(candidate).success).toBe(true);
    expect(decideRulePackActivation(request(candidate)).issues).toEqual([{code:'EXCEPTION_SCOPE_CONFLICT', sourceClauseId:RETAKE}]);
  });

  it('holds a role the clause neither includes nor excludes', () => {
    const primary = pack({
      supersedesVersion:undefined,
      scope:{...pack().scope, majorRole:'PRIMARY_MAJOR', secondaryMajor:undefined},
    });
    expect(decideRulePackActivation(request(primary, {active:null})).issues)
      .toEqual([{code:'UNKNOWN_APPLICABILITY', sourceClauseId:RETAKE}]);
  });
});

describe('RULE-EXC-03 retake exception for a 전필 taken under another classification', () => {
  it('holds an exception linked to a different requirement than the one it governs', () => {
    const candidate = pack({
      requirements:requirements().map(req => {
        if (req.id === 'REQ-CORE') return {...req, exceptionClauseIds:[]};
        if (req.id === 'REQ-EXAM') return {...req, exceptionClauseIds:[RETAKE]};
        return req;
      }),
      clauseInventory:clauses().map(clause => clause.clauseId === RETAKE ? linked(RETAKE, 'EXCEPTION', ['REQ-EXAM']) : clause),
    });
    expect(AcademicRulePackVNextSchema.safeParse(candidate).success).toBe(true);
    const result = decideRulePackActivation(request(candidate));
    expect(result.decision).toBe('HELD');
    expect(result.issues).toEqual([{code:'CLAUSE_MISSING', sourceClauseId:RETAKE}]);
  });

  it('holds a candidate that dropped the requirement a general exception governs', () => {
    const general = trusted({clauses:trusted().clauses.map(clause => clause.clauseId === RETAKE
      ? {clauseId:RETAKE, kind:'EXCEPTION', sourceSpanRef:`span-${RETAKE}`, appliesToSemanticKeys:['core-course']}
      : clause)});
    const candidate = pack({
      supersedesVersion:undefined,
      requirements:requirements().filter(req => req.id !== 'REQ-CORE'),
      clauseInventory:clauses().map(clause => clause.clauseId === 'CL-RULE-CORE' || clause.clauseId === RETAKE
        ? notApplicable(clause.clauseId, clause.kind)
        : clause),
    });
    expect(AcademicRulePackVNextSchema.safeParse(candidate).success).toBe(true);
    expect(decideRulePackActivation(request(candidate, {active:null, trustedOriginal:general})).issues)
      .toEqual([{code:'CLAUSE_MISSING', sourceClauseId:RETAKE}]);
  });
});

describe('RULE-EXC-04 numeric exact match does not approve missing exception coverage', () => {
  it('holds a 100% numeric match when the exception is missing', () => {
    const result = decideRulePackActivation(request(withoutRetake(), {numericCheck:{matched:4, total:4}}));
    expect(result.decision).toBe('HELD');
    expect(result.active).toBe(ACTIVE);
    expect(result.issues).toEqual([{code:'CLAUSE_MISSING', sourceClauseId:RETAKE}]);
  });

  it('holds a numeric mismatch even when every clause is covered', () => {
    expect(decideRulePackActivation(request(pack(), {numericCheck:{matched:3, total:4}})).issues)
      .toEqual([{code:'NUMERIC_SOURCE_MISMATCH'}]);
  });

  it('refuses an impossible numeric count', () => {
    expect(() => decideRulePackActivation(request(pack(), {numericCheck:{matched:5, total:4}}))).toThrow(/matched <= total/);
  });
});

describe('versions and time', () => {
  it('refuses to overwrite the active version in place', () => {
    const same = pack({version:'SYN-RULE-V1', supersedesVersion:undefined});
    expect(decideRulePackActivation(request(same)).issues).toEqual([{code:'VERSION_ALREADY_ACTIVE'}]);
  });

  it('holds a candidate that does not supersede the active pack', () => {
    expect(decideRulePackActivation(request(pack({supersedesVersion:'SYN-RULE-V0'}))).issues)
      .toEqual([{code:'SUPERSEDE_CHAIN_BROKEN'}]);
  });

  it('holds a candidate that moves a requirement id to another meaning', () => {
    const candidate = pack({requirements:requirements().map(req => req.id === 'REQ-EXAM' ? {...req, semanticKey:'renamed-exam'} : req)});
    expect(decideRulePackActivation(request(candidate)).issues).toEqual([{code:'SUPERSEDE_CHAIN_BROKEN'}]);
  });

  it('holds a first pack that claims to supersede something', () => {
    expect(decideRulePackActivation(request(pack(), {active:null})).issues).toEqual([{code:'SUPERSEDE_CHAIN_BROKEN'}]);
  });

  it('holds a pack approved after asOf', () => {
    const result = decideRulePackActivation(request(pack(), {asOf:'2026-01-25T00:00:00.000Z'}));
    // This asOf is also before effectiveFrom 2026-03-01.
    expect(result.issues).toEqual([{code:'NOT_APPROVED_BY_AS_OF'}, {code:'NOT_YET_EFFECTIVE'}]);
  });

  it('holds a pack that takes effect after asOf and keeps the active pack', () => {
    const result = decideRulePackActivation(request(pack({effectiveFrom:'2027-03-01T00:00:00.000Z'})));
    expect(result.decision).toBe('HELD');
    expect(result.active).toBe(ACTIVE);
    expect(result.issues).toEqual([{code:'NOT_YET_EFFECTIVE'}]);
  });

  it('activates a pack whose effectiveFrom equals asOf', () => {
    expect(decideRulePackActivation(request(pack({effectiveFrom:AS_OF}))).decision).toBe('ACTIVATED');
  });

  it('holds an expired pack and keeps the active pack', () => {
    const result = decideRulePackActivation(request(pack({effectiveUntil:'2026-10-01T00:00:00.000Z'})));
    expect(result.decision).toBe('HELD');
    expect(result.active).toBe(ACTIVE);
    expect(result.issues).toEqual([{code:'EXPIRED'}]);
  });

  it('treats effectiveUntil equal to asOf as expired', () => {
    expect(decideRulePackActivation(request(pack({effectiveUntil:AS_OF}))).issues).toEqual([{code:'EXPIRED'}]);
  });

  it('activates a pack whose effectiveUntil is after asOf', () => {
    expect(decideRulePackActivation(request(pack({effectiveUntil:'2026-11-01T00:00:00.001Z'}))).decision).toBe('ACTIVATED');
  });

  it('refuses a candidate for another scope than the active pack', () => {
    expect(() => decideRulePackActivation(request(pack({scope:minorScope})))).toThrow(/different scopes/);
  });

  it('refuses an inconsistent trusted inventory', () => {
    const bad = trusted({clauses:[{clauseId:RETAKE, kind:'EXCEPTION', sourceSpanRef:'span-x',
      includedMajorRoles:['MINOR'], excludedMajorRoles:['MINOR']}]});
    expect(() => decideRulePackActivation(request(pack(), {trustedOriginal:bad}))).toThrow(/both includes and excludes/);
  });
});
