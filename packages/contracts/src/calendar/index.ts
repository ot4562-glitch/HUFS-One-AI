import {z} from 'zod';

// TASK-00/#52: calendar is a scoped, derived VIEW, not a new source of student facts.
// The API must authorize the actor/grant and compute it from the same verified asOf.
const Iso=z.iso.datetime({offset:true});
const Id=z.string().trim().min(1).max(256);
const Label=z.string().trim().min(1).max(500);
const UniqueTokens=z.array(z.string().trim().min(1).max(128)).max(32);
export const CalendarImportanceSchema=z.enum(['CRITICAL','REQUIRED','PERSONAL','RECOMMENDED','SAVED']);
export const CalendarEntryKindSchema=z.enum(['STUDENT_DEADLINE','APPLY_DEADLINE','EVENT']);

export const CalendarEntrySchema=z.strictObject({
  id:Id,
  source:z.enum(['NOTICE','OPPORTUNITY']),
  refId:Id,
  title:Label,
  kind:CalendarEntryKindSchema,
  importance:CalendarImportanceSchema,
  at:Iso,
  end:Iso.optional(),
  seoulDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  overdue:z.boolean(),
  evidenceRefs:z.array(Id).max(32),
});
export type CalendarEntry=z.infer<typeof CalendarEntrySchema>;

export const CalendarUndatedItemSchema=z.strictObject({
  source:z.enum(['NOTICE','OPPORTUNITY']),
  refId:Id,
  title:Label,
  reason:z.enum(['ROLLING','DEADLINE_UNKNOWN']),
  importance:CalendarImportanceSchema,
});
export type CalendarUndatedItem=z.infer<typeof CalendarUndatedItemSchema>;

/** UNKNOWN applicability must not be turned into a confirmed deadline or severity badge. */
export const CalendarNeedsConfirmationSchema=z.strictObject({
  refId:Id,
  title:Label,
  unknownScope:UniqueTokens.min(1),
});
export type CalendarNeedsConfirmation=z.infer<typeof CalendarNeedsConfirmationSchema>;

function seoulDay(iso:string):string{
  const value=new Date(Date.parse(iso)+9*60*60*1000);
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth()+1).padStart(2,'0')}-${String(value.getUTCDate()).padStart(2,'0')}`;
}

export const CalendarResultSchema=z.strictObject({
  asOf:Iso,
  from:Iso,
  to:Iso,
  entries:z.array(CalendarEntrySchema).max(300),
  undated:z.array(CalendarUndatedItemSchema).max(100),
  needsConfirmation:z.array(CalendarNeedsConfirmationSchema).max(100),
  /** Internal audit IDs only. The UI should not portray ambiguous inputs as valid events. */
  ambiguousNoticeIds:z.array(Id).max(100),
}).superRefine((v,ctx)=>{
  const asOf=Date.parse(v.asOf),from=Date.parse(v.from),to=Date.parse(v.to);
  if(from>asOf||to<asOf||to<from)
    ctx.addIssue({code:'custom',path:['from'],message:'Calendar window must contain asOf'});
  const seen=new Set<string>();
  for(const [i,e] of v.entries.entries()){
    const at=Date.parse(e.at);
    if(seen.has(e.id))
      ctx.addIssue({code:'custom',path:['entries',i,'id'],message:'Duplicate calendar entry'});
    seen.add(e.id);
    if(!e.id.startsWith(`${e.source}:${e.refId}:${e.kind}:`))
      ctx.addIssue({code:'custom',path:['entries',i,'id'],message:'ID does not match reference and kind'});
    if(e.source==='NOTICE'&&e.kind==='APPLY_DEADLINE' ||
       e.source==='OPPORTUNITY'&&e.kind==='STUDENT_DEADLINE')
      ctx.addIssue({code:'custom',path:['entries',i,'kind'],message:'Invalid source / deadline kind'});
    if(e.seoulDate!==seoulDay(e.at))
      ctx.addIssue({code:'custom',path:['entries',i,'seoulDate'],message:'Incorrect Seoul calendar day'});
    if(e.end!==undefined&&Date.parse(e.end)<at)
      ctx.addIssue({code:'custom',path:['entries',i,'end'],message:'Event ends before start'});
    const deadline=e.kind!=='EVENT';
    if(e.overdue!==(deadline&&at<=asOf))
      ctx.addIssue({code:'custom',path:['entries',i,'overdue'],message:'Incorrect deadline status asOf'});
    if(at>to || (deadline?at<from:Date.parse(e.end??e.at)<asOf))
      ctx.addIssue({code:'custom',path:['entries',i,'at'],message:'Entry outside visible window'});
    if(new Set(e.evidenceRefs).size!==e.evidenceRefs.length)
      ctx.addIssue({code:'custom',path:['entries',i,'evidenceRefs'],message:'Duplicate evidence reference'});
  }
  const seenUndated=new Set<string>();
  for(const [i,item] of v.undated.entries()){
    const key=`${item.source}:${item.refId}`;
    if(seenUndated.has(key))
      ctx.addIssue({code:'custom',path:['undated',i,'refId'],message:'Duplicate undated item'});
    seenUndated.add(key);
  }
  const seenConfirmation=new Set<string>();
  for(const [i,item] of v.needsConfirmation.entries()){
    if(seenConfirmation.has(item.refId))
      ctx.addIssue({code:'custom',path:['needsConfirmation',i,'refId'],message:'Duplicate confirmation item'});
    seenConfirmation.add(item.refId);
    if(new Set(item.unknownScope).size!==item.unknownScope.length)
      ctx.addIssue({code:'custom',path:['needsConfirmation',i,'unknownScope'],message:'Duplicate unknown cause'});
  }
  const ambiguous=new Set(v.ambiguousNoticeIds);
  if(ambiguous.size!==v.ambiguousNoticeIds.length)
    ctx.addIssue({code:'custom',path:['ambiguousNoticeIds'],message:'Duplicate ambiguous ID'});
  for(const [i,e] of v.entries.entries()){
    if(e.source==='NOTICE'&&ambiguous.has(e.refId))
      ctx.addIssue({code:'custom',path:['entries',i,'refId'],message:'Ambiguous notice cannot be a calendar event'});
  }
  for(const [i,e] of v.undated.entries()){
    if(e.source==='NOTICE'&&ambiguous.has(e.refId))
      ctx.addIssue({code:'custom',path:['undated',i,'refId'],message:'Ambiguous notice cannot be displayed'});
  }
  for(const [i,e] of v.needsConfirmation.entries()){
    if(ambiguous.has(e.refId))
      ctx.addIssue({code:'custom',path:['needsConfirmation',i,'refId'],message:'Ambiguous notice cannot be displayed'});
  }
});
export type CalendarResult=z.infer<typeof CalendarResultSchema>;

/** Runtime wire validator for the server; never authorize access based on this parse alone. */
export function validateCalendarWire(payload:unknown,expectedAsOf:string):CalendarResult {
  const parsed=CalendarResultSchema.parse(payload);
  if(Date.parse(parsed.asOf)!==Date.parse(Iso.parse(expectedAsOf))) {
    throw new RangeError('Calendar asOf differs from the authorized projection');
  }
  return parsed;
}
