// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {OwnerSessionController} from '../../app/owner-session-controller.js';
import {OwnerInsightsPanel,type OwnerInsightsPort} from './OwnerInsightsPanel.js';

const NOW='2026-11-12T00:00:00Z';
type Result=Awaited<ReturnType<OwnerInsightsPort['read']>>;
const fixture=()=>{
  let actor='SYN-OWNER-A';
  const session=new OwnerSessionController({getSession:async()=>({
    actorId:actor,role:'BETA' as const,schoolMailProofValid:true as const,
    betaAllowed:true as const,
  })});
  const read=vi.fn(async(kind:Parameters<OwnerInsightsPort['read']>[0]):Promise<Result>=>({
    state:'NOT_CONNECTED',kind,asOf:NOW,
  }));
  return {port:{session,read} satisfies OwnerInsightsPort,
    session,read,switchOwner:(x:string)=>{actor=x;}};
};
const ready:Result={state:'READY',asOf:NOW,sourceVersion:'SYN-HEAD',
  result:{kind:'EMPLOYMENT',comparable:false,reason:'DIFFERENT_DEFINITION',
    rows:[
      {id:'SYN-A',year:2026,groupId:'SYN-DEPT-A',metricId:'employment-rate',
        populationId:'SYN-RESPONDENTS',status:'PERCENT',
        numerator:50,denominator:100,percent:50,sourceRevisionId:'SYN-REV-A'},
      {id:'SYN-B',year:2026,groupId:'SYN-TINY',metricId:'employment-rate',
        populationId:'SYN-RESPONDENTS',status:'SUPPRESSED',
        numerator:1,denominator:100,percent:1,sourceRevisionId:'SYN-REV-A'},
      {id:'SYN-C',year:2025,groupId:'SYN-NO-OBSERVATION',metricId:'starting-salary',
        populationId:'SYN-RESPONDENTS',status:'NO_DATA',sourceRevisionId:'SYN-REV-A'},
      {id:'SYN-ZERO',year:2025,groupId:'SYN-OBSERVED-ZERO',metricId:'employment-rate',
        populationId:'SYN-RESPONDENTS',status:'OBSERVED_ZERO',
        numerator:0,denominator:100,percent:0,sourceRevisionId:'SYN-REV-A'},
    ]}};
const deferred=()=>{let resolve!:(r:Result)=>void;
  const promise=new Promise<Result>(f=>{resolve=f;});return {promise,resolve};};
afterEach(cleanup);
describe('#351 safe public aggregate comparison accessible table and session isolation',()=>{
  it('shows authorized values but never numeric suppressed cells',async()=>{
    const f=fixture();f.read.mockResolvedValueOnce(ready);
    render(<OwnerInsightsPanel port={f.port} kind="EMPLOYMENT"/>);
    fireEvent.click(await screen.findByRole('button',{name:'현재 권한으로 확인하기'}));
    const table=await screen.findByRole('table',{name:/검증된 집계만 공개하는 통계표/});
    expect(within(table).getByText('50.00% (50/100)')).toBeTruthy();
    expect(within(table).getByText('0.00% (0/100)')).toBeTruthy();
    expect(within(table).getByText('소표본 보호·게시 제한')).toBeTruthy();
    expect(within(table).getByText('미수집·미공유')).toBeTruthy();
    expect(within(table).queryByText('1.00% (1/100)')).toBeNull();
    expect(screen.getByText(/서로 다른 원천·모집단·연도/)).toBeTruthy();
  });
  it('filters only the authorized response rows by year and metric',async()=>{
    const f=fixture();f.read.mockResolvedValueOnce(ready);
    render(<OwnerInsightsPanel port={f.port} kind="EMPLOYMENT"/>);
    fireEvent.click(await screen.findByRole('button',{name:'현재 권한으로 확인하기'}));
    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('통계 연도 선택'),{target:{value:'2025'}});
    const table=screen.getByRole('table');
    expect(within(table).queryByText('50.00% (50/100)')).toBeNull();
    expect(within(table).getByText('0.00% (0/100)')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('통계 지표 선택'),
      {target:{value:'starting-salary'}});
    expect(within(table).queryByText('0.00% (0/100)')).toBeNull();
    expect(within(table).getByText('미수집·미공유')).toBeTruthy();
    expect(f.read).toHaveBeenCalledTimes(1);
  });
  it('discards an old employment response when the user switches insight kind',async()=>{
    const f=fixture(),old=deferred();
    f.read.mockImplementationOnce(()=>old.promise);
    const view=render(<OwnerInsightsPanel port={f.port} kind="EMPLOYMENT"/>);
    fireEvent.click(await screen.findByRole('button',{name:'현재 권한으로 확인하기'}));
    await waitFor(()=>expect(f.read).toHaveBeenCalledTimes(1));
    view.rerender(<OwnerInsightsPanel port={f.port} kind="INTERNATIONAL"/>);
    await act(async()=>{old.resolve(ready);await old.promise;});
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText('50.00% (50/100)')).toBeNull();
  });
  it('discards old owner response after session actor changes midflight',async()=>{
    const f=fixture(),old=deferred();
    f.read.mockImplementationOnce(()=>old.promise);
    render(<OwnerInsightsPanel port={f.port} kind="EMPLOYMENT"/>);
    fireEvent.click(await screen.findByRole('button',{name:'현재 권한으로 확인하기'}));
    await waitFor(()=>expect(f.read).toHaveBeenCalledTimes(1));
    f.switchOwner('SYN-OWNER-B');
    await act(async()=>{await f.session.revalidate();});
    expect(f.session.getState().status).toBe('SIGNED_OUT');
    await act(async()=>{old.resolve(ready);await old.promise;});
    expect(screen.queryByRole('table')).toBeNull();
  });
  it('absent NCP source does not silently use fake public aggregate rows',async()=>{
    const f=fixture();render(<OwnerInsightsPanel port={f.port} kind="EMPLOYMENT"/>);
    fireEvent.click(await screen.findByRole('button',{name:'현재 권한으로 확인하기'}));
    expect(await screen.findByText(/NOT_CONNECTED/)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
