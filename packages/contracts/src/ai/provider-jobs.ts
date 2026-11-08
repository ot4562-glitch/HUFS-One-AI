import {z} from 'zod';
// Keep the four tasks byte-equivalent to AI_TASK_PATHS in index.ts.
const Task=z.enum(['experience_skills','opportunity_terms','personal_action_brief','graduation_explanation']);
import {TopicCodeSchema} from '../topics/index.js';
import {AiTaskResultSchema,hasValidAiTaskResultBindings} from './task-results.js';

/** Server-approved metadata, not original packet/media, data rights or a price quote. */
export const ApprovedProviderInputSchema=z.strictObject({
  inputRef:z.string().regex(/^[A-Za-z0-9_-]{1,90}$/),
  operation:z.literal('HCX_007'),
  task:Task,
  asOf:z.iso.datetime({offset:true}),
  expiresAt:z.iso.datetime({offset:true}),
}).refine(item=>Date.parse(item.asOf)<Date.parse(item.expiresAt));
export const ApprovedProviderInputsSchema=z.strictObject({
  items:z.array(ApprovedProviderInputSchema).max(16),
}).refine(page=>new Set(page.items.map(i=>[i.operation,i.inputRef].join(':'))).size===page.items.length);
export const ProviderRunRequestSchema=z.strictObject({
  packetRef:z.string().regex(/^[A-Za-z0-9_-]{1,90}$/),
  idempotencyKey:z.string().regex(/^[A-Za-z0-9_-]{8,100}$/),
  asOf:z.iso.datetime({offset:true}),
});
export const ProviderAcceptedSchema=z.discriminatedUnion('state',[
  z.strictObject({jobId:z.uuid(),state:z.literal('PENDING')}),
  z.strictObject({jobId:z.uuid(),state:z.literal('NEEDS_REVIEW'),
    provenance:z.enum(['LIVE','CANDIDATE_CACHE'])}),
]);
export const ProviderCandidateSchema=z.strictObject({
  task:Task,reviewRequired:z.literal(true),reviewState:z.literal('NEEDS_REVIEW'),
  citations:z.array(z.strictObject({
    sourceToken:z.string().min(1).max(128),
    paragraphId:z.string().min(1).max(128),
    quote:z.string().min(1).max(600),
    topicCode:TopicCodeSchema.optional(),
  })).min(1).max(6),
  objectTokens:z.array(z.string().min(1).max(128)).max(3),
  result:AiTaskResultSchema.optional(),
  usage:z.strictObject({
    promptTokens:z.number().int().positive().max(128000),
    completionTokens:z.number().int().positive().max(4096),
    totalTokens:z.number().int().positive().max(128000),
  }).refine(u => u.totalTokens === u.promptTokens + u.completionTokens),
}).refine(hasValidAiTaskResultBindings);
export const ProviderStoredJobSchema=z.strictObject({
  jobId:z.uuid(),state:z.literal('NEEDS_REVIEW'),billing:z.literal('SETTLED'),
  provenance:z.literal('CANDIDATE_CACHE'),candidate:ProviderCandidateSchema,
});
export type ApprovedProviderInput=z.infer<typeof ApprovedProviderInputSchema>;
export type ApprovedProviderInputs=z.infer<typeof ApprovedProviderInputsSchema>;
export type ProviderRunRequest=z.infer<typeof ProviderRunRequestSchema>;
export type ProviderAccepted=z.infer<typeof ProviderAcceptedSchema>;
export type ProviderStoredJob=z.infer<typeof ProviderStoredJobSchema>;
