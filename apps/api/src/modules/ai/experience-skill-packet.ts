import {z} from 'zod';
import {
  AI_TASK_RESULT_SCHEMA_VERSION,TOPIC_CODES,OwnerWorkspaceRecordSchema,SafeLlmPacketSchema,
} from '@hufs-one/contracts';
import type {OwnerWorkspaceRecord,SafeLlmPacket} from '@hufs-one/contracts';

const Opaque=z.string().regex(/^[A-Za-z0-9_-]{22,64}$/);
/** Only exact current, owner-stored experience text enters the model packet.
 * All evidence is explicitly self-reported; this never proves employment,
 * competence, eligibility or college credit. Call only after consent/rights
 * and source revision have been independently bound on the server. */
export function buildExperienceSkillPacket(input:{
  packetId:string;experience:OwnerWorkspaceRecord;
}):SafeLlmPacket{
  const record=OwnerWorkspaceRecordSchema.parse(input.experience);
  if(record.value.kind!=='EXPERIENCE')throw new Error('Not an experience record');
  const value=record.value;
  const paragraphs=[{id:'TITLE',text:value.title},
    ...(value.summary?[{id:'SUMMARY',text:value.summary}]:[]),
    ...(value.role?[{id:'ROLE',text:value.role}]:[]),
    ...(value.startedOn?[{id:'STARTED_ON',text:value.startedOn}]:[]),
    ...(value.endedOn?[{id:'ENDED_ON',text:value.endedOn}]:[])];
  return SafeLlmPacketSchema.parse({
    packetId:Opaque.parse(input.packetId),task:'experience_skills',
    providerInputClass:value.dataMode==='OWNER_CONSENTED'
      ?'PERSONAL_CONSENTED_CLEARED':'SYNTHETIC_CLEARED',
    sourceTokens:[{token:'EXPERIENCE',paragraphs}],
    allowedTopicCodes:[...TOPIC_CODES],
    allowedObjectTokens:[],approvedFacts:[],
    schemaVersion:AI_TASK_RESULT_SCHEMA_VERSION,promptVersion:'experience-skills-v1',
  });
}
