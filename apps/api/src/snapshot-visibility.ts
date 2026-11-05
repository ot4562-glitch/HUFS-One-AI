import {DemoSnapshotSchema} from '@hufs-one/contracts';

/** Internal metadata only; it carries no precomputed or academic section. */
export const SnapshotMetadataSchema=DemoSnapshotSchema.pick({
  demoSubjectId:true,datasetMode:true,asOf:true,versions:true,
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
