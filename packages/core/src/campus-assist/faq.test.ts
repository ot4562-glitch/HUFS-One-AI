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
      citations:[{citationId:'faq-a:faq-a-v1:p1',quote:'평점 기준은 3.0 이상입니다.'}],
      needsHumanConfirmation:true,suggestedLinks:['/exchange' as const],
    };
    expect(validateFaqCandidate(candidate,evidence)).toEqual(candidate);
    expect(()=>validateFaqCandidate({...candidate,answer:'최소 4.0 이상입니다.'},evidence)).toThrow();
    expect(()=>validateFaqCandidate({...candidate,citations:[{citationId:'fake:p1',quote:'평점'}]},evidence)).toThrow();
    expect(()=>validateFaqCandidate({...candidate,citations:[{citationId:'faq-a:faq-a-v1:p1',quote:'없는 문장'}]},evidence)).toThrow();
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
    const result={answer:'https://evil.example/a',citations:[{citationId:'faq-a:faq-a-v1:p1',quote:'평점 기준은 3.0'}],needsHumanConfirmation:true,suggestedLinks:[]};
    expect(()=>validateFaqCandidate(result,evidence)).toThrow();
  });
});
describe('same-revision copies cannot decide evidence by input order (#373)',()=>{
  const Q='교환학생 평점';
  const perms=<T,>(xs:readonly T[]):T[][]=>xs.length<=1?[[...xs]]:
    xs.flatMap((x,i)=>perms([...xs.slice(0,i),...xs.slice(i+1)]).map(rest=>[x,...rest]));
  const count=(rows:readonly FaqDocument[])=>perms(rows).map(order=>retrieveFaqEvidence(Q,order,NOW).length);
  it('quarantines a document whose newest revision has APPROVED and REVOKED/BLOCKED copies, in every order',()=>{
    for(const rights of ['REVOKED','BLOCKED'] as const){
      expect(count([doc,{...doc,rights}])).toEqual([0,0]);
      expect(count([doc,{...doc,rights},{...doc}])).toEqual([0,0,0,0,0,0]);
    }
  });
  it('quarantines same-revision copies whose paragraph text, URL or dates differ',()=>{
    const altered:FaqDocument[]=[
      {...doc,paragraphs:[{id:'p1',text:'가상 교환학생 지원의 평점 기준은 2.5 이상입니다. 실제 학교 규정이 아닙니다.'}]},
      {...doc,sourceUrl:'https://example.org/synthetic-faq-other'},
      {...doc,effectiveUntil:'2026-12-31'},
      {...doc,verifiedAt:'2026-01-03T00:00:00Z'},
      // A forged later publication timestamp must NOT turn the SAME
      // revision ID into a newer approved revision.
      {...doc,publishedAt:'2026-02-01T00:00:00Z'},
      {...doc,publishedAt:'2026-02-01T00:00:00Z',rights:'REVOKED'},
    ];
    for(const copy of altered)expect(count([doc,copy])).toEqual([0,0]);
  });
  it('a conflicting old revision does not poison an independently published newer revision',()=>{
    const v1Copied={...doc,publishedAt:'2026-02-01T00:00:00Z'};
    const v2={...doc,revisionId:'faq-a-v2',publishedAt:'2026-04-01T00:00:00Z',
      verifiedAt:'2026-04-02T00:00:00Z'};
    expect(count([doc,v1Copied,v2]).every(n=>n===1)).toBe(true);
  });
  it('collapses identical copies, including a different key order, to one source',()=>{
    const reordered=Object.fromEntries(Object.entries(doc).reverse()) as FaqDocument;
    expect(count([doc,{...doc},reordered])).toEqual([1,1,1,1,1,1]);
    // An explicitly undefined optional field is the same content as an absent one.
    expect(count([doc,{...doc,effectiveUntil:undefined}])).toEqual([1,1]);
  });
  it('does not fall back to an older approved revision when the newest one conflicts',()=>{
    const v2={...doc,revisionId:'faq-a-v2',publishedAt:'2026-03-01T00:00:00Z',verifiedAt:'2026-03-02T00:00:00Z'};
    expect(count([doc,v2,{...v2,rights:'REVOKED'}]).every(n=>n===0)).toBe(true);
    // Before v2 was published, only v1 existed and remains citable.
    expect(retrieveFaqEvidence(Q,[doc,v2,{...v2,rights:'REVOKED'}],'2026-02-01T00:00:00Z')).toHaveLength(1);
  });
  it('keeps unrelated documents when one document is quarantined',()=>{
    const other:FaqDocument={...doc,documentId:'faq-b',revisionId:'faq-b-v1'};
    for(const order of perms([doc,{...doc,rights:'REVOKED' as const},other])){
      const evidence=retrieveFaqEvidence(Q,order,NOW);
      expect(evidence.map(e=>e.documentId)).toEqual(['faq-b']);
    }
  });
});
