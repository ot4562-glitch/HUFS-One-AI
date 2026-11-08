import {describe,expect,it} from 'vitest';
import type {FaqDocument} from '@hufs-one/contracts';
import {retrieveFaqEvidence,validateFaqCandidate} from './faq.js';
const NOW='2026-06-01T00:00:00Z';
const doc:FaqDocument={
  documentId:'faq-a',revisionId:'faq-a-v1',title:'가상 교환학생 상담',
  sourceUrl:'https://example.org/synthetic-faq',category:'EXCHANGE',
  publishedAt:'2026-01-01T00:00:00Z',verifiedAt:'2026-01-02T00:00:00Z',
  effectiveFrom:'2026-01-01',rights:'APPROVED',provenance:'SYNTHETIC',
  accessScope:'PUBLIC',
  paragraphs:[{id:'p1',text:'가상 교환학생 지원의 평점 기준은 3.0 이상입니다. 실제 학교 규정이 아닙니다.'}],
};
describe('FAQ retrieval and citations (#341)',()=>{
  it('retrieves only a current public source and validates exact quote and numerical facts',()=>{
    const evidence=retrieveFaqEvidence('교환학생 평점', [doc],NOW);
    expect(evidence).toHaveLength(1);
    const candidate={
      answer:'가상 예시에서 평점 기준은 3.0 이상입니다. 실제 학교 규정이 아닙니다.',
      citations:[{citationId:'faq-a-v1:p1',quote:'평점 기준은 3.0 이상입니다.'}],
      needsHumanConfirmation:true,suggestedLinks:['/exchange' as const],
    };
    expect(validateFaqCandidate(candidate,evidence)).toEqual(candidate);
    expect(()=>validateFaqCandidate({...candidate,answer:'최소 4.0 이상입니다.'},evidence)).toThrow();
    expect(()=>validateFaqCandidate({...candidate,citations:[{citationId:'fake:p1',quote:'평점'}]},evidence)).toThrow();
    expect(()=>validateFaqCandidate({...candidate,citations:[{citationId:'faq-a-v1:p1',quote:'없는 문장'}]},evidence)).toThrow();
  });
  it('revocation quarantines an older matching revision and cannot be bypassed by old asOf',()=>{
    const revoked={...doc,revisionId:'faq-a-v2',rights:'REVOKED' as const,
      publishedAt:'2026-04-01T00:00:00Z',verifiedAt:'2026-04-02T00:00:00Z'};
    expect(retrieveFaqEvidence('교환학생 평점',[doc,revoked],NOW)).toHaveLength(0);
    expect(retrieveFaqEvidence('교환학생 평점',[doc,revoked],'2026-02-01T00:00:00Z')).toHaveLength(1);
  });
  it('refuses future, expired, out-of-scope and missing evidence',()=>{
    expect(retrieveFaqEvidence('교환학생 평점',[{...doc,verifiedAt:'2026-07-01T00:00:00Z'}],NOW)).toHaveLength(0);
    expect(retrieveFaqEvidence('교환학생 평점',[{...doc,effectiveUntil:'2026-05-01'}],NOW)).toHaveLength(0);
    expect(retrieveFaqEvidence('기숙사 마감',[doc],NOW)).toHaveLength(0);
  });
  it('does not accept an invented URL or a citation from another tenant/source',()=>{
    const evidence=retrieveFaqEvidence('교환학생 평점',[doc],NOW);
    const result={answer:'https://evil.example/a',citations:[{citationId:'faq-a-v1:p1',quote:'평점 기준은 3.0'}],needsHumanConfirmation:true,suggestedLinks:[]};
    expect(()=>validateFaqCandidate(result,evidence)).toThrow();
  });
});
