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

/** Owner chooses only their own existing approved experience inputs.
 * Missing/unreviewed cards are reported as unavailable, never auto-approved. */
export const ExperienceSkillPrepareRequestSchema=z.strictObject({
  experienceIds:z.array(z.string().regex(/^[A-Za-z0-9_-]{1,90}$/)).min(1).max(16)
    .refine(ids=>new Set(ids).size===ids.length),
});
export const ExperienceSkillPrepareResponseSchema=z.strictObject({
  items:z.array(z.strictObject({experienceId:z.string().regex(/^[A-Za-z0-9_-]{1,90}$/),
    inputRef:z.string().regex(/^[A-Za-z0-9_-]{1,90}$/),operation:z.literal('HCX_007'),
    asOf:z.iso.datetime({offset:true}),expiresAt:z.iso.datetime({offset:true}),
    contentVersion:z.number().int().positive(),consentVersion:z.number().int().positive(),
  })).max(16),
  unavailable:z.array(z.string().regex(/^[A-Za-z0-9_-]{1,90}$/)).max(16),
}).superRefine((value,ctx)=>{
  const all=[...value.items.map(x=>x.experienceId),...value.unavailable];
  if(new Set(all).size!==all.length)ctx.addIssue({code:'custom',message:'Ambiguous owner selection'});
});
export type ExperienceSkillPrepareResponse=z.infer<typeof ExperienceSkillPrepareResponseSchema>;
