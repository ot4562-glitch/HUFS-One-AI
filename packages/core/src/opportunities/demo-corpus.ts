import {OpportunitySchema, type Opportunity, type TopicCode} from '@hufs-one/contracts';

/**
 * A12 demo / evaluation corpus — 100% SYNTHETIC (fictional organizations "시연가상기관 …", internal
 * /demo/sources ids, DEMO_DISABLED application route). Not derived from any real HUFSAbility posting,
 * student or document. A12.2 archetypes keep their ids SYN-OPP-001 … 006.
 *
 * `DEMO_AS_OF` is the single fixed demo instant for this corpus and the demo notices; UI must show it as
 * the demo time, not the real current time.
 * S01–S05 (demo-profiles.ts) are SYNTHETIC students for CI / REVIEWER demos only. They must never fill a
 * real-data selector slot (the real intake is 4 consented people; the 5th slot stays PENDING/SYNTHETIC).
 * Titles read like real postings; test intent lives in DEMO_OPPORTUNITY_NOTES / DEMO_NOTICE_NOTES.
 * Split: 20 TUNING + 20 REPORT, stratified by kind (A15.1). Weights must never be tuned on REPORT.
 */
export const DEMO_AS_OF = '2026-11-20T00:00:00.000Z';
export const DEMO_CORPUS_VERSION = 'syn-corpus-v1';

const DAY = 86_400_000;
const d = (days:number) => new Date(Date.parse(DEMO_AS_OF) + days * DAY).toISOString();

type Kind = Opportunity['kind'];
type Condition = Opportunity['conditions'][number];
interface Spec {
  n:number; kind:Kind; title:string; org:string; topics:TopicCode[]; split:'TUNING'|'REPORT';
  closes?:number|null; opens?:number; published:number; langs?:string[];
  conditions?:Omit<Condition, 'evidenceId'>[]; priority?:string[]; completion?:string[];
  events?:[number, number][]; quality?:Opportunity['dataQuality']; route?:Opportunity['actualApplicationRoute'];
  deadlineKind?:'ROLLING';
  /** Test intent for reviewers. Never part of the built Opportunity (not shown to students). */
  note?:string;
}

const id = (n:number) => `SYN-OPP-${String(n).padStart(3, '0')}`;
const enrolled = {field:'enrollment', operator:'EQ', value:'ENROLLED'} as const;

