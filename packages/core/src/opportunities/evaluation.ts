import type {Opportunity} from '@hufs-one/contracts';
import {byCodeUnit} from '../normalization/dedupe.js';
import type {RecommendationProfile} from './evaluate.js';
import {composeFeed, featureGroupKey, type ComposeFeedOptions} from './feed.js';
import type {RankedOpportunity} from './rank.js';

/**
 * A15.1 evaluation helpers. Pure and deterministic: they measure a ranking against human labels,
 * they never change it. Labels: 0 = 무관, 1 = 보조, 2 = 매우 관련 (eligibility is labelled separately).
 * Per-profile results are exact fractions as well as decimals: with N=5 profiles a mean P@3 moves in 1/15
 * steps, so it must not be reported as a population-level effect.
 */
export type RelevanceLabel = 0|1|2;
export type LabelSet = Readonly<Record<string, RelevanceLabel>>; // opportunityId → label, for one profile

export interface Fraction {num:number; den:number; value:number}
const frac = (num:number, den:number):Fraction => ({num, den, value:den === 0 ? 0 : Math.round(num / den * 1e6) / 1e6});

export interface PrecisionAtK {
  /** Requested k. */
  k:number;
  /** Items actually ranked (k may be larger than the candidate list, A15.1). */
  actualK:number;
  precision:Fraction;
  /** Ranked items that carry a label (unlabelled items count as not relevant, and are reported). */
  coverage:Fraction;
}

/** P@k with rel ≥ minRelevance. Unlabelled items are not relevant. Precision divides by actualK. */
export function precisionAtK(rankedIds:readonly string[], labels:LabelSet, k:number, minRelevance:1|2 = 1):PrecisionAtK {
  if (!Number.isInteger(k) || k < 1) throw new RangeError('k must be a positive integer');
  const top = rankedIds.slice(0, k);
  const hits = top.filter(id => (labels[id] ?? 0) >= minRelevance).length;
  const labelled = top.filter(id => labels[id] !== undefined).length;
  return {k, actualK:top.length, precision:frac(hits, top.length), coverage:frac(labelled, top.length)};
}

/**
 * nDCG@k with gain 2^rel − 1 and log2(i+2) discount. `rankedIds` must be the **whole evaluable candidate
 * list** in ranked order: the ideal order (IDCG) is built only from the labels of those same candidates,
 * so labels of hidden / future / ineligible / closed items never lower the score (PR #48 review).
 */
export function ndcgAtK(rankedIds:readonly string[], labels:LabelSet, k:number):number {
  if (!Number.isInteger(k) || k < 1) throw new RangeError('k must be a positive integer');
  const dcg = (rels:readonly number[]) => rels.slice(0, k).reduce((sum, rel, i) => sum + (2 ** rel - 1) / Math.log2(i + 2), 0);
  const gains = [...new Set(rankedIds)].map(id => labels[id] ?? 0);
  const ideal = dcg([...gains].sort((a, b) => b - a));
  if (ideal === 0) return 0;
  return Math.round(dcg(rankedIds.map(id => labels[id] ?? 0)) / ideal * 1e6) / 1e6;
}

export type GoldEligibility = 'ELIGIBLE'|'INELIGIBLE'|'UNKNOWN';
export interface EligibilityAgreement {
  /** Predicted ELIGIBLE while gold says INELIGIBLE: the critical error class (중대한 허위 적격). */
  falseEligible:string[];
  /** Predicted INELIGIBLE while gold says ELIGIBLE: wrongly hidden. */
  falseIneligible:string[];
  /** Predicted UNKNOWN (badge shown, not an error but counted). */
  unknown:string[];
  /** Precision/recall of the INELIGIBLE decision (조건 precision/recall), over items with a definite gold label. */
  conditionPrecision:Fraction;
  conditionRecall:Fraction;
}

/** Compares code eligibility with independent gold labels. Items without a gold label are skipped. */
export function eligibilityAgreement(
  predicted:Readonly<Record<string, GoldEligibility>>, gold:Readonly<Record<string, GoldEligibility>>,
):EligibilityAgreement {
  const ids = Object.keys(gold).sort(byCodeUnit);
  const falseEligible:string[] = [], falseIneligible:string[] = [], unknown:string[] = [];
  let tp = 0, predictedIneligible = 0, goldIneligible = 0;
  for (const id of ids) {
    const p = predicted[id], g = gold[id];
    if (p === undefined) continue;
    if (p === 'UNKNOWN') unknown.push(id);
    if (p === 'ELIGIBLE' && g === 'INELIGIBLE') falseEligible.push(id);
    if (p === 'INELIGIBLE' && g === 'ELIGIBLE') falseIneligible.push(id);
    if (g === 'UNKNOWN') continue;
    if (p === 'INELIGIBLE') predictedIneligible++;
    if (g === 'INELIGIBLE') goldIneligible++;
    if (p === 'INELIGIBLE' && g === 'INELIGIBLE') tp++;
  }
  return {falseEligible, falseIneligible, unknown, conditionPrecision:frac(tp, predictedIneligible), conditionRecall:frac(tp, goldIneligible)};
}

export interface EvalProfile {profileId:string; profile:RecommendationProfile; labels:LabelSet}
/**
 * Label-free quality of one arm's top 3 (#10: 다양성·UNKNOWN). `distinctGroups` counts kind+organizer groups
 * (the same key the feed caps), `distinctTopics` counts topic codes, `unknownEligibility` counts slots whose
 * code eligibility is UNKNOWN. These never use human labels, so they are comparable even before gold exists.
 */
