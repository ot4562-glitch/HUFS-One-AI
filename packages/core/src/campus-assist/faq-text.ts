/** Korean FAQ text helpers shared by retrieval and answer checks (#341).
 * No morphology model: strip one common particle/ending per word and compare character bigrams,
 * so "교환학생은" still meets "교환학생" and a one-letter typo keeps most of its bigrams. */

/** Question fillers that never identify a topic. Injection verbs are included so they cannot steer ranking. */
const STOP=new Set([
  '알려줘','알려주세요','알려','뭐야','뭐예요','뭔가요','언제','언제야','언제예요','언제인가요','얼마','얼마야','얼마예요',
  '얼마나','어떻게','어디','어디서','어디에서','누구','무엇','무슨','어떤','몇','좀','제','저','나','내','저는','제가',
  '혹시','그리고','그럼','근데','해줘','해주세요','궁금해요','궁금합니다','싶어요','싶은데','있나요','있어요','되나요',
  '돼요','하나요','가능한가요','가능해요','방법','하고','싶은데','싶어','물어봐','물어봐요','필요해요','필요한가요',
  '이전','지시','무시','모든','규칙','시스템','프롬프트',
]);
// Longest first, so "신청하려면" loses "하려면" rather than only "면".
const SUFFIXES=[
  '까지입니다','에서는','이에요','인가요','인데요','입니다','합니다','하려면','하나요','되나요','할까요','했어요',
  '니다','해요','해야','해도','돼요','려면','어야','아야','하면','으면','나요','는데','에서','부터','까지','으로','이랑',
  '하고','예요','은','는','이','가','을','를','에','의','도','야','요','로','랑','만',
].sort((a,b)=>b.length-a.length);
/** Campus-wide words that name no FAQ topic; they rank but never satisfy the relevance gate. */
const GENERIC=new Set(['과목','수업','학교','학생','대학','대학교','우리','학과','관련','정보','내용','문의']);
export function isGenericFaqWord(w:string):boolean{return GENERIC.has(w);}
/** Small campus synonym table; a query word matches if it or any alternative matches. */
const SYNONYMS:Readonly<Record<string,readonly string[]>>={
  복전:['이중전공'],이중전공:['복전'],학점:['평점'],평점:['학점'],토플:['toefl'],toefl:['토플'],토익:['toeic'],
  toeic:['토익'],아이엘츠:['ielts'],ielts:['아이엘츠'],수신:['수강신청'],드랍:['수강취소'],드롭:['수강취소'],
  비번:['비밀번호'],봉사:['사회봉사'],공결:['출석인정'],휴학계:['휴학'],교환:['교환학생'],국장:['국가장학금'],
};

/** Comparison form: NFKC, lower case, single spaces. Whitespace and line breaks never change meaning. */
export function normalizeFaqText(s:string):string{
  return s.normalize('NFKC').toLocaleLowerCase('ko').replace(/\s+/g,' ').trim();
}
function stem(w:string):string{
  for(const suf of SUFFIXES)if(w.length>suf.length&&w.endsWith(suf))return w.slice(0,-suf.length);
  return w;
}
/** Content words: stop words and one-letter stems are dropped; long digit runs (IDs) never act as topics. */
export function faqWords(s:string):string[]{
  return normalizeFaqText(s).replace(/[^\p{L}\p{N}\s]/gu,' ').split(' ')
    .filter(w=>w&&!STOP.has(w)).map(stem)
    .filter(w=>w.length>=2&&!STOP.has(w)&&!/^\d{5,}$/.test(w));
}
export function wordBigrams(w:string):string[]{
  const out:string[]=[];
  for(let i=0;i<w.length-1;i++)out.push(w.slice(i,i+2));
  return out;
}
export function textBigrams(s:string):string[]{
  return faqWords(s).flatMap(wordBigrams);
}
export function synonymsOf(w:string):readonly string[]{
  return [w,...(SYNONYMS[w]||[])];
}
/** Short words must match whole; longer words tolerate one broken bigram (typo) in three. */
export function wordMatches(w:string,doc:ReadonlySet<string>):boolean{
  return synonymsOf(w).some(alt=>{
    const grams=wordBigrams(alt);
    const hit=grams.filter(g=>doc.has(g)).length;
    return grams.length<=2?hit===grams.length:hit/grams.length>=2/3;
  });
}
/** Share of a's distinct bigrams also present in b; 0 for an empty a. */
export function bigramCoverage(a:string,b:string):number{
  const left=new Set(textBigrams(a)),right=new Set(textBigrams(b));
  if(left.size===0)return 0;
  let hit=0;
  for(const g of left)if(right.has(g))hit++;
  return hit/left.size;
}
/** Decimal-aware numeric tokens ("3.0", "1,000"). */
export function faqNumbers(s:string):string[]{
  return normalizeFaqText(s).match(/\d+(?:[.,]\d+)*/g)||[];
}
/** Split a multi-part question so a second request cannot dilute the first one's relevance. */
export function faqClauses(s:string):string[]{
  return normalizeFaqText(s).split(/[.?!\n]+|그리고|또한/).map(x=>x.trim()).filter(Boolean);
}
