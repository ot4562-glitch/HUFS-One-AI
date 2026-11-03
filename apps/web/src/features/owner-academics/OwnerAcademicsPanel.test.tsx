// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {OwnerSessionController} from '../../app/owner-session-controller.js';
import {HufsApiError} from '../../integrations/api-error.js';
import {createTrustedOwnerDoubleMajorSource} from '../../../../api/src/modules/academics/owner-double-major-source.js';
import {doubleMajorInput} from '../../../../../tests/api/owner-double-major-fixture.js';
import {OwnerMajorWhatIfResponseSchema,OwnerStudyPlanCheckResponseSchema} from '@hufs-one/contracts';
import {OwnerAcademicsPanel,type OwnerAcademicsPort} from './OwnerAcademicsPanel.js';

const at='2026-11-03T00:00:00.000Z';
const A={actorId:'SYN-OWNER',role:'BETA' as const,schoolMailProofValid:true as const,betaAllowed:true as const};
async function audit(){
  return (await createTrustedOwnerDoubleMajorSource({snapshots:{
    load:async()=>({actorId:A.actorId,asOf:at,receipt:'SYN-SOURCE-RECEIPT',
      projectionVersion:'SYN-PROJ-V1',input:doubleMajorInput()}),
    revalidate:async()=>true,
  }}).inspect({actorId:A.actorId,now:at})).check;
}
const plan=OwnerStudyPlanCheckResponseSchema.parse({
  state:'NEEDS_REVIEW',asOf:at,term:'2027-1',versions:{},termLoadCreditUnits:0,
  planIssues:[],unchecked:[],evidenceLinks:[],
  caveats:['NOT_OFFICIAL_REGISTRATION','NOT_GRADUATION_DECISION'],
  disclosure:{mode:'REDACTED',visibleCourseRefs:[]},
});
const blocked=OwnerMajorWhatIfResponseSchema.parse({
  state:'BLOCKED_DEPENDENCY',asOf:at,scenario:{action:'REMOVE_DOUBLE_MAJOR'},
  blockers:['TARGET_PROGRAM_UNAVAILABLE'],caveat:'HYPOTHETICAL_NOT_OFFICIAL',
});
async function setup(){
  let id:unknown=A;
  const session=new OwnerSessionController({getSession:async()=>id});
  const port:OwnerAcademicsPort={
    session,current:vi.fn(async()=>audit()),
    plan:vi.fn(async()=>plan),hypothetical:vi.fn(async()=>blocked),
  };
  return {port,identity:(next:unknown)=>{id=next;}};
}
afterEach(cleanup);
describe('#144/#81/#82 BETA owner academic UI',()=>{
  it('renders exact double-major audit, never a guessed READY or official graduation',async()=>{
    const f=await setup();render(<OwnerAcademicsPanel port={f.port}/>);
    await screen.findByText(/선택: SELECTED/);
    expect(screen.getByText(/중복 합산하지 않은 이수 학점/)).textContent).toContain('3학점');
    expect(screen.getByText(/중복 인정:/)).textContent).toContain('NO_APPROVED_RULE');
    expect(screen.getByText(/공식 판정이 아닙니다/)).toBeTruthy();
  });
  it('uses validated future term + approved server response, and does not invent an unverified credit cap',async()=>{
    const f=await setup();render(<OwnerAcademicsPanel port={f.port}/>);
    await screen.findByText(/선택: SELECTED/);
    fireEvent.change(screen.getByLabelText('정규 학기'),{target:{value:'INVALID'}});
    fireEvent.click(screen.getByRole('button',{name:'권한·원문 확인 후 검사'}));
    expect(await screen.findByRole('alert')).textContent).toContain('YYYY-1');
    expect(f.port.plan).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('정규 학기'),{target:{value:'2027-1'}});
    fireEvent.click(screen.getByRole('button',{name:'권한·원문 확인 후 검사'}));
    await waitFor(()=>expect(f.port.plan).toHaveBeenCalledWith({term:'2027-1'},expect.any(AbortSignal)));
    expect(await screen.findByText(/학점 상한과 시간 충돌은 공식 근거가 확인되기 전/)).toBeTruthy();
    expect(screen.queryByText(/검수된 학기 학점 상한/)).toBeNull();
  });
  it('allows only current double-major removal hypothetical; missing target program never becomes READY',async()=>{
    const f=await setup();render(<OwnerAcademicsPanel port={f.port}/>);
    await screen.findByText(/선택: SELECTED/);
    expect(screen.getByText(/임의 전공 추가·변경은 비활성/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:/현재 이중전공을 제외한다면/}));
    await waitFor(()=>expect(f.port.hypothetical).toHaveBeenCalledWith({
      scenario:{action:'REMOVE_DOUBLE_MAJOR'}},expect.any(AbortSignal)));
    expect(await screen.findByText(/TARGET_PROGRAM_UNAVAILABLE/)).toBeTruthy();
  });
  it('drops previous private data on a changed BETA actor and after a 503',async()=>{
    const f=await setup();render(<OwnerAcademicsPanel port={f.port}/>);
    await screen.findByText(/선택: SELECTED/);
    f.identity({...A,actorId:'SYN-OTHER'});
    await act(async()=>{await f.port.session.revalidate();});
    expect(screen.queryByText(/중복 합산하지 않은 이수 학점/)).toBeNull();
    expect(screen.getByRole('alert')).textContent).toContain('이전 결과를 비웠습니다');
    const g=await setup();const denied:OwnerAcademicsPort={...g.port,current:async()=>{
      throw new HufsApiError('PROVIDER_UNAVAILABLE',503);
    }};
    cleanup();render(<OwnerAcademicsPanel port={denied}/>);
    expect(await screen.findByRole('alert')).textContent).toContain('이전 결과를 비웠습니다');
  });
});
