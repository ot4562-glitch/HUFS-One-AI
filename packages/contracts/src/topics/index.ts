import {z} from 'zod';

// A04.1 closed vocabulary: recommendation, UI, and AI must import this exact source.
export const TOPIC_CODES = [
  'TRADE_OVERSEAS', 'GLOBAL_SALES', 'LANGUAGE_TRANSLATION', 'INTL_ORGANIZATION',
  'INTL_COOPERATION', 'DIPLOMACY_PUBLIC', 'FINANCE_INVESTMENT', 'ACCOUNTING_TAX',
  'ECONOMIC_RESEARCH', 'DATA_ANALYTICS', 'AI_ML', 'SOFTWARE_DEV',
  'CYBERSECURITY', 'CLOUD_INFRA', 'PRODUCT_UX', 'MARKETING_BRAND',
  'MEDIA_CONTENT', 'EDUCATION_TUTORING', 'HR_ORG', 'CONSULTING_STRATEGY',
  'STARTUP_ENTREPRENEUR', 'PUBLIC_POLICY', 'ESG_SUSTAINABILITY', 'CULTURE_TOURISM',
] as const;

export const TopicCodeSchema = z.enum(TOPIC_CODES);
export type TopicCode = z.infer<typeof TopicCodeSchema>;
export const TOPIC_DICTIONARY_VERSION = 'topics-v1';
/** Explicit alias mapping revision; the closed set of 24 TopicCodes is unchanged. */
export const TOPIC_ALIAS_VERSION = 'aliases-v1.1';

// Source class and permission gate are independent: public does not equal cleared.
export const SourceClassSchema = z.enum([
  'SYNTHETIC', 'LICENSED_EXTERNAL', 'PERSONAL_CONSENTED', 'RESEARCH_REFERENCE_ONLY',
]);
export type SourceClass = z.infer<typeof SourceClassSchema>;
export const ProviderInputClassSchema = z.enum([
  'PUBLIC_CLEARED', 'SYNTHETIC_CLEARED', 'NON_IDENTIFYING_REVIEWED', 'BLOCKED',
]);
export type ProviderInputClass = z.infer<typeof ProviderInputClassSchema>;
export const VerificationStateSchema = z.enum(['CANDIDATE','VERIFIED','NEEDS_REVIEW','REJECTED']);
export const EligibilitySchema = z.enum(['ELIGIBLE','INELIGIBLE','UNKNOWN']);
export const LifecycleSchema = z.enum(['UPCOMING','OPEN','CLOSED','UNKNOWN']);
export const DataQualitySchema = z.enum(['COMPLETE','PARTIAL','CONFLICT','STALE']);

// The versioned explicit alias dictionary is reviewed by the recommendation owner.
// Fuzzy / free-text aliases require owner approval and may not silently grant eligibility.
export const TOPIC_ALIASES_V1 = {
  '해외영업': 'GLOBAL_SALES',
  '무역': 'TRADE_OVERSEAS',
  '데이터분석': 'DATA_ANALYTICS',
  '소프트웨어개발': 'SOFTWARE_DEV',
} as const satisfies Record<string, TopicCode>;

export const InterestTopicsSchema = z.array(TopicCodeSchema).max(5);
export const DesiredJobTopicsSchema = z.array(TopicCodeSchema).max(3);
export const OpportunityTopicsSchema = z.array(TopicCodeSchema).max(5);
