import {describe,expect,it} from 'vitest';
import * as contracts from '@hufs-one/contracts';

const input={expectedApprovalVersion:0,expectedContentVersion:1,
  expectedConsentVersion:1,topics:['DATA_ANALYTICS','SOFTWARE_DEV']};
describe('local experience tag approval contracts',()=>{
  it('requires explicit current versions and one to five unique closed-vocabulary topics',()=>{
    const schema=(contracts as any).ExperienceTagApprovalPutSchema;
    expect(schema,'strict local tag approval contract is exported').toBeDefined();
    expect(schema.safeParse(input).success).toBe(true);
    for(const change of [
      {topics:[]},{topics:['DATA_ANALYTICS','DATA_ANALYTICS']},
      {topics:contracts.TOPIC_CODES.slice(0,6)},{topics:['INVENTED']},
      {expectedContentVersion:0},{expectedConsentVersion:0},
      {expectedApprovalVersion:-1},{actorId:'SYN-OTHER'},
      {provenance:'LIVE_NCP'},{approved:true},
    ])expect(schema.safeParse({...input,...change}).success).toBe(false);
  });
  it('forbids stale topics or fabricated recommendation use in inactive results',()=>{
    const schema=(contracts as any).ExperienceTagApprovalSchema;
    expect(schema,'public approval contract is exported').toBeDefined();
    expect(schema.safeParse({state:'INACTIVE',version:2,reason:'STALE'}).success).toBe(true);
    expect(schema.safeParse({state:'INACTIVE',version:2,reason:'STALE',
      topics:['DATA_ANALYTICS']}).success).toBe(false);
    expect(schema.safeParse({state:'ACTIVE',version:1,contentVersion:1,
      consentVersion:1,topics:['DATA_ANALYTICS'],approvedAt:'2026-11-01T00:00:00Z',
      provenance:'LOCAL_USER_SELECTION'}).success).toBe(true);
  });
});
