// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {OwnerCounselingPanel,type OwnerCounselingPort} from './OwnerCounselingPanel.js';
import {OwnerSessionController} from '../../app/owner-session-controller.js';

const NOW='2026-11-12T00:00:00Z';
const session=()=>new OwnerSessionController({getSession:async()=>({
  actorId:'SYN-OWNER',role:'BETA' as const,
  schoolMailProofValid:true as const,betaAllowed:true as const,
})});
type Result=Awaited<ReturnType<OwnerCounselingPort['search']>>;
const found=(purpose:string):Result=>({state:'READY',asOf:NOW,sourceVersion:'SYN-REV',
  guide:{status:'MATCHES',excluded:0,matches:[{
    serviceId:'SYN-OFFICE',serviceName:'가상 안내 창구',
    score:4,exactPurposes:[purpose],relatedPurposes:[],
    audienceState:'UNKNOWN',campusState:'UNKNOWN',languageState:'UNKNOWN',
    officialApplicationUrl:null,sourceRevisionId:'SYN-REV',
  }]},
});
function fixture(){
  const search=vi.fn(async(query:Parameters<OwnerCounselingPort['search']>[0]):Promise<Result>=>
    found(query.purposes[0]??'CAREER'));
  return {search,port:{session:session(),search} satisfies OwnerCounselingPort};
}
afterEach(cleanup);
describe('#345 multiple independently chosen counseling purposes',()=>{
  it('submits only selected purpose codes without private text',async()=>{
    const f=fixture();render(<OwnerCounselingPanel port={f.port}/>);
    const submit=await screen.findByRole('button',{name:'공식 기관 후보 찾기'});
    fireEvent.change(screen.getByLabelText('상담 목적'),{target:{value:'MAJOR'}});
    fireEvent.click(screen.getByRole('checkbox',{name:'진로·취업'}));
    fireEvent.click(screen.getByRole('checkbox',{name:'글쓰기 지원'}));
    fireEvent.click(submit);
    await waitFor(()=>expect(f.search).toHaveBeenCalledOnce());
    expect(f.search.mock.calls[0]?.[0]).toEqual({purposes:['MAJOR','CAREER','WRITING']});
    expect(JSON.stringify(f.search.mock.calls[0]?.[0])).not.toContain('민감');
    expect(await screen.findByText('가상 안내 창구')).toBeTruthy();
    expect(screen.getByText(/검증된 신청 링크 없음/)).toBeTruthy();
  });
  it('never sends more than 5 unique codes or stale results when purpose changes',async()=>{
    const f=fixture();render(<OwnerCounselingPanel port={f.port}/>);
    await screen.findByRole('button',{name:'공식 기관 후보 찾기'});
    for(const name of ['학사·수강','학습 방법','국제학생·교류','학생 생활·상담'])
      fireEvent.click(screen.getByRole('checkbox',{name}));
    expect((screen.getByRole('checkbox',{name:'글쓰기 지원'}) as HTMLInputElement).disabled)
      .toBe(true);
    fireEvent.click(screen.getByRole('button',{name:'공식 기관 후보 찾기'}));
    await waitFor(()=>expect(f.search).toHaveBeenCalledTimes(1));
    expect(f.search.mock.calls[0]?.[0].purposes).toEqual([
      'CAREER','ACADEMIC','STUDY','INTERNATIONAL','WELLBEING']);
    fireEvent.change(screen.getByLabelText('상담 목적'),{target:{value:'STUDY'}});
    expect(screen.queryByText('가상 안내 창구')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'공식 기관 후보 찾기'}));
    await waitFor(()=>expect(f.search).toHaveBeenCalledTimes(2));
    const codes=f.search.mock.calls[1]![0].purposes;
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.length).toBeLessThanOrEqual(5);
  });
  it('drops pending results when a supplementary purpose changes',async()=>{
    const f=fixture();let resolve!:(data:Result)=>void;
    const pending=new Promise<Result>(yes=>{resolve=yes;});
    f.search.mockImplementationOnce(()=>pending);
    render(<OwnerCounselingPanel port={f.port}/>);
    fireEvent.click(await screen.findByRole('button',{name:'공식 기관 후보 찾기'}));
    await waitFor(()=>expect(f.search).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('checkbox',{name:'전공 선택·변경'}));
    await act(async()=>{resolve(found('CAREER'));await pending;});
    expect(screen.queryByText('가상 안내 창구')).toBeNull();
    expect((screen.getByRole('button',{name:'공식 기관 후보 찾기'}) as HTMLButtonElement).disabled)
      .toBe(false);
  });
});
