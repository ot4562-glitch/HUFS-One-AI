import {OwnerWorkspaceRecordSchema,OwnerWorkspaceValueSchema,
  type OwnerWorkspaceRecord,type OwnerWorkspaceValue} from '@hufs-one/contracts';

function isoAtNoon(date:string):string|undefined{
  if(!date)return undefined;
  if(!/^20\d{2}-\d{2}-\d{2}$/.test(date))throw new TypeError('Invalid action target date');
  const iso=new Date(date+'T12:00:00.000Z');
  if(!Number.isFinite(iso.valueOf())||iso.toISOString().slice(0,10)!==date)
    throw new TypeError('Impossible action target date');
  return iso.toISOString();
}
/** Action plans are private self-reported reminders, not submitted applications. */
export function newCareerAction(opportunityId:string,task:string,dueDate=''):OwnerWorkspaceValue{
  const dueAt=isoAtNoon(dueDate);
  return OwnerWorkspaceValueSchema.parse({
    kind:'ACTION_PLAN',dataMode:'OWNER_CONSENTED',state:'DRAFT',
    opportunityId,task:task.trim(),done:false,...(dueAt?{dueAt}:{}),
  });
}
/** No retargeting, provenance promotion, or cross-item writes when toggling done. */
export function updateCareerAction(record:OwnerWorkspaceRecord,
  update:{task?:string;dueDate?:string;done?:boolean}):OwnerWorkspaceValue{
  const previous=OwnerWorkspaceRecordSchema.parse(record);
  if(previous.value.kind!=='ACTION_PLAN'||previous.value.dataMode!=='OWNER_CONSENTED')
    throw new TypeError('Owner action plan required');
  const value=previous.value;
  const dueAt=update.dueDate===undefined?value.dueAt:isoAtNoon(update.dueDate);
  return OwnerWorkspaceValueSchema.parse({
    ...value,...(update.task===undefined?{}:{task:update.task.trim()}),
    ... (update.done===undefined?{}:{done:update.done}),
    dueAt,
  });
}
