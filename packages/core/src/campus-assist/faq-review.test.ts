import {describe,expect,it} from 'vitest';
import type {FaqCandidate,FaqDocument} from '@hufs-one/contracts';
import {checkFaqCandidate} from './faq-guard.js';
import {maskFaqQuestion} from './faq-privacy.js';
import {faqWords} from './faq-text.js';
import {retrieveFaqEvidence} from './faq.js';
// Counterexamples from the PR #361 reviews (심민성, 박준영), synthetic values only.
const NOW='2026-11-08T00:00:00Z';
const make=(documentId:string,title:string,text:string,patch:Partial<FaqDocument>={}):FaqDocument=>({
  documentId,revisionId:'r1',title,sourceUrl:'https://example.org/synthetic-faq',category:'ACADEMICS',
  publishedAt:'2026-01-01T00:00:00Z',verifiedAt:'2026-01-02T00:00:00Z',effectiveFrom:'2026-01-01',
  rights:'APPROVED',provenance:'SYNTHETIC',accessScope:'PUBLIC',paragraphs:[{id:'p1',text}],...patch,
});
const ids=(q:string,docs:readonly FaqDocument[])=>retrieveFaqEvidence(q,docs,NOW).map(e=>e.documentId);

describe('#361 review: citation IDs never collide across documents',()=>{
  const a=make('SYN-A','가상 교환학생 평점','가상 교환학생 지원자는 총평점평균 3.0 이상이어야 합니다.');
  const b=make('SYN-B','가상 교환학생 어학','가상 교환학생 지원자는 어학 점수를 제출해야 합니다.');
  it('two documents with the same revision and paragraph IDs both stay retrievable',()=>{
    const evidence=retrieveFaqEvidence('교환학생 지원자',[a,b],NOW);
    expect(evidence.map(e=>e.documentId).sort()).toEqual(['SYN-A','SYN-B']);
    expect(new Set(evidence.map(e=>e.citationId)).size).toBe(2);
  });
  it('same IDs with mixed provenance still fail closed instead of one silently replacing the other',()=>{
    const real={...b,provenance:'REAL_APPROVED' as const};
    expect(()=>retrieveFaqEvidence('교환학생 지원자',[a,real],NOW)).toThrow(/Mixed/);
  });
  it('a repeated paragraph ID inside one document fails closed',()=>{
    const twice=make('SYN-A','가상 교환학생 평점','가상 교환학생 지원자는 총평점평균 3.0 이상이어야 합니다.',
      {paragraphs:[{id:'p1',text:'가상 교환학생 지원자는 총평점평균 3.0 이상이어야 합니다.'},{id:'p1',text:'가상 교환학생 지원 서류는 포털로 냅니다.'}]});
    expect(()=>retrieveFaqEvidence('교환학생 지원자',[twice],NOW)).toThrow(/Ambiguous/);
  });
});

describe('#361 review: nouns whose last letter looks like a particle keep their topic',()=>{
  it.each([
    ['강의 평가 기간은 언제야',['강의','평가','기간']],
    ['진로 상담 신청',['진로','상담','신청']],
    ['장학 제도 문의',['장학','제도','문의']],
    ['추가 신청',['추가','신청']],
  ])('%s',(q,words)=>{expect(faqWords(q)).toEqual(words);});
  it('a one-letter verb fragment is still dropped',()=>{
    expect(faqWords('휴학계 어디서 내요')).toEqual(['휴학계']);
  });
  const docs=[
    make('SYN-EVAL','가상 강의 평가 안내','가상 강의 평가 기간은 학기 말 2주입니다.'),
    make('SYN-LEAVE','가상 휴학 신청 기간','가상 휴학 신청 기간은 개강 전 2주입니다.'),
    make('SYN-CAREER','가상 진로 상담 신청','가상 진로 상담 신청은 경력개발센터에서 받습니다.'),
    make('SYN-MIND','가상 심리 상담 신청','가상 심리 상담 신청은 학생상담센터에서 받습니다.'),
  ];
  it('retrieves the paragraph the question is about',()=>{
    expect(ids('강의 평가 기간은 언제야',docs)[0]).toBe('SYN-EVAL');
    expect(ids('진로 상담 신청은 어디서 해',docs)[0]).toBe('SYN-CAREER');
  });
});

describe('#361 review: FAQ effective dates are KST days on the absolute instant',()=>{
  const doc=make('SYN-KST','가상 교환학생 평점','가상 교환학생 지원자는 총평점평균 3.0 이상이어야 합니다.',{effectiveFrom:'2026-11-08'});
  it('the same instant gives the same answer in KST and UTC',()=>{
    expect(retrieveFaqEvidence('교환학생 평점',[doc],'2026-11-08T00:30:00+09:00')).toHaveLength(1);
    expect(retrieveFaqEvidence('교환학생 평점',[doc],'2026-11-07T15:30:00Z')).toHaveLength(1);
    expect(retrieveFaqEvidence('교환학생 평점',[doc],'2026-11-07T14:59:59Z')).toHaveLength(0);
  });
});

