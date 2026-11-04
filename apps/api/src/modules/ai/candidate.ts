import {z} from 'zod';
import {AiTaskSchema, SafeLlmPacketSchema, TopicCodeSchema} from '@hufs-one/contracts';
import {ApiFailure} from '../auth/gates.js';
import {validateHcxCandidate} from '../../../../../packages/ai/src/clova-wire.js';

const ModelCandidate = z.strictObject({
  task: AiTaskSchema,
  citations: z.array(z.strictObject({
    sourceToken: z.string().min(1),
    paragraphId: z.string().min(1),
    quote: z.string().min(1).max(600),
    topicCode: TopicCodeSchema.optional(),
  })).max(6),
  reviewRequired: z.literal(true),
});

/** A quote match is only a candidate; it is not human-reviewed truth. */
export function validateModelCandidate(packet:unknown,raw:unknown) {
  const x=SafeLlmPacketSchema.safeParse(packet);
  if(x.success&&x.data.schemaVersion.startsWith('ai-task-result-')){
    try{
      const candidate=validateHcxCandidate(x.data,raw);
      return {...candidate,reviewState:'NEEDS_REVIEW' as const,provenance:'MOCK' as const};
    }catch{throw new ApiFailure('UNVERIFIED_EVIDENCE');}
  }
  const y=ModelCandidate.safeParse(raw);
  if(!x.success||!y.success||x.data.task!==y.data.task)
    throw new ApiFailure('UNVERIFIED_EVIDENCE');
  for(const line of y.data.citations) {
    const source=x.data.sourceTokens.find(s=>s.token===line.sourceToken);
    const para=source?.paragraphs.find(p=>p.id===line.paragraphId);
    if(!para || !para.text.includes(line.quote))throw new ApiFailure('UNVERIFIED_EVIDENCE');
    if(line.topicCode && !x.data.allowedTopicCodes.includes(line.topicCode))
      throw new ApiFailure('UNVERIFIED_EVIDENCE');
  }
  return {task:y.data.task,citations:y.data.citations,reviewState:'NEEDS_REVIEW' as const,provenance:'MOCK' as const};
}
