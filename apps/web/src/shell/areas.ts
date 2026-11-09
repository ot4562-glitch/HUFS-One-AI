/**
 * #9 redesign (HUFS_One_AI_UIUX_96_Master_Spec §2.1, §4.1): the 11 top-level areas observed in the
 * HUFSAbility student menus (docs/HUFSABILITY_UI_COMPONENT_ATLAS.md §3), used as the desktop GNB.
 *
 * `ours` are HUFS One AI's own working screens placed in the area the spec assigns them to. `observed`
 * are the original menu names only: none of them is implemented here, they never link anywhere and
 * are always shown as 미지원. The 5 public categories / 24 functions stay in the central manifest
 * (menuCatalog / /menu); this list is the observed information architecture, not a capability claim.
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
  readonly observed: readonly string[];
}

export const AREAS: readonly Area[] = [
  {id: 'competency', label: '역량관리', summary: '나의 역량 현황과 진단 정보를 확인하는 영역입니다.',
    ours: [], observed: ['HUFSAbility 역량점수', 'MY 비교과활동 Point', 'HUFSAbility 체계 안내', '핵심역량진단검사', 'MY 핵심역량진단 결과', '대학생활적응검사', 'MY 대학생활적응검사결과']},
  {id: 'curricular', label: '교과/비교과', summary: '학업·졸업 요건과 비교과 활동을 함께 확인합니다.',
    ours: [{route: '/graduation', label: '졸업지원'}, {route: '/graduation/what-if', label: '전공 가정 분석'}, {route: '/saved', label: '보관함'}, {route: '/clubs', label: '동아리 모집'}, {route: '/exchange', label: '교환학생 조건'}, {route:'/owner-academics/experience-courses',label:'교과·경험 연결 근거'}, {route:'/owner-insights/RECOGNITION',label:'교외활동 증빙 준비'}, {route:'/owner-insights/LEARNING',label:'학습공동체 추천'}],
    observed: ['수강교과목', '성적조회', '비교과프로그램', '비교과프로그램 신청 내역', '비교과 관심키워드', 'MY 비교과 장바구니', '외부비교과 활동', '학습공동체', '장학 신청']},
  {id: 'jobs', label: '채용/고용24', summary: '나에게 맞는 공고와 나의 지원 기록을 확인합니다.',
    ours: [{route: '/opportunities', label: '맞춤 기회'}, {route: '/owner-opportunities/v2-catalog', label: '승인된 공고 전체 검색'}, {route: '/applications', label: '지원 현황'}],
    observed: ['추천신청이력', '아르바이트', '교내외채용행사', '대외활동', '채용정보(고용24)', '직업탐색', '청년인턴/강소기업', '외대친화기업(HUFFi)']},
  {id: 'mentoring', label: '현직자멘토링', summary: '현직자 멘토링 소식을 확인하는 영역입니다.',
    ours: [{route:'/owner-insights/MENTORS',label:'멘토 후보 비교'}], observed: ['멘토링 후기', '멘토링 공지']},
  {id: 'career', label: '전공·진로설계', summary: '나의 경험을 기록하고 진로 준비를 정리합니다.',
    ours: [{route: '/experience', label: '나의 경험'}, {route: '/career', label: '커리어 포트폴리오'}, {route:'/owner-insights/SKILLS',label:'NCS·경험 근거 비교'}],
    observed: ['나의진로정보', '진로 로드맵', '로드맵 성취도', '학과 전공·진로 로드맵', '자기소개서', 'MY커리어', '진로취업도서관리']},
  {id: 'counseling', label: '통합상담', summary: '학업·진로·심리 상담 안내 영역입니다.',
    ours: [{route:'/owner-insights/INTERNATIONAL',label:'국제학생 확인 안내'}], observed: ['상담신청', '상담참여이력', 'International Students', '国际学生咨询', '신입생세미나']},
  {id: 'community', label: '커뮤니티', summary: '나와 관련된 학사 공지와 일정을 확인합니다.',
    ours: [{route: '/notices', label: '학사 공지'}, {route: '/activities', label: '학과 활동'}, {route: '/faq', label: 'FAQ·질문하기'}],
    observed: ['시스템문의', '자료실', '설문참여', '사회봉사 활동 경험 사례공유']},
  {id: 'survey', label: '취업조사', summary: '졸업생 취업 조사 영역입니다.', ours: [], observed: ['취업조사']},
  {id: 'faculty', label: '교수지원(학생)', summary: '수업 컨설팅·교과목 개발 참여 영역입니다.', ours: [], observed: ['수업컨설팅', '혁신교과목개발']},
  {id: 'badge', label: '오픈배지', summary: '오픈배지 안내 영역입니다.', ours: [], observed: ['오픈배지', 'My 오픈배지']},
  {id: 'stats', label: '취업통계', summary: '졸업생 취업 통계 영역입니다.',
    ours: [{route:'/owner-insights/EMPLOYMENT',label:'검증된 취업통계'}], observed: ['산업분류별 현황', '기업유형별 현황', '근무지역별 현황', '초임급여별 현황', '학과계열별 현황']},
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
