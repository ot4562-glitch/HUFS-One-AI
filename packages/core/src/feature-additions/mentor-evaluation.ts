/**
 * #344: offline relevance evaluator for independently labelled mentor retrieval.
 * It does not label students, contact mentors, call an LLM, or infer protected
 * traits. Synthetic labels are useful only as regression fixtures, not Gold.
 */
export type MentorJudgment={mentorId:string;relevance:0|1|2};
export type MentorMetrics={
  k:number;judgedCandidates:number;relevantCandidates:number;retrievedRelevant:number;
  /** Null (not a perfect score) when the oracle has no relevant mentor. */
  ndcgAtK:number|null;recallAtK:number|null;mrrAtK:number|null;
};
const gain=(grade:0|1|2)=>Math.pow(2,grade)-1;
const dcg=(relevance:readonly (0|1|2)[])=>relevance.reduce((total,g,i)=>
  total+gain(g)/Math.log2(i+2),0);
export function evaluateMentorRankingAtK(input:{
  rankedIds:readonly string[];
  judgments:readonly MentorJudgment[];
  k?:number;
}):MentorMetrics{
  const k=input.k??5;
  if(!Number.isSafeInteger(k)||k<1||k>20)throw new RangeError('Invalid mentor evaluation k');
  if(input.judgments.length<1||input.judgments.length>10000)
    throw new RangeError('No bounded mentor judgment registry');
  const labels=new Map<string,0|1|2>();
  for(const item of input.judgments){
    if(!item.mentorId||!Number.isInteger(item.relevance)||item.relevance<0||item.relevance>2
      ||labels.has(item.mentorId))
      throw new RangeError('Duplicate or invalid mentor judgment');
    labels.set(item.mentorId,item.relevance);
  }
  if(new Set(input.rankedIds).size!==input.rankedIds.length
    ||input.rankedIds.some(id=>!labels.has(id)))
    throw new RangeError('Unknown or duplicated ranked mentor ID');
  const top=input.rankedIds.slice(0,k);
  const grades=top.map(id=>labels.get(id)!);
  const relevant=[...labels.values()].filter(v=>v>0).length;
  const retrievedRelevant=grades.filter(v=>v>0).length;
  const ideal=[...labels.values()].sort((a,b)=>b-a).slice(0,k);
  const idealGain=dcg(ideal);
  const first=grades.findIndex(v=>v>0);
  return {k,judgedCandidates:labels.size,relevantCandidates:relevant,retrievedRelevant,
    ndcgAtK:idealGain>0?dcg(grades)/idealGain:null,
    recallAtK:relevant>0?retrievedRelevant/relevant:null,
    mrrAtK:relevant>0?(first>=0?1/(first+1):0):null};
}
