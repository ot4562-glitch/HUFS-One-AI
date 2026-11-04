import {
  AI_TASK_RESULT_SCHEMA_VERSION,AiConditionKindSchema,AiDateKindSchema,aiResultEvidence,
  type AiTaskResult,type SafeLlmPacket,
} from '@hufs-one/contracts';

function fail():never {throw new Error('AI_TASK_RESULT_REQUIRES_REVIEW');}
const unique=(items:readonly string[])=>new Set(items).size === items.length;
const same=(left:readonly string[],right:readonly string[])=>left.length === right.length
  &&left.every((item,index)=>item === right[index]);
const opaque=(value:string)=>value.length<=128&&/^[A-Za-z0-9_.:-]+$/.test(value);

/** Validate ambiguity before provider transmission, and again against a fresh packet on cache reads. */
export function hasTaskResultContract(packet:SafeLlmPacket):boolean {
  if(packet.schemaVersion.startsWith('ai-task-result-')&&packet.schemaVersion !== AI_TASK_RESULT_SCHEMA_VERSION)fail();
  if(packet.schemaVersion !== AI_TASK_RESULT_SCHEMA_VERSION)return false;
  if(!opaque(packet.packetId)||packet.sourceTokens.length === 0
    ||!unique(packet.sourceTokens.map(source=>source.token))
    ||!unique(packet.allowedObjectTokens)||!packet.allowedObjectTokens.every(opaque)
    ||!unique(packet.allowedTopicCodes)
    ||!unique(packet.approvedFacts.map(fact=>JSON.stringify([fact.token,fact.key])))
    ||packet.approvedFacts.some(fact=>!opaque(fact.token)||!opaque(fact.key)))fail();
  for(const source of packet.sourceTokens){
    if(!opaque(source.token)||source.paragraphs.length === 0
      ||!unique(source.paragraphs.map(paragraph=>paragraph.id))
      ||source.paragraphs.some(paragraph=>!opaque(paragraph.id)))fail();
  }
  const selected=packet.task === 'personal_action_brief'||packet.task === 'graduation_explanation';
  if(selected?packet.allowedObjectTokens.length>3:packet.allowedObjectTokens.length !== 0)fail();
  if(packet.task === 'graduation_explanation'&&packet.allowedObjectTokens.length === 0)fail();
  if((packet.task === 'experience_skills'||packet.task === 'opportunity_terms')&&packet.allowedTopicCodes.length === 0)fail();
  return true;
}

export function validateTaskResult(packet:SafeLlmPacket,candidate:{
  citations:readonly {quote:string}[];result?:AiTaskResult|undefined;
}):void {
  if(!hasTaskResultContract(packet)){
    if(candidate.result !== undefined)fail();
    return;
  }
  const result=candidate.result;
  if(!result||result.kind !== packet.task)fail();
  // Extractive first version: each displayed phrase must occur in every cited quote.
  // Classification is still a human-review candidate, never an eligibility or graduation verdict.
  for(const evidence of aiResultEvidence(result)){
    if(evidence.citationIndexes.some(index=>!candidate.citations[index]?.quote.includes(evidence.text)))fail();
  }
  switch(result.kind){
    case 'experience_skills':
      if(result.skills.some(item=>!packet.allowedTopicCodes.includes(item.topicCode)))fail();
      break;
    case 'opportunity_terms':
      if(result.topicCodes.some(topic=>!packet.allowedTopicCodes.includes(topic)))fail();
      break;
    case 'personal_action_brief':
      if(!same(result.actions.map(item=>item.actionToken),packet.allowedObjectTokens))fail();
      break;
    case 'graduation_explanation':
      if(!same(result.requirements.map(item=>item.requirementToken),packet.allowedObjectTokens))fail();
      for(const item of result.requirements){
        // Numeric credits/dates belong to deterministic code-owned fact rendering.
        if(/\p{N}/u.test(item.explanation.text))fail();
        for(const key of item.factKeys){
          if(packet.approvedFacts.filter(fact=>fact.token === item.requirementToken&&fact.key === key).length !== 1)fail();
        }
      }
  }
}

type JsonSchema=Record<string,unknown>;
const object=(properties:Record<string,JsonSchema>):JsonSchema=>({
  type:'object',properties,required:Object.keys(properties),
});
const array=(items:JsonSchema,max:number,min=0):JsonSchema=>({type:'array',items,minItems:min,maxItems:max});
const enumeration=(values:readonly string[]):JsonSchema=>({type:'string',...(values.length?{enum:[...values]}:{})});
const evidence=()=>object({text:{type:'string'},citationIndexes:array({type:'integer',minimum:0,maximum:5},6,1)});

/** Only the documented HCX-007 subset; no arbitrary caller schema, pattern, tools or thinking. */
export function taskResultJsonSchema(packet:SafeLlmPacket):JsonSchema {
  if(!hasTaskResultContract(packet))fail();
  const kind=enumeration([packet.task]);
  switch(packet.task){
    case 'experience_skills':return object({kind,skills:array(object({
      topicCode:enumeration(packet.allowedTopicCodes),skill:evidence(),role:evidence(),
    }),6,1)});
    case 'opportunity_terms':return object({kind,
      topicCodes:array(enumeration(packet.allowedTopicCodes),5,1),
      conditions:array(object({kind:enumeration(AiConditionKindSchema.options),evidence:evidence()}),12),
      dates:array(object({kind:enumeration(AiDateKindSchema.options),evidence:evidence()}),6),
      roleSteps:array(object({role:evidence(),step:evidence()}),6),
    });
    case 'personal_action_brief':return object({kind,headline:evidence(),actions:array(object({
      actionToken:enumeration(packet.allowedObjectTokens),explanation:evidence(),
    }),packet.allowedObjectTokens.length,packet.allowedObjectTokens.length)});
    case 'graduation_explanation':return object({kind,requirements:array(object({
      requirementToken:enumeration(packet.allowedObjectTokens),explanation:evidence(),
      factKeys:array(enumeration([...new Set(packet.approvedFacts.map(fact=>fact.key))]),8,1),
    }),packet.allowedObjectTokens.length,packet.allowedObjectTokens.length)});
  }
}
