// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {OwnerSessionController} from '../../app/owner-session-controller.js';
import {compareReviewedOpportunityRevisionClaims} from '@hufs-one/contracts';
import {OwnerOpportunityGovernance,type OwnerOpportunityGovernancePort} from './OwnerOpportunityGovernance.js';

afterEach(()=>cleanup());
const asOf='2026-11-07T13:00:00Z';
const beforeAt='2026-11-06T13:00:00Z';
const rights={opportunityId:'opp-1',sourceId:'source-1',
  sourceRevisionId:'rev-new',permissionRef:'owner-perm-1'};
const publication={opportunity:{id:'opp-1',dataMode:'REAL',version:'1'},
  source:{sourceId:'source-1',revisionId:'rev-new',status:'ACTIVE',
    permissionRef:'owner-perm-1',verifiedAt:asOf}};
const base={opportunityId:rights.opportunityId,sourceRevisionId:rights.sourceRevisionId,
  permissionRef:rights.permissionRef,checkedAt:asOf};
function fixture(){
  const session=new OwnerSessionController({getSession:async()=>({
    actorId:'owner-a',role:'BETA',schoolMailProofValid:true,betaAllowed:true,
  })});
  const getOpportunity=vi.fn(async()=>publication);
  const port={session,getOpportunity} as unknown as OwnerOpportunityGovernancePort;
  return {session,port,getOpportunity};
}
describe('#317 source consumer: own status, explicit reports, reviewed change evidence',()=>{
  it('never fabricates report submission or source history when backend ports are absent',async()=>{
    const f=fixture(),revoked=vi.fn();
    render(<OwnerOpportunityGovernance port={f.port} rights={rights} onSourceRevoked={revoked}/>);
    await act(async()=>{await f.session.initialize();});
    expect(screen.getByText(/신고\/철회 상태 API가 연결되지 않았습니다/)).toBeTruthy();
    expect(screen.getByText(/판본 비교 API가 연결되지 않았습니다/)).toBeTruthy();
    expect(screen.queryByRole('button',{name:'현재 판본 신고 접수 요청'})).toBeNull();
    expect(f.getOpportunity).not.toHaveBeenCalled();
    expect(revoked).not.toHaveBeenCalled();
  });
  it('only submits a selected source report once current owner state is checked',async()=>{
    const f=fixture(),revoked=vi.fn();
    const getModerationStatus=vi.fn(async()=>({...base,state:'NOT_FILED'}));
    const submitReport=vi.fn(async()=>({...base,state:'UNDER_REVIEW',reportedAt:asOf}));
    f.port.getModerationStatus=getModerationStatus;f.port.submitReport=submitReport;
    render(<OwnerOpportunityGovernance port={f.port} rights={rights} onSourceRevoked={revoked}/>);
    await act(async()=>{await f.session.initialize();});
    expect(submitReport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'현재 게시·내 신고 상태 새로고침'}));
    await screen.findByText(/내 신고 접수 기록 없음/);
    const button=screen.getByRole('button',{name:'현재 판본 신고 접수 요청'}) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('내가 신고할 이유'),
      {target:{value:'MISLEADING_APPLICATION_ROUTE'}});
    fireEvent.click(screen.getByRole('checkbox',{name:/실제 검토 대상으로 신고합니다/}));
    fireEvent.click(button);
    await waitFor(()=>expect(submitReport).toHaveBeenCalledTimes(1));
    expect(submitReport).toHaveBeenCalledWith({
      opportunityId:'opp-1',sourceRevisionId:'rev-new',permissionRef:'owner-perm-1',
      reason:'MISLEADING_APPLICATION_ROUTE',
    },expect.any(AbortSignal));
    await screen.findByText(/내 신고 검토 중/);
    expect(revoked).not.toHaveBeenCalled();
    expect(f.getOpportunity).toHaveBeenCalledTimes(2);
  });
  it('redacts an already-rendered source when server reports withdrawal',async()=>{
    const f=fixture(),revoked=vi.fn();
    f.port.getModerationStatus=vi.fn(async()=>({...base,state:'RIGHTS_REVOKED'}));
    render(<OwnerOpportunityGovernance port={f.port} rights={rights} onSourceRevoked={revoked}/>);
    await act(async()=>{await f.session.initialize();});
    fireEvent.click(screen.getByRole('button',{name:'현재 게시·내 신고 상태 새로고침'}));
    await waitFor(()=>expect(revoked).toHaveBeenCalledOnce());
    expect(screen.queryByText(/원문 123/)).toBeNull();
  });
  it('renders UNKNOWN vs reviewed before/after without inferring unsupported eligibility',async()=>{
    const f=fixture(),revoked=vi.fn();
    const before={revisionId:'rev-old',sourceId:'source-1',opportunityId:'opp-1',
      capturedAt:beforeAt,checkedAt:beforeAt,verifiedAt:beforeAt,
      contentSha256:'a'.repeat(64),dataMode:'REAL',deliveryMode:'LIVE',
      claims:[{field:'STATUS',value:'OPEN',evidenceRefs:['a']}],
    };
    const after={...before,revisionId:'rev-new',capturedAt:asOf,checkedAt:asOf,verifiedAt:asOf,
      contentSha256:'b'.repeat(64),claims:[{field:'STATUS',value:'CANCELLED',evidenceRefs:['b']}]};
    const derived=compareReviewedOpportunityRevisionClaims(
      before as Parameters<typeof compareReviewedOpportunityRevisionClaims>[0],
      after as Parameters<typeof compareReviewedOpportunityRevisionClaims>[1]);
    const context={opportunityId:'opp-1',asOf,available:true,
      beforeRevisionId:'rev-old',afterRevisionId:'rev-new'};
    f.port.getRevisionContext=vi.fn(async()=>context);
    f.port.compareRevisions=vi.fn(async()=>({
      opportunityId:'opp-1',asOf,beforeRevisionId:'rev-old',afterRevisionId:'rev-new',
      state:'READY',before,after,...derived,
    }));
    render(<OwnerOpportunityGovernance port={f.port} rights={rights} onSourceRevoked={revoked}/>);
    await act(async()=>{await f.session.initialize();});
    fireEvent.click(screen.getByRole('button',{name:/현재 허용된 두 기관 판본의 변경 검증/}));
    const result=await screen.findByRole('region',{name:'독립 승인된 두 기관 판본의 변경 비교'});
    expect(result.textContent).toContain('모집 취소');
    expect(result.textContent).toContain('정보 부족');
    expect(result.textContent).toContain('전/후 어느 한쪽의 근거 부족');
    expect(f.port.compareRevisions).toHaveBeenCalledWith('opp-1',{
      beforeRevisionId:'rev-old',afterRevisionId:'rev-new',asOf,
    },expect.any(AbortSignal));
    expect(revoked).not.toHaveBeenCalled();
  });
});
