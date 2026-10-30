import {describe,it,expect} from 'vitest';
import {AI_TASK_PATHS,AiTaskPathSchema,AiTaskSchema,SafeLlmPacketSchema,ProviderInputClassSchema} from '@hufs-one/contracts';
import {fixture} from './helpers.js';
const safe=fixture<Record<string,unknown>>('synthetic/safe-llm-packet.json');
describe('A06 four safe AI tasks',()=>{
  it('has exactly four, with explicit HTTP path to internal task mapping',()=>{
    expect(Object.keys(AI_TASK_PATHS)).toHaveLength(4);
    expect(AI_TASK_PATHS['graduation-explanation']).toBe('graduation_explanation');
    expect(AiTaskPathSchema.safeParse('generate-rulepack').success).toBe(false);
    expect(AiTaskSchema.safeParse('generate_rulepack').success).toBe(false);
  });
  it('parses synthetically cleared packet',()=>{
    expect(SafeLlmPacketSchema.safeParse(safe).success).toBe(true);
  });
  it('blocks identity mapping in the wire even if rest is well-formed',()=>{
    expect(SafeLlmPacketSchema.safeParse(fixture('negative/unsafe-llm-packet.json')).success).toBe(false);
    expect(SafeLlmPacketSchema.safeParse({...safe,gpa:3.0}).success).toBe(false);
    expect(SafeLlmPacketSchema.safeParse({...safe,providerInputClass:'BLOCKED'}).success).toBe(false);
  });
  it('blocks fabricated topics and unapproved input class',()=>{
    expect(SafeLlmPacketSchema.safeParse({...safe,allowedTopicCodes:['UNKNOWN_NEW_CODE']}).success).toBe(false);
    expect(ProviderInputClassSchema.parse('BLOCKED')).toBe('BLOCKED');
  });
});
