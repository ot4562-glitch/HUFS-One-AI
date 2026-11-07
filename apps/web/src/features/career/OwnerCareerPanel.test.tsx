// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {ExperiencePortfolioSchema,SelfConsentSchema,SelfProfileSchema,type OwnerWorkspaceRecord} from '@hufs-one/contracts';
import {OwnerSessionController} from '../../app/owner-session-controller.js';
import {OwnerCareerPanel,type OwnerCareerPort} from './OwnerCareerPanel.js';

const asOf='2026-11-07T08:00:00.000Z';
const original:OwnerWorkspaceRecord={itemId:'b1',version:1,updatedAt:asOf,
  value:{kind:'BOOKMARK',dataMode:'OWNER_CONSENTED',opportunityId:'opp1',state:'SAVED'}};
const portfolio=ExperiencePortfolioSchema.parse({items:[],nextCursor:null,portfolio:{
  asOf,consentVersion:1,coverage:'PAGE',complete:true,evidence:[],topics:[],
}});
const profile=SelfProfileSchema.parse({version:1,updatedAt:asOf,value:{
  displayName:'본인 확인',interestTopics:[],desiredJobTopics:[],headline:'자기소개',visibility:'PRIVATE',
}});
const grant=SelfConsentSchema.parse({version:1,updatedAt:asOf,choices:{
  personalStorage:true,teamReview:false,externalAi:false,ncpStorage:false,presentation:false,
}});
function fixture(consent=grant){
  const session=new OwnerSessionController({getSession:async()=>({
    actorId:'owner-1',role:'BETA',schoolMailProofValid:true,betaAllowed:true,
  })});
  let bookmark=original;
  const getProfile=vi.fn(async()=>({profile}));
  const getConsents=vi.fn(async()=>({consents:consent}));
  const getPortfolio=vi.fn(async()=>portfolio);
  const getBookmarks=vi.fn(async()=>({items:[bookmark],nextCursor:null}));
  const getActions=vi.fn(async()=>({items:[],nextCursor:null}));
  const advanceBookmarkStage=vi.fn(async(_record:OwnerWorkspaceRecord,change:{stage:string})=>{
    if(bookmark.value.kind!=='BOOKMARK')throw new Error('Expected bookmark');
    bookmark={...bookmark,version:bookmark.version+1,value:{...bookmark.value,stage:change.stage as 'PREPARING'}};
    return {item:bookmark};
  });
  const port={session,getProfile,getConsents,getPortfolio,getBookmarks,getActions,advanceBookmarkStage,
    getOwnerFeed:vi.fn(async()=>{throw new Error('No real source in isolated UI test');}),
    updateConsents:vi.fn(async()=>({})),saveProfile:vi.fn(async()=>({})),
    create:vi.fn(async()=>({})),update:vi.fn(async()=>({})),remove:vi.fn(async()=>({})),
  } as unknown as OwnerCareerPort;
  return {session,port,getProfile,getConsents,getPortfolio,getBookmarks,getActions,advanceBookmarkStage};
}
afterEach(()=>cleanup());
describe('#317 BETA owner timeline and self-reported stage',()=>{
  it('requires current storage consent before requesting private profile and portfolio',async()=>{
    const revoked=SelfConsentSchema.parse({...grant,choices:{...grant.choices,personalStorage:false}});
    const f=fixture(revoked);
    render(<OwnerCareerPanel port={f.port} navigate={()=>{}}/>);
    await waitFor(()=>expect(f.getConsents).toHaveBeenCalled());
    await waitFor(()=>expect(f.session.getState().status).not.toBe('READY'));
    expect(f.getProfile).not.toHaveBeenCalled();
    expect(f.getPortfolio).not.toHaveBeenCalled();
    expect(screen.queryByText('본인 확인')).toBeNull();
  });
  it('uses authenticated server CAS to advance only one self-reported bookmark step',async()=>{
    const f=fixture();
    render(<OwnerCareerPanel port={f.port} navigate={()=>{}}/>);
    const advance=await screen.findByRole('button',{name:'다음 단계로 기록'});
    expect(screen.getByText(/실제 접수·결과는 외부 확인 없이 확정하지 않습니다/)).toBeTruthy();
    expect(f.getBookmarks).toHaveBeenCalledWith({limit:20},expect.any(AbortSignal));
    fireEvent.click(advance);
    await waitFor(()=>expect(f.advanceBookmarkStage).toHaveBeenCalledOnce());
    expect(f.advanceBookmarkStage).toHaveBeenCalledWith(
      expect.objectContaining({itemId:'b1',version:1}),
      {stage:'PREPARING'},expect.any(AbortSignal));
    await screen.findByText(/지원 준비 중 \(본인 기록\)/);
    expect(f.getConsents.mock.calls.length).toBeGreaterThanOrEqual(4);
  });
  it('explicitly double-reads all pages before displaying owner-wide strengths',async()=>{
    const f=fixture();render(<OwnerCareerPanel port={f.port} navigate={()=>{}}/>);
    fireEvent.click(await screen.findByRole('button',{name:'전체 기록 일관성 검사 후 분석'}));
    await screen.findByText(/경험 0건을 1페이지씩 두 번 조회/);
    expect(f.getPortfolio).toHaveBeenCalledTimes(3);
    expect(screen.queryByText(/공식 역량 인증 완료/)).toBeNull();
  });
  it('records a private action only against the currently saved owner opportunity',async()=>{
    const f=fixture();render(<OwnerCareerPanel port={f.port} navigate={()=>{}}/>);
    await screen.findByRole('heading',{name:'기회별 나의 행동 계획 (비공개·자기 기록)'});
    fireEvent.change(screen.getByLabelText('연결할 내가 저장한 기회'),{target:{value:'opp1'}});
    fireEvent.change(screen.getByLabelText(/내가 할 일/),{target:{value:'지원 서류 점검'}});
    fireEvent.click(screen.getByRole('button',{name:'행동 계획 기록'}));
    await waitFor(()=>expect(f.port.create).toHaveBeenCalledOnce());
    const submitted=(f.port.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(submitted.value).toMatchObject({kind:'ACTION_PLAN',dataMode:'OWNER_CONSENTED',
      opportunityId:'opp1',state:'DRAFT',task:'지원 서류 점검',done:false});
  });
  it('keeps the profile preview private and saves the self-reported activity status',async()=>{
    const f=fixture();render(<OwnerCareerPanel port={f.port} navigate={()=>{}}/>);
    await screen.findByRole('heading',{name:'나에게만 보이는 프로필 미리보기'});
    fireEvent.change(screen.getByLabelText('현재 활동 상태 (본인 기록)'),
      {target:{value:'APPLYING_SELF_REPORTED'}});
    fireEvent.click(screen.getByRole('button',{name:'비공개 프로필 저장'}));
    await waitFor(()=>expect(f.port.saveProfile).toHaveBeenCalledTimes(1));
    expect(f.port.saveProfile).toHaveBeenCalledWith(expect.objectContaining({value:expect.objectContaining({
      activityStatus:'APPLYING_SELF_REPORTED',visibility:'PRIVATE',
    })}),expect.any(AbortSignal));
  });
  it('never enables an AI call when consent preferences are changed',async()=>{
    const f=fixture();
    render(<OwnerCareerPanel port={f.port} navigate={()=>{}}/>);
    await screen.findByRole('heading',{name:'정보 이용 목적과 철회'});
    fireEvent.click(screen.getByLabelText(/승인된 외부 AI 입력 전송/));
    fireEvent.click(screen.getByRole('button',{name:'목적별 동의 변경 저장'}));
    await waitFor(()=>expect(f.port.updateConsents).toHaveBeenCalledTimes(1));
    expect(f.port.updateConsents).toHaveBeenCalledWith({
      expectedVersion:1,choices:{...grant.choices,externalAi:true},
    },expect.any(AbortSignal));
    expect(screen.queryByText('실제 AI 실행 완료')).toBeNull();
  });
});
