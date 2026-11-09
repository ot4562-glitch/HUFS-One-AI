import {describe,expect,it} from 'vitest';
import {extractProofCandidate,PROOF_KINDS,type ProofOcrLine} from './proof-ocr.js';
import {classifyProofCandidate} from './recognition-v2.js';
import {recognitionRule} from './v2.fixtures.js';

// Counterexamples from the PR #372 reviews (심민성, 박준영). Synthetic lines and fictional names only.
type Row=[text:string,y:number,confidence?:number];
const doc=(rows:Row[],id='rv'):ProofOcrLine[]=>rows.map(([text,y,confidence=0.96],i)=>
  ({id:id+'-l'+(i+1),text,bboxNorm:[0.1,y,0.9,Math.min(1,y+0.04)],confidence}));
const value=(r:ReturnType<typeof extractProofCandidate>,name:string)=>r.fields.find(f=>f.name===name)?.value;

describe('#372 review: several periods on one OCR line',()=>{
  it.each([
    ['slash','활동기간: 2026.01.01 ~ 2026.01.31 / 2026.02.01 ~ 2026.02.28'],
    ['comma','활동기간: 2026.01.01 ~ 2026.01.31, 2026.02.01 ~ 2026.02.28'],
    ['and','활동기간: 2026-01-01 - 2026-01-31 및 2026-02-01 - 2026-02-28'],
  ])('four dates (%s) raise MULTIPLE_PERIODS and withhold the period',(_name,line)=>{
    const r=extractProofCandidate(doc([['봉사활동 확인서',0.07],[line,0.33],['가상행복복지관 관장',0.8]]),
      {startDate:'2026-01-01',endDate:'2026-01-31'});
    expect(r.flags).toContain('MULTIPLE_PERIODS');
    expect(value(r,'PERIOD_START')).toBeUndefined();
    expect(value(r,'PERIOD_END')).toBeUndefined();
    expect(r.flags).not.toContain('PERIOD_MISMATCH');
  });
  it('one period on one line still compares with the student input',()=>{
    const lines=doc([['봉사활동 확인서',0.07],['활동기간: 2026.01.01 ~ 2026.01.31',0.33],['가상행복복지관 관장',0.8]]);
    const same=extractProofCandidate(lines,{startDate:'2026-01-01',endDate:'2026-01-31'});
    expect(same.flags).not.toContain('MULTIPLE_PERIODS');
    expect([value(same,'PERIOD_START'),value(same,'PERIOD_END')]).toEqual(['2026-01-01','2026-01-31']);
    expect(same.flags).not.toContain('PERIOD_MISMATCH');
    expect(extractProofCandidate(lines,{startDate:'2026-01-01',endDate:'2026-02-28'}).flags).toContain('PERIOD_MISMATCH');
  });
});

describe('#372 review: issuer comparison never matches on a fragment',()=>{
  const lines=doc([['참여확인서',0.07],['참여기간: 2026.09.01 ~ 2026.09.02',0.36],['가상대학교 학생지원센터장',0.82]]);
  it.each(['대학교','센터','가상대학교','다른 가상대학교 학생지원센터'])('%s → ISSUER_UNCERTAIN, not silent match',(org)=>{
    const r=extractProofCandidate(lines,{organization:org});
    expect(value(r,'ISSUER')).toBe('가상대학교 학생지원센터');
    expect(r.flags).toContain('ISSUER_UNCERTAIN');
  });
  it.each(['가상대학교 학생지원센터','가상대학교학생지원센터','가상대학교 학생지원센타'])('%s → same issuer',(org)=>{
    const r=extractProofCandidate(lines,{organization:org});
    expect(r.flags).not.toContain('ISSUER_UNCERTAIN');
    expect(r.flags).not.toContain('ISSUER_MISMATCH');
  });
  it('an unrelated organization is a mismatch',()=>{
    expect(extractProofCandidate(lines,{organization:'가상행복복지관'}).flags).toContain('ISSUER_MISMATCH');
  });
});

describe('#372 review: names without a "성명" label',()=>{
  it('"위 사람 홍길동은 …" is personal data and is masked',()=>{
    const lines=doc([['봉사활동 확인서',0.07],['활동기간: 2026.07.01 ~ 2026.08.31',0.33],
      ['위 사람 홍길동은 가상 봉사활동에 성실히 참여하였음을 확인합니다',0.5],['가상행복복지관 관장 김영희',0.8]]);
    const r=extractProofCandidate(lines);
    expect(r.personalDataLineIds).toContain('rv-l3');
    expect(r.flags).toContain('CONTAINS_PERSONAL_DATA');
    expect(r.maskedLineIds).toEqual(expect.arrayContaining(['rv-l2','rv-l3','rv-l4']));
    expect(r.maskedLineIds).not.toContain('rv-l1');
    expect(r.fields.map(f=>f.quote).join(' ')).not.toMatch(/홍길동|김영희/);
  });
  it('"위 사람은 …" without a name is not counted as personal data',()=>{
    const r=extractProofCandidate(doc([['수료증',0.08],['위 사람은 본 교육과정을 성실히 이수하였기에 이 증서를 수여합니다.',0.48]]));
    expect(r.personalDataLineIds).toEqual([]);
    expect(r.maskedLineIds).toEqual(['rv-l2']);
  });
});

describe('#372 review: kind codes and line ids',()=>{
  it('the report kind uses the same code as recognition rules',()=>{
    expect(PROOF_KINDS).toContain('REPORT');
    const r=extractProofCandidate(doc([['활동 결과보고서',0.06],['활동기간: 2026.09.01 - 2026.10.31',0.22],
      ['활동내용: 가상 교내 멘토링',0.3],['느낀점: 설명하는 능력이 늘었다.',0.45]]));
    expect(r.proposedKind).toBe('REPORT');
    expect(classifyProofCandidate({rule:recognitionRule(),assetId:'asset-r',proposedKind:r.proposedKind,evidencePage:0,
      confidence:0.95,ownerConfirmed:true}).status).not.toBe('REJECTED');
  });
  it('a repeated line id is rejected instead of hiding a low-confidence line',()=>{
    const lines=doc([['수료증',0.08,0.95],['가상미래교육재단 이사장',0.82,0.5]]).map(l=>({...l,id:'dup'}));
    expect(()=>extractProofCandidate(lines)).toThrow(/Duplicate OCR line id/);
  });
});
