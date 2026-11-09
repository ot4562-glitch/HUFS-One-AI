import {describe,expect,it} from 'vitest';
import {extractProofCandidate,type ProofFieldName} from './proof-ocr.js';
import {PROOF_OCR_CASES} from './proof-ocr.fixtures.js';
import {PROOF_OCR_HOLDOUT} from './proof-ocr.holdout.js';
import {classifyProofCandidate,prepareRecognitionV2} from './recognition-v2.js';
import {FIXED_NOW,proof,recognitionRule} from './v2.fixtures.js';

const value=(r:ReturnType<typeof extractProofCandidate>,name:ProofFieldName)=>r.fields.find(f=>f.name===name)?.value;

describe('#346 OCR proof candidate extraction (synthetic lines, not OCR accuracy or human Gold)',()=>{
  it.each(PROOF_OCR_CASES.map(c=>[c.id,c] as const))('%s',(_id,c)=>{
    const r=extractProofCandidate(c.lines,c.claimed);
    const e=c.expect;
    expect(r.proposedKind).toBe(e.kind);
    if(e.issuer)expect(value(r,'ISSUER')).toBe(e.issuer);
    if(e.start)expect(value(r,'PERIOD_START')).toBe(e.start);
    if(e.end)expect(value(r,'PERIOD_END')).toBe(e.end);
    if(e.issued)expect(value(r,'ISSUED_ON')).toBe(e.issued);
    if(e.hours)expect(value(r,'HOURS')).toBe(e.hours);
    if(e.award)expect(value(r,'AWARD_TITLE')).toBe(e.award);
    for(const f of e.flags||[])expect(r.flags).toContain(f);
    for(const f of e.noFlags||[])expect(r.flags).not.toContain(f);
  });
  it('binds every value to one source line, copies its quote, and never reads a personal-data line',()=>{
    for(const c of [...PROOF_OCR_CASES,...PROOF_OCR_HOLDOUT]){
      const r=extractProofCandidate(c.lines,c.claimed);
      expect(r).toMatchObject({reviewStatus:'NEEDS_REVIEW',source:'OCR',officiallyVerified:false});
      expect(r.confidence).toBeGreaterThanOrEqual(0);expect(r.confidence).toBeLessThanOrEqual(1);
      for(const f of r.fields){
        const line=c.lines.find(l=>l.id===f.lineId)!;
        expect(line,c.id+':'+f.name).toBeDefined();
        expect(line.text.normalize('NFKC')).toContain(f.quote);
        expect(f.bboxNorm).toEqual(line.bboxNorm);
        expect(r.personalDataLineIds).not.toContain(f.lineId);
      }
    }
  });
  // Measured once on 2026-11-08: kind 9/10, issuer 6/7, period/issue date/hours/award all correct.
  // The floors guard regressions; the invariant is that a miss abstains instead of guessing.
  it('held-out documents: misses abstain (UNKNOWN or no field), never a different confident value',()=>{
    let kinds=0,issuers=0;
    for(const c of PROOF_OCR_HOLDOUT){
      const r=extractProofCandidate(c.lines,c.claimed);
      expect([c.expect.kind,'UNKNOWN'],c.id).toContain(r.proposedKind);
      if(r.proposedKind===c.expect.kind)kinds++;
      if(c.expect.issuer){
        expect([c.expect.issuer,undefined],c.id).toContain(value(r,'ISSUER'));
        if(value(r,'ISSUER')===c.expect.issuer)issuers++;
      }
      for(const name of ['PERIOD_START','PERIOD_END','ISSUED_ON','HOURS','AWARD_TITLE'] as const){
        const key={PERIOD_START:'start',PERIOD_END:'end',ISSUED_ON:'issued',HOURS:'hours',AWARD_TITLE:'award'}[name];
        const want=c.expect[key as 'start'];
        if(want)expect([want,undefined],c.id+':'+name).toContain(value(r,name));
      }
    }
    expect(PROOF_OCR_HOLDOUT).toHaveLength(10);
    expect(kinds).toBeGreaterThanOrEqual(9);
    expect(issuers).toBeGreaterThanOrEqual(6);
  });
  it('never turns a birth date or student number into a period, issue date or issuer',()=>{
    const r=extractProofCandidate(PROOF_OCR_CASES.find(c=>c.id==='volunteer')!.lines);
    expect(r.fields.map(f=>f.value).join(' ')).not.toMatch(/2003|홍길동|202312345/);
  });
  it('treats instructions inside the document as text, not as a status change',()=>{
    const r=extractProofCandidate(PROOF_OCR_CASES.find(c=>c.id==='injection-text')!.lines);
    expect(r.officiallyVerified).toBe(false);
    expect(r.reviewStatus).toBe('NEEDS_REVIEW');
  });
  it('hands a reviewed candidate to the existing checklist without granting recognition',()=>{
    const rule=recognitionRule({documentGroups:[{id:'g1',join:'ALL',kinds:['CERTIFICATE','PARTICIPATION_PROOF']}]});
    const cert=extractProofCandidate(PROOF_OCR_CASES.find(c=>c.id==='cert')!.lines);
    const before=classifyProofCandidate({rule,assetId:'asset-1',proposedKind:cert.proposedKind,evidencePage:0,
      confidence:cert.confidence,ownerConfirmed:false});
    expect(before.status).toBe('NEEDS_REVIEW');
    const after=classifyProofCandidate({rule,assetId:'asset-1',proposedKind:cert.proposedKind,evidencePage:0,
      confidence:cert.confidence,ownerConfirmed:true});
    expect(after).toMatchObject({status:'OWNER_CONFIRMED_CANDIDATE',documentKind:'CERTIFICATE'});
    const receipt=extractProofCandidate(PROOF_OCR_CASES.find(c=>c.id==='receipt')!.lines);
    expect(classifyProofCandidate({rule,assetId:'asset-2',proposedKind:receipt.proposedKind,evidencePage:0,
      confidence:receipt.confidence,ownerConfirmed:true}).status).toBe('REJECTED');
    const report=prepareRecognitionV2({rule,activity:{id:'A1',kind:'VOLUNTEER',endedAt:'2026-06-20T00:00:00+09:00'},
      proofs:[proof('CERTIFICATE',{activityId:'A1'})],asOf:FIXED_NOW});
    expect(report).toMatchObject({status:'DOCUMENTS_PENDING',missingKinds:['PARTICIPATION_PROOF'],officiallyRecognized:false});
  });
});