const SPECS:Spec[] = [
  // A12.2 archetypes
  {n:1, kind:'CONTEST', title:'가상 글로벌 커리어 챌린지 (팀 신청·재학생 대표)', org:'시연가상기관 A', topics:['GLOBAL_SALES', 'TRADE_OVERSEAS'], split:'TUNING', closes:12, published:-6, langs:['en'], conditions:[enrolled, {field:'teamRole', operator:'IN', value:['LEADER', 'MEMBER']}], priority:['영어 발표 경험자 우대']},
  {n:2, kind:'CONTEST', title:'가상 데이터 공공문제 공모전', org:'시연가상기관 B', topics:['DATA_ANALYTICS', 'AI_ML', 'PUBLIC_POLICY'], split:'REPORT', closes:18, published:-4},
  {n:3, kind:'EXTRACURRICULAR', title:'가상 클라우드 실무 워크숍', note:'우선선발과 수료조건을 지원자격과 분리', org:'시연가상기관 C', topics:['CLOUD_INFRA', 'SOFTWARE_DEV'], split:'TUNING', closes:9, published:-10, conditions:[enrolled], priority:['클라우드 자격증 보유자 우선 선발'], completion:['4회 중 3회 이상 출석 시 수료'], events:[[14, 14]]},
  {n:4, kind:'EXTRACURRICULAR', title:'가상 문화관광 콘텐츠 프로젝트', org:'시연가상기관 D', topics:['CULTURE_TOURISM', 'MEDIA_CONTENT'], split:'REPORT', closes:15, published:-3, events:[[25, 27]]},
  {n:5, kind:'INTERNSHIP', title:'가상 국제협력 인턴 탐색 프로그램', note:'언어 자기기재는 공식 어학자격이 아님', org:'시연가상기관 E', topics:['INTL_COOPERATION', 'INTL_ORGANIZATION'], split:'TUNING', closes:20, published:-8, langs:['en', 'fr'], conditions:[enrolled, {field:'certification', operator:'EXISTS', value:true}]},
  {n:6, kind:'SCHOLARSHIP', title:'가상 학업도전 장학 안내', note:'성적 조건이 있으나 성적을 수집하지 않으므로 자격 UNKNOWN', org:'시연가상기관 F', topics:['EDUCATION_TUTORING'], split:'REPORT', closes:10, published:-12, conditions:[enrolled], quality:'PARTIAL'},
  // JOB
  {n:7, kind:'JOB', title:'가상 무역상사 해외영업 신입', org:'시연가상기관 G', topics:['GLOBAL_SALES', 'TRADE_OVERSEAS'], split:'TUNING', closes:14, published:-2, langs:['en', 'es']},
  {n:8, kind:'JOB', title:'가상 핀테크 데이터 분석가 신입', org:'시연가상기관 H', topics:['DATA_ANALYTICS', 'FINANCE_INVESTMENT'], split:'REPORT', closes:21, published:-1},
  {n:9, kind:'JOB', title:'가상 회계법인 세무 보조 (상시 채용)', org:'시연가상기관 I', topics:['ACCOUNTING_TAX'], split:'TUNING', closes:null, published:-20, deadlineKind:'ROLLING'},
  {n:10, kind:'JOB', title:'가상 공공기관 정책연구 보조원', org:'시연가상기관 J', topics:['PUBLIC_POLICY', 'ECONOMIC_RESEARCH'], split:'REPORT', closes:7, published:-9},
  {n:11, kind:'JOB', title:'가상 게임사 현지화 번역가 (일본어·영어)', org:'시연가상기관 K', topics:['LANGUAGE_TRANSLATION', 'MEDIA_CONTENT'], split:'TUNING', closes:16, published:-5, langs:['ja', 'en']},
  {n:12, kind:'JOB', title:'가상 보안기업 관제 엔지니어', note:'DEMO_AS_OF 기준 이미 마감(CLOSED)', org:'시연가상기관 L', topics:['CYBERSECURITY'], split:'REPORT', closes:-3, published:-25},
  // trap: data work in the title, but the posting is only tagged MARKETING (topic miss)
  {n:13, kind:'JOB', title:'가상 브랜드사 마케팅 데이터 분석 담당 (SQL·대시보드)', org:'시연가상기관 M', topics:['MARKETING_BRAND'], split:'TUNING', closes:19, published:-3},
  {n:14, kind:'JOB', title:'가상 컨설팅사 전략 리서치 애널리스트', org:'시연가상기관 N', topics:['CONSULTING_STRATEGY', 'ECONOMIC_RESEARCH'], split:'REPORT', closes:23, published:-7, langs:['en']},
  // INTERNSHIP
  {n:15, kind:'INTERNSHIP', title:'가상 국제기구 청년 인턴 (외교·개발협력)', org:'시연가상기관 O', topics:['INTL_ORGANIZATION', 'DIPLOMACY_PUBLIC'], split:'REPORT', closes:25, published:-2, langs:['en', 'fr'], conditions:[enrolled]},
  {n:16, kind:'INTERNSHIP', title:'가상 AI 스타트업 머신러닝 인턴', org:'시연가상기관 P', topics:['AI_ML', 'SOFTWARE_DEV'], split:'TUNING', closes:11, published:-4, conditions:[enrolled, {field:'cohort', operator:'LTE', value:2023}]},
  {n:17, kind:'INTERNSHIP', title:'가상 출판사 콘텐츠 마케팅 인턴', org:'시연가상기관 Q', topics:['MEDIA_CONTENT', 'MARKETING_BRAND'], split:'REPORT', closes:13, published:-6},
  {n:18, kind:'INTERNSHIP', title:'가상 ESG 컨설팅 리서치 인턴', org:'시연가상기관 R', topics:['ESG_SUSTAINABILITY', 'CONSULTING_STRATEGY'], split:'TUNING', closes:17, published:-11},
  {n:19, kind:'INTERNSHIP', title:'가상 HR테크 인사 데이터 인턴', org:'시연가상기관 S', topics:['HR_ORG', 'DATA_ANALYTICS'], split:'REPORT', closes:22, published:-1, conditions:[{field:'campus', operator:'EQ', value:'SEOUL'}]},
  {n:20, kind:'INTERNSHIP', title:'가상 해외 지사 무역 실무 인턴 (졸업생 대상)', org:'시연가상기관 T', topics:['TRADE_OVERSEAS', 'GLOBAL_SALES'], split:'TUNING', closes:15, published:-5, langs:['es'], conditions:[{field:'enrollment', operator:'EQ', value:'GRADUATED'}]},
  // CONTEST
  {n:21, kind:'CONTEST', title:'가상 공공데이터 시각화 경진대회', org:'시연가상기관 B', topics:['DATA_ANALYTICS', 'PUBLIC_POLICY'], split:'TUNING', closes:26, published:-3},
  {n:22, kind:'CONTEST', title:'가상 지역관광 숏폼 영상 공모전', org:'시연가상기관 U', topics:['CULTURE_TOURISM', 'MEDIA_CONTENT'], split:'REPORT', closes:8, published:-14},
  {n:23, kind:'CONTEST', title:'가상 청년 창업 아이디어 경진대회', note:'DEMO_AS_OF 기준 접수 예정(UPCOMING)', org:'시연가상기관 V', topics:['STARTUP_ENTREPRENEUR'], split:'TUNING', opens:5, closes:30, published:-1},
  {n:24, kind:'CONTEST', title:'가상 외교 정책 에세이 공모전', org:'시연가상기관 W', topics:['DIPLOMACY_PUBLIC', 'PUBLIC_POLICY'], split:'REPORT', closes:12, published:-9, langs:['en']},
  {n:25, kind:'CONTEST', title:'가상 UX 리디자인 챌린지', note:'원문 조건이 서로 충돌(CONFLICT)', org:'시연가상기관 X', topics:['PRODUCT_UX', 'SOFTWARE_DEV'], split:'TUNING', closes:10, published:-4, quality:'CONFLICT'},
  {n:26, kind:'CONTEST', title:'가상 번역 공모전 (스페인어·영어)', org:'시연가상기관 Y', topics:['LANGUAGE_TRANSLATION'], split:'REPORT', closes:19, published:-6, langs:['es', 'en']},
  {n:27, kind:'CONTEST', title:'가상 금융 투자 리서치 대회', org:'시연가상기관 Z', topics:['FINANCE_INVESTMENT', 'ECONOMIC_RESEARCH'], split:'TUNING', closes:14, published:-2},
  // EXTRACURRICULAR
  {n:28, kind:'EXTRACURRICULAR', title:'가상 해외영업 실무 특강 시리즈', org:'시연가상기관 G', topics:['GLOBAL_SALES'], split:'REPORT', closes:6, published:-5, events:[[9, 9], [16, 16]]},
  {n:29, kind:'EXTRACURRICULAR', title:'가상 파이썬 데이터 분석 부트캠프', org:'시연가상기관 AA', topics:['DATA_ANALYTICS', 'SOFTWARE_DEV'], split:'TUNING', closes:5, published:-8, conditions:[enrolled], events:[[12, 40]]},
  {n:30, kind:'EXTRACURRICULAR', title:'가상 모의 유엔 총회 (영어 진행)', org:'시연가상기관 O', topics:['INTL_ORGANIZATION', 'DIPLOMACY_PUBLIC'], split:'REPORT', closes:11, published:-3, langs:['en'], events:[[20, 21]]},
  {n:31, kind:'EXTRACURRICULAR', title:'가상 브랜드 마케팅 케이스 스터디 모임', org:'시연가상기관 AB', topics:['MARKETING_BRAND'], split:'TUNING', closes:9, published:-7},
  {n:32, kind:'EXTRACURRICULAR', title:'가상 ESG 캠퍼스 서포터즈', org:'시연가상기관 R', topics:['ESG_SUSTAINABILITY', 'PUBLIC_POLICY'], split:'REPORT', closes:13, published:-10},
  // trap: tagged DATA_ANALYTICS but it is simple data entry work
  {n:33, kind:'EXTRACURRICULAR', title:'가상 행정 자료 입력 봉사 (단순 입력 업무)', org:'시연가상기관 AC', topics:['DATA_ANALYTICS'], split:'TUNING', closes:8, published:-2},
  {n:34, kind:'EXTRACURRICULAR', title:'가상 교육봉사 멘토링 (기록용 페이지)', org:'시연가상기관 AD', topics:['EDUCATION_TUTORING'], split:'REPORT', closes:20, published:-15, route:'RECORD_ONLY'},
  {n:35, kind:'EXTRACURRICULAR', title:'가상 문화유산 해설사 양성 과정', note:'신청 마감 없이 행사 일정만 공개', org:'시연가상기관 AE', topics:['CULTURE_TOURISM', 'EDUCATION_TUTORING'], split:'TUNING', closes:null, published:-6, events:[[18, 19]]},
  {n:36, kind:'EXTRACURRICULAR', title:'가상 정보보안 동아리 연합 해커톤', org:'시연가상기관 L', topics:['CYBERSECURITY', 'SOFTWARE_DEV'], split:'REPORT', closes:16, published:-4, events:[[24, 25]]},
  // SCHOLARSHIP
  {n:37, kind:'SCHOLARSHIP', title:'가상 국제교류 장학 (교환학생 예정자)', org:'시연가상기관 AF', topics:['INTL_COOPERATION', 'LANGUAGE_TRANSLATION'], split:'TUNING', closes:12, published:-5, conditions:[enrolled]},
  {n:38, kind:'SCHOLARSHIP', title:'가상 IT 인재 장학', note:'DEMO_AS_OF 이후 게시(미래 정보, 피드 제외)', org:'시연가상기관 AG', topics:['SOFTWARE_DEV', 'AI_ML'], split:'REPORT', closes:30, published:3},
  {n:39, kind:'SCHOLARSHIP', title:'가상 창업 준비 장학', org:'시연가상기관 V', topics:['STARTUP_ENTREPRENEUR'], split:'TUNING', closes:9, published:-6, quality:'STALE'},
  {n:40, kind:'SCHOLARSHIP', title:'가상 지역사회 공헌 장학 (학번 제한)', org:'시연가상기관 AH', topics:['PUBLIC_POLICY', 'ESG_SUSTAINABILITY'], split:'REPORT', closes:14, published:-3, conditions:[enrolled, {field:'cohort', operator:'GTE', value:2023}]},
];

