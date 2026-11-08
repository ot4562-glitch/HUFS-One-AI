/**
 * Wire-safe output/result contracts for the ten feature additions.
 *
 * These are versioned transport payload schemas. The server MUST revalidate
 * current owner, permission, consent, source head and evidence before emitting
 * them; passing Zod shape validation alone is not an authorization proof.
 * No user PII, raw evidence files or provider prompts belong in the payload.
 */
import {z} from 'zod';
import {OpportunityCatalogItemSchema} from './index.js';
import {OfficialHttpsUrlSchema} from './official-url.js';

const Id=z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/);
const Code=z.string().min(1).max(128);
const Ids=z.array(Id).max(1000);
const Status=z.enum(['MET','NOT_MET','UNKNOWN']);
const Score=z.number().finite().min(0).max(1);
export const ScholarshipReportV2Schema=z.strictObject({
  scholarshipId:Id,ruleRevisionId:Id,
  mode:z.enum(['SIMULATION','VERIFIED_FACT_CHECK','NOT_AVAILABLE']),
  overall:Status,
  applicationWindow:z.enum(['BEFORE_OPEN','OPEN','CLOSED','UNKNOWN']),
  groups:z.array(z.strictObject({
    id:Id,join:z.enum(['ALL','ANY']),state:Status,
    conditions:z.array(z.strictObject({
      id:Id,state:Status,reason:Code,factKey:Id,
      evidenceSpanId:Id,required:z.boolean(),
    })).max(100),
  })).max(20),
  missingFactKeys:Ids,sourceReason:Code,officialDecision:z.null(),
});
export type ScholarshipReportV2=z.infer<typeof ScholarshipReportV2Schema>;

export const MentorRankingV2Schema=z.strictObject({
  items:z.array(z.strictObject({
    mentorId:Id,ruleScore:Score,finalScore:Score,
    reasons:z.array(z.strictObject({
      kind:z.enum(['MAJOR','JOB','APPROVED_EXPERIENCE','MODEL_EVIDENCE']),
      codes:Ids,
    })).max(100),
    mode:z.enum(['RULE_ONLY','AI_RERANKED']),sourceRevisionId:Id,
  })).max(1000),
  candidateCount:z.number().int().nonnegative(),
  sourceScope:z.enum(['VERIFIED','SYNTHETIC']),
  modelOutcome:z.enum(['NOT_REQUESTED','ACCEPTED','REJECTED']),
});
export type MentorRankingV2=z.infer<typeof MentorRankingV2Schema>;

export const CounselingGuideV2Schema=z.strictObject({
  matches:z.array(z.strictObject({
    serviceId:Id,score:z.number().finite().nonnegative(),
    exactPurposes:Ids,relatedPurposes:Ids,
    audienceState:z.enum(['CONFIRMED','UNKNOWN']),
    campusState:z.enum(['CONFIRMED','UNKNOWN']),
    languageState:z.enum(['CONFIRMED','UNKNOWN']),
    officialApplicationUrl:OfficialHttpsUrlSchema.nullable(),
    sourceRevisionId:Id,
  })).max(3),
  excluded:z.number().int().nonnegative(),
  status:z.enum(['MATCHES','NO_MATCH','NO_PURPOSE']),
});
export type CounselingGuideV2=z.infer<typeof CounselingGuideV2Schema>;

export const RecognitionReportV2Schema=z.strictObject({
  activityId:Id,ruleRevisionId:Id,
  status:z.enum(['READY_FOR_OFFICIAL_REVIEW','DOCUMENTS_PENDING','CLOSED','NOT_APPLICABLE','UNKNOWN_RULE']),
  groups:z.array(z.strictObject({
    id:Id,join:z.enum(['ALL','ANY']),state:Status,
    documents:z.array(z.strictObject({
      id:Id,state:z.enum(['PRESENT_SELF_REPORTED','MISSING','UNKNOWN']),
    })).max(100),
  })).max(20),
  missingKinds:Ids,checkedProofIds:Ids,
  officiallyRecognized:z.literal(false),
});
export type RecognitionReportV2=z.infer<typeof RecognitionReportV2Schema>;

