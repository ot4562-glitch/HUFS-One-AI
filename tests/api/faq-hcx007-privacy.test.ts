import {describe,expect,it} from 'vitest';
import type {FaqEvidence} from '../../packages/core/src/campus-assist/faq.js';
import {buildFaqHcx007Request} from '../../packages/ai/src/faq-hcx007.js';

const evidence: FaqEvidence={
  citationId:'SYN-DOC:SYN-REV:p1',documentId:'SYN-DOC',revisionId:'SYN-REV',
  title:'가상 학교 FAQ',sourceUrl:'https://example.org/synthetic/faq',
  verifiedAt:'2026-11-01T00:00:00Z',
  text:'가상 학사 FAQ에서는 현재 모집 안내를 공식 출처에서 확인합니다.',
  provenance:'SYNTHETIC',
};
const build=(text:string,e:readonly FaqEvidence[]=[evidence])=>
  buildFaqHcx007Request('가상 학교 FAQ 설명을 알려줘',e.map(v=>({...v,text})));
describe('#341 HCX pre-admission privacy and rights separation (zero provider calls)',()=>{
  it('builds strictly offline and sends only a masked question and authorized evidence',()=>{
    const wire=buildFaqHcx007Request('제 학번은 2020-12345인데 가상 학사 FAQ 알려줘',[evidence]);
    expect(wire.path).toBe('/v3/chat-completions/HCX-007');
    const context=wire.body.messages[1]!.content;
    expect(context).not.toContain('2020-12345');
    expect(context).toContain('[학번]');
    expect(context).toContain(evidence.citationId);
    expect(wire.body.responseFormat.type).toBe('json');
  });
  it.each([
    ['labelled student number','가상 학사 FAQ에는 학번은 2020-12345입니다.'],
    ['school email','가상 학사 FAQ는 test@example.org 주소로 안내합니다.'],
    ['phone number','가상 학사 FAQ의 신청 번호는 010-1234-5678입니다.'],
    ['sensitive Korean name','가상 학사 FAQ 담당자 이름은 홍길동입니다.'],
    ['unlabelled long ID','가상 학사 FAQ의 인증 코드는 1234567890 입니다.'],
  ])('fails closed on source paragraph containing %s',(_name,raw)=>{
    expect(()=>build(raw)).toThrow('personal identifiers');
  });
  it('allows current school-like public facts containing an ordinary year and deadline',()=>{
    expect(()=>build('가상 2026-12-03 일정 안내는 공식 홈페이지에서 확인합니다.'))
      .not.toThrow();
  });
  it('rejects mixed real/synthetic source paragraphs before model execution',()=>{
    expect(()=>buildFaqHcx007Request('가상 학사 문의',[
      evidence,{...evidence,citationId:'REAL-DOC:REAL-REV:p1',documentId:'REAL-DOC',
        revisionId:'REAL-REV',provenance:'REAL_APPROVED'},
    ])).toThrow(/Mixed FAQ source modes/);
  });
  it('rejects an ambiguous ID repeated in multiple authorized paragraphs',()=>{
    expect(()=>buildFaqHcx007Request('가상 학사 문의',[evidence,{...evidence}]))
      .toThrow('Duplicate FAQ citation');
  });
  it('refuses empty source evidence before budget admission',()=>{
    expect(()=>buildFaqHcx007Request('가상 학사 문의',[])).toThrow('Invalid HCX FAQ input');
  });
});
