import type {FaqCandidate} from '@hufs-one/contracts';
import {bigramCoverage,faqNumbers,normalizeFaqText} from './faq-text.js';

/** What the guard needs from one retrieved paragraph. */
export interface FaqGuardEvidence{citationId:string;title:string;text:string;}
export type FaqRejectReason=
  |'DUPLICATE_CITATION'|'UNKNOWN_CITATION'|'QUOTE_TOO_SHORT'|'QUOTE_NOT_IN_SOURCE'
  |'NUMBER_NOT_QUOTED'|'AMOUNT_NOT_QUOTED'|'RELATIVE_DATE_NOT_IN_SOURCE'|'NEGATION_NOT_IN_SOURCE'
  |'NEGATION_DROPPED'|'UNSUPPORTED_CLAIM'|'ELIGIBILITY_VERDICT'|'URL_OR_CONTACT';
/** A quote shorter than this (spaces excluded) can be found in almost any paragraph. */
export const FAQ_MIN_QUOTE_CHARS=8;
/** Share of the answer's bigrams that must come from the cited paragraphs. */
export const FAQ_MIN_SUPPORT=0.6;
/** An answer sentence keeps the polarity of the source sentence it leans on most; below this
 * overlap it has no supporting sentence and UNSUPPORTED_CLAIM decides instead. */
const POLARITY_MIN_OVERLAP=0.3;

// Predicate negation only: adverbial "없이" ("신청서 없이 할 수 있습니다") states a positive rule.
// "못" covers both "못 해요" and the fused "못합니다/못해요/못했/못함" (#341 follow-up). "안 되다" is a
// negation only as a standalone word: "보안 됩니다" and "안내됩니다" must stay positive.
const NEGATION=/아니|아닙|아님|않|없(?!이|는)|불가|못(?:\s|하|해|했|합|함)|(?<![가-힣])안\s*(?:되|돼|됐|됩|됨)|금지|제외/;
/** Keep modal predicate polarity distinct from incidental adjectives such as "기간 제한 없는".
 * Use action-specific matches where possible, rather than a paragraph-level negation bit. */
function modalClaims(sentence:string):{action:string;negative:boolean}[]{
  const matches:{action:string;negative:boolean}[]=[];
  for(const m of sentence.matchAll(/([가-힣]*(?:할|될|받을))\s*수\s*(있|없)/g)){
    matches.push({action:m[1]!,negative:m[2]==='없'});
  }
  return matches;
}
// An FAQ may state a rule ("3.0 이상이면 지원할 수 있습니다"); it must never apply it to the asker.
const VERDICT=/불합격|합격|탈락|선발\s*(?:가능|확정|됩|될|되)|자격\s*(?:을|이)?\s*(?:충족|갖추|갖췄|있|됩|된|없)|지원\s*(?:가능|하실\s*수|할\s*수\s*(?:있|없))|\bpass\b|\bfail\b/i;
const PERSONAL=/입력하신|말씀하신|알려주신|회원님|학생분|당신|귀하|질문자|조건이면|경우라면|이시면|이시므로|하셨으니|하셨으므로/;
const RELATIVE=/오늘|내일|모레|어제|이번\s*(?:주|달|학기)|다음\s*(?:주|달|학기)|지난\s*(?:주|달)|금주|차주|월말|주말|조만간|[월화수목금토일]요일/g;
const KOREAN_AMOUNT=/[일이삼사오육칠팔구]?[십백천만억][일이삼사오육칠팔구십백천만억]*\s*(?:원|학점|명|시간|퍼센트)/g;
// "세 개 학기", "삼 학기", "두 번": a spelled-out count must be quoted exactly, like a digit.
const KOREAN_COUNT=/(?<![\p{L}\p{N}])(?:한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|일|이|삼|사|오|육|칠|팔|구)\s*(?:개\s*)?(?:학기|학점|개월|년|명|회|번|주|시간|과목|개)(?![\p{L}\p{N}])/gu;
const LINK=/https?:\/\/|www\.|[\w.+-]+@[\w-]+\.[\w.-]+|\b0\d{1,2}-\d{3,4}-\d{4}\b/i;

