import {z} from 'zod';

/** Shared, strict contracts for the three pre-final campus-assistance features.
 * They do not authorize a source or convert synthetic examples into school facts.
 */
const Id = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9_.:-]+$/);
const Iso = z.iso.datetime({offset:true});
const Day = z.iso.date();
const Source = z.url().startsWith('https://').max(1000);
export const CampusRightsSchema = z.enum(['APPROVED','REVOKED','BLOCKED']);
export const CampusProvenanceSchema = z.enum(['SYNTHETIC','REAL_APPROVED']);

export const ActivityRecordSchema = z.strictObject({
  entryId:Id, sourceId:Id, revisionId:Id, supersedes:Id.optional(),
  organizationId:Id, seriesId:Id, title:z.string().trim().min(2).max(240),
  kind:z.enum(['ORIENTATION','ACADEMIC','RECRUITMENT','LECTURE','OTHER']),
  campus:z.enum(['SEOUL','GLOBAL','BOTH']),
  publishedAt:Iso, verifiedAt:Iso,
  eventDate:Day.optional(), applicationDeadline:Day.optional(),
  sourceUrl:Source, status:z.enum(['ANNOUNCED','CONFIRMED','CANCELLED','DELETED']),
  rights:CampusRightsSchema, provenance:CampusProvenanceSchema,
  venue:z.string().max(160).optional(),
});
export type ActivityRecord = z.infer<typeof ActivityRecordSchema>;
export const ActivityForecastSchema = z.strictObject({
  organizationId:Id, seriesId:Id, targetYear:z.number().int().min(2000).max(2200),
  asOf:Iso, state:z.enum(['PREDICTED','CONFIRMED','CANCELLED','INSUFFICIENT_DATA','UNKNOWN']),
  confidence:z.enum(['LOW','MEDIUM','NONE']),
  from:Day.optional(), to:Day.optional(),
  observedYears:z.array(z.number().int().min(2000).max(2200)).max(20),
  evidenceRefs:z.array(Id).max(20), reason:z.string().min(1).max(500),
});
export type ActivityForecast = z.infer<typeof ActivityForecastSchema>;

export const ExchangeApplicantSchema = z.strictObject({
  duration:z.union([z.literal(1),z.literal(2)]),
  track:z.enum(['OIA','DEPARTMENT']), status:z.enum(['ENROLLED','LEAVE','UNKNOWN']),
  completedSemesters:z.number().int().min(0).max(15).optional(),
  gpa:z.number().finite().min(0).max(4.5).optional(),
  transfer:z.boolean().optional(), previousCancellation:z.enum(['CLEAR','CANCELLED','UNKNOWN']),
  language:z.strictObject({test:Id,score:z.number().finite().nonnegative(),expiresOn:Day}).optional(),
  departureOn:Day.optional(),
});
export type ExchangeApplicant = z.infer<typeof ExchangeApplicantSchema>;
/** Semester limits must come from an approved, versioned official source. Omitted means UNKNOWN. */
const SemesterRangeSchema=z.strictObject({min:z.number().int().min(0).max(15),
  max:z.number().int().min(0).max(15)}).refine(v=>v.min<=v.max);
