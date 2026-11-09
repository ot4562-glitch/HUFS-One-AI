import {describe,expect,it} from 'vitest';
import type {FeatureAdditions as C} from '@hufs-one/contracts';
import {compareSkillsWithCandidates,proposeSkillMatches,scoreSkillMatch,skillMatchInputDigest} from './skills-semantic.js';
import {reviewSkillMatchProposals} from './skills-v2.js';
import {SKILL_CROSSWALK,SKILL_EXPERIENCES,SKILL_EXPERIENCE_TEXT,SKILL_GOLD,SKILL_REQUIREMENTS} from './skills-semantic.fixtures.js';
import {SKILL_HOLDOUT_EXPERIENCES,SKILL_HOLDOUT_GOLD,SKILL_HOLDOUT_REQUIREMENTS,SKILL_HOLDOUT_TEXT} from './skills-semantic.holdout.js';
import {FIXED_NOW,source} from './v2.fixtures.js';

const base={requirements:SKILL_REQUIREMENTS,experiences:SKILL_EXPERIENCES,crosswalk:SKILL_CROSSWALK,
  texts:SKILL_EXPERIENCE_TEXT,asOf:FIXED_NOW};
function pairs(rows:ReturnType<typeof compareSkillsWithCandidates>['rows']){
  return new Set(rows.flatMap(r=>[...r.ownerEvidenceIds,...r.candidateExperienceIds].map(e=>r.requirementId+'::'+e)));
}
function measure(gold:Readonly<Record<string,readonly string[]>>,got:Set<string>){
  const g=new Set(Object.entries(gold).flatMap(([r,es])=>es.map(e=>r+'::'+e)));
  const tp=[...got].filter(p=>g.has(p)).length;
  return {gold:g.size,proposed:got.size,tp};
}

