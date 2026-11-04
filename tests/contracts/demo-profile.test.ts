import {describe,expect,it} from 'vitest';
import {CreditUnitsSchema,DemoProfileValueSchema,DemoProfileSaveSchema,DemoProfileRecordSchema,
  blankDemoProfileValue} from '@hufs-one/contracts';

describe('independent empty synthetic demo profile contract',()=>{
  it('preserves unset, zero earned half-credit units and the double-major tri-state',()=>{
    const blank=blankDemoProfileValue();
    expect(DemoProfileValueSchema.parse(blank)).toEqual({primaryMajor:null,earnedCreditUnits:null,interestTopics:[],doubleMajor:null});
    expect(CreditUnitsSchema.parse(1)).toBe(1);
    for(const doubleMajor of [null,{kind:'NONE'},{kind:'DOUBLE',major:'가상 환경학'}]){
      expect(DemoProfileValueSchema.parse({...blank,earnedCreditUnits:0,doubleMajor}).earnedCreditUnits).toBe(0);
    }
    expect(DemoProfileRecordSchema.parse({version:0,value:blank,updatedAt:null}).version).toBe(0);
  });
  it('rejects grades, transcripts, browser identities, duplicate topics and invalid half-credit units',()=>{
    const blank=blankDemoProfileValue();
    for(const patch of [{earnedCreditUnits:0.5},{earnedCreditUnits:501},{earnedCreditUnits:-1},
      {interestTopics:['AI_ML','AI_ML']},{interestTopics:['AI_ML','DATA_ANALYTICS','SOFTWARE_DEV','CYBERSECURITY','CLOUD_INFRA','PRODUCT_UX']},
      {gpa:4.0},{transcript:[]},{actorId:'someone'},{doubleMajor:{kind:'NONE',major:'unexpected'}}]){
      expect(DemoProfileValueSchema.safeParse({...blank,...patch}).success).toBe(false);
    }
  });
  it('requires the four settings for save; reset alone restores a wholly blank record',()=>{
    expect(DemoProfileSaveSchema.safeParse({expectedVersion:0,value:blankDemoProfileValue()}).success).toBe(false);
    expect(DemoProfileSaveSchema.parse({expectedVersion:0,value:{primaryMajor:'가상 정보학',earnedCreditUnits:0,
      interestTopics:['AI_ML'],doubleMajor:{kind:'NONE'}}}).value.earnedCreditUnits).toBe(0);
  });
});
