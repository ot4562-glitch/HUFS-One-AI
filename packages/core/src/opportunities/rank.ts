import type {Opportunity, TopicCode} from '@hufs-one/contracts';
import {byCodeUnit} from '../normalization/dedupe.js';
import {onlyKnownTopics} from '../normalization/topics.js';
import {evaluateOpportunity, type OpportunityEvaluation, type RecommendationProfile} from './evaluate.js';

/** A05.2 v1.0 design weights: the team's initial choice, not a validated model. */
export const RANK_CONFIG_V1 = {
  version:'rank-v1.0',
  weights:{J:35, I:25, S:15, L:10, M:5, F:10},
  freshnessDays:30,
  maxPerKindOrganization:2,
} as const;
export type RankConfig = typeof RANK_CONFIG_V1;

const DAY_MS = 86_400_000;

export function coverage(user:readonly TopicCode[], opportunity:readonly TopicCode[]):number {
  if (user.length === 0) return 0;
  const hits = user.filter(t => opportunity.includes(t)).length;
  return Math.min(1, hits / Math.max(1, Math.min(2, user.length)));
}

export interface ScoreBreakdown {J:number; I:number; S:number; L:0|1; M:0|1; F:number; total:number}
export interface MatchedTopics {job:TopicCode[]; interest:TopicCode[]; experience:TopicCode[]}

export interface RankedOpportunity {
  opportunity:Opportunity;
  evaluation:OpportunityEvaluation;
  score:ScoreBreakdown;
  /** Code-built reason material; an LLM may only rephrase within these facts. */
  matched:MatchedTopics;
  /** J>0 or I>0 or S>0. Freshness alone never makes an item personal. */
  relevant:boolean;
  /** Publication time was after asOf: freshness forced to 0 and flagged for review. */
  futurePublication:boolean;
  /** CONFIRMED ≤ asOf, FUTURE > asOf (excluded from the feed), UNKNOWN when not confirmed. */
  publication:PublicationState;
}

export type PublicationState = 'CONFIRMED'|'FUTURE'|'UNKNOWN';

export interface RankOptions {
  asOf:string;
  /** Opportunity.sourceSnapshotId → SourceSnapshot.publishedAt (confirmed posting time). */
  publishedAtBySnapshotId?:Readonly<Record<string, string|undefined>>;
  config?:RankConfig;
}

const round6 = (x:number) => Math.round(x * 1e6) / 1e6;
const lang = (codes:readonly string[]) => new Set(codes.map(c => c.trim().toLowerCase()).filter(Boolean));

export function scoreOpportunity(profile:RecommendationProfile, opportunity:Opportunity, options:RankOptions)
  :{score:ScoreBreakdown; matched:MatchedTopics; futurePublication:boolean; publication:PublicationState} {
  const cfg = options.config ?? RANK_CONFIG_V1;
  const topics = onlyKnownTopics(opportunity.topicCodes);
  const job = onlyKnownTopics(profile.desiredJobTopics);
  const interest = onlyKnownTopics(profile.interestTopics);
  const experience = onlyKnownTopics(profile.approvedExperienceTopics);
  const J = coverage(job, topics);
  const I = coverage(interest, topics);
  const S = coverage(experience, topics);
  const studentLangs = lang(profile.approvedLanguageCodes);
  const L:0|1 = [...lang(opportunity.languageCodes)].some(c => studentLangs.has(c)) ? 1 : 0;
  const M:0|1 = onlyKnownTopics(profile.officialMajorTopics).some(t => topics.includes(t)) ? 1 : 0;
  const now = Date.parse(options.asOf);
  const publishedRaw = options.publishedAtBySnapshotId?.[opportunity.sourceSnapshotId];
  const published = publishedRaw === undefined ? NaN : Date.parse(publishedRaw);
  const futurePublication = Number.isFinite(published) && published > now;
  const F = !Number.isFinite(published) || futurePublication
    ? 0 : Math.max(0, 1 - (now - published) / DAY_MS / cfg.freshnessDays);
  const w = cfg.weights;
  const total = round6(w.J * J + w.I * I + w.S * S + w.L * L + w.M * M + w.F * F);
  return {
    score:{J:round6(J), I:round6(I), S:round6(S), L, M, F:round6(F), total},
    matched:{
      job:job.filter(t => topics.includes(t)),
      interest:interest.filter(t => topics.includes(t)),
      experience:experience.filter(t => topics.includes(t)),
    },
    futurePublication,
    publication:!Number.isFinite(published) ? 'UNKNOWN' : futurePublication ? 'FUTURE' : 'CONFIRMED',
  };
}

const deadlineKey = (r:RankedOpportunity) => {
  const t = r.evaluation.deadline === undefined ? NaN : Date.parse(r.evaluation.deadline);
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
};

/** A05.2-8: score desc → confirmed deadline asc (unknown last) → stable id. */
export function compareRanked(a:RankedOpportunity, b:RankedOpportunity):number {
  return (b.score.total - a.score.total) || (deadlineKey(a) - deadlineKey(b)) || byCodeUnit(a.opportunity.id, b.opportunity.id);
}

export function rankOpportunities(profile:RecommendationProfile, opportunities:readonly Opportunity[], options:RankOptions):RankedOpportunity[] {
  if (!Number.isFinite(Date.parse(options.asOf))) throw new RangeError('asOf must be an ISO datetime');
  return opportunities.map(opportunity => {
    const {score, matched, futurePublication, publication} = scoreOpportunity(profile, opportunity, options);
    return {
      opportunity,
      evaluation:evaluateOpportunity(profile, opportunity, options.asOf),
      score, matched, futurePublication, publication,
      relevant:score.J > 0 || score.I > 0 || score.S > 0,
    };
  }).sort(compareRanked);
}
