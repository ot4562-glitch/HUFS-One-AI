import {z} from 'zod';
import {CreditUnitsSchema} from '../academics/index.js';
import {InterestTopicsSchema,TopicCodeSchema} from '../topics/index.js';
import {ISODateTimeSchema} from '../identity/index.js';
import {FeedResultSchema,FeedCardSchema,NoticeResultSchema,OpportunitySchema} from '../corpus/index.js';
import {LocalAccountClubSchema,LocalAccountWorkspaceSchema} from './index.js';
import {CalendarResultSchema} from '../calendar/index.js';

/** Independent synthetic namespace. Not a real account, S01–S05 or a reviewer subject. */
export const DEMO_PROFILE_NAMESPACE='EMPTY_DEMO' as const;
const Version=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER-1);
const Major=z.string().trim().min(1).max(40);
/** null = UNSET; NONE = explicitly no double major; DOUBLE = SELECTED. */
export const DemoProfileDoubleMajorSchema=z.discriminatedUnion('kind',[
  z.strictObject({kind:z.literal('NONE')}),
  z.strictObject({kind:z.literal('DOUBLE'),major:Major}),
]);
export const DemoProfileValueSchema=z.strictObject({
  primaryMajor:Major.nullable(),
  // Integer canonical units, 1 unit = 0.5 earned credit. No GPA/transcript is collected.
  earnedCreditUnits:CreditUnitsSchema.max(500).nullable(),
  interestTopics:InterestTopicsSchema.refine(items=>new Set(items).size===items.length),
  doubleMajor:DemoProfileDoubleMajorSchema.nullable(),
});
export type DemoProfileValue=z.infer<typeof DemoProfileValueSchema>;
export const blankDemoProfileValue=():DemoProfileValue=>({primaryMajor:null,earnedCreditUnits:null,
  interestTopics:[],doubleMajor:null});
/** One actor-scoped synthetic workspace; the real owner's workspace is never read. */
export const DemoProfileWorkspaceSchema=LocalAccountWorkspaceSchema.safeExtend({
  experienceOverlay:z.enum(['OFF','ON']).default('OFF'),
}).refine(w=>w.bookmarks.every(id=>/^SYN-OPP-0(?:0[1-9]|[1-3][0-9]|40)$/.test(id)),
  {path:['bookmarks'],message:'Only the maintained synthetic opportunity IDs may be saved'})
  .refine(w=>new TextEncoder().encode(JSON.stringify(w)).length<=32768,{message:'Synthetic workspace exceeds 32 KiB'});
export type DemoProfileWorkspace=z.infer<typeof DemoProfileWorkspaceSchema>;
export const blankDemoProfileWorkspace=():DemoProfileWorkspace=>({
  bookmarks:[],experiences:[],planCourseIds:[],search:'',notifications:false,experienceOverlay:'OFF',
});
export const DemoProfileWorkspaceSaveSchema=z.strictObject({expectedVersion:Version,workspace:DemoProfileWorkspaceSchema});
export type DemoProfileWorkspaceSave=z.infer<typeof DemoProfileWorkspaceSaveSchema>;
export const DemoProfileRecordSchema=z.strictObject({version:Version,value:DemoProfileValueSchema,
  updatedAt:ISODateTimeSchema.nullable(),workspace:DemoProfileWorkspaceSchema.default(blankDemoProfileWorkspace),
}).refine(p=>(p.version===0)===(p.updatedAt===null),{message:'Only an unpersisted profile has version zero'})
  .refine(p=>p.version!==0||JSON.stringify(p.value)===JSON.stringify(blankDemoProfileValue()),
    {message:'Unpersisted profile must be wholly empty'})
  .refine(p=>p.version!==0||JSON.stringify(p.workspace)===JSON.stringify(blankDemoProfileWorkspace()),
    {message:'Unpersisted workspace must be wholly empty'});
export type DemoProfileRecord=z.infer<typeof DemoProfileRecordSchema>;
export const DemoProfileSaveSchema=z.strictObject({expectedVersion:Version,
  value:DemoProfileValueSchema.refine(p=>p.primaryMajor!==null&&p.earnedCreditUnits!==null
    &&p.interestTopics.length>0&&p.doubleMajor!==null,{message:'All four settings are required to save'}),
});
export type DemoProfileSave=z.infer<typeof DemoProfileSaveSchema>;
export const DemoProfileResetSchema=z.strictObject({expectedVersion:Version});
export type DemoProfileReset=z.infer<typeof DemoProfileResetSchema>;
const Unknown=z.strictObject({state:z.literal('UNKNOWN'),reason:z.string().min(1)});
export const DemoProfileSnapshotSchema=z.strictObject({
  namespace:z.literal(DEMO_PROFILE_NAMESPACE),dataMode:z.literal('SYNTHETIC'),
  verification:z.literal('UNVERIFIED_SELF_REPORT'),version:Version,asOf:ISODateTimeSchema,
  feed:FeedResultSchema,notices:NoticeResultSchema,
  clubs:z.strictObject({recommended:z.array(LocalAccountClubSchema).max(3),all:z.array(LocalAccountClubSchema)}),
  academics:Unknown,forecast:Unknown,
  workspace:DemoProfileWorkspaceSchema,
  calendar:CalendarResultSchema,
  catalog:z.array(OpportunitySchema).max(40),
  allCards:z.array(FeedCardSchema).max(40),
  experienceSignals:z.strictObject({mode:z.enum(['OFF','SYNTHETIC_OVERLAY']),topics:z.array(TopicCodeSchema)}),
  corpus:z.strictObject({version:z.literal('syn-corpus-v1'),opportunities:z.literal(40),notices:z.literal(10),
    profiles:z.literal(5),sha256:z.string().regex(/^[a-f0-9]{64}$/)}),
}).refine(s=>s.asOf===s.feed.asOf&&s.asOf===s.notices.asOf&&s.asOf===s.calendar.asOf,{message:'One recomputation asOf required'})
  .refine(s=>[...s.feed.featured,...s.feed.compact].every(c=>c.dataMode==='SYNTHETIC'),
    {message:'Synthetic source pack only'})
  .refine(s=>s.catalog.every(o=>o.dataMode==='SYNTHETIC'&&!o.applicationUrlRef
    &&['DEMO_DISABLED','RECORD_ONLY'].includes(o.actualApplicationRoute)),{message:'Synthetic catalog cannot enable applications'})
  .refine(s=>new Set(s.catalog.map(o=>o.id)).size===s.catalog.length
    &&new Set(s.allCards.map(c=>c.opportunityId)).size===s.allCards.length
    &&s.allCards.length===s.catalog.length&&s.allCards.every(c=>c.dataMode==='SYNTHETIC'
      &&s.catalog.some(o=>o.id===c.opportunityId)),{message:'Complete unique catalog/card binding required'});
export const DemoProfileResponseSchema=z.strictObject({profile:DemoProfileRecordSchema,snapshot:DemoProfileSnapshotSchema})
  .refine(r=>r.profile.version===r.snapshot.version,{message:'Profile and derived snapshot versions must agree'})
  .refine(r=>JSON.stringify(r.profile.workspace)===JSON.stringify(r.snapshot.workspace),{message:'Profile and snapshot workspace must agree'});
export type DemoProfileResponse=z.infer<typeof DemoProfileResponseSchema>;
