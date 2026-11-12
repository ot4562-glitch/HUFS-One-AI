import {describe,expect,it} from 'vitest';
import {checkScholarship} from './scholarships-v2.js';
import {FIXED_NOW,FACT_REVISIONS,scholarship,condition,fact,source}
  from './v2.fixtures.js';

/** Deterministic fictional oracles; not independent student or institution Gold. */
const gpas=[
  0,1.0,2.0,2.5,2.99,3.0,3.01,3.2,3.3,3.39,3.4,3.45,
  3.48,3.49,3.499,3.5,3.5001,3.51,3.55,3.6,3.7,3.8,4.0,4.5,
];
const check=(input:{
  facts?:ReturnType<typeof fact>[];policy?:ReturnType<typeof scholarship>;
  revisions?:ReadonlySet<string>;asOf?:string;
}={})=>checkScholarship({
  policy:input.policy??scholarship(),
  verifiedFacts:input.facts??[fact()],
  authorizedFactRevisions:input.revisions??FACT_REVISIONS,
  asOf:input.asOf??FIXED_NOW,
});

describe('#343 scholarship minimum GPA synthetic 24-case independent expected decision table',()=>{
  it.each(gpas)('GPA %s does not bypass inclusive 3.50 rule',value=>{
    const r=check({facts:[fact(value)]});
    expect(r.overall).toBe(value>=3.5?'MET':'NOT_MET');
    expect(r.groups[0]?.conditions[0]?.state).toBe(value>=3.5?'MET':'NOT_MET');
    expect(r.officialDecision).toBeNull();
    expect(r.mode).toBe('VERIFIED_FACT_CHECK');
    expect(r.ruleRevisionId).toBe('source-r1');
  });
});

describe('#343 unknown/rights/period source gating never upgrades self-report to eligibility',()=>{
  it('missing grade record remains UNKNOWN with an explicit missing key',()=>{
    const r=check({facts:[]});
    expect(r.overall).toBe('UNKNOWN');
    expect(r.missingFactKeys).toContain('gpa');
    expect(r.officialDecision).toBeNull();
  });
  it('self-declared GPA never proves a verified official grade, even at 4.50',()=>{
    const r=check({facts:[fact(4.5,{provenance:'OWNER_SELF_REPORTED'})]});
    expect(r.overall).toBe('UNKNOWN');
  });
  it('a fact with an unapproved revision never becomes MET',()=>{
    const r=check({facts:[fact(4.0,{sourceRevisionId:'SYN-REVOKED'})]});
    expect(r.overall).toBe('UNKNOWN');
  });
  it('a fact from a different academic term remains UNKNOWN',()=>{
    const r=check({facts:[fact(4.0,{academicTerm:'2025-1'})]});
    expect(r.overall).toBe('UNKNOWN');
  });
  it('an observation made after asOf is not eligible for earlier eligibility proof',()=>{
    const r=check({facts:[fact(4.0,{observedAt:'2026-12-01T00:00:00Z'})]});
    expect(r.overall).toBe('UNKNOWN');
  });
  it('conflicting newest GPA records are never arbitrarily selected',()=>{
    const r=check({facts:[fact(3.4),fact(4.3)]});
    expect(r.overall).toBe('UNKNOWN');
  });
  it('a revoked policy never leaks an OPEN application window',()=>{
    const r=check({policy:scholarship({source:{...source(),status:'REVOKED'}})});
    expect(r).toMatchObject({mode:'NOT_AVAILABLE',overall:'UNKNOWN',
      applicationWindow:'UNKNOWN',officialDecision:null,groups:[]});
  });
  it('a blocked policy never reveals application dates from an unapproved source',()=>{
    const r=check({policy:scholarship({source:{...source(),rights:'BLOCKED'}})});
    expect(r.applicationWindow).toBe('UNKNOWN');
    expect(r.sourceReason).not.toBe('VERIFIED');
  });
  it('a policy whose evidence source span is unapproved does not pass',()=>{
    const p=scholarship({groups:[{id:'required',join:'ALL',
      conditions:[condition({sourceSpanId:'UNVERIFIED-SPAN'})]}]});
    const r=check({policy:p});
    expect(r.overall).toBe('UNKNOWN');
    expect(r.missingFactKeys).toContain('gpa');
  });
  it('duplicate required condition identities cannot pass every check',()=>{
    const p=scholarship({groups:[{id:'required',join:'ALL',
      conditions:[condition(),condition()]}]});
    const r=check({policy:p});
    expect(r.overall).toBe('UNKNOWN');
    expect(r.groups[0]?.conditions[1]?.reason).toBe('DUPLICATE_CONDITION_ID');
  });
  it('a known hard failure wins over missing other required evidence',()=>{
    const p=scholarship({groups:[{id:'required',join:'ALL',conditions:[
      condition(),condition({id:'other-rule',factKey:'unknown-other',sourceSpanId:'span-2'}),
    ]}]});
    const r=check({policy:p,facts:[fact(3.49)]});
    expect(r.overall).toBe('NOT_MET');
  });
  it('a known verified campus matches a campus-scoped TEXT_IN condition',()=>{
    const p=scholarship({groups:[{id:'required',join:'ALL',conditions:[
      condition({id:'campus',factKey:'campus',op:'TEXT_IN',
        expected:['SEOUL','GLOBAL'],sourceSpanId:'span-2'}),
    ]}]});
    const r=check({policy:p,facts:[fact('SEOUL',{key:'campus'})]});
    expect(r.overall).toBe('MET');
    expect(r.officialDecision).toBeNull();
  });
  it('disallowed campus is a hard failure only with a verified fact',()=>{
    const p=scholarship({groups:[{id:'required',join:'ALL',conditions:[
      condition({id:'campus',factKey:'campus',op:'TEXT_IN',
        expected:['SEOUL'],sourceSpanId:'span-2'}),
    ]}]});
    expect(check({policy:p,facts:[fact('GLOBAL',{key:'campus'})]}).overall)
      .toBe('NOT_MET');
    expect(check({policy:p,facts:[fact('GLOBAL',{
      key:'campus',provenance:'OWNER_SELF_REPORTED'})]}).overall).toBe('UNKNOWN');
  });
  it('does not infer a definitive deadline when policy declares no application dates',()=>{
    const r=check({policy:scholarship({opensAt:undefined,closesAt:undefined})});
    expect(r.applicationWindow).toBe('UNKNOWN');
    expect(r.officialDecision).toBeNull();
  });
});
