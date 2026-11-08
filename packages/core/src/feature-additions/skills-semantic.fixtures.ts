import type {FeatureAdditions as C,TopicCode} from '@hufs-one/contracts';
import {source} from './v2.fixtures.js';

/** #347 synthetic NCS-like jobs (10 × 3 requirements) and 30 owner experiences.
 * Codes "SYN-*" are fictional official codes, not NCS. Experience texts are invented, not student data.
 * Gold pairs were written before the scorer by the AI developer: SYNTHETIC, not independent human Gold. */
type Req=[id:string,label:string,codes:string[]];
const REQS:Req[]=[
  ['R01','데이터를 수집·정제하고 통계적으로 분석한다',['SYN-DATA']],
  ['R02','분석 결과를 시각화하여 보고서로 작성한다',['SYN-DATA','SYN-DOC']],
  ['R03','SQL로 데이터베이스를 조회한다',['SYN-DB']],
  ['R04','해외 바이어와 영어로 협상하고 소통한다',['GLOBAL_SALES','LANGUAGE_TRANSLATION']],
  ['R05','수출입 서류와 통관 절차를 처리한다',['TRADE_OVERSEAS']],
  ['R06','시장 조사를 통해 해외 진출 전략을 수립한다',['SYN-MKT-RESEARCH']],
  ['R07','SNS 캠페인을 기획하고 운영한다',['MARKETING_BRAND']],
  ['R08','콘텐츠를 제작하고 성과를 측정한다',['MEDIA_CONTENT','DATA_ANALYTICS']],
  ['R09','브랜드 메시지를 고객 관점에서 설계한다',['SYN-BRAND']],
  ['R10','웹 서비스의 프론트엔드를 개발한다',['SOFTWARE_DEV']],
  ['R11','API 서버를 설계하고 구현한다',['SOFTWARE_DEV','CLOUD_INFRA']],
  ['R12','Git으로 협업하며 코드 리뷰를 수행한다',['SYN-COLLAB']],
  ['R13','사용자 인터뷰를 설계하고 진행한다',['PRODUCT_UX']],
  ['R14','프로토타입으로 사용성 테스트를 수행한다',['PRODUCT_UX']],
  ['R15','조사 결과를 팀에 발표한다',['SYN-PRESENT']],
  ['R16','채용 공고를 작성하고 면접을 운영한다',['HR_ORG']],
  ['R17','구성원 교육 프로그램을 기획한다',['HR_ORG','EDUCATION_TUTORING']],
  ['R18','노무 관련 법령을 검토한다',['SYN-LABOR']],
  ['R19','재무제표를 분석한다',['FINANCE_INVESTMENT','ACCOUNTING_TAX']],
  ['R20','예산을 편성하고 집행을 관리한다',['ACCOUNTING_TAX']],
  ['R21','투자 보고서를 작성한다',['FINANCE_INVESTMENT']],
  ['R22','중국어 문서를 한국어로 번역한다',['LANGUAGE_TRANSLATION']],
  ['R23','회의에서 순차 통역을 한다',['LANGUAGE_TRANSLATION']],
  ['R24','용어집을 관리한다',['SYN-TERM']],
  ['R25','정책 자료를 조사하고 분석한다',['PUBLIC_POLICY','ECONOMIC_RESEARCH']],
  ['R26','설문을 설계하고 결과를 해석한다',['SYN-SURVEY']],
  ['R27','정책 제안서를 작성한다',['PUBLIC_POLICY']],
  ['R28','학습자를 대상으로 멘토링을 진행한다',['EDUCATION_TUTORING']],
  ['R29','교육 행사를 기획하고 운영한다',['EDUCATION_TUTORING']],
  ['R30','성별·연령에 따른 학습자 특성을 파악한다',['SYN-DEMO']],
];
type Exp=[id:string,text:string,codes:TopicCode[],approved?:boolean];
const EXPS:Exp[]=[
  ['E01','가상 공공데이터로 파이썬 통계 분석 프로젝트를 진행하고 결과를 시각화했다',['DATA_ANALYTICS']],
  ['E02','동아리 설문조사를 설계하고 엑셀로 응답을 분석했다',[]],
  ['E03','MySQL로 동아리 회원 데이터베이스를 만들고 SQL 쿼리를 작성했다',['SOFTWARE_DEV']],
  ['E04','교환학생 기간 현지 기업 바이어 미팅에서 영어 통역을 도왔다',['LANGUAGE_TRANSLATION']],
  ['E05','무역회사 인턴으로 수출 서류와 통관 절차를 처리했다',['TRADE_OVERSEAS']],
  ['E06','해외 시장 조사 보고서를 작성해 진출 전략을 제안했다',[]],
  ['E07','학과 SNS 계정의 홍보 캠페인을 기획하고 운영했다',['MARKETING_BRAND']],
  ['E08','유튜브 영상 콘텐츠를 제작하고 조회수를 분석했다',['MEDIA_CONTENT']],
  ['E09','React로 동아리 웹사이트 프론트엔드를 개발했다',['SOFTWARE_DEV']],
  ['E10','Node.js로 API 서버를 만들고 AWS에 배포했다',['SOFTWARE_DEV','CLOUD_INFRA']],
  ['E11','팀 프로젝트에서 GitHub으로 코드 리뷰를 하며 협업했다',['SOFTWARE_DEV']],
  ['E12','앱 사용자 5명을 인터뷰하고 개선점을 정리했다',['PRODUCT_UX']],
  ['E13','피그마로 프로토타입을 만들어 사용성 테스트를 진행했다',['PRODUCT_UX']],
  ['E14','학회에서 조사 결과를 발표했다',[]],
  ['E15','학생회 신입 부원 모집 공고를 쓰고 면접을 진행했다',['HR_ORG']],
  ['E16','신입생 대상 교육 프로그램을 기획했다',['EDUCATION_TUTORING']],
  ['E17','가상 기업 재무제표를 분석하는 투자 동아리 활동',['FINANCE_INVESTMENT']],
  ['E18','학생회 예산을 편성하고 결산했다',[]],
  ['E19','모의 투자 대회에서 기업 분석 보고서를 작성했다',['FINANCE_INVESTMENT']],
  ['E20','중국어 기사 번역 봉사를 했다',['LANGUAGE_TRANSLATION']],
  ['E21','국제 컨퍼런스에서 순차 통역 자원봉사',['LANGUAGE_TRANSLATION']],
  ['E22','번역 프로젝트의 용어집을 정리하고 관리했다',[]],
  ['E23','청년 주거 정책 자료를 조사해 분석 리포트를 썼다',['PUBLIC_POLICY']],
  ['E24','지역 문제 해결 정책 제안서를 작성해 공모전에 냈다',['PUBLIC_POLICY']],
  ['E25','중학생 수학 멘토링 봉사를 1년간 했다',['EDUCATION_TUTORING']],
  ['E26','학과 진로 특강 행사를 기획하고 운영했다',[]],
  ['E27','카페 아르바이트에서 고객 응대를 했다',[]],
  ['E28','축구 동아리 활동',[]],
  ['E29','여성 리더십 캠프 참가',[]],
  ['E30','엑셀 피벗으로 매출 데이터를 정리했다',['DATA_ANALYTICS'],false],
];
/** Requirement → experiences that genuinely evidence it. Unapproved E30 and protected-attribute R30 have none. */
export const SKILL_GOLD:Readonly<Record<string,readonly string[]>>={
  R01:['E01','E02'],R02:['E01'],R03:['E03'],R04:['E04'],R05:['E05'],R06:['E06'],R07:['E07'],R08:['E08'],R09:[],
  R10:['E09'],R11:['E10'],R12:['E11'],R13:['E12'],R14:['E13'],R15:['E14'],R16:['E15'],R17:['E16'],R18:[],
  R19:['E17'],R20:['E18'],R21:['E19'],R22:['E20'],R23:['E21','E04'],R24:['E22'],R25:['E23'],R26:['E02'],
  R27:['E24'],R28:['E25'],R29:['E16','E26'],R30:[],
};
export const SKILL_REQUIREMENTS:readonly C.JobRequirement[]=REQS.map(([id,label,topicCodes])=>
  ({id,label,topicCodes,sourceSpanId:'span-1',source:source('syn-ncs-r1')}));
export const SKILL_EXPERIENCES:readonly C.ExperienceEvidence[]=EXPS.map(([id,,topicCodes,approved=true])=>
  ({id,approved,topicCodes,version:id+'-v1',evidenceSpanIds:['span-'+id]}));
/** Owner-approved, already sanitized description text; the server supplies it, never the browser. */
export const SKILL_EXPERIENCE_TEXT:readonly {id:string;text:string}[]=EXPS.map(([id,text])=>({id,text}));
export const SKILL_CROSSWALK:readonly C.TopicCrosswalk[]=([
  ['X1','SYN-DATA','DATA_ANALYTICS'],['X2','SYN-BRAND','MARKETING_BRAND'],['X3','SYN-SURVEY','DATA_ANALYTICS'],
] as const).map(([id,officialRequirementTopic,oneAiTopic])=>({id,officialRequirementTopic,oneAiTopic,source:source('syn-xwalk-r1')}));
