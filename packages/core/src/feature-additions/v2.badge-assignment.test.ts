/**
 * #380 — an ALL group without issuer permission to reuse activities is met
 * when the requirements can be filled with *different* activities, even if
 * the candidate sets overlap. Truly infeasible or over-budget cases still
 * abstain (UNKNOWN / ACTIVITY_REUSE_UNVERIFIED). Fictional values only.
 */
import {describe,expect,it} from 'vitest';
import {prepareBadgeV2,assignableWithoutReuse,BADGE_ASSIGNMENT_LIMITS,assignableAcrossGroups,BADGE_CROSS_GROUP_LIMITS,
  type BadgeRequirementState} from './badges-v2.js';
import {FIXED_NOW,badge,badgeEvidence} from './v2.fixtures.js';
import type {FeatureAdditions as C} from '@hufs-one/contracts';

type Req={id:string;topicCode:C.BadgeDefinition['groups'][number]['requirements'][number]['topicCode'];
  minimumDistinctActivities:number};
const group=(requirements:Req[],allowActivityReuse?:boolean)=>badge({groups:[{id:'core',join:'ALL',
  ...(allowActivityReuse===undefined?{}:{allowActivityReuse}),requirements}]});
const both=['DATA_ANALYTICS','PRODUCT_UX'] as const;
const run=(def:C.BadgeDefinition,evidence:C.BadgeEvidence[])=>prepareBadgeV2({badge:def,evidence,asOf:FIXED_NOW});

describe('#380 disjoint assignment instead of "any shared candidate"',()=>{
  const ab:Req[]=[{id:'a',topicCode:'DATA_ANALYTICS',minimumDistinctActivities:1},
    {id:'b',topicCode:'PRODUCT_UX',minimumDistinctActivities:1}];
  it('issue example: ACT-1 and ACT-2 both tagged A and B -> ready (ACT-1->A, ACT-2->B)',()=>{
    const r=run(group(ab,false),[badgeEvidence('ACT-1',{topicCodes:[...both]}),
      badgeEvidence('ACT-2',{topicCodes:[...both]})]);
    expect(r.status).toBe('READY_TO_REQUEST_REVIEW');
    expect(r.groups[0]?.reason).toBeUndefined();
  });
  it('reuse permission unknown (undefined) behaves the same when no reuse is needed',()=>{
    const r=run(group(ab),[badgeEvidence('ACT-1',{topicCodes:[...both]}),
      badgeEvidence('ACT-2',{topicCodes:[...both]})]);
    expect(r.status).toBe('READY_TO_REQUEST_REVIEW');
  });
  it('partial overlap that needs re-routing: E1(A,B) E2(B) -> E1->A, E2->B',()=>{
    for(const ev of [[badgeEvidence('E1',{topicCodes:[...both]}),badgeEvidence('E2',{topicCodes:['PRODUCT_UX']})],
      [badgeEvidence('E2',{topicCodes:['PRODUCT_UX']}),badgeEvidence('E1',{topicCodes:[...both]})]])
      expect(run(group(ab,false),ev).status).toBe('READY_TO_REQUEST_REVIEW');
  });
  it('one activity cannot fill two requirements -> still abstains',()=>{
    const r=run(group(ab,false),[badgeEvidence('ONLY',{topicCodes:[...both]})]);
    expect(r.status).toBe('UNKNOWN');
    expect(r.groups[0]?.reason).toBe('ACTIVITY_REUSE_UNVERIFIED');
  });
  it('counts matter: A needs 2, B needs 1, three shared activities -> ready; two -> abstain',()=>{
    const req:Req[]=[{...ab[0]!,minimumDistinctActivities:2},ab[1]!];
    const three=['X','Y','Z'].map(id=>badgeEvidence(id,{topicCodes:[...both]}));
    expect(run(group(req,false),three).status).toBe('READY_TO_REQUEST_REVIEW');
    expect(run(group(req,false),three.slice(0,2)).status).toBe('UNKNOWN');
  });
  it('explicit permission still allows reuse',()=>{
    const r=run(group(ab,true),[badgeEvidence('ONLY',{topicCodes:[...both]})]);
    expect(r.status).toBe('READY_TO_REQUEST_REVIEW');
  });
  it('a requirement with too few candidates is IN_PROGRESS, not an assignment question',()=>{
    const r=run(group([{...ab[0]!,minimumDistinctActivities:2},ab[1]!],false),
      [badgeEvidence('E1',{topicCodes:[...both]})]);
    expect(r.status).toBe('IN_PROGRESS');
  });
});

