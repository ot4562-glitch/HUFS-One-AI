import {z} from 'zod';

const Id=z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/);
const AsOf=z.iso.datetime({offset:true});
const Term=z.string().regex(/^\d{4}-(?:1|S|2|W)$/);
const Course=z.discriminatedUnion('state',[
  z.strictObject({canonicalCourseId:Id,state:z.enum(['TAKEN','IN_PROGRESS']),term:Term}),
  z.strictObject({canonicalCourseId:Id,
    state:z.enum(['PLANNED_ONLY','NEEDS_REVIEW','RECOGNITION_PENDING','RECOGNITION_EXCLUDED'])}),
]);
const Link=z.discriminatedUnion('state',[
  z.strictObject({experienceId:Id,canonicalCourseId:Id,state:z.literal('LINKED'),
    course:z.enum(['TAKEN','IN_PROGRESS']),term:Term}),
  z.strictObject({experienceId:Id,canonicalCourseId:Id,state:z.literal('NOT_LINKED'),
    reason:z.enum(['NOT_CONFIRMED','EXPERIENCE_NOT_FOUND','STALE','NOT_IN_TRANSCRIPT',
      'PLANNED_ONLY','NEEDS_REVIEW','RECOGNITION_PENDING','RECOGNITION_EXCLUDED'])}),
]);

/** Read-only, authenticated BETA owner projection. No grades/GPA/school-verified claims.
 * NOT_SHARED and NEEDS_REVIEW have no course arrays: they must not mean zero courses. */
export const OwnerExperienceCourseResponseSchema=z.discriminatedUnion('state',[
  z.strictObject({state:z.literal('NOT_CONNECTED'),asOf:AsOf}),
  z.strictObject({state:z.literal('NOT_SHARED'),asOf:AsOf}),
  z.strictObject({state:z.literal('NEEDS_REVIEW'),asOf:AsOf}),
  z.strictObject({state:z.literal('SHARED'),asOf:AsOf,
    basis:z.literal('STUDENT_SUBMITTED_TRANSCRIPT'),transcriptVersion:Id,
    courses:z.array(Course).max(2000),links:z.array(Link).max(1000)}),
]);
export type OwnerExperienceCourseResponse=z.infer<typeof OwnerExperienceCourseResponseSchema>;
