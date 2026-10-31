import {z} from 'zod';
import {InterestTopicsSchema,DesiredJobTopicsSchema} from '@hufs-one/contracts';
import type {SubjectAlias} from '@hufs-one/contracts';
/** Simulated feature writes; NEVER call production applications, mail, NCP or DB. */
const SyntheticId=z.string().regex(/^SYN-[A-Z0-9_-]{1,70}$/);
export const ReviewerSandboxActionSchema=z.discriminatedUnion('kind',[
  z.strictObject({kind:z.literal('BOOKMARK'),itemId:SyntheticId,saved:z.boolean()}),
  z.strictObject({kind:z.literal('MARK_READ'),itemId:SyntheticId,read:z.boolean()}),
  z.strictObject({kind:z.literal('CHECKLIST'),requirementId:SyntheticId,done:z.boolean()}),
  z.strictObject({kind:z.literal('EXPERIENCE'),experienceId:SyntheticId,note:z.string().max(280)}),
  z.strictObject({kind:z.literal('APPLICATION_DRAFT'),opportunityId:SyntheticId,text:z.string().max(1200)}),
  z.strictObject({kind:z.literal('SIMULATE_APPLICATION'),opportunityId:SyntheticId}),
  // Every interaction stays inside this REVIEWER's isolated synthetic workspace.
  z.strictObject({kind:z.literal('SET_INTERESTS'),topics:InterestTopicsSchema}),
  z.strictObject({kind:z.literal('SET_DESIRED_JOBS'),topics:DesiredJobTopicsSchema}),
  z.strictObject({kind:z.literal('PLAN_COURSE'),courseId:SyntheticId,planned:z.boolean()}),
  z.strictObject({kind:z.literal('SET_SEARCH'),query:z.string().trim().max(100)}),
  z.strictObject({kind:z.literal('SET_NOTIFICATIONS'),enabled:z.boolean()}),
  z.strictObject({kind:z.literal('RESET_SANDBOX')}),
]);
export type ReviewerSandboxAction=z.infer<typeof ReviewerSandboxActionSchema>;
export interface ReviewerSandboxResult {
  subjectId:SubjectAlias;mode:'SYNTHETIC_SANDBOX';actions:ReviewerSandboxAction[];
}
export interface ReviewerSandboxStore {
  save(input:{inviteId:string;actorId:string;subjectId:SubjectAlias;action:ReviewerSandboxAction}):Promise<ReviewerSandboxResult>;
  read(input:{inviteId:string;actorId:string;subjectId:SubjectAlias}):Promise<ReviewerSandboxResult>;
}
/** Local test-only adapter, 200 actions per actor/subject to bound memory use. */
export class MemoryReviewerSandboxStore implements ReviewerSandboxStore{
  private readonly state=new Map<string,ReviewerSandboxAction[]>();
  private key(input:{inviteId:string;actorId:string;subjectId:SubjectAlias}){
    return [input.inviteId,input.actorId,input.subjectId].join('\0');
  }
  async save(input:{inviteId:string;actorId:string;subjectId:SubjectAlias;action:ReviewerSandboxAction})
    :Promise<ReviewerSandboxResult>{
    const action=ReviewerSandboxActionSchema.parse(input.action);
    const key=this.key(input),prev=this.state.get(key)??[];
    if(action.kind==='RESET_SANDBOX'){
      this.state.delete(key);
      return {subjectId:input.subjectId,mode:'SYNTHETIC_SANDBOX',actions:[]};
    }
    if(prev.length>=200)throw new Error('Sandbox action storage cap reached');
    const next=[...prev,structuredClone(action)];
    this.state.set(key,next);
    return {subjectId:input.subjectId,mode:'SYNTHETIC_SANDBOX',actions:structuredClone(next)};
  }
  async read(input:{inviteId:string;actorId:string;subjectId:SubjectAlias}):Promise<ReviewerSandboxResult>{
    return {subjectId:input.subjectId,mode:'SYNTHETIC_SANDBOX',
      actions:structuredClone(this.state.get(this.key(input))??[])};
  }
}
