import type {Opportunity, TopicCode} from '@hufs-one/contracts';
import {byCodeUnit} from '../normalization/dedupe.js';
import {onlyKnownTopics, TOPIC_LABELS_KO} from '../normalization/topics.js';
import {coverage} from './rank.js';
import {evaluateCondition, type ConditionField, type FactValue} from './evaluate.js';

/**
 * #123 동아리 모집 게시판 — pure club recommendation core (SYNTHETIC demo only).
 * Core-local types until the integration owner promotes a club DTO into @hufs-one/contracts.
 *
 * Rules:
 * - Only APPROVED posts whose approval and creation are known at asOf are visible — in the list, the
 *   recommendations AND a direct lookup. DRAFT / REVIEW_PENDING / REJECTED / EXPIRED / REVOKED never are.
 *   "APPROVED" here is a simulated admin decision (가상 관리자 승인(시연)), never a real school approval.
 * - Relevance comes only from explicit interests, shared approved-experience topics and chosen activities.
 *   No grades, no popularity, no model confidence. Unknown conditions are "확인 필요", never assumed.
 * - Recommendations highlight up to 3; the full visible list is always kept.
 */
export const CLUB_CATEGORIES = [
  'LANGUAGE', 'INTERNATIONAL', 'IT_AI', 'ACADEMIC', 'CULTURE_ART', 'VOLUNTEER', 'SPORTS', 'CAREER', 'MEDIA', 'MUSIC',
] as const;
export type ClubCategory = typeof CLUB_CATEGORIES[number];

export const CLUB_ACTIVITIES = [
  'STUDY', 'PROJECT', 'DEBATE', 'PERFORMANCE', 'VOLUNTEERING', 'MATCH', 'TRIP', 'NETWORKING', 'CREATION', 'MENTORING',
] as const;
export type ClubActivity = typeof CLUB_ACTIVITIES[number];

export type ClubPostState = 'DRAFT'|'REVIEW_PENDING'|'APPROVED'|'REJECTED'|'EXPIRED'|'REVOKED';
export type ClubCampus = 'SEOUL'|'GLOBAL'|'BOTH';
type Condition = Opportunity['conditions'][number];

export interface ClubPost {
  /** SYN-CLUB-NNN */
  id:string;
  clubName:string;
  summary:string;
  category:ClubCategory;
  campus:ClubCampus;
  topicCodes:readonly TopicCode[];
  activities:readonly ClubActivity[];
  /** Stated recruiting conditions (same evaluator as opportunities); UNKNOWN facts stay UNKNOWN. */
  conditions:readonly Condition[];
  state:ClubPostState;
  createdAt:string;
  updatedAt:string;
  /** Set only by the (simulated) admin review; required for APPROVED. */
  approvedAt?:string;
  recruitOpensAt?:string;
  /** Missing = 모집 마감 미정. */
  recruitClosesAt?:string;
  posterAssetId:string;
  dataMode:'SYNTHETIC';
}

export interface ClubProfile {
  /** Explicit student choices only. */
  interestTopics:readonly TopicCode[];
  /** Approved experience topics, already scoped to what the viewer may use (scopeInputsToGrant). */
  approvedExperienceTopics:readonly TopicCode[];
  desiredActivities:readonly ClubActivity[];
  /** Explicit campus preference; missing = no campus signal (never a penalty). */
  campus?:'SEOUL'|'GLOBAL';
  facts:Readonly<Partial<Record<ConditionField, FactValue>>>;
}

export type ClubLifecycle = 'UPCOMING'|'OPEN'|'CLOSED'|'OPEN_NO_DEADLINE';
export type ClubEligibility = 'ELIGIBLE'|'INELIGIBLE'|'UNKNOWN';
export type ClubHiddenReason = 'NOT_APPROVED'|'APPROVAL_AFTER_ASOF'|'CREATED_AFTER_ASOF'|'INVALID_TIME';

export interface ClubReason {
  code:'INTEREST_MATCH'|'EXPERIENCE_MATCH'|'ACTIVITY_MATCH'|'CAMPUS_MATCH'|'CHECK_NEEDED'|'DEADLINE_UNKNOWN'|'NO_PERSONAL_MATCH';
  text:string;
}

