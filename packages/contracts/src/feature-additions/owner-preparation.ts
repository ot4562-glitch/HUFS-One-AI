/** #343/#349 — strictly bounded owner-only response; never an award or issued credential. */
import {z} from 'zod';
import {ScholarshipReportV2Schema,BadgePreparationV2Schema} from './results.js';

const Iso=z.iso.datetime({offset:true});
const Id=z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/);
export const OwnerPreparationResponseSchema=z.discriminatedUnion('state',[
  z.strictObject({state:z.literal('NOT_CONNECTED'),asOf:Iso}),
  z.strictObject({
    state:z.literal('READY'),asOf:Iso,sourceVersion:Id,
    scholarships:z.array(ScholarshipReportV2Schema).max(20),
    badges:z.array(BadgePreparationV2Schema).max(20),
  }),
]);
export type OwnerPreparationResponse=z.infer<typeof OwnerPreparationResponseSchema>;
