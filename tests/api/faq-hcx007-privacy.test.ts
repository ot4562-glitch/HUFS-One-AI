import {describe,expect,it} from 'vitest';
import type {FaqEvidence} from '../../packages/core/src/campus-assist/faq.js';
import {buildFaqHcx007Request} from '../../packages/ai/src/faq-hcx007.js';
import {retrieveFaqEvidence} from '../../packages/core/src/campus-assist/faq.js';
import {faqEvidenceIsModelSafe} from '../../packages/core/src/campus-assist/faq-privacy.js';

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
  it('#508 allows only explicitly reviewed office contacts from the current paragraph',()=>{
    const text='가상 학사 FAQ 문의처는 02-1234-5678 및 office@example.org입니다.';
    const reviewed={...evidence,text,publicContacts:['02-1234-5678','office@example.org']};
    expect(()=>buildFaqHcx007Request('가상 학사 FAQ 문의',[reviewed])).not.toThrow();
    const wire=buildFaqHcx007Request('제 메일은 office@example.org입니다',[reviewed]);
    expect(JSON.parse(wire.body.messages[1]!.content).question).toContain('[이메일]');
    expect(JSON.parse(wire.body.messages[1]!.content).context[0].text).toBe(text);
  });
  it.each(['학번은 202012345입니다.','010-1234-5678입니다.','개인 메일 student@example.org입니다.'])
    ('#508 still rejects personal data beside an approved contact: %s',personal=>{
      expect(()=>buildFaqHcx007Request('가상 FAQ 문의',[{...evidence,
        text:'부서 문의 office@example.org. '+personal,
        publicContacts:['office@example.org'],
      }])).toThrow();
    });
  it('#508 never inherits another paragraph or previous revision contact approval',()=>{
    const doc={documentId:'SYN-CONTACT',revisionId:'r1',title:'가상 학사 문의',
      sourceUrl:'https://example.org/synthetic/faq',category:'ACADEMICS' as const,
      publishedAt:'2026-11-01T00:00:00Z',verifiedAt:'2026-11-01T00:00:00Z',
      effectiveFrom:'2026-11-01',rights:'APPROVED' as const,provenance:'SYNTHETIC' as const,accessScope:'PUBLIC' as const,
      paragraphs:[
        {id:'reviewed',text:'가상 학사 문의 office@example.org',publicContacts:['office@example.org']},
        {id:'unreviewed',text:'가상 학사 문의 student@example.org'},
      ]};
    const retrieved=retrieveFaqEvidence('가상 학사 문의',[doc],'2026-11-12T00:00:00Z');
    expect(retrieved).toHaveLength(2);
    expect(retrieved.filter(faqEvidenceIsModelSafe).map(e=>e.citationId)).toEqual(['SYN-CONTACT:r1:reviewed']);
    const next={...doc,revisionId:'r2',publishedAt:'2026-11-02T00:00:00Z',
      paragraphs:[{id:'reviewed',text:'가상 학사 문의 office@example.org'}]};
    expect(retrieveFaqEvidence('가상 학사 문의',[doc,next],'2026-11-12T00:00:00Z')
      .filter(faqEvidenceIsModelSafe)).toEqual([]);
  });
  it('#508 never exempts a labelled student ID merely because its value matches an office phone',()=>{
    expect(()=>buildFaqHcx007Request('가상 FAQ 문의',[{...evidence,
      text:'가상 FAQ의 학번은 02-1234-5678입니다.',publicContacts:['02-1234-5678'],
    }])).toThrow('personal identifiers');
  });
  it.each([['010-1234-5678'],['202012345'],['office@example.org','office@example.org'],['absent@example.org']])
    ('#508 rejects malformed, mobile or unbound public-contact metadata: %j',(...contacts)=>{
      expect(()=>buildFaqHcx007Request('가상 FAQ 문의',[{...evidence,
        text:'가상 학사 FAQ 문의 office@example.org, 010-1234-5678, 202012345',
        publicContacts:contacts,
      }])).toThrow();
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
