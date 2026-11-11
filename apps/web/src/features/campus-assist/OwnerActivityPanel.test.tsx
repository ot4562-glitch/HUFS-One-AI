// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {OwnerActivityPanel} from './OwnerPanels.js';
import type {CampusAssistPort} from './ownerPort.js';
import type {ActivityRecord} from '@hufs-one/contracts';

const REV='SYN-REV-1';
const record:ActivityRecord={
  entryId:'SYN-EVENT-1',sourceId:'SYN-SOURCE-1',revisionId:REV,
  organizationId:'SYN-ECON',seriesId:'orientation',
  title:'가상 학과 행사',kind:'ORIENTATION',campus:'SEOUL',
  publishedAt:'2026-12-31T15:00:00Z',verifiedAt:'2026-12-31T15:01:00Z',
  applicationDeadline:'2027-01-15',
  sourceUrl:'https://example.org/synthetic/1',
  status:'ANNOUNCED',rights:'APPROVED',provenance:'SYNTHETIC',
};
const deferred=<T,>()=>{
  let resolve!:(value:T)=>void;
  const promise=new Promise<T>(done=>{resolve=done;});
  return {resolve,promise};
};
function fixture(){
  const activities=vi.fn(async(query:Parameters<CampusAssistPort['activities']>[0])=>({
    asOf:query.asOf,sourceVersion:REV,
    items:[record],hasMore:true,
  }));
  const forecast=vi.fn(async(query:Parameters<CampusAssistPort['forecast']>[0])=>({
    asOf:query.asOf,organizationId:query.organizationId,seriesId:query.seriesId,
    targetYear:query.targetYear,state:'INSUFFICIENT_DATA' as const,
    confidence:'NONE' as const,observedYears:[],evidenceRefs:[],reason:'가상 근거 부족',
  }));
  const port={activities,forecast} as unknown as CampusAssistPort;
  return {port,activities,forecast};
}
afterEach(cleanup);

describe('#339 filtered owner activity UI uses current authorized results only',()=>{
  it('labels KST posting dates, distinct deadlines and truncated coverage',async()=>{
    const f=fixture();render(<OwnerActivityPanel port={f.port} navigate={vi.fn()}/>);
    expect(await screen.findByText('가상 학과 행사')).toBeTruthy();
    expect(screen.getByText(/게시일\(한국시간\) 2027-01-01/)).toBeTruthy();
    expect(screen.getByText(/행사일 미확인/)).toBeTruthy();
    expect(screen.getByText(/신청 마감 2027-01-15/)).toBeTruthy();
    expect(screen.getByText(/전체를 가져온 것이 아니므로/)).toBeTruthy();
    expect(screen.getByRole('link',{name:'원문 출처 열기'}).getAttribute('rel'))
      .toBe('noopener noreferrer');
    expect(f.forecast).toHaveBeenCalledTimes(1);
  });
  it('pushes campus/kind and an explicitly applied keyword to the authorized API',async()=>{
    const f=fixture();render(<OwnerActivityPanel port={f.port} navigate={vi.fn()}/>);
    await screen.findByText('가상 학과 행사');
    fireEvent.change(screen.getByLabelText('캠퍼스'),{target:{value:'GLOBAL'}});
    await waitFor(()=>expect(f.activities.mock.calls.at(-1)?.[0]).toMatchObject({campus:'GLOBAL'}));
    fireEvent.change(screen.getByLabelText('활동 종류'),{target:{value:'LECTURE'}});
    await waitFor(()=>expect(f.activities.mock.calls.at(-1)?.[0]).toMatchObject({
      campus:'GLOBAL',kind:'LECTURE',
    }));
    fireEvent.change(screen.getByLabelText('활동 검색어'),{target:{value:'학술제'}});
    expect(f.activities.mock.calls.at(-1)?.[0]).not.toHaveProperty('query');
    fireEvent.click(screen.getByRole('button',{name:'검색 적용'}));
    await waitFor(()=>expect(f.activities.mock.calls.at(-1)?.[0]).toMatchObject({
      campus:'GLOBAL',kind:'LECTURE',query:'학술제',
    }));
  });
  it('ignores an old filter response after the next campus selection',async()=>{
    const f=fixture();
    const stale=deferred<Awaited<ReturnType<CampusAssistPort['activities']>>>();
    const latest=deferred<Awaited<ReturnType<CampusAssistPort['activities']>>>();
    f.activities.mockImplementation(async()=>stale.promise);
    const view=render(<OwnerActivityPanel port={f.port} navigate={vi.fn()}/>);
    await waitFor(()=>expect(f.activities).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('캠퍼스'),{target:{value:'GLOBAL'}});
    f.activities.mockImplementation(async()=>latest.promise);
    // Force one further generation before resolving either request.
    fireEvent.change(screen.getByLabelText('활동 종류'),{target:{value:'LECTURE'}});
    await waitFor(()=>expect(f.activities).toHaveBeenCalledTimes(3));
    const query=f.activities.mock.calls.at(-1)?.[0];
    await act(async()=>{
      stale.resolve({asOf:query!.asOf,sourceVersion:REV,
        items:[{...record,title:'이전 조건 기록'}],hasMore:false});
      await stale.promise;
    });
    expect(screen.queryByText('이전 조건 기록')).toBeNull();
    await act(async()=>{
      latest.resolve({asOf:query!.asOf,sourceVersion:REV,
        items:[{...record,title:'최신 조건 기록',kind:'LECTURE',campus:'GLOBAL'}],hasMore:false});
      await latest.promise;
    });
    expect(await screen.findByText('최신 조건 기록')).toBeTruthy();
    expect(screen.queryByText('이전 조건 기록')).toBeNull();
    view.unmount();
  });
  it('drops old owner data on port change and shows the new connection state',async()=>{
    const old=fixture(),next=fixture();
    let reject!:(err:Error)=>void;
    old.activities.mockImplementationOnce(async()=>new Promise((_resolve,no)=>{reject=no;}));
    const view=render(<OwnerActivityPanel port={old.port} navigate={vi.fn()}/>);
    await waitFor(()=>expect(old.activities).toHaveBeenCalledTimes(1));
    next.activities.mockResolvedValueOnce({asOf:'2027-01-03T00:00:00Z',
      sourceVersion:REV,items:[],hasMore:false});
    view.rerender(<OwnerActivityPanel port={next.port} navigate={vi.fn()}/>);
    expect(await screen.findByText(/기록이 없습니다/)).toBeTruthy();
    await act(async()=>{reject(new Error('old actor denied'));});
    expect(screen.queryByText('가상 학과 행사')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