describe('#361 review: negation polarity is compared sentence by sentence',()=>{
  const doc=make('SYN-CORR','가상 수강 정정','가상 수강 정정은 별도 신청서 없이 포털에서 직접 할 수 있습니다. 정정 기간은 개강 후 1주입니다.');
  const ev=retrieveFaqEvidence('수강 정정 포털',[doc],NOW);
  const id=ev[0]!.citationId;
  const cand=(answer:string,quote:string):FaqCandidate=>({answer,citations:[{citationId:id,quote}],needsHumanConfirmation:true,suggestedLinks:[]});
  it('"없이" elsewhere in the source no longer covers a flipped "할 수 없습니다"',()=>{
    expect(checkFaqCandidate(cand('가상 수강 정정은 포털에서 직접 할 수 없습니다.','포털에서 직접 할 수 있습니다.'),ev))
      .toContain('NEGATION_NOT_IN_SOURCE');
    expect(checkFaqCandidate(cand('가상 수강 정정은 별도 신청서 없이 포털에서 직접 할 수 없습니다.',
      '별도 신청서 없이 포털에서 직접 할 수 있습니다.'),ev)).toContain('NEGATION_NOT_IN_SOURCE');
  });
  it('the faithful answer, including adverbial "없이", passes',()=>{
    expect(checkFaqCandidate(cand('가상 수강 정정은 별도 신청서 없이 포털에서 직접 할 수 있습니다.',
      '별도 신청서 없이 포털에서 직접 할 수 있습니다.'),ev)).toEqual([]);
  });
  it('dropping a source negation is rejected too',()=>{
    const no=make('SYN-NO','가상 수강 취소','가상 수강 취소는 학기 중간 이후에는 할 수 없습니다.');
    const e2=retrieveFaqEvidence('수강 취소',[no],NOW);
    expect(checkFaqCandidate({answer:'가상 수강 취소는 학기 중간 이후에도 할 수 있습니다.',
      citations:[{citationId:e2[0]!.citationId,quote:'학기 중간 이후에는 할 수 없습니다.'}],
      needsHumanConfirmation:true,suggestedLinks:[]},e2)).toContain('NEGATION_DROPPED');
  });
});

describe('#361 review: incidental adjective negation cannot reverse the main assertion',()=>{
  const doc=make('SYN-LEAVE-POL','가상 휴학 상시 접수',
    '가상 휴학은 기간 제한 없는 상시 접수로 포털에서 신청할 수 있습니다. 단 접수 완료 후 취소할 수 없습니다.');
  const ev=retrieveFaqEvidence('휴학 상시 접수 포털',[doc],NOW);
  const cand=(answer:string,quote:string):FaqCandidate=>({answer,
    citations:[{citationId:ev[0]!.citationId,quote}],
    needsHumanConfirmation:true,suggestedLinks:[]});
  it('rejects an inverted application permission despite the adjective "없는"',()=>{
    expect(checkFaqCandidate(cand('가상 휴학은 포털에서 신청할 수 없습니다.',
      '포털에서 신청할 수 있습니다.'),ev)).toContain('NEGATION_NOT_IN_SOURCE');
  });
  it('accepts the positive permission while preserving "제한 없는"',()=>{
    expect(checkFaqCandidate(cand('가상 휴학은 기간 제한 없는 상시 접수로 포털에서 신청할 수 있습니다.',
      '기간 제한 없는 상시 접수로 포털에서 신청할 수 있습니다.'),ev)).toEqual([]);
  });
  it('does not confuse the negative cancellation clause with the positive application clause',()=>{
    expect(checkFaqCandidate(cand('포털에서 신청할 수 없습니다.',
      '포털에서 신청할 수 있습니다.'),ev)).toContain('NEGATION_NOT_IN_SOURCE');
    expect(checkFaqCandidate(cand('접수 완료 후 취소할 수 없습니다.',
      '접수 완료 후 취소할 수 없습니다.'),ev)).toEqual([]);
  });
  it('also rejects a positive reversal of the explicitly negative cancellation claim',()=>{
    expect(checkFaqCandidate(cand('접수 완료 후 취소할 수 있습니다.',
      '접수 완료 후 취소할 수 없습니다.'),ev)).toContain('NEGATION_DROPPED');
  });
});

