import {describe,it,expect} from 'vitest';
import {TOPIC_CODES,TOPIC_ALIASES_V1,TOPIC_DICTIONARY_VERSION,TOPIC_ALIAS_VERSION,TopicCodeSchema,InterestTopicsSchema,DesiredJobTopicsSchema,OpportunityTopicsSchema} from '@hufs-one/contracts';

describe('A04 closed topic contract',()=>{
  it('has exactly 24 stable unique literal values',()=>{
    expect(TOPIC_CODES).toHaveLength(24);
    expect(new Set(TOPIC_CODES).size).toBe(24);
    expect(TOPIC_DICTIONARY_VERSION).toBe('topics-v1');
  });
  it.each(TOPIC_CODES)('accepts canonical code %s',code=>{
    expect(TopicCodeSchema.parse(code)).toBe(code);
  });
  it('rejects fabricated model codes and non-enum aliases',()=>{
    expect(TopicCodeSchema.safeParse('UNDECLARED_TOPIC').success).toBe(false);
    expect(TopicCodeSchema.safeParse('데이터분석').success).toBe(false);
    expect(TOPIC_ALIASES_V1['데이터분석']).toBe('DATA_ANALYTICS');
  });
  it('enforces interest/job/opportunity topic quotas',()=>{
    expect(InterestTopicsSchema.safeParse(TOPIC_CODES.slice(0,6)).success).toBe(false);
    expect(DesiredJobTopicsSchema.safeParse(TOPIC_CODES.slice(0,4)).success).toBe(false);
    expect(OpportunityTopicsSchema.safeParse(TOPIC_CODES.slice(0,6)).success).toBe(false);
  });
});
