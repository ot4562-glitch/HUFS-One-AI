import {z} from 'zod';
import {CourseRecordSchema} from '../academics/index.js';
import {IntakeIssueCodeSchema} from '../intake/index.js';

/** Owner-only review of attested intake. These answers are self-reported, not verified academic facts. */
const Answer=z.string().max(4000);
export const PrivateOwnerIntakeProfileSchema=z.strictObject({
  primaryMajor:Answer,secondaryMajor:Answer.nullable(),secondaryType:Answer,campus:Answer,cohort:Answer,
  earnedCreditsSelfReported:Answer,inProgressCreditsSelfReported:Answer,interestsSelfReported:Answer,
});
export const PrivateOwnerIntakeTranscriptSchema=z.strictObject({
  state:z.enum(['STUDENT_REVIEW_PENDING','NEEDS_REVIEW']),version:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  records:z.array(CourseRecordSchema).max(500),
  issueCodes:z.array(IntakeIssueCodeSchema).max(17).refine(codes=>new Set(codes).size===codes.length),
}).refine(t=>t.records.every(record=>record.ledger!=='PLANNED'),{
  path:['records'],message:'Restricted intake is an earned/in-progress transcript, not a study plan',
}).refine(t=>t.state==='NEEDS_REVIEW'?t.records.length===0&&t.issueCodes.length>0:t.issueCodes.length===0,
  {message:'Malformed transcripts must remain empty with explicit issues; valid transcripts cannot carry parse issues'});
/** Deliberately excludes actor, identity mapping, storage namespace, registry and raw-source fingerprints. */
export const PrivateOwnerIntakeResponseSchema=z.strictObject({
  state:z.literal('STUDENT_REVIEW_PENDING'),profile:PrivateOwnerIntakeProfileSchema,
  transcript:PrivateOwnerIntakeTranscriptSchema,offeringStatus:z.literal('UNKNOWN'),rulesStatus:z.literal('NEEDS_REVIEW'),
});
export type PrivateOwnerIntakeResponse=z.infer<typeof PrivateOwnerIntakeResponseSchema>;