describe('#341 follow-up: "못하다" and "안 되다" flip polarity too (박준영 review on main 4e1a962)',()=>{
  const doc=make('SYN-LEAVE-NEG','가상 휴학 상시 접수',
    '가상 휴학은 기간 제한 없는 상시 접수로 포털에서 신청할 수 있습니다. 결과는 문자로 안내됩니다.');
  const ev=retrieveFaqEvidence('휴학 상시 접수 포털',[doc],NOW);
  const cand=(answer:string,quote:string):FaqCandidate=>({answer,
    citations:[{citationId:ev[0]!.citationId,quote}],
    needsHumanConfirmation:true,suggestedLinks:[]});
  it.each([
    '가상 휴학은 포털에서 신청하지 못합니다.',
    '가상 휴학은 포털에서 신청하지 못해요.',
    '가상 휴학은 포털에서 신청하지 못했습니다.',
    '가상 휴학은 포털에서 신청이 안 됩니다.',
    '가상 휴학은 포털에서 신청이 안돼요.',
    '가상 휴학은 포털에서 신청이 안 됨.',
  ])('rejects the reversed permission: %s',(answer)=>{
    expect(checkFaqCandidate(cand(answer,'포털에서 신청할 수 있습니다.'),ev)).toContain('NEGATION_NOT_IN_SOURCE');
  });
  it('keeps "안내" and other words that merely contain 안/못 as positive statements',()=>{
    expect(checkFaqCandidate(cand('가상 휴학은 기간 제한 없는 상시 접수로 포털에서 신청할 수 있습니다. 결과는 문자로 안내됩니다.',
      '기간 제한 없는 상시 접수로 포털에서 신청할 수 있습니다. 결과는 문자로 안내됩니다.'),ev)).toEqual([]);
  });
  it('accepts "못합니다" as a faithful paraphrase of a source "할 수 없습니다"',()=>{
    const no=make('SYN-CANCEL-2','가상 휴학 취소','가상 휴학은 접수 완료 후 취소할 수 없습니다.');
    const e2=retrieveFaqEvidence('휴학 취소',[no],NOW);
    expect(checkFaqCandidate({answer:'가상 휴학은 접수 완료 후 취소하지 못합니다.',
      citations:[{citationId:e2[0]!.citationId,quote:'접수 완료 후 취소할 수 없습니다.'}],
      needsHumanConfirmation:true,suggestedLinks:[]},e2)).toEqual([]);
  });
  it('does not read a word ending in 안 ("제안됩니다") as "안 됩니다"',()=>{
    const plan=make('SYN-PLAN','가상 상담 일정','가상 상담 일정은 학기 초에 담당자가 새로 제안합니다.');
    const e2=retrieveFaqEvidence('상담 일정',[plan],NOW);
    expect(checkFaqCandidate({answer:'가상 상담 일정은 학기 초에 담당자가 새로 제안됩니다.',
      citations:[{citationId:e2[0]!.citationId,quote:'학기 초에 담당자가 새로 제안합니다.'}],
      needsHumanConfirmation:true,suggestedLinks:[]},e2)).not.toContain('NEGATION_NOT_IN_SOURCE');
  });
  it('still rejects dropping a source "안 됩니다"',()=>{
    const no=make('SYN-NO-2','가상 휴학 대리 신청','가상 휴학은 대리인이 신청하면 안 됩니다.');
    const e2=retrieveFaqEvidence('휴학 대리 신청',[no],NOW);
    expect(checkFaqCandidate({answer:'가상 휴학은 대리인이 신청하면 됩니다.',
      citations:[{citationId:e2[0]!.citationId,quote:'대리인이 신청하면 안 됩니다.'}],
      needsHumanConfirmation:true,suggestedLinks:[]},e2)).toContain('NEGATION_DROPPED');
  });
});

describe('#361 review: spelled-out Korean counts must be quoted',()=>{
  const doc=make('SYN-TERM','가상 교환학생 학기','가상 교환학생 지원자는 총평점평균 3.0 이상이어야 하며 4개 학기 이상을 마쳐야 합니다.');
  const ev=retrieveFaqEvidence('교환학생 학기',[doc],NOW);
  const q='총평점평균 3.0 이상이어야 하며 4개 학기 이상을 마쳐야 합니다.';
  const cand=(answer:string):FaqCandidate=>({answer,citations:[{citationId:ev[0]!.citationId,quote:q}],needsHumanConfirmation:true,suggestedLinks:[]});
  it.each(['세 개 학기','삼 학기','두 학기'])('%s',(n)=>{
    expect(checkFaqCandidate(cand(`가상 교환학생 지원자는 총평점평균 3.0 이상이어야 하며 ${n} 이상을 마쳐야 합니다.`),ev))
      .toContain('AMOUNT_NOT_QUOTED');
  });
  it('the quoted digits still pass',()=>{
    expect(checkFaqCandidate(cand('가상 교환학생 지원자는 총평점평균 3.0 이상이어야 하며 4개 학기 이상을 마쳐야 합니다.'),ev)).toEqual([]);
  });
});

describe('#361 review: question masking covers hyphenated and labelled identifiers',()=>{
  it.each([
    ['제 학번은 2020-12345인데 휴학 되나요','2020-12345','STUDENT_ID'],
    ['+82 10-1234-5678로 연락 주세요','1234-5678','PHONE'],
    ['고객번호 1234-567-890 문의','1234-567-890','LONG_NUMBER'],
    ['제 이름은 홍길동이고 휴학 문의','홍길동','NAME'],
  ])('%s',(q,secret,kind)=>{
    const r=maskFaqQuestion(q);
    expect(r.text).not.toContain(secret);
    expect(r.redactions).toContain(kind);
  });
  it('keeps ISO dates and FAQ-sized numbers',()=>{
    expect(maskFaqQuestion('2026-03-02에 수강 정정 3학점 가능?').redactions).toEqual([]);
  });
});
