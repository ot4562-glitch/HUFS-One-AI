// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {OwnerSessionController} from '../../app/owner-session-controller.js';
import {OwnerCounselingPanel,type OwnerCounselingPort} from './OwnerCounselingPanel.js';

const AT='2026-11-11T00:00:00Z';
type Result=Awaited<ReturnType<OwnerCounselingPort['search']>>;
const identity=(actorId:string)=>({actorId,role:'BETA' as const,
  schoolMailProofValid:true as const,betaAllowed:true as const});
const ready=(name:string):Result=>({
  state:'READY',asOf:AT,sourceVersion:'SYN-REV',
  guide:{status:'MATCHES',excluded:0,matches:[{
    serviceId:'SYN-OFFICE',serviceName:name,score:5,
    exactPurposes:['CAREER'],relatedPurposes:[],
    audienceState:'CONFIRMED',campusState:'CONFIRMED',languageState:'CONFIRMED',
    officialApplicationUrl:'https://example.org/counseling',
    sourceRevisionId:'SYN-REV',
  }]},
});
function deferred(){
  let resolve!:(value:Result)=>void;
  const promise=new Promise<Result>(done=>{resolve=done;});
  return {promise,resolve};
}
function fixture(){
  let actor='SYN-OWNER-A';
  const session=new OwnerSessionController({getSession:async()=>identity(actor)});
  const search=vi.fn((_query:Parameters<OwnerCounselingPort['search']>[0],
    _signal?:AbortSignal):Promise<Result>=>Promise.resolve({state:'NOT_CONNECTED',asOf:AT}));
  const port:OwnerCounselingPort={session,search};
  return {port,search,session,switchActor:(next:string)=>{actor=next;}};
}
afterEach(cleanup);

describe('#345/#427 counseling filters cannot resurrect stale owner results',()=>{
  it.each([
    ['상담 목적','ACADEMIC'],
    ['찾을 캠퍼스 (본인 학적 검증 아님)','GLOBAL'],
    ['상담 언어 (선호 필터)','en'],
  ])('ignores a pending response after changing %s without a new search',async(label,value)=>{
    const f=fixture(),old=deferred();
    f.search.mockImplementationOnce(()=>old.promise);
    render(<OwnerCounselingPanel port={f.port}/>);
    fireEvent.click(await screen.findByRole('button',{name:'공식 기관 후보 찾기'}));
    await waitFor(()=>expect(f.search).toHaveBeenCalledTimes(1));
    expect((screen.getByRole('button',{name:'확인 중'}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(label),{target:{value}});
    expect((screen.getByRole('button',{name:'공식 기관 후보 찾기'}) as HTMLButtonElement).disabled).toBe(false);
    await act(async()=>{old.resolve(ready('SYN-STALE-OFFICE'));await old.promise;});
    expect(screen.queryByText('SYN-STALE-OFFICE')).toBeNull();
    expect(f.search).toHaveBeenCalledTimes(1);
  });

  it('shows only the new filter result when requests finish in the reverse order',async()=>{
    const f=fixture(),old=deferred(),current=deferred();
    f.search.mockImplementationOnce(()=>old.promise).mockImplementationOnce(()=>current.promise);
    render(<OwnerCounselingPanel port={f.port}/>);
    fireEvent.click(await screen.findByRole('button',{name:'공식 기관 후보 찾기'}));
    await waitFor(()=>expect(f.search).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('상담 목적'),{target:{value:'ACADEMIC'}});
    fireEvent.change(screen.getByLabelText('찾을 캠퍼스 (본인 학적 검증 아님)'),
      {target:{value:'GLOBAL'}});
    fireEvent.change(screen.getByLabelText('상담 언어 (선호 필터)'),{target:{value:'en'}});
    fireEvent.click(screen.getByRole('button',{name:'공식 기관 후보 찾기'}));
    await waitFor(()=>expect(f.search).toHaveBeenCalledTimes(2));
    expect(f.search.mock.calls[1]?.[0]).toEqual({
      purposes:['ACADEMIC'],campus:'GLOBAL',language:'en',
    });
    await act(async()=>{old.resolve(ready('SYN-STALE-OFFICE'));await old.promise;});
    // The old request's finally must not enable the button for the pending new request.
    expect((screen.getByRole('button',{name:'확인 중'}) as HTMLButtonElement).disabled).toBe(true);
    await act(async()=>{current.resolve(ready('SYN-FRESH-OFFICE'));await current.promise;});
    expect(await screen.findByText('SYN-FRESH-OFFICE')).toBeTruthy();
    expect(screen.queryByText('SYN-STALE-OFFICE')).toBeNull();
    expect((screen.getByRole('button',{name:'공식 기관 후보 찾기'}) as HTMLButtonElement).disabled).toBe(false);
  });

  it('keeps private results hidden after the authenticated actor changes mid-request',async()=>{
    const f=fixture(),old=deferred();
    f.search.mockImplementationOnce(()=>old.promise);
    render(<OwnerCounselingPanel port={f.port}/>);
    fireEvent.click(await screen.findByRole('button',{name:'공식 기관 후보 찾기'}));
    await waitFor(()=>expect(f.search).toHaveBeenCalledTimes(1));
    f.switchActor('SYN-OWNER-B');
    await act(async()=>{await f.session.revalidate();});
    expect(f.session.getState().status).toBe('SIGNED_OUT');
    await act(async()=>{old.resolve(ready('SYN-OTHER-OWNER-OFFICE'));await old.promise;});
    expect(screen.queryByText('SYN-OTHER-OWNER-OFFICE')).toBeNull();
    expect(screen.queryByRole('button',{name:'공식 기관 후보 찾기'})).toBeNull();
    expect(screen.getByText(/현재 상담기관 조회 권한·연결 상태/)).toBeTruthy();
  });

  it('drops the pending response after unmount without showing any prior result',async()=>{
    const f=fixture(),old=deferred();
    f.search.mockImplementationOnce(()=>old.promise);
    const view=render(<OwnerCounselingPanel port={f.port}/>);
    fireEvent.click(await screen.findByRole('button',{name:'공식 기관 후보 찾기'}));
    await waitFor(()=>expect(f.search).toHaveBeenCalledTimes(1));
    view.unmount();
    await act(async()=>{old.resolve(ready('SYN-UNMOUNTED-OFFICE'));await old.promise;});
    expect(screen.queryByText('SYN-UNMOUNTED-OFFICE')).toBeNull();
  });
});
