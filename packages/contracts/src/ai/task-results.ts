import {z} from 'zod';
import {TopicCodeSchema} from '../topics/index.js';

/** Opt-in output contract. Legacy citation-only packets keep their existing schema version. */
export const AI_TASK_RESULT_SCHEMA_VERSION='ai-task-result-v1' as const;
const Token=z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/);
const unique=<T>(items:T[])=>new Set(items).size === items.length;
export const AiEvidenceTextSchema=z.strictObject({
  text:z.string().min(1).max(600).refine(text=>text.trim().length>0),
  citationIndexes:z.array(z.number().int().min(0).max(5)).min(1).max(6).refine(unique),
});
export type AiEvidenceText=z.infer<typeof AiEvidenceTextSchema>;
export const AiConditionKindSchema=z.enum(['ELIGIBILITY','PRIORITY','COMPLETION']);
export const AiDateKindSchema=z.enum(['APPLICATION_DEADLINE','EVENT_PERIOD','RESULT_ANNOUNCEMENT','OTHER','UNKNOWN']);

export const AiTaskResultSchema=z.discriminatedUnion('kind',[
  z.strictObject({
    kind:z.literal('experience_skills'),
    skills:z.array(z.strictObject({
      topicCode:TopicCodeSchema,skill:AiEvidenceTextSchema,role:AiEvidenceTextSchema,
    })).min(1).max(6),
  }),
  z.strictObject({
    kind:z.literal('opportunity_terms'),
    topicCodes:z.array(TopicCodeSchema).min(1).max(5).refine(unique),
    conditions:z.array(z.strictObject({kind:AiConditionKindSchema,evidence:AiEvidenceTextSchema})).max(12),
    dates:z.array(z.strictObject({kind:AiDateKindSchema,evidence:AiEvidenceTextSchema})).max(6),
    roleSteps:z.array(z.strictObject({role:AiEvidenceTextSchema,step:AiEvidenceTextSchema})).max(6),
  }),
  z.strictObject({
    kind:z.literal('personal_action_brief'),headline:AiEvidenceTextSchema,
    actions:z.array(z.strictObject({actionToken:Token,explanation:AiEvidenceTextSchema})).max(3),
  }),
  z.strictObject({
    kind:z.literal('graduation_explanation'),
    requirements:z.array(z.strictObject({
      requirementToken:Token,explanation:AiEvidenceTextSchema,
      // Values and numeric tables come from code; the model can only reference keys.
      factKeys:z.array(Token).min(1).max(8).refine(unique),
    })).min(1).max(3),
  }),
]);
export type AiTaskResult=z.infer<typeof AiTaskResultSchema>;

export function aiResultEvidence(result:AiTaskResult):AiEvidenceText[] {
  switch(result.kind){
    case 'experience_skills':return result.skills.flatMap(item=>[item.skill,item.role]);
    case 'opportunity_terms':return [...result.conditions.map(item=>item.evidence),
      ...result.dates.map(item=>item.evidence),...result.roleSteps.flatMap(item=>[item.role,item.step])];
    case 'personal_action_brief':return [result.headline,...result.actions.map(item=>item.explanation)];
    case 'graduation_explanation':return result.requirements.map(item=>item.explanation);
  }
}

/** Shape-level binding for API/browser DTOs. Actual packet evidence is rechecked on the server. */
export function hasValidAiTaskResultBindings(candidate:{
  task:string;citations:readonly unknown[];objectTokens:readonly string[];result?:AiTaskResult|undefined;
}):boolean {
  const result=candidate.result;
  if(!result)return true;
  if(result.kind!==candidate.task||aiResultEvidence(result).some(item=>
    item.citationIndexes.some(index=>index>=candidate.citations.length)))return false;
  const selected=result.kind === 'personal_action_brief'?result.actions.map(item=>item.actionToken):
    result.kind === 'graduation_explanation'?result.requirements.map(item=>item.requirementToken):[];
  return unique(selected)&&selected.length === candidate.objectTokens.length
    &&selected.every((token,index)=>token === candidate.objectTokens[index]);
}
