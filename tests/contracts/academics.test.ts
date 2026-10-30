import {describe,it,expect} from 'vitest';
import {CourseRecordSchema,RulePackSchema,AcademicSummarySchema,ForecastSummarySchema,OfferingOutlookSchema} from '@hufs-one/contracts';
import {fixture} from './helpers.js';

const rule=fixture<Record<string,unknown>>('synthetic/rulepack.json');
const outlook=fixture<{items:Array<Record<string,unknown>>;asOf:string;status:string}>('synthetic/forecast-summary.json');
describe('A08/A09 academic contracts',()=>{
  it('accepts synthetic rulepack with two independent reviewers and covered exception',()=>{
    expect(RulePackSchema.safeParse(rule).success).toBe(true);
  });
  it('never APPROVES a rule with an omitted ※ exception',()=>{
    expect(RulePackSchema.safeParse(fixture('negative/unverified-rulepack.json')).success).toBe(false);
  });
  it('requires distinct reviewers and supports DRAFT without false approval',()=>{
    expect(RulePackSchema.safeParse({...rule,independentlyCheckedBy:rule.approvedBy}).success).toBe(false);
    expect(RulePackSchema.safeParse({...rule,state:'DRAFT'}).success).toBe(false); // prior approvals cannot be reused as DRAFT sign-off
    const {approvedBy,independentlyCheckedBy,...draft}=rule;
    expect(RulePackSchema.safeParse({...draft,state:'DRAFT'}).success).toBe(true);
  });
  it('never counts current and planned credits into earned credits implicitly',()=>{
    const summary=AcademicSummarySchema.parse(fixture('synthetic/academic-summary.json'));
    expect(summary.earnedCreditUnits).toBe(12);
    expect(summary.inProgressCreditUnits).toBe(6);
    expect(summary.plannedCreditUnits).toBe(0);
    expect(summary.deficits[0]?.state).toBe('NEEDS_REVIEW');
  });
  it('uses half-credit integer units and rejects raw grade fields',()=>{
    const row={term:'2026-2',courseCode:'',courseName:'가상 과목',creditUnits:5,category:'교양',ledger:'IN_PROGRESS'};
    expect(CourseRecordSchema.safeParse(row).success).toBe(true);
    expect(CourseRecordSchema.safeParse({...row,creditUnits:2.5}).success).toBe(false);
    expect(CourseRecordSchema.safeParse({...row,gpa:4.5}).success).toBe(false);
  });
  it('accepts historical-only outlook with asOf and explicit coverage',()=>{
    expect(ForecastSummarySchema.safeParse(outlook).success).toBe(true);
  });
  it.each([
    ['partial term listing',{coverage:'PARTIAL'}],
    ['insufficient terms',{sameSeasonObservedTerms:2}],
    ['look-ahead feature',{sourcePublishedAt:'2027-01-01T00:00:00.000Z'}],
    ['impossible frequency',{sameSeasonOfferedTerms:4}],
  ])('rejects %s as a defensible historical pattern',(_name,changes)=>{
    const row={...outlook.items[0],...changes};
    expect(OfferingOutlookSchema.safeParse(row).success).toBe(false);
  });
  it('requires source timestamps for confirmed offerings',()=>{
    expect(OfferingOutlookSchema.safeParse({...outlook.items[0],signal:'CONFIRMED_OFFERED'}).success).toBe(false);
    expect(OfferingOutlookSchema.safeParse({...outlook.items[0],signal:'CONFIRMED_NOT_OFFERED'}).success).toBe(false);
  });
  it('keeps UNKNOWN acceptable for missing catalog, not a fabricated 0/n',()=>{
    const unknown={...outlook.items[0],signal:'UNKNOWN',coverage:'PARTIAL',sameSeasonObservedTerms:0,sameSeasonOfferedTerms:0};
    expect(OfferingOutlookSchema.safeParse(unknown).success).toBe(true);
  });
});