function splitSentences(s:string):string[]{
  return s.split(/(?<=[.?!。])\s+|\n+/).map(x=>x.trim()).filter(x=>x.length>1);
}
/** The quoted or cited sentence covering most of this answer sentence; on a tie the quote (listed first) wins. */
function bestSupport(sentence:string,sources:readonly string[]):string|undefined{
  let best:string|undefined,score=POLARITY_MIN_OVERLAP;
  for(const candidate of sources){
    const value=bigramCoverage(sentence,candidate);
    if(value>score||value===score&&!best){best=candidate;score=value;}
  }
  return best;
}

/** Code-side grounding for an HCX-007 FAQ candidate (#341). The prompt asks for the same rules,
 * but only this check decides; an empty result means every claim was bound to quoted evidence.
 * Numbers and Korean-numeral amounts or counts must be inside a verified quote. Wording and relative
 * dates must come from the cited paragraphs, and each answer sentence must keep the negation polarity
 * of its supporting quote/source sentence. A personal eligibility verdict is never allowed. */
export function checkFaqCandidate(candidate:FaqCandidate,evidence:readonly FaqGuardEvidence[]):FaqRejectReason[]{
  const reasons=new Set<FaqRejectReason>();
  const refs=new Map(evidence.map(e=>[e.citationId,e]));
  if(refs.size!==evidence.length||new Set(candidate.citations.map(c=>c.citationId)).size!==candidate.citations.length)
    reasons.add('DUPLICATE_CITATION');
  const quotes:string[]=[],cited:string[]=[],sentences:string[]=[];
  for(const item of candidate.citations){
    const paragraph=refs.get(item.citationId);
    if(!paragraph){reasons.add('UNKNOWN_CITATION');continue;}
    const quote=normalizeFaqText(item.quote);
    if(quote.replace(/\s/g,'').length<FAQ_MIN_QUOTE_CHARS){reasons.add('QUOTE_TOO_SHORT');continue;}
    if(!normalizeFaqText(paragraph.text).includes(quote)){reasons.add('QUOTE_NOT_IN_SOURCE');continue;}
    quotes.push(quote);cited.push(normalizeFaqText(paragraph.title+' '+paragraph.text));
  }
  for(const q of quotes)sentences.push(...splitSentences(q));
  for(const c of cited)sentences.push(...splitSentences(c));
  const answer=normalizeFaqText(candidate.answer);
  if(LINK.test(answer))reasons.add('URL_OR_CONTACT');
  const quoted=quotes.join(' '),source=cited.join(' ');
  const allowed=new Set(faqNumbers(quoted));
  if(faqNumbers(answer).some(n=>!allowed.has(n)))reasons.add('NUMBER_NOT_QUOTED');
  for(const m of [...answer.match(KOREAN_AMOUNT)||[],...answer.match(KOREAN_COUNT)||[]])
    if(!quoted.includes(m))reasons.add('AMOUNT_NOT_QUOTED');
  for(const m of answer.match(RELATIVE)||[])if(!source.includes(m))reasons.add('RELATIVE_DATE_NOT_IN_SOURCE');
  for(const sentence of splitSentences(answer)){
    const support=bestSupport(sentence,sentences);
    if(!support)continue;
    const claims=modalClaims(sentence),supported=modalClaims(support);
    if(claims.length&&supported.length){
      for(const claim of claims){
        const sameAction=supported.filter(s=>s.action===claim.action);
        // One source assertion can back a rephrased modal; several different
        // claims cannot be treated as interchangeable just because words overlap.
        const match=sameAction.length?sameAction:supported.length===1?supported:[];
        if(!match.length){reasons.add('UNSUPPORTED_CLAIM');continue;}
        if(!match.some(s=>s.negative===claim.negative))
          reasons.add(claim.negative?'NEGATION_NOT_IN_SOURCE':'NEGATION_DROPPED');
      }
      continue;
    }
    const negated=NEGATION.test(sentence),sourceNegated=NEGATION.test(support);
    if(negated&&!sourceNegated)reasons.add('NEGATION_NOT_IN_SOURCE');
    if(!negated&&sourceNegated)reasons.add('NEGATION_DROPPED');
  }
  if(VERDICT.test(answer)&&(PERSONAL.test(answer)||!VERDICT.test(source)))reasons.add('ELIGIBILITY_VERDICT');
  if(bigramCoverage(answer,source)<FAQ_MIN_SUPPORT)reasons.add('UNSUPPORTED_CLAIM');
  return [...reasons];
}
