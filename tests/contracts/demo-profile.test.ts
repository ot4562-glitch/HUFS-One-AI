import {describe,expect,it} from 'vitest';
import {CreditUnitsSchema,DemoProfileValueSchema,DemoProfileSaveSchema,DemoProfileRecordSchema,
  blankDemoProfileValue,blankDemoProfileWorkspace,DemoProfileSnapshotSchema} from '@hufs-one/contracts';

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
  it('rejects a real ineligible card while accepting synthetic and legacy empty-demo snapshots',()=>{
    const asOf='2026-11-02T00:00:00.000Z',feed={asOf,featured:[],compact:[],hasMore:false,totalCandidates:0};
    const snapshot={namespace:'EMPTY_DEMO',dataMode:'SYNTHETIC',verification:'UNVERIFIED_SELF_REPORT',version:0,asOf,feed,
      notices:{asOf,items:[],pinnedIds:[]},clubs:{recommended:[],all:[]},
      academics:{state:'UNKNOWN',reason:'검증 근거 없음'},forecast:{state:'UNKNOWN',reason:'검증 근거 없음'},
      workspace:blankDemoProfileWorkspace(),
      calendar:{asOf,from:asOf,to:asOf,entries:[],undated:[],needsConfirmation:[],ambiguousNoticeIds:[]},
      catalog:[],allCards:[],experienceSignals:{mode:'OFF',topics:[]},
      corpus:{version:'syn-corpus-v1',opportunities:40,notices:10,profiles:5,sha256:'a'.repeat(64)}};
    expect(DemoProfileSnapshotSchema.safeParse(snapshot).success).toBe(true);
    const card={opportunityId:'SYN-OPP-001',displayMode:'COMPACT_LIST',title:'가상 공고',eligibility:'INELIGIBLE',
      lifecycle:'OPEN',topics:[],evidenceRefs:[],dataMode:'SYNTHETIC'};
    const withIneligible={...snapshot,feed:{...feed,ineligible:[card]}};
    expect(DemoProfileSnapshotSchema.safeParse(withIneligible).success).toBe(true);
    card.dataMode='REAL';
    expect(DemoProfileSnapshotSchema.safeParse(withIneligible).success).toBe(false);
  });
});
