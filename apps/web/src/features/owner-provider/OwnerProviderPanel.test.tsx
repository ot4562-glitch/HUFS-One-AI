// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import type {ApprovedProviderInput,ProviderAccepted,ProviderStoredJob,AiTask,AiTaskResult} from '@hufs-one/contracts';
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
    // Quote is inline in a citation list item; exact element text contains its source label.
    await screen.findByText(/Synthetic approved notice/);
    const first=f.submit.mock.calls[0]!,second=f.submit.mock.calls[1]!;
    expect(first[0]).toEqual(item);
    expect(first[1]).toBe('opportunity-terms');
    expect(first[2]).toBe(jobId.replaceAll('-',''));
    expect(second[2]).toBe(first[2]);
    expect(f.read).toHaveBeenCalledWith(jobId,'opportunity-terms',expect.any(AbortSignal));
    expect(screen.getByText(/독립 사람 검토 필요/)).toBeTruthy();
  });

  it.each([
    {task:'experience_skills',title:'경험 역량·역할 후보',objectTokens:[],result:{
      kind:'experience_skills',skills:[{topicCode:'DATA_ANALYTICS',
        skill:{text:'합성 분석',citationIndexes:[0]},role:{text:'담당합니다',citationIndexes:[0]}}]}},
    {task:'opportunity_terms',title:'공고 조건 후보',objectTokens:[],result:{
      kind:'opportunity_terms',topicCodes:['DATA_ANALYTICS'],
      conditions:[{kind:'ELIGIBILITY',evidence:{text:'재학생 대상입니다',citationIndexes:[0]}}],
      dates:[{kind:'APPLICATION_DEADLINE',evidence:{text:'11월 5일 마감입니다',citationIndexes:[0]}}],
      roleSteps:[]}},
    {task:'personal_action_brief',title:'선택된 행동 설명',objectTokens:['ACTION1','ACTION2'],result:{
      kind:'personal_action_brief',headline:{text:'요건을 확인합니다',citationIndexes:[0]},
      actions:[{actionToken:'ACTION1',explanation:{text:'합성 분석',citationIndexes:[0]}},
        {actionToken:'ACTION2',explanation:{text:'재학생 대상입니다',citationIndexes:[0]}}]}},
    {task:'graduation_explanation',title:'졸업 요건 설명 후보',objectTokens:['REQ1'],result:{
      kind:'graduation_explanation',requirements:[{requirementToken:'REQ1',
        explanation:{text:'요건을 확인합니다',citationIndexes:[0]},factKeys:['remainingCredits']}]}}
  ] satisfies {task:AiTask;title:string;objectTokens:string[];result:AiTaskResult}[])(
    'renders $task results and erases them on session revocation',async row=>{
      vi.stubGlobal('crypto',{randomUUID:()=>jobId});
      const f=fixture('BETA',[{...item,task:row.task}]);
      f.submit.mockResolvedValueOnce({jobId,state:'NEEDS_REVIEW',provenance:'LIVE'});
      f.read.mockResolvedValueOnce({jobId,state:'NEEDS_REVIEW',billing:'SETTLED',provenance:'CANDIDATE_CACHE',
        candidate:{...candidate,task:row.task,
          citations:[{sourceToken:'DOC1',paragraphId:'p1',
            quote:'합성 분석을 담당합니다. 재학생 대상입니다. 11월 5일 마감입니다. 요건을 확인합니다.'}],
          objectTokens:row.objectTokens,result:row.result,usage:{...candidate.usage}}});
      render(<OwnerProviderPanel port={f.port}/>);
      fireEvent.click(await screen.findByRole('radio',{name:/후보 1/}));
      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(screen.getByRole('button',{name:'선택된 승인 입력 실행'}));
      await screen.findByRole('heading',{name:row.title});
      const result=screen.getByRole('region',{name:'작업별 검토 후보'});
      expect(result.textContent).not.toContain('remainingCredits');
      if(row.task==='personal_action_brief'){
        const items=result.querySelectorAll('ol li');
        expect(Array.from(items,item=>item.textContent)).toEqual([
          '합성 분석 · 근거 1','재학생 대상입니다 · 근거 1',
        ]);
      }
      expect(f.submit).toHaveBeenCalledTimes(1);
      await act(async()=>{f.session.invalidateLocalSession();});
      expect(screen.queryByRole('region',{name:'작업별 검토 후보'})).toBeNull();
      expect(screen.queryByText('합성 분석')).toBeNull();
    });

  it('makes no additional provider calls across one hundred approved input switches',async()=>{
    vi.stubGlobal('crypto',{randomUUID:()=>jobId});
    const f=fixture('BETA',[item,{...item,inputRef:'SYN-SECOND'}]);
    f.submit.mockResolvedValueOnce({jobId,state:'NEEDS_REVIEW',provenance:'LIVE'});
    render(<OwnerProviderPanel port={f.port}/>);
    fireEvent.click(await screen.findByRole('radio',{name:/후보 1/}));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button',{name:'선택된 승인 입력 실행'}));
    await screen.findByText(/Synthetic approved notice/);
    const choices=screen.getAllByRole('radio') as HTMLInputElement[];
    for(let index=0;index<100;index++)fireEvent.click(choices[(index+1)%2]!);
    expect(choices[0]!.checked).toBe(true);
    expect(screen.queryByLabelText('현재 권한으로 재검증된 AI 후보')).toBeNull();
    expect(f.submit).toHaveBeenCalledTimes(1);
    expect(f.read).toHaveBeenCalledTimes(1);
  });

  it('recalls a server-issued job by explicit UUID without any new paid submission',async()=>{
    const f=fixture('BETA',[]);
    render(<OwnerProviderPanel port={f.port}/>);
    await screen.findByText(/실행 가능한 승인된 입력이 없습니다/);
    const button=screen.getByRole('button',{name:'이전 후보 ID 수동 재조회'}) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('내가 발급받은 작업 ID'),{target:{value:jobId}});
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(()=>expect(f.read).toHaveBeenCalledWith(jobId,'experience-skills',expect.any(AbortSignal)));
    expect(f.submit).not.toHaveBeenCalled();
    await screen.findByText(/Synthetic approved notice/);
    await act(async()=>{f.session.invalidateLocalSession();});
    expect(screen.queryByText(/Synthetic approved notice/)).toBeNull();
  });

  it('never submits when no server-approved input is available',async()=>{
    const f=fixture('BETA',[]);render(<OwnerProviderPanel port={f.port}/>);
    await screen.findByText(/실행 가능한 승인된 입력이 없습니다/);
    expect(screen.queryByRole('button',{name:/실행/})).toBeNull();
    expect(f.submit).not.toHaveBeenCalled();
  });
  it('discards a delayed manual result after another approved input is selected',async()=>{
    vi.stubGlobal('crypto',{randomUUID:()=>jobId});
    const f=fixture('BETA',[item,{...item,inputRef:'SYN-OTHER-INPUT'}]);
    render(<OwnerProviderPanel port={f.port}/>);
    fireEvent.click(await screen.findByRole('radio',{name:/후보 1/}));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button',{name:'선택된 승인 입력 실행'}));
    await screen.findByText(/아직 결과가 정산되지 않았습니다/);
    fireEvent.click(screen.getByRole('button',{name:'동일 요청으로 상태 재확인'}));
    await screen.findByText(/Synthetic approved notice/);
    const stored=await f.read.mock.results[0]!.value;
    let complete!:(value:ProviderStoredJob)=>void;
    f.read.mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;}));
    fireEvent.click(screen.getByRole('button',{name:'보존된 후보 다시 조회'}));
    await waitFor(()=>expect(f.read).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('radio',{name:/후보 2/}));
    expect(screen.queryByText(/Synthetic approved notice/)).toBeNull();
    await act(async()=>{complete(stored);});
    expect((screen.getByRole('radio',{name:/후보 2/}) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByText(/Synthetic approved notice/)).toBeNull();
    expect(screen.queryByLabelText('현재 권한으로 재검증된 AI 후보')).toBeNull();
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
