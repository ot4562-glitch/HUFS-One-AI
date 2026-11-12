// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {OwnerSessionController} from '../../app/owner-session-controller.js';
import {OwnerPreparationPanel,type OwnerPreparationPort} from './OwnerPreparationPanel.js';

type Result=Awaited<ReturnType<OwnerPreparationPort['read']>>;
const AS_OF='2026-11-12T00:00:00Z';
const identity=(actorId:string)=>({
  actorId,role:'BETA' as const,schoolMailProofValid:true as const,betaAllowed:true as const,
});
const scholarship={
  scholarshipId:'SYN-SCHOLARSHIP',ruleRevisionId:'SYN-REV',
  mode:'SIMULATION' as const,overall:'UNKNOWN' as const,applicationWindow:'UNKNOWN' as const,
  groups:[{id:'SYN-GROUP-1',join:'ALL' as const,state:'UNKNOWN' as const,
    conditions:[
      {id:'SYN-COND-1',state:'MET' as const,reason:'MATCHED',
        factKey:'campus',evidenceSpanId:'span-1',required:true},
      {id:'SYN-COND-2',state:'UNKNOWN' as const,reason:'FACT_NOT_SHARED',
        factKey:'gpa',evidenceSpanId:'span-2',required:true},
    ]}],
  missingFactKeys:['gpa'],sourceReason:'SYNTHETIC',officialDecision:null,
};
const ready=(label:string=scholarship.scholarshipId):Result=>({
  state:'READY',asOf:AS_OF,sourceVersion:'SYN-REV',
  scholarships:[{...scholarship,scholarshipId:label}],badges:[],
});
function delayed(){
  let resolve!:(value:Result)=>void;
  const promise=new Promise<Result>(done=>{resolve=done;});
  return {resolve,promise};
}
function fixture(){
  let actor='SYN-OWNER-A';
  const session=new OwnerSessionController({getSession:async()=>identity(actor)});
  const read=vi.fn((_signal?:AbortSignal):Promise<Result>=>
    Promise.resolve({state:'NOT_CONNECTED',asOf:AS_OF}));
  const port:OwnerPreparationPort={session,read};
  return {port,session,read,switchActor:(value:string)=>{actor=value;}};
}
afterEach(cleanup);

describe('#343 NCP-free scholarship checklist and actor/session isolation',()=>{
  it('shows check-by-check official evidence status without disclosing raw GPA',async()=>{
    const f=fixture();f.read.mockResolvedValueOnce(ready());
    render(<OwnerPreparationPanel port={f.port} kind="SCHOLARSHIP"/>);
    fireEvent.click(await screen.findByRole('button',{name:'현재 내 준비 상태 확인'}));
    expect(await screen.findByRole('region',{name:'SYN-SCHOLARSHIP 장학 조건별 체크리스트'})).toBeTruthy();
    expect(screen.getByText(/추가 확인할 자료: gpa/)).toBeTruthy();
    expect(screen.getByText(/조건 근거 span-1/)).toBeTruthy();
    expect(screen.getByText(/조건 근거 span-2/)).toBeTruthy();
    expect(screen.getByText(/현재 확인 가능한 검증자료가 없어 추가 서류/)).toBeTruthy();
    expect(screen.getByText(/학교의 자격 인증, 신청서 제출을 수행하지 않습니다/)).toBeTruthy();
    expect(screen.queryByText('3.75')).toBeNull();
    expect(f.read).toHaveBeenCalledTimes(1);
  });
  it('does not show a synthetic eligibility result when no NCP provider is configured',async()=>{
    const f=fixture();render(<OwnerPreparationPanel port={f.port} kind="SCHOLARSHIP"/>);
    fireEvent.click(await screen.findByRole('button',{name:'현재 내 준비 상태 확인'}));
    expect(await screen.findByText(/NOT_CONNECTED/)).toBeTruthy();
    expect(screen.queryByRole('region',{name:/장학 조건별 체크리스트/})).toBeNull();
  });
  it('does not let an old scholarship response replace the badge tab after kind changes',async()=>{
    const f=fixture(),old=delayed();
    f.read.mockImplementationOnce(()=>old.promise);
    const view=render(<OwnerPreparationPanel port={f.port} kind="SCHOLARSHIP"/>);
    fireEvent.click(await screen.findByRole('button',{name:'현재 내 준비 상태 확인'}));
    await waitFor(()=>expect(f.read).toHaveBeenCalledTimes(1));
    view.rerender(<OwnerPreparationPanel port={f.port} kind="BADGE"/>);
    await act(async()=>{old.resolve(ready('SYN-OLD-SCHOLARSHIP'));await old.promise;});
    expect(screen.queryByText('장학금 SYN-OLD-SCHOLARSHIP')).toBeNull();
    expect(screen.queryByRole('region',{name:'SYN-OLD-SCHOLARSHIP 장학 조건별 체크리스트'}))
      .toBeNull();
  });
  it('does not display a previous actor’s delayed checklist after revocation',async()=>{
    const f=fixture(),old=delayed();
    f.read.mockImplementationOnce(()=>old.promise);
    render(<OwnerPreparationPanel port={f.port} kind="SCHOLARSHIP"/>);
    fireEvent.click(await screen.findByRole('button',{name:'현재 내 준비 상태 확인'}));
    await waitFor(()=>expect(f.read).toHaveBeenCalledTimes(1));
    f.switchActor('SYN-OWNER-B');
    await act(async()=>{await f.session.revalidate();});
    expect(f.session.getState().status).toBe('SIGNED_OUT');
    await act(async()=>{old.resolve(ready('SYN-OTHER-OWNER-SCHOLARSHIP'));await old.promise;});
    expect(screen.queryByText('장학금 SYN-OTHER-OWNER-SCHOLARSHIP')).toBeNull();
    expect(screen.queryByRole('button',{name:'현재 내 준비 상태 확인'})).toBeNull();
  });
  it('leaves a missing-current-policy checklist blank rather than asserting MET',async()=>{
    const f=fixture();f.read.mockResolvedValueOnce({
      state:'READY',asOf:AS_OF,sourceVersion:'SYN-REV',badges:[],
      scholarships:[{...scholarship,mode:'NOT_AVAILABLE',overall:'UNKNOWN',
        groups:[],missingFactKeys:['gpa']}],
    });
    render(<OwnerPreparationPanel port={f.port} kind="SCHOLARSHIP"/>);
    fireEvent.click(await screen.findByRole('button',{name:'현재 내 준비 상태 확인'}));
    expect(await screen.findByText(/검증된 현재 장학금 요건을 제공받지 못해/)).toBeTruthy();
    expect(screen.queryByRole('region',{name:/장학 조건별 체크리스트/})).toBeNull();
  });
});
