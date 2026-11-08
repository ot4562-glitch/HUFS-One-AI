/**
 * Explainable, offline-first ranking and routing: #344, #345, #347, #350.
 * No external AI call happens here: validated semantic candidates may be
 * provided by the model team later, without changing hard eligibility gates.
 */
import type {SourceState} from './eligibility.js';

const common = (left: readonly string[], right: readonly string[]): string[] =>
  [...new Set(left)].filter(value => right.includes(value)).sort();

function overlap(left: readonly string[], right: readonly string[]): number {
  const lhs = new Set(left), rhs = new Set(right);
  if (!lhs.size || !rhs.size) return 0;
  const intersection = [...lhs].filter(value => rhs.has(value)).length;
  return intersection / new Set([...lhs, ...rhs]).size;
}

export type MentorProfile = {
  majorCodes: readonly string[];
  desiredJobCodes: readonly string[];
  approvedExperienceTopics: readonly string[];
  preferredLanguage?: string;
  campus?: string;
};
export type MentorCandidate = {
  id: string;
  sourceState: SourceState;
  active: boolean;
  majorCodes: readonly string[];
  jobCodes: readonly string[];
  experienceTopics: readonly string[];
  languages: readonly string[];
  campuses: readonly string[];
};
export type RankedMentor = {
  id: string;
  ruleScore: number;
  matchingMajors: readonly string[];
  matchingJobs: readonly string[];
  matchingExperienceTopics: readonly string[];
  mode: 'RULE_ONLY';
};

export function rankMentors(profile: MentorProfile, mentors: readonly MentorCandidate[]): RankedMentor[] {
  const activeDimensions = [
    {weight: 0.35, active: profile.majorCodes.length > 0},
    {weight: 0.35, active: profile.desiredJobCodes.length > 0},
    {weight: 0.30, active: profile.approvedExperienceTopics.length > 0},
  ];
  const denominator = activeDimensions.filter(d => d.active).reduce((total, d) => total + d.weight, 0);
  return mentors.filter(m => m.active && m.sourceState === 'VERIFIED'
    && (!profile.preferredLanguage || m.languages.includes(profile.preferredLanguage))
    && (!profile.campus || m.campuses.includes(profile.campus)))
    .map(m => ({
      id: m.id,
      ruleScore: denominator ? (
        (profile.majorCodes.length ? 0.35 * overlap(profile.majorCodes, m.majorCodes) : 0)
        + (profile.desiredJobCodes.length ? 0.35 * overlap(profile.desiredJobCodes, m.jobCodes) : 0)
        + (profile.approvedExperienceTopics.length
          ? 0.30 * overlap(profile.approvedExperienceTopics, m.experienceTopics) : 0)
      ) / denominator : 0,
      matchingMajors: common(profile.majorCodes, m.majorCodes),
      matchingJobs: common(profile.desiredJobCodes, m.jobCodes),
      matchingExperienceTopics: common(profile.approvedExperienceTopics, m.experienceTopics),
      mode: 'RULE_ONLY' as const,
    })).sort((a, b) => b.ruleScore - a.ruleScore || a.id.localeCompare(b.id, 'en'));
}

export type CounselingRequest = {
  purposes: readonly string[];
  campus?: string;
  language?: string;
};
export type CounselingService = {
  id: string;
  sourceState: SourceState;
  active: boolean;
  purposes: readonly string[];
  relatedPurposes?: readonly string[];
  campuses: readonly string[];
  languages: readonly string[];
};
export type CounselingRoute = {id: string; score: number; matchedPurposes: readonly string[]};

export function routeCounseling(
  input: CounselingRequest,
  services: readonly CounselingService[],
): CounselingRoute[] {
  if (!input.purposes.length) return [];
  return services.filter(s => s.sourceState === 'VERIFIED' && s.active
    && (!input.campus || s.campuses.includes(input.campus))
    && (!input.language || s.languages.includes(input.language)))
    .map(s => {
      const exact = common(input.purposes, s.purposes);
      const related = common(input.purposes, s.relatedPurposes ?? []).filter(p => !exact.includes(p));
      return {id: s.id, score: 3 * exact.length + related.length,
        matchedPurposes: [...exact, ...related].sort()};
    }).filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id, 'en')).slice(0, 3);
}

