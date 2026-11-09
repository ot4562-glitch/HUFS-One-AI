import type {FeatureAdditions as C,TopicCode} from '@hufs-one/contracts';
import {source} from './v2.fixtures.js';

/** #347 held-out set, written after the lexicon was fixed and measured once (2026-11-08).
 * Fictional codes and texts; SYNTHETIC, not human Gold. */
type Req=[id:string,label:string,codes:string[]];
const REQS:Req[]=[
  ['H01','고객 문의를 응대하고 불만을 해결한다',['SYN-CS']],
  ['H02','행사 예산안을 작성하고 정산한다',['ACCOUNTING_TAX']],
  ['H03','머신러닝 모델을 학습시키고 성능을 평가한다',['AI_ML']],
  ['H04','보도자료와 홍보 문안을 작성한다',['MARKETING_BRAND','MEDIA_CONTENT']],
  ['H05','일본어로 해외 파트너와 이메일을 주고받는다',['LANGUAGE_TRANSLATION','GLOBAL_SALES']],
  ['H06','클라우드 서버를 운영하고 장애에 대응한다',['CLOUD_INFRA']],
  ['H07','환경 캠페인을 기획한다',['ESG_SUSTAINABILITY']],
  ['H08','창업 아이템의 사업계획서를 작성한다',['STARTUP_ENTREPRENEUR']],
];
type Exp=[id:string,text:string,codes:TopicCode[]];
const EXPS:Exp[]=[
  ['F01','콜센터 아르바이트로 고객 상담과 민원 처리를 맡았다',[]],
  ['F02','축제 준비위원회에서 예산을 짜고 영수증으로 정산했다',[]],
  ['F03','캐글 대회에서 분류 모델을 학습시키고 정확도를 비교했다',['AI_ML']],
  ['F04','학과 행사 보도자료를 써서 학교 신문에 실었다',['MEDIA_CONTENT']],
  ['F05','일본 자매학교 담당자와 일본어 메일로 일정을 조율했다',['LANGUAGE_TRANSLATION']],
  ['F06','AWS EC2 서버를 운영하며 장애 알림을 처리했다',['CLOUD_INFRA']],
  ['F07','교내 일회용컵 줄이기 캠페인을 기획했다',['ESG_SUSTAINABILITY']],
  ['F08','창업 동아리에서 사업계획서를 써서 지원금을 받았다',['STARTUP_ENTREPRENEUR']],
  ['F09','등산 동호회 회원',[]],
  ['F10','영화 감상 블로그 운영',['MEDIA_CONTENT']],
];
export const SKILL_HOLDOUT_GOLD:Readonly<Record<string,readonly string[]>>={
  H01:['F01'],H02:['F02'],H03:['F03'],H04:['F04'],H05:['F05'],H06:['F06'],H07:['F07'],H08:['F08'],
};
export const SKILL_HOLDOUT_REQUIREMENTS:readonly C.JobRequirement[]=REQS.map(([id,label,topicCodes])=>
  ({id,label,topicCodes,sourceSpanId:'span-1',source:source('syn-ncs-h1')}));
export const SKILL_HOLDOUT_EXPERIENCES:readonly C.ExperienceEvidence[]=EXPS.map(([id,,topicCodes])=>
  ({id,approved:true,topicCodes,version:id+'-v1',evidenceSpanIds:['span-'+id]}));
export const SKILL_HOLDOUT_TEXT:readonly {id:string;text:string}[]=EXPS.map(([id,text])=>({id,text}));