function build(s:Spec):Opportunity {
  const oid = id(s.n);
  return OpportunitySchema.parse({
    id:oid, version:'v1', sourceSnapshotId:`SYN-SRC-${String(s.n).padStart(3, '0')}-r1`,
    title:s.title, organization:s.org, kind:s.kind, topicCodes:s.topics, languageCodes:s.langs ?? [],
    ...(s.opens === undefined ? {} : {applyOpensAt:d(s.opens)}),
    ...(s.closes === null || s.closes === undefined ? {} : {applyClosesAt:d(s.closes)}),
    ...(s.deadlineKind ? {deadlineKind:s.deadlineKind} : {}),
    eventSessions:(s.events ?? []).map(([a, b]) => ({start:d(a), end:new Date(Date.parse(d(b)) + 2 * 3_600_000).toISOString()})),
    actualApplicationRoute:s.route ?? 'DEMO_DISABLED',
    conditions:(s.conditions ?? []).map((c, i) => ({...c, evidenceId:`EV-${oid}-C${i + 1}`})),
    roleSteps:[], prioritySelection:s.priority ?? [], completionRules:s.completion ?? [],
    dataMode:'SYNTHETIC', dataQuality:s.quality ?? 'COMPLETE',
  });
}

export const DEMO_OPPORTUNITIES:readonly Opportunity[] = SPECS.map(build);
export const DEMO_SPLIT:Readonly<Record<string, 'TUNING'|'REPORT'>> = Object.fromEntries(SPECS.map(s => [id(s.n), s.split]));
/** Opportunity.sourceSnapshotId → confirmed publication time (the canonical SourceSnapshot.publishedAt). */
/** Test-intent notes by id (moved out of titles after the UI consumer review on PR #60). */
export const DEMO_OPPORTUNITY_NOTES:Readonly<Record<string, string>> = Object.fromEntries(SPECS.filter(s => s.note).map(s => [id(s.n), s.note!]));
export const DEMO_PUBLISHED_AT:Readonly<Record<string, string>> = Object.fromEntries(SPECS.map(s => [`SYN-SRC-${String(s.n).padStart(3, '0')}-r1`, d(s.published)]));
