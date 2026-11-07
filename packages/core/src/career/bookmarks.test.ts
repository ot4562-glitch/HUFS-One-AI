import {describe,it,expect} from 'vitest';
import {careerSavedItem} from './bookmarks.js';
const base={itemId:'saved-one',version:1,updatedAt:'2026-11-07T00:00:00Z',
  value:{kind:'BOOKMARK',dataMode:'OWNER_CONSENTED',state:'SAVED',opportunityId:'opportunity-one'}} as const;
describe('#317 owner bookmark timeline projection',()=>{
  it('does not falsely infer a real application from a saved record',()=>{
    const x=careerSavedItem(base);
    expect(x).toMatchObject({stage:'INTERESTED',outcome:null,synthetic:false});
    expect(x.label).not.toContain('접수');
  });
  it('shows explicit self-reported outcomes as unverified',()=>{
    const x=careerSavedItem({...base,value:{...base.value,stage:'RESULT_RECORDED',
      outcome:{provenance:'USER_ENTERED_UNVERIFIED',result:'ACCEPTED'}}});
    expect(x.label).toContain('공식 결과 미확인');
    expect(x.outcome).toContain('본인 미검증');
  });
  it('rejects unrelated workspace or unverifiable outcomes',()=>{
    expect(()=>careerSavedItem({...base,value:{kind:'EXPERIENCE',dataMode:'OWNER_CONSENTED',
      state:'SELF_REPORTED',title:'x',summary:''}})).toThrow();
    expect(()=>careerSavedItem({...base,value:{...base.value,stage:'RESULT_RECORDED'}})).toThrow();
  });
});
