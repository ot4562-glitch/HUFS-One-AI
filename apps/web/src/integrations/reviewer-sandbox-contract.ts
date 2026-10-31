import {z} from 'zod';
import {
  DesiredJobTopicsSchema, InterestTopicsSchema, SubjectAliasSchema,
} from '@hufs-one/contracts';

/**
 * Public synthetic-only action DTO, matching the server owner of
 * apps/api/src/modules/auth/reviewer-sandbox.ts.
 * This is frontend validation only; the server MUST recheck actor, invitation,
 * context, CSRF and allowed action on every request.
 * Keep tests/consumers/reviewer-sandbox-parity.test.ts as a drift detector
 * until the backend schema is promoted into the shared contract package.
 */
const SyntheticId=z.string().regex(/^SYN-[A-Z0-9_-]{1,70}$/);
export const ReviewerSandboxClientActionSchema=z.discriminatedUnion('kind',[
  z.strictObject({kind:z.literal('BOOKMARK'),itemId:SyntheticId,saved:z.boolean()}),
  z.strictObject({kind:z.literal('MARK_READ'),itemId:SyntheticId,read:z.boolean()}),
  z.strictObject({kind:z.literal('CHECKLIST'),requirementId:SyntheticId,done:z.boolean()}),
  z.strictObject({kind:z.literal('EXPERIENCE'),experienceId:SyntheticId,note:z.string().max(280)}),
  z.strictObject({kind:z.literal('APPLICATION_DRAFT'),opportunityId:SyntheticId,text:z.string().max(1200)}),
  z.strictObject({kind:z.literal('SIMULATE_APPLICATION'),opportunityId:SyntheticId}),
  z.strictObject({kind:z.literal('SET_INTERESTS'),topics:InterestTopicsSchema}),
  z.strictObject({kind:z.literal('SET_DESIRED_JOBS'),topics:DesiredJobTopicsSchema}),
  z.strictObject({kind:z.literal('PLAN_COURSE'),courseId:SyntheticId,planned:z.boolean()}),
  z.strictObject({kind:z.literal('SET_SEARCH'),query:z.string().trim().max(100)}),
  z.strictObject({kind:z.literal('SET_NOTIFICATIONS'),enabled:z.boolean()}),
  z.strictObject({kind:z.literal('RESET_SANDBOX')}),
]);
export type ReviewerSandboxClientAction=z.infer<typeof ReviewerSandboxClientActionSchema>;

export const ReviewerSandboxClientResultSchema=z.strictObject({
  subjectId:SubjectAliasSchema,
  mode:z.literal('SYNTHETIC_SANDBOX'),
  actions:z.array(ReviewerSandboxClientActionSchema).max(200),
});
export type ReviewerSandboxClientResult=z.infer<typeof ReviewerSandboxClientResultSchema>;
