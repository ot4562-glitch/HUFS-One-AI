import {it,expect} from 'vitest';
import type {ActivityRecord} from '@hufs-one/contracts';
import {evaluateActivityOrigins,type ActivityEvaluationInput,type ActivityOutcome} from './activity-rolling-origin.js';
const subject={organizationId:'SYN-DEPT',seriesId:'SYN-ANNUAL'};
function row(year:number,day='03-07',patch:Partial<ActivityRecord>={}):ActivityRecord{
  return {entryId:'SYN-E-'+year,sourceId:'SYN-S-'+year,revisionId:'SYN-R-'+year,...subject,
    title:'합성 연례 행사',kind:'ORIENTATION',campus:'SEOUL',publishedAt:year+'-02-01T00:00:00Z',
    verifiedAt:year+'-02-02T00:00:00Z',eventDate:year+'-'+day,sourceUrl:'https://synthetic.invalid/'+year,
    status:'CONFIRMED',rights:'APPROVED',provenance:'SYNTHETIC',...patch};
}
function gold(year:number,patch:Partial<ActivityOutcome>={}):ActivityOutcome{
  return {outcomeId:'SYN-G-'+year,revisionId:'SYN-GR-'+year,...subject,targetYear:year,outcome:'HELD',
    eventDate:year+'-03-09',verifiedAt:year+'-04-01T00:00:00Z',rights:'APPROVED',
    review:'HUMAN_VERIFIED',provenance:'SYNTHETIC',...patch};
}
function input():ActivityEvaluationInput{return {datasetKind:'SYNTHETIC',truthAsOf:'2027-06-01T00:00:00Z',
  subjects:[subject],records:[row(2023),row(2024,'03-11'),row(2025,'03-09'),row(2026,'03-10')],
  origins:[{asOf:'2026-01-01T00:00:00Z',targetYear:2026},{asOf:'2027-01-01T00:00:00Z',targetYear:2027}],
  outcomes:[gold(2026),gold(2027)]};}
