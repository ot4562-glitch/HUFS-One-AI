// @vitest-environment jsdom
import {afterEach, describe, expect, it} from 'vitest';
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import type {LocalAccountId, LocalAccountProfile, LocalAccountSession, LocalAccountSnapshot} from '@hufs-one/contracts';
import {LocalAccountController, type LocalAccountPort} from './controller.js';
import {LocalAccountWorkbench} from './LocalAccountWorkbench.js';

afterEach(cleanup);
const profile:LocalAccountProfile={displayName:'빈 데모 계정',primaryMajor:null,doubleMajor:null,doubleMajorStatus:'UNSET',earnedCredits:null,
  interestTopics:[],desiredJobTopics:[],campus:null,cohort:null};
function setup() {
  let accountId:LocalAccountId='BLANK_DEMO';let revision=0;let resets=0;let saved:LocalAccountProfile=profile;
  const session=():LocalAccountSession=>({mode:'SYNTHETIC',sessionId:`session-${accountId}`,csrfToken:'csrf',accountId,
    accounts:(['BLANK_DEMO','SYN_OWNER_1','SYN_OWNER_2','SYN_OWNER_3','SYN_OWNER_4'] as const).map(id=>({accountId:id,label:id==='BLANK_DEMO'?'빈 데모 계정':id,resettable:id==='BLANK_DEMO',dataMode:'SYNTHETIC'}))});
  const snapshot=():LocalAccountSnapshot=>({mode:'SYNTHETIC',sessionId:`session-${accountId}`,accountId,revision,profile:saved,
    workspace:{search:'',notifications:false,bookmarks:[],experiences:[],planCourseIds:[]},asOf:'2026-11-02T00:00:00Z',
    feed:{asOf:'2026-11-02T00:00:00Z',featured:[],compact:[],hasMore:false,totalCandidates:0},notices:{asOf:'2026-11-02T00:00:00Z',items:[],pinnedIds:[]},
    clubs:{recommended:[],all:[]},academics:{state:'UNKNOWN',reason:'검수된 학칙 없음'},forecast:{state:'UNKNOWN',reason:'개설 검증 전'}});
  const port:LocalAccountPort={bootstrap:async()=>session(), select:async id=>{accountId=id; saved={...profile,displayName:id};return session();},read:async()=>snapshot(),
    saveProfile:async p=>{saved=p;revision++;return snapshot();},saveWorkspace:async()=>{revision++;return snapshot();},reset:async()=>{resets++;saved=profile;revision++;return snapshot();}};
  const controller=new LocalAccountController(port);render(<LocalAccountWorkbench controller={controller}/>);
  return {controller,get saved(){return saved;},get resets(){return resets;}};
}
describe('local HTTP workbench controls',()=>{
  it('edits empty fields without inventing credits, saves zero, and cancel restores saved values',async()=>{
    const app=setup();await screen.findByText('취득학점: 미입력');
    fireEvent.click(screen.getByRole('button',{name:'계정 설정'}));
    const credits=screen.getByLabelText('취득학점');expect((credits as HTMLInputElement).value).toBe('');
    fireEvent.change(credits,{target:{value:'0'}});fireEvent.click(screen.getByRole('button',{name:'프로필 저장'}));
    await screen.findByText('취득학점: 0');expect(app.saved.earnedCredits).toBe(0);
    fireEvent.click(screen.getByRole('button',{name:'계정 설정'}));
    fireEvent.change(screen.getByLabelText('주전공'),{target:{value:'취소할 전공'}});
    fireEvent.click(screen.getByRole('button',{name:'설정 취소'}));expect(app.saved.primaryMajor).toBeNull();
  });
  it('reset dialog cancels without mutation and confirms clearing with keyboard focus',async()=>{
    const app=setup();await screen.findByText('취득학점: 미입력');
    fireEvent.click(screen.getByRole('button',{name:'빈 데모 초기화'}));
    const dialog=screen.getByRole('dialog',{name:'빈 데모 초기화 확인'});
    expect(document.activeElement).toBe(within(dialog).getByRole('button',{name:'취소'}));
    fireEvent.keyDown(dialog,{key:'Escape'});expect(app.resets).toBe(0);expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'빈 데모 초기화'}));fireEvent.click(screen.getByRole('button',{name:'모두 지우고 초기화'}));
    await waitFor(()=>expect(app.resets).toBe(1));await screen.findByText('취득학점: 미입력');
  });
  it('switching drops unsaved drafts and removes reset from owner fixtures',async()=>{
    setup();await screen.findByText('취득학점: 미입력');fireEvent.click(screen.getByRole('button',{name:'계정 설정'}));
    fireEvent.change(screen.getByLabelText('주전공'),{target:{value:'이전 계정 초안'}});
    fireEvent.change(screen.getByLabelText('로컬 합성 계정'),{target:{value:'SYN_OWNER_1'}});
    await screen.findByText('표시 이름: SYN_OWNER_1');expect(screen.queryByDisplayValue('이전 계정 초안')).toBeNull();
    expect(screen.queryByRole('button',{name:'빈 데모 초기화'})).toBeNull();
  });
  it('offers labeled native controls at a 360px viewport and explains unknown sections',async()=>{
    Object.defineProperty(window,'innerWidth',{value:360,configurable:true});setup();await screen.findByText('취득학점: 미입력');
    expect(screen.getByRole('combobox',{name:'로컬 합성 계정'}).tagName).toBe('SELECT');fireEvent.click(screen.getByRole('button',{name:'계정 설정'}));
    expect(screen.getByRole('combobox',{name:'복수·이중전공 상태'}).tagName).toBe('SELECT');
    expect(screen.getByRole('combobox',{name:'캠퍼스'}).tagName).toBe('SELECT');
    expect(screen.getByRole('group',{name:'관심 분야 (최대 5개)'})).toBeTruthy();
    expect(screen.getByRole('heading',{name:'AI 상태'})).toBeTruthy();
    expect(screen.getAllByText(/UNKNOWN/).length).toBeGreaterThan(0);
  });
});
