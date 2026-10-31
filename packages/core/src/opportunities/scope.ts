import {SharedSectionSchema} from '@hufs-one/contracts';
import type {z} from 'zod';
import {byCodeUnit} from '../normalization/dedupe.js';
import type {NoticeStudent} from '../notices/notice.js';
import type {RecommendationProfile} from './evaluate.js';

export type SharedSection = z.infer<typeof SharedSectionSchema>;

export interface ScopedInputs {
  /** null when FEED is not shared: do not compose a feed at all. */
  profile:RecommendationProfile|null;
  /** null when NOTICES is not shared: do not compose notices at all. */
  noticeStudent:NoticeStudent|null;
  /** Deterministic key part for result caches (sorted shared sections), e.g. "ACADEMICS,FEED,NOTICES". */
  scopeKey:string;
  /** Inputs removed because their section was not shared (for audit / tests, never shown to viewers). */
  withheld:('EXPERIENCE_TOPICS'|'ACADEMIC_REQUIREMENTS'|'ACADEMIC_COURSES')[];
}

/**
 * Removes inputs from sections the viewer's grant does not cover, BEFORE ranking (PR #35 review / #39).
 * A derived result must not reveal an unshared section:
 * - EXPERIENCE not shared → approved experience topics are dropped (no S score, no EXPERIENCE_MATCH reason).
 * - ACADEMICS not shared → `openRequirementIds = null` (academic status unknown, so requirement notices keep
 *   an UNKNOWN badge instead of revealing which requirement is open) and course ids are dropped.
 * The API still enforces the grant itself; this only keeps the core from leaking through derived output.
 * Unknown section names fail closed (treated as not shared).
 */
export function scopeInputsToGrant(
  profile:RecommendationProfile, noticeStudent:NoticeStudent, sharedSections:readonly unknown[],
):ScopedInputs {
  const shared = new Set<SharedSection>();
  for (const s of sharedSections) {
    const parsed = SharedSectionSchema.safeParse(s);
    if (parsed.success) shared.add(parsed.data);
  }
  const withheld:ScopedInputs['withheld'] = [];
  let scopedProfile:RecommendationProfile|null = null;
  if (shared.has('FEED')) {
    scopedProfile = shared.has('EXPERIENCE') ? profile : {...profile, approvedExperienceTopics:[]};
    if (!shared.has('EXPERIENCE') && profile.approvedExperienceTopics.length > 0) withheld.push('EXPERIENCE_TOPICS');
  }
  let scopedStudent:NoticeStudent|null = null;
  if (shared.has('NOTICES')) {
    if (shared.has('ACADEMICS')) scopedStudent = noticeStudent;
    else {
      scopedStudent = {...noticeStudent, openRequirementIds:null, courseIds:[]};
      if (noticeStudent.openRequirementIds !== null) withheld.push('ACADEMIC_REQUIREMENTS');
      if (noticeStudent.courseIds.length > 0) withheld.push('ACADEMIC_COURSES');
    }
  }
  return {profile:scopedProfile, noticeStudent:scopedStudent, scopeKey:[...shared].sort(byCodeUnit).join(','), withheld};
}
