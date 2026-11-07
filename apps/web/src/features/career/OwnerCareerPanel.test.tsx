// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
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
  const advanceBookmarkStage=vi.fn(async(_record:OwnerWorkspaceRecord,change:{stage:string})=>{
    bookmark={...bookmark,version:bookmark.version+1,value:{...bookmark.value,stage:change.stage as 'PREPARING'}};
    return {item:bookmark};
  });
  const port={session,getProfile,getConsents,getPortfolio,getBookmarks,advanceBookmarkStage,
    updateConsents:vi.fn(async()=>({})),saveProfile:vi.fn(async()=>({})),
    create:vi.fn(async()=>({})),update:vi.fn(async()=>({})),remove:vi.fn(async()=>({})),
  } as unknown as OwnerCareerPort;
  return {session,port,getProfile,getConsents,getPortfolio,getBookmarks,advanceBookmarkStage};
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
    expect(screen.getByText(/외부 접수 미확인/)).toBeTruthy();
    expect(f.getBookmarks).toHaveBeenCalledWith({limit:20},expect.any(AbortSignal));
    fireEvent.click(advance);
    await waitFor(()=>expect(f.advanceBookmarkStage).toHaveBeenCalledOnce());
    expect(f.advanceBookmarkStage).toHaveBeenCalledWith(
      expect.objectContaining({itemId:'b1',version:1}),
      {stage:'PREPARING'},expect.any(AbortSignal));
    await screen.findByText(/지원 준비 중 \(본인 기록\)/);
    expect(f.getConsents.mock.calls.length).toBeGreaterThanOrEqual(4);
  });
  it('never enables an AI call when consent preferences are changed',async()=>{
    const f=fixture();
    render(<OwnerCareerPanel port={f.port} navigate={()=>{}}/>);
    await screen.findByRole('heading',{name:'정보 이용 목적과 철회'});
    fireEvent.click(screen.getByLabelText(/승인된 외부 AI 입력 전송/));
    fireEvent.click(screen.getByRole('button',{name:'목적별 동의 변경 저장'}));
    await waitFor(()=>expect((f.port.updateConsents as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce());
    expect(f.port.updateConsents).toHaveBeenCalledWith({
      expectedVersion:1,choices:{...grant.choices,externalAi:true},
    },expect.any(AbortSignal));
    expect(screen.queryByText('실제 AI 실행 완료')).toBeNull();
  });
});
