// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {ExchangePartnerListSchema,ExchangeResultSchema,type ExchangeResult} from '@hufs-one/contracts';
import type {CampusAssistPort} from './ownerPort.js';
import {OwnerExchangePanel} from './OwnerPanels.js';

const AT='2026-11-11T00:00:00Z';
const DISCLAIMER='제시된 기준에 대한 참고 결과이며 공식 지원 자격·선발 결과가 아닙니다.';
const CODES=['TRACK','GPA','SEMESTERS','TRANSFER','CANCELLATION','PARTNER_GPA','LANGUAGE'] as const;
const approved=ExchangePartnerListSchema.parse({
  asOf:AT,sourceVersion:'SYN-REGISTRY',
  partners:[
    {partnerId:'SYN-UNI-A',track:'OIA',minimumGpa:3.0,sourceRevision:'SYN-REV-A',
      sourceUrl:'https://example.org/uni-a',verifiedAt:AT,provenance:'SYNTHETIC'},
    {partnerId:'SYN-UNI-B',track:'OIA',minimumGpa:3.2,partnerMinimumGpa:3.5,
      sourceRevision:'SYN-REV-B',sourceUrl:'https://example.org/uni-b',
      verifiedAt:AT,provenance:'SYNTHETIC'},
    {partnerId:'SYN-UNI-C',track:'DEPARTMENT',minimumGpa:2.8,
      sourceRevision:'SYN-REV-C',sourceUrl:'https://example.org/uni-c',
      verifiedAt:AT,provenance:'SYNTHETIC'},
  ],
});
const evaluation=(policyRevision:string,asOf:string):ExchangeResult=>ExchangeResultSchema.parse({
  asOf,policyRevision,result:'UNKNOWN',disclaimer:DISCLAIMER,
  checks:CODES.map(code=>({code,status:'UNKNOWN',explanation:'가상 근거의 추가 확인 필요',
    sourceRevision:policyRevision})),
});
function fixture(){
  const partners=vi.fn(async()=>approved);
  const evaluate=vi.fn(async(query:Parameters<CampusAssistPort['evaluate']>[0],
    _signal?:AbortSignal)=>evaluation(
      approved.partners.find(p=>p.partnerId===query.partnerId&&p.track===query.applicant.track)!.sourceRevision,
      query.asOf));
  const port={partners,evaluate} as unknown as CampusAssistPort;
  return {port,partners,evaluate};
}
async function view(port:CampusAssistPort){
  const result=render(<OwnerExchangePanel port={port} navigate={vi.fn()}/>);
  await screen.findByRole('button',{name:'선택 대학 조건 비교'});
  return result;
}
afterEach(cleanup);

