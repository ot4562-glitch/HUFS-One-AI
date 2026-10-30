import {describe,it,expect} from 'vitest';
import {AcademicSummarySchema,RulePackSchema,ForecastSummarySchema,OfferingOutlookSchema,CourseRecordSchema,DemoSnapshotSchema} from '@hufs-one/contracts';
import {fixture} from '../contracts/helpers.js';

describe('Consumer 3: graduation and offering forecast',()=>{
  it('parses three ledger totals separately, leaving incomplete requirement NEEDS_REVIEW',()=>{
    const a=AcademicSummarySchema.parse(fixture('synthetic/academic-summary.json'));
    expect([a.earnedCreditUnits,a.inProgressCreditUnits,a.plannedCreditUnits]).toEqual([12,6,0]);
    expect(a.deficits[0]?.state).toBe('NEEDS_REVIEW');
  });
  it('requires reviewed rulepack with exception coverage before declaring APPROVED',()=>{
    const p=RulePackSchema.parse(fixture('synthetic/rulepack.json'));
    expect(p.state).toBe('APPROVED');
    expect(RulePackSchema.safeParse({...p,independentlyCheckedBy:p.approvedBy}).success).toBe(false);
    expect(RulePackSchema.safeParse(fixture('negative/unverified-rulepack.json')).success).toBe(false);
  });
  it('treats partial historical catalogs as UNKNOWN, not 0 times offered',()=>{
    const f=ForecastSummarySchema.parse(fixture('synthetic/forecast-summary.json'));
    const item=f.items[0]!;
    expect(item.signal).toBe('HISTORICAL_PATTERN');
    const bad={...item,coverage:'PARTIAL'};
    expect(OfferingOutlookSchema.safeParse(bad).success).toBe(false);
    expect(OfferingOutlookSchema.safeParse({...bad,signal:'UNKNOWN',sameSeasonObservedTerms:0,sameSeasonOfferedTerms:0}).success).toBe(true);
  });
  it('blocks future-published evidence and arbitrary course GPA',()=>{
    const f=ForecastSummarySchema.parse(fixture('synthetic/forecast-summary.json'));
    expect(OfferingOutlookSchema.safeParse({...f.items[0],sourcePublishedAt:'2027-01-01T00:00:00.000Z'}).success).toBe(false);
    expect(CourseRecordSchema.safeParse({term:'2026-2',courseCode:'',courseName:'가상',creditUnits:6,category:'교양',ledger:'EARNED',grade:'A+'}).success).toBe(false);
  });
  it('exposes only projected summary to the screen, not individual student rows',()=>{
    const s=fixture<Record<string,unknown>>('synthetic/demo-snapshot.json');
    expect(DemoSnapshotSchema.safeParse({...s,academics:fixture('synthetic/academic-summary.json')}).success).toBe(true);
    expect(DemoSnapshotSchema.safeParse({...s,transcript:'RAW_DATA_FAKE'}).success).toBe(false);
  });
});
