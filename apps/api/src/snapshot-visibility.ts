import {z} from 'zod';
import {DemoSnapshotSchema} from '@hufs-one/contracts';

/** Internal metadata only; it carries no precomputed or academic section. */
// Full snapshots have cross-section refinements. Reuse the four field schemas
// without deriving an object from (or removing checks on) the full wire schema.
export const SnapshotMetadataSchema=z.strictObject({
  demoSubjectId:DemoSnapshotSchema.shape.demoSubjectId,
  datasetMode:DemoSnapshotSchema.shape.datasetMode,
  asOf:DemoSnapshotSchema.shape.asOf,
  versions:DemoSnapshotSchema.shape.versions,
});

/** Call only after checking current authority. Never read a hidden value:
 * neither schema validation nor summary timestamps may affect visible output. */
export function maskUnsharedSnapshot(source:unknown,academics:boolean,forecast:boolean):unknown {
  if(source===null||typeof source!=='object'||Array.isArray(source))return source;
  const input=source as Record<string,unknown>;
  const visible:Record<string,unknown>=Object.create(null);
  for(const key of Object.keys(input)){
    if(key==='academics'&&!academics)continue;
    if(key==='forecast'&&!forecast)continue;
    visible[key]=input[key];
  }
  if(!academics)visible.academics={state:'NOT_SHARED'};
  if(!forecast)visible.forecast={state:'NOT_SHARED'};
  return visible;
}
