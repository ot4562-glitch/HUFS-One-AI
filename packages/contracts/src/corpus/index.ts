import {z} from 'zod';
import {DataQualitySchema, EligibilitySchema, LifecycleSchema, OpportunityTopicsSchema, TopicCodeSchema, VerificationStateSchema} from '../topics/index.js';

export const EvidenceSpanSchema = z.strictObject({
  evidenceId:z.string().min(1),sourceId:z.string().min(1),snapshotVersion:z.string().min(1),
  paragraphId:z.string().min(1),quote:z.string().min(1),
  startCodePoint:z.number().int().nonnegative(),endCodePoint:z.number().int().nonnegative(),
}).refine(v => v.startCodePoint < v.endCodePoint, {message:'Invalid evidence span'});
export type EvidenceSpan = z.infer<typeof EvidenceSpanSchema>;

export const SourceSnapshotSchema=z.strictObject({
  id:z.string().min(1),
  class:z.enum(['SYNTHETIC','LICENSED_EXTERNAL','PERSONAL_CONSENTED','RESEARCH_REFERENCE_ONLY']),
  sourceUrl:z.url().optional(),
  publishedAt:z.iso.datetime({offset:true}).optional(),
  fetchedAt:z.iso.datetime({offset:true}),
  hash:z.string().min(1),permissionRef:z.string().min(1),version:z.string().min(1),
  paragraphs:z.array(z.strictObject({id:z.string().min(1),text:z.string().min(1)})),
});
export type SourceSnapshot=z.infer<typeof SourceSnapshotSchema>;

export const EligibilityConditionSchema = z.strictObject({
  field:z.enum(['enrollment','campus','major','cohort','degree','time','teamRole','certification']),
  operator:z.enum(['EQ','IN','NOT_IN','GTE','LTE','EXISTS']),
  value:z.union([z.string(),z.number(),z.boolean(),z.array(z.string())]),
  evidenceId:z.string().min(1),
});

export const OpportunitySchema = z.strictObject({
  id:z.string().min(1),version:z.string().min(1),sourceSnapshotId:z.string().min(1),
  title:z.string().min(1),organization:z.string().min(1),
  kind:z.enum(['JOB','INTERNSHIP','CONTEST','EXTRACURRICULAR','SCHOLARSHIP']),
  topicCodes:OpportunityTopicsSchema,languageCodes:z.array(z.string()).max(10),
  applyOpensAt:z.iso.datetime({offset:true}).optional(),applyClosesAt:z.iso.datetime({offset:true}).optional(),
  eventSessions:z.array(z.strictObject({start:z.iso.datetime({offset:true}),end:z.iso.datetime({offset:true})})),
  actualApplicationRoute:z.enum(['OFFICIAL_URL','EXTERNAL_URL','RECORD_ONLY','UNKNOWN','DEMO_DISABLED']),
  applicationUrlRef:z.string().optional(),conditions:z.array(EligibilityConditionSchema),
  roleSteps:z.array(z.string()),prioritySelection:z.array(z.string()),completionRules:z.array(z.string()),
  dataMode:z.enum(['REAL','SYNTHETIC']),dataQuality:DataQualitySchema,
  verifiedAt:z.iso.datetime({offset:true}).optional(),imageAssetId:z.string().optional(),
});
export type Opportunity = z.infer<typeof OpportunitySchema>;

export const FeedCardSchema = z.strictObject({
  opportunityId:z.string().min(1),
  displayMode:z.enum(['FEATURED_LARGE','COMPACT_LIST']),
  title:z.string().min(1),
  eligibility:EligibilitySchema,
  lifecycle:LifecycleSchema,
  topics:z.array(TopicCodeSchema).max(5),
  evidenceRefs:z.array(z.string().min(1)),
  score:z.number().finite().nonnegative().optional(),
  dataMode:z.enum(['REAL','SYNTHETIC']),
});
export const FeedResultSchema = z.strictObject({
  asOf:z.iso.datetime({offset:true}),
  featured:z.array(FeedCardSchema).max(3),
  compact:z.array(FeedCardSchema).max(6),
  hasMore:z.boolean(),
  totalCandidates:z.number().int().nonnegative(),
}).superRefine((feed,ctx) => {
  const all=new Set<string>();
  for(const [mode,items] of [['featured',feed.featured],['compact',feed.compact]] as const){
    for(const [index,item] of items.entries()){
      const expected=mode==='featured'?'FEATURED_LARGE':'COMPACT_LIST';
      if(item.displayMode!==expected)ctx.addIssue({code:'custom',path:[mode,index,'displayMode'],message:'wrong display mode'});
      if(all.has(item.opportunityId))ctx.addIssue({code:'custom',path:[mode,index,'opportunityId'],message:'duplicate opportunity'});
      all.add(item.opportunityId);
    }
  }
  if(feed.totalCandidates < all.size)ctx.addIssue({code:'custom',path:['totalCandidates'],message:'total below shown count'});
});
export type FeedResult = z.infer<typeof FeedResultSchema>;

export const NoticeItemSchema = z.strictObject({
  noticeId:z.string().min(1),title:z.string().min(1),
  priority:z.enum(['CRITICAL_DUE','ACADEMIC_REQUIRED','PERSONAL_OPPORTUNITY','GENERAL']),
  appliesTo:z.enum(['YES','NO','UNKNOWN']),
  studentDeadline:z.iso.datetime({offset:true}).optional(),
  /** True means the student's submission deadline is past asOf; absent means legacy/undetermined. */
  overdue:z.boolean().optional(),
  adminReportDeadline:z.iso.datetime({offset:true}).optional(),
  evidenceRefs:z.array(z.string().min(1)),
  verificationState:VerificationStateSchema,
});
export const NoticeResultSchema = z.strictObject({
  asOf:z.iso.datetime({offset:true}),items:z.array(NoticeItemSchema),
  pinnedIds:z.array(z.string()).max(2),
}).superRefine((v,ctx)=>{
  const ids=new Set(v.items.map(x=>x.noticeId));
  if(new Set(v.pinnedIds).size!==v.pinnedIds.length||v.pinnedIds.some(x=>!ids.has(x))){
    ctx.addIssue({code:'custom',path:['pinnedIds'],message:'pinned id not in items or duplicate'});
  }
});
export type NoticeResult = z.infer<typeof NoticeResultSchema>;
