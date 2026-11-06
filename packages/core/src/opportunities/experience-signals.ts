import type {Opportunity, TopicCode} from '@hufs-one/contracts';
import {byCodeUnit} from '../normalization/dedupe.js';
import type {RecommendationProfile} from './evaluate.js';
import {composeFeed, type ComposeFeedOptions} from './feed.js';

/**
 * #259 experience → competency candidate → approved recommendation signal. Pure, deterministic core.
 *
 * Three layers stay separate and only the last one ever reaches ranking:
 *   1. EVIDENCE  — the student's own experience text (current contentVersion, active consent).
 *   2. CANDIDATE — an AI-proposed topic with a quoted span (always NEEDS_REVIEW; never a signal).
 *   3. APPROVED  — the student's explicit, current approval (ExperienceTagApproval ACTIVE, same
 *                  content/consent version). Only these topics become approvedExperienceTopics.
 *
 * A skill keyword is not a TopicCode. The mapping is an explicit, versioned table; skills with no topic
 * (e.g. 일정 조정, 고객 응대) are kept as evidence but give no recommendation signal. Nothing here
 * judges proficiency, a skill gap, hiring chances or eligibility.
 */
export const SKILL_TOPIC_POLICY_VERSION = 'skill-topic-v1';

interface KeywordRule {skill:string; keywords:readonly string[]; topic:TopicCode|null}
/** Lower-case, whitespace-free keywords. `topic:null` = a real skill with no TopicCode equivalent. */
export const SKILL_TOPIC_POLICY_V1:readonly KeywordRule[] = [
  {skill:'DATA_VISUALIZATION', keywords:['시각화', 'visualization', 'matplotlib', '대시보드'], topic:'DATA_ANALYTICS'},
  {skill:'PYTHON_PROGRAMMING', keywords:['python', '파이썬'], topic:'SOFTWARE_DEV'},
  {skill:'PROMOTION', keywords:['홍보', '마케팅', 'sns'], topic:'MARKETING_BRAND'},
  {skill:'CONTENT_PRODUCTION', keywords:['영상편집', '콘텐츠제작', '촬영'], topic:'MEDIA_CONTENT'},
  {skill:'TEACHING', keywords:['멘토링', '튜터', '가르쳤'], topic:'EDUCATION_TUTORING'},
  {skill:'SCHEDULING_COORDINATION', keywords:['일정조정', '일정을조정', '리허설일정'], topic:null},
  {skill:'CUSTOMER_SERVICE', keywords:['고객응대', '주문을받', '응대'], topic:null},
  {skill:'STORE_OPERATIONS', keywords:['재고', '매장운영', '카페운영'], topic:null},
];

/** A keyword inside a sentence with one of these markers is reported, never counted as evidence. */
// '안 했' is left out on purpose: it also matches inside words such as '불안했다'.
const NEGATION = ['못했', '않았', '없었', '취소되', '하지못', '포기했'];

export interface ExperienceEvidence {
  experienceId:string;
  contentVersion:number;
  consentVersion:number;
  /** ACTIVE = the owner's purpose consent is current. Anything else blocks every signal. */
  consent:'ACTIVE'|'REVOKED'|'MISSING';
  paragraphs:readonly {paragraphId:string; text:string}[];
}

/** One AI citation (mirrors ProviderCandidate citations). The AI never chooses the skill label. */
export interface CandidateCitation {paragraphId:string; quote:string; topicCode?:TopicCode}

export type CandidateCheck =
  | 'GROUNDED'           // quote is verbatim in the current paragraph and the policy maps a keyword in it to the topic
  | 'NO_TOPIC_MAPPING'   // quote is real and shows a skill, but the policy maps that skill to no TopicCode
  | 'OFF_POLICY'         // quote is real but has no keyword for the proposed topic (over-reach / hallucinated skill)
  | 'NEGATED'            // the only matching keyword sits in a negated sentence ("듣지 못했다")
  | 'UNGROUNDED_QUOTE'   // quote does not occur in that paragraph (fabricated or from another version)
  | 'UNKNOWN_PARAGRAPH'  // cited paragraph is not in the current content version
  | 'NO_TOPIC'           // citation proposes no topic
  | 'BLOCKED_CONSENT';   // consent is not ACTIVE: nothing is checked or shown as evidence

export interface CandidateAssessment {
  paragraphId:string; topicCode:TopicCode|null; check:CandidateCheck;
  /** Skills found in the quote by the policy (sorted), including topic-less ones. */
  skills:string[];
  /** Always NEEDS_REVIEW: an assessment is review material, never an approval. */
  reviewState:'NEEDS_REVIEW';
}

const norm = (s:string) => s.normalize('NFC').toLowerCase().replace(/\s+/gu, '');
const sentences = (text:string) => text.split(/(?<=[.!?。])\s+|\n+/u).map(s => s.trim()).filter(Boolean);

function skillHits(quote:string):{skill:string; topic:TopicCode|null; negated:boolean}[] {
  const hits = new Map<string, {skill:string; topic:TopicCode|null; negated:boolean}>();
  for (const sentence of sentences(quote)) {
    const n = norm(sentence);
    const negated = NEGATION.some(m => n.includes(norm(m)));
    for (const rule of SKILL_TOPIC_POLICY_V1) {
      if (!rule.keywords.some(k => n.includes(k))) continue;
      const prev = hits.get(rule.skill);
      // A skill counts as affirmed if any sentence affirms it.
      hits.set(rule.skill, {skill:rule.skill, topic:rule.topic, negated:prev ? prev.negated && negated : negated});
    }
  }
  return [...hits.values()].sort((a, b) => byCodeUnit(a.skill, b.skill));
}

