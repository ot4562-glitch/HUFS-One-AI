import {describe,expect,it} from 'vitest';
import {eligibilityMisjudgment,f1Scores,retrievalMetrics,spanMatch} from '../../packages/core/src/evaluation/metrics.js';

/** Hand-computed references; all data are synthetic toy ids. */
describe('#452 classification F1 with published denominators',()=>{
  it('matches the textbook single-label example (macro 0.2667, micro 0.3333)',()=>{
    // y_true=[0,1,2,0,1,2], y_pred=[0,2,1,0,0,1] — the scikit-learn f1_score documentation example.
    const gold={a:'0',b:'1',c:'2',d:'0',e:'1',f:'2'},predicted={a:'0',b:'2',c:'1',d:'0',e:'0',f:'1'};
    const r=f1Scores(gold,predicted);
    expect(r.classes.map(c=>[c.label,c.tp,c.fp,c.fn,c.support,c.f1.num,c.f1.den,c.f1.value])).toEqual([
      ['0',2,1,0,2,4,5,0.8],['1',0,2,2,2,0,4,0],['2',0,1,2,2,0,3,0],
    ]);
    expect(r.macroF1).toEqual({sum:0.8,count:3,value:0.266667});
    expect(r.microF1).toEqual({num:4,den:12,value:0.333333});
    expect(r).toMatchObject({items:6,missingPredictions:[],unlabelledPredictions:[],uncountedClasses:[]});
  });
  it('scores multi-label sets per class and lists declared classes that never occurred',()=>{
    const gold={x:['A','B'],y:['B'],z:['C']},predicted={x:['A'],y:['B','C'],z:[]};
    const r=f1Scores(gold,predicted,{classes:['A','B','C','D']});
    expect(r.classes.map(c=>[c.label,c.tp,c.fp,c.fn,c.f1.value])).toEqual([
      ['A',1,0,0,1],['B',1,0,1,0.666667],['C',0,1,1,0],
    ]);
    expect(r.macroF1.value).toBe(0.555556);
    expect(r.microF1).toEqual({num:4,den:7,value:0.571429});
    expect(r.uncountedClasses).toEqual(['D']);
  });
  it('scores a missing prediction as empty and never counts predictions without gold',()=>{
    const r=f1Scores({p:'X',q:'Y'},{p:'X',r:'Z'});
    expect(r.classes.map(c=>[c.label,c.tp,c.fn,c.fp])).toEqual([['X',1,0,0],['Y',0,1,0]]);
    expect(r.macroF1.value).toBe(0.5);
    expect(r.missingPredictions).toEqual(['q']);
    expect(r.unlabelledPredictions).toEqual(['r']);
  });
  it('reports an empty population as undefined, not as a perfect or zero score',()=>{
    const r=f1Scores({},{});
    expect(r.macroF1).toEqual({sum:0,count:0,value:null});
    expect(r.microF1).toEqual({num:0,den:0,value:null});
  });
  it('fails closed on unknown classes, duplicate labels and empty labels',()=>{
    expect(()=>f1Scores({a:'Z'},{a:'Z'},{classes:['A']})).toThrow(RangeError);
    expect(()=>f1Scores({a:'A'},{a:'Z'},{classes:['A']})).toThrow(RangeError);
    expect(()=>f1Scores({a:'A'},{b:'Z'},{classes:['A']})).toThrow(RangeError);
    expect(()=>f1Scores({a:['A','A']},{a:['A']})).toThrow(RangeError);
    expect(()=>f1Scores({a:''},{a:'A'})).toThrow(RangeError);
    expect(()=>f1Scores({a:'A'},{a:'A'},{classes:['A','A']})).toThrow(RangeError);
  });
});

describe('#452 retrieval Recall@k, hit rate and MRR',()=>{
  const cases=[
    {id:'q1',relevant:['c'],ranked:['a','b','c']},
    {id:'q2',relevant:['b'],ranked:['a','b','c']},
    {id:'q3',relevant:['a'],ranked:['a','b']},
    {id:'q4',relevant:[],ranked:[]},
    {id:'q5',relevant:[],ranked:['x']},
  ];
  it('computes the textbook MRR (1/3+1/2+1)/3 over answerable queries only',()=>{
    const r=retrievalMetrics(cases,{ks:[1,3],cutoff:6});
    expect(r.mrr).toEqual({sum:1.833333,count:3,value:0.611111});
    expect(r.hitAt[1]).toEqual({num:1,den:3,value:0.333333});
    expect(r.hitAt[3]).toEqual({num:3,den:3,value:1});
    expect(r.recallAt[1]!.value).toBe(0.333333);
    expect({answerable:r.answerable,unanswerable:r.unanswerable}).toEqual({answerable:3,unanswerable:2});
  });
  it('reports abstention on unanswerable queries separately from accuracy',()=>{
    const r=retrievalMetrics(cases,{ks:[1],cutoff:6});
    expect(r.abstention).toEqual({num:1,den:2,value:0.5});
    expect(r.falseAnswers).toEqual(['q5']);
  });
  it('averages per-query recall when a query has several relevant ids',()=>{
    const r=retrievalMetrics([{id:'m',relevant:['a','b'],ranked:['a','c','b']}],{ks:[1,3],cutoff:6});
    expect(r.recallAt[1]!.value).toBe(0.5);
    expect(r.recallAt[3]!.value).toBe(1);
    expect(r.hitAt[1]!.value).toBe(1);
  });
  it('gives no reciprocal-rank credit beyond the cutoff',()=>{
    const deep=[{id:'d',relevant:['g'],ranked:['a','b','c','d','e','f','g']}];
    expect(retrievalMetrics(deep,{ks:[6],cutoff:6}).mrr.value).toBe(0);
    expect(retrievalMetrics(deep,{ks:[6],cutoff:7}).mrr.value).toBe(0.142857);
  });
  it('returns undefined metrics when nothing is answerable',()=>{
    const r=retrievalMetrics([{id:'n',relevant:[],ranked:[]}],{ks:[1],cutoff:6});
    expect(r.mrr.value).toBeNull();
    expect(r.hitAt[1]!.value).toBeNull();
    expect(r.abstention.value).toBe(1);
  });
  it('fails closed on duplicate ids and invalid k or cutoff',()=>{
    expect(()=>retrievalMetrics([cases[0]!,cases[0]!],{ks:[1],cutoff:6})).toThrow(RangeError);
    expect(()=>retrievalMetrics([{id:'z',relevant:['a'],ranked:['a','a']}],{ks:[1],cutoff:6})).toThrow(RangeError);
    expect(()=>retrievalMetrics([{id:'z',relevant:['a','a'],ranked:['a']}],{ks:[1],cutoff:6})).toThrow(RangeError);
    expect(()=>retrievalMetrics(cases,{ks:[],cutoff:6})).toThrow(RangeError);
    expect(()=>retrievalMetrics(cases,{ks:[0],cutoff:6})).toThrow(RangeError);
    expect(()=>retrievalMetrics(cases,{ks:[3,3],cutoff:6})).toThrow(RangeError);
    expect(()=>retrievalMetrics(cases,{ks:[1],cutoff:0})).toThrow(RangeError);
  });
});

