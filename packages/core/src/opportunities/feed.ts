import {FeedResultSchema, type FeedResult, type Opportunity} from '@hufs-one/contracts';
import {byCodeUnit} from '../normalization/dedupe.js';
import {canonicalTerm, onlyKnownTopics} from '../normalization/topics.js';
import type {RecommendationProfile} from './evaluate.js';
import {explainRecommendation, type RecommendationExplanation} from './explain.js';
import {DEFAULT_RANK_CONFIG, rankOpportunities, type RankOptions, type RankedOpportunity} from './rank.js';

export const FEATURED_MAX = 3;
export const COMPACT_MAX = 6;

export interface ComposeFeedOptions extends RankOptions {
  /** Per-student/demo overlay "관심 낮음" hides; excluded from every list including the count. */
  hiddenOpportunityIds?:readonly string[];
}

export interface ComposedFeed {
  /** Wire object for the API/UI, validated with FeedResultSchema. */
  feed:FeedResult;
  /** "관심은 맞지만 조건 미충족" area (A05.2-1), relevance order. */
  ineligible:RankedOpportunity[];
  /** Expired items: only for the history / expired filter. */
  closed:RankedOpportunity[];
  /**
   * Published after asOf: never shown in featured/compact/all (no time leakage into a past view).
   * Review queue only. Items with an UNKNOWN publication time stay visible with F=0.
   */
  excludedFuture:RankedOpportunity[];
  /** Full visible list (featured + compact + rest) so the original list is never lost. */
  all:RankedOpportunity[];
  /**
   * Code-built reasons for every shown card (featured + compact), in display order. Kept beside the
   * wire FeedResult because FeedCard is strict; carrying it to the UI needs a contracts decision.
   */
  explanations:RecommendationExplanation[];
  rankConfigVersion:string;
}

const groupKey = (o:Opportunity) => `${o.kind}|${canonicalTerm(o.organization).toLowerCase()}`;
const hasPersonalSignal = (p:RecommendationProfile) =>
  p.interestTopics.length + p.desiredJobTopics.length + p.approvedExperienceTopics.length > 0;
const featurableQuality = (r:RankedOpportunity) => r.opportunity.dataQuality === 'COMPLETE' || r.opportunity.dataQuality === 'PARTIAL';

/** Fill up to `max` slots with at most `cap` per kind+organization; never relax beyond the cap. */
function takeDiverse(items:readonly RankedOpportunity[], max:number, cap:number):RankedOpportunity[] {
  const counts = new Map<string, number>();
  const out:RankedOpportunity[] = [];
  for (const r of items) {
    if (out.length >= max) break;
    const k = groupKey(r.opportunity);
    const n = counts.get(k) ?? 0;
    if (n >= cap) continue;
    counts.set(k, n + 1);
    out.push(r);
  }
  return out;
}

const matchedTopics = (r:RankedOpportunity) => [...r.matched.job, ...r.matched.interest, ...r.matched.experience];

/**
 * Large cards with topic diversity: first pass takes, in rank order, only items that add a student
 * topic not yet covered; the second pass fills the remaining slots in rank order. The kind+organization
 * cap applies in both passes, so no rule is relaxed and the card count never drops below takeDiverse.
 * Selected cards are shown in rank order.
 */
function takeTopicDiverse(items:readonly RankedOpportunity[], max:number, cap:number):RankedOpportunity[] {
  const counts = new Map<string, number>();
  const covered = new Set<string>();
  const picked = new Set<RankedOpportunity>();
  const tryPick = (r:RankedOpportunity, requireNewTopic:boolean) => {
    if (picked.size >= max || picked.has(r)) return;
    const k = groupKey(r.opportunity);
    if ((counts.get(k) ?? 0) >= cap) return;
    const topics = matchedTopics(r);
    if (requireNewTopic && picked.size > 0 && topics.every(t => covered.has(t))) return;
    counts.set(k, (counts.get(k) ?? 0) + 1);
    for (const t of topics) covered.add(t);
    picked.add(r);
  };
  for (const r of items) tryPick(r, true);
  for (const r of items) tryPick(r, false);
  return items.filter(r => picked.has(r));
}

