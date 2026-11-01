import {describe,expect,it} from 'vitest';
import {
  BookmarkStagePatchSchema,OwnerWorkspaceCreateSchema,
  OwnerWorkspaceRecordSchema,OwnerWorkspaceValueSchema,isNextBookmarkStage,
} from '@hufs-one/contracts';

const saved={kind:'BOOKMARK' as const,dataMode:'SYNTHETIC' as const,
  opportunityId:'SYN-OP-1',state:'SAVED' as const};
const outcome={provenance:'USER_ENTERED_UNVERIFIED' as const,
  result:'ACCEPTED' as const,note:'학생 본인 기록'};
describe('A05 #80 bookmark stage / legacy wire contract',()=>{
  it('reads legacy SAVED rows unchanged and never invents an official result',()=>{
    const legacy=OwnerWorkspaceRecordSchema.parse({
      itemId:'SYN-B1',version:1,value:saved,updatedAt:'2026-11-01T00:00:00Z',
    });
    expect(legacy.value).toEqual(saved);
    expect(isNextBookmarkStage(undefined,'PREPARING')).toBe(true);
    expect(isNextBookmarkStage(undefined,'INTERESTED')).toBe(false);
    expect(isNextBookmarkStage(undefined,'AWAITING_RESULT')).toBe(false);
    expect(OwnerWorkspaceCreateSchema.parse({itemId:'SYN-B1',value:saved}).value).toEqual(saved);
  });
  it('allows only forward one-step transitions and no duplicate or reverse updates',()=>{
    const stages=[
      'INTERESTED','PREPARING','SUBMITTED_SELF_REPORTED',
      'AWAITING_RESULT','RESULT_RECORDED',
    ] as const;
    for(let i=0;i<stages.length;i++){
      expect(isNextBookmarkStage(stages[i],stages[i]!)).toBe(false);
      for(let j=0;j<stages.length;j++)
        expect(isNextBookmarkStage(stages[i],stages[j]!)).toBe(j===i+1);
    }
    expect(isNextBookmarkStage('RESULT_RECORDED','INTERESTED')).toBe(false);
  });
  it('rejects a finalized result in a create request or without owner provenance',()=>{
    expect(OwnerWorkspaceCreateSchema.safeParse({itemId:'SYN-B1',value:{
      ...saved,stage:'RESULT_RECORDED',outcome,
    }}).success).toBe(false);
    expect(OwnerWorkspaceCreateSchema.safeParse({itemId:'SYN-B1',value:{
      ...saved,stage:'PREPARING',
    }}).success).toBe(false);
    expect(OwnerWorkspaceCreateSchema.safeParse({itemId:'SYN-B1',value:{
      ...saved,stage:'INTERESTED',
    }}).success).toBe(true);
    for(const value of [
      {...saved,stage:'RESULT_RECORDED'},
      {...saved,outcome},
      {...saved,stage:'PREPARING',outcome},
      {...saved,stage:'RESULT_RECORDED',outcome:{result:'ACCEPTED'}},
      {...saved,stage:'RESULT_RECORDED',outcome:{...outcome,official:true}},
    ])
      expect(OwnerWorkspaceValueSchema.safeParse(value).success).toBe(false);
    expect(OwnerWorkspaceValueSchema.parse({
      ...saved,stage:'RESULT_RECORDED',outcome,
    })).toEqual({...saved,stage:'RESULT_RECORDED',outcome});
  });
  it('requires CAS and only permits a result on the terminal transition',()=>{
    const base={expectedVersion:3,stage:'RESULT_RECORDED',outcome};
    expect(BookmarkStagePatchSchema.parse(base)).toEqual(base);
    for(const payload of [
      {expectedVersion:0,stage:'PREPARING'},
      {expectedVersion:1.5,stage:'PREPARING'},
      {expectedVersion:1,stage:'RESULT_RECORDED'},
      {expectedVersion:1,stage:'PREPARING',outcome},
      {expectedVersion:1,stage:'SUBMITTED_SELF_REPORTED',officialApplied:true},
      {expectedVersion:1,stage:'APPROVED'},
      {expectedVersion:1,stage:'RESULT_RECORDED',outcome:{...outcome,provenance:'OFFICIAL'}},
    ])expect(BookmarkStagePatchSchema.safeParse(payload).success).toBe(false);
  });
});
