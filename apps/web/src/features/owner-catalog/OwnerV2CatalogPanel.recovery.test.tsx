// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {FeatureAdditions as C} from '@hufs-one/contracts';
import {HufsApiError} from '../../integrations/api-error.js';
import {OwnerSessionController} from '../../app/owner-session-controller.js';
import {OwnerV2CatalogPanel,type OwnerV2CatalogPort,formatKstDate} from './OwnerV2CatalogPanel.js';

const AT='2026-11-10T00:00:00Z';
const CURSOR='SYN-OPAQUE-CURSOR-16CHARS';
const identity=(id='SYN-OWNER-A')=>({actorId:id,role:'BETA' as const,
  schoolMailProofValid:true as const,betaAllowed:true as const});
const item=(id:string):C.OpportunityCatalogItem=>({
  id,title:'합성 허가 공고 '+id,category:'SCHOLARSHIP',topicCodes:[],
  eligibility:'UNKNOWN',permitted:true,
  sourceUrl:'https://example.org/notice/'+id,
  source:{sourceId:'SYN-SOURCE',revisionId:'SYN-REV',status:'VERIFIED',
    rights:'CLEARED',verifiedAt:'2026-11-01T00:00:00Z',
    effectiveFrom:'2026-01-01T00:00:00Z',evidenceSpanIds:['p-1']},
});
const ready=(ids:string[],next:string|null)=>C.OwnerV2CatalogResponseSchema.parse({
  state:'READY',sourceVersion:'SYN-REV',
  page:{items:ids.map(item),nextCursor:next,hasMore:next!==null,
    totalInAuthorizedScope:2,scope:'PERMITTED_APPROVED_SNAPSHOT',at:AT},
});
function fixture(){
  let actor='SYN-OWNER-A';
  const session=new OwnerSessionController({getSession:async()=>identity(actor)});
  const search=vi.fn(async(q:Parameters<OwnerV2CatalogPort['search']>[0])=>
    q?.cursor?ready(['SECOND'],null):ready(['FIRST'],CURSOR));
  const port:OwnerV2CatalogPort={session,search};
  return {session,search,port,switchActor:(next:string)=>{actor=next;}};
}
async function initial(f:ReturnType<typeof fixture>){
  render(<OwnerV2CatalogPanel port={f.port}/>);
  fireEvent.click(await screen.findByRole('button',{name:'검색'}));
  expect(await screen.findByText('합성 허가 공고 FIRST')).toBeTruthy();
}
afterEach(cleanup);