describe('#452 evidence span agreement',()=>{
  it('matches exact spans one-to-one and counts overlapping characters once',()=>{
    const gold=[{documentId:'d1',start:0,end:10},{documentId:'d1',start:5,end:15},{documentId:'d2',start:0,end:4}];
    const predicted=[{documentId:'d1',start:0,end:10},{documentId:'d1',start:0,end:10},{documentId:'d2',start:2,end:6}];
    const r=spanMatch(gold,predicted);
    expect(r.exactRecall).toEqual({num:1,den:3,value:0.333333});
    expect(r.exactPrecision).toEqual({num:1,den:3,value:0.333333});
    expect(r.overlap).toEqual({goldChars:19,predictedChars:14,sharedChars:12,
      precision:{num:12,den:14,value:0.857143},recall:{num:12,den:19,value:0.631579},
      f1:{num:24,den:33,value:0.727273}});
  });
  it('lets one predicted span satisfy only one of two identical gold spans',()=>{
    const span={documentId:'d1',start:0,end:10};
    const r=spanMatch([span,{...span}],[{...span}]);
    expect(r.exactRecall).toEqual({num:1,den:2,value:0.5});
    expect(r.exactPrecision).toEqual({num:1,den:1,value:1});
  });
  it('never credits the same offsets in a different document',()=>{
    const r=spanMatch([{documentId:'d1',start:0,end:5}],[{documentId:'d2',start:0,end:5}]);
    expect(r.exactRecall.value).toBe(0);
    expect(r.overlap.sharedChars).toBe(0);
    expect(r.overlap.f1.value).toBe(0);
  });
  it('reports undefined rates for empty inputs and rejects invalid spans',()=>{
    const r=spanMatch([],[]);
    expect([r.exactRecall.value,r.exactPrecision.value,r.overlap.f1.value]).toEqual([null,null,null]);
    expect(()=>spanMatch([{documentId:'d',start:3,end:3}],[])).toThrow(RangeError);
    expect(()=>spanMatch([{documentId:'d',start:-1,end:3}],[])).toThrow(RangeError);
    expect(()=>spanMatch([],[{documentId:'',start:0,end:3}])).toThrow(RangeError);
    expect(()=>spanMatch([{documentId:'d',start:0.5,end:3}],[])).toThrow(RangeError);
  });
});

describe('#452 eligibility misjudgment rates',()=>{
  it('divides false and unsupported ELIGIBLE by all gold-labelled cases and lists missing predictions',()=>{
    const r=eligibilityMisjudgment(
      {a:'ELIGIBLE',b:'ELIGIBLE',c:'ELIGIBLE',d:'INELIGIBLE'},
      {a:'INELIGIBLE',b:'UNKNOWN',c:'ELIGIBLE',d:'INELIGIBLE',e:'UNKNOWN'});
    expect(r.falseEligible).toEqual({num:1,den:5,value:0.2});
    expect(r.unsupportedEligible).toEqual({num:1,den:5,value:0.2});
    expect(r.total).toEqual({num:2,den:5,value:0.4});
    expect(r.missingPredictions).toEqual(['e']);
    expect(r.unlabelledPredictions).toEqual([]);
  });
  it('fails closed on labels outside ELIGIBLE / INELIGIBLE / UNKNOWN',()=>{
    expect(()=>eligibilityMisjudgment({a:'MAYBE' as never},{a:'ELIGIBLE'})).toThrow(RangeError);
    expect(()=>eligibilityMisjudgment({a:'ELIGIBLE'},{a:'MAYBE' as never})).toThrow(RangeError);
    // Unlabelled predictions do not enter any denominator, but their
    // invalid classes must not be silently suppressed.
    expect(()=>eligibilityMisjudgment({a:'INVENTED' as never},{b:'UNKNOWN'})).toThrow(RangeError);
    const report=eligibilityMisjudgment({a:'ELIGIBLE'},{b:'UNKNOWN'});
    expect(report.unlabelledPredictions).toEqual(['a']);
    expect(report.total).toEqual({num:0,den:1,value:0});
  });
});
