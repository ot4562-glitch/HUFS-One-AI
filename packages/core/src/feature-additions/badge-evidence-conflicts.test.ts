import {describe,expect,it} from 'vitest';
import {prepareBadgeV2} from './badges-v2.js';
import {badge,badgeEvidence,source,FIXED_NOW} from './v2.fixtures.js';

const run=(evidence:ReturnType<typeof badgeEvidence>[],badgeOverride=badge())=>
  prepareBadgeV2({badge:badgeOverride,evidence,asOf:FIXED_NOW});
const a=badgeEvidence('SYN-A'),b=badgeEvidence('SYN-B');
describe('#349 offline badge evidence IDs cannot be reused as forged completions',()=>{
  it('two separate owner-reviewed experiences are only READY_TO_REQUEST_REVIEW',()=>{
    const r=run([a,b]);
    expect(r.status).toBe('READY_TO_REQUEST_REVIEW');
    expect(r.groups[0]?.requirements[0]?.observedDistinct).toBe(2);
    expect(r.issuedCredential).toBeNull();
  });
  it('identical repeated pagination records count only once',()=>{
    const r=run([a,{...a},b,{...b}]);
    expect(r.status).toBe('READY_TO_REQUEST_REVIEW');
    expect(r.groups[0]?.requirements[0]?.observedDistinct).toBe(2);
  });
  it.each([
    ['two activity IDs',{activityId:'SYN-OTHER-ACTIVITY'}],
    ['contradictory approval',{ownerApproved:false}],
    ['opposite issuer verification',{officialVerified:true}],
    ['different activity dates',{date:'2026-09-01T00:00:00+09:00'}],
    ['conflicting topic codes',{topicCodes:['PRODUCT_UX' as const]}],
    ['different verified source version',{sourceRevisionId:'SYN-OTHER-REV'}],
  ] as const)('quarantines both copies of a shared proof ID with %s',(_label,change)=>{
    const r=run([a,{...a,...change},b]);
    expect(r.status).toBe('IN_PROGRESS');
    expect(r.groups[0]?.requirements[0]?.observedDistinct).toBe(1);
    expect(r.groups[0]?.requirements[0]?.activityIds).toEqual(['SYN-B']);
    expect(r.issuedCredential).toBeNull();
  });
  it('a later correct duplicate cannot resurrect a contested private receipt',()=>{
    const r=run([a,b,{...a,activityId:'SYN-X'},a]);
    expect(r.groups[0]?.requirements[0]?.activityIds).toEqual(['SYN-B']);
    expect(r.status).toBe('IN_PROGRESS');
  });
  it('different proof IDs for the SAME activity never satisfy distinct-activity count',()=>{
    const r=run([a,{...b,activityId:'SYN-A'}]);
    expect(r.groups[0]?.requirements[0]?.observedDistinct).toBe(1);
    expect(r.status).toBe('IN_PROGRESS');
  });
  it('an unapproved owner asset does not count even if issuerVerified=true',()=>{
    const r=run([a,{...b,ownerApproved:false,officialVerified:true}]);
    expect(r.groups[0]?.requirements[0]?.observedDistinct).toBe(1);
    expect(r.issuedCredential).toBeNull();
  });
  it.each([0,1,2,3,4,5,6,7,8,9,10,11])(
    'synthetic 12-badge matrix %s: rights and count never produce actual credentials',i=>{
      const rule=badge({
        id:'SYN-BADGE-'+i,
        source:i===11?{...source(),rights:'BLOCKED'}:source(),
        groups:[{id:'SYN-GROUP',join:'ALL',requirements:[{
          id:'SYN-REQ',topicCode:'DATA_ANALYTICS',minimumDistinctActivities:i%4+1,
        }]}],
      });
      const evidence=Array.from({length:3},(_,j)=>badgeEvidence('SYN-ACTIVITY-'+j));
      const r=run(evidence,rule);
      expect(r.issuedCredential).toBeNull();
      if(i===11)expect(r.status).toBe('UNKNOWN');
      else expect(r.status).toBe(i%4+1<=3?'READY_TO_REQUEST_REVIEW':'IN_PROGRESS');
    });
  it('issuer source revoked means UNKNOWN even with two approved student files',()=>{
    const r=run([a,b],badge({source:{...source(),status:'REVOKED'}}));
    expect(r.status).toBe('UNKNOWN');
    expect(r.groups).toEqual([]);
    expect(r.issuedCredential).toBeNull();
  });
});