export interface RankedClub {
  post:ClubPost;
  lifecycle:ClubLifecycle;
  eligibility:ClubEligibility;
  /** Condition fields with no student value (UNKNOWN) or failing (INELIGIBLE). */
  fields:ConditionField[];
  score:{I:number; S:number; A:number; C:0|1; total:number};
  relevant:boolean;
  reasons:ClubReason[];
  evidenceRefs:string[];
}

export interface ClubBoard {
  asOf:string;
  configVersion:string;
  /** Up to 3 highlighted, relevant, recruitable, not ineligible; one per category. */
  recommended:RankedClub[];
  /** Every visible post (recommended ones included), recruitable first, then closed. */
  all:RankedClub[];
  provenance:'CODE_RULES';
}

export const CLUB_RANK_CONFIG = {
  version:'club-v1.0',
  weights:{I:50, S:15, A:25, C:10},
  recommendMax:3,
  maxPerCategory:1,
} as const;

const ACTIVITY_LABEL:Readonly<Record<ClubActivity, string>> = {
  STUDY:'스터디', PROJECT:'프로젝트', DEBATE:'토론', PERFORMANCE:'공연', VOLUNTEERING:'봉사', MATCH:'경기',
  TRIP:'답사·여행', NETWORKING:'교류', CREATION:'창작', MENTORING:'멘토링',
};
const FIELD_LABEL:Readonly<Record<ConditionField, string>> = {
  enrollment:'학적', campus:'캠퍼스', major:'전공', cohort:'학번', degree:'학위과정',
  time:'일정', teamRole:'역할', certification:'자격',
};

const ms = (iso:string|undefined) => (iso === undefined ? undefined : Date.parse(iso));
const round6 = (x:number) => Math.round(x * 1e6) / 1e6;

/** Visibility gate shared by list, recommendation and direct lookup. undefined = visible. */
export function clubHiddenReason(post:ClubPost, asOf:string):ClubHiddenReason|undefined {
  const now = Date.parse(asOf);
  if (!Number.isFinite(now)) throw new RangeError('asOf must be an ISO datetime');
  const times = [post.createdAt, post.updatedAt, post.approvedAt, post.recruitOpensAt, post.recruitClosesAt];
  if (times.some(t => t !== undefined && !Number.isFinite(Date.parse(t)))) return 'INVALID_TIME';
  if (post.state !== 'APPROVED' || post.approvedAt === undefined) return 'NOT_APPROVED';
  if (ms(post.createdAt)! > now) return 'CREATED_AFTER_ASOF';
  if (ms(post.approvedAt)! > now) return 'APPROVAL_AFTER_ASOF';
  return undefined;
}

/** Direct URL / detail lookup: same gate as the list, so an unapproved poster is never served. */
export function findVisibleClubPost(posts:readonly ClubPost[], id:string, asOf:string):ClubPost|undefined {
  const post = posts.find(p => p.id === id);
  return post && clubHiddenReason(post, asOf) === undefined ? post : undefined;
}

export function clubLifecycle(post:ClubPost, asOf:string):ClubLifecycle {
  const now = Date.parse(asOf);
  const closes = ms(post.recruitClosesAt);
  if (closes !== undefined && closes <= now) return 'CLOSED';
  const opens = ms(post.recruitOpensAt);
  if (opens !== undefined && opens > now) return 'UPCOMING';
  return closes === undefined ? 'OPEN_NO_DEADLINE' : 'OPEN';
}

