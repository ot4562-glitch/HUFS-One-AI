/**
 * Versioned feature-addition wire/data contracts for issues #343–#352.
 *
 * These schemas validate shape, never institutional authenticity. A source
 * is permitted only after the application's current SourceRevision/rights,
 * actor and consent gates have independently approved it.
 */
import {z} from 'zod';
import {TopicCodeSchema} from '../topics/index.js';
import {OfficialHttpsUrlSchema} from './official-url.js';

const Id = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/);
const Text = z.string().trim().min(1).max(1500);
const Iso = z.iso.datetime({offset: true});
const BoundedCodeList = z.array(Id).max(40);
const ApprovedTopicCodes = z.array(TopicCodeSchema).max(24);
export const FeatureSourceSchema = z.strictObject({
  sourceId: Id,
  revisionId: Id,
  status: z.enum(['VERIFIED', 'NEEDS_REVIEW', 'REVOKED', 'SYNTHETIC']),
  rights: z.enum(['CLEARED', 'UNKNOWN', 'BLOCKED']),
  verifiedAt: Iso.optional(),
  effectiveFrom: Iso,
  effectiveUntil: Iso.optional(),
  evidenceSpanIds: z.array(Id).max(50),
}).superRefine((s, ctx) => {
  if (s.effectiveUntil && Date.parse(s.effectiveUntil) <= Date.parse(s.effectiveFrom))
    ctx.addIssue({code:'custom',path:['effectiveUntil'],message:'invalid effective interval'});
  if (s.status === 'VERIFIED' && (!s.verifiedAt || s.evidenceSpanIds.length === 0))
    ctx.addIssue({code:'custom',message:'verified source requires date and evidence'});
});
export type FeatureSource = z.infer<typeof FeatureSourceSchema>;

export const FeatureVerifiedFactSchema = z.strictObject({
  key: Id,
  value: z.union([z.string().max(256),z.number().finite(),z.boolean()]),
  provenance: z.enum(['SOURCE_VERIFIED','OWNER_SELF_REPORTED']),
  observedAt: Iso,
  sourceRevisionId: Id.optional(),
  academicTerm: Id.optional(), // independently verified observation term
});
export type FeatureVerifiedFact = z.infer<typeof FeatureVerifiedFactSchema>;
export const FeatureConditionSchema = z.strictObject({
  id: Id,
  factKey: Id,
  op: z.enum(['NUM_GTE','NUM_LTE','TEXT_EQ','TEXT_IN','BOOL_EQ','DOCUMENT_PRESENT']),
  expected: z.union([z.number().finite(),z.string().max(256),z.boolean(),BoundedCodeList]),
  sourceSpanId: Id,
  required: z.boolean(),
  factTerm: Id.optional(), // term the official rule requires (e.g. prior semester)
}).superRefine((condition,ctx)=>{
  const e=condition.expected;
  const valid=condition.op==='NUM_GTE'||condition.op==='NUM_LTE'
    ? typeof e==='number'
    : condition.op==='TEXT_EQ' ? typeof e==='string'
      : condition.op==='TEXT_IN' ? Array.isArray(e)&&e.length>0
        : condition.op==='BOOL_EQ' ? typeof e==='boolean'
          : condition.op==='DOCUMENT_PRESENT' ? e===true : false;
  if(!valid) ctx.addIssue({code:'custom',path:['expected'],
    message:'condition operator and expected value type disagree'});
});
export type FeatureCondition = z.infer<typeof FeatureConditionSchema>;
export const ScholarshipPolicySchema = z.strictObject({
  id: Id, academicTerm: Id, source: FeatureSourceSchema,
  opensAt: Iso.optional(), closesAt: Iso.optional(),
  groups: z.array(z.strictObject({
    id: Id, join: z.enum(['ALL','ANY']), conditions: z.array(FeatureConditionSchema).min(1).max(30),
  })).min(1).max(20),
}).superRefine((s,ctx) => {
  if (s.opensAt && s.closesAt && Date.parse(s.opensAt) > Date.parse(s.closesAt))
    ctx.addIssue({code:'custom',path:['closesAt'],message:'closing before opening'});
  const ids=s.groups.flatMap(g=>g.conditions.map(c=>c.id));
  if (new Set(ids).size!==ids.length) ctx.addIssue({code:'custom',message:'duplicate condition IDs'});
  if(new Set(s.groups.map(g=>g.id)).size!==s.groups.length)
    ctx.addIssue({code:'custom',message:'duplicate condition group IDs'});
});
export type ScholarshipPolicy = z.infer<typeof ScholarshipPolicySchema>;

