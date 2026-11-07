// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import type {OwnerWorkspaceRecord} from '@hufs-one/contracts';
import {CareerActionPlans} from './CareerActionPlans.js';

const asOf='2026-11-07T00:00:00Z';
const saved:OwnerWorkspaceRecord={
  itemId:'bm-1',version:1,updatedAt:asOf,
  value:{kind:'BOOKMARK',dataMode:'OWNER_CONSENTED',state:'SAVED',opportunityId:'opp1'},
};
const props={
  bookmarks:{items:[saved],nextCursor:null},
  actions:{items:[],nextCursor:null},busy:false,
  navigate:vi.fn(),onNext:vi.fn(),
};
afterEach(()=>cleanup());
describe('#317 action plan draft state after owner CAS mutations',()=>{
  it('preserves the entire draft when no server receipt confirms the write',async()=>{
    const onCreate=vi.fn(async()=>false);
    render(<CareerActionPlans {...props} onCreate={onCreate} onEdit={vi.fn(async()=>false)}/>);
    fireEvent.change(screen.getByLabelText('연결할 내가 저장한 기회'),{target:{value:'opp1'}});
    const task=screen.getByLabelText(/내가 할 일/) as HTMLInputElement;
    fireEvent.change(task,{target:{value:'실제 자기 계획 초안'}});
    fireEvent.click(screen.getByRole('button',{name:'행동 계획 기록'}));
    await waitFor(()=>expect(onCreate).toHaveBeenCalledOnce());
    expect(await screen.findByRole('alert')).toHaveProperty('textContent',
      expect.stringContaining('작성한 내용을 유지'));
    expect(task.value).toBe('실제 자기 계획 초안');
  });
  it('clears an owner draft only after an authenticated receipt was accepted',async()=>{
    const onCreate=vi.fn(async()=>true);
    render(<CareerActionPlans {...props} onCreate={onCreate} onEdit={vi.fn(async()=>false)}/>);
    fireEvent.change(screen.getByLabelText('연결할 내가 저장한 기회'),{target:{value:'opp1'}});
    const task=screen.getByLabelText(/내가 할 일/) as HTMLInputElement;
    fireEvent.change(task,{target:{value:'정리할 활동'}});fireEvent.click(screen.getByRole('button',{name:'행동 계획 기록'}));
    await waitFor(()=>expect(onCreate).toHaveBeenCalledOnce());
    await waitFor(()=>expect(task.value).toBe(''));
  });
});
