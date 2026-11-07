import {describe,expect,it} from 'vitest';
import {compareReviewedOpportunityRevisionClaims} from '@hufs-one/contracts';
import {verifiedOwnerReportStatus,verifiedOwnerRevisionComparison}
  from './opportunityEvidence.js';

const asOf='2026-11-07T13:00:00Z';
const previous='2026-11-06T13:00:00Z';
const expected={opportunityId:'opp-1',sourceId:'source-1',
  sourceRevisionId:'rev-new',permissionRef:'owner-granted-1'};
const old={
  revisionId:'rev-old',sourceId:'source-1',opportunityId:'opp-1',
  capturedAt:previous,checkedAt:previous,verifiedAt:previous,
  contentSha256:'a'.repeat(64),dataMode:'REAL',deliveryMode:'LIVE',
  claims:[{field:'DEADLINE',value:{kind:'FIXED',at:'2026-11-15T00:00:00Z'},
    evidenceRefs:['source-para-1']},
    {field:'STATUS',value:'OPEN',evidenceRefs:['source-para-2']},
    {field:'ELIGIBILITY',value:[],evidenceRefs:['source-para-3']}],
} as const;
const newer={...old,revisionId:'rev-new',capturedAt:asOf,checkedAt:asOf,verifiedAt:asOf,
  contentSha256:'b'.repeat(64),
  claims:[{field:'DEADLINE',value:{kind:'FIXED',at:'2026-11-20T00:00:00Z'},
    evidenceRefs:['source-para-4']},
    {field:'STATUS',value:'CANCELLED',evidenceRefs:['source-para-5']},
    {field:'ELIGIBILITY',value:[],evidenceRefs:['source-para-6']}],
} as const;
const before=JSON.parse(JSON.stringify(old)),after=JSON.parse(JSON.stringify(newer));
const diff=compareReviewedOpportunityRevisionClaims(before,after);
const context={opportunityId:'opp-1',asOf,available:true,
  beforeRevisionId:'rev-old',afterRevisionId:'rev-new'};
const response={opportunityId:'opp-1',asOf,beforeRevisionId:'rev-old',
  afterRevisionId:'rev-new',state:'READY',before,after,...diff};
describe('#317 authorized owner report and independently reviewed changes',()=>{
  it('never assigns another user/source/rights report to this owner',()=>{
    const valid={opportunityId:'opp-1',sourceRevisionId:'rev-new',
      permissionRef:'owner-granted-1',state:'UNDER_REVIEW',
      checkedAt:asOf,reportedAt:previous};
    expect(verifiedOwnerReportStatus(valid,expected).state).toBe('UNDER_REVIEW');
    expect(()=>verifiedOwnerReportStatus({...valid,opportunityId:'opp-2'},expected)).toThrow();
    expect(()=>verifiedOwnerReportStatus({...valid,permissionRef:'other-owner'},expected)).toThrow();
    expect(()=>verifiedOwnerReportStatus({...valid,sourceRevisionId:'stale'},expected)).toThrow();
    expect(()=>verifiedOwnerReportStatus({...valid,reportedAt:'2026-11-09T00:00:00Z'},expected)).toThrow();
  });
  it('renders before/after only from two independently reviewed real revisions',()=>{
    expect(verifiedOwnerRevisionComparison(context,response,expected)).toMatchObject({
      state:'READY',changes:[{field:'DEADLINE',kind:'EXTENDED'},{field:'STATUS',kind:'CANCELLED'}],
      comparisons:[{field:'DEADLINE',state:'CHANGED'}, {field:'STATUS',state:'CHANGED'},
        {field:'ELIGIBILITY',state:'UNCHANGED'}],
    });
    expect(verifiedOwnerRevisionComparison({...context,available:false},response,expected)).toBeNull();
    expect(verifiedOwnerRevisionComparison({...context,afterRevisionId:'rev-obsolete'},response,expected)).toBeNull();
    expect(()=>verifiedOwnerRevisionComparison(context,{...response,
      after:{...after,sourceId:'different-source'}},expected)).toThrow();
    expect(()=>verifiedOwnerRevisionComparison(context,{...response,
      after:{...after,dataMode:'SYNTHETIC'},before:{...before,dataMode:'SYNTHETIC'}},expected)).toThrow();
    expect(()=>verifiedOwnerRevisionComparison(context,{...response,
      changes:[]},expected)).toThrow();
  });
  it('preserves UNKNOWN instead of claiming a missing fact was changed',()=>{
    const noDate={...after,claims:after.claims.filter((c:{field:string})=>c.field!=='DEADLINE')};
    const unknown=compareReviewedOpportunityRevisionClaims(before,noDate);
    expect(unknown.comparisons[0]).toEqual({field:'DEADLINE',state:'UNKNOWN'});
    expect(unknown.changes.some(c=>c.field==='DEADLINE')).toBe(false);
    expect(verifiedOwnerRevisionComparison(context,{
      ...response,after:noDate,...unknown,
    },expected)).toMatchObject({state:'READY'});
  });
});
