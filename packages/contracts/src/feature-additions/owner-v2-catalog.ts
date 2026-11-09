/** #348 v2 catalog browser contract. Never accepts browser-provided source or owner IDs. */
import {z} from 'zod';
import {SignedCatalogPageV2Schema} from './results.js';

const Id=z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/);
const Iso=z.iso.datetime({offset:true});
export const OwnerV2CatalogQuerySchema=z.strictObject({
  q:z.string().trim().max(100).optional(),
  category:Id.optional(),campus:Id.optional(),
  eligibility:z.enum(['MET','NOT_MET','UNKNOWN']).optional(),
  deadlineBefore:Iso.optional(),includeClosed:z.boolean().optional(),
  sort:z.enum(['TITLE','DEADLINE_ASC','PUBLISHED_DESC']).default('TITLE'),
  pageSize:z.coerce.number().int().min(1).max(50).default(20),
  asOf:Iso.optional(),
  /** Opaque server-signed continuation; requires the unchanged first-page asOf. */
  cursor:z.string().min(16).max(2048).optional(),
}).superRefine((value,ctx)=>{
  if(value.cursor&&!value.asOf)ctx.addIssue({code:'custom',path:['asOf'],
    message:'A signed continuation requires the initial page asOf'});
});
export type OwnerV2CatalogQuery=z.infer<typeof OwnerV2CatalogQuerySchema>;
export const OwnerV2CatalogResponseSchema=z.discriminatedUnion('state',[
  z.strictObject({state:z.literal('NOT_CONNECTED'),asOf:Iso}),
  z.strictObject({state:z.literal('READY'),sourceVersion:Id,
    page:SignedCatalogPageV2Schema}),
]);
export type OwnerV2CatalogResponse=z.infer<typeof OwnerV2CatalogResponseSchema>;
