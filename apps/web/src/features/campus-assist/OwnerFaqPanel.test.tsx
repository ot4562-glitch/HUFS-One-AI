// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {OwnerFaqPanel} from './OwnerPanels.js';
import type {CampusAssistPort} from './ownerPort.js';

type Result=Awaited<ReturnType<CampusAssistPort['ask']>>;
const source={documentId:'SYN-FAQ-1',revisionId:'SYN-REV-1',
  title:'가상 학사 문의 출처',sourceUrl:'https://example.org/synthetic/faq',
  verifiedAt:'2026-11-01T00:00:00Z'};
const offline=(asOf:string):Result=>({
  status:'CONFIGURATION_REQUIRED',asOf,evidence:[],sourceLinks:[source],
});
function fixture(){
  const ask=vi.fn(async(input:Parameters<CampusAssistPort['ask']>[0]):Promise<Result>=>offline(input.asOf));
  return {ask,port:{ask} as unknown as CampusAssistPort};
}
const waitForQuery=async()=>{
  const input=screen.getByLabelText('질문');
  fireEvent.change(input,{target:{value:'가상 교환학생 기준 안내'}});
  fireEvent.click(screen.getByRole('button',{name:'질문 전송'}));
};
function pending(){
  let resolve!:(value:Result)=>void;
  const promise=new Promise<Result>(done=>{resolve=done;});
  return {promise,resolve};
}
afterEach(cleanup);

describe('#341 authorized offline FAQ source links, no model claims or stale actor response',()=>{
  it('shows only independently returned source metadata when HCX provider is absent',async()=>{
    const f=fixture();render(<OwnerFaqPanel port={f.port} navigate={vi.fn()}/>);
    await waitForQuery();
    expect(await screen.findByRole('region',{name:'모델 미연결 FAQ 공식 출처'})).toBeTruthy();
    const link=screen.getByRole('link',{name:'가상 학사 문의 출처'});
    expect(link.getAttribute('href')).toBe(source.sourceUrl);
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.getByText(/판본 SYN-REV-1/)).toBeTruthy();
    expect(screen.getByText(/질문을 외부 모델에 보내지 않았으며/)).toBeTruthy();
    expect(screen.queryByRole('heading',{name:/AI 답변 후보/})).toBeNull();
    expect(f.ask).toHaveBeenCalledTimes(1);
  });
  it('does not create an answer from source-less CONFIGURATION_REQUIRED replies',async()=>{
    const f=fixture();
    f.ask.mockImplementation(async q=>({status:'CONFIGURATION_REQUIRED',
      asOf:q.asOf,evidence:[]}));
    render(<OwnerFaqPanel port={f.port} navigate={vi.fn()}/>);
    await waitForQuery();
    expect(await screen.findByText(/표시 가능한 공식 원문 링크가 아직 없습니다/)).toBeTruthy();
    expect(screen.queryByRole('link',{name:'가상 학사 문의 출처'})).toBeNull();
  });
  it('typing again aborts an inflight response and removes the old answer',async()=>{
    const f=fixture(),old=pending();
    f.ask.mockImplementationOnce(async()=>old.promise);
    render(<OwnerFaqPanel port={f.port} navigate={vi.fn()}/>);
    await waitForQuery();
    await waitFor(()=>expect(f.ask).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button',{name:'검증 중'})).toBeTruthy();
    fireEvent.change(screen.getByLabelText('질문'),{target:{value:'새로운 질문 내용'}});
    expect(screen.getByRole('button',{name:'질문 전송'})).toBeTruthy();
    await act(async()=>{old.resolve(offline('2026-11-11T00:00:00Z'));await old.promise;});
    expect(screen.queryByRole('link',{name:'가상 학사 문의 출처'})).toBeNull();
    expect(screen.queryByRole('heading',{name:/AI 답변 후보/})).toBeNull();
  });
  it('a different owner port cannot inherit the prior actor’s FAQ source links',async()=>{
    const a=fixture(),b=fixture(),old=pending();
    a.ask.mockImplementationOnce(async()=>old.promise);
    const view=render(<OwnerFaqPanel port={a.port} navigate={vi.fn()}/>);
    await waitForQuery();
    await waitFor(()=>expect(a.ask).toHaveBeenCalledTimes(1));
    view.rerender(<OwnerFaqPanel port={b.port} navigate={vi.fn()}/>);
    await act(async()=>{old.resolve(offline('2026-11-11T00:00:00Z'));await old.promise;});
    expect(screen.queryByRole('link',{name:'가상 학사 문의 출처'})).toBeNull();
    expect(b.ask).not.toHaveBeenCalled();
  });
  it('erases already rendered source links when a new owner port becomes active',async()=>{
    const a=fixture(),b=fixture();
    const view=render(<OwnerFaqPanel port={a.port} navigate={vi.fn()}/>);
    await waitForQuery();
    expect(await screen.findByRole('link',{name:'가상 학사 문의 출처'})).toBeTruthy();
    view.rerender(<OwnerFaqPanel port={b.port} navigate={vi.fn()}/>);
    await waitFor(()=>expect(screen.queryByRole('link',
      {name:'가상 학사 문의 출처'})).toBeNull());
    expect(b.ask).not.toHaveBeenCalled();
  });
  it('shows ISO verification instants as Korean calendar dates',async()=>{
    const f=fixture();
    f.ask.mockImplementation(async query=>({status:'CONFIGURATION_REQUIRED',
      asOf:query.asOf,evidence:[],sourceLinks:[{
        ...source,verifiedAt:'2026-11-30T15:00:00Z',
      }]}));
    render(<OwnerFaqPanel port={f.port} navigate={vi.fn()}/>);
    await waitForQuery();
    expect(await screen.findByText(/검증 2026\\. 12\\. 01/)).toBeTruthy();
    expect(screen.queryByText(/검증 2026-11-30/)).toBeNull();
  });
  it('returns NOT_FOUND rather than showing a speculative model answer',async()=>{
    const f=fixture();
    f.ask.mockImplementation(async q=>({status:'NOT_FOUND',asOf:q.asOf,evidence:[]}));
    render(<OwnerFaqPanel port={f.port} navigate={vi.fn()}/>);
    await waitForQuery();
    expect(await screen.findByText(/검증된 출처가 없어 답변할 수 없습니다/)).toBeTruthy();
    expect(screen.queryByRole('link',{name:'가상 학사 문의 출처'})).toBeNull();
  });
});