const ProgramTermRulesSchema=z.strictObject({
  one:z.strictObject({ENROLLED:SemesterRangeSchema,LEAVE:SemesterRangeSchema}),
  two:z.strictObject({ENROLLED:SemesterRangeSchema,LEAVE:SemesterRangeSchema}),
});
export const ExchangePolicySchema = z.strictObject({
  ruleId:Id, sourceRevision:Id, sourceUrl:Source,
  track:z.enum(['OIA','DEPARTMENT']), publishedAt:Iso, verifiedAt:Iso,
  effectiveFrom:Day, effectiveUntil:Day.optional(),
  rights:CampusRightsSchema, provenance:CampusProvenanceSchema,
  minimumGpa:z.number().finite().min(0).max(4.5),
  /** Policy-specific rules; never infer these from a program length or student assertion. */
  termRules:ProgramTermRulesSchema.optional(),
  twoSemesterTransfersAllowed:z.boolean().optional(),
  priorCancellationAllowed:z.boolean().optional(),
  partnerMinimumGpa:z.number().finite().min(0).max(4.5).optional(),
  requiredLanguage:z.strictObject({test:Id,minimumScore:z.number().finite().nonnegative()}).optional(),
  /** Officially identified partner/term scope; an unknown partner must stay UNKNOWN. */
  partnerId:Id,
});
export type ExchangePolicy = z.infer<typeof ExchangePolicySchema>;
export const ExchangeCheckSchema = z.strictObject({
  code:z.enum(['TRACK','GPA','SEMESTERS','TRANSFER','CANCELLATION','PARTNER_GPA','LANGUAGE']),
  status:z.enum(['PASS','FAIL','UNKNOWN','NOT_APPLICABLE']),
  explanation:z.string().min(1).max(300),
  sourceRevision:Id.optional(),
});
export type ExchangeCheck = z.infer<typeof ExchangeCheckSchema>;
export const ExchangeResultSchema = z.strictObject({
  asOf:Iso, policyRevision:Id.optional(), result:z.enum(['PASS','FAIL','UNKNOWN']),
  checks:z.array(ExchangeCheckSchema).length(7),
  disclaimer:z.literal('제시된 기준에 대한 참고 결과이며 공식 지원 자격·선발 결과가 아닙니다.'),
});
export type ExchangeResult = z.infer<typeof ExchangeResultSchema>;

export const FaqDocumentSchema = z.strictObject({
  documentId:Id, revisionId:Id,
  title:z.string().trim().min(2).max(200), sourceUrl:Source,
  category:z.enum(['ACADEMICS','SCHOLARSHIPS','EXCHANGE','ACTIVITIES','SERVICE']),
  publishedAt:Iso, verifiedAt:Iso, effectiveFrom:Day, effectiveUntil:Day.optional(),
  rights:CampusRightsSchema, provenance:CampusProvenanceSchema,
  accessScope:z.literal('PUBLIC'),
  paragraphs:z.array(z.strictObject({id:Id,text:z.string().trim().min(5).max(1000)})).min(1).max(20),
});
export type FaqDocument = z.infer<typeof FaqDocumentSchema>;
export const FaqCitationSchema = z.strictObject({
  citationId:Id, quote:z.string().trim().min(1).max(500),
});
export const FaqCandidateSchema = z.strictObject({
  answer:z.string().trim().min(1).max(2500),
  citations:z.array(FaqCitationSchema).min(1).max(6),
  needsHumanConfirmation:z.literal(true),
  suggestedLinks:z.array(z.enum(['/exchange','/activities','/notices'])).max(3),
});
export type FaqCandidate = z.infer<typeof FaqCandidateSchema>;

export const ActivityArchiveResponseSchema=z.strictObject({
  asOf:Iso,sourceVersion:Id,items:z.array(ActivityRecordSchema).max(200),
});
export const ExchangePartnerSummarySchema=z.strictObject({
  partnerId:Id,track:z.enum(['OIA','DEPARTMENT']),minimumGpa:z.number().min(0).max(4.5),
  partnerMinimumGpa:z.number().min(0).max(4.5).optional(),
  requiredLanguage:z.strictObject({test:Id,minimumScore:z.number().nonnegative()}).optional(),
  sourceRevision:Id,sourceUrl:Source,verifiedAt:Iso,provenance:CampusProvenanceSchema,
});
export const ExchangePartnerListSchema=z.strictObject({
  asOf:Iso,sourceVersion:Id,partners:z.array(ExchangePartnerSummarySchema).max(50),
});
export const FaqAskResponseSchema=z.discriminatedUnion('status',[
  z.strictObject({status:z.literal('NOT_FOUND'),asOf:Iso,evidence:z.array(z.never()).length(0)}),
  z.strictObject({status:z.literal('CONFIGURATION_REQUIRED'),asOf:Iso,evidence:z.array(z.never()).length(0)}),
  z.strictObject({status:z.literal('NEEDS_REVIEW'),asOf:Iso,answer:FaqCandidateSchema,
    evidence:z.array(z.strictObject({citationId:Id,sourceUrl:Source,title:z.string().min(1),verifiedAt:Iso})).max(6),
    usage:z.strictObject({promptTokens:z.number().int().nonnegative(),completionTokens:z.number().int().positive(),
      totalTokens:z.number().int().positive()})}),
]);
export type FaqAskResponse=z.infer<typeof FaqAskResponseSchema>;
