import {z} from 'zod';
import {ProviderCandidateSchema} from '../ai/provider-jobs.js';

/** Model output is a reviewable candidate, not an automatic owner approval.
 * Mutations still use the existing versioned tag-approval endpoint. */
export const ExperienceSkillCandidateResponseSchema=z.strictObject({
  experienceId:z.string().regex(/^[A-Za-z0-9_-]{1,90}$/),
  jobId:z.uuid(),contentVersion:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  consentVersion:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  state:z.literal('NEEDS_REVIEW'),candidate:ProviderCandidateSchema,
});
export type ExperienceSkillCandidateResponse=z.infer<typeof ExperienceSkillCandidateResponseSchema>;
