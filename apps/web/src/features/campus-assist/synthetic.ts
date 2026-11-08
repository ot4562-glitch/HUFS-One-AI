import type {ActivityRecord,ExchangePolicy,FaqDocument} from '@hufs-one/contracts';

/** Fictional, generated UI fixtures only; no student CSV, scraped campus page or official partner claim. */
const orgs=[
  {id:'SYN-ECON',name:'가상 경제학부 학생회',series:'orientation',label:'가상 신입생 OT',kind:'ORIENTATION' as const,campus:'SEOUL' as const},
  {id:'SYN-LANG',name:'가상 언어학과 사무실',series:'seminar',label:'가상 학술제',kind:'ACADEMIC' as const,campus:'GLOBAL' as const},
  {id:'SYN-CAREER',name:'가상 진로지원 학생회',series:'lecture',label:'가상 취업 특강',kind:'LECTURE' as const,campus:'BOTH' as const},
];
export const SYNTHETIC_ORGANIZATIONS=orgs.map(o=>({id:o.id,name:o.name}));
export const SYNTHETIC_ACTIVITIES:readonly ActivityRecord[]=orgs.flatMap((org,index)=>
  [2023,2024,2025].map((year,offset)=>({
    entryId:'synthetic-'+org.id+'-'+year,sourceId:'source-'+org.id+'-'+year,
    revisionId:'rev-'+org.id+'-'+year,organizationId:org.id,seriesId:org.series,
    title:org.label,kind:org.kind,campus:org.campus,
    publishedAt:year+'-02-0'+(offset+1)+'T00:00:00Z',
    verifiedAt:year+'-02-0'+(offset+2)+'T00:00:00Z',
    eventDate:year+'-0'+(index+3)+'-'+String(8+offset*3).padStart(2,'0'),
    sourceUrl:'https://example.org/synthetic/activity/'+org.id+'/'+year,
    status:'CONFIRMED' as const,rights:'APPROVED' as const,provenance:'SYNTHETIC' as const,
  })));

/** These ranges exist only as fictional fixture policy, never hard-coded official eligibility. */
const SYN_TERM_RULES={
  one:{ENROLLED:{min:2,max:5},LEAVE:{min:6,max:6}},
  two:{ENROLLED:{min:2,max:4},LEAVE:{min:5,max:5}},
} as const;

export const SYNTHETIC_PARTNERS:readonly ExchangePolicy[]=[
  {partnerId:'SYN-PARTNER-1',ruleId:'SYN-OIA-1',sourceRevision:'syn-rule-r1',sourceUrl:'https://example.org/synthetic/exchange-1',
    track:'OIA',publishedAt:'2026-01-01T00:00:00Z',verifiedAt:'2026-01-02T00:00:00Z',
    effectiveFrom:'2026-01-01',rights:'APPROVED',provenance:'SYNTHETIC',
    termRules:SYN_TERM_RULES,twoSemesterTransfersAllowed:false,priorCancellationAllowed:false,
    minimumGpa:3,partnerMinimumGpa:3,requiredLanguage:{test:'TOEFL',minimumScore:80}},
  {partnerId:'SYN-PARTNER-2',ruleId:'SYN-OIA-2',sourceRevision:'syn-rule-r2',sourceUrl:'https://example.org/synthetic/exchange-2',
    track:'OIA',publishedAt:'2026-01-01T00:00:00Z',verifiedAt:'2026-01-02T00:00:00Z',
    effectiveFrom:'2026-01-01',rights:'APPROVED',provenance:'SYNTHETIC',
    termRules:SYN_TERM_RULES,twoSemesterTransfersAllowed:false,priorCancellationAllowed:false,
    minimumGpa:3,partnerMinimumGpa:3.5,requiredLanguage:{test:'IELTS',minimumScore:6.5}},
  {partnerId:'SYN-PARTNER-3',ruleId:'SYN-OIA-3',sourceRevision:'syn-rule-r3',sourceUrl:'https://example.org/synthetic/exchange-3',
    track:'OIA',publishedAt:'2026-01-01T00:00:00Z',verifiedAt:'2026-01-02T00:00:00Z',
    effectiveFrom:'2026-01-01',rights:'APPROVED',provenance:'SYNTHETIC',termRules:SYN_TERM_RULES,twoSemesterTransfersAllowed:false,priorCancellationAllowed:false,
    minimumGpa:3},
];
const topics=[
  {category:'SERVICE' as const,title:'HUFS One AI 가상 사용법',text:'합성 시연 계정은 실제 학생 기록이 아닙니다. 학교 공식 서비스가 아니므로 담당 부서의 확인을 권장합니다.'},
  {category:'EXCHANGE' as const,title:'가상 교환학생 준비 FAQ',text:'가상 파견대학의 어학 점수는 파견 예정일 전에 유효기간을 확인해야 합니다. 이 문서는 공식 규정이 아닙니다.'},
  {category:'ACADEMICS' as const,title:'가상 학업 일정 안내',text:'가상 수강신청 일정과 실제 대학 학사 공고는 다릅니다. 날짜는 해당 학기 공식 원문이 있는 경우에만 확정합니다.'},
  {category:'SCHOLARSHIPS' as const,title:'가상 장학 확인 안내',text:'가상 장학금의 신청 조건과 마감은 학교가 확인한 공식 안내가 아닙니다. 실제 마감일을 추정하지 마세요.'},
  {category:'ACTIVITIES' as const,title:'가상 학과 행사 안내',text:'과거 학과 행사 이력으로 얻은 기간은 예상일 뿐입니다. 올해의 공식 학과 공지와 구분해야 합니다.'},
];
/** 100 wholly synthetic index examples; never label them independent human Gold. */
export const SYNTHETIC_FAQ_DOCUMENTS:readonly FaqDocument[]=Array.from({length:100},(_,i)=>{
  const topic=topics[i%topics.length]!;
  const num=String(i+1).padStart(3,'0');
  return {documentId:'SYN-FAQ-'+num,revisionId:'SYN-FAQ-'+num+'-r1',
    title:topic.title+' '+num,sourceUrl:'https://example.org/synthetic/faq/'+num,
    category:topic.category,publishedAt:'2026-01-01T00:00:00Z',verifiedAt:'2026-01-02T00:00:00Z',
    effectiveFrom:'2026-01-01',rights:'APPROVED',provenance:'SYNTHETIC',accessScope:'PUBLIC',
    paragraphs:[{id:'p1',text:topic.text}]};
});
