import {z} from 'zod';
import {CreditUnitsSchema} from '../academics/index.js';
import {InterestTopicsSchema} from '../topics/index.js';
import {ISODateTimeSchema} from '../identity/index.js';
import {FeedResultSchema,NoticeResultSchema} from '../corpus/index.js';
import {LocalAccountClubSchema} from './index.js';

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
export const DemoProfileRecordSchema=z.strictObject({version:Version,value:DemoProfileValueSchema,
  updatedAt:ISODateTimeSchema.nullable(),
}).refine(p=>(p.version===0)===(p.updatedAt===null),{message:'Only an unpersisted profile has version zero'})
  .refine(p=>p.version!==0||JSON.stringify(p.value)===JSON.stringify(blankDemoProfileValue()),
    {message:'Unpersisted profile must be wholly empty'});
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
}).refine(s=>s.asOf===s.feed.asOf&&s.asOf===s.notices.asOf,{message:'One recomputation asOf required'})
  .refine(s=>[...s.feed.featured,...s.feed.compact].every(c=>c.dataMode==='SYNTHETIC'),
    {message:'Synthetic source pack only'});
export const DemoProfileResponseSchema=z.strictObject({profile:DemoProfileRecordSchema,snapshot:DemoProfileSnapshotSchema})
  .refine(r=>r.profile.version===r.snapshot.version,{message:'Profile and derived snapshot versions must agree'});
export type DemoProfileResponse=z.infer<typeof DemoProfileResponseSchema>;
