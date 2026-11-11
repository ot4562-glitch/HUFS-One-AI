import {byCodeUnit} from '../normalization/dedupe.js';
import type {GoldEligibility} from '../opportunities/evaluation.js';

/**
 * #452 evaluation-only metric helpers: classification macro-F1, retrieval Recall@k/MRR,
 * evidence span agreement and eligibility misjudgment rates.
 *
 * Pure and deterministic: no I/O, no model or network call, nothing here changes a ranking,
 * label or production decision. Every rate carries its numerator and denominator, and an
 * empty denominator gives `value: null` — an undefined metric is never reported as 0 or 1.
 * Malformed input (duplicate ids, unknown classes, invalid spans) fails closed with a
 * RangeError instead of being silently skipped.
 */
export interface Rate {num:number; den:number; value:number|null}
export interface Mean {sum:number; count:number; value:number|null}

const round=(value:number)=>Math.round(value*1e6)/1e6;
function rate(num:number,den:number):Rate {return {num,den,value:den===0?null:round(num/den)};}
function mean(values:readonly number[]):Mean {
  const sum=values.reduce((s,v)=>s+v,0);
  return {sum:round(sum),count:values.length,value:values.length===0?null:round(sum/values.length)};
}
function nonEmpty(value:string,what:string):string {
  if(typeof value!=='string'||value.length===0)throw new RangeError('Invalid '+what);
  return value;
}

// ---------------------------------------------------------------------------------------------
// Classification

/** id → one class (single-label) or a list of classes (multi-label, e.g. TopicCodes). */
export type LabelMap=Readonly<Record<string,string|readonly string[]>>;
export interface ClassScore {
  label:string; tp:number; fp:number; fn:number;
  /** Gold items carrying the class. */
  support:number;
  /** F1 = 2TP / (2TP + FP + FN). */
  f1:Rate;
}
export interface F1Report {
  /** Unweighted mean of per-class F1 over `classes` (each class with support or a prediction). */
  macroF1:Mean;
  /** Pooled 2ΣTP / (2ΣTP + ΣFP + ΣFN). */
  microF1:Rate;
  classes:ClassScore[];
  /** Declared classes with neither gold support nor a prediction: excluded from the mean, listed. */
  uncountedClasses:string[];
  /** Gold items evaluated (the population). */
  items:number;
  /** Gold items without a prediction entry: scored as an empty prediction (all false negatives). */
  missingPredictions:string[];
  /** Predictions for ids without gold: ignored, listed. */
  unlabelledPredictions:string[];
}
function labelSet(value:string|readonly string[],declared:ReadonlySet<string>|null):Set<string> {
  const list=typeof value==='string'?[value]:value;
  if(!Array.isArray(list))throw new RangeError('Invalid label list');
  const set=new Set<string>();
  for(const label of list){
    nonEmpty(label,'label');
    if(set.has(label))throw new RangeError('Duplicate label');
    if(declared&&!declared.has(label))throw new RangeError('Unknown class');
    set.add(label);
  }
  return set;
}
/**
 * Per-class and macro-averaged F1 over the ids present in `gold`. A single-label task is the
 * special case of one label per item. Pass `classes` to reject labels outside the known set
 * (e.g. the 24 TopicCodes) and to list declared classes that never occurred.
 */
export function f1Scores(gold:LabelMap,predicted:LabelMap,options:{classes?:readonly string[]}={}):F1Report {
  const declared=options.classes?new Set(options.classes.map(c=>nonEmpty(c,'class'))):null;
  if(declared&&declared.size!==options.classes!.length)throw new RangeError('Duplicate class');
  const counts=new Map<string,{tp:number;fp:number;fn:number;support:number}>();
  const bump=(label:string)=>{
    let entry=counts.get(label);
    if(!entry){entry={tp:0,fp:0,fn:0,support:0};counts.set(label,entry);}
    return entry;
  };
  const goldIds=Object.keys(gold).sort(byCodeUnit),missingPredictions:string[]=[];
  for(const id of goldIds){
    const truth=labelSet(gold[id]!,declared);
    const hasPrediction=Object.prototype.hasOwnProperty.call(predicted,id);
    if(!hasPrediction)missingPredictions.push(id);
    const guess=hasPrediction?labelSet(predicted[id]!,declared):new Set<string>();
    for(const label of truth){const e=bump(label);e.support++;if(guess.has(label))e.tp++;else e.fn++;}
    for(const label of guess)if(!truth.has(label))bump(label).fp++;
  }
  const unlabelledPredictions=Object.keys(predicted).filter(id=>!Object.prototype.hasOwnProperty.call(gold,id))
    .sort(byCodeUnit);
  for(const id of unlabelledPredictions)labelSet(predicted[id]!,declared);
  const classes=[...counts].sort(([a],[b])=>byCodeUnit(a,b)).map(([label,c]):ClassScore=>({
    label,tp:c.tp,fp:c.fp,fn:c.fn,support:c.support,f1:rate(2*c.tp,2*c.tp+c.fp+c.fn)}));
  const sums=classes.reduce((s,c)=>({tp:s.tp+c.tp,fp:s.fp+c.fp,fn:s.fn+c.fn}),{tp:0,fp:0,fn:0});
  return {
    macroF1:mean(classes.map(c=>c.f1.value!)),
    microF1:rate(2*sums.tp,2*sums.tp+sums.fp+sums.fn),
    classes,
    uncountedClasses:declared?[...declared].filter(c=>!counts.has(c)).sort(byCodeUnit):[],
    items:goldIds.length,missingPredictions,unlabelledPredictions,
  };
}