export interface Top3Quality {slots:number; distinctGroups:number; distinctTopics:number; unknownEligibility:number}
export interface RankerScore {p3:PrecisionAtK; ndcg3:number; top3:string[]; top3Quality:Top3Quality}
/** Pooled over profiles as exact fractions of top-3 slots, so profiles with < 3 candidates are not over-weighted. */
export interface Top3QualitySummary {groupDiversity:Fraction; unknownEligibilityShare:Fraction; meanDistinctTopics:number}
export interface ProfileComparison {profileId:string; latestFirst:RankerScore; recommended:RankerScore}
/** Both averages are reported because they differ when a profile has fewer than k candidates. */
export interface MeanP3 {
  /** Arithmetic mean of each profile's P@3 (A15.1 "N명 평균 P@3"; the +20%p goal uses this). */
  macro:number;
  /** Pooled hits / pooled ranked slots over all profiles, as an exact fraction. */
  micro:Fraction;
}
export interface RankerComparison {
  profiles:ProfileComparison[];
  meanP3:{latestFirst:MeanP3; recommended:MeanP3};
  meanNdcg3:{latestFirst:number; recommended:number};
  top3Quality:{latestFirst:Top3QualitySummary; recommended:Top3QualitySummary};
  /** recommended − latestFirst in percentage points of the **macro** mean P@3 (A15.1 goal: +20%p). */
  deltaP3Points:number;
  /** Same difference on the micro (pooled) mean, for transparency. */
  deltaP3PointsMicro:number;
  rankConfigVersion:string;
}

/**
 * A15.1 A vs B: A = latest first (confirmed publishedAt desc, unknown last, id), B = composeFeed order
 * (featured then compact then the rest of the visible list). Both see the same visible candidates
 * (closed / ineligible / future-published / hidden excluded the same way), so only the order differs.
 */
export function compareRankers(
  profiles:readonly EvalProfile[], opportunities:readonly Opportunity[], options:ComposeFeedOptions,
):RankerComparison {
  const at = (o:Opportunity) => {
    const raw = options.publishedAtBySnapshotId?.[o.sourceSnapshotId];
    const t = raw === undefined ? NaN : Date.parse(raw);
    return Number.isFinite(t) && t <= Date.parse(options.asOf) ? t : Number.NEGATIVE_INFINITY;
  };
  const score = (items:readonly RankedOpportunity[], labels:LabelSet):RankerScore => {
    const ids = items.map(r => r.opportunity.id);
    const top = items.slice(0, 3);
    return {
      p3:precisionAtK(ids, labels, 3), ndcg3:ndcgAtK(ids, labels, 3), top3:ids.slice(0, 3),
      top3Quality:{
        slots:top.length,
        distinctGroups:new Set(top.map(r => featureGroupKey(r.opportunity))).size,
        distinctTopics:new Set(top.flatMap(r => r.opportunity.topicCodes)).size,
        unknownEligibility:top.filter(r => r.evaluation.eligibility === 'UNKNOWN').length,
      },
    };
  };
  let version = '';
  const rows = [...profiles].sort((a, b) => byCodeUnit(a.profileId, b.profileId)).map(({profileId, profile, labels}) => {
    const feed = composeFeed(profile, opportunities, options);
    version = feed.rankConfigVersion;
    const latest = [...feed.all].sort((a, b) => (at(b.opportunity) - at(a.opportunity)) || byCodeUnit(a.opportunity.id, b.opportunity.id));
    return {profileId, latestFirst:score(latest, labels), recommended:score(feed.all, labels)};
  });
  const avg = (xs:number[]) => xs.length === 0 ? 0 : Math.round(xs.reduce((s, x) => s + x, 0) / xs.length * 1e6) / 1e6;
  const mean = (pick:(r:ProfileComparison) => PrecisionAtK):MeanP3 => ({
    macro:avg(rows.map(r => pick(r).precision.value)),
    micro:frac(rows.reduce((s, r) => s + pick(r).precision.num, 0), rows.reduce((s, r) => s + pick(r).precision.den, 0)),
  });
  const points = (a:number, b:number) => Math.round((b - a) * 1e4) / 100;
  const meanP3 = {latestFirst:mean(r => r.latestFirst.p3), recommended:mean(r => r.recommended.p3)};
  const quality = (pick:(r:ProfileComparison) => Top3Quality):Top3QualitySummary => {
    const q = rows.map(pick), slots = q.reduce((s, x) => s + x.slots, 0);
    return {
      groupDiversity:frac(q.reduce((s, x) => s + x.distinctGroups, 0), slots),
      unknownEligibilityShare:frac(q.reduce((s, x) => s + x.unknownEligibility, 0), slots),
      meanDistinctTopics:avg(q.map(x => x.distinctTopics)),
    };
  };
  return {
    profiles:rows,
    meanP3,
    meanNdcg3:{latestFirst:avg(rows.map(r => r.latestFirst.ndcg3)), recommended:avg(rows.map(r => r.recommended.ndcg3))},
    top3Quality:{latestFirst:quality(r => r.latestFirst.top3Quality), recommended:quality(r => r.recommended.top3Quality)},
    deltaP3Points:points(meanP3.latestFirst.macro, meanP3.recommended.macro),
    deltaP3PointsMicro:points(meanP3.latestFirst.micro.value, meanP3.recommended.micro.value),
    rankConfigVersion:version,
  };
}
