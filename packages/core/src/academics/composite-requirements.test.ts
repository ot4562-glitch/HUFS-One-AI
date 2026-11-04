import {describe,it,expect} from 'vitest';
import {buildAcademicLedger,type LedgerAttempt,type LedgerRequirement} from './ledger.js';
import {buildDoubleMajorAudit} from './double-major.js';
const asOf='2026-11-05T00:00:00.000Z';
const attempt=(id:string,areas:string[],ledger:LedgerAttempt['ledger']='EARNED',creditUnits=6):LedgerAttempt=>({
  attemptToken:id,canonicalCourseId:id,creditUnits,ledger,areaIds:areas,recognition:'RECOGNIZED',term:'2025-2',
});
const area={id:'SYN-AREA-SPREAD',kind:'AREA_SPREAD',areaIds:['A','B','C'],minAreas:2,
  requiredCreditUnits:12,evidenceRefs:['SYN-REF']} as LedgerRequirement;
const group={id:'SYN-GROUP',kind:'GROUP_CHOICE',groups:[['G1','G2'],['H1','H2']],k:1,evidenceRefs:['SYN-REF']} as LedgerRequirement;
const run=(r:LedgerRequirement,attempts:LedgerAttempt[])=>buildAcademicLedger({asOf,rulePackVersion:'SYN-PACK',
  rulePackState:'APPROVED',requirements:[r],attempts});

describe('#133 composite requirements consume the unique earned ledger',()=>{
  it('does not satisfy an area spread using enough credits from just one area',()=>{
    expect(run(area,[attempt('A1',['A']),attempt('A2',['A'])]).requirements[0]).toMatchObject({
      state:'UNSATISFIED',earnedCreditUnits:12,matchedAreasCount:1,requiredAreasCount:2});
  });
  it('satisfies two distinct earned areas and counts each course once',()=>{
    const audit=run(area,[attempt('A1',['A']),attempt('B1',['B'])]);
    expect(audit.requirements[0]).toMatchObject({state:'SATISFIED',earnedCreditUnits:12,matchedAreasCount:2});
    expect(audit.earnedCreditUnits).toBe(12);
  });
  it('holds a multi-area allocation instead of turning one course into two areas',()=>{
    expect(run(area,[attempt('AB',['A','B'],'EARNED',12)]).requirements[0]).toMatchObject({
      state:'NEEDS_REVIEW',earnedCreditUnits:0,matchedAreasCount:0});
  });
  it('does not count planned, in-progress, pending or zero-credit area membership as earned',()=>{
    for(const candidate of [attempt('B1',['B'],'IN_PROGRESS'),attempt('B1',['B'],'PLANNED'),
      {...attempt('B1',['B']),recognition:'PENDING' as const},attempt('B1',['B'],'EARNED',0)]){
      expect(run(area,[attempt('A1',['A'],'EARNED',12),candidate]).requirements[0]).toMatchObject({
        state:'UNSATISFIED',matchedAreasCount:1});
    }
  });
  it('does not combine the halves of different groups',()=>{
    expect(run(group,[attempt('G1',[]),attempt('H2',[])]).requirements[0]).toMatchObject({
      state:'UNSATISFIED',matchedGroupsCount:0,requiredGroupsCount:1});
  });
  it('counts only fully earned groups, including an approved single-course alternative',()=>{
    expect(run(group,[attempt('G1',[]),attempt('G2',[])]).requirements[0]).toMatchObject({
      state:'SATISFIED',matchedGroupsCount:1,requiredGroupsCount:1});
    const alternative={...group,groups:[['G1','G2'],['NEW1']]} as LedgerRequirement;
    expect(run(alternative,[attempt('NEW1',[])]).requirements[0]?.state).toBe('SATISFIED');
    expect(run(group,[attempt('G1',[]),attempt('G2',[],'PLANNED')]).requirements[0]?.state).toBe('UNSATISFIED');
  });
  it('rejects cross-group duplicate courses rather than counting the same credit twice',()=>{
    expect(()=>run({...group,groups:[['G1'],['G1']]} as LedgerRequirement,[attempt('G1',[])])).toThrow();
  });
  it('keeps manual language conditions unresolved despite matching course names or units',()=>{
    const manual:LedgerRequirement={id:'SYN-LANGUAGE',kind:'NON_CREDIT',criterionId:'LANGUAGE_FAMILY',
      verificationMode:'MANUAL',evidenceRefs:['SYN-REF']};
    expect(run(manual,[attempt('ENGLISH-NAMED-COURSE',[],'EARNED',24)]).requirements[0]?.state).toBe('NEEDS_REVIEW');
  });
  it('does not let new composite kinds bypass double-major overlap review',()=>{
    for(const requirement of [area,group]){
      const attempts=(requirement.kind==='AREA_SPREAD'?[attempt('A1',['A']),attempt('B1',['B'])]:
        [attempt('G1',[]),attempt('G2',[])]).map(({areaIds,...a})=>a);
      const courseAreas=Object.fromEntries(attempts.map((a,i)=>[a.canonicalCourseId,[i===0?'A':'B']]));
      const audit=buildDoubleMajorAudit({asOf,attempts,
        primary:{rulePackVersion:'SYN-PRIMARY',rulePackState:'APPROVED',requirements:[requirement],courseAreas},
        doubleMajor:{status:'SELECTED',pack:{rulePackVersion:'SYN-DOUBLE',rulePackState:'APPROVED',
          requirements:[{...requirement,id:'SYN-SECONDARY'}],courseAreas}}});
      expect(audit.primary.requirements[0]?.state).toBe('NEEDS_REVIEW');
      expect(audit.overlap.heldRequirementIds.primary).toContain(requirement.id);
    }
  });
});