// ---------------------------------------------------------------------------------------------
// Retrieval

/** One query: `relevant` empty means the honest answer is "not found" (an unanswerable query). */
export interface RetrievalCase {id:string; relevant:readonly string[]; ranked:readonly string[]}
export interface RetrievalReport {
  answerable:number; unanswerable:number;
  /** Answerable queries with at least one relevant id in the top k (Success@k / hit rate). */
  hitAt:Record<number,Rate>;
  /** Mean over answerable queries of |relevant ∩ top k| / |relevant|. Equals hitAt for one relevant id. */
  recallAt:Record<number,Mean>;
  /** Mean over answerable queries of 1 / rank of the first relevant id; 0 beyond `cutoff`. */
  mrr:Mean;
  cutoff:number;
  /** Unanswerable queries that returned nothing / unanswerable queries. */
  abstention:Rate;
  /** Unanswerable queries that returned something (they would reach the model). */
  falseAnswers:string[];
}
function positiveInteger(value:number,what:string):number {
  if(!Number.isSafeInteger(value)||value<1)throw new RangeError('Invalid '+what);
  return value;
}
export function retrievalMetrics(cases:readonly RetrievalCase[],options:{ks:readonly number[];cutoff:number}):RetrievalReport {
  const cutoff=positiveInteger(options.cutoff,'cutoff');
  const ks=[...new Set(options.ks.map(k=>positiveInteger(k,'k')))].sort((a,b)=>a-b);
  if(ks.length===0||ks.length!==options.ks.length)throw new RangeError('Invalid k list');
  const seen=new Set<string>(),answerable:{relevant:Set<string>;ranked:readonly string[]}[]=[];
  const falseAnswers:string[]=[];let unanswerable=0;
  for(const item of cases){
    if(seen.has(nonEmpty(item.id,'case id')))throw new RangeError('Duplicate case id');
    seen.add(item.id);
    const relevant=new Set(item.relevant.map(id=>nonEmpty(id,'relevant id')));
    if(relevant.size!==item.relevant.length)throw new RangeError('Duplicate relevant id');
    if(new Set(item.ranked.map(id=>nonEmpty(id,'ranked id'))).size!==item.ranked.length)
      throw new RangeError('Duplicate ranked id');
    if(relevant.size===0){unanswerable++;if(item.ranked.length>0)falseAnswers.push(item.id);continue;}
    answerable.push({relevant,ranked:item.ranked});
  }
  const hitAt:Record<number,Rate>={},recallAt:Record<number,Mean>={};
  for(const k of ks){
    hitAt[k]=rate(answerable.filter(q=>q.ranked.slice(0,k).some(id=>q.relevant.has(id))).length,answerable.length);
    recallAt[k]=mean(answerable.map(q=>q.ranked.slice(0,k).filter(id=>q.relevant.has(id)).length/q.relevant.size));
  }
  const mrr=mean(answerable.map(q=>{
    const index=q.ranked.findIndex(id=>q.relevant.has(id));
    return index<0||index>=cutoff?0:1/(index+1);
  }));
  return {answerable:answerable.length,unanswerable,hitAt,recallAt,mrr,cutoff,
    abstention:rate(unanswerable-falseAnswers.length,unanswerable),falseAnswers:falseAnswers.sort(byCodeUnit)};
}

// ---------------------------------------------------------------------------------------------
// Evidence spans

