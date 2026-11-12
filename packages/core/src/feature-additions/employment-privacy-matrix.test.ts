import {describe,expect,it} from 'vitest';
import {comparePublishedStats,evaluatePublishedStat,validateEmploymentStatements}
  from './employment-v2.js';
import {FIXED_NOW,source,stat} from './v2.fixtures.js';

describe('#351 30-cell synthetic employment privacy/provenance decision matrix',()=>{
  it.each(Array.from({length:30},(_,i)=>i))(
    'a public 100-person survey numerator %s has explicit small-cell suppression',count=>{
      const value=evaluatePublishedStat(stat('SYN-STAT-'+count,{numerator:count}),FIXED_NOW);
      if(count<5) {
        expect(value.status).toBe('SUPPRESSED');
        expect(value.numerator).toBeUndefined();
        expect(value.denominator).toBeUndefined();
        expect(value.percent).toBeUndefined();
      }else{
        expect(value).toMatchObject({status:'PERCENT',numerator:count,
          denominator:100});
        expect(value.percent).toBeCloseTo(count,10);
      }
    });
  it('complementary tiny cells must also be suppressed',()=>{
    for(const numerator of [96,97,98,99,100]){
      const r=evaluatePublishedStat(stat('SYN-COMPLEMENT-'+numerator,{numerator}),FIXED_NOW);
      expect(r.status).toBe('SUPPRESSED');
      expect(r.percent).toBeUndefined();
    }
  });
  it('same source year and metric with different minimum disclosure thresholds is not comparable',()=>{
    const first=stat('SYN-A'),other=stat('SYN-B',{
      groupId:'SYN-OTHER-GROUP',
      publicationPolicy:{minimumPositiveCell:10,allowPublishedZero:false,
        aggregationAllowed:false},
    });
    expect(comparePublishedStats([first,other],FIXED_NOW)).toMatchObject({
      comparable:false,reason:'DIFFERENT_DEFINITION',
    });
  });
  it('zero disclosure and aggregation rights differences also invalidate direct comparison',()=>{
    const first=stat('SYN-A');
    for(const policy of [
      {minimumPositiveCell:5,allowPublishedZero:true,aggregationAllowed:false},
      {minimumPositiveCell:5,allowPublishedZero:false,aggregationAllowed:true},
    ]){
      const other=stat('SYN-B',{groupId:'SYN-OTHER',
        publicationPolicy:policy});
      expect(comparePublishedStats([first,other],FIXED_NOW).reason)
        .toBe('DIFFERENT_DEFINITION');
    }
  });
  it('consistent publication policy allows individual published groups without summing data',()=>{
    const result=comparePublishedStats([
      stat('SYN-A'),stat('SYN-B',{groupId:'SYN-OTHER',numerator:70}),
    ],FIXED_NOW);
    expect(result.reason).toBe('COMPATIBLE');
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map(x=>x.percent)).toEqual([60,70]);
    expect(result).not.toHaveProperty('combinedRate');
  });
  it('no observations differs from zero respondents or verified observed zero',()=>{
    expect(evaluatePublishedStat(stat('SYN-MISSING',{numerator:undefined}),FIXED_NOW).status)
      .toBe('NO_DATA');
    expect(evaluatePublishedStat(stat('SYN-DENOM-ZERO',{denominator:0}),FIXED_NOW).status)
      .toBe('INVALID');
    expect(evaluatePublishedStat(stat('SYN-ZERO',{numerator:0,
      publicationPolicy:{minimumPositiveCell:5,allowPublishedZero:true,
        aggregationAllowed:false}}),FIXED_NOW)).toMatchObject({
      status:'OBSERVED_ZERO',percent:0,
    });
  });
  it('revocation, no rights, and fabricated claims never expose a suppressed cell',()=>{
    const rows=[stat('SYN-REV',{source:{...source(),status:'REVOKED'}}),
      stat('SYN-TINY',{numerator:1})];
    const result=validateEmploymentStatements(rows,[
      {id:'SYN-C1',statId:'SYN-REV',year:2026,numerator:60,
        denominator:100,percentage:60},
      {id:'SYN-C2',statId:'SYN-TINY',year:2026,numerator:1,
        denominator:100,percentage:1},
    ],FIXED_NOW);
    expect(result.every(x=>x.outcome==='REJECTED'
      &&x.safeText===undefined)).toBe(true);
  });
});
