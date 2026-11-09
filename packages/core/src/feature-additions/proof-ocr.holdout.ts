import type {ProofOcrCase} from './proof-ocr.fixtures.js';
import type {ProofOcrLine} from './proof-ocr.js';

/** #346 held-out synthetic documents, written after the rules were fixed and measured once
 * (2026-11-08). Same caveats as proof-ocr.fixtures.ts: fictional, not human Gold, not OCR accuracy. */
type Row=[text:string,y:number,confidence?:number];
const doc=(id:string,rows:Row[]):ProofOcrLine[]=>rows.map(([text,y,confidence=0.95],i)=>
  ({id:id+'-l'+(i+1),text,bboxNorm:[0.1,y,0.9,Math.min(1,y+0.04)],confidence}));
export const PROOF_OCR_HOLDOUT:readonly ProofOcrCase[]=[
  {id:'h-workshop',lines:doc('h1',[['교육 이수 확인서',0.07],['교육명 가상 UX 리서치 워크숍',0.2],
    ['교육일시 2026년 8월 3일 ~ 2026년 8월 5일 (3일간)',0.27],['총 교육시간 18시간',0.32],['2026년 8월 7일',0.74],
    ['가상디자인진흥원 원장',0.84]]),
    expect:{kind:'CERTIFICATE',issuer:'가상디자인진흥원',start:'2026-08-03',end:'2026-08-05',issued:'2026-08-07',hours:'18'}},
  {id:'h-contest',lines:doc('h2',[['상장',0.06],['장려상',0.14],['제3회 가상 AI 아이디어 경진대회',0.22],
    ['위 팀은 우수한 성적으로 입상하였으므로 이 상장을 드립니다.',0.4],['2026. 11. 2.',0.73],['사단법인 가상인공지능협회 회장',0.83]]),
    expect:{kind:'AWARD_PROOF',issuer:'사단법인 가상인공지능협회',issued:'2026-11-02',award:'장려상'}},
  {id:'h-club',lines:doc('h3',[['동아리 활동 확인서',0.07],['동아리명: 가상 사진 동아리',0.2],
    ['활동 기간 2025.03.01 ~ 2026.02.28',0.28],['직책: 부회장',0.33],['상기 학생이 위 기간 동안 활동하였음을 확인함',0.45],
    ['2026.03.05',0.72],['가상대학교 학생지원센터장',0.83]]),
    expect:{kind:'PARTICIPATION_PROOF',issuer:'가상대학교 학생지원센터',start:'2025-03-01',end:'2026-02-28',issued:'2026-03-05'}},
  {id:'h-volunteer-portal',lines:doc('h4',[['봉사활동실적확인서',0.06],['소속: 가상대학교',0.15],
    ['봉사기간 2026-01-10 ~ 2026-02-20',0.25],['인정시간 24시간',0.3],['발급번호 2026-000123',0.6],
    ['발급일자 2026-02-25',0.66],['가상자원봉사센터',0.8]]),
    expect:{kind:'PARTICIPATION_PROOF',issuer:'가상자원봉사센터',start:'2026-01-10',end:'2026-02-20',issued:'2026-02-25',hours:'24'}},
  {id:'h-english-completion',lines:doc('h5',[['CERTIFICATE OF COMPLETION',0.08],
    ['has successfully completed the Virtual Data Bootcamp',0.3],['Course period: 2026-06-01 to 2026-07-10',0.38],
    ['Virtual Learning Institute',0.8],['Issued on 2026-07-15',0.86]]),
    expect:{kind:'CERTIFICATE',issuer:'Virtual Learning Institute',start:'2026-06-01',end:'2026-07-10',issued:'2026-07-15'}},
  {id:'h-report-plain',lines:doc('h6',[['가상 해외탐방 결과 보고서',0.06],['탐방 기간 2026.07.20 ~ 2026.07.30',0.18],
    ['방문 기관 3곳, 인터뷰 5회',0.26],['배운 점: 현지 스타트업 문화',0.4]]),
    expect:{kind:'REPORT',start:'2026-07-20',end:'2026-07-30',flags:['ISSUER_NOT_FOUND']}},
  {id:'h-thanks',lines:doc('h7',[['감 사 장',0.08],['위 사람은 가상 지역행사 운영에 기여하였기에 감사의 뜻을 전합니다.',0.4],
    ['2026년 9월 9일',0.72],['가상시청 시장',0.82]]),expect:{kind:'OTHER',issued:'2026-09-09'}},
  {id:'h-transcript',lines:doc('h8',[['성적증명서',0.06],['학번 202212345 성명 홍길동',0.15],['과목 데이터분석 A+',0.3],
    ['가상대학교 총장',0.82]]),expect:{kind:'UNKNOWN',flags:['NOT_A_PROOF_DOCUMENT','CONTAINS_PERSONAL_DATA']}},
  {id:'h-blurry-award',lines:doc('h9',[['상 장',0.07,0.62],['우수상',0.15,0.58],['2026.05.30',0.72,0.6],
    ['가상환경재단 이사장',0.82,0.61]]),expect:{kind:'AWARD_PROOF',issuer:'가상환경재단',award:'우수상',flags:['LOW_OCR_CONFIDENCE']}},
  {id:'h-mentoring',lines:doc('h10',[['멘토링 참여 확인서',0.07],['프로그램: 가상 선후배 멘토링',0.2],
    ['기간: 2026.03.10-2026.06.10',0.27],['위와 같이 참여하였음을 확인합니다',0.45],['가상대학교 교수학습개발원',0.82]]),
    claimed:{organization:'가상대학교 교수학습개발원',startDate:'2026-03-10',endDate:'2026-06-10'},
    expect:{kind:'PARTICIPATION_PROOF',issuer:'가상대학교 교수학습개발원',start:'2026-03-10',end:'2026-06-10',
      noFlags:['ISSUER_MISMATCH','PERIOD_MISMATCH']}},
];
