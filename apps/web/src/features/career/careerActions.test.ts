import {describe,expect,it} from 'vitest';
import {newCareerAction,updateCareerAction} from './careerActions.js';
import type {OwnerWorkspaceRecord} from '@hufs-one/contracts';
const record:OwnerWorkspaceRecord={itemId:'plan-1',version:3,updatedAt:'2026-11-07T00:00:00Z',
  value:{kind:'ACTION_PLAN',dataMode:'OWNER_CONSENTED',state:'DRAFT',
    opportunityId:'opp-1',task:'기존 자기 계획',done:false}};
describe('#317 private action plan / opportunity linkage',()=>{
  it('creates a bounded self-reported private action and preserves exact opportunity on edit',()=>{
    expect(newCareerAction('opp-1','지원 서류 점검','2026-11-08')).toEqual({
      kind:'ACTION_PLAN',dataMode:'OWNER_CONSENTED',state:'DRAFT',
      opportunityId:'opp-1',task:'지원 서류 점검',done:false,dueAt:'2026-11-08T12:00:00.000Z',
    });
    expect(updateCareerAction(record,{done:true,task:'지원 전 확인'})).toMatchObject({
      opportunityId:'opp-1',done:true,task:'지원 전 확인',dataMode:'OWNER_CONSENTED',
    });
  });
  it('rejects synthetic action edits, impossible dates, or empty tasks',()=>{
    expect(()=>updateCareerAction({...record,value:{...record.value,dataMode:'SYNTHETIC'}},{done:true})).toThrow();
    expect(()=>newCareerAction('opp-1','')).toThrow();
    expect(()=>newCareerAction('opp-1','할 일','2026-02-31')).toThrow();
    expect(()=>newCareerAction('external/url','할 일')).toThrow();
  });
});