describe('#340 comparative partner criteria via authorized owner API',()=>{
  it('compares three distinct universities using exactly one asOf and separate partner tracks',async()=>{
    const f=fixture();await view(f.port);
    fireEvent.change(screen.getByLabelText('비교할 두 번째 대학 (선택)'),
      {target:{value:'SYN-UNI-B|OIA'}});
    fireEvent.change(screen.getByLabelText('비교할 세 번째 대학 (선택)'),
      {target:{value:'SYN-UNI-C|DEPARTMENT'}});
    fireEvent.change(screen.getByLabelText('평점평균 (0~4.5)'),{target:{value:'3.4'}});
    fireEvent.click(screen.getByRole('button',{name:'선택 대학 조건 비교'}));
    await screen.findByRole('heading',{name:/3개 파견대학 비교/});
    expect(f.evaluate).toHaveBeenCalledTimes(3);
    const calls=f.evaluate.mock.calls.map(call=>call[0]);
    expect(calls.map(q=>q.partnerId)).toEqual(['SYN-UNI-A','SYN-UNI-B','SYN-UNI-C']);
    expect(calls.map(q=>q.applicant.track)).toEqual(['OIA','OIA','DEPARTMENT']);
    expect(new Set(calls.map(q=>q.asOf)).size).toBe(1);
    expect(calls.every(q=>q.applicant.gpa===3.4)).toBe(true);
    expect(screen.getAllByText(/참고 결과: 확인 필요/)).toHaveLength(3);
    expect(screen.getAllByText(/공식 지원 자격·선발 결과가 아닙니다/)).toHaveLength(3);
    expect(screen.getAllByRole('link',{name:'파견대학 요건 출처 확인'})).toHaveLength(3);
  });

  it('never offers the selected primary or second university again in third slot',async()=>{
    const f=fixture();await view(f.port);
    const first=screen.getByLabelText('파견대학 식별자') as HTMLSelectElement;
    expect(first.value).toBe('SYN-UNI-A|OIA');
    const second=screen.getByLabelText('비교할 두 번째 대학 (선택)') as HTMLSelectElement;
    expect(Array.from(second.options).map(o=>o.value)).not.toContain('SYN-UNI-A|OIA');
    fireEvent.change(second,{target:{value:'SYN-UNI-B|OIA'}});
    const third=screen.getByLabelText('비교할 세 번째 대학 (선택)') as HTMLSelectElement;
    expect(Array.from(third.options).map(o=>o.value)).toEqual(['','SYN-UNI-C|DEPARTMENT']);
    fireEvent.change(first,{target:{value:'SYN-UNI-B|OIA'}});
    expect((screen.getByLabelText('비교할 두 번째 대학 (선택)') as HTMLSelectElement).value).toBe('');
  });

  it('cancels the pending comparison and erases prior results on GPA/semester edits',async()=>{
    const f=fixture();
    let resolve!:(value:ExchangeResult)=>void;
    const delayed=new Promise<ExchangeResult>(r=>{resolve=r;});
    f.evaluate.mockImplementationOnce(async()=>delayed);
    await view(f.port);
    fireEvent.click(screen.getByRole('button',{name:'선택 대학 조건 비교'}));
    await waitFor(()=>expect(f.evaluate).toHaveBeenCalledTimes(1));
    const input=screen.getByLabelText('평점평균 (0~4.5)');
    fireEvent.change(input,{target:{value:'3.3'}});
    expect(screen.queryByRole('heading',{name:/파견대학 비교/})).toBeNull();
    const earlier=f.evaluate.mock.calls[0]?.[0];
    await act(async()=>{resolve(evaluation('SYN-REV-A',earlier!.asOf));await delayed;});
    expect(screen.queryByRole('heading',{name:/파견대학 비교/})).toBeNull();
    expect(screen.getByRole('button',{name:'선택 대학 조건 비교'})).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'선택 대학 조건 비교'}));
    await screen.findByRole('heading',{name:/1개 파견대학 비교/});
    expect(f.evaluate.mock.calls[1]?.[0].applicant.gpa).toBe(3.3);
    fireEvent.change(screen.getByLabelText('수료 학기'),{target:{value:'5'}});
    expect(screen.queryByRole('heading',{name:/1개 파견대학 비교/})).toBeNull();
  });

  it('never displays a partly completed two-university comparison when the second source fails',async()=>{
    const f=fixture();
    f.evaluate.mockImplementationOnce(async q=>evaluation('SYN-REV-A',q.asOf))
      .mockRejectedValueOnce(new Error('Synthetic source unavailable'));
    await view(f.port);
    fireEvent.change(screen.getByLabelText('비교할 두 번째 대학 (선택)'),
      {target:{value:'SYN-UNI-B|OIA'}});
    fireEvent.click(screen.getByRole('button',{name:'선택 대학 조건 비교'}));
    await screen.findByRole('alert');
    expect(f.evaluate).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('heading',{name:/2개 파견대학 비교/})).toBeNull();
    expect(screen.queryByRole('link',{name:'파견대학 요건 출처 확인'})).toBeNull();
  });

  it('quarantines a changed policy revision even if the HTTP evaluation succeeded',async()=>{
    const f=fixture();
    f.evaluate.mockImplementationOnce(async q=>evaluation('SYN-SUPERSEDED',q.asOf));
    await view(f.port);
    fireEvent.click(screen.getByRole('button',{name:'선택 대학 조건 비교'}));
    await screen.findByRole('alert');
    expect(screen.queryByRole('heading',{name:/1개 파견대학 비교/})).toBeNull();
    expect(screen.queryByRole('link',{name:'파견대학 요건 출처 확인'})).toBeNull();
  });

  it('keeps previous actor/partner results out after a port change',async()=>{
    const first=fixture(),second=fixture();
    let resolve!:(value:ExchangeResult)=>void;
    const delayed=new Promise<ExchangeResult>(r=>{resolve=r;});
    first.evaluate.mockImplementationOnce(async()=>delayed);
    const rendered=await view(first.port);
    fireEvent.click(screen.getByRole('button',{name:'선택 대학 조건 비교'}));
    await waitFor(()=>expect(first.evaluate).toHaveBeenCalledTimes(1));
    const original=first.evaluate.mock.calls[0]?.[0];
    rendered.rerender(<OwnerExchangePanel port={second.port} navigate={vi.fn()}/>);
    await act(async()=>{resolve(evaluation('SYN-REV-A',original!.asOf));await delayed;});
    expect(screen.queryByRole('heading',{name:/1개 파견대학 비교/})).toBeNull();
    expect(second.evaluate).not.toHaveBeenCalled();
  });
});
