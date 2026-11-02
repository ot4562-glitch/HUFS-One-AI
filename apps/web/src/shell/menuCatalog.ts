/**
 * #124 HUFSAbility 메뉴 수용 — UI-side menu catalog.
 *
 * TEMPORARY: the single source of truth is the versioned capability manifest owned by the integration
 * track (#124, packages/contracts). Until it exists this file mirrors its intended shape so the screens can
 * be built; replace the data with the manifest when it lands, keep the components.
 *
 * Rules (issue #124): keep the official HUFSAbility names and order; only routes that render a real demo
 * screen are clickable; everything else is shown as "🚫 이번 시연 미지원" and has no URL. HUFS One AI's own
 * additions are listed separately as 확장, never as something HUFSAbility already offers.
 */

export type MenuStatus = 'DEMO_AVAILABLE' | 'NOT_IMPLEMENTED';
/** ORIGINAL = HUFSAbility's own function; AI_ENHANCED = our demo improves an existing function; EXTENSION = new in HUFS One AI. */
export type MenuKind = 'ORIGINAL' | 'AI_ENHANCED' | 'EXTENSION';

export interface MenuItem {
  readonly id: string;
  /** Official display name for HUFSAbility items, our name for extensions. */
  readonly label: string;
  readonly kind: MenuKind;
  readonly status: MenuStatus;
  /** In-app route; present only when status is DEMO_AVAILABLE. */
  readonly route?: string;
}

export interface MenuGroup {
  readonly id: string;
  readonly label: string;
  readonly origin: 'HUFS_ONE_AI' | 'HUFSABILITY' | 'HUFSABILITY_PUBLIC';
  readonly items: readonly MenuItem[];
}

export const MENU_SOURCE = {
  title: 'HUFSAbility 공식 기능 소개(학생지원)',
  url: 'https://dep.hufs.ac.kr/iei/13534/subview.do',
  baseline: '이슈 #124 1차 고정 기준(2026-11-02)',
} as const;

/** Verified public address from issue #124; opening it leaves our service. */
export const OFFICIAL_HUFSABILITY_URL = 'https://hufsability.hufs.ac.kr/';

const off = (id: string, label: string): MenuItem => ({id, label, kind: 'ORIGINAL', status: 'NOT_IMPLEMENTED'});
const enhanced = (id: string, label: string, route: string): MenuItem => ({id, label, kind: 'AI_ENHANCED', status: 'DEMO_AVAILABLE', route});
const ext = (id: string, label: string, route: string): MenuItem => ({id, label, kind: 'EXTENSION', status: 'DEMO_AVAILABLE', route});

export const MENU_GROUPS: readonly MenuGroup[] = [
  {id: 'hufs-one-ai', label: 'HUFS One AI 확장', origin: 'HUFS_ONE_AI', items: [
    ext('ext-today', '오늘', '/'),
    ext('ext-graduation', '졸업지원', '/graduation'),
    ext('ext-experience', '나의 경험', '/experience'),
    ext('ext-saved', '보관함', '/saved'),
    ext('ext-applications', '지원 현황', '/applications'),
    ext('ext-clubs', '동아리 모집', '/clubs'),
  ]},
  {id: 'competency', label: '역량관리', origin: 'HUFSABILITY', items: [
    off('competency-intro', '핵심역량 소개'),
    off('competency-score', 'HUFSAbility 역량 점수'),
    off('competency-test', '핵심역량 진단검사'),
    off('adaptation-test', '대학생활적응검사'),
  ]},
  {id: 'curricular', label: '교과/비교과', origin: 'HUFSABILITY', items: [
    off('courses-grades', '교과(이수과목/성적)'),
    enhanced('extracurricular', '비교과 프로그램', '/opportunities'),
    off('external-activities', '외부비교과 활동'),
    off('learning-community', '학습공동체'),
    off('scholarship-apply', '장학 신청'),
  ]},
  {id: 'jobs', label: '채용', origin: 'HUFSABILITY', items: [
    enhanced('jobs-campus', '채용정보(교내)', '/opportunities'),
    off('jobs-worknet', '채용정보(워크넷)'),
    off('jobs-mentoring', '취업멘토링'),
    off('jobs-explore', '직업탐색'),
    off('jobs-intern', '청년인턴/강소기업'),
    off('jobs-huffi', '외대친화기업(HUFFi)'),
  ]},
  {id: 'career', label: '경력개발', origin: 'HUFSABILITY', items: [
    off('career-goal', '진로목표'),
    off('career-roadmap', '진로 로드맵'),
    off('career-portfolio', '포트폴리오'),
    off('career-library', '진로취업도서관리'),
  ]},
  {id: 'counseling', label: '통합상담', origin: 'HUFSABILITY', items: [
    off('counsel-professor', '교수(지도)상담'),
    off('counsel-career', '진로취업상담'),
    off('counsel-psych', '심리상담'),
    off('counsel-international', '외국인 유학생 상담'),
    off('counsel-learning', '학습상담'),
  ]},
  {id: 'public', label: '공개 안내', origin: 'HUFSABILITY_PUBLIC', items: [
    enhanced('public-extracurricular', '교내비교과', '/opportunities'),
    off('public-scholarship', '장학공지'),
    enhanced('public-notices', '공지사항', '/notices'),
    enhanced('public-jobs', '채용정보', '/opportunities'),
  ]},
];

export const STATUS_TEXT: Readonly<Record<MenuStatus, string>> = {
  DEMO_AVAILABLE: '시연 가능',
  NOT_IMPLEMENTED: '이번 시연 미지원',
};

export const KIND_TAG: Readonly<Record<MenuKind, string | null>> = {
  ORIGINAL: null,
  AI_ENHANCED: 'AI 개선',
  EXTENSION: null,
};
