import type {FaqCandidate} from '@hufs-one/contracts';
import {bigramCoverage,faqNumbers,normalizeFaqText} from './faq-text.js';

/** What the guard needs from one retrieved paragraph. */
export interface FaqGuardEvidence{citationId:string;title:string;text:string;}
export type FaqRejectReason=
  |'DUPLICATE_CITATION'|'UNKNOWN_CITATION'|'QUOTE_TOO_SHORT'|'QUOTE_NOT_IN_SOURCE'
  |'NUMBER_NOT_QUOTED'|'AMOUNT_NOT_QUOTED'|'RELATIVE_DATE_NOT_IN_SOURCE'|'NEGATION_NOT_IN_SOURCE'
  |'UNSUPPORTED_CLAIM'|'ELIGIBILITY_VERDICT'|'URL_OR_CONTACT';
/** A quote shorter than this (spaces excluded) can be found in almost any paragraph. */
export const FAQ_MIN_QUOTE_CHARS=8;
/** Share of the answer's bigrams that must come from the cited paragraphs. */
export const FAQ_MIN_SUPPORT=0.6;

const NEGATION=/아니|아닙|아님|않|없|불가|못\s|금지|제외/;
// An FAQ may state a rule ("3.0 이상이면 지원할 수 있습니다"); it must never apply it to the asker.
const VERDICT=/불합격|합격|탈락|선발\s*(?:가능|확정|됩|될|되)|자격\s*(?:을|이)?\s*(?:충족|갖추|갖췄|있|됩|된|없)|지원\s*(?:가능|하실\s*수|할\s*수\s*(?:있|없))|\bpass\b|\bfail\b/i;
const PERSONAL=/입력하신|말씀하신|알려주신|회원님|학생분|당신|귀하|질문자|조건이면|경우라면|이시면|이시므로|하셨으니|하셨으므로/;
const RELATIVE=/오늘|내일|모레|어제|이번\s*(?:주|달|학기)|다음\s*(?:주|달|학기)|지난\s*(?:주|달)|금주|차주|월말|주말|조만간|[월화수목금토일]요일/g;
const KOREAN_AMOUNT=/[일이삼사오육칠팔구]?[십백천만억][일이삼사오육칠팔구십백천만억]*\s*(?:원|학점|명|시간|퍼센트)/g;
const LINK=/https?:\/\/|www\.|[\w.+-]+@[\w-]+\.[\w.-]+|\b0\d{1,2}-\d{3,4}-\d{4}\b/i;

/** Code-side grounding for an HCX-007 FAQ candidate (#341). The prompt asks for the same rules,
 * but only this check decides; an empty result means every claim was bound to quoted evidence.
 * Numbers and Korean-numeral amounts must be inside a verified quote. Wording, negation and
 * relative dates must come from the cited paragraphs. A personal eligibility verdict is never allowed. */
export function checkFaqCandidate(candidate:FaqCandidate,evidence:readonly FaqGuardEvidence[]):FaqRejectReason[]{
  const reasons=new Set<FaqRejectReason>();
  const refs=new Map(evidence.map(e=>[e.citationId,e]));
  if(refs.size!==evidence.length||new Set(candidate.citations.map(c=>c.citationId)).size!==candidate.citations.length)
    reasons.add('DUPLICATE_CITATION');
  const quotes:string[]=[],cited:string[]=[];
  for(const item of candidate.citations){
    const paragraph=refs.get(item.citationId);
    if(!paragraph){reasons.add('UNKNOWN_CITATION');continue;}
    const quote=normalizeFaqText(item.quote);
    if(quote.replace(/\s/g,'').length<FAQ_MIN_QUOTE_CHARS){reasons.add('QUOTE_TOO_SHORT');continue;}
    if(!normalizeFaqText(paragraph.text).includes(quote)){reasons.add('QUOTE_NOT_IN_SOURCE');continue;}
    quotes.push(quote);cited.push(normalizeFaqText(paragraph.title+' '+paragraph.text));
  }
  const answer=normalizeFaqText(candidate.answer);
  if(LINK.test(answer))reasons.add('URL_OR_CONTACT');
  const quoted=quotes.join(' '),source=cited.join(' ');
  const allowed=new Set(faqNumbers(quoted));
  if(faqNumbers(answer).some(n=>!allowed.has(n)))reasons.add('NUMBER_NOT_QUOTED');
  for(const m of answer.match(KOREAN_AMOUNT)||[])if(!quoted.includes(m))reasons.add('AMOUNT_NOT_QUOTED');
  for(const m of answer.match(RELATIVE)||[])if(!source.includes(m))reasons.add('RELATIVE_DATE_NOT_IN_SOURCE');
  if(NEGATION.test(answer)&&!NEGATION.test(source))reasons.add('NEGATION_NOT_IN_SOURCE');
  if(VERDICT.test(answer)&&(PERSONAL.test(answer)||!VERDICT.test(source)))reasons.add('ELIGIBILITY_VERDICT');
  if(bigramCoverage(answer,source)<FAQ_MIN_SUPPORT)reasons.add('UNSUPPORTED_CLAIM');
  return [...reasons];
}