it('uses the production outlook and exact previous-year baseline on identical held-out targets',()=>{
  const report=evaluateActivityOrigins(input());expect(report.status).toBe('READY');
  expect(report.total).toMatchObject({scored:2,methods:{OUTLOOK:{answered:2,heldCovered:2},
    PREVIOUS_YEAR:{answered:2,heldCovered:1,totalMidpointAbsoluteErrorDays:1}},paired:{items:2}});
  expect(report.origins[0]!.cases[0]).toMatchObject({outlook:{state:'PREDICTED',confidence:'MEDIUM',observedYears:[2023,2024,2025]},
    previousYear:{date:'2026-03-09',evidenceRefs:['SYN-R-2025']}});
  expect(report).toMatchObject({reviewAssurance:'DECLARED_REVIEW_ONLY',independentAcceptance:'NOT_RUN',releaseEligible:false});
});
it('never leaks later postings, later verification or later source corrections into an origin',()=>{
  const request=input(),baseline=evaluateActivityOrigins(request);
  request.records.push(row(2025,'09-01',{revisionId:'SYN-LATE',publishedAt:'2027-02-01T00:00:00Z',verifiedAt:'2027-02-02T00:00:00Z'}),
    row(2026,'09-02',{sourceId:'SYN-DELAY',publishedAt:'2025-12-01T00:00:00Z',verifiedAt:'2027-02-02T00:00:00Z'}));
  expect(evaluateActivityOrigins(request).origins).toEqual(baseline.origins);
});
it('counts 0/1 years as withheld, two as LOW and three as MEDIUM, without hiding baseline answers',()=>{
  const request=input();request.records=[row(2023),row(2024),row(2025)];request.truthAsOf='2026-06-01T00:00:00Z';
  request.origins=[2023,2024,2025,2026].map(targetYear=>({targetYear,asOf:targetYear+'-01-01T00:00:00Z'}));
  request.outcomes=[2023,2024,2025,2026].map(y=>gold(y));
  const report=evaluateActivityOrigins(request);
  expect(report.origins.map(o=>o.cases[0]!.outlook.confidence)).toEqual(['NONE','NONE','LOW','MEDIUM']);
  expect(report.total.methods.OUTLOOK).toMatchObject({answered:2,abstained:2});
  expect(report.total.methods.PREVIOUS_YEAR).toMatchObject({answered:3,abstained:1});
  expect(report.total.paired.items).toBe(2);
});
it('does not substitute the latest available year for a missing previous year, and maps leap day safely',()=>{
  const request=input();request.records=[row(2024,'02-29')];request.origins=[{asOf:'2025-01-01T00:00:00Z',targetYear:2025},
    {asOf:'2026-01-01T00:00:00Z',targetYear:2026}];request.outcomes=[gold(2025),gold(2026)];
  const report=evaluateActivityOrigins(request);
  expect(report.origins[0]!.cases[0]!.previousYear).toMatchObject({state:'PREDICTED',date:'2025-02-28'});
  expect(report.origins[1]!.cases[0]!.previousYear).toEqual({state:'ABSTAIN',evidenceRefs:[]});
});
it('counts windows on cancelled held-out events, and excludes already published confirmations/cancellations',()=>{
  const request=input();request.outcomes=[gold(2026,{outcome:'CANCELLED',eventDate:undefined}),gold(2027)];
  const report=evaluateActivityOrigins(request);expect(report.total.methods.OUTLOOK.cancelledWindows).toBe(1);
  expect(report.total.methods.PREVIOUS_YEAR.cancelledWindows).toBe(1);
  request.records.push(row(2026,'03-10',{publishedAt:'2025-12-01T00:00:00Z',verifiedAt:'2025-12-02T00:00:00Z',status:'CANCELLED'}));
  expect(evaluateActivityOrigins(request).origins[0]).toMatchObject({alreadyKnown:1,scored:0});
});
it('keeps missing, pending, future, withdrawn and conflicting Gold out of the denominator',()=>{
  for(const patch of [{review:'PENDING' as const},{rights:'REVOKED' as const},{outcome:'UNKNOWN' as const},
    {verifiedAt:'2028-01-01T00:00:00Z'}]){
    const request=input();request.outcomes=[gold(2026,patch)];
    expect(evaluateActivityOrigins(request).total).toMatchObject({scored:0,truthUnavailable:2});
  }
  const request=input();request.outcomes=[gold(2026),gold(2026,{revisionId:'SYN-REVOKED',verifiedAt:'2026-05-01T00:00:00Z',rights:'REVOKED'})];
  expect(evaluateActivityOrigins(request).total.scored).toBe(0);
  request.outcomes=[gold(2026),gold(2026,{eventDate:'2026-03-10'})];
  expect(evaluateActivityOrigins(request).total).toMatchObject({scored:0,truthConflicting:1});
});
it('excludes independently known outcomes or already-held events and requires two scored origins',()=>{
  const request=input();request.origins=[{asOf:'2026-03-10T00:00:00Z',targetYear:2026}];
  let report=evaluateActivityOrigins(request);expect(report.total.alreadyKnown).toBe(1);expect(report.status).toBe('INSUFFICIENT_DATA');
  request.origins=[{asOf:'2026-01-01T00:00:00Z',targetYear:2026}];
  request.outcomes=[gold(2026,{outcome:'CANCELLED',eventDate:undefined,verifiedAt:'2025-12-01T00:00:00Z'})];
  report=evaluateActivityOrigins(request);expect(report.total.alreadyKnown).toBe(1);
});
it('deduplicates reposts and retains historical revocation/correction behavior on both methods',()=>{
  const request=input();request.records.push(row(2025,'03-09',{sourceId:'SYN-REPOST',revisionId:'SYN-REPOST-R',
    publishedAt:'2025-03-01T00:00:00Z',verifiedAt:'2025-03-02T00:00:00Z'}));
  let report=evaluateActivityOrigins(request);expect(report.origins[0]!.cases[0]!.outlook.observedYears).toEqual([2023,2024,2025]);
  request.records.push(row(2025,'03-09',{sourceId:'SYN-REPOST',revisionId:'SYN-REPOST-REVOKED',rights:'REVOKED',
    publishedAt:'2025-04-01T00:00:00Z',verifiedAt:'2025-04-02T00:00:00Z'}),row(2025,'03-09',{revisionId:'SYN-REVOKED',rights:'REVOKED',
    publishedAt:'2025-04-01T00:00:00Z',verifiedAt:'2025-04-02T00:00:00Z'}));
  report=evaluateActivityOrigins(request);expect(report.origins[0]!.cases[0]!.outlook.observedYears).toEqual([2023,2024]);
  expect(report.origins[0]!.cases[0]!.previousYear.state).toBe('ABSTAIN');
});
it('does not turn an independently known cancellation into a held-out label after a later Gold revision',()=>{
  const request=input();request.outcomes=[gold(2026,{outcome:'CANCELLED',eventDate:undefined,verifiedAt:'2025-12-01T00:00:00Z'}),
    gold(2026,{outcome:'CANCELLED',eventDate:undefined,revisionId:'SYN-G-REVISED',verifiedAt:'2026-04-01T00:00:00Z'})];
  expect(evaluateActivityOrigins(request).origins[0]).toMatchObject({alreadyKnown:1,scored:0});
});
it('is deterministic under input permutations and rejects duplicate origins, subjects, mixed provenance and time reversal',()=>{
  const request=input(),a=evaluateActivityOrigins(request);request.records.reverse();request.outcomes.reverse();request.origins.reverse();
  expect(evaluateActivityOrigins(request)).toEqual(a);
  for(const change of [(r:ActivityEvaluationInput)=>{r.origins.push(r.origins[0]!);},
    (r:ActivityEvaluationInput)=>{r.subjects.push(subject);},
    (r:ActivityEvaluationInput)=>{r.records[0]!.provenance='REAL_APPROVED';},
    (r:ActivityEvaluationInput)=>{r.truthAsOf='2025-01-01T00:00:00Z';}]){
    const bad=input();change(bad);expect(()=>evaluateActivityOrigins(bad)).toThrow();
  }
});