export const MentorCardSchema = z.strictObject({
  id: Id, source: FeatureSourceSchema, active: z.boolean(),
  majorCodes: BoundedCodeList, jobCodes: BoundedCodeList,
  experienceTopics: ApprovedTopicCodes, languages: BoundedCodeList,
  campuses: BoundedCodeList, publicEvidenceRefs: z.array(Id).max(50),
  applicationUrl: OfficialHttpsUrlSchema.optional(),
});
export type MentorCard = z.infer<typeof MentorCardSchema>;
export const MentorPreferenceSchema = z.strictObject({
  majorCodes: BoundedCodeList, jobCodes: BoundedCodeList,
  ownerApprovedTopics: ApprovedTopicCodes, language: Id.optional(), campus: Id.optional(),
  asOf: Iso,
});
export type MentorPreference = z.infer<typeof MentorPreferenceSchema>;
export const SemanticProposalSchema = z.strictObject({
  candidateId: Id, score: z.number().min(0).max(1),
  evidenceCodes: BoundedCodeList,
  modelVersion: Id, inputDigest: Id,
});
export type SemanticProposal = z.infer<typeof SemanticProposalSchema>;

export const CounselingServiceSchema = z.strictObject({
  id: Id, source: FeatureSourceSchema, active: z.boolean(),
  purposeCodes: BoundedCodeList, relatedPurposeCodes: BoundedCodeList,
  campuses: BoundedCodeList, audienceCodes: BoundedCodeList,
  languages: BoundedCodeList, officialUrl: OfficialHttpsUrlSchema.optional(),
});
export type CounselingService = z.infer<typeof CounselingServiceSchema>;

export const ActivityRecognitionRuleSchema = z.strictObject({
  id: Id, source: FeatureSourceSchema, eligibleKinds: BoundedCodeList,
  minActivityEndAt: Iso.optional(), applicationEndsAt: Iso.optional(),
  documentGroups: z.array(z.strictObject({
    id: Id, join: z.enum(['ALL','ANY']),
    kinds: BoundedCodeList.min(1),
  })).min(1).max(20),
  officialApplicationUrl: OfficialHttpsUrlSchema.optional(),
});
export type ActivityRecognitionRule = z.infer<typeof ActivityRecognitionRuleSchema>;
export const ActivityProofSchema = z.strictObject({
  id: Id, activityId: Id, kind: Id,
  ownerReviewed: z.boolean(),
  issuedAt: Iso.optional(), expiryAt: Iso.optional(),
  sourceState: z.enum(['PRESENT','REMOVED','REJECTED']),
});
export type ActivityProof = z.infer<typeof ActivityProofSchema>;

export const JobRequirementSchema = z.strictObject({
  id: Id, label: Text, topicCodes: BoundedCodeList,
  sourceSpanId: Id, source: FeatureSourceSchema,
});
export type JobRequirement = z.infer<typeof JobRequirementSchema>;
export const ExperienceEvidenceSchema = z.strictObject({
  id: Id, approved: z.boolean(), topicCodes: ApprovedTopicCodes,
  version: Id, evidenceSpanIds: z.array(Id).max(20),
});
export type ExperienceEvidence = z.infer<typeof ExperienceEvidenceSchema>;
export const TopicCrosswalkSchema = z.strictObject({
  id: Id, officialRequirementTopic: Id, oneAiTopic: TopicCodeSchema,
  source: FeatureSourceSchema,
});
export type TopicCrosswalk = z.infer<typeof TopicCrosswalkSchema>;

export const OpportunityCatalogItemSchema = z.strictObject({
  id: Id, title: Text, summary: z.string().max(5000).default(''),
  category: Id, campus: Id.optional(), topicCodes: ApprovedTopicCodes,
  publishedAt: Iso.optional(), deadlineAt: Iso.optional(),
  eligibility: z.enum(['MET','NOT_MET','UNKNOWN']),
  source: FeatureSourceSchema,
  permitted: z.boolean(),
});
export type OpportunityCatalogItem = z.infer<typeof OpportunityCatalogItemSchema>;
export const OpportunityQuerySchema = z.strictObject({
  q: z.string().trim().max(100).optional(),
  category: Id.optional(), campus: Id.optional(),
  eligibility: z.enum(['MET','NOT_MET','UNKNOWN']).optional(),
  deadlineBefore: Iso.optional(),
  includeClosed: z.boolean().optional(),
  sort: z.enum(['TITLE','DEADLINE_ASC','PUBLISHED_DESC']).default('TITLE'),
  asOf: Iso, pageSize: z.number().int().min(1).max(50).default(20),
});
export type OpportunityQuery = z.infer<typeof OpportunityQuerySchema>;

