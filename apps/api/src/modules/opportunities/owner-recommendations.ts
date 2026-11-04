import {OpportunitySchema,TopicCodeSchema} from '@hufs-one/contracts';
import type {Opportunity,TopicCode} from '@hufs-one/contracts';
import {composeFeed} from '../../../../../packages/core/src/opportunities/feed.js';
import {explainNotFeatured} from '../../../../../packages/core/src/opportunities/not-featured.js';
import type {RecommendationProfile} from '../../../../../packages/core/src/opportunities/evaluate.js';

export const OWNER_RECOMMENDATION_CORE_VERSION='owner-recommendation-v1';
export class OwnerRecommendationVersionConflict extends Error {
  constructor(){super('Owner recommendation snapshot changed');}
}

/** Consumes server-authorized owner inputs only. Authorization and fresh SQL
 * revalidation belong to the adapter; this reuses both existing core functions.
 * A self-selected topic is a relevance signal, never a certified language,
 * academic/eligibility fact or an official major-to-topic mapping. */
export function computeOwnerRecommendations(input:{asOf:string;interestTopics:readonly TopicCode[];
  desiredJobTopics:readonly TopicCode[];approvedExperienceTopics:readonly TopicCode[];
  verifiedFacts?:RecommendationProfile['facts'];
  opportunities:readonly Opportunity[];publishedAtBySnapshotId:Readonly<Record<string,string|undefined>>}){
  const topics=TopicCodeSchema.array().max(24);
  const profile={interestTopics:topics.parse(input.interestTopics),desiredJobTopics:topics.parse(input.desiredJobTopics),
    approvedExperienceTopics:topics.parse(input.approvedExperienceTopics),approvedLanguageCodes:[],officialMajorTopics:[],facts:input.verifiedFacts??{}};
  if(input.opportunities.length>500)throw new Error('Owner recommendation catalog exceeds bound');
  const opportunities=input.opportunities.map(item=>OpportunitySchema.parse(item));
  if(new Set(opportunities.map(item=>item.id)).size!==opportunities.length)throw new Error('Ambiguous owner recommendation catalog');
  const options={asOf:input.asOf,publishedAtBySnapshotId:input.publishedAtBySnapshotId};
  const composed=composeFeed(profile,opportunities,options),report=explainNotFeatured(profile,opportunities,options);
  if(JSON.stringify(report.featuredIds)!==JSON.stringify(composed.feed.featured.map(card=>card.opportunityId)))
    throw new Error('Owner feed and explanation core disagree');
  return {feed:composed.feed,rankConfigVersion:composed.rankConfigVersion,report};
}