export const SkillRowV2Schema=z.strictObject({
  requirementId:Id,sourceSpanId:Id,
  status:z.enum(['SUPPORTED_BY_EVIDENCE','EVIDENCE_MISSING','UNMAPPED','NEEDS_REVIEW']),
  ownerEvidenceIds:Ids,matchedOneAiTopics:Ids,
  interpretation:z.enum(['RECORD_MATCH','RECORD_MISSING','UNKNOWN']),
});
export type SkillRowV2=z.infer<typeof SkillRowV2Schema>;

export const BadgePreparationV2Schema=z.strictObject({
  badgeId:Id,sourceRevisionId:Id,
  status:z.enum(['READY_TO_REQUEST_REVIEW','IN_PROGRESS','UNKNOWN']),
  groups:z.array(z.strictObject({
    id:Id,join:z.enum(['ALL','ANY']),state:Status,
    requirements:z.array(z.strictObject({
      id:Id,topicCode:Id,required:z.number().int().nonnegative(),
      observedDistinct:z.number().int().nonnegative(),
      state:z.enum(['EVIDENCE_RECORDED','DOCUMENTS_NEEDED','UNKNOWN']),
      activityIds:Ids,officialEvidenceIds:Ids,
    })).max(100),
  })).max(20),
  issuedCredential:z.null(),
  requiredNextTopics:Ids,
});
export type BadgePreparationV2=z.infer<typeof BadgePreparationV2Schema>;

export const LearningRankingV2Schema=z.strictObject({
  items:z.array(z.strictObject({
    programId:Id,sourceRevisionId:Id,
    eligibility:Status,
    hardReasons:Ids,relevance:Score,finalScore:Score,
    matches:z.array(z.strictObject({
      kind:z.enum(['GOAL','COURSE_INTEREST','TOPIC','MODEL']),
      codes:Ids,
    })).max(100),
    mode:z.enum(['RULE_ONLY','AI_RERANKED']),
  })).max(1000),
  modelOutcome:z.enum(['NOT_REQUESTED','ACCEPTED','REJECTED']),
  excludedCount:z.number().int().nonnegative(),
});
export type LearningRankingV2=z.infer<typeof LearningRankingV2Schema>;

export const EmploymentValueV2Schema=z.strictObject({
  id:Id,year:z.number().int().min(1950).max(2200),
  metricId:Id,groupId:Id,populationId:Id,
  status:z.enum(['PERCENT','OBSERVED_ZERO','NO_DATA','SUPPRESSED','INVALID','UNVERIFIED']),
  numerator:z.number().int().nonnegative().optional(),
  denominator:z.number().int().nonnegative().optional(),
  percent:z.number().finite().min(0).max(100).optional(),
  sourceRevisionId:Id,
});
export type EmploymentValueV2=z.infer<typeof EmploymentValueV2Schema>;

export const GuideResolutionV2Schema=z.strictObject({
  guideId:Id,sourceRevisionId:Id,
  status:z.enum(['READY','KOREAN_FALLBACK','UNKNOWN_SOURCE',
    'NOT_APPLICABLE','APPLICABILITY_UNKNOWN','TRANSLATION_UNAVAILABLE']),
  locale:z.enum(['ko','en','zh']),body:z.string().max(12000).optional(),
  steps:z.array(z.strictObject({
    id:Id,order:z.number().int().nonnegative(),
    documentCodes:Ids,
    officeCode:Id.optional(),
    sourceSpanId:Id,
  })).max(50),
  officialAdministrationComplete:z.literal(false),
});
export type GuideResolutionV2=z.infer<typeof GuideResolutionV2Schema>;

/** HTTP layer MUST sign an opaque cursor; the pure core's cursor is internal. */
export const SignedCatalogPageV2Schema=z.strictObject({
  items:z.array(z.lazy(()=>OpportunityCatalogItemSchema)).max(50),
  nextCursor:z.string().min(16).max(2048).nullable(),
  hasMore:z.boolean(),
  totalInAuthorizedScope:z.number().int().nonnegative(),
  scope:z.literal('PERMITTED_APPROVED_SNAPSHOT'),
  at:z.iso.datetime({offset:true}),
}).superRefine((page,ctx)=>{
  if(page.hasMore && !page.nextCursor)
    ctx.addIssue({code:'custom',path:['nextCursor'],message:'signed cursor missing'});
  if(!page.hasMore && page.nextCursor!==null)
    ctx.addIssue({code:'custom',path:['nextCursor'],message:'terminal page must not have cursor'});
});
export type SignedCatalogPageV2=z.infer<typeof SignedCatalogPageV2Schema>;