export const BadgeDefinitionSchema = z.strictObject({
  id: Id, source: FeatureSourceSchema,
  groups: z.array(z.strictObject({
    id: Id, join: z.enum(['ALL','ANY']),
    allowActivityReuse: z.boolean().optional(), // only if official issuer allows reuse
    requirements: z.array(z.strictObject({
      id: Id, topicCode: TopicCodeSchema,
      minimumDistinctActivities: z.number().int().min(1).max(1000),
      after: Iso.optional(), before: Iso.optional(),
    })).min(1).max(50),
  })).min(1).max(20),
  officialIssuerUrl: OfficialHttpsUrlSchema.optional(),
}).superRefine((badge,ctx)=>{
  const ids=badge.groups.flatMap(g=>g.requirements.map(r=>r.id));
  if(new Set(ids).size!==ids.length)
    ctx.addIssue({code:'custom',message:'duplicate badge requirement IDs'});
  for(const [gi,g] of badge.groups.entries()) {
    for(const [ri,r] of g.requirements.entries()) {
      if(r.after&&r.before&&Date.parse(r.after)>Date.parse(r.before))
        ctx.addIssue({code:'custom',path:['groups',gi,'requirements',ri],
          message:'badge activity time window reversed'});
    }
  }
});
export type BadgeDefinition = z.infer<typeof BadgeDefinitionSchema>;
export const BadgeEvidenceSchema = z.strictObject({
  id: Id, activityId: Id, topicCodes: ApprovedTopicCodes,
  date: Iso, ownerApproved: z.boolean(), officialVerified: z.boolean(),
  sourceRevisionId: Id.optional(),
});
export type BadgeEvidence = z.infer<typeof BadgeEvidenceSchema>;

export const LearningProgramSchema = z.strictObject({
  id: Id, source: FeatureSourceSchema, active: z.boolean(),
  goalTags: BoundedCodeList, courseCodes: BoundedCodeList,
  topicCodes: ApprovedTopicCodes, eligibleCampuses: BoundedCodeList,
  term: Id, deadlineAt: Iso.optional(), capacity: z.enum(['OPEN','FULL','UNKNOWN']),
  requiredCourseCodes: BoundedCodeList,
  applicationUrl: OfficialHttpsUrlSchema.optional(),
});
export type LearningProgram = z.infer<typeof LearningProgramSchema>;
export const LearningPreferenceSchema = z.strictObject({
  goalTags: BoundedCodeList, courseCodes: BoundedCodeList,
  topicCodes: ApprovedTopicCodes, campus: Id.optional(),
  term: Id.optional(), asOf: Iso,
});
export type LearningPreference = z.infer<typeof LearningPreferenceSchema>;

export const EmploymentAggregateSchema = z.strictObject({
  id: Id, source: FeatureSourceSchema, year: z.number().int().min(1950).max(2200),
  populationId: Id, metricId: Id, groupId: Id,
  numerator: z.number().int().nonnegative().optional(),
  denominator: z.number().int().nonnegative().optional(),
  publicApproved: z.boolean(),
  publicationPolicy: z.strictObject({
    minimumPositiveCell: z.number().int().min(1).optional(),
    allowPublishedZero: z.boolean(),
    aggregationAllowed: z.boolean(),
  }),
});
export type EmploymentAggregate = z.infer<typeof EmploymentAggregateSchema>;

export const GuideTranslationSchema = z.strictObject({
  text: z.string().max(12000),
  review: z.enum(['HUMAN_VERIFIED','MACHINE_DRAFT','MISSING']),
  basedOnRevisionId: Id,
  translationVersion: Id,
});
export const InternationalGuideSchema = z.strictObject({
  id: Id, topicCode: Id, campuses: BoundedCodeList, terms: BoundedCodeList,
  audienceCodes: BoundedCodeList, source: FeatureSourceSchema,
  translations: z.strictObject({
    ko: GuideTranslationSchema,
    en: GuideTranslationSchema.optional(),
    zh: GuideTranslationSchema.optional(),
  }),
  steps: z.array(z.strictObject({
    id: Id, order: z.number().int().nonnegative(),
    documentCodes: BoundedCodeList,
    officeCode: Id.optional(),
    sourceSpanId: Id,
  })).max(50),
}).superRefine((guide,ctx)=>{
  const ids=guide.steps.map(s=>s.id);
  if(new Set(ids).size!==ids.length)
    ctx.addIssue({code:'custom',message:'duplicate international guide step IDs'});
});
export type InternationalGuide = z.infer<typeof InternationalGuideSchema>;

// Strict response wire payloads; API signs/validates the catalog cursor.
export * from './results.js';
export {OfficialHttpsUrlSchema} from './official-url.js';

export * from './owner-v2-catalog.js';