/** Half-open [start, end) offsets in UTF-16 code units, as JavaScript string indices. */
export interface TextSpan {documentId:string; start:number; end:number}
export interface SpanReport {
  /** Gold spans matched one-to-one by an identical predicted span / gold spans. */
  exactRecall:Rate;
  /** The same matches / predicted spans. */
  exactPrecision:Rate;
  /** Character overlap per document after merging overlapping spans (a character counts once). */
  overlap:{
    goldChars:number; predictedChars:number; sharedChars:number;
    precision:Rate; recall:Rate;
    /** 2·shared / (gold + predicted). */
    f1:Rate;
  };
}
function checkSpan(span:TextSpan):TextSpan {
  nonEmpty(span.documentId,'document id');
  if(!Number.isSafeInteger(span.start)||!Number.isSafeInteger(span.end)||span.start<0||span.end<=span.start)
    throw new RangeError('Invalid span');
  return span;
}
/** Merged, sorted [start, end) intervals per document. */
function merged(spans:readonly TextSpan[]):Map<string,[number,number][]> {
  const byDoc=new Map<string,[number,number][]>();
  for(const s of spans){
    const list=byDoc.get(s.documentId)??[];list.push([s.start,s.end]);byDoc.set(s.documentId,list);
  }
  for(const [doc,list] of byDoc){
    list.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    const out:[number,number][]=[];
    for(const [start,end] of list){
      const last=out.at(-1);
      if(last&&start<=last[1])last[1]=Math.max(last[1],end);else out.push([start,end]);
    }
    byDoc.set(doc,out);
  }
  return byDoc;
}
const length=(intervals:readonly [number,number][])=>intervals.reduce((s,[a,b])=>s+b-a,0);
function shared(a:readonly [number,number][],b:readonly [number,number][]):number {
  let i=0,j=0,total=0;
  while(i<a.length&&j<b.length){
    const start=Math.max(a[i]![0],b[j]![0]),end=Math.min(a[i]![1],b[j]![1]);
    if(end>start)total+=end-start;
    if(a[i]![1]<b[j]![1])i++;else j++;
  }
  return total;
}
export function spanMatch(gold:readonly TextSpan[],predicted:readonly TextSpan[]):SpanReport {
  gold.forEach(checkSpan);predicted.forEach(checkSpan);
  const key=(s:TextSpan)=>JSON.stringify([s.documentId,s.start,s.end]);
  const pool=new Map<string,number>();
  for(const s of predicted)pool.set(key(s),(pool.get(key(s))??0)+1);
  let exact=0;
  for(const s of gold){const left=pool.get(key(s))??0;if(left>0){exact++;pool.set(key(s),left-1);}}
  const g=merged(gold),p=merged(predicted);
  const goldChars=[...g.values()].reduce((s,v)=>s+length(v),0);
  const predictedChars=[...p.values()].reduce((s,v)=>s+length(v),0);
  let sharedChars=0;
  for(const [doc,intervals] of g)sharedChars+=shared(intervals,p.get(doc)??[]);
  return {
    exactRecall:rate(exact,gold.length),exactPrecision:rate(exact,predicted.length),
    overlap:{goldChars,predictedChars,sharedChars,
      precision:rate(sharedChars,predictedChars),recall:rate(sharedChars,goldChars),
      f1:rate(2*sharedChars,goldChars+predictedChars)},
  };
}

// ---------------------------------------------------------------------------------------------
// Eligibility misjudgment

export interface MisjudgmentReport {
  /** Gold INELIGIBLE predicted ELIGIBLE / gold-labelled cases (the critical error, 중대한 허위 적격). */
  falseEligible:Rate;
  /** Gold UNKNOWN predicted ELIGIBLE / gold-labelled cases: a definite claim the evidence does not support. */
  unsupportedEligible:Rate;
  /** Both of the above / gold-labelled cases. */
  total:Rate;
  /** Gold cases without a prediction: not counted as errors, listed so coverage stays visible. */
  missingPredictions:string[];
}
const ELIGIBILITY=new Set<GoldEligibility>(['ELIGIBLE','INELIGIBLE','UNKNOWN']);
export function eligibilityMisjudgment(predicted:Readonly<Record<string,GoldEligibility>>,
  gold:Readonly<Record<string,GoldEligibility>>):MisjudgmentReport {
  const ids=Object.keys(gold).sort(byCodeUnit),missingPredictions:string[]=[];
  let falseEligible=0,unsupported=0;
  for(const id of ids){
    if(!ELIGIBILITY.has(gold[id]!))throw new RangeError('Unknown eligibility');
    if(!Object.prototype.hasOwnProperty.call(predicted,id)){missingPredictions.push(id);continue;}
    const guess=predicted[id]!;
    if(!ELIGIBILITY.has(guess))throw new RangeError('Unknown eligibility');
    if(guess==='ELIGIBLE'&&gold[id]==='INELIGIBLE')falseEligible++;
    if(guess==='ELIGIBLE'&&gold[id]==='UNKNOWN')unsupported++;
  }
  return {falseEligible:rate(falseEligible,ids.length),unsupportedEligible:rate(unsupported,ids.length),
    total:rate(falseEligible+unsupported,ids.length),missingPredictions};
}
