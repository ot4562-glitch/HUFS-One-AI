/** #366: bounded owner-only outputs from existing reviewed pure cores, never institutional rulings. */
import {z} from 'zod';
import {
  MentorRankingV2Schema,RecognitionReportV2Schema,SkillRowV2Schema,
  LearningRankingV2Schema,EmploymentValueV2Schema,GuideResolutionV2Schema,
} from './results.js';

const Id=z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/);
const Iso=z.iso.datetime({offset:true});
export const OwnerInsightsKindSchema=z.enum([
  'MENTORS','RECOGNITION','SKILLS','LEARNING','EMPLOYMENT','INTERNATIONAL',
]);
export type OwnerInsightsKind=z.infer<typeof OwnerInsightsKindSchema>;
const Outputs=z.discriminatedUnion('kind',[
  z.strictObject({kind:z.literal('MENTORS'),ranking:MentorRankingV2Schema}),
  z.strictObject({kind:z.literal('RECOGNITION'),
    reports:z.array(RecognitionReportV2Schema).max(25)}),
  z.strictObject({kind:z.literal('SKILLS'),
    rows:z.array(SkillRowV2Schema).max(100)}),
  z.strictObject({kind:z.literal('LEARNING'),ranking:LearningRankingV2Schema}),
  z.strictObject({kind:z.literal('EMPLOYMENT'),
    comparable:z.boolean(),
    reason:z.enum(['COMPATIBLE','EMPTY','DIFFERENT_SOURCE','DIFFERENT_DEFINITION','UNPUBLISHABLE']),
    rows:z.array(EmploymentValueV2Schema).max(50)}),
  z.strictObject({kind:z.literal('INTERNATIONAL'),
    guides:z.array(GuideResolutionV2Schema).max(25)}),
]);
export const OwnerInsightsResponseSchema=z.discriminatedUnion('state',[
  z.strictObject({state:z.literal('NOT_CONNECTED'),kind:OwnerInsightsKindSchema,asOf:Iso}),
  z.strictObject({state:z.literal('READY'),asOf:Iso,sourceVersion:Id,
    result:Outputs}),
]);
export type OwnerInsightsResponse=z.infer<typeof OwnerInsightsResponseSchema>;