/** Checks each AI citation against the student's current text and the keyword policy. Order-independent. */
export function assessSkillCandidates(experience:ExperienceEvidence, citations:readonly CandidateCitation[]):CandidateAssessment[] {
  const byParagraph = new Map(experience.paragraphs.map(p => [p.paragraphId, p.text]));
  const out = citations.map((c):CandidateAssessment => {
    const base = {paragraphId:c.paragraphId, topicCode:c.topicCode ?? null, reviewState:'NEEDS_REVIEW' as const};
    if (experience.consent !== 'ACTIVE') return {...base, check:'BLOCKED_CONSENT', skills:[]};
    const text = byParagraph.get(c.paragraphId);
    if (text === undefined) return {...base, check:'UNKNOWN_PARAGRAPH', skills:[]};
    if (!c.quote.trim() || !norm(text).includes(norm(c.quote))) return {...base, check:'UNGROUNDED_QUOTE', skills:[]};
    const hits = skillHits(c.quote);
    const skills = hits.map(h => h.skill);
    if (c.topicCode === undefined) return {...base, check:'NO_TOPIC', skills};
    const forTopic = hits.filter(h => h.topic === c.topicCode);
    if (forTopic.some(h => !h.negated)) return {...base, check:'GROUNDED', skills};
    if (forTopic.length > 0) return {...base, check:'NEGATED', skills};
    if (hits.some(h => !h.negated && h.topic === null)) return {...base, check:'NO_TOPIC_MAPPING', skills};
    return {...base, check:'OFF_POLICY', skills};
  });
  return out.sort((a, b) => byCodeUnit(a.paragraphId, b.paragraphId) || byCodeUnit(a.topicCode ?? '', b.topicCode ?? '') || byCodeUnit(a.check, b.check));
}

/** Structural subset of contracts ExperienceTagApproval. */
export type TagApproval =
  | {state:'ACTIVE'; version:number; contentVersion:number; consentVersion:number; topics:readonly TopicCode[]}
  | {state:'INACTIVE'; version:number; reason:'NOT_APPROVED'|'STALE'|'REVOKED'|'CONSENT_REQUIRED'|'NOT_FOUND'};

export type SignalBlock = 'NOT_APPROVED'|'APPROVAL_INACTIVE'|'CONSENT_NOT_ACTIVE'|'STALE_CONTENT'|'STALE_CONSENT';
export interface ExperienceSignal {experienceId:string; topics:TopicCode[]; blocked?:SignalBlock}

/** Only a current ACTIVE approval on the current content and consent becomes a signal; otherwise none. */
export function approvedExperienceSignal(experience:ExperienceEvidence, approval:TagApproval|undefined):ExperienceSignal {
  const none = (blocked:SignalBlock):ExperienceSignal => ({experienceId:experience.experienceId, topics:[], blocked});
  if (experience.consent !== 'ACTIVE') return none('CONSENT_NOT_ACTIVE');
  if (!approval) return none('NOT_APPROVED');
  if (approval.state !== 'ACTIVE') return none('APPROVAL_INACTIVE');
  if (approval.contentVersion !== experience.contentVersion) return none('STALE_CONTENT');
  if (approval.consentVersion !== experience.consentVersion) return none('STALE_CONSENT');
  return {experienceId:experience.experienceId, topics:[...new Set(approval.topics)].sort(byCodeUnit)};
}

/** Replaces approvedExperienceTopics with the union of current signals (AI candidates never included). */
export function withApprovedExperience(profile:RecommendationProfile, signals:readonly ExperienceSignal[]):RecommendationProfile {
  const topics = [...new Set(signals.flatMap(s => s.topics))].sort(byCodeUnit);
  return {...profile, approvedExperienceTopics:topics};
}

export interface ComplementSuggestion {
  policyVersion:string;
  /** Desired job topics that no current approved experience covers yet: optional ideas, not a deficit. */
  optionalTopics:TopicCode[];
  /** Visible feed items on those topics, in feed order (max 3). Eligibility is the code result, unchanged. */
  opportunities:{id:string; topics:TopicCode[]; eligibility:'ELIGIBLE'|'INELIGIBLE'|'UNKNOWN'}[];
  /** NOT_RUN until independent gold exists (#61): no accuracy is claimed for these suggestions. */
  accuracy:'NOT_RUN';
}

export function complementSuggestions(
  profile:RecommendationProfile, signals:readonly ExperienceSignal[], opportunities:readonly Opportunity[], options:ComposeFeedOptions,
):ComplementSuggestion {
  const merged = withApprovedExperience(profile, signals);
  const covered = new Set(merged.approvedExperienceTopics);
  const optionalTopics = [...new Set(profile.desiredJobTopics)].filter(t => !covered.has(t)).sort(byCodeUnit);
  const wanted = new Set(optionalTopics);
  const feed = composeFeed(merged, opportunities, options);
  const picks = feed.all.filter(r => r.opportunity.topicCodes.some(t => wanted.has(t))).slice(0, 3);
  return {
    policyVersion:SKILL_TOPIC_POLICY_VERSION,
    optionalTopics,
    opportunities:picks.map(r => ({
      id:r.opportunity.id, topics:r.opportunity.topicCodes.filter(t => wanted.has(t)), eligibility:r.evaluation.eligibility,
    })),
    accuracy:'NOT_RUN',
  };
}
