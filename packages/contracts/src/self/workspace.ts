import {BookmarkStageSchema,BookmarkOutcomeSchema} from './bookmark-stage.js';
import {z} from 'zod';
import {RecognitionProofReviewSchema} from '../feature-additions/proof-review.js';
const Id=z.string().regex(/^[A-Za-z0-9_-]{1,90}$/);
const Mode=z.enum(['SYNTHETIC','OWNER_CONSENTED']);
export const WorkspaceKindSchema=z.enum(['EXPERIENCE','STUDY_PLAN','BOOKMARK','ACTION_PLAN','GUIDE_CHECKLIST','RECOGNITION_PROOF']);
/** Owner-submitted references are links, not verified credentials or institution evidence. Never fetch automatically. */
export const OwnerExperienceReferenceUrlSchema=z.url().max(500).refine(value=>{
  try{
    const u=new URL(value);
    return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash
      &&u.port===''&&/^[a-z0-9.-]+$/i.test(u.hostname)
      &&u.hostname.includes('.')&&!u.hostname.endsWith('.localhost')
      &&!u.hostname.endsWith('.internal')&&!u.hostname.endsWith('.local')
      &&!u.hostname.includes('..')&&!/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)
      &&u.hostname!=='localhost';
  }catch{return false;}
},{message:'Only public HTTPS reference pages without tracking/query tokens are allowed'});
const Experience=z.strictObject({
  kind:z.literal('EXPERIENCE'),dataMode:Mode,
  state:z.enum(['DRAFT','SELF_REPORTED']),
  title:z.string().trim().min(1).max(120),
  summary:z.string().trim().max(500),
  role:z.string().trim().max(80).optional(),
  startedOn:z.iso.date().optional(),endedOn:z.iso.date().optional(),
  sourceOpportunityId:Id.optional(),
  // Optional, backwards compatible categories for the owner-only career timeline.
  category:z.enum(['PROJECT','CLUB','VOLUNTEERING','WORK','INTERNSHIP','CONTEST','CERTIFICATE','EDUCATION','OTHER']).optional(),
  achievement:z.string().trim().max(240).optional(),
  referenceUrl:OwnerExperienceReferenceUrlSchema.optional(),
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
  // Old rows have no stage. The owner-only HTTP handler treats them as INTERESTED.
  stage:BookmarkStageSchema.optional(),
  outcome:BookmarkOutcomeSchema.optional(),
}).superRefine((value,ctx)=>{
  if(value.stage==='RESULT_RECORDED'&&!value.outcome)
    ctx.addIssue({code:'custom',path:['outcome'],message:'Owner outcome required'});
  if(value.stage!=='RESULT_RECORDED'&&value.outcome)
    ctx.addIssue({code:'custom',path:['outcome'],message:'Outcome is only for the final stage'});
});
const Action=z.strictObject({
  kind:z.literal('ACTION_PLAN'),dataMode:Mode,state:z.literal('DRAFT'),
  opportunityId:Id,
  task:z.string().trim().min(1).max(160),
  done:z.boolean(),
  dueAt:z.iso.datetime({offset:true}).optional(),
});
const GuideRef=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const GuideChecklist=z.strictObject({kind:z.literal('GUIDE_CHECKLIST'),dataMode:z.literal('OWNER_CONSENTED'),
  state:z.literal('SELF_REPORTED'),guideId:GuideRef,guideRevisionId:GuideRef,
  locale:z.enum(['ko','en','zh']),translationVersion:GuideRef,contextVersion:z.string().regex(/^[a-f0-9]{64}$/),
  ownerCheckedStepIds:z.array(GuideRef).max(50).refine(ids=>new Set(ids).size===ids.length),
});
export const OwnerWorkspaceValueSchema=z.union([Experience,StudyPlan,Bookmark,Action,GuideChecklist,RecognitionProofReviewSchema]);
export type OwnerWorkspaceValue=z.infer<typeof OwnerWorkspaceValueSchema>;
export type WorkspaceKind=z.infer<typeof WorkspaceKindSchema>;
export const OwnerWorkspaceCreateSchema=z.strictObject({
  itemId:Id,value:OwnerWorkspaceValueSchema,
}).superRefine((input,ctx)=>{
  // Creating an already submitted/decided item would bypass the owner-only CAS
  // state machine. Legacy un-staged SAVED and explicit INTERESTED are accepted.
  if(input.value.kind==='BOOKMARK'&&
    (input.value.stage!==undefined&&input.value.stage!=='INTERESTED'
      ||input.value.outcome!==undefined))
    ctx.addIssue({code:'custom',path:['value','stage'],
      message:'Bookmarks start at INTERESTED; advance with owner-only PATCH'});
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
