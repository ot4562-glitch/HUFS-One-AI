import {z} from 'zod';
import {ISODateTimeSchema} from '../identity/index.js';
import {OfferingSignalSchema} from '../academics/index.js';

const Id=z.string().trim().min(1).max(128);
const Version=z.string().min(1).max(200);
const Term=z.string().regex(/^(19|20|21)\d{2}-[12]$/);
const Scope={
  expectedDatasetVersion:Version,
  expectedProjectionVersion:Version,
  expectedGrantVersion:Version,
  expectedAsOf:ISODateTimeSchema,
};
/** A demo context is not the student's private transcript or an approved study plan.
 * No browser-selected transcript, RulePack or academic authority is accepted. */
export const DemoPlanSimulationRequestSchema=z.strictObject({
  ...Scope,
  plannedCourses:z.array(z.strictObject({
    courseId:Id,term:Term,creditUnits:z.number().int().min(1).max(18),
  })).max(20),
}).superRefine((input,ctx)=>{
  const keys=new Set<string>();
  for(const [i,course] of input.plannedCourses.entries()){
    const key=course.term+'\0'+course.courseId;
    if(keys.has(key))ctx.addIssue({code:'custom',path:['plannedCourses',i],
      message:'Duplicate course in same term'});
    keys.add(key);
  }
});
export type DemoPlanSimulationRequest=z.infer<typeof DemoPlanSimulationRequestSchema>;
export const DemoPlanSimulationResponseSchema=z.strictObject({
  state:z.enum(['HYPOTHETICAL_ONLY','PENDING']),
  contextId:Id,asOf:ISODateTimeSchema,rulePackVersion:Version.optional(),
  current:z.strictObject({earnedCreditUnits:z.number().int().nonnegative(),
    inProgressCreditUnits:z.number().int().nonnegative(),
    plannedCreditUnits:z.number().int().nonnegative()}).optional(),
  hypothetical:z.strictObject({additionalPlannedCreditUnits:z.number().int().nonnegative(),
    resultingPlannedCreditUnits:z.number().int().nonnegative()}).optional(),
  caveats:z.array(z.string().min(1)).min(1).max(8),
});
export const DemoOutlookScenarioRequestSchema=z.strictObject({
  ...Scope,
  targetTerm:Term,
  courseIds:z.array(Id).min(1).max(20),
  assumption:z.enum(['UNCHANGED','POSSIBLE_STAFF_CHANGE','POSSIBLE_CURRICULUM_CHANGE']),
}).superRefine((input,ctx)=>{
  if(new Set(input.courseIds).size!==input.courseIds.length)
    ctx.addIssue({code:'custom',path:['courseIds'],message:'Duplicate course'});
});
export type DemoOutlookScenarioRequest=z.infer<typeof DemoOutlookScenarioRequestSchema>;
export const DemoOutlookScenarioResponseSchema=z.strictObject({
  state:z.enum(['HYPOTHETICAL_ONLY','PENDING']),
  contextId:Id,asOf:ISODateTimeSchema,targetTerm:Term,
  assumption:DemoOutlookScenarioRequestSchema.shape.assumption,
  items:z.array(z.strictObject({
    courseId:Id,baselineSignal:OfferingSignalSchema,
    hypotheticalSignal:z.literal('NEEDS_REVIEW'),
    evidenceRefs:z.array(Id).max(20),
    caveat:z.string().min(1),
  })).max(20),
  caveats:z.array(z.string().min(1)).min(1).max(8),
});
