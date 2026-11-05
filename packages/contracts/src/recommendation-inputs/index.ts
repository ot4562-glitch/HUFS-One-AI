import {z} from 'zod';
import {EligibilityConditionSchema} from '../corpus/index.js';
import {TopicCodeSchema,type TopicCode} from '../topics/index.js';
import {ISODateTimeSchema} from '../identity/index.js';

// Private server input contracts. Parsing validates shape, never source rights,
// approval, identity or consent. Call only after the corresponding authority gate.
const Ref=z.string().min(1).max(200).regex(/^[A-Za-z0-9_.:@-]+$/);
const Label=z.string().min(1).max(500);
const Refs=z.array(Ref).max(400);
const Topics=z.array(TopicCodeSchema).max(24);
export const NoticeMajorRoleInputSchema=z.enum(['PRIMARY','DOUBLE','MINOR']);
export type NoticeMajorRoleInput=z.infer<typeof NoticeMajorRoleInputSchema>;
const Major=z.strictObject({major:Label,role:NoticeMajorRoleInputSchema});
export const RecommendationFactInputSchema=z.union([
  z.string().max(500),z.number().finite(),z.boolean(),z.array(z.string().max(500)).max(100),
]);
export const RecommendationProfileInputSchema=z.strictObject({
  interestTopics:Topics,desiredJobTopics:Topics,approvedExperienceTopics:Topics,
  approvedLanguageCodes:z.array(Label).max(24),officialMajorTopics:Topics,
  facts:z.partialRecord(EligibilityConditionSchema.shape.field,RecommendationFactInputSchema),
});
export const NoticeStudentInputSchema=z.strictObject({
  campus:Label.optional(),college:Label.optional(),majors:z.array(Major).max(16).optional(),
  cohort:z.number().int().min(1900).max(2200).optional(),enrollmentState:Label.optional(),admissionType:Label.optional(),
  targetGraduationTerm:z.string().regex(/^\d{4}-[12]$/).optional(),graduationTermVerified:z.boolean().optional(),
  openRequirementIds:Refs.nullable(),courseIds:Refs,interestTopics:Topics,
});
export const NoticeInputSchema=z.strictObject({
  id:Ref,sourceSnapshotId:Ref,title:Label,issuer:Label,
  category:z.enum(['ACADEMIC','SCHOLARSHIP','EXCHANGE','CAREER','GENERAL']),
  campus:Label.optional(),college:Label.optional(),majors:z.array(Label).max(32).optional(),
  majorRoles:z.array(NoticeMajorRoleInputSchema).max(3).optional(),
  cohortRange:z.strictObject({min:z.number().int().optional(),max:z.number().int().optional()}).optional(),
  enrollmentStates:z.array(Label).max(32).optional(),admissionTypes:z.array(Label).max(32).optional(),
  graduationTermScope:Refs.optional(),requirementRefs:Refs.optional(),courseRefs:Refs.optional(),
  topicCodes:Topics.optional(),scholarshipConditions:z.array(Label).max(32).optional(),
  studentDeadline:ISODateTimeSchema.optional(),adminReportDeadline:ISODateTimeSchema.optional(),
  publishedAt:ISODateTimeSchema.optional(),validUntil:ISODateTimeSchema.optional(),
  eventSessions:z.array(z.strictObject({start:ISODateTimeSchema,end:ISODateTimeSchema.optional()})).max(40).optional(),
  verificationState:z.enum(['CANDIDATE','VERIFIED','NEEDS_REVIEW','REJECTED']),evidenceRefs:Refs,
});

// Readonly collections keep pure-core callers compatible with immutable input.
// Runtime boundaries use the schemas above; facts absent from input stay UNKNOWN.
export interface RecommendationProfileInput {
  interestTopics:readonly TopicCode[];desiredJobTopics:readonly TopicCode[];
  approvedExperienceTopics:readonly TopicCode[];approvedLanguageCodes:readonly string[];
  officialMajorTopics:readonly TopicCode[];
  facts:Readonly<Partial<Record<z.infer<typeof EligibilityConditionSchema>['field'],string|number|boolean|readonly string[]>>>;
}
export interface NoticeStudentInput {
  campus?:string;college?:string;majors?:readonly {major:string;role:NoticeMajorRoleInput}[];
  cohort?:number;enrollmentState?:string;admissionType?:string;targetGraduationTerm?:string;
  graduationTermVerified?:boolean;openRequirementIds:readonly string[]|null;
  courseIds:readonly string[];interestTopics:readonly TopicCode[];
}
export interface NoticeInput {
  id:string;sourceSnapshotId:string;title:string;issuer:string;
  category:'ACADEMIC'|'SCHOLARSHIP'|'EXCHANGE'|'CAREER'|'GENERAL';
  campus?:string;college?:string;majors?:readonly string[];majorRoles?:readonly NoticeMajorRoleInput[];
  cohortRange?:{min?:number;max?:number};enrollmentStates?:readonly string[];admissionTypes?:readonly string[];
  graduationTermScope?:readonly string[];requirementRefs?:readonly string[];courseRefs?:readonly string[];
  topicCodes?:readonly TopicCode[];scholarshipConditions?:readonly string[];
  studentDeadline?:string;adminReportDeadline?:string;publishedAt?:string;validUntil?:string;
  eventSessions?:readonly {start:string;end?:string}[];
  verificationState:'CANDIDATE'|'VERIFIED'|'NEEDS_REVIEW'|'REJECTED';evidenceRefs:readonly string[];
}
