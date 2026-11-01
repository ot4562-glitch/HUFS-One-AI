import type {Opportunity} from '@hufs-one/contracts';
import type {ConditionField, RecommendationProfile} from './evaluate.js';
import {composeFeed, featureGroupKey, FEATURED_MAX, type ComposeFeedOptions} from './feed.js';
import {compareRanked, DEFAULT_RANK_CONFIG, rankOpportunities, type RankedOpportunity} from './rank.js';
import type {WithheldInput} from './scope.js';

/**
 * #86 "이 공고는 왜 상단 추천에 없나요?" — code-built reasons for candidates that are NOT large cards.
 * Deterministic, no AI, derived only from the same composeFeed decision (never a second opinion).
 *
 * Safety rules:
 * - Only the candidates the caller passes are explained. The API must pass only candidates the viewer may
 *   see; anything else is absent from the list AND the count. The core adds nothing.
 * - Items published after asOf are omitted entirely (no time leakage, not even a "not yet" reason).
 * - A reason that would depend on an unshared section is never returned on its own: it collapses into the
 *   non-identifying NOT_EVALUATED, which does not say which section or value was missing.
 * - This is not a recommendation to apply or not: eligibility is still only what the code rules decided.
 */
export type NotFeaturedReason =
  | 'HIDDEN_BY_USER'       // the student chose "관심 낮음"
  | 'DEADLINE_PASSED'      // confirmed deadline ≤ asOf
  | 'ELIGIBILITY_NOT_MET'  // a shared, verified fact failed a stated condition
  | 'SOURCE_NEEDS_REVIEW'  // STALE / CONFLICT / MISSING source: never a large card
  | 'LOW_RELEVANCE'        // no job / interest / approved-experience topic match
  | 'OUTRANKED'            // relevant, and every large card ranks above it
  | 'GROUP_CAP'            // relevant, skipped for a lower-ranked card: its kind+organization already has the cap
  | 'DIVERSITY'            // relevant, skipped for a lower-ranked card by opt-in topic diversity (rank-v1.1)
  | 'NO_PERSONAL_INPUT'    // the student has not entered interests / desired jobs / approved experiences
  | 'NOT_EVALUATED';       // personal inputs exist but are outside the shared scope (section not named)

export type NotFeaturedNote = 'ELIGIBILITY_UNKNOWN'|'NOT_EVALUATED';
export type NotFeaturedPlacement = 'COMPACT_LIST'|'MORE_LIST'|'INELIGIBLE_AREA'|'HISTORY'|'HIDDEN';

export interface NotFeaturedItem {
  opportunityId:string;
  reason:NotFeaturedReason;
  /** Secondary facts that do not change the placement (e.g. eligibility still to be confirmed). */
  notes:NotFeaturedNote[];
  placement:NotFeaturedPlacement;
  text:string;
  /** Failed condition fields, only for ELIGIBILITY_NOT_MET. */
  fields:ConditionField[];
  /** Condition evidence of the decision; empty for HIDDEN_BY_USER and NOT_EVALUATED (nothing evaluated for display). */
  evidenceRefs:string[];
}

export interface NotFeaturedReport {
  asOf:string;
  rankConfigVersion:string;
  featuredIds:string[];
  /** Placement order (compact → more → ineligible → history → hidden), rank order inside each. */
  items:NotFeaturedItem[];
  provenance:'CODE_RULES';
}

export interface NotFeaturedOptions extends ComposeFeedOptions {
  /** ScopedInputs.withheld from scopeInputsToGrant: decides when a reason collapses into NOT_EVALUATED. */
  withheld?:readonly WithheldInput[];
}

const TEXT:Record<NotFeaturedReason, string> = {
  HIDDEN_BY_USER:'내가 “관심 낮음”으로 숨긴 공고예요. 다시 보려면 숨김을 해제하세요.',
  DEADLINE_PASSED:'신청 마감이 지나 지난 공고에서만 보여요.',
  ELIGIBILITY_NOT_MET:'공고에 적힌 지원 조건이 맞지 않아 “조건 미충족” 영역에 있어요.',
  SOURCE_NEEDS_REVIEW:'공고 정보가 오래됐거나 서로 달라 확인 전에는 상단에 올리지 않아요.',
  LOW_RELEVANCE:'내 관심·희망 직무·승인한 경험과 직접 겹치는 주제가 없어 일반 목록에 있어요.',
  OUTRANKED:'관련은 있지만 상단 카드 3개가 모두 이 공고보다 점수가 높은 공고로 채워졌어요.',
  GROUP_CAP:'관련은 있지만 같은 기관·같은 종류의 공고가 이미 상단에 최대 개수만큼 있어 다른 공고가 대신 올라갔어요.',
  DIVERSITY:'관련은 있지만 상단 카드는 서로 다른 관심 주제를 고르게 보여주도록 골라 다른 주제의 공고가 대신 올라갔어요.',
  NO_PERSONAL_INPUT:'아직 관심 분야·희망 직무·경험을 입력하지 않아 맞춤 판단 없이 최신순 목록에 있어요.',
  NOT_EVALUATED:'공유 범위 밖의 정보는 사용하지 않아 이 공고는 맞춤 판단 없이 일반 목록에 있어요.',
};
const FIELD_LABEL:Record<ConditionField, string> = {
  enrollment:'학적', campus:'캠퍼스', major:'전공', cohort:'학번', degree:'학위과정',
  time:'일정', teamRole:'팀 역할', certification:'자격증',
};
const NOTE_TEXT:Record<NotFeaturedNote, string> = {
  ELIGIBILITY_UNKNOWN:' 지원 가능 여부는 원문 확인이 필요해요.',
  NOT_EVALUATED:' 일부 정보가 공유되지 않아 지원 가능 여부를 판단하지 않았어요.',
};

