import {describe,expect,it} from 'vitest';
import {OpportunityRevisionComparisonRequestSchema,OpportunityRevisionComparisonResponseSchema}
  from '../../packages/contracts/src/self/opportunity-revision-comparison.js';

const asOf='2026-11-01T00:00:00.000Z';
const binding={opportunityId:'opp1',beforeRevisionId:'rev1',afterRevisionId:'rev2',asOf};
function ready(){
  const revision={sourceId:'s1',opportunityId:'opp1',capturedAt:'2026-10-20T00:00:00Z',
    checkedAt:'2026-10-31T00:00:00Z',verifiedAt:'2026-10-30T00:00:00Z',
    contentSha256:'a'.repeat(64),dataMode:'SYNTHETIC',deliveryMode:'REPLAY',
    claims:[{field:'STATUS',value:'OPEN',evidenceRefs:['ev1']}]};
  return {...binding,state:'READY',before:{...revision,revisionId:'rev1'},
    after:{...revision,revisionId:'rev2',capturedAt:'2026-10-25T00:00:00Z'},
    comparisons:[{field:'DEADLINE',state:'UNKNOWN'},{field:'STATUS',state:'UNCHANGED'},
      {field:'ELIGIBILITY',state:'UNKNOWN'}],changes:[]};
}
describe('#119 strict reviewed revision comparison contract',()=>{
  it('accepts exact pairs, READY reviewed values, and content-free review results',()=>{
    expect(OpportunityRevisionComparisonRequestSchema.safeParse({
      beforeRevisionId:'rev1',afterRevisionId:'rev2',asOf}).success).toBe(true);
    expect(OpportunityRevisionComparisonResponseSchema.safeParse(ready()).success).toBe(true);
    expect(OpportunityRevisionComparisonResponseSchema.safeParse({...binding,
      state:'NEEDS_REVIEW',reason:'REVISION_CONFLICT'}).success).toBe(true);
  });
  it('rejects browser authority, raw originals, links and unapproved values',()=>{
    expect(OpportunityRevisionComparisonRequestSchema.safeParse({
      beforeRevisionId:'rev1',afterRevisionId:'rev2',asOf,actorId:'other'}).success).toBe(false);
    const r=ready();
    for(const after of [{...r.after,sourceUrl:'https://private.invalid'},
      {...r.after,claims:[{field:'STATUS',value:'APPROVED',evidenceRefs:['ev1']}]},
      {...r.after,claims:[{field:'STATUS',value:'OPEN',evidenceRefs:[]}]},
      {...r.after,claims:[{field:'ELIGIBILITY',value:[{field:'major',operator:'EQ',
        value:'https://private.invalid/original'}],evidenceRefs:['ev1']}]}]){
      expect(OpportunityRevisionComparisonResponseSchema.safeParse({...r,after}).success).toBe(false);
    }
  });
  it('forbids claims/evidence on a pending or conflicting result',()=>{
    expect(OpportunityRevisionComparisonResponseSchema.safeParse({...binding,state:'NEEDS_REVIEW',
      reason:'REVISION_CONFLICT',before:ready().before}).success).toBe(false);
  });
  it('rejects cross-source/pair/asOf substitutions and duplicate fields',()=>{
    const r=ready();
    for(const after of [{...r.after,sourceId:'other'},{...r.after,opportunityId:'other'},
      {...r.after,revisionId:'rev3'},{...r.after,verifiedAt:'2026-11-02T00:00:00Z'},
      {...r.after,checkedAt:'2026-11-02T00:00:00Z'},
      {...r.after,claims:[...r.after.claims,...r.after.claims]}]){
      expect(OpportunityRevisionComparisonResponseSchema.safeParse({...r,after}).success).toBe(false);
    }
  });
  it('rejects invented comparisons, equal-hash contradictions and mixed real/synthetic revisions',()=>{
    const r=ready();
    for(const value of [
      {...r,comparisons:[{field:'STATUS',state:'CHANGED'}]},
      {...r,changes:[{field:'STATUS',kind:'CANCELLED'}]},
      {...r,after:{...r.after,dataMode:'REAL'}},
      {...r,after:{...r.after,claims:[{field:'STATUS',value:'CANCELLED',evidenceRefs:['ev1']}]},
        comparisons:[{field:'DEADLINE',state:'UNKNOWN'},{field:'STATUS',state:'CHANGED'},
          {field:'ELIGIBILITY',state:'UNKNOWN'}],changes:[{field:'STATUS',kind:'CANCELLED'}]},
    ])expect(OpportunityRevisionComparisonResponseSchema.safeParse(value).success).toBe(false);
  });
  it('treats reordered conjunctions and IN/NOT_IN sets as unchanged even for equal hashes',()=>{
    const r=ready();
    const first=[{field:'campus',operator:'IN',value:['SEOUL','GLOBAL']},
      {field:'major',operator:'NOT_IN',value:['A','B']},
      {field:'cohort',operator:'GTE',value:2024}];
    const second=[{field:'cohort',operator:'GTE',value:2024},
      {field:'major',operator:'NOT_IN',value:['B','A','A']},
      {field:'campus',operator:'IN',value:['GLOBAL','SEOUL']}];
    const claims=(value:unknown)=>[{field:'ELIGIBILITY',value,evidenceRefs:['ev1']}];
    expect(OpportunityRevisionComparisonResponseSchema.safeParse({...r,
      before:{...r.before,claims:claims(first)},after:{...r.after,claims:claims(second)},
      comparisons:[{field:'DEADLINE',state:'UNKNOWN'},{field:'STATUS',state:'UNKNOWN'},
        {field:'ELIGIBILITY',state:'UNCHANGED'}],changes:[]}).success).toBe(true);
    // Only comparison is canonicalized; immutable reviewed values are retained.
    expect(first[0]?.value).toEqual(['SEOUL','GLOBAL']);
    expect(second[1]?.value).toEqual(['B','A','A']);
  });
  it('does not invent an eligibility change when a reviewed conjunction repeats an identical predicate',()=>{
    const r=ready();
    const condition={field:'campus',operator:'IN',value:['SEOUL','GLOBAL']};
    const claims=(value:unknown)=>[{field:'ELIGIBILITY',value,evidenceRefs:['ev1']}];
    const before=[condition,{...condition,value:['GLOBAL','SEOUL']}];
    const after=[condition];
    const response={...r,before:{...r.before,claims:claims(before)},
      after:{...r.after,claims:claims(after)},
      comparisons:[{field:'DEADLINE',state:'UNKNOWN'},{field:'STATUS',state:'UNKNOWN'},
        {field:'ELIGIBILITY',state:'UNCHANGED'}],changes:[]};
    expect(OpportunityRevisionComparisonResponseSchema.safeParse(response).success).toBe(true);
    expect(before).toHaveLength(2); // comparison normalization does not mutate reviewed source
  });
  it('preserves ordered array values for operators other than IN and NOT_IN',()=>{
    const r=ready(),claims=(value:string[])=>[{field:'ELIGIBILITY',value:[{
      field:'teamRole',operator:'EQ',value}],evidenceRefs:['ev1']}];
    const response={...r,before:{...r.before,claims:claims(['A','B'])},
      after:{...r.after,contentSha256:'b'.repeat(64),claims:claims(['B','A'])},
      comparisons:[{field:'DEADLINE',state:'UNKNOWN'},{field:'STATUS',state:'UNKNOWN'},
        {field:'ELIGIBILITY',state:'CHANGED'}],changes:[{field:'ELIGIBILITY',kind:'CHANGED'}]};
    expect(OpportunityRevisionComparisonResponseSchema.safeParse(response).success).toBe(true);
  });
});
