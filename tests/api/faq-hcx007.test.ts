import {describe,expect,it} from 'vitest';
import {SYNTHETIC_FAQ_DOCUMENTS} from '../../apps/web/src/features/campus-assist/synthetic.js';
import {retrieveFaqEvidence} from '../../packages/core/src/campus-assist/faq.js';
import {buildFaqHcx007Request,parseFaqHcx007Response} from '../../packages/ai/src/faq-hcx007.js';
const NOW='2026-11-08T00:00:00Z';
const docs=SYNTHETIC_FAQ_DOCUMENTS;
describe('#341 independent FAQ HXC-007 schema and 100 synthetic retrieval oracles',()=>{
  it('100 synthetic questions retrieve the exact corresponding document revision',()=>{
    expect(docs).toHaveLength(100);
    for(const d of docs){
      const rows=retrieveFaqEvidence(d.title,docs,NOW,6);
      expect(rows.some(e=>e.documentId===d.documentId&&e.revisionId===d.revisionId)).toBe(true);
    }
  });
  it('builds only the HCX-007 v3 Structured Outputs wire with no thinking or tools',()=>{
    const evidence=retrieveFaqEvidence(docs[0]!.title,docs,NOW);
    const r=buildFaqHcx007Request(docs[0]!.title,evidence);
    expect(r.path).toBe('/v3/chat-completions/HCX-007');
    expect(r.body.responseFormat.type).toBe('json');
    expect(r.body).not.toHaveProperty('thinking');
    expect(r.body).not.toHaveProperty('tools');
    expect(r.body.maxCompletionTokens).toBeLessThanOrEqual(700);
  });
  it('validates exact citation and token usage; cannot silently present invented facts',()=>{
    const evidence=retrieveFaqEvidence('교환학생 어학',docs,NOW);
    expect(evidence.length).toBeGreaterThan(0);
    const candidate={
      answer:'가상 파견대학의 어학 점수는 파견 예정일 전에 유효기간을 확인해야 합니다.',
      citations:[{citationId:evidence[0]!.citationId,quote:'어학 점수는 파견 예정일 전에 유효기간을 확인해야 합니다.'}],
      needsHumanConfirmation:true,suggestedLinks:['/exchange'],
    };
    const response={
      status:{code:'20000'},result:{finishReason:'stop',message:{role:'assistant',
        content:JSON.stringify(candidate)},usage:{promptTokens:120,completionTokens:60,totalTokens:180}},
    };
    expect(parseFaqHcx007Response(response,evidence).candidate.answer).toBe(candidate.answer);
    expect(()=>parseFaqHcx007Response({...response,result:{...response.result,
      usage:{...response.result.usage,totalTokens:200}}},evidence)).toThrow();
    expect(()=>parseFaqHcx007Response({...response,result:{...response.result,
      message:{role:'assistant',content:JSON.stringify({...candidate,answer:'기한은 2030년 12월 31일입니다.'})}}},evidence)).toThrow();
    expect(()=>buildFaqHcx007Request('질문',[])).toThrow();
  });
});
