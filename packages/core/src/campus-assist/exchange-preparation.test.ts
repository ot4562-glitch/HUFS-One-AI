import {describe,expect,it} from 'vitest';
import type {ExchangeApplicant,ExchangePolicy} from '@hufs-one/contracts';
import {evaluateExchange} from './exchange.js';
import {prepareExchangeApplication} from './exchange-preparation.js';

const AS_OF='2026-11-11T00:00:00Z';
const policy:ExchangePolicy={
  ruleId:'SYN-RULE',partnerId:'SYN-UNI-A',track:'OIA',
  sourceRevision:'SYN-OIA-R1',sourceUrl:'https://example.org/exchange/synthetic',
  publishedAt:'2026-01-01T00:00:00Z',verifiedAt:'2026-01-02T00:00:00Z',
  effectiveFrom:'2026-01-01',rights:'APPROVED',provenance:'SYNTHETIC',
  minimumGpa:3.0,partnerMinimumGpa:3.0,
  termRules:{one:{ENROLLED:{min:2,max:5},LEAVE:{min:6,max:6}},
    two:{ENROLLED:{min:2,max:4},LEAVE:{min:5,max:5}}},
  twoSemesterTransfersAllowed:false,priorCancellationAllowed:false,
  requiredLanguage:{test:'TOEFL',minimumScore:80},
};
const applicant:ExchangeApplicant={
  duration:1,track:'OIA',status:'ENROLLED',completedSemesters:3,
  previousCancellation:'CLEAR',transfer:false,gpa:3.5,
  departureOn:'2027-03-01',language:{test:'TOEFL',score:94,expiresOn:'2027-07-01'},
};
const make=(student:ExchangeApplicant=applicant,rule:ExchangePolicy|null=policy)=>
  evaluateExchange(student,rule,AS_OF);
const prepare=(result=make(),partner=policy,at=AS_OF)=>
  prepareExchangeApplication({partner,result,expectedAsOf:at});

describe('#340 offline exchange preparation does not invent official admissions',()=>{
  it('only marks an all-pass self-declared comparison ready for human verification',()=>{
    const x=prepare();
    expect(x.state).toBe('READY_FOR_OFFICIAL_REVIEW');
    expect(x.steps).toHaveLength(7);
    expect(x.steps.map(r=>r.code)).toEqual([
      'TRACK','GPA','SEMESTERS','TRANSFER','CANCELLATION','PARTNER_GPA','LANGUAGE']);
    expect(x.steps.find(r=>r.code==='GPA')).toMatchObject({
      state:'REVIEW_READY',dataStatus:'SELF_REPORTED',
    });
    expect(x.steps.find(r=>r.code==='TRACK')?.dataStatus).toBe('POLICY_SCOPE');
    expect(x.officialDeadlineKnown).toBe(false);
    expect(x.automaticApplication).toBe(false);
    expect(x.officialAdmissionDecision).toBe(false);
    expect(x.officialSourceUrl).toBe(policy.sourceUrl);
  });
  it('missing GPA/semester/language evidence never becomes a false failure or pass',()=>{
    const x=prepare(make({...applicant,gpa:undefined,completedSemesters:undefined,
      language:undefined}));
    expect(x.state).toBe('NEEDS_EVIDENCE');
    for(const code of ['GPA','SEMESTERS','PARTNER_GPA','LANGUAGE']){
      expect(x.steps.find(s=>s.code===code)).toMatchObject({
        state:'NEEDS_EVIDENCE',dataStatus:'MISSING',
      });
    }
  });
  it('identified GPA/transfer failures keep explicit blockers without inferring acceptance',()=>{
    const x=prepare(make({...applicant,gpa:2.4,duration:2,transfer:true}));
    expect(x.state).toBe('HAS_BLOCKERS');
    expect(x.steps.find(s=>s.code==='GPA')?.state).toBe('CONDITION_BLOCKER');
    expect(x.steps.find(s=>s.code==='TRANSFER')?.state).toBe('CONDITION_BLOCKER');
    expect(x.steps.find(s=>s.code==='TRANSFER')?.dataStatus).toBe('SELF_REPORTED');
  });
  it('one-semester transfer exception remains not-applicable, not a failure',()=>{
    const x=prepare();
    expect(x.steps.find(s=>s.code==='TRANSFER')?.state).toBe('NOT_APPLICABLE');
    expect(x.steps.find(s=>s.code==='TRANSFER')?.dataStatus).toBe('NOT_APPLICABLE');
  });
  it('does not expose an old official source link when its revision mismatches',()=>{
    const x=prepare(make(),{...policy,sourceRevision:'SYN-NEW-R2'});
    expect(x).toMatchObject({state:'STALE_POLICY',officialSourceUrl:null,
      sourceRevision:null,steps:[]});
  });
  it('quarantines a date receipt from a different query even with matching policy',()=>{
    const x=prepare(make(),policy,'2026-11-11T00:00:01Z');
    expect(x.state).toBe('STALE_POLICY');
    expect(x.steps).toEqual([]);
  });
  it('treats the same timestamp in another time zone as one asOf instant',()=>{
    const x=prepare(make(),policy,'2026-11-11T09:00:00+09:00');
    expect(x.state).toBe('READY_FOR_OFFICIAL_REVIEW');
  });
  it('quarantines a missing approved policy rather than generating a checklist',()=>{
    const x=prepare(make(applicant,null));
    expect(x.state).toBe('STALE_POLICY');
    expect(x.officialSourceUrl).toBeNull();
  });
  it('quarantines a duplicated condition ID even with otherwise passing status',()=>{
    const result=make(),checks=[...result.checks];
    checks[1]={...checks[0]!};
    const x=prepare({...result,checks});
    expect(x.state).toBe('STALE_POLICY');
    expect(x.steps).toHaveLength(0);
  });
  it('quarantines a condition attached to a superseded source revision',()=>{
    const result=make(),checks=result.checks.map((c,i)=>i===0
      ?{...c,sourceRevision:'SYN-OLD'}:c);
    expect(prepare({...result,checks}).state).toBe('STALE_POLICY');
  });
  it.each([
    ['missing graduation term',{completedSemesters:undefined}],
    ['unknown enrollment state',{status:'UNKNOWN' as const}],
    ['unverified cancellation',{previousCancellation:'UNKNOWN' as const}],
    ['missing departure date',{departureOn:undefined}],
    ['unknown academic score',{gpa:undefined}],
  ])('self-reported %s always needs evidence',(_label,change)=>{
    expect(prepare(make({...applicant,...change})).state).toBe('NEEDS_EVIDENCE');
  });
});
