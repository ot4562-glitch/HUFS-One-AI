// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import type {ApprovedProviderInput,ProviderAccepted,ProviderStoredJob} from '@hufs-one/contracts';
import {OwnerSessionController} from '../../app/owner-session-controller.js';
import {OwnerProviderPanel,type OwnerProviderPort} from './OwnerProviderPanel.js';

const expires='2030-01-01T00:00:00.000Z';
const item:ApprovedProviderInput={inputRef:'SYN-INPUT',operation:'HCX_007',task:'opportunity_terms',
  asOf:'2026-11-03T00:00:00.000Z',expiresAt:expires};
const jobId='00000000-0000-4000-8000-000000000001';
const candidate={task:'opportunity_terms',reviewRequired:true,reviewState:'NEEDS_REVIEW',
  citations:[{sourceToken:'DOC1',paragraphId:'p1',quote:'Synthetic approved notice'}],
  objectTokens:[],usage:{promptTokens:40,completionTokens:20,totalTokens:60}} as const;
function fixture(role='BETA',inputs:ApprovedProviderInput[]=[item]){
  let current={actorId:'SYN-A',role,schoolMailProofValid:true,betaAllowed:true};
  const session=new OwnerSessionController({getSession:async()=>current});
  let n=0;
  const accepted:ProviderAccepted[]=[
    {jobId,state:'PENDING'},{jobId,state:'NEEDS_REVIEW',provenance:'LIVE'},
  ];
  const result:ProviderStoredJob={jobId,state:'NEEDS_REVIEW',billing:'SETTLED',
    provenance:'CANDIDATE_CACHE',candidate:{...candidate,citations:[...candidate.citations],
      objectTokens:[],usage:{...candidate.usage}}};
  const list=vi.fn(async()=>({items:inputs}));
  const submit=vi.fn(async(_input:ApprovedProviderInput,_task:import('@hufs-one/contracts').AiTaskPath,
    _key:string,_signal?:AbortSignal)=>accepted[Math.min(n++,1)]!);
  const read=vi.fn(async()=>result);
  const port:OwnerProviderPort={session,list,submit,read};
  return {port,session,list,submit,read,
    switchTo:(actorId:string)=>{current={...current,actorId};}};
}
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('BETA owner Provider UI — explicit, no auto-paid work',()=>{
  it('shows only approved refs, requires confirmation, preserves same idempotency while pending',async()=>{
    vi.stubGlobal('crypto',{randomUUID:()=>jobId});
    const f=fixture();render(<OwnerProviderPanel port={f.port}/>);
    const radio=await screen.findByRole('radio',{name:/후보 1/});
    expect(f.submit).not.toHaveBeenCalled();
    expect(screen.queryByText('Synthetic approved notice')).toBeNull();
    fireEvent.click(radio);
    const run=screen.getByRole('button',{name:'선택된 승인 입력 실행'}) as HTMLButtonElement;
    expect(run.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button',{name:'선택된 승인 입력 실행'}));
    await waitFor(()=>expect(f.submit).toHaveBeenCalledTimes(1));
    await screen.findByText(/아직 결과가 정산되지 않았습니다/);
    expect(screen.getByText(/PENDING.*아직 결과 없음/)).toBeTruthy();
    expect(screen.queryByText(/PENDING.*LIVE/)).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'동일 요청으로 상태 재확인'}));
    await waitFor(()=>expect(f.submit).toHaveBeenCalledTimes(2));
    await screen.findByText('Synthetic approved notice');
    const first=f.submit.mock.calls[0]!,second=f.submit.mock.calls[1]!;
    expect(first[0]).toEqual(item);
    expect(first[1]).toBe('opportunity-terms');
    expect(first[2]).toBe(jobId.replaceAll('-',''));
    expect(second[2]).toBe(first[2]);
    expect(f.read).toHaveBeenCalledWith(jobId,'opportunity-terms',expect.any(AbortSignal));
    expect(screen.getByText(/독립 사람 검토 필요/)).toBeTruthy();
  });
  it('never submits when no server-approved input is available',async()=>{
    const f=fixture('BETA',[]);render(<OwnerProviderPanel port={f.port}/>);
    await screen.findByText(/실행 가능한 승인된 입력이 없습니다/);
    expect(screen.queryByRole('button',{name:/실행/})).toBeNull();
    expect(f.submit).not.toHaveBeenCalled();
  });
  it('REVIEWER cannot list or see the BETA input even if a port was supplied incorrectly',async()=>{
    const f=fixture('REVIEWER');render(<OwnerProviderPanel port={f.port}/>);
    await screen.findByRole('alert');
    expect(f.list).not.toHaveBeenCalled();
    expect(screen.queryByText(/후보 1/)).toBeNull();
  });
  it('clears data after local session revocation without showing stale candidate',async()=>{
    const f=fixture();render(<OwnerProviderPanel port={f.port}/>);
    await screen.findByRole('radio',{name:/후보 1/});
    await act(async()=>{f.session.invalidateLocalSession();});
    await screen.findByRole('alert');
    expect(screen.queryByRole('radio')).toBeNull();
    expect(f.submit).not.toHaveBeenCalled();
  });
});
