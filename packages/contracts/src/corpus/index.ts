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

/** A separate, reviewable organization homepage, never source URL or application link.
 * No credentials, fragments, internal hosts, IPs or synthetic-only reserved hosts. */
export const OrganizationWebsiteSchema=z.strictObject({
  url:z.url().max(2048).refine(text=>{
    try{
      const u=new URL(text);
      return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash
        &&u.port===''&&u.hostname.includes('.')
        &&!u.hostname.startsWith('[')
        &&!/^[0-9]+([.][0-9]+){3}$/.test(u.hostname)
        &&!/(^|[.])(localhost|local|test|invalid|example)$/.test(u.hostname);
    }catch{return false;}
  },'Organization homepage must be a public HTTPS URL without query or credentials'),
  verifiedAt:z.iso.datetime({offset:true}),
  evidenceRef:z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/),
});

export const OpportunitySchema = z.strictObject({
  id:z.string().min(1),version:z.string().min(1),sourceSnapshotId:z.string().min(1),
  title:z.string().min(1),organization:z.string().min(1),
  organizationWebsite:OrganizationWebsiteSchema.optional(),
  kind:z.enum(['JOB','INTERNSHIP','CONTEST','EXTRACURRICULAR','SCHOLARSHIP']),
  /** Only present when source evidence distinguishes campus vs external activities. */
  programScope:z.enum(['ON_CAMPUS','OFF_CAMPUS','UNKNOWN']).optional(),
  /** Rolling admission is source-verified; no date inferred from eventSessions. */
  deadlineKind:z.enum(['FIXED','ROLLING','UNKNOWN']).optional(),
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


/**
 * Optional, code-derived recommendation explanation wire for TASK-06 issue #42.
 * This is presentation evidence, not an eligibility decision or employment probability.
 * The recommendation owner creates it; the API must apply source and SharingGrant gates first.
 */
export const RECOMMENDATION_SCORE_DISCLAIMER =
  '관심·직무·경험 일치를 코드로 계산한 관련도예요. 합격이나 취업 가능성이 아니에요.';

const ExplanationReasonSchema=z.strictObject({
  code:z.enum(['JOB_MATCH','INTEREST_MATCH','EXPERIENCE_MATCH','LANGUAGE_MATCH','MAJOR_MATCH','RECENT','NO_PERSONAL_MATCH']),
  text:z.string().min(1).max(400),
  topics:z.array(TopicCodeSchema).max(5).optional(),
});
const ExplanationBreakdownSchema=z.strictObject({
  key:z.enum(['J','I','S','L','M','F']),
  label:z.string().min(1).max(40),
  points:z.number().finite().min(0).max(100),
  max:z.number().finite().min(0).max(100),
}).superRefine((part,ctx)=>{
  if(part.points>part.max)ctx.addIssue({code:'custom',path:['points'],message:'score points exceed configured weight'});
});

export const RecommendationExplanationSchema=z.strictObject({
  opportunityId:z.string().min(1).max(200),
  relevance:z.strictObject({
    score:z.number().int().min(0).max(100),
    level:z.enum(['HIGH','MEDIUM','LOW','GENERAL']),
    label:z.string().min(1).max(40),
    breakdown:z.array(ExplanationBreakdownSchema).length(6),
    disclaimer:z.literal(RECOMMENDATION_SCORE_DISCLAIMER),
  }).superRefine((value,ctx)=>{
    const expected=['J','I','S','L','M','F'];
    if(value.breakdown.some((p,i)=>p.key!==expected[i])){
      ctx.addIssue({code:'custom',path:['breakdown'],message:'score parts must be J/I/S/L/M/F in order'});
    }
    const total=value.breakdown.reduce((sum,p)=>sum+p.points,0);
    if(Math.abs(total-value.score)>1){
      ctx.addIssue({code:'custom',path:['score'],message:'score differs from the explained points'});
    }
  }),
  reasons:z.array(ExplanationReasonSchema).max(10),
  eligibility:z.strictObject({
    state:EligibilitySchema,
    text:z.string().min(1).max(400),
    fields:z.array(z.enum(['enrollment','campus','major','cohort','degree','time','teamRole','certification'])).max(8),
    evidenceRefs:z.array(z.string().min(1).max(200)).max(50),
  }),
  deadline:z.strictObject({
    kind:z.enum(['CONFIRMED','EVENT_ONLY','RECORD_ONLY','ROLLING','UNKNOWN']),
    text:z.string().min(1).max(300),
    iso:z.iso.datetime({offset:true}).optional(),
  }).superRefine((deadline,ctx)=>{
    if(deadline.kind==='CONFIRMED' && deadline.iso===undefined){
      ctx.addIssue({code:'custom',path:['iso'],message:'confirmed deadline requires an ISO time'});
    }
    if(deadline.kind!=='CONFIRMED' && deadline.iso!==undefined){
      ctx.addIssue({code:'custom',path:['iso'],message:'unconfirmed deadline must not carry an exact time'});
    }
  }),
  prioritySelectionCount:z.number().int().nonnegative().max(1000),
  provenance:z.literal('CODE_RULES'),
  rankConfigVersion:z.string().min(1).max(64),
});
export type RecommendationExplanation=z.infer<typeof RecommendationExplanationSchema>;

export const FeedCardSchema = z.strictObject({
  opportunityId:z.string().min(1),
  displayMode:z.enum(['FEATURED_LARGE','COMPACT_LIST']),
  title:z.string().min(1),
  /** Only source-gated REAL cards; a web site is not the posting source or apply route. */
  organizationWebsite:OrganizationWebsiteSchema.optional(),
  eligibility:EligibilitySchema,
  lifecycle:LifecycleSchema,
  topics:z.array(TopicCodeSchema).max(5),
  evidenceRefs:z.array(z.string().min(1)),
  score:z.number().finite().nonnegative().optional(),
  dataMode:z.enum(['REAL','SYNTHETIC']),
  explanation:RecommendationExplanationSchema.optional(),
}).superRefine((card,ctx)=>{
  if(card.dataMode==='SYNTHETIC'&&card.organizationWebsite)
    ctx.addIssue({code:'custom',path:['organizationWebsite'],message:'Synthetic cards cannot link to an official organization'});
  const explanation=card.explanation;
  if(!explanation)return;
  if(explanation.opportunityId!==card.opportunityId){
    ctx.addIssue({code:'custom',path:['explanation','opportunityId'],message:'explanation targets a different card'});
  }
  if(card.score!==undefined && Math.round(card.score)!==explanation.relevance.score){
    ctx.addIssue({code:'custom',path:['explanation','relevance','score'],message:'explanation score differs from the card score'});
  }
  for(const [i,reason] of explanation.reasons.entries()){
    if(reason.topics?.some(topic=>!card.topics.includes(topic))){
      ctx.addIssue({code:'custom',path:['explanation','reasons',i,'topics'],message:'reason topic is not on the card'});
    }
  }
});
export const FeedResultSchema = z.strictObject({
  asOf:z.iso.datetime({offset:true}),
  featured:z.array(FeedCardSchema).max(3),
  compact:z.array(FeedCardSchema).max(6),
  /** Separate, bounded condition-failure area; excluded from candidate counts. */
  ineligible:z.array(FeedCardSchema).max(20).optional(),
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
  for(const [index,item] of (feed.ineligible??[]).entries()){
    if(item.displayMode!=='COMPACT_LIST'||item.eligibility!=='INELIGIBLE')
      ctx.addIssue({code:'custom',path:['ineligible',index],message:'condition-failure items must be compact and INELIGIBLE'});
    if(all.has(item.opportunityId))ctx.addIssue({code:'custom',path:['ineligible',index,'opportunityId'],message:'duplicate opportunity'});
    all.add(item.opportunityId);
  }
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
  // A07.2: a past student deadline can only be called overdue when it applies to this viewer.
  for(const [index,item] of v.items.entries()){
    // Omitted is allowed for legacy clients; an explicit boolean must never
    // suppress a past applicable student deadline or fabricate an overdue one.
    const expected=item.studentDeadline!==undefined
      && Date.parse(item.studentDeadline)<=Date.parse(v.asOf) && item.appliesTo!=='NO';
    if(item.overdue!==undefined && item.overdue!==expected){
      ctx.addIssue({code:'custom',path:['items',index,'overdue'],message:'overdue contradicts student deadline/applicability asOf'});
    }
  }
  if(new Set(v.pinnedIds).size!==v.pinnedIds.length||v.pinnedIds.some(x=>!ids.has(x))){
    ctx.addIssue({code:'custom',path:['pinnedIds'],message:'pinned id not in items or duplicate'});
  }
});
export type NoticeResult = z.infer<typeof NoticeResultSchema>;
