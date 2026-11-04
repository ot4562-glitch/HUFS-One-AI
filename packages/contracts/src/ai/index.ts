import {z} from 'zod';
import {TopicCodeSchema} from '../topics/index.js';

// A06.3: only these FOUR tasks are part of the product; RulePack drafting is separate.
export const AI_TASK_PATHS = {
  'experience-skills':'experience_skills',
  'opportunity-terms':'opportunity_terms',
  'personal-action-brief':'personal_action_brief',
  'graduation-explanation':'graduation_explanation',
} as const;
export const AiTaskPathSchema=z.enum(Object.keys(AI_TASK_PATHS) as [keyof typeof AI_TASK_PATHS,...(keyof typeof AI_TASK_PATHS)[]]);
export const AiTaskSchema=z.enum(Object.values(AI_TASK_PATHS) as [(typeof AI_TASK_PATHS)[keyof typeof AI_TASK_PATHS],...(typeof AI_TASK_PATHS)[keyof typeof AI_TASK_PATHS][]]);
export type AiTask = z.infer<typeof AiTaskSchema>;
export type AiTaskPath = z.infer<typeof AiTaskPathSchema>;

export const SafeLlmPacketSchema=z.strictObject({
  packetId:z.string().min(1), // opaque request-local token, NEVER actor/subject id
  task:AiTaskSchema,
  providerInputClass:z.enum(['PUBLIC_CLEARED','SYNTHETIC_CLEARED','NON_IDENTIFYING_REVIEWED']),
  sourceTokens:z.array(z.strictObject({
    token:z.string().min(1),paragraphs:z.array(z.strictObject({id:z.string().min(1),text:z.string().min(1)})).max(20),
  })).max(20),
  allowedTopicCodes:z.array(TopicCodeSchema),
  allowedObjectTokens:z.array(z.string().min(1)),
  approvedFacts:z.array(z.strictObject({
    token:z.string().min(1),key:z.string().min(1),value:z.union([z.string(),z.number(),z.boolean()]),
  })),
  schemaVersion:z.string().min(1),promptVersion:z.string().min(1),
});
export type SafeLlmPacket = z.infer<typeof SafeLlmPacketSchema>;

/** Runtime schema is necessary, NOT sufficient: the API must perform privacy/permission review. */
export function parseSafeLlmPacket(value:unknown): SafeLlmPacket {
  return SafeLlmPacketSchema.parse(value);
}

/** Approved input and Provider job wire DTOs. No opt-in or billing approval. */
export * from './provider-jobs.js';
