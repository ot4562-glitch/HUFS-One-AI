import {describe,expect,it} from 'vitest';
import {bookmarkProgressInput,nextBookmarkStage,STAGE_NAMES} from './bookmarkProgress.js';
import type {OwnerWorkspaceRecord,BookmarkStage} from '@hufs-one/contracts';
const original:OwnerWorkspaceRecord={
  itemId:'bookmark-1',version:1,updatedAt:'2026-11-07T00:00:00Z',
  value:{kind:'BOOKMARK',dataMode:'OWNER_CONSENTED',opportunityId:'op1',state:'SAVED'},
};
describe('#317 personal application progression without simulated external results',()=>{
  it('advances one CAS stage at a time; older rows begin as interested',()=>{
    let record=original;
    const states:BookmarkStage[]=['PREPARING','SUBMITTED_SELF_REPORTED','AWAITING_RESULT'];
    for(const stage of states){
      expect(nextBookmarkStage(record)).toBe(stage);
      expect(bookmarkProgressInput(record)).toEqual({stage});
      record={...record,version:record.version+1,value:{...record.value,stage}};
    }
    expect(nextBookmarkStage(record)).toBe('RESULT_RECORDED');
    expect(()=>bookmarkProgressInput(record)).toThrow();
    expect(bookmarkProgressInput(record,'WAITLISTED')).toEqual({
      stage:'RESULT_RECORDED',outcome:{provenance:'USER_ENTERED_UNVERIFIED',result:'WAITLISTED'},
    });
    expect(STAGE_NAMES.RESULT_RECORDED).toContain('공식 결과 미확인');
  });
  it('rejects synthetic or already terminal records',()=>{
    expect(nextBookmarkStage({...original,value:{...original.value,dataMode:'SYNTHETIC'}})).toBeNull();
    expect(nextBookmarkStage({...original,value:{...original.value,stage:'RESULT_RECORDED',
      outcome:{provenance:'USER_ENTERED_UNVERIFIED',result:'OTHER'}}})).toBeNull();
    expect(()=>bookmarkProgressInput(original,'ACCEPTED')).toThrow();
  });
});
