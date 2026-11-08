import {faqClauses,faqWords,isGenericFaqWord,synonymsOf,textBigrams,wordBigrams,wordMatches} from './faq-text.js';

/** One searchable paragraph. Rights, revision and asOf filtering happen before this, in faq.ts. */
export interface FaqSearchItem{key:string;title:string;text:string;}
export interface FaqSearchHit{key:string;score:number;matchedWords:number;}
export interface FaqSearchOptions{
  limit?:number;
  /** Share of a clause's content words that must occur in the paragraph (title included). */
  minMatchedShare?:number;
}
const K1=1.2,B=0.75;

/** Deterministic lexical retrieval for Korean FAQ text (#341): BM25 over character bigrams,
 * gated by how many of the question's content words the paragraph actually contains.
 * The gate is what turns "학교 식당 메뉴" into NOT_FOUND instead of six weak paragraphs
 * and a billable model call. Each clause of a multi-part question is gated on its own. */
export function searchFaqParagraphs(question:string,items:readonly FaqSearchItem[],opts:FaqSearchOptions={}):FaqSearchHit[]{
  const {limit=6,minMatchedShare=0.5}=opts;
  if(items.length===0)return [];
  // The title is counted twice: FAQ titles name the topic, paragraphs carry the detail.
  const docs=items.map(item=>{
    const grams=[...textBigrams(item.title),...textBigrams(item.title),...textBigrams(item.text)];
    const tf=new Map<string,number>();
    for(const g of grams)tf.set(g,(tf.get(g)||0)+1);
    return {key:item.key,tf,len:grams.length,set:new Set(grams)};
  });
  const avg=docs.reduce((s,d)=>s+d.len,0)/docs.length||1;
  const df=new Map<string,number>();
  for(const d of docs)for(const g of d.set)df.set(g,(df.get(g)||0)+1);
  const idf=(g:string)=>{const n=df.get(g)||0;return Math.log(1+(docs.length-n+0.5)/(n+0.5));};
  const clauses=faqClauses(question).map(c=>[...new Set(faqWords(c))]).filter(ws=>ws.length>0);
  const best=new Map<string,FaqSearchHit>();
  for(const words of clauses){
    const terms=[...new Set(words.flatMap(w=>synonymsOf(w).flatMap(wordBigrams)))];
    const topical=words.filter(w=>!isGenericFaqWord(w));
    if(topical.length===0)continue;
    // One or two topic words must all match ("주차 등록" is not "4주차까지"); longer questions need the share.
    const needed=topical.length<=2?topical.length:Math.ceil(topical.length*minMatchedShare);
    for(const d of docs){
      const matchedWords=topical.filter(w=>wordMatches(w,d.set)).length;
      if(matchedWords<needed)continue;
      let score=0;
      for(const g of terms){
        const f=d.tf.get(g)||0;
        if(f)score+=idf(g)*f*(K1+1)/(f+K1*(1-B+B*d.len/avg));
      }
      const prev=best.get(d.key);
      if(!prev||score>prev.score)best.set(d.key,{key:d.key,score,matchedWords});
    }
  }
  return [...best.values()].sort((a,b)=>b.score-a.score||a.key.localeCompare(b.key)).slice(0,limit);
}