function evaluateClub(profile:ClubProfile, post:ClubPost, asOf:string):RankedClub {
  const w = CLUB_RANK_CONFIG.weights;
  const topics = onlyKnownTopics(post.topicCodes);
  const interest = onlyKnownTopics(profile.interestTopics);
  const experience = onlyKnownTopics(profile.approvedExperienceTopics);
  const I = coverage(interest, topics);
  const S = coverage(experience, topics);
  const wanted = [...new Set(profile.desiredActivities)];
  const matchedActivities = wanted.filter(a => post.activities.includes(a));
  const A = wanted.length === 0 ? 0 : Math.min(1, matchedActivities.length / Math.min(2, wanted.length));
  const C:0|1 = profile.campus !== undefined && (post.campus === 'BOTH' || post.campus === profile.campus) ? 1 : 0;
  const total = round6(w.I * I + w.S * S + w.A * A + w.C * C);

  const outcomes = post.conditions.map(c => ({c, outcome:evaluateCondition(c, profile.facts)}));
  const failed = outcomes.filter(o => o.outcome === 'FAIL').map(o => o.c.field);
  const unknown = outcomes.filter(o => o.outcome === 'UNKNOWN').map(o => o.c.field);
  const eligibility:ClubEligibility = failed.length ? 'INELIGIBLE' : unknown.length ? 'UNKNOWN' : 'ELIGIBLE';
  const fields = [...new Set(failed.length ? failed : unknown)];

  const lifecycle = clubLifecycle(post, asOf);
  const relevant = I > 0 || S > 0 || A > 0;
  const mi = interest.filter(t => topics.includes(t));
  const me = experience.filter(t => topics.includes(t));
  const label = (ts:readonly TopicCode[]) => ts.map(t => `‘${TOPIC_LABELS_KO[t]}’`).join(', ');
  const reasons:ClubReason[] = [];
  if (!relevant) reasons.push({code:'NO_PERSONAL_MATCH', text:'내 관심 분야·희망 활동과 직접 겹치지는 않는 동아리예요.'});
  if (mi.length) reasons.push({code:'INTEREST_MATCH', text:`관심 분야 ${label(mi)} 관련 동아리예요.`});
  if (me.length) reasons.push({code:'EXPERIENCE_MATCH', text:`승인한 경험의 주제 ${label(me)}에 이어지는 활동이에요.`});
  if (matchedActivities.length) reasons.push({code:'ACTIVITY_MATCH', text:`희망 활동(${matchedActivities.map(a => ACTIVITY_LABEL[a]).join('·')})을 해요.`});
  if (C === 1) reasons.push({code:'CAMPUS_MATCH', text:post.campus === 'BOTH' ? '두 캠퍼스 모두 참여할 수 있어요.' : '선택한 캠퍼스에서 활동해요.'});
  if (eligibility === 'UNKNOWN') reasons.push({code:'CHECK_NEEDED', text:`${fields.map(f => FIELD_LABEL[f]).join('·')} 정보가 없어 모집 조건은 확인 필요예요.`});
  if (lifecycle === 'OPEN_NO_DEADLINE') reasons.push({code:'DEADLINE_UNKNOWN', text:'모집 마감일이 정해지지 않았어요(미정).'});

  return {
    post, lifecycle, eligibility, fields,
    score:{I:round6(I), S:round6(S), A:round6(A), C, total},
    relevant, reasons,
    evidenceRefs:[...new Set(post.conditions.map(c => c.evidenceId))],
  };
}

const recruitable = (r:RankedClub) => r.lifecycle !== 'CLOSED';
const deadlineKey = (r:RankedClub) => ms(r.post.recruitClosesAt) ?? Number.POSITIVE_INFINITY;
/** score desc → confirmed deadline asc (미정 last) → id. Never popularity. */
export function compareClubs(a:RankedClub, b:RankedClub):number {
  return (b.score.total - a.score.total) || (deadlineKey(a) - deadlineKey(b)) || byCodeUnit(a.post.id, b.post.id);
}

/** Pure and byte-stable for the same profile, posts and asOf. Nothing is keyed by student identity. */
export function composeClubBoard(profile:ClubProfile, posts:readonly ClubPost[], options:{asOf:string}):ClubBoard {
  const visible = posts.filter(p => clubHiddenReason(p, options.asOf) === undefined);
  const ranked = visible.map(p => evaluateClub(profile, p, options.asOf)).sort(compareClubs);
  const perCategory = new Map<ClubCategory, number>();
  const recommended:RankedClub[] = [];
  for (const r of ranked) {
    if (recommended.length >= CLUB_RANK_CONFIG.recommendMax) break;
    if (!r.relevant || !recruitable(r) || r.eligibility === 'INELIGIBLE') continue;
    const n = perCategory.get(r.post.category) ?? 0;
    if (n >= CLUB_RANK_CONFIG.maxPerCategory) continue;
    perCategory.set(r.post.category, n + 1);
    recommended.push(r);
  }
  const all = [...ranked.filter(recruitable), ...ranked.filter(r => !recruitable(r))];
  return {asOf:options.asOf, configVersion:CLUB_RANK_CONFIG.version, recommended, all, provenance:'CODE_RULES'};
}
