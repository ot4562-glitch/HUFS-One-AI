/**
 * #9 redesign: the top menu of the HUFS One AI design mockups (HUFS_One_AI_Essential, 전체 메뉴 시안):
 * 홈 · 학사정보 · 수업/수강 · 성적/졸업 · 비교과·역량 · 경험관리 · 진로·취업 · AI 추천 · 커뮤니티 · 지원/신청 · 서비스 안내.
 *
 * `ours` are HUFS One AI's working screens, placed where the mockups place them. `planned` are the other
 * entries the mockups draw in each menu: none is implemented, they never link anywhere and are always
 * shown as 미지원. Nothing here claims a school function; school-only services stay 미지원.
 */
export interface AreaLink {
  readonly route: string;
  readonly label: string;
}

export interface Area {
  readonly id: string;
  readonly label: string;
  /** One line under the banner title. */
  readonly summary: string;
  readonly ours: readonly AreaLink[];
  readonly planned: readonly string[];
}

export const AREAS: readonly Area[] = [
  {id: 'academic', label: '학사정보', summary: '내 전공·학년·이수 현황을 반영한 학사공지와 주요 일정을 한눈에 확인하세요.',
    ours: [{route: '/notices', label: '학사공지·일정'}],
    planned: ['학적정보 조회', '학사일정(전체)', '등록·장학 안내', '학사 FAQ']},
  {id: 'class', label: '수업/수강', summary: '다음 학기 수강계획이 졸업 요건에 맞는지 확인하세요.',
    ours: [],
    planned: ['수강신청', '수강계획 시뮬레이션', '수업 이력/계획', '강의 평가']},
  {id: 'grades', label: '성적/졸업', summary: '나의 학점과 졸업요건, 수강계획 검사와 가정 분석을 함께 확인하세요.',
    ours: [{route: '/graduation', label: 'AI 졸업지원'}, {route: '/graduation/what-if', label: '전공·학업 What-if'}],
    planned: ['성적 조회', '학점 이수 현황', '졸업요건 확인', '성적 분석 리포트']},
  {id: 'extracurricular', label: '비교과·역량', summary: '나의 전공·관심사·학습 이력을 바탕으로 맞춤 공고·대외활동·비교과를 추천해 드립니다.',
    ours: [{route: '/opportunities', label: '추천 피드 (AI)'}],
    planned: ['전체 공고 검색', '비교과 프로그램', '역량 진단·분석', '참여 이력']},
  {id: 'experience', label: '경험관리', summary: '동아리, 아르바이트, 프로젝트 등 다양한 경험을 기록하고 관리하세요.',
    ours: [{route: '/experience', label: '나의 경험'}],
    planned: ['프로젝트 관리', '포트폴리오', '이력서 연동', '활동 증빙함']},
  {id: 'career', label: '진로·취업', summary: '관심 기회부터 준비, 지원, 결과 대기까지 내 진행 상황을 기록하세요.',
    ours: [{route: '/applications', label: '나의 지원 현황'}],
    planned: ['진로 탐색·진단', '채용 공고', '이력서·자기소개서']},
  {id: 'ai', label: 'AI 추천', summary: '저장한 공고와 관심 기회를 한곳에서 관리하세요.',
    ours: [{route: '/saved', label: '통합 보관함'}],
    planned: ['통합 추천(공고·비교과·진로)', 'AI 요약 리포트', '맞춤 학업·진로 로드맵']},
  {id: 'community', label: '커뮤니티', summary: '승인된 동아리의 모집 공고를 확인하고 관심 동아리를 찾아보세요.',
    ours: [{route: '/clubs', label: '동아리 모집'}],
    planned: ['동아리 검색·탐색', '학생 커뮤니티(게시판)', '스터디/프로젝트 모집']},
  {id: 'apply', label: '지원/신청', summary: '학교 신청 업무는 이번 시연에서 제공하지 않습니다. 학교 공식 서비스에서 확인하세요.',
    ours: [],
    planned: ['장학금 신청', '증명서 발급 연계', '각종 신청(휴학·복학·변경 등)', '문의·지원(1:1, FAQ)']},
  {id: 'service', label: '서비스 안내', summary: 'HUFS One AI의 전체 메뉴와 내 설정을 확인하세요.',
    ours: [{route: '/menu', label: '전체 메뉴'}, {route: '/settings', label: '내 설정·개인화'}],
    planned: ['이용 안내', '도움말']},
];

export const areaPath = (id: string) => `/area/${id}`;

/** The area a path belongs to: an area landing page, or one of our screens (longest route wins). */
export function areaOf(path: string): Area | null {
  const landing = /^\/area\/([a-z-]+)$/.exec(path);
  if (landing) return AREAS.find(a => a.id === landing[1]) ?? null;
  let best: {area: Area; len: number} | null = null;
  for (const area of AREAS) for (const o of area.ours) {
    if ((path === o.route || path.startsWith(o.route + '/')) && (!best || o.route.length > best.len)) best = {area, len: o.route.length};
  }
  return best?.area ?? null;
}

/** The current entry inside the area's left menu (longest matching route). */
export function currentAreaLink(area: Area, path: string): AreaLink | null {
  return [...area.ours].sort((a, b) => b.route.length - a.route.length)
    .find(o => path === o.route || path.startsWith(o.route + '/')) ?? null;
}
