import {describe,expect,it} from 'vitest';
import {compareSkillsV2} from './skills-v2.js';
import {requirement,experience,crosswalk,source,FIXED_NOW} from './v2.fixtures.js';

const run=(changes:{
  requirements?:ReturnType<typeof requirement>[];
  experiences?:ReturnType<typeof experience>[];
  crosswalk?:ReturnType<typeof crosswalk>[];
}={})=>compareSkillsV2({
  requirements:changes.requirements??[requirement()],
  experiences:changes.experiences??[experience()],
  crosswalk:changes.crosswalk??[crosswalk()],
  asOf:FIXED_NOW,
});
describe('#347 contradictory NCS/source/owner evidence never creates false competency',()=>{
  it('a reviewed one-to-one crosswalk plus owner-approved span supports only a recorded match',()=>{
    expect(run()).toMatchObject([{status:'SUPPORTED_BY_EVIDENCE',
      interpretation:'RECORD_MATCH',ownerEvidenceIds:['experience'],
      requiredOneAiTopics:['DATA_ANALYTICS'],unmappedRequirementTopics:[]}]);
  });
  it('quarantines both copies of a duplicate official NCS requirement ID',()=>{
    const rows=run({requirements:[requirement('SYN-REQ'),requirement('SYN-REQ',{
      topicCodes:['UNKNOWN_NCS_TOPIC']})]});
    expect(rows).toHaveLength(2);
    expect(rows.every(row=>row.status==='NEEDS_REVIEW'
      &&row.ownerEvidenceIds.length===0)).toBe(true);
  });
  it('quarantines a repeated private experience ID instead of accepting a convenient copy',()=>{
    const rows=run({experiences:[experience('SYN-EXPERIENCE',{approved:false}),
      experience('SYN-EXPERIENCE',{approved:true})]});
    expect(rows[0]?.status).toBe('EVIDENCE_MISSING');
    expect(rows[0]?.ownerEvidenceIds).toEqual([]);
    expect(rows[0]?.interpretation).toBe('RECORD_MISSING');
  });
  it('does not union two independent, disagreeing taxonomy revisions for one official code',()=>{
    const rows=run({crosswalk:[crosswalk(),crosswalk({
      id:'SYN-NEW-CROSSWALK',source:{...source(),revisionId:'SYN-NEW-REV'},
      oneAiTopic:'DATA_ANALYTICS',
    })]});
    expect(rows[0]?.status).toBe('NEEDS_REVIEW');
    expect(rows[0]?.ownerEvidenceIds).toEqual([]);
  });
  it('does not pick the first of two conflicting crosswalk records with the same ID',()=>{
    const rows=run({crosswalk:[crosswalk(),crosswalk({
      oneAiTopic:'PRODUCT_UX',
    })]});
    expect(rows[0]?.status).toBe('UNMAPPED');
    expect(rows[0]?.ownerEvidenceIds).toEqual([]);
  });
  it('permits distinct reviewed links sharing the same official taxonomy source revision',()=>{
    const rows=run({crosswalk:[crosswalk(),crosswalk({
      id:'SYN-ALTERNATE',oneAiTopic:'PRODUCT_UX',
    })]});
    expect(rows[0]?.requiredOneAiTopics).toEqual(['DATA_ANALYTICS','PRODUCT_UX']);
    expect(rows[0]?.status).toBe('SUPPORTED_BY_EVIDENCE');
  });
  it.each([
    ['unverified requirement',{source:{...source(),status:'NEEDS_REVIEW'}}],
    ['revoked requirement',{source:{...source(),status:'REVOKED'}}],
    ['blocked requirement',{source:{...source(),rights:'BLOCKED'}}],
    ['unknown requirement span',{sourceSpanId:'NONEXISTENT-SPAN'}],
  ] as const)('quarantines %s',(_label,change)=>{
    const rows=run({requirements:[requirement('SYN-REQ',change)]});
    expect(rows[0]).toMatchObject({status:'NEEDS_REVIEW',interpretation:'UNKNOWN'});
    expect(rows[0]?.ownerEvidenceIds).toHaveLength(0);
  });
  it.each([
    ['owner has not approved',{approved:false}],
    ['owner source span absent',{evidenceSpanIds:[]}],
    ['different approved topic',{topicCodes:['PRODUCT_UX' as const]}],
  ] as const)('does not infer competence from %s',(_label,change)=>{
    const normalized=Object.fromEntries(Object.entries(change).map(
      ([key,value])=>[key,Array.isArray(value)?[...value]:value]
    )) as Partial<ReturnType<typeof experience>>;
    const rows=run({experiences:[experience('SYN-OWNER-EXP',normalized)]});
    expect(rows[0]).toMatchObject({status:'EVIDENCE_MISSING',interpretation:'RECORD_MISSING'});
  });
  it('an unknown official taxonomy code is UNMAPPED, not an unable applicant',()=>{
    const r=run({requirements:[requirement('SYN-UNKNOWN',{
      topicCodes:['NONEXISTENT_NCS_CODE']})]});
    expect(r[0]).toMatchObject({status:'UNMAPPED',interpretation:'UNKNOWN'});
  });
  it('partial approved taxonomy coverage is NEEDS_REVIEW even with a matched experience',()=>{
    const r=run({requirements:[requirement('SYN-PARTIAL',{
      topicCodes:['STATISTICS','SYN-UNKNOWN-TOPIC']})]});
    expect(r[0]?.status).toBe('NEEDS_REVIEW');
    expect(r[0]?.interpretation).toBe('UNKNOWN');
  });
  it('30 fictional job requirements preserve stable order and no ability/fit probability',()=>{
    const requirements=Array.from({length:30},(_,i)=>requirement('SYN-REQ-'+i));
    const experiences=Array.from({length:30},(_,i)=>experience('SYN-EXP-'+i));
    const rows=run({requirements,experiences});
    expect(rows).toHaveLength(30);
    expect(rows.map(row=>row.requirementId))
      .toEqual(requirements.map(req=>req.id));
    expect(rows.every(row=>row.status==='SUPPORTED_BY_EVIDENCE'
      &&row.ownerEvidenceIds.length===30)).toBe(true);
    expect(JSON.stringify(rows)).not.toContain('employmentProbability');
    expect(JSON.stringify(rows)).not.toContain('abilityLevel');
  });
  it('reversing conflicted registry order never changes the quarantine decision',()=>{
    const a=crosswalk(),b=crosswalk({
      id:'SYN-ALT',source:{...source(),revisionId:'SYN-LATER'},
    });
    for(const crosswalks of [[a,b],[b,a]]){
      expect(run({crosswalk:crosswalks})[0]?.status).toBe('NEEDS_REVIEW');
    }
  });
});
