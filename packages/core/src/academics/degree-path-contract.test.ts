import {describe,expect,it} from 'vitest';
import {AcademicDegreePathVNextSchema} from '@hufs-one/contracts';
import {buildMajorWhatIf,type MajorWhatIfRequest,type ProgramOffer} from './major-what-if.js';
import type {MajorRulePack} from './double-major.js';

const AS_OF='2026-11-01T00:00:00.000Z';
function pack(version:string,id:string,total=false):MajorRulePack {
  return {rulePackVersion:version,rulePackState:'APPROVED',courseAreas:{},requirements:[
    total?{id,kind:'CREDIT_TOTAL',requiredCreditUnits:6,evidenceRefs:['EV-SYN-RULE']}
      :{id,kind:'REQUIRED_COURSE',canonicalCourseId:'SYN-COURSE',evidenceRefs:['EV-SYN-RULE']},
  ]};
}
function programs():ProgramOffer[]{
  // Exercise approved-contract values at the runtime adapter boundary, rather
  // than teaching this test the private core's different legacy spellings.
  const paths=AcademicDegreePathVNextSchema.options;
  const primary=['SYN-A','SYN-C'].flatMap(id=>paths.map(degreePath=>({
    role:'PRIMARY_MAJOR',programId:id,degreePath,
    pack:pack(`${id}-${degreePath}-1`,`${id}-TOTAL`,true),
  })));
  return [...primary,
    {role:'DOUBLE_MAJOR',programId:'SYN-B',pack:pack('SYN-B-D-1','SYN-B-D-REQ')},
    {role:'MINOR',programId:'SYN-B',pack:pack('SYN-B-M-1','SYN-B-M-REQ')},
    {role:'DOUBLE_MAJOR',programId:'SYN-C',pack:pack('SYN-C-D-1','SYN-C-D-REQ')},
    {role:'MINOR',programId:'SYN-C',pack:pack('SYN-C-M-1','SYN-C-M-REQ')},
  ] as unknown as ProgramOffer[];
}
const run=(current:MajorWhatIfRequest['current'],scenario:MajorWhatIfRequest['scenario'],catalog=programs())=>
  buildMajorWhatIf({asOf:AS_OF,attempts:[],current,scenario,programs:catalog});

describe('What-if consumes the canonical degree-path contract (#231)',()=>{
  it.each([
    {current:{primaryProgramId:'SYN-A'},scenario:{action:'ADD_DOUBLE_MAJOR',targetMajorId:'SYN-B'},before:'ADVANCED_SINGLE',after:'DOUBLE_MAJOR'},
    {current:{primaryProgramId:'SYN-A'},scenario:{action:'ADD_MINOR',targetMajorId:'SYN-B'},before:'ADVANCED_SINGLE',after:'ADVANCED_PLUS_MINOR'},
    {current:{primaryProgramId:'SYN-A'},scenario:{action:'CHANGE_PRIMARY_MAJOR',targetMajorId:'SYN-C'},before:'ADVANCED_SINGLE',after:'ADVANCED_SINGLE'},
    {current:{primaryProgramId:'SYN-A',secondary:{role:'DOUBLE_MAJOR',programId:'SYN-B'}},scenario:{action:'REMOVE_DOUBLE_MAJOR'},before:'DOUBLE_MAJOR',after:'ADVANCED_SINGLE'},
    {current:{primaryProgramId:'SYN-A',secondary:{role:'MINOR',programId:'SYN-B'}},scenario:{action:'REMOVE_MINOR'},before:'ADVANCED_PLUS_MINOR',after:'ADVANCED_SINGLE'},
    {current:{primaryProgramId:'SYN-A',secondary:{role:'DOUBLE_MAJOR',programId:'SYN-B'}},scenario:{action:'CHANGE_DOUBLE_MAJOR',targetMajorId:'SYN-C'},before:'DOUBLE_MAJOR',after:'DOUBLE_MAJOR'},
    {current:{primaryProgramId:'SYN-A',secondary:{role:'MINOR',programId:'SYN-B'}},scenario:{action:'CHANGE_MINOR',targetMajorId:'SYN-C'},before:'ADVANCED_PLUS_MINOR',after:'ADVANCED_PLUS_MINOR'},
  ] as const)('$scenario.action returns only canonical degree paths',({current,scenario,before,after})=>{
    const value=run(current,scenario);
    expect(value.state).toBe('READY');
    if(value.state!=='READY')throw new Error('Synthetic approved programs should be usable');
    expect(value.current.degreePath).toBe(before);
    expect(value.hypothetical.degreePath).toBe(after);
    expect(AcademicDegreePathVNextSchema.parse(value.current.degreePath)).toBe(before);
    expect(AcademicDegreePathVNextSchema.parse(value.hypothetical.degreePath)).toBe(after);
    expect(value.current.earnedCreditUnits).toBe(0);
    expect(value.hypothetical.earnedCreditUnits).toBe(0);
  });
  it('rejects two primary offers that normalize to the same canonical path',()=>{
    const catalog=programs();
    const original=catalog.find(p=>p.role==='PRIMARY_MAJOR'&&p.programId==='SYN-A'&&p.degreePath==='ADVANCED_SINGLE')!;
    catalog.push({...original,role:'PRIMARY_MAJOR',degreePath:'MAJOR_DEEPENING',
      pack:{...original.pack,rulePackVersion:'SYN-ALIAS-DUPLICATE'}});
    expect(()=>run({primaryProgramId:'SYN-A'},{action:'ADD_MINOR',targetMajorId:'SYN-B'},catalog)).toThrow('more than once');
  });
  it('preserves legacy inputs while emitting canonical output without changing their packs',()=>{
    const catalog=programs().map(p=>p.role==='PRIMARY_MAJOR'&&p.degreePath==='ADVANCED_SINGLE'
      ?{...p,degreePath:'MAJOR_DEEPENING' as const}:p);
    expect(run({primaryProgramId:'SYN-A'},{action:'ADD_MINOR',targetMajorId:'SYN-B'},catalog))
      .toEqual(run({primaryProgramId:'SYN-A'},{action:'ADD_MINOR',targetMajorId:'SYN-B'}));
  });
  it('keeps unapproved packs blocked instead of treating spelling normalization as approval',()=>{
    const catalog=programs().map(p=>({...p,pack:{...p.pack,rulePackState:'DRAFT' as const}}));
    expect(run({primaryProgramId:'SYN-A'},{action:'ADD_MINOR',targetMajorId:'SYN-B'},catalog).state)
      .toBe('BLOCKED_DEPENDENCY');
  });
  it.each(['UNSELECTED','ADVANCED','__proto__','',null])('rejects an unknown degree path: %s',value=>{
    const catalog=programs();
    Object.assign(catalog[0]!,{degreePath:value});
    expect(()=>run({primaryProgramId:'SYN-A'},{action:'ADD_MINOR',targetMajorId:'SYN-B'},catalog)).toThrow();
  });
});
