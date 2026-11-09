/**
 * #380 — an ALL group without issuer permission to reuse activities is met
 * when the requirements can be filled with *different* activities, even if
 * the candidate sets overlap. Truly infeasible or over-budget cases still
 * abstain (UNKNOWN / ACTIVITY_REUSE_UNVERIFIED). Fictional values only.
 */
import {describe,expect,it} from 'vitest';
import {prepareBadgeV2,assignableWithoutReuse,BADGE_ASSIGNMENT_LIMITS,
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