describe('#347 skill-gap semantic candidates (synthetic, not human Gold)',()=>{
  // Measured 2026-11-08. Floors guard regressions; rule-only and AI-assisted are reported separately.
  it('main set: rule-only P 21/45 R 21/30; AI-assisted P 30/60 R 30/30',()=>{
    expect(measure(SKILL_GOLD,pairs(compareSkillsWithCandidates({...base,semantic:false}).rows)))
      .toEqual({gold:30,proposed:45,tp:21});
    const ai=measure(SKILL_GOLD,pairs(compareSkillsWithCandidates({...base,semantic:true}).rows));
    expect(ai.gold).toBe(30);
    expect(ai.tp).toBeGreaterThanOrEqual(30);
    expect(ai.proposed).toBeLessThanOrEqual(60);
  });
  it('held-out set (measured once): rule-only 6/7 found 6/8; AI-assisted 8/9 found 8/8',()=>{
    const run=(semantic:boolean)=>measure(SKILL_HOLDOUT_GOLD,pairs(compareSkillsWithCandidates({
      requirements:SKILL_HOLDOUT_REQUIREMENTS,experiences:SKILL_HOLDOUT_EXPERIENCES,crosswalk:[],
      texts:SKILL_HOLDOUT_TEXT,asOf:FIXED_NOW,semantic}).rows));
    expect(run(false)).toEqual({gold:8,proposed:7,tp:6});
    const ai=run(true);
    expect(ai.tp).toBeGreaterThanOrEqual(8);
    expect(ai.proposed).toBeLessThanOrEqual(9);
  });
  it('a candidate never becomes evidence: missing rows reopen as NEEDS_REVIEW, supported rows keep their evidence',()=>{
    const rule=compareSkillsWithCandidates({...base,semantic:false});
    const ai=compareSkillsWithCandidates({...base,semantic:true});
    expect(rule.rankingMode).toBe('RULE_ONLY');
    expect(ai.rankingMode).toBe('AI_ASSISTED');
    expect(rule.rows.every(r=>r.candidateExperienceIds.length===0)).toBe(true);
    for(const [i,row] of ai.rows.entries()){
      const before=rule.rows[i]!;
      expect(row.ownerEvidenceIds).toEqual(before.ownerEvidenceIds);
      for(const id of row.candidateExperienceIds)expect(row.ownerEvidenceIds).not.toContain(id);
      if(before.status==='SUPPORTED_BY_EVIDENCE')expect(row.status).toBe('SUPPORTED_BY_EVIDENCE');
      if(row.status==='SUPPORTED_BY_EVIDENCE')expect(before.status).toBe('SUPPORTED_BY_EVIDENCE');
      if(row.candidateExperienceIds.length&&before.status!=='SUPPORTED_BY_EVIDENCE')expect(row.status).toBe('NEEDS_REVIEW');
    }
    // E18 (학생회 예산 편성·결산, no topic code): R20 had no record, so it reopens for review only.
    expect(rule.rows.find(r=>r.requirementId==='R20')!.status).toBe('EVIDENCE_MISSING');
    expect(ai.rows.find(r=>r.requirementId==='R20')).toMatchObject({status:'NEEDS_REVIEW',
      ownerEvidenceIds:[],candidateExperienceIds:['E18']});
    // R26 already has rule evidence (E01 via crosswalk); E02 is attached as a candidate, not evidence.
    expect(ai.rows.find(r=>r.requirementId==='R26')).toMatchObject({status:'SUPPORTED_BY_EVIDENCE',
      ownerEvidenceIds:['E01'],candidateExperienceIds:['E02']});
  });
  it('excludes protected-trait requirements and words, and never proposes unapproved experiences',()=>{
    const p=proposeSkillMatches(base);
    expect(p.excludedRequirementIds).toEqual(['R30']);
    expect(p.proposals.some(x=>x.candidateId==='R30')).toBe(false);
    expect(p.proposals.flatMap(x=>x.evidenceCodes).some(c=>c.endsWith('::E29')||c.endsWith('::E30'))).toBe(false);
    expect(compareSkillsWithCandidates({...base,semantic:true}).rows.find(r=>r.requirementId==='R30')!.candidateExperienceIds).toEqual([]);
    expect(scoreSkillMatch('여성 리더십','여성 고객 응대')).toMatchObject({score:0,sharedConcepts:[]});
  });
  it('proposals are bound to the exact texts and survive the existing review gate only untampered',()=>{
    const p=proposeSkillMatches(base);
    const ok=reviewSkillMatchProposals({requirements:SKILL_REQUIREMENTS,experiences:SKILL_EXPERIENCES,
      proposals:p.proposals,inputDigest:p.inputDigest});
    expect(ok.length).toBeGreaterThan(0);
    expect(ok.every(r=>r.status==='NEEDS_OWNER_REVIEW')).toBe(true);
    expect(reviewSkillMatchProposals({requirements:SKILL_REQUIREMENTS,experiences:SKILL_EXPERIENCES,
      proposals:p.proposals,inputDigest:'0'.repeat(64)})).toEqual([]);
    const forged:C.SemanticProposal[]=[{...p.proposals[0]!,evidenceCodes:[p.proposals[0]!.candidateId+'::E99']}];
    expect(reviewSkillMatchProposals({requirements:SKILL_REQUIREMENTS,experiences:SKILL_EXPERIENCES,
      proposals:forged,inputDigest:p.inputDigest})).toEqual([]);
    const edited=SKILL_EXPERIENCE_TEXT.map(t=>t.id==='E02'?{...t,text:t.text+' 수정'}:t);
    expect(skillMatchInputDigest(SKILL_REQUIREMENTS,edited)).not.toBe(p.inputDigest);
  });
  it('a revoked requirement source yields no candidates',()=>{
    const revoked=SKILL_REQUIREMENTS.map(r=>r.id==='R20'?{...r,source:{...source('syn-ncs-r1'),status:'REVOKED' as const}}:r);
    const row=compareSkillsWithCandidates({...base,requirements:revoked,semantic:true}).rows.find(r=>r.requirementId==='R20')!;
    expect(row).toMatchObject({status:'NEEDS_REVIEW',candidateExperienceIds:[]});
  });
});
