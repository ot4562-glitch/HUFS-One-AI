// Type-only: erased at build. Replace with the club DTO once the integration track promotes it into
// @hufs-one/contracts (#123); the UI never runs the ranking itself.
import type {ClubActivity, ClubBoard, ClubCampus, ClubCategory, ClubLifecycle, RankedClub} from '../../../../../packages/core/src/opportunities/clubs.js';
import {TOPIC_TEXT} from '../demo/topicText.js';
import {ddayOf, type DDayView} from '../demo/dday.js';

/**
 * #123 동아리 모집 게시판 view model (SYNTHETIC demo). Pure: shows the server/core decision as-is —
 * visibility (가상 관리자 승인), lifecycle, eligibility and reasons are never recomputed here.
 */
export const CATEGORY_TEXT: Readonly<Record<ClubCategory, string>> = {
  LANGUAGE: '언어', INTERNATIONAL: '국제교류', IT_AI: 'IT·AI', ACADEMIC: '학술', CULTURE_ART: '문화·예술',
  VOLUNTEER: '봉사', SPORTS: '스포츠', CAREER: '진로', MEDIA: '미디어', MUSIC: '음악',
};
export const CAMPUS_TEXT: Readonly<Record<ClubCampus, string>> = {SEOUL: '서울캠퍼스', GLOBAL: '글로벌캠퍼스', BOTH: '두 캠퍼스'};
const ACTIVITY_TEXT: Readonly<Record<ClubActivity, string>> = {
  STUDY: '스터디', PROJECT: '프로젝트', DEBATE: '토론', PERFORMANCE: '공연', VOLUNTEERING: '봉사', MATCH: '경기',
  TRIP: '답사·여행', NETWORKING: '교류', CREATION: '창작', MENTORING: '멘토링',
};
const LIFECYCLE_TEXT: Readonly<Record<ClubLifecycle, string>> = {
  UPCOMING: '모집 예정', OPEN: '모집 중', OPEN_NO_DEADLINE: '모집 중 · 마감 미정', CLOSED: '모집 마감',
};
const ELIGIBILITY_TEXT = {ELIGIBLE: '모집 조건 충족', INELIGIBLE: '모집 조건 미충족', UNKNOWN: '모집 조건 확인 필요'} as const;

export const APPROVAL_TEXT = '가상 관리자 승인(시연)';
export const CLUB_DEMO_NOTE = 'HUFS One AI 확장 기능 시연이에요. 모든 동아리·포스터는 실제 학교 동아리와 무관한 가상 데이터이고, 실제 가입 신청은 할 수 없어요.';

const dateTimeFmt = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const dateFmt = new Intl.DateTimeFormat('ko-KR', {timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short'});

export interface ClubCardView {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly category: ClubCategory;
  readonly categoryText: string;
  readonly campus: ClubCampus;
  readonly campusText: string;
  readonly lifecycle: ClubLifecycle;
  readonly lifecycleText: string;
  readonly recruitable: boolean;
  readonly deadlineText: string | null;
  readonly dday: DDayView | null;
  readonly eligibilityText: string;
  readonly topicTexts: readonly string[];
  readonly activityTexts: readonly string[];
  readonly reasons: readonly string[];
  readonly times: readonly {readonly label: string; readonly text: string}[];
  readonly posterSeed: string;
  readonly recommended: boolean;
}

export interface ClubBoardView {
  readonly asOf: string;
  readonly recommended: readonly ClubCardView[];
  readonly all: readonly ClubCardView[];
}

function cardView(r: RankedClub, asOf: string, recommended: boolean): ClubCardView {
  const p = r.post;
  const closes = p.recruitClosesAt;
  return {
    id: p.id,
    name: p.clubName,
    summary: p.summary,
    category: p.category,
    categoryText: CATEGORY_TEXT[p.category],
    campus: p.campus,
    campusText: CAMPUS_TEXT[p.campus],
    lifecycle: r.lifecycle,
    lifecycleText: LIFECYCLE_TEXT[r.lifecycle],
    recruitable: r.lifecycle !== 'CLOSED',
    deadlineText: closes ? `모집 마감 ${dateFmt.format(Date.parse(closes))}` : null,
    dday: closes && r.lifecycle !== 'CLOSED' ? ddayOf(closes, asOf) : null,
    eligibilityText: ELIGIBILITY_TEXT[r.eligibility],
    topicTexts: p.topicCodes.map(t => TOPIC_TEXT[t]),
    activityTexts: p.activities.map(a => ACTIVITY_TEXT[a]),
    reasons: r.reasons.map(x => x.text),
    times: [
      {label: '작성', text: dateTimeFmt.format(Date.parse(p.createdAt))},
      {label: '수정', text: dateTimeFmt.format(Date.parse(p.updatedAt))},
      ...(p.approvedAt ? [{label: '검수(가상 승인)', text: dateTimeFmt.format(Date.parse(p.approvedAt))}] : []),
      ...(p.recruitOpensAt ? [{label: '모집 시작', text: dateTimeFmt.format(Date.parse(p.recruitOpensAt))}] : []),
      {label: '모집 마감', text: closes ? dateTimeFmt.format(Date.parse(closes)) : '미정'},
    ],
    posterSeed: p.posterAssetId,
    recommended,
  };
}

/**
 * Validates that the board belongs to this snapshot time; otherwise nothing is shown (no guessed list).
 * Only SYNTHETIC posts are accepted in this demo.
 */
export function buildClubBoard(board: ClubBoard, expectedAsOf: string): {ok: true; view: ClubBoardView} | {ok: false} {
  if (board.provenance !== 'CODE_RULES' || Date.parse(board.asOf) !== Date.parse(expectedAsOf)) return {ok: false};
  if (board.all.some(r => r.post.dataMode !== 'SYNTHETIC')) return {ok: false};
  const rec = new Set(board.recommended.map(r => r.post.id));
  if ([...rec].some(id => !board.all.some(r => r.post.id === id))) return {ok: false};
  return {ok: true, view: {
    asOf: board.asOf,
    recommended: board.recommended.map(r => cardView(r, board.asOf, true)),
    all: board.all.map(r => cardView(r, board.asOf, rec.has(r.post.id))),
  }};
}

export interface ClubFilter {
  readonly query: string;
  readonly campus: 'ALL' | 'SEOUL' | 'GLOBAL';
  readonly category: 'ALL' | ClubCategory;
  readonly includeClosed: boolean;
}
export const NO_FILTER: ClubFilter = {query: '', campus: 'ALL', category: 'ALL', includeClosed: false};

/** Narrows the visible list only; it never reveals a post the board did not include. */
export function filterClubs(list: readonly ClubCardView[], f: ClubFilter): ClubCardView[] {
  const q = f.query.trim().toLowerCase();
  return list.filter(c =>
    (f.includeClosed || c.recruitable)
    && (f.campus === 'ALL' || c.campus === f.campus || c.campus === 'BOTH')
    && (f.category === 'ALL' || c.category === f.category)
    && (!q || `${c.name} ${c.summary} ${c.categoryText} ${c.topicTexts.join(' ')}`.toLowerCase().includes(q)));
}
