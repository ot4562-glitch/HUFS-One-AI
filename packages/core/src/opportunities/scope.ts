import {SharedSectionSchema} from '@hufs-one/contracts';
import type {z} from 'zod';
import {byCodeUnit} from '../normalization/dedupe.js';
import type {NoticeStudent} from '../notices/notice.js';
import type {ConditionField, FactValue, RecommendationProfile} from './evaluate.js';

export type SharedSection = z.infer<typeof SharedSectionSchema>;

/** Student scope fields used by notice applicability (A07.2-1). */
export type NoticeScopeField = 'campus'|'college'|'majors'|'cohort'|'enrollmentState'|'admissionType';

/**
 * Which shared section each input came from. Anything not declared is treated as ACADEMICS-derived
 * (fail closed): it is withheld unless ACADEMICS is shared. The API declares the real provenance,
 * e.g. `{noticeScope:{campus:'FEED'}}` when campus came from the student's own preferences.
 */
export interface InputProvenance {
  noticeScope?:Partial<Record<NoticeScopeField, SharedSection>>;
  facts?:Partial<Record<ConditionField, SharedSection>>;
}

export type WithheldInput =
  | 'EXPERIENCE_TOPICS'      // EXPERIENCE not shared
  | 'INTEREST_TOPICS'        // FEED (preferences) not shared → notices must not show interests
  | 'ACADEMIC_REQUIREMENTS' | 'ACADEMIC_COURSES' | 'GRADUATION_TERM' | 'OFFICIAL_MAJOR_TOPICS'
  | `NOTICE_SCOPE:${NoticeScopeField}` | `FACT:${ConditionField}`;

export interface ScopedInputs {
  /** null when FEED is not shared: do not compose a feed at all. */
  profile:RecommendationProfile|null;
  /** null when NOTICES is not shared: do not compose notices at all. */
  noticeStudent:NoticeStudent|null;
  /** Deterministic key part for result caches (sorted shared sections), e.g. "ACADEMICS,FEED,NOTICES". */
  scopeKey:string;
  /** Inputs removed because their section was not shared (for audit / tests, never shown to viewers). */
  withheld:WithheldInput[];
}

const NOTICE_SCOPE_FIELDS:readonly NoticeScopeField[] = ['campus', 'college', 'majors', 'cohort', 'enrollmentState', 'admissionType'];

/**
 * Removes inputs from sections the viewer's grant does not cover, BEFORE ranking (PR #35 / #49 reviews, #39).
 * A derived result must not reveal an unshared section:
 * - EXPERIENCE not shared → approved experience topics dropped (no S score, no EXPERIENCE_MATCH reason).
 * - FEED not shared → no feed, and the notice student's interest topics are dropped (no topic-based
 *   PERSONAL_OPPORTUNITY revealing preferences).
 * - ACADEMICS not shared → requirement/course links, graduation term (+ verification) and official major
 *   topics dropped; every notice scope field and eligibility fact not declared as coming from a shared
 *   section is dropped. Dropped values become UNKNOWN downstream; nothing is promoted to ELIGIBLE.
 * The API still enforces the grant itself; this only keeps the core from leaking through derived output.
 * Unknown section names fail closed (treated as not shared).
 */
export function scopeInputsToGrant(
  profile:RecommendationProfile, noticeStudent:NoticeStudent, sharedSections:readonly unknown[],
  provenance:InputProvenance = {},
):ScopedInputs {
  const shared = new Set<SharedSection>();
  for (const s of sharedSections) {
    const parsed = SharedSectionSchema.safeParse(s);
    if (parsed.success) shared.add(parsed.data);
  }
  const visible = (source:SharedSection|undefined) => shared.has(source ?? 'ACADEMICS');
  const withheld:WithheldInput[] = [];
  const academics = shared.has('ACADEMICS');

  let scopedProfile:RecommendationProfile|null = null;
  if (shared.has('FEED')) {
    const facts:Partial<Record<ConditionField, FactValue>> = {};
    for (const [field, value] of Object.entries(profile.facts) as [ConditionField, FactValue|undefined][]) {
      if (value === undefined) continue;
      if (visible(provenance.facts?.[field])) facts[field] = value;
      else withheld.push(`FACT:${field}`);
    }
    if (!shared.has('EXPERIENCE') && profile.approvedExperienceTopics.length > 0) withheld.push('EXPERIENCE_TOPICS');
    if (!academics && profile.officialMajorTopics.length > 0) withheld.push('OFFICIAL_MAJOR_TOPICS');
    scopedProfile = {
      ...profile,
      approvedExperienceTopics:shared.has('EXPERIENCE') ? profile.approvedExperienceTopics : [],
      officialMajorTopics:academics ? profile.officialMajorTopics : [],
      facts,
    };
  }

  let scopedStudent:NoticeStudent|null = null;
  if (shared.has('NOTICES')) {
    const s:NoticeStudent = {
      openRequirementIds:academics ? noticeStudent.openRequirementIds : null,
      courseIds:academics ? noticeStudent.courseIds : [],
      interestTopics:shared.has('FEED') ? noticeStudent.interestTopics : [],
    };
    if (!academics && noticeStudent.openRequirementIds !== null) withheld.push('ACADEMIC_REQUIREMENTS');
    if (!academics && noticeStudent.courseIds.length > 0) withheld.push('ACADEMIC_COURSES');
    if (!shared.has('FEED') && noticeStudent.interestTopics.length > 0) withheld.push('INTEREST_TOPICS');
    if (academics) {
      if (noticeStudent.targetGraduationTerm !== undefined) s.targetGraduationTerm = noticeStudent.targetGraduationTerm;
      if (noticeStudent.graduationTermVerified !== undefined) s.graduationTermVerified = noticeStudent.graduationTermVerified;
    } else if (noticeStudent.targetGraduationTerm !== undefined || noticeStudent.graduationTermVerified !== undefined) {
      withheld.push('GRADUATION_TERM');
    }
    for (const field of NOTICE_SCOPE_FIELDS) {
      if (noticeStudent[field] === undefined) continue;
      if (visible(provenance.noticeScope?.[field])) Object.assign(s, {[field]:noticeStudent[field]});
      else withheld.push(`NOTICE_SCOPE:${field}`);
    }
    scopedStudent = s;
  }
  // Provenance changes what is withheld, so it is part of the cache scope too.
  const prov = [
    ...Object.entries(provenance.noticeScope ?? {}).map(([k, v]) => `scope.${k}=${v}`),
    ...Object.entries(provenance.facts ?? {}).map(([k, v]) => `fact.${k}=${v}`),
  ].sort(byCodeUnit);
  const scopeKey = [...shared].sort(byCodeUnit).join(',') + (prov.length ? `;${prov.join(',')}` : '');
  return {profile:scopedProfile, noticeStudent:scopedStudent, scopeKey, withheld};
}
