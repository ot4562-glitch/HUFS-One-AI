// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {ExperienceReviewPanel,type ExperienceReviewScope} from './ExperienceSkillReview.js';
import type {ExperienceSkillPort} from './experienceSkillPort.js';

const asOf='2026-11-07T12:00:00Z';
const item=(id:string,title:string)=>({
  experienceId:id,title,summary:'본인 활동 원문',dataMode:'OWNER_CONSENTED' as const,
  contentVersion:1,approval:{state:'INACTIVE' as const,version:0,reason:'NOT_APPROVED' as const},
  candidate:null,candidateState:'NOT_REQUESTED' as const,
});
afterEach(()=>cleanup());
describe('#317 owner-review keyset pagination never mixes candidates from other pages',()=>{
  it('uses the authorized next cursor and resets to first page without modifying approval',async()=>{
    const first={asOf,consentVersion:1,complete:false,nextCursor:'exp001',
      items:[item('exp001','첫 경험')]};
    const second={asOf,consentVersion:1,complete:true,nextCursor:null,
      items:[item('exp002','다음 경험')]};
    const load=vi.fn(async()=>first);
    const loadPage=vi.fn(async(_afterId:string|undefined,_signal:AbortSignal)=>second);
    const approve=vi.fn(async()=>({}));
    const revoke=vi.fn(async()=>({}));
    const port:ExperienceSkillPort={load,loadPage,approve,revoke};
    const scope:ExperienceReviewScope={
      key:'owner-test',ready:true,
      read:run=>run(new AbortController().signal),
      mutate:run=>run(new AbortController().signal),
    };
    render(<ExperienceReviewPanel scope={scope} port={port}/>);
    expect(await screen.findByRole('heading',{name:'첫 경험'})).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'다음 경험 20건 검토'}));
    expect(await screen.findByRole('heading',{name:'다음 경험'})).toBeTruthy();
    await waitFor(()=>expect(loadPage).toHaveBeenCalledWith('exp001',expect.any(AbortSignal)));
    expect(screen.queryByRole('heading',{name:'첫 경험'})).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'첫 경험 페이지로 돌아가기'}));
    expect(await screen.findByRole('heading',{name:'첫 경험'})).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(2);
    expect(approve).not.toHaveBeenCalled();expect(revoke).not.toHaveBeenCalled();
  });
});