export type JobRequirement = {
  id: string;
  topicCodes: readonly string[];
  sourceState: SourceState;
};
export type ApprovedExperience = {
  id: string;
  topicCodes: readonly string[];
  ownerApproved: boolean;
};
export type SkillGapRow = {
  requirementId: string;
  status: 'SUPPORTED_BY_EVIDENCE' | 'EVIDENCE_MISSING' | 'UNMAPPED' | 'NEEDS_REVIEW';
  matchingExperienceIds: readonly string[];
};
/** Missing a recorded experience never proves the student lacks the skill. */
export function compareJobRequirements(
  requirements: readonly JobRequirement[],
  experiences: readonly ApprovedExperience[],
): SkillGapRow[] {
  return requirements.map(requirement => {
    if (requirement.sourceState !== 'VERIFIED') {
      return {requirementId: requirement.id, status: 'NEEDS_REVIEW' as const, matchingExperienceIds: []};
    }
    if (!requirement.topicCodes.length) {
      return {requirementId: requirement.id, status: 'UNMAPPED' as const, matchingExperienceIds: []};
    }
    const matchingExperienceIds = experiences.filter(e => e.ownerApproved
      && common(e.topicCodes, requirement.topicCodes).length > 0).map(e => e.id).sort();
    return {requirementId: requirement.id,
      status: matchingExperienceIds.length ? 'SUPPORTED_BY_EVIDENCE' as const : 'EVIDENCE_MISSING' as const,
      matchingExperienceIds};
  });
}

export type LearningProfile = {
  goalTags: readonly string[];
  courseCodes: readonly string[];
  topicCodes: readonly string[];
  campus?: string;
  term?: string;
};
export type LearningProgram = {
  id: string;
  sourceState: SourceState;
  active: boolean;
  goalTags: readonly string[];
  courseCodes: readonly string[];
  topicCodes: readonly string[];
  campus?: string;
  term?: string;
  deadline?: string; // ISO datetime with explicit timezone
};
export type LearningRecommendation = {
  id: string;
  score: number;
  eligibility: 'MET' | 'UNKNOWN';
  reasons: readonly string[];
  mode: 'RULE_ONLY';
};

/** Eligibility constraints are never overridden by the model reranker. */
export function recommendLearningPrograms(
  profile: LearningProfile,
  programs: readonly LearningProgram[],
  asOf: string,
): LearningRecommendation[] {
  const at = Date.parse(asOf);
  if (!Number.isFinite(at)) throw new RangeError('invalid asOf');
  const dimensions = [
    {weight: 0.45, count: profile.goalTags.length},
    {weight: 0.35, count: profile.courseCodes.length},
    {weight: 0.20, count: profile.topicCodes.length},
  ];
  const denominator = dimensions.filter(d => d.count > 0).reduce((sum, d) => sum + d.weight, 0);
  return programs.filter(p => p.active && p.sourceState === 'VERIFIED'
    && (!p.campus || !profile.campus || p.campus === profile.campus)
    && (!p.term || !profile.term || p.term === profile.term)
    && (!p.deadline || (Number.isFinite(Date.parse(p.deadline)) && Date.parse(p.deadline) > at)))
    .map(p => {
      const goals = common(profile.goalTags, p.goalTags);
      const courses = common(profile.courseCodes, p.courseCodes);
      const topics = common(profile.topicCodes, p.topicCodes);
      const score = denominator ? (
        0.45 * (profile.goalTags.length ? overlap(profile.goalTags, p.goalTags) : 0)
        + 0.35 * (profile.courseCodes.length ? overlap(profile.courseCodes, p.courseCodes) : 0)
        + 0.20 * (profile.topicCodes.length ? overlap(profile.topicCodes, p.topicCodes) : 0)
      ) / denominator : 0;
      return {id: p.id, score, eligibility: p.campus && !profile.campus || p.term && !profile.term
        ? 'UNKNOWN' as const : 'MET' as const,
        reasons: [...goals.map(x => 'GOAL:' + x), ...courses.map(x => 'COURSE:' + x),
          ...topics.map(x => 'TOPIC:' + x)], mode: 'RULE_ONLY' as const};
    }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id, 'en'));
}