describe('#380 assignableWithoutReuse',()=>{
  const req=(id:string,required:number,activityIds:string[]):BadgeRequirementState=>
    ({id,topicCode:'DATA_ANALYTICS',required,observedDistinct:activityIds.length,
      state:'EVIDENCE_RECORDED',activityIds,officialEvidenceIds:[]});
  it('is independent of requirement order',()=>{
    const r1=req('r1',1,['a','b']),r2=req('r2',1,['a']),r3=req('r3',1,['b','c']);
    for(const order of [[r1,r2,r3],[r3,r2,r1],[r2,r1,r3],[r2,r3,r1]])
      expect(assignableWithoutReuse(order)).toBe(true);
    expect(assignableWithoutReuse([req('x',1,['a']),req('y',1,['a'])])).toBe(false);
  });
  it('abstains (false) beyond the search budget',()=>{
    const many=Array.from({length:BADGE_ASSIGNMENT_LIMITS.maxRequiredSlots+1},(_,i)=>'a'+i);
    expect(assignableWithoutReuse([req('big',BADGE_ASSIGNMENT_LIMITS.maxRequiredSlots+1,many)])).toBe(false);
  });
});

describe('#349 cross-group activity reuse',()=>{
  type G={id:string;join:'ALL'|'ANY';allowActivityReuse?:boolean;requirements:Req[]};
  const one=(id:string,topicCode:Req['topicCode'],n=1):Req=>({id,topicCode,minimumDistinctActivities:n});
  const two=(g1:Omit<G,'id'>,g2:Omit<G,'id'>)=>badge({groups:[{id:'g1',...g1},{id:'g2',...g2}]});
  const all=(...requirements:Req[]):Omit<G,'id'>=>({join:'ALL',requirements});
  const any=(...requirements:Req[]):Omit<G,'id'>=>({join:'ANY',requirements});
  const tagged=(id:string,...topicCodes:Req['topicCode'][])=>badgeEvidence(id,{topicCodes});

  it('one activity cannot fill requirements in two ALL groups -> abstains in both groups',()=>{
    const r=run(two(all(one('a','DATA_ANALYTICS')),all(one('b','PRODUCT_UX'))),[tagged('ONLY',...both)]);
    expect(r.status).toBe('UNKNOWN');
    expect(r.groups.map(g=>[g.state,g.reason])).toEqual([
      ['UNKNOWN','ACTIVITY_REUSE_UNVERIFIED'],['UNKNOWN','ACTIVITY_REUSE_UNVERIFIED']]);
    expect(r.requiredNextTopics).toEqual([]);
  });
  it('two shared activities can be split across the groups -> ready, in any evidence order',()=>{
    const def=two(all(one('a','DATA_ANALYTICS')),all(one('b','PRODUCT_UX')));
    for(const ev of [[tagged('E1',...both),tagged('E2',...both)],[tagged('E2',...both),tagged('E1',...both)]]){
      const r=run(def,ev);
      expect(r.status).toBe('READY_TO_REQUEST_REVIEW');
      expect(r.groups.every(g=>g.reason===undefined)).toBe(true);
    }
  });
  it('group order does not change the result',()=>{
    const ev=[tagged('ONLY',...both)];
    const g1=all(one('a','DATA_ANALYTICS')),g2=all(one('b','PRODUCT_UX'));
    expect(run(two(g1,g2),ev).status).toBe('UNKNOWN');
    expect(run(two(g2,g1),ev).status).toBe('UNKNOWN');
  });
  it('an ANY group may pick the requirement that does not collide',()=>{
    // g1 needs DATA (only E1 has it); g2 is ANY of DATA or UX; E2 has UX -> E1->g1, E2->g2
    const def=two(all(one('a','DATA_ANALYTICS')),any(one('b','DATA_ANALYTICS'),one('c','PRODUCT_UX')));
    expect(run(def,[tagged('E1','DATA_ANALYTICS'),tagged('E2','PRODUCT_UX')]).status)
      .toBe('READY_TO_REQUEST_REVIEW');
    // with E1 alone (DATA only) g2 can only choose DATA, which collides with g1
    expect(run(def,[tagged('E1','DATA_ANALYTICS')]).status).toBe('UNKNOWN');
  });
  it('a group whose issuer rule allows reuse may share its activities',()=>{
    const def=badge({groups:[{id:'g1',join:'ALL',allowActivityReuse:true,requirements:[one('a','DATA_ANALYTICS')]},
      {id:'g2',join:'ALL',requirements:[one('b','PRODUCT_UX')]}]});
    expect(run(def,[tagged('ONLY',...both)]).status).toBe('READY_TO_REQUEST_REVIEW');
  });
  it('a reuse-permitted group is left out of the split between the other groups',()=>{
    // g1 allows reuse (DATA: A). g2 needs UX (A or B), g3 needs ECON (B). Counting g1 too
    // would leave g2 nothing; leaving g1 out gives g3<-B, g2<-A.
    const def=badge({groups:[{id:'g1',join:'ALL',allowActivityReuse:true,requirements:[one('a','DATA_ANALYTICS')]},
      {id:'g2',...all(one('b','PRODUCT_UX'))},{id:'g3',...all(one('c','ECONOMIC_RESEARCH'))}]});
    const r=run(def,[tagged('A','DATA_ANALYTICS','PRODUCT_UX'),tagged('B','PRODUCT_UX','ECONOMIC_RESEARCH')]);
    expect(r.status).toBe('READY_TO_REQUEST_REVIEW');
  });
  it('a badge that is not met overall is left unchanged (no extra UNKNOWN)',()=>{
    const def=two(all(one('a','DATA_ANALYTICS')),all(one('b','PRODUCT_UX',2)));
    const r=run(def,[tagged('ONLY',...both)]);
    expect(r.status).toBe('IN_PROGRESS');
    expect(r.groups.map(g=>g.reason)).toEqual([undefined,undefined]);
    expect(r.requiredNextTopics).toEqual(['PRODUCT_UX']);
  });
  it('only the groups that share an activity are marked',()=>{
    const def=badge({groups:[{id:'g1',...all(one('a','DATA_ANALYTICS'))},{id:'g2',...all(one('b','PRODUCT_UX'))},
      {id:'g3',...all(one('c','ECONOMIC_RESEARCH'))}]});
    const r=run(def,[tagged('ONLY',...both),tagged('OTHER','ECONOMIC_RESEARCH')]);
    expect(r.groups.map(g=>g.reason)).toEqual(['ACTIVITY_REUSE_UNVERIFIED','ACTIVITY_REUSE_UNVERIFIED',undefined]);
    expect(r.groups[2]?.state).toBe('MET');
  });
});

describe('#349 assignableAcrossGroups budget',()=>{
  const rec=(id:string,activityIds:string[]):BadgeRequirementState=>
    ({id,topicCode:'DATA_ANALYTICS',required:1,observedDistinct:activityIds.length,
      state:'EVIDENCE_RECORDED',activityIds,officialEvidenceIds:[]});
  it('abstains (false) when ANY-group choices exceed the budget',()=>{
    // 9 ANY groups with 2 recorded choices each = 512 combinations > 256
    const groups=Array.from({length:9},(_,i)=>({join:'ANY' as const,allowActivityReuse:false,
      requirements:[rec('x'+i,['p'+i]),rec('y'+i,['q'+i])]}));
    expect(BADGE_CROSS_GROUP_LIMITS.maxChoiceCombinations).toBe(256);
    expect(assignableAcrossGroups(groups)).toBe(false);
    expect(assignableAcrossGroups(groups.slice(0,8))).toBe(true);
  });
});