describe('#348/#418 recoverable signed cursor/limit errors are not session revocations',()=>{
  it.each([
    ['source or consent epoch change',new HufsApiError('VERSION_CONFLICT',409)],
    ['expired or malformed signed cursor',new HufsApiError('INVALID_INPUT',422)],
  ])('preserves owner identity after %s and requires a new first-page query',async(_name,error)=>{
    const f=fixture();
    // First page must succeed, then the continuation is rejected.
    f.search.mockImplementationOnce(async()=>ready(['FIRST'],CURSOR))
      .mockRejectedValueOnce(error)
      .mockImplementationOnce(async()=>ready(['FRESH'],null));
    await initial(f);
    fireEvent.click(screen.getByRole('button',{name:'다음 승인 페이지'}));
    expect(await screen.findByRole('button',{name:'첫 페이지 새로 검색'})).toBeTruthy();
    expect(screen.getByText(/계정 권한은 유지됩니다/)).toBeTruthy();
    expect(f.session.getState().status).toBe('READY');
    expect(screen.queryByText('합성 허가 공고 FIRST')).toBeNull();
    expect(screen.queryByRole('button',{name:'다음 승인 페이지'})).toBeNull();
    expect(f.search).toHaveBeenCalledTimes(2); // never automatically retry
    fireEvent.click(screen.getByRole('button',{name:'첫 페이지 새로 검색'}));
    expect(await screen.findByText('합성 허가 공고 FRESH')).toBeTruthy();
    const restart=f.search.mock.calls[2]?.[0];
    expect(restart).toBeDefined();
    expect(restart).not.toHaveProperty('cursor');
    expect(restart).not.toHaveProperty('asOf');
    expect(f.search).toHaveBeenCalledTimes(3);
    expect(f.session.getState().status).toBe('READY');
  });

  it('shows 429 as a quota notice without auto-retry or signing the owner out',async()=>{
    const f=fixture();
    f.search.mockRejectedValueOnce(new HufsApiError('RATE_LIMITED',429));
    render(<OwnerV2CatalogPanel port={f.port}/>);
    fireEvent.click(await screen.findByRole('button',{name:'검색'}));
    expect(await screen.findByText(/요청 한도를 초과했습니다/)).toBeTruthy();
    expect(screen.getByText(/자동으로 반복 요청하지 않습니다/)).toBeTruthy();
    expect(f.session.getState().status).toBe('READY');
    expect(f.search).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button',{name:'검색'}));
    expect(await screen.findByText('합성 허가 공고 FIRST')).toBeTruthy();
    expect(f.search).toHaveBeenCalledTimes(2);
  });

  it('treats an invalid first-page filter separately from expired continuation',async()=>{
    const f=fixture();f.search.mockRejectedValueOnce(new HufsApiError('INVALID_INPUT',422));
    render(<OwnerV2CatalogPanel port={f.port}/>);
    fireEvent.click(await screen.findByRole('button',{name:'검색'}));
    expect(await screen.findByText(/검색 조건을 확인할 수 없습니다/)).toBeTruthy();
    expect(f.session.getState().status).toBe('READY');
    expect(screen.queryByRole('button',{name:'첫 페이지 새로 검색'})).toBeNull();
    fireEvent.change(screen.getByLabelText('승인된 공고에서 검색'),{target:{value:'가상'}});
    expect(screen.queryByText(/검색 조건을 확인할 수 없습니다/)).toBeNull();
  });

  it.each([
    ['UNAUTHENTICATED',401,'SIGNED_OUT'],
    ['FORBIDDEN',403,'FORBIDDEN'],
  ] as const)('continues fail-closed owner handling for %s',async(code,status,expected)=>{
    const f=fixture();f.search.mockRejectedValueOnce(new HufsApiError(code,status));
    render(<OwnerV2CatalogPanel port={f.port}/>);
    fireEvent.click(await screen.findByRole('button',{name:'검색'}));
    await waitFor(()=>expect(f.session.getState().status).toBe(expected));
    expect(screen.queryByText('합성 허가 공고 FIRST')).toBeNull();
    expect(screen.queryByRole('button',{name:'검색'})).toBeNull();
    expect(screen.queryByRole('button',{name:'첫 페이지 새로 검색'})).toBeNull();
  });

  it.each([14,16])('separates a signed cursor at %i minutes from an expired one',async(minutes)=>{
    const f=fixture();
    f.search.mockImplementation(async q=>{
      if(q?.cursor&&minutes>15)throw new HufsApiError('INVALID_INPUT',422);
      return q?.cursor?ready(['SECOND'],null):ready(['FIRST'],CURSOR);
    });
    await initial(f);
    fireEvent.click(screen.getByRole('button',{name:'다음 승인 페이지'}));
    if(minutes===14){
      expect(await screen.findByText('합성 허가 공고 SECOND')).toBeTruthy();
      expect(screen.queryByRole('button',{name:'첫 페이지 새로 검색'})).toBeNull();
    }else{
      expect(await screen.findByRole('button',{name:'첫 페이지 새로 검색'})).toBeTruthy();
      expect(screen.queryByText('합성 허가 공고 FIRST')).toBeNull();
    }
    expect(f.session.getState().status).toBe('READY');
    expect(f.search.mock.calls[1]?.[0]).toMatchObject({cursor:CURSOR,asOf:AT});
  });

  it('never shows a stale recoverable error after filters change',async()=>{
    const f=fixture();let reject!:(error:Error)=>void;
    const pending=new Promise<Awaited<ReturnType<OwnerV2CatalogPort['search']>>>(
      (_resolve,fail)=>{reject=fail;});
    f.search.mockImplementationOnce(async()=>pending);
    render(<OwnerV2CatalogPanel port={f.port}/>);
    fireEvent.click(await screen.findByRole('button',{name:'검색'}));
    await waitFor(()=>expect(f.search).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('캠퍼스'),{target:{value:'GLOBAL'}});
    await act(async()=>{
      reject(new HufsApiError('RATE_LIMITED',429));
      try{await pending;}catch{/* synthetic rejection observed by controller */}
    });
    expect(screen.queryByText(/요청 한도를 초과했습니다/)).toBeNull();
    expect(f.session.getState().status).toBe('READY');
    expect(screen.getByRole('button',{name:'검색'})).toBeTruthy();
  });
});

describe('#418 verified UTC/offset instants have one KST calendar date',()=>{
  it('uses Korean midnight rather than raw UTC string slicing',()=>{
    expect(formatKstDate('2026-11-30T15:00:00Z')).toBe('2026-12-01');
    expect(formatKstDate('2026-12-01T00:00:00+09:00')).toBe('2026-12-01');
    expect(formatKstDate('2026-11-30T14:59:59Z')).toBe('2026-11-30');
    expect(formatKstDate('2026-11-30T23:59:59+09:00')).toBe('2026-11-30');
    expect(formatKstDate('bad-date')).toBe('미확인');
  });
});