/** Diversity first, then the deferred same-group items, preserving rank order inside each pass. */
function orderDiverse(items:readonly RankedOpportunity[], cap:number):RankedOpportunity[] {
  const first = takeDiverse(items, items.length, cap);
  const picked = new Set(first);
  return [...first, ...items.filter(r => !picked.has(r))];
}

function latestFirst(items:readonly RankedOpportunity[], options:RankOptions):RankedOpportunity[] {
  const at = (r:RankedOpportunity) => {
    const raw = options.publishedAtBySnapshotId?.[r.opportunity.sourceSnapshotId];
    const t = raw === undefined ? NaN : Date.parse(raw);
    return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
  };
  return [...items].sort((a, b) => (at(b) - at(a)) || byCodeUnit(a.opportunity.id, b.opportunity.id));
}

function toCard(r:RankedOpportunity, displayMode:'FEATURED_LARGE'|'COMPACT_LIST', explanation:RecommendationExplanation) {
  return {
    opportunityId:r.opportunity.id,
    displayMode,
    title:r.opportunity.title,
    eligibility:r.evaluation.eligibility,
    lifecycle:r.evaluation.lifecycle,
    topics:onlyKnownTopics(r.opportunity.topicCodes).slice(0, 5),
    evidenceRefs:r.evaluation.evidenceRefs,
    score:r.score.total,
    dataMode:r.opportunity.dataMode,
    // Optional FeedCard.explanation wire (contracts #47): same id/score/topics, validated by FeedCardSchema.
    explanation,
  };
}

/**
 * A05.2 steps 1, 7–9. Pure and byte-stable for the same profile, opportunities, asOf and config.
 * Equal profiles get equal feeds: nothing here is keyed by student identity.
 */
export function composeFeed(profile:RecommendationProfile, opportunities:readonly Opportunity[], options:ComposeFeedOptions):ComposedFeed {
  const cfg = options.config ?? DEFAULT_RANK_CONFIG;
  const hidden = new Set(options.hiddenOpportunityIds ?? []);
  const ranked = rankOpportunities(profile, opportunities.filter(o => !hidden.has(o.id)), options);
  const excludedFuture = ranked.filter(r => r.publication === 'FUTURE');
  const known = ranked.filter(r => r.publication !== 'FUTURE');
  const closed = known.filter(r => r.evaluation.lifecycle === 'CLOSED');
  const open = known.filter(r => r.evaluation.lifecycle !== 'CLOSED');
  const ineligible = open.filter(r => r.evaluation.eligibility === 'INELIGIBLE');
  const visible = open.filter(r => r.evaluation.eligibility !== 'INELIGIBLE');

  const personal = hasPersonalSignal(profile);
  const featured = personal
    ? (cfg.topicDiversity ? takeTopicDiverse : takeDiverse)(visible.filter(r => r.relevant && featurableQuality(r)), FEATURED_MAX, cfg.maxPerKindOrganization)
    : [];
  const featuredSet = new Set(featured);
  const rest = visible.filter(r => !featuredSet.has(r));
  const ordered = personal ? orderDiverse(rest, cfg.maxPerKindOrganization) : latestFirst(rest, options);
  const compact = ordered.slice(0, COMPACT_MAX);

  const feed = FeedResultSchema.parse({
    asOf:options.asOf,
    featured:featured.map(r => toCard(r, 'FEATURED_LARGE', explainRecommendation(r, cfg))),
    compact:compact.map(r => toCard(r, 'COMPACT_LIST', explainRecommendation(r, cfg))),
    hasMore:visible.length > featured.length + compact.length,
    totalCandidates:visible.length,
  });
  const explanations = [...featured, ...compact].map(r => explainRecommendation(r, cfg));
  return {feed, ineligible, closed, excludedFuture, all:[...featured, ...ordered], explanations, rankConfigVersion:cfg.version};
}
