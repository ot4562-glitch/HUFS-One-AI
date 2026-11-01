import {z} from 'zod';
import {InterestTopicsSchema,DesiredJobTopicsSchema} from '../topics/index.js';
import {ISODateTimeSchema} from '../identity/index.js';

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
