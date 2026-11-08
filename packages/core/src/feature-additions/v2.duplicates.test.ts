/**
 * #364 — repeated candidate IDs must not let input order decide whether a
 * revoked/inactive copy is honoured. Every copy of a repeated ID is excluded,
 * matching the catalog search policy. Fictional values only.
 */
import {describe,expect,it} from 'vitest';
import {rankMentorsV2} from './mentors-v2.js';
import {recommendLearningV2} from './learning-v2.js';
import {routeCounselingV2} from './counseling-v2.js';
import {conflictingIds} from './source-policy.js';
import {FIXED_NOW,source,mentor,mentorPreference,learning,learningPreference,
  agency} from './v2.fixtures.js';

const revoked={...source('source-r2'),status:'REVOKED' as const};
const both=<T,>(a:T,b:T):[T[],T[]]=>[[a,b],[b,a]];

describe('#364 conflictingIds',()=>{
  it('returns only IDs that occur more than once',()=>{
    expect([...conflictingIds([{id:'x'},{id:'y'},{id:'x'},{id:'z'},{id:'x'}])]).toEqual(['x']);
    expect(conflictingIds([]).size).toBe(0);
  });
});

describe('#364 mentors: approved + revoked copies of one ID',()=>{
  for(const [label,order] of [['approved first',0],['revoked first',1]] as const) {
    it(label,()=>{
      const pair=both(mentor('A'),mentor('A',{source:revoked}))[order];
      const r=rankMentorsV2({preference:mentorPreference(),catalog:[...pair,mentor('B')]});
      expect(r.items.map(x=>x.mentorId)).toEqual(['B']);
      expect(r.candidateCount).toBe(1);
    });
  }
  it('an inactive later copy also quarantines the ID',()=>{
    const r=rankMentorsV2({preference:mentorPreference(),
      catalog:[mentor('A'),mentor('A',{active:false})]});
    expect(r.items).toEqual([]);
  });
  it('a model proposal for a quarantined ID is an extra candidate and is rejected',()=>{
    const r=rankMentorsV2({preference:mentorPreference(),
      catalog:[mentor('A'),mentor('A',{source:revoked}),mentor('B')],
      rerank:{modelApproved:true,inputDigest:'d',proposals:[
        {candidateId:'A',score:1,evidenceCodes:['ECON'],inputDigest:'d',modelVersion:'m'},
        {candidateId:'B',score:1,evidenceCodes:['ECON'],inputDigest:'d',modelVersion:'m'}]}});
    expect(r.modelOutcome).toBe('REJECTED');
    expect(r.items.map(x=>[x.mentorId,x.mode])).toEqual([['B','RULE_ONLY']]);
  });
});

describe('#364 learning programs: approved + revoked copies of one ID',()=>{
  for(const [label,order] of [['approved first',0],['revoked first',1]] as const) {
    it(label,()=>{
      const pair=both(learning('A'),learning('A',{source:revoked}))[order];
      const r=recommendLearningV2({preference:learningPreference(),programs:[...pair,learning('B')]});
      expect(r.items.map(x=>x.programId)).toEqual(['B']);
      expect(r.excludedCount).toBe(2);
    });
  }
  it('two identical approved copies are still quarantined (no silent pick)',()=>{
    const r=recommendLearningV2({preference:learningPreference(),
      programs:[learning('A'),learning('A')]});
    expect(r.items).toEqual([]);
    expect(r.excludedCount).toBe(2);
  });
});

describe('#364 counseling services: approved + revoked copies of one ID',()=>{
  for(const [label,order] of [['approved first',0],['revoked first',1]] as const) {
    it(label,()=>{
      const pair=both(agency('A'),agency('A',{source:revoked}))[order];
      const r=routeCounselingV2({purposes:['CAREER'],services:[...pair,agency('B')],asOf:FIXED_NOW});
      expect(r.matches.map(x=>x.serviceId)).toEqual(['B']);
      expect(r.excluded).toBe(2);
    });
  }
});
