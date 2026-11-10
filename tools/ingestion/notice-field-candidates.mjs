/**
 * Candidate-only Korean public notice fields. Never declares eligibility,
 * official application, publication permission or an ACTIVE SourceRevision.
 * Input paragraphs already came from the approved extractor and carry stable
 * paragraph identifiers; no network, AI or locale-dependent date parsing.
 */
const REF=/^[A-Za-z0-9_.:@-]{1,128}$/;
const DEADLINE=/(?:신청|접수|지원)?\s*마감(?:일|일자|시간|시각)?\s*[:：]?\s*(20\d{2})\s*(?:[.\/-]|년)\s*(\d{1,2})\s*(?:[.\/-]|월)\s*(\d{1,2})(?:\s*일)?(?:\s*\.?\s*(\d{1,2}):(\d{2}))?/gu;
function asDate(year,month,day,hour,min){
  const y=Number(year),m=Number(month),d=Number(day);
  const parsed=new Date(Date.UTC(y,m-1,d));
  if(parsed.getUTCFullYear()!==y||parsed.getUTCMonth()!==m-1||parsed.getUTCDate()!==d)
    return null;
  const hasTime=hour!==undefined;
  if(hasTime&&(min===undefined||Number(hour)>23||Number(min)>59))return null;
  return {
    date:[year,String(m).padStart(2,'0'),String(d).padStart(2,'0')].join('-'),
    ...(hasTime?{localTime:String(Number(hour)).padStart(2,'0')+':'+min}:{localTime:null}),
    timeZone:'Asia/Seoul',
  };
}
function unknown(reason){return {state:'UNKNOWN',reason};}
function assess(values,missing){
  if(!values.length)return unknown(missing);
  const distinct=new Map(values.map(x=>[JSON.stringify(x.value),x]));
  if(distinct.size!==1)return unknown('AMBIGUOUS_MULTIPLE_SOURCE_VALUES');
  const key=[...distinct.keys()][0];
  return {state:'KNOWN',value:JSON.parse(key),
    sourceSpanIds:[...new Set(values.map(x=>x.paragraphId))]};
}
/** All parsed values are proposals for independent review, never verified facts. */
export function extractNoticeFieldCandidates({sourceId,revisionId,paragraphs}){
  if(!REF.test(sourceId)||!REF.test(revisionId)||!Array.isArray(paragraphs)
    ||paragraphs.length===0||paragraphs.length>200)
    throw new Error('NOTICE_CANDIDATES_REQUIRE_REVIEW');
  const dates=[],campuses=[];
  for(const paragraph of paragraphs){
    if(!paragraph||!REF.test(paragraph.id)||typeof paragraph.text!=='string'
      ||paragraph.text.length<1||paragraph.text.length>20000)
      throw new Error('NOTICE_CANDIDATES_REQUIRE_REVIEW');
    for(const m of paragraph.text.matchAll(DEADLINE)){
      const date=asDate(m[1],m[2],m[3],m[4],m[5]);
      if(date)dates.push({value:date,paragraphId:paragraph.id});
    }
    if(/서울\s*캠퍼스/u.test(paragraph.text))
      campuses.push({value:'SEOUL',paragraphId:paragraph.id});
    if(/글로벌\s*캠퍼스/u.test(paragraph.text))
      campuses.push({value:'GLOBAL',paragraphId:paragraph.id});
  }
  return {
    sourceId,revisionId,state:'NEEDS_REVIEW',
    fields:{
      deadline:assess(dates,'NO_EXPLICIT_DEADLINE'),
      campus:assess(campuses,'NO_EXPLICIT_CAMPUS'),
      eligibility:unknown('STUDENT_FACTS_AND_REVIEW_REQUIRED'),
    },
  };
}
