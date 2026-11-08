import {describe,expect,it} from 'vitest';
import type {ExchangeApplicant,ExchangePolicy} from '@hufs-one/contracts';
import {evaluateExchange} from './exchange.js';
const NOW='2026-06-01T00:00:00Z';
const policy:ExchangePolicy={
  ruleId:'SYN-OIA',sourceRevision:'SYN-POLICY-1',sourceUrl:'https://example.org/synthetic-exchange',
  track:'OIA',publishedAt:'2025-01-01T00:00:00Z',verifiedAt:'2025-01-02T00:00:00Z',
  effectiveFrom:'2025-01-01',rights:'APPROVED',provenance:'SYNTHETIC',
  minimumGpa:3,partnerMinimumGpa:3,partnerId:'SYN-UNI-A',
  termRules:{one:{ENROLLED:{min:2,max:5},LEAVE:{min:6,max:6}},
    two:{ENROLLED:{min:2,max:4},LEAVE:{min:5,max:5}}},
  twoSemesterTransfersAllowed:false,priorCancellationAllowed:false,
  requiredLanguage:{test:'TOEFL',minimumScore:80},
};
const applicant:ExchangeApplicant={
  duration:1,track:'OIA',status:'ENROLLED',completedSemesters:3,gpa:3.2,
  transfer:false,previousCancellation:'CLEAR',
  language:{test:'TOEFL',score:90,expiresOn:'2027-01-01'},departureOn:'2026-09-01',
};
describe('deterministic exchange checks (#340)',()=>{
  const cases:{name:string;change:Record<string,unknown>;policy?:Record<string,unknown>;
    check?:string;status?:string;overall:string}[]=[
    {name:'baseline 1-semester',change:{},overall:'PASS'},
    {name:'GPA lower than 3.0',change:{gpa:2.99},check:'GPA',status:'FAIL',overall:'FAIL'},
    {name:'GPA exactly 3.0',change:{gpa:3.0},overall:'PASS'},
    {name:'unknown GPA',change:{gpa:undefined},check:'GPA',status:'UNKNOWN',overall:'UNKNOWN'},
    {name:'one completed semester',change:{completedSemesters:1},check:'SEMESTERS',status:'FAIL',overall:'FAIL'},
    {name:'two completed semesters',change:{completedSemesters:2},overall:'PASS'},
    {name:'five completed semesters 1 semester program',change:{completedSemesters:5},overall:'PASS'},
    {name:'six completed semesters enrolled 1 semester program',change:{completedSemesters:6},check:'SEMESTERS',status:'FAIL',overall:'FAIL'},
    {name:'six completed semesters on leave 1 semester program',change:{completedSemesters:6,status:'LEAVE'},overall:'PASS'},
    {name:'not an eligible leave semester',change:{completedSemesters:5,status:'LEAVE'},check:'SEMESTERS',status:'FAIL',overall:'FAIL'},
    {name:'two-semester 4 completed',change:{duration:2,completedSemesters:4},overall:'PASS'},
    {name:'two-semester 5 enrolled',change:{duration:2,completedSemesters:5},check:'SEMESTERS',status:'FAIL',overall:'FAIL'},
    {name:'two-semester 5 completed on leave',change:{duration:2,completedSemesters:5,status:'LEAVE'},overall:'PASS'},
    {name:'two-semester 6 completed on leave',change:{duration:2,completedSemesters:6,status:'LEAVE'},check:'SEMESTERS',status:'FAIL',overall:'FAIL'},
    {name:'two-semester transfer not permitted',change:{duration:2,transfer:true},check:'TRANSFER',status:'FAIL',overall:'FAIL'},
    {name:'two-semester transfer unknown',change:{duration:2,transfer:undefined},check:'TRANSFER',status:'UNKNOWN',overall:'UNKNOWN'},
    {name:'cancelled earlier program',change:{previousCancellation:'CANCELLED'},check:'CANCELLATION',status:'FAIL',overall:'FAIL'},
    {name:'unverified prior cancellation',change:{previousCancellation:'UNKNOWN'},check:'CANCELLATION',status:'UNKNOWN',overall:'UNKNOWN'},
    {name:'language score insufficient',change:{language:{test:'TOEFL',score:79,expiresOn:'2027-01-01'}},check:'LANGUAGE',status:'FAIL',overall:'FAIL'},
    {name:'wrong language test',change:{language:{test:'IELTS',score:99,expiresOn:'2027-01-01'}},check:'LANGUAGE',status:'FAIL',overall:'FAIL'},
    {name:'expired before departure',change:{language:{test:'TOEFL',score:95,expiresOn:'2026-08-31'}},check:'LANGUAGE',status:'FAIL',overall:'FAIL'},
    {name:'departure date missing',change:{departureOn:undefined},check:'LANGUAGE',status:'UNKNOWN',overall:'UNKNOWN'},
    {name:'score missing',change:{language:undefined},check:'LANGUAGE',status:'UNKNOWN',overall:'UNKNOWN'},
    {name:'partner GPA stricter',change:{},policy:{partnerMinimumGpa:4.0},check:'PARTNER_GPA',status:'FAIL',overall:'FAIL'},
    {name:'partner condition unavailable',change:{},policy:{partnerMinimumGpa:undefined},check:'PARTNER_GPA',status:'UNKNOWN',overall:'UNKNOWN'},
    {name:'partner language unpublished',change:{},policy:{requiredLanguage:undefined},check:'LANGUAGE',status:'UNKNOWN',overall:'UNKNOWN'},
    {name:'wrong selection track',change:{track:'DEPARTMENT'},check:'TRACK',status:'UNKNOWN',overall:'UNKNOWN'},
    {name:'unverified school year',change:{status:'UNKNOWN'},check:'SEMESTERS',status:'UNKNOWN',overall:'UNKNOWN'},
    {name:'semester rule missing in policy',change:{},policy:{termRules:undefined},check:'SEMESTERS',status:'UNKNOWN',overall:'UNKNOWN'},
    {name:'transfer rule missing in policy',change:{duration:2},policy:{twoSemesterTransfersAllowed:undefined},check:'TRANSFER',status:'UNKNOWN',overall:'UNKNOWN'},
    {name:'prior cancellation rule missing',change:{},policy:{priorCancellationAllowed:undefined},check:'CANCELLATION',status:'UNKNOWN',overall:'UNKNOWN'},
    {name:'prior cancellation allowed in policy',change:{previousCancellation:'CANCELLED'},policy:{priorCancellationAllowed:true},overall:'PASS'},
  ];
  it.each(cases)('$name',({change,policy:override,check,status,overall})=>{
    const clean=(value:Record<string,unknown>)=>Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined));
    const actual=evaluateExchange(clean({...applicant,...change}) as ExchangeApplicant,
      clean({...policy,...override}) as ExchangePolicy,NOW);
    expect(actual.result).toBe(overall);
    if(check)expect(actual.checks.find(x=>x.code===check)?.status).toBe(status);
    expect(actual.disclaimer).toContain('공식 지원 자격');
  });
  it('fails closed if policy revoked, future, expired or absent',()=>{
    for(const other of [null,{...policy,rights:'REVOKED' as const},
      {...policy,verifiedAt:'2027-01-01T00:00:00Z'},
      {...policy,effectiveUntil:'2025-12-31'}]){
      const r=evaluateExchange(applicant,other,NOW);
      expect(r.result).toBe('UNKNOWN');
      expect(r.checks.every(c=>c.status==='UNKNOWN')).toBe(true);
    }
  });
});
