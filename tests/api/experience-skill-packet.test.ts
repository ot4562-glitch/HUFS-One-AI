import {describe,it,expect} from 'vitest';
import {SafeLlmPacketSchema} from '@hufs-one/contracts';
import {buildExperienceSkillPacket} from '../../apps/api/src/modules/ai/experience-skill-packet.js';

const packetId='SYNTHETIC_PACKET_OPAQUE_001';
const record={itemId:'SYN-EXP',version:2,updatedAt:'2026-11-05T00:00:00.000Z',
  value:{kind:'EXPERIENCE' as const,dataMode:'OWNER_CONSENTED' as const,state:'SELF_REPORTED' as const,
    title:'Synthetic internship',summary:'Prepared a documented analysis',role:'Research assistant',
    startedOn:'2026-01-01',endedOn:'2026-02-01'}};
describe('current owner experience to bounded AI candidate packet',()=>{
  it('creates a personal-consented evidence packet, never an approved skill or qualification',()=>{
    const packet=buildExperienceSkillPacket({packetId,experience:record});
    expect(SafeLlmPacketSchema.parse(packet)).toEqual(packet);
    expect(packet).toMatchObject({task:'experience_skills',providerInputClass:'PERSONAL_CONSENTED_CLEARED',
      sourceTokens:[{token:'EXPERIENCE',paragraphs:[
        {id:'TITLE',text:record.value.title},{id:'SUMMARY',text:record.value.summary},
        {id:'ROLE',text:record.value.role},{id:'STARTED_ON',text:record.value.startedOn},
        {id:'ENDED_ON',text:record.value.endedOn}]}]});
    expect(packet.approvedFacts).toEqual([]);expect(packet.allowedObjectTokens).toEqual([]);
    expect(packet.allowedTopicCodes).toHaveLength(24);
    expect(JSON.stringify(packet)).not.toContain(record.itemId);
  });
  it('separates synthetic from consented personal content and omits absent text',()=>{
    const packet=buildExperienceSkillPacket({packetId,experience:{...record,value:{
      kind:'EXPERIENCE',dataMode:'SYNTHETIC',state:'DRAFT',title:'Invented example',summary:''}}});
    expect(packet.providerInputClass).toBe('SYNTHETIC_CLEARED');
    expect(packet.sourceTokens[0]?.paragraphs).toEqual([{id:'TITLE',text:'Invented example'}]);
  });
  it('refuses invalid or non-experience records and non-opaque packet identifiers',()=>{
    expect(()=>buildExperienceSkillPacket({packetId:'actor@example.org',experience:record})).toThrow();
    expect(()=>buildExperienceSkillPacket({packetId,experience:{...record,
      value:{kind:'BOOKMARK',dataMode:'OWNER_CONSENTED',opportunityId:'X',state:'SAVED'}}})).toThrow();
    expect(()=>buildExperienceSkillPacket({packetId,experience:{...record,
      value:{...record.value,summary:'x'.repeat(501)}}})).toThrow();
  });
});
