import {z} from 'zod';
const Id=z.string().regex(/^[A-Za-z0-9_-]{1,90}$/);
const Mode=z.enum(['SYNTHETIC','OWNER_CONSENTED']);
export const WorkspaceKindSchema=z.enum(['EXPERIENCE','STUDY_PLAN','BOOKMARK','ACTION_PLAN']);
const Experience=z.strictObject({
  kind:z.literal('EXPERIENCE'),dataMode:Mode,
  state:z.enum(['DRAFT','SELF_REPORTED']),
  title:z.string().trim().min(1).max(120),
  summary:z.string().trim().max(500),
  role:z.string().trim().max(80).optional(),
  startedOn:z.iso.date().optional(),endedOn:z.iso.date().optional(),
  sourceOpportunityId:Id.optional(),
}).superRefine((x,ctx)=>{
  if(x.startedOn&&x.endedOn&&x.startedOn>x.endedOn)
    ctx.addIssue({code:'custom',message:'Experience dates out of order'});
});
const StudyPlan=z.strictObject({
  kind:z.literal('STUDY_PLAN'),dataMode:Mode,state:z.literal('DRAFT'),
  courseId:Id,targetTerm:z.union([z.string().regex(/^20\d{2}-[12]$/),z.literal('UNDECIDED')]),
  planned:z.boolean(),
});
const Bookmark=z.strictObject({
  kind:z.literal('BOOKMARK'),dataMode:Mode,
  opportunityId:Id,state:z.literal('SAVED'),
});
const Action=z.strictObject({
  kind:z.literal('ACTION_PLAN'),dataMode:Mode,state:z.literal('DRAFT'),
  opportunityId:Id,
  task:z.string().trim().min(1).max(160),
  done:z.boolean(),
  dueAt:z.iso.datetime({offset:true}).optional(),
});
export const OwnerWorkspaceValueSchema=z.union([Experience,StudyPlan,Bookmark,Action]);
export type OwnerWorkspaceValue=z.infer<typeof OwnerWorkspaceValueSchema>;
export type WorkspaceKind=z.infer<typeof WorkspaceKindSchema>;
export const OwnerWorkspaceCreateSchema=z.strictObject({
  itemId:Id,value:OwnerWorkspaceValueSchema,
});
export const OwnerWorkspaceUpdateSchema=z.strictObject({
  expectedVersion:z.number().int().min(1).max(Number.MAX_SAFE_INTEGER-1),
  value:OwnerWorkspaceValueSchema,
});
export const OwnerWorkspaceDeleteSchema=z.strictObject({
  expectedVersion:z.number().int().min(1).max(Number.MAX_SAFE_INTEGER-1),
});
export const OwnerWorkspaceRecordSchema=z.strictObject({
  itemId:Id,version:z.number().int().min(1),
  value:OwnerWorkspaceValueSchema,
  updatedAt:z.iso.datetime({offset:true}),
});
export type OwnerWorkspaceRecord=z.infer<typeof OwnerWorkspaceRecordSchema>;
