import {describe,expect,it} from 'vitest';
import {compareSkillsWithCandidates,proposeSkillMatches,scoreSkillMatch,skillMatchInputDigest} from './skills-semantic.js';
import {SKILL_CROSSWALK,SKILL_EXPERIENCES,SKILL_EXPERIENCE_TEXT,SKILL_REQUIREMENTS} from './skills-semantic.fixtures.js';
import {FIXED_NOW,source} from './v2.fixtures.js';

// Counterexamples from the PR #386 reviews (심민성, 박준영). Synthetic rows only.
const base={requirements:SKILL_REQUIREMENTS,experiences:SKILL_EXPERIENCES,crosswalk:SKILL_CROSSWALK,
  texts:SKILL_EXPERIENCE_TEXT,asOf:FIXED_NOW,semantic:true};
const row=(r:ReturnType<typeof compareSkillsWithCandidates>,id:string)=>r.rows.find(x=>x.requirementId===id);

describe('#386 review: one ID with two editions is quarantined, whatever the order',()=>{
  const r20=SKILL_REQUIREMENTS.find(r=>r.id==='R20')!;
  const revokedTwin={...r20,source:{...source('syn-ncs-r1'),status:'REVOKED' as const}};
  it('normal input: R20 gets the E18 candidate',()=>{
    expect(row(compareSkillsWithCandidates(base),'R20')!.candidateExperienceIds).toEqual(['E18']);
  });
  it.each([['revoked first',[revokedTwin,r20]],['verified first',[r20,revokedTwin]]])
  ('requirement: %s → no candidates on any R20 row',(_name,pair)=>{
    const requirements=[...SKILL_REQUIREMENTS.filter(r=>r.id!=='R20'),...pair];
    const out=compareSkillsWithCandidates({...base,requirements});
    expect(out.rows.filter(x=>x.requirementId==='R20').every(x=>x.candidateExperienceIds.length===0)).toBe(true);
    expect(out.excludedRequirementIds).toContain('R20');
    expect(row(out,'R01')!.candidateExperienceIds.length+row(out,'R01')!.ownerEvidenceIds.length).toBeGreaterThan(0);
  });
  const e18=SKILL_EXPERIENCES.find(e=>e.id==='E18')!;
  const unapprovedTwin={...e18,approved:false,version:e18.version+'-draft'};
  it.each([['unapproved first',[unapprovedTwin,e18]],['approved first',[e18,unapprovedTwin]]])
  ('experience: %s → E18 is never proposed',(_name,pair)=>{
    const experiences=[...SKILL_EXPERIENCES.filter(e=>e.id!=='E18'),...pair];
    const p=proposeSkillMatches({...base,experiences});
    expect(p.excludedExperienceIds).toEqual(['E18']);
    expect(p.proposals.flatMap(x=>x.evidenceCodes).some(c=>c.endsWith('::E18'))).toBe(false);
    expect(row(compareSkillsWithCandidates({...base,experiences}),'R20')!.candidateExperienceIds).toEqual([]);
  });
  it('a repeated text ID is quarantined too',()=>{
    const texts=[...SKILL_EXPERIENCE_TEXT,{id:'E18',text:'방송 편성표 정리'}];
    expect(proposeSkillMatches({...base,texts}).excludedExperienceIds).toEqual(['E18']);
  });
});

describe('#386 review: protected traits are matched in context, not as substrings',()=>{
  it.each(['서버 장애 대응 및 모니터링 경험','시스템 장애 원인 분석과 보고서 작성','나이키 브랜드 마케팅 캠페인 기획'])
  ('%s stays in matching',(label)=>{
    expect(scoreSkillMatch(label,label).sharedConcepts.length).toBeGreaterThan(0);
  });
  it.each(['장애인 우대','장애 여부 확인','나이 제한 만 29세 이하','성별 무관'])('%s is excluded',(label)=>{
    const requirements=[{...SKILL_REQUIREMENTS[0]!,id:'RX',label}];
    expect(proposeSkillMatches({...base,requirements}).excludedRequirementIds).toEqual(['RX']);
  });
});

describe('#386 review: a two-letter term inside an unrelated word is not a concept',()=>{
  it.each([['예산 편성 및 집행 경험','학생회 집행부 활동'],['예산 결산','방송 편성표 정리']])('%s ← %s',(req,exp)=>{
    const s=scoreSkillMatch(req,exp);
    expect(s.sharedConcepts).not.toContain('BUDGET');
    expect(s.score).toBeLessThan(0.55);
  });
  it('glued compounds and suffixes still count',()=>{
    expect(scoreSkillMatch('예산편성','학생회 예산을 편성했다').sharedConcepts).toContain('BUDGET');
    expect(scoreSkillMatch('행사 예산안 작성','학생회 예산안을 짰다').sharedConcepts).toContain('BUDGET');
    expect(scoreSkillMatch('데이터분석','엑셀로 매출을 분석했다').sharedConcepts).toEqual(['ANALYSIS','DATA']);
  });
});

describe('#386 review: the input digest binds approved experience versions',()=>{
  it('same text, new approved version → different digest',()=>{
    const v1=[{id:'E01',version:'exp-r1',approved:true}],v9=[{id:'E01',version:'exp-r9',approved:true}];
    const texts=[{id:'E01',text:'같은 글'}];
    expect(skillMatchInputDigest(SKILL_REQUIREMENTS,texts,v1)).not.toBe(skillMatchInputDigest(SKILL_REQUIREMENTS,texts,v9));
  });
  it('proposals carry the version-bound digest',()=>{
    const p=proposeSkillMatches(base);
    const bumped=SKILL_EXPERIENCES.map(e=>e.id==='E18'?{...e,version:e.version+'-r9'}:e);
    expect(proposeSkillMatches({...base,experiences:bumped}).inputDigest).not.toBe(p.inputDigest);
  });
});
