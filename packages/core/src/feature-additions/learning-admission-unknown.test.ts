import {describe,expect,it} from 'vitest';
import {recommendLearningV2} from './learning-v2.js';
import {learning,learningPreference,source} from './v2.fixtures.js';

const catalog=Array.from({length:24},(_,i)=>learning('SYN-PROGRAM-'+i,{
  term:i%2===0?'2026-2':'2026-1',
  eligibleCampuses:i%3===0?['SEOUL']:['GLOBAL'],
  capacity:i%4===0?'UNKNOWN':i%4===1?'FULL':'OPEN',
  ...(i%5===0?{deadlineAt:undefined}:{}),
}));
const run=(programs:ReturnType<typeof learning>[]=catalog,opts:{
  verifiedCompletedCourses?:readonly string[];
}={})=>recommendLearningV2({
  preference:learningPreference(),programs,...opts,
});
describe('#350 learning/tutoring eligibility is never confirmed without verified application deadline',()=>{
  it('a program with an unknown official deadline is UNKNOWN even if goal and campus match',()=>{
    const item=learning('SYN-UNDATED',{deadlineAt:undefined});
    const row=run([item]).items[0];
    expect(row?.eligibility).toBe('UNKNOWN');
    expect(row?.hardReasons).toContain('APPLICATION_DEADLINE_UNVERIFIED');
    expect(row?.mode).toBe('RULE_ONLY');
  });
  it('explicitly closed program remains NOT_MET and cannot be promoted by relevance',()=>{
    const closed=learning('SYN-CLOSED',{deadlineAt:'2026-11-01T00:00:00Z'});
    const available=learning('SYN-OPEN');
    const result=run([closed,available]);
    expect(result.items[0]?.programId).toBe('SYN-OPEN');
    expect(result.items[1]?.eligibility).toBe('NOT_MET');
  });
  it.each(catalog)('$id never advertises a seat if campus/term/capacity/deadline is unverified',program=>{
    const row=run([program]).items[0]!;
    const conflict=program.term!=='2026-2'||!program.eligibleCampuses.includes('SEOUL')
      ||program.capacity==='FULL';
    if(conflict)expect(row.eligibility).toBe('NOT_MET');
    else if(program.capacity==='UNKNOWN'||!program.deadlineAt)
      expect(row.eligibility).toBe('UNKNOWN');
    else expect(row.eligibility).toBe('MET');
    expect(row.finalScore).toBe(row.relevance);
    expect(row.mode).toBe('RULE_ONLY');
  });
  it('a missing course transcript must not silently use student goals as proof',()=>{
    const program=learning('SYN-PREREQUISITE',{requiredCourseCodes:['ECO201']});
    const row=run([program]).items[0]!;
    expect(row.eligibility).toBe('UNKNOWN');
    expect(row.hardReasons).toContain('COURSE_ELIGIBILITY_NOT_SHARED');
  });
  it('reviewed prerequisite evidence still cannot make a deadline-less program MET',()=>{
    const program=learning('SYN-UNDATED-PREREQ',{
      requiredCourseCodes:['ECO201'],deadlineAt:undefined,
    });
    const row=run([program],{verifiedCompletedCourses:['ECO201']}).items[0]!;
    expect(row.eligibility).toBe('UNKNOWN');
    expect(row.hardReasons).toContain('APPLICATION_DEADLINE_UNVERIFIED');
  });
  it('unlicensed or revoked programs are excluded even if the matching score is 100%',()=>{
    const items=[
      learning('SYN-BLOCKED',{source:{...source(),rights:'BLOCKED'}}),
      learning('SYN-REVOKED',{source:{...source(),status:'REVOKED'}}),
      learning('SYN-ALLOWED'),
    ];
    const r=run(items);
    expect(r.items.map(x=>x.programId)).toEqual(['SYN-ALLOWED']);
    expect(r.excludedCount).toBe(2);
  });
  it('two identical IDs with conflicting evidence must both be quarantined',()=>{
    const r=run([learning('SYN-ID'),learning('SYN-ID',{capacity:'FULL'})]);
    expect(r.items).toEqual([]);
    expect(r.excludedCount).toBe(2);
  });
  it('a fully verified open offer is a candidate, not an accepted tutoring enrollment',()=>{
    const r=run([learning('SYN-OFFER')]);
    expect(r.items[0]?.eligibility).toBe('MET');
    expect(JSON.stringify(r)).not.toContain('enrollmentConfirmed');
    expect(JSON.stringify(r)).not.toContain('admissionDecision');
  });
});
