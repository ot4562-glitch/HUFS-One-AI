import {z} from 'zod';
export * from './workspace.js';
import {DesiredJobTopicsSchema,InterestTopicsSchema} from '../topics/index.js';
import {CourseRecordSchema} from '../academics/index.js';
import {OpportunitySchema} from '../corpus/index.js';

const Utc=z.iso.datetime({offset:true});
const Version=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER-1);
export const SelfProfileValueSchema=z.strictObject({
  displayName:z.string().trim().min(1).max(40),
  interestTopics:InterestTopicsSchema,
  desiredJobTopics:DesiredJobTopicsSchema,
});
export const SelfProfilePatchSchema=z.strictObject({
  expectedVersion:Version,value:SelfProfileValueSchema,
});
export const SelfProfileSchema=z.strictObject({
  version:Version.min(1),value:SelfProfileValueSchema,updatedAt:Utc,
});
export type SelfProfile=z.infer<typeof SelfProfileSchema>;

export const PersonalPurposeChoicesSchema=z.strictObject({
  personalStorage:z.boolean(),teamReview:z.boolean(),externalAi:z.boolean(),
  ncpStorage:z.boolean(),presentation:z.boolean(),
});
export const SelfConsentPutSchema=z.strictObject({
  expectedVersion:Version,choices:PersonalPurposeChoicesSchema,
});
export const SelfConsentSchema=z.strictObject({
  version:Version.min(1),choices:PersonalPurposeChoicesSchema,updatedAt:Utc,
});
export type SelfConsent=z.infer<typeof SelfConsentSchema>;

/** This transcript is private, independently approved, and never a demo SharingGrant. */
export const OwnerTranscriptSchema=z.strictObject({
  state:z.literal('OWNER_APPROVED'),
  sourceRevisionId:z.string().min(1).max(128),
  sourceRightsVersion:z.string().min(1).max(128),
  asOf:Utc,reviewedAt:Utc,
  courses:z.array(CourseRecordSchema).max(500),
});
export type OwnerTranscript=z.infer<typeof OwnerTranscriptSchema>;

const ApprovedSourceSchema=z.strictObject({
  sourceId:z.string().min(1).max(128),
  revisionId:z.string().min(1).max(128),
  permissionRef:z.string().min(1).max(128),
  status:z.enum(['ACTIVE','SYNTHETIC']),
  verifiedAt:Utc.optional(),
}).superRefine((x,ctx)=>{
  if(x.status==='ACTIVE'&&!x.verifiedAt)
    ctx.addIssue({code:'custom',path:['verifiedAt'],message:'Active source requires human verification'});
});
export const CatalogCourseSchema=z.strictObject({
  courseId:z.string().min(1).max(90),
  courseCode:z.string().max(80),
  title:z.string().min(1).max(180),
  campus:z.string().min(1).max(70),
  creditUnits:z.number().int().min(0).max(60),
  source:ApprovedSourceSchema,
});
export const CourseOfferingSchema=z.strictObject({
  courseId:z.string().min(1).max(90),
  term:z.string().min(1).max(32),
  status:z.enum(['CONFIRMED_OFFERED','CONFIRMED_NOT_OFFERED','HISTORICAL_PATTERN','UNKNOWN']),
  source:ApprovedSourceSchema,
});
const PageMeta={asOf:Utc,nextCursor:z.string().max(90).nullable()};
export const CourseCatalogPageSchema=z.strictObject({
  ...PageMeta,items:z.array(CatalogCourseSchema).max(50),
});
export const CourseOfferingsPageSchema=z.strictObject({
  ...PageMeta,items:z.array(CourseOfferingSchema).max(50),
});
export const OpportunityCatalogItemSchema=z.strictObject({
  opportunity:OpportunitySchema,
  source:ApprovedSourceSchema,
}).superRefine((item,ctx)=>{
  if(item.opportunity.dataMode==='REAL'&&item.source.status!=='ACTIVE')
    ctx.addIssue({code:'custom',message:'Real opportunities require verified ACTIVE sources'});
  if(item.opportunity.dataMode==='SYNTHETIC'&&item.source.status!=='SYNTHETIC')
    ctx.addIssue({code:'custom',message:'Synthetic opportunities require synthetic sources'});
});
export const OpportunityCatalogPageSchema=z.strictObject({
  ...PageMeta,items:z.array(OpportunityCatalogItemSchema).max(50),
});
export const OpportunityCatalogDetailSchema=OpportunityCatalogItemSchema;
export type CourseCatalogPage=z.infer<typeof CourseCatalogPageSchema>;
export type CourseOfferingsPage=z.infer<typeof CourseOfferingsPageSchema>;
export type OpportunityCatalogPage=z.infer<typeof OpportunityCatalogPageSchema>;
export type OpportunityCatalogDetail=z.infer<typeof OpportunityCatalogDetailSchema>;
