import {describe,expect,it} from 'vitest';
import {LocalAccountProfileSchema,LocalAccountWorkspaceSchema,LocalAccountSnapshotSchema} from '@hufs-one/contracts';

const blank={displayName:'빈 데모 계정',primaryMajor:null,doubleMajorStatus:'UNSET',doubleMajor:null,
  earnedCredits:null,interestTopics:[],desiredJobTopics:[],campus:null,cohort:null};
describe('local account input contracts',()=>{
  it('accepts only half-credit units without coercing numeric strings',()=>{
    for(const earnedCredits of [0,0.5,3,3.5,500])
      expect(LocalAccountProfileSchema.parse({...blank,earnedCredits}).earnedCredits).toBe(earnedCredits);
    for(const earnedCredits of [3.3,0.25,'0x10','1e2'])
      expect(LocalAccountProfileSchema.safeParse({...blank,earnedCredits}).success).toBe(false);
  });
  it('preserves unknown credits separately from zero and empty interests',()=>{
    expect(LocalAccountProfileSchema.parse(blank).earnedCredits).toBeNull();
    expect(LocalAccountProfileSchema.parse({...blank,earnedCredits:0}).earnedCredits).toBe(0);
    expect(LocalAccountProfileSchema.parse(blank).interestTopics).toEqual([]);
  });
  it.each(['NONE','UNSET'])('rejects a double major when status is %s',doubleMajorStatus=>{
    expect(LocalAccountProfileSchema.safeParse({...blank,doubleMajorStatus,doubleMajor:'가상전공'}).success).toBe(false);
  });
  it('requires a selected double major and rejects unknown/duplicate fields and invalid credits',()=>{
    for(const input of [{...blank,doubleMajorStatus:'SELECTED'},{...blank,earnedCredits:-1},
      {...blank,earnedCredits:''},{...blank,earnedCredits:Infinity},{...blank,actorId:'other'},
      {...blank,interestTopics:['AI_ML','AI_ML']}])expect(LocalAccountProfileSchema.safeParse(input).success).toBe(false);
    expect(LocalAccountProfileSchema.safeParse({...blank,doubleMajorStatus:'SELECTED',doubleMajor:'가상전공'}).success).toBe(true);
  });
  it('bounds and strictly validates workspace records',()=>{
    expect(LocalAccountWorkspaceSchema.safeParse({bookmarks:[],experiences:[],planCourseIds:[],search:'',notifications:false,profile:{}}).success).toBe(false);
  });
  it('rejects a mixed real feed card inside an explicitly synthetic account snapshot',()=>{
    const asOf='2026-11-02T00:00:00.000Z',snapshot={mode:'SYNTHETIC',sessionId:'s',accountId:'BLANK_DEMO',revision:0,
      profile:blank,workspace:{bookmarks:[],experiences:[],planCourseIds:[],search:'',notifications:false},asOf,
      feed:{asOf,featured:[],compact:[{opportunityId:'SYN-1',displayMode:'COMPACT_LIST',title:'가상 공고',
        eligibility:'UNKNOWN',lifecycle:'OPEN',topics:[],evidenceRefs:[],dataMode:'REAL'}],totalCandidates:1,hasMore:false},
      notices:{asOf,items:[],pinnedIds:[]},clubs:{recommended:[],all:[]},
      academics:{state:'UNKNOWN',reason:'검증 근거 없음'},forecast:{state:'UNKNOWN',reason:'검증 근거 없음'}};
    expect(LocalAccountSnapshotSchema.safeParse(snapshot).success).toBe(false);
    snapshot.feed.compact[0]!.dataMode='SYNTHETIC';expect(LocalAccountSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });
});
