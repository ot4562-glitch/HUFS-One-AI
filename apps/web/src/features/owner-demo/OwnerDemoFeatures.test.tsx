// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {recomputeDemoProfile} from '../../../../api/src/modules/profiles/demo-profile.js';
import {blankDemoProfileWorkspace,type DemoProfileWorkspace} from '@hufs-one/contracts';
import {OwnerDemoFeatures} from './OwnerDemoFeatures.js';
afterEach(cleanup);
const record={version:1,updatedAt:'2026-11-05T00:00:00.000Z',value:{primaryMajor:'가상 정보학',
  earnedCreditUnits:0,interestTopics:['AI_ML'],doubleMajor:{kind:'NONE'}},workspace:blankDemoProfileWorkspace()};
describe('#132 owner feature consumer',()=>{
  it('shows same-version recommendations, details and a disabled application with provenance',()=>{
    const response=recomputeDemoProfile(record);const onSave=vi.fn();
    render(<OwnerDemoFeatures response={response} busy={false} onSave={onSave}/>);
    const list=within(screen.getByRole('region',{name:'빈 계정 추천'}));
    fireEvent.click(list.getAllByRole('button',{name:/상세 보기/})[0]!);
    expect(screen.getByRole('region',{name:'합성 기회 상세'})).toBeTruthy();
    expect((screen.getByRole('button',{name:'실제 지원 불가 · 합성 시연'}) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/syn-corpus-v1/)).toBeTruthy();
    expect(screen.getByRole('region',{name:'빈 계정 일정'})).toBeTruthy();
    expect(screen.getByRole('region',{name:'빈 계정 공지'})).toBeTruthy();
  });
  it('saves an opportunity without touching real owner APIs and collects an explicit draft experience',async()=>{
    const response=recomputeDemoProfile(record),onSave=vi.fn(async(_workspace:DemoProfileWorkspace)=>{});
    render(<OwnerDemoFeatures response={response} busy={false} onSave={onSave}/>);
    const list=within(screen.getByRole('region',{name:'빈 계정 추천'}));
    fireEvent.click(list.getAllByRole('button',{name:/보관함 저장/})[0]!);
    expect(onSave.mock.calls[0]?.[0]?.bookmarks).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('가상 경험 제목'),{target:{value:'합성 분석 활동'}});
    fireEvent.change(screen.getByLabelText('가상 경험 분야'),{target:{value:'DATA_ANALYTICS'}});
    fireEvent.click(screen.getByRole('button',{name:'경험 초안 저장'}));
    await waitFor(()=>expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[1]?.[0]).toMatchObject({experienceOverlay:'OFF',experiences:[{title:'합성 분석 활동',topicCodes:['DATA_ANALYTICS']}]});
  });
  it('labels academics/forecast UNKNOWN and avoids official grade, AI or notification claims',()=>{
    render(<OwnerDemoFeatures response={recomputeDemoProfile(record)} busy={false} onSave={vi.fn()}/>);
    expect(screen.getByText(/학업·개설 전망: 근거 부족/)).toBeTruthy();
    expect(screen.getByText(/외부 AI 호출 없음/)).toBeTruthy();
    expect(screen.getByText(/실제 알림 발송 없음/)).toBeTruthy();
  });
});