const hasPersonalSignal = (p:RecommendationProfile) =>
  p.interestTopics.length + p.desiredJobTopics.length + p.approvedExperienceTopics.length > 0;

export function explainNotFeatured(
  profile:RecommendationProfile, opportunities:readonly Opportunity[], options:NotFeaturedOptions,
):NotFeaturedReport {
  const cfg = options.config ?? DEFAULT_RANK_CONFIG;
  const withheld = new Set(options.withheld ?? []);
  const experienceWithheld = withheld.has('EXPERIENCE_TOPICS');
  const factWithheld = [...withheld].some(w => w.startsWith('FACT:'));
  const personal = hasPersonalSignal(profile);

  const composed = composeFeed(profile, opportunities, options);
  const featuredIds = composed.feed.featured.map(c => c.opportunityId);
  const compactIds = new Set(composed.feed.compact.map(c => c.opportunityId));
  const featured = new Set(featuredIds);

  const notes = (r:RankedOpportunity):NotFeaturedNote[] =>
    r.evaluation.eligibility !== 'UNKNOWN' ? [] : [factWithheld ? 'NOT_EVALUATED' : 'ELIGIBILITY_UNKNOWN'];
  const item = (r:RankedOpportunity, reason:NotFeaturedReason, placement:NotFeaturedPlacement, noteList:NotFeaturedNote[] = []):NotFeaturedItem => {
    // An unevaluated candidate carries no evaluation at all (#120 contract): no notes, no evidence.
    const unevaluated = reason === 'NOT_EVALUATED';
    const n = unevaluated ? [] : noteList;
    const fields = reason === 'ELIGIBILITY_NOT_MET'
      ? [...new Set(r.evaluation.conditions.filter(c => c.outcome === 'FAIL').map(c => c.field))] : [];
    const text = reason === 'ELIGIBILITY_NOT_MET'
      ? `지원 조건(${fields.map(f => FIELD_LABEL[f]).join('·')})이 맞지 않아 “조건 미충족” 영역에 있어요.`
      : TEXT[reason] + n.map(x => NOTE_TEXT[x]).join('');
    return {opportunityId:r.opportunity.id, reason, notes:n, placement, text, fields, evidenceRefs:unevaluated ? [] : [...r.evaluation.evidenceRefs]};
  };
  const featuredRanked = composed.all.filter(r => featured.has(r.opportunity.id));
  const groupCount = new Map<string, number>();
  for (const f of featuredRanked) groupCount.set(featureGroupKey(f.opportunity), (groupCount.get(featureGroupKey(f.opportunity)) ?? 0) + 1);
  /** Only claims "outranked" when it is literally true for the selection that composeFeed made. */
  const relevantReason = (r:RankedOpportunity):NotFeaturedReason => {
    const lowerPicked = featuredRanked.some(f => compareRanked(f, r) > 0);
    if (!lowerPicked && featuredRanked.length >= FEATURED_MAX) return 'OUTRANKED';
    if ((groupCount.get(featureGroupKey(r.opportunity)) ?? 0) >= cfg.maxPerKindOrganization) return 'GROUP_CAP';
    return 'DIVERSITY';
  };
  const visibleReason = (r:RankedOpportunity):NotFeaturedReason => {
    if (r.opportunity.dataQuality !== 'COMPLETE' && r.opportunity.dataQuality !== 'PARTIAL') return 'SOURCE_NEEDS_REVIEW';
    // Missing preferences vs. unshared inputs get different copy; neither names a section or a value.
    if (!personal) return experienceWithheld ? 'NOT_EVALUATED' : 'NO_PERSONAL_INPUT';
    // Without the unshared experience topics the core cannot say "no match" honestly.
    if (!r.relevant) return experienceWithheld ? 'NOT_EVALUATED' : 'LOW_RELEVANCE';
    return relevantReason(r);
  };

  const shownBelow = composed.all.filter(r => !featured.has(r.opportunity.id));
  const items:NotFeaturedItem[] = [
    ...shownBelow.filter(r => compactIds.has(r.opportunity.id)).map(r => item(r, visibleReason(r), 'COMPACT_LIST', notes(r))),
    ...shownBelow.filter(r => !compactIds.has(r.opportunity.id)).map(r => item(r, visibleReason(r), 'MORE_LIST', notes(r))),
    ...composed.ineligible.map(r => item(r, 'ELIGIBILITY_NOT_MET', 'INELIGIBLE_AREA')),
    ...composed.closed.map(r => item(r, 'DEADLINE_PASSED', 'HISTORY')),
  ];

  // Hidden candidates: same future-publication rule, and nothing else about them is evaluated or shown.
  const hiddenIds = new Set(options.hiddenOpportunityIds ?? []);
  const hidden = rankOpportunities(profile, opportunities.filter(o => hiddenIds.has(o.id)), options)
    .filter(r => r.publication !== 'FUTURE');
  for (const r of hidden) {
    items.push({opportunityId:r.opportunity.id, reason:'HIDDEN_BY_USER', notes:[], placement:'HIDDEN', text:TEXT.HIDDEN_BY_USER, fields:[], evidenceRefs:[]});
  }
  return {asOf:options.asOf, rankConfigVersion:cfg.version, featuredIds, items, provenance:'CODE_RULES'};
}
