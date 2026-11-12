import {describe,expect,it} from 'vitest';
import {retrievalMetrics,type RetrievalCase} from '../../packages/core/src/evaluation/metrics.js';
import {retrieveFaqEvidence} from '../../packages/core/src/campus-assist/faq.js';
import {FAQ_EVAL_CASES,FAQ_EVAL_DOCUMENTS,type FaqEvalCase} from '../../packages/core/src/campus-assist/faq-eval.fixtures.js';

/**
 * #452: the #341 synthetic FAQ regression set expressed as Recall@k / MRR / abstention with
 * explicit denominators. Synthetic, written for regression only: not independent human Gold
 * and not a quality claim about real school FAQs.
 */
const NOW='2026-11-08T00:00:00Z';
const ranked=(question:string)=>retrieveFaqEvidence(question,FAQ_EVAL_DOCUMENTS,NOW).map(e=>e.documentId);
function report(split:FaqEvalCase['split']){
  const selected=FAQ_EVAL_CASES.filter(k=>k.split===split);
  const cases:RetrievalCase[]=selected.map((k,i)=>({id:split+'-'+i,relevant:k.expect?[k.expect]:[],ranked:ranked(k.question)}));
  return {selected,metrics:retrievalMetrics(cases,{ks:[1,3,6],cutoff:6})};
}

describe('#452 FAQ retrieval metrics over the #341 synthetic set',()=>{
  it('agrees with the existing top-1 / top-6 / refusal counts and their populations',()=>{
    for(const split of ['TUNED','HOLDOUT'] as const){
      const {selected,metrics}=report(split);
      const pos=selected.filter(k=>k.expect),neg=selected.filter(k=>!k.expect);
      expect(metrics.answerable).toBe(pos.length);
      expect(metrics.unanswerable).toBe(neg.length);
      expect(metrics.hitAt[1]!.num).toBe(pos.filter(k=>ranked(k.question)[0]===k.expect).length);
      expect(metrics.hitAt[6]!.num).toBe(pos.filter(k=>ranked(k.question).includes(k.expect!)).length);
      expect(metrics.abstention.num).toBe(neg.filter(k=>ranked(k.question).length===0).length);
    }
  });
  // Floors are the values measured on 2026-11-11 at main a7c84aa; they guard regressions only.
  it('tuned split keeps every off-topic question away from the model and ranks answers first',()=>{
    const {metrics}=report('TUNED');
    expect({answerable:metrics.answerable,unanswerable:metrics.unanswerable}).toEqual({answerable:75,unanswerable:30});
    expect(metrics.hitAt[6]!.value).toBe(1);
    expect(metrics.mrr.value!).toBeGreaterThanOrEqual(0.988);
    expect(metrics.abstention).toEqual({num:30,den:30,value:1});
    expect(metrics.falseAnswers).toEqual([]);
  });
  it('held-out split reports its misses honestly through Recall@6 and MRR',()=>{
    const {metrics}=report('HOLDOUT');
    expect({answerable:metrics.answerable,unanswerable:metrics.unanswerable}).toEqual({answerable:21,unanswerable:8});
    expect(metrics.hitAt[6]!.num).toBeGreaterThanOrEqual(15);
    expect(metrics.mrr.value!).toBeGreaterThanOrEqual(0.71);
    expect(metrics.abstention).toEqual({num:8,den:8,value:1});
    expect(metrics.falseAnswers).toEqual([]);
  });
});
