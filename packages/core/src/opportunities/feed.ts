import {FeedResultSchema, type FeedResult, type Opportunity} from '@hufs-one/contracts';
import {byCodeUnit} from '../normalization/dedupe.js';
import {canonicalTerm, onlyKnownTopics} from '../normalization/topics.js';
import type {RecommendationProfile} from './evaluate.js';
import {RANK_CONFIG_V1, rankOpportunities, type RankOptions, type RankedOpportunity} from './rank.js';

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
  /** Full visible list (featured + compact + rest) so the original list is never lost. */
  all:RankedOpportunity[];
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

/** Diversity first, then the deferred same-group items, preserving rank order inside each pass. */
function orderDiverse(items:readonly RankedOpportunity[], cap:number):RankedOpportunity[] {
  const first = takeDiverse(items, items.length, cap);
  const picked = new Set(first);
  return [...first, ...items.filter(r => !picked.has(r))];
}

function latestFirst(items:readonly RankedOpportunity[], options:RankOptions):RankedOpportunity[] {
  const at = (r:RankedOpportunity) => {
    if (r.futurePublication) return Number.NEGATIVE_INFINITY;
    const raw = options.publishedAtBySnapshotId?.[r.opportunity.sourceSnapshotId];
    const t = raw === undefined ? NaN : Date.parse(raw);
    return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
  };
  return [...items].sort((a, b) => (at(b) - at(a)) || byCodeUnit(a.opportunity.id, b.opportunity.id));
}

function toCard(r:RankedOpportunity, displayMode:'FEATURED_LARGE'|'COMPACT_LIST') {
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
  };
}

/**
 * A05.2 steps 1, 7–9. Pure and byte-stable for the same profile, opportunities, asOf and config.
 * Equal profiles get equal feeds: nothing here is keyed by student identity.
 */
export function composeFeed(profile:RecommendationProfile, opportunities:readonly Opportunity[], options:ComposeFeedOptions):ComposedFeed {
  const cfg = options.config ?? RANK_CONFIG_V1;
  const hidden = new Set(options.hiddenOpportunityIds ?? []);
  const ranked = rankOpportunities(profile, opportunities.filter(o => !hidden.has(o.id)), options);
  const closed = ranked.filter(r => r.evaluation.lifecycle === 'CLOSED');
  const open = ranked.filter(r => r.evaluation.lifecycle !== 'CLOSED');
  const ineligible = open.filter(r => r.evaluation.eligibility === 'INELIGIBLE');
  const visible = open.filter(r => r.evaluation.eligibility !== 'INELIGIBLE');

  const personal = hasPersonalSignal(profile);
  const featured = personal
    ? takeDiverse(visible.filter(r => r.relevant && featurableQuality(r)), FEATURED_MAX, cfg.maxPerKindOrganization)
    : [];
  const featuredSet = new Set(featured);
  const rest = visible.filter(r => !featuredSet.has(r));
  const ordered = personal ? orderDiverse(rest, cfg.maxPerKindOrganization) : latestFirst(rest, options);
  const compact = ordered.slice(0, COMPACT_MAX);

  const feed = FeedResultSchema.parse({
    asOf:options.asOf,
    featured:featured.map(r => toCard(r, 'FEATURED_LARGE')),
    compact:compact.map(r => toCard(r, 'COMPACT_LIST')),
    hasMore:visible.length > featured.length + compact.length,
    totalCandidates:visible.length,
  });
  return {feed, ineligible, closed, all:[...featured, ...ordered], rankConfigVersion:cfg.version};
}
