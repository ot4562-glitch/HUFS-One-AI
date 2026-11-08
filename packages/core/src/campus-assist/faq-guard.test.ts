import {describe,expect,it} from 'vitest';
import type {FaqCandidate} from '@hufs-one/contracts';
import {checkFaqCandidate} from './faq-guard.js';
import {maskFaqQuestion} from './faq-privacy.js';
import {retrieveFaqEvidence} from './faq.js';
import {FAQ_EVAL_DOCUMENTS} from './faq-eval.fixtures.js';
const NOW='2026-11-08T00:00:00Z';
const ev=retrieveFaqEvidence('교환학생 평점 기준',FAQ_EVAL_DOCUMENTS,NOW);
const id=ev[0]!.citationId;
const honest:FaqCandidate={
  answer:'가상 교환학생 지원자는 총평점평균 3.0 이상이어야 합니다.',
  citations:[{citationId:id,quote:'총평점평균 3.0 이상이어야 합니다.'}],
  needsHumanConfirmation:true,suggestedLinks:['/exchange'],
};
const check=(patch:Partial<FaqCandidate>)=>checkFaqCandidate({...honest,...patch},ev);
const quote=(q:string)=>({citations:[{citationId:id,quote:q}]});

describe('#341 code-side FAQ answer guard (offline fake model outputs)',()=>{
  it('accepts a grounded answer, tolerating whitespace differences in the quote',()=>{
    expect(ev[0]!.documentId).toBe('SYN-EVAL-GPA');
    expect(check({})).toEqual([]);
    expect(check(quote('총평점평균   3.0\n이상이어야 합니다.'))).toEqual([]);
  });
  it.each([
    ['invented number',{answer:'가상 교환학생 지원자는 총평점평균 3.5 이상이어야 합니다.'},'NUMBER_NOT_QUOTED'],
    ['invented Korean-numeral amount',{answer:'가상 교환학생 지원자는 총평점평균 3.0 이상이고 오십만 원을 냅니다.'},'AMOUNT_NOT_QUOTED'],
    ['invented relative date',{answer:'가상 교환학생 지원자는 다음 주 금요일까지 총평점평균 3.0 이상이어야 합니다.'},'RELATIVE_DATE_NOT_IN_SOURCE'],
    ['one-character quote',quote('.'),'QUOTE_TOO_SHORT'],
    ['altered quote',quote('총평점평균 2.5 이상이어야 합니다.'),'QUOTE_NOT_IN_SOURCE'],
    ['unknown source',{citations:[{citationId:'blog:p1',quote:'총평점평균 3.0 이상이어야 합니다.'}]},'UNKNOWN_CITATION'],
    ['flipped meaning',{answer:'가상 교환학생 지원자는 총평점평균 3.0 이상이 아니어도 됩니다.'},'NEGATION_NOT_IN_SOURCE'],
    ['personal verdict',{answer:'입력하신 조건이면 가상 교환학생 지원 자격을 충족하여 합격 가능합니다.'},'ELIGIBILITY_VERDICT'],
    ['verdict absent from source',{answer:'가상 교환학생 총평점평균 3.0 이상이면 선발 확정입니다.'},'ELIGIBILITY_VERDICT'],
    ['unrelated claim',{answer:'기숙사 신청은 생활관 누리집에서 선착순으로 받습니다.'},'UNSUPPORTED_CLAIM'],
    ['invented link',{answer:'가상 교환학생 지원자는 총평점평균 3.0 이상이어야 합니다. https://evil.example'},'URL_OR_CONTACT'],
    ['invented contact',{answer:'가상 교환학생 총평점평균 3.0 이상이어야 합니다. oia@evil.example 로 문의'},'URL_OR_CONTACT'],
    ['duplicate citation',{citations:[{citationId:id,quote:'총평점평균 3.0 이상이어야 합니다.'},{citationId:id,quote:'교환학생 지원자는 총평점평균'}]},'DUPLICATE_CITATION'],
  ] as const)('rejects %s',(_name,patch,reason)=>{
    expect(check(patch as Partial<FaqCandidate>)).toContain(reason);
  });
  it('allows a rule quoted from the source but not applying it to the asker',()=>{
    const rule=retrieveFaqEvidence('사회봉사 학점 인정',FAQ_EVAL_DOCUMENTS,NOW);
    const ok:FaqCandidate={answer:'가상 사회봉사 활동은 30시간 이수 시 1학점으로 인정됩니다.',
      citations:[{citationId:rule[0]!.citationId,quote:'사회봉사 활동은 30시간 이수 시 1학점으로 인정됩니다.'}],
      needsHumanConfirmation:true,suggestedLinks:[]};
    expect(checkFaqCandidate(ok,rule)).toEqual([]);
  });
});
describe('#341 question masking before an external model',()=>{
  it('replaces student numbers, phones, e-mails and RRNs but keeps FAQ-sized numbers',()=>{
    const r=maskFaqQuestion('제 학번 202312345, 010-1234-5678, me@example.com, 990101-1234567 인데 3.0이면 되나요?');
    expect(r.text).not.toMatch(/202312345|1234-5678|me@example|990101/);
    expect(r.text).toContain('3.0');
    expect(r.redactions).toEqual(['RRN','PHONE','EMAIL','LONG_NUMBER']);
    expect(maskFaqQuestion('졸업 학점 134학점 맞나요').redactions).toEqual([]);
  });
});
