import {z} from 'zod';
import {InterestTopicsSchema,DesiredJobTopicsSchema,TopicCodeSchema} from '../topics/index.js';
import {FeedResultSchema,NoticeResultSchema} from '../corpus/index.js';
import {ISODateTimeSchema} from '../identity/index.js';

/** Independent, invented local accounts. Never identifies any real student or S01–S05 slot. */
export const LocalAccountIdSchema=z.enum(['BLANK_DEMO','SYN_OWNER_1','SYN_OWNER_2','SYN_OWNER_3','SYN_OWNER_4']);
export type LocalAccountId=z.infer<typeof LocalAccountIdSchema>;
const Text=z.string().trim().min(1).max(100);
const Id=z.string().regex(/^[A-Za-z0-9_:-]{1,100}$/);
const unique=<T>(items:T[])=>new Set(items).size===items.length;
export const LocalAccountRevisionSchema=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER-1);
export const LocalAccountProfileSchema=z.strictObject({
  displayName:z.string().trim().min(1).max(60),primaryMajor:Text.nullable(),
  doubleMajorStatus:z.enum(['NONE','SELECTED','UNSET']),doubleMajor:Text.nullable(),
  earnedCredits:z.number().finite().min(0).max(500).multipleOf(0.5).nullable(),
  interestTopics:InterestTopicsSchema.refine(unique),desiredJobTopics:DesiredJobTopicsSchema.refine(unique),
  campus:z.enum(['SEOUL','GLOBAL']).nullable(),cohort:z.number().int().min(1900).max(2100).nullable(),
}).refine(p=>(p.doubleMajorStatus==='SELECTED')===(p.doubleMajor!==null),{
  path:['doubleMajor'],message:'SELECTED requires a double major; NONE and UNSET require null',
});
export type LocalAccountProfile=z.infer<typeof LocalAccountProfileSchema>;
export const LocalAccountWorkspaceSchema=z.strictObject({
  bookmarks:z.array(Id).max(200).refine(unique),
  experiences:z.array(z.strictObject({id:Id,title:z.string().trim().min(1).max(120),
    summary:z.string().max(1000),topicCodes:InterestTopicsSchema.refine(unique)})).max(100)
    .refine(items=>unique(items.map(item=>item.id))),
  planCourseIds:z.array(Id).max(100).refine(unique),search:z.string().max(200),notifications:z.boolean(),
});
export type LocalAccountWorkspace=z.infer<typeof LocalAccountWorkspaceSchema>;
export const LocalAccountOptionSchema=z.strictObject({accountId:LocalAccountIdSchema,label:Text,
  resettable:z.boolean(),dataMode:z.literal('SYNTHETIC')});
export const LocalAccountSessionSchema=z.strictObject({mode:z.literal('SYNTHETIC'),
  sessionId:Id,csrfToken:Id,accountId:LocalAccountIdSchema,accounts:z.array(LocalAccountOptionSchema).length(5),
}).refine(s=>unique(s.accounts.map(a=>a.accountId))&&s.accounts.every(a=>a.resettable===(a.accountId==='BLANK_DEMO')));
export type LocalAccountSession=z.infer<typeof LocalAccountSessionSchema>;
export const LocalAccountSwitchSchema=z.strictObject({accountId:LocalAccountIdSchema});
export const LocalAccountProfilePutSchema=z.strictObject({expectedRevision:LocalAccountRevisionSchema,profile:LocalAccountProfileSchema});
export const LocalAccountWorkspacePutSchema=z.strictObject({expectedRevision:LocalAccountRevisionSchema,workspace:LocalAccountWorkspaceSchema});
export const LocalAccountResetSchema=z.strictObject({expectedRevision:LocalAccountRevisionSchema});
export const LocalAccountClubSchema=z.strictObject({id:Id,title:Text,summary:z.string().max(2000),
  eligibility:z.enum(['ELIGIBLE','INELIGIBLE','UNKNOWN']),lifecycle:z.enum(['UPCOMING','OPEN','CLOSED','OPEN_NO_DEADLINE']),
  score:z.number().finite().nonnegative(),reasons:z.array(z.string()),topics:z.array(TopicCodeSchema),dataMode:z.literal('SYNTHETIC')});
const UnknownAcademic=z.strictObject({state:z.literal('UNKNOWN'),reason:z.string().min(1)});
export const LocalAccountSnapshotSchema=z.strictObject({mode:z.literal('SYNTHETIC'),sessionId:Id,
  accountId:LocalAccountIdSchema,revision:LocalAccountRevisionSchema,profile:LocalAccountProfileSchema,
  workspace:LocalAccountWorkspaceSchema,asOf:ISODateTimeSchema,feed:FeedResultSchema,notices:NoticeResultSchema,
  clubs:z.strictObject({recommended:z.array(LocalAccountClubSchema).max(3),all:z.array(LocalAccountClubSchema)}),
  academics:UnknownAcademic,forecast:UnknownAcademic,
}).refine(s=>s.asOf===s.feed.asOf&&s.asOf===s.notices.asOf,{message:'Derived sections must share one asOf'})
  .refine(s=>[...s.feed.featured,...s.feed.compact,...(s.feed.ineligible??[])].every(card=>card.dataMode==='SYNTHETIC'),
    {path:['feed'],message:'A synthetic local account cannot contain real feed cards'});
export type LocalAccountSnapshot=z.infer<typeof LocalAccountSnapshotSchema>;
