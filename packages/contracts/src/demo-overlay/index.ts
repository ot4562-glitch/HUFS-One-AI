import {z} from 'zod';
import {InterestTopicsSchema,DesiredJobTopicsSchema} from '../topics/index.js';
import {ISODateTimeSchema,DemoSnapshotSchema} from '../identity/index.js';
import {CalendarResultSchema} from '../calendar/index.js';

const Version=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER-1);
const Id=z.string().regex(/^[A-Za-z0-9_:-]{1,90}$/);
/** Temporary demo choices only. No original profile, facts or consent writes. */
export const DemoOverlayValueSchema=z.strictObject({
  interestTopics:InterestTopicsSchema.refine(v=>new Set(v).size===v.length).optional(),
  desiredJobTopics:DesiredJobTopicsSchema.refine(v=>new Set(v).size===v.length).optional(),
  hiddenOpportunityIds:z.array(Id).max(200).refine(v=>new Set(v).size===v.length).optional(),
});
export const DemoOverlayPutSchema=z.strictObject({
  expectedVersion:Version,value:DemoOverlayValueSchema,
});
export const DemoOverlayResetSchema=z.strictObject({expectedVersion:Version});
export const DemoOverlayStateSchema=z.strictObject({
  version:Version,value:DemoOverlayValueSchema,updatedAt:ISODateTimeSchema.nullable(),
}).refine(v=>v.version===0
  ?v.updatedAt===null&&Object.keys(v.value).length===0:v.updatedAt!==null,
{message:'Only an absent overlay has version zero and no update time'});
export type DemoOverlayValue=z.infer<typeof DemoOverlayValueSchema>;
export type DemoOverlayPut=z.infer<typeof DemoOverlayPutSchema>;
export type DemoOverlayState=z.infer<typeof DemoOverlayStateSchema>;

/** One recomputation receipt, not three independently cacheable responses.
 * The authenticated context and request epoch still need separate validation.
 * updatedAt is a write time and may be later than a fixed historical asOf.
 */
export const DemoOverlayResultSchema=z.strictObject({
  overlay:DemoOverlayStateSchema,snapshot:DemoSnapshotSchema,calendar:CalendarResultSchema,
}).superRefine((value,ctx)=>{
  const at=Date.parse(value.snapshot.asOf);
  if([value.snapshot.feed.asOf,value.snapshot.notices.asOf,value.calendar.asOf]
    .some(time=>Date.parse(time)!==at))
    ctx.addIssue({code:'custom',path:['snapshot','asOf'],message:'Overlay sections must share one asOf'});
  if(value.snapshot.versions.overlay!=='BETA_OVERLAY:'+value.overlay.version)
    ctx.addIssue({code:'custom',path:['snapshot','versions','overlay'],message:'Overlay receipt version mismatch'});
});
export type DemoOverlayResult=z.infer<typeof DemoOverlayResultSchema>;
