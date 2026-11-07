import {useEffect,useState,useSyncExternalStore} from 'react';
import {TOPIC_CODES,type TopicCode,type SelfProfile,type OwnerWorkspaceValue} from '@hufs-one/contracts';
import type {OwnerSessionController} from '../../app/owner-session-controller.js';
import type {OwnerCareerSnapshot,CareerExperience} from '../../../../packages/core/src/career/owner-roadmap.js';
import {TOPIC_TEXT} from '../demo/topicText.js';
import {attachDemoResumeRevalidation} from '../../app/resume-listener.js';
import {attachCrossTabSessionClosure,SESSION_CLOSE_CHANNEL} from '../../app/session-broadcast.js';
import {InAppLink} from '../../shell/AppShell.js';
import '../local-accounts/localAccounts.css';

type ExperienceValue=Extract<OwnerWorkspaceValue,{kind:'EXPERIENCE'}>;
export interface OwnerCareerPort {
  readonly session:OwnerSessionController;
  load(signal:AbortSignal):Promise<OwnerCareerSnapshot>;
  saveProfile(change:{expectedVersion:number;value:SelfProfile['value']},signal:AbortSignal):Promise<unknown>;
  updateExperience(id:string,change:{expectedVersion:number;value:ExperienceValue},signal:AbortSignal):Promise<unknown>;
  removeExperience(id:string,version:number,signal:AbortSignal):Promise<unknown>;
}
const STAGE:Record<string,string>={
  INTERESTED:'관심 있음',
  PREPARING:'지원 준비 중',
  SUBMITTED_SELF_REPORTED:'지원했다고 직접 기록함 (외부 확인 전)',
  AWAITING_RESULT:'결과 기다리는 중 (본인 기록)',
  RESULT_RECORDED:'본인이 결과를 기록함 (공식 확인 전)',
};
function CurrentCareer({port,navigate}:{port:OwnerCareerPort;navigate:(path:string)=>void}){
  const [data,setData]=useState<OwnerCareerSnapshot|null>(null);
  const [loaded,setLoaded]=useState(false);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [name,setName]=useState('');
  const [interests,setInterests]=useState<TopicCode[]>([]);
  const [goals,setGoals]=useState<TopicCode[]>([]);
  const [editing,setEditing]=useState<CareerExperience|null>(null);
  const [title,setTitle]=useState('');
  const [summary,setSummary]=useState('');
  const [role,setRole]=useState('');
  const [startedOn,setStartedOn]=useState('');
  const [endedOn,setEndedOn]=useState('');
  const [confirmDelete,setConfirmDelete]=useState(false);

  const absorb=(next:OwnerCareerSnapshot)=>{
    setData(next);setLoaded(true);setName(next.displayName??'');
    setInterests([...next.interestTopics]);setGoals([...next.desiredJobTopics]);
    setEditing(null);setConfirmDelete(false);
  };
  const refresh=async()=>{
    const next=await port.session.runLatest('owner-career-hub',signal=>port.load(signal));
    if(next&&port.session.getState().status==='READY')absorb(next);
  };
  useEffect(()=>{
    let active=true;
    void port.session.runLatest('owner-career-hub',signal=>port.load(signal)).then(next=>{
      if(!active)return;
      if(next)absorb(next);else setLoaded(true);
    });
    return ()=>{active=false;};
  },[port]);
  const modify=async(work:(signal:AbortSignal)=>Promise<unknown>,message:string)=>{
    if(busy||port.session.getState().status!=='READY')return;
    setBusy(true);setNotice('');
    try{
      const result=await port.session.runMutation(work);
      if(result&&port.session.getState().status==='READY'){
        await refresh();setNotice(message);
      }
    }finally{setBusy(false);}
  };
  const beginEdit=(experience:CareerExperience)=>{
    setEditing(experience);setTitle(experience.title);setSummary(experience.summary);
    setRole(experience.role??'');setStartedOn(experience.startedOn??'');setEndedOn(experience.endedOn??'');
    setConfirmDelete(false);
  };
  if(!loaded)return <p aria-busy="true">비공개 커리어 기록의 현재 동의·소유권을 확인 중입니다.</p>;
  if(!data)return <p role="alert">현재 본인 기록을 안전하게 확인할 수 없습니다. 권한을 다시 확인해 주세요.</p>;
  if(data.consentVersion===null)return <section role="status">
    <p>개인 보관 동의가 확인되지 않아 이름·경험·AI 승인 내역을 표시하지 않았습니다.</p>
    <p>이 페이지는 실제 BETA 계정에서만 조회할 수 있습니다. 합성 S01~S05와 공유하지 않습니다.</p>
  </section>;
  return <div className="local-account__panel" aria-label="본인 비공개 커리어 허브">
    <p role="note">나만 보는 자기기록입니다. 경험과 관심 분야는 자기신고·본인 선택이며 학교 인증 학점·기술 숙련·채용 합격 가능성의 증거가 아닙니다.
      AI 분석·외부 서비스 전송은 이 화면에서 자동 실행하지 않습니다.</p>
    {!data.complete&&<p role="status">일부 기록만 조회했습니다. 아래 역량 목록은 전체 계정의 확정된 분석 결과가 아닙니다.</p>}
    <section aria-label="기본 프로필">
      <h2>기본 프로필 · 비공개</h2>
      <form onSubmit={event=>{
        event.preventDefault();
        if(!name.trim()||interests.length>5||goals.length>3)return;
        void modify(signal=>port.saveProfile({expectedVersion:data.profileVersion,
          value:{displayName:name.trim(),interestTopics:interests,desiredJobTopics:goals}},signal),
          '본인 프로필을 저장했습니다. 추천·AI 실행 및 외부 공개는 자동으로 발생하지 않습니다.');
      }}>
        <label htmlFor="career-owner-name">표시 이름 (최대 40자)</label>
        <input id="career-owner-name" value={name} onChange={e=>setName(e.target.value)} maxLength={40} required disabled={busy}/>
        <label htmlFor="career-interests">관심 분야 (최대 5개, 여러 개 선택)</label>
        <select id="career-interests" multiple size={6} value={interests} disabled={busy}
          onChange={event=>setInterests(Array.from(event.currentTarget.selectedOptions,option=>option.value as TopicCode))}>
          {TOPIC_CODES.map(code=><option value={code} key={code}>{TOPIC_TEXT[code]}</option>)}
        </select>
        <label htmlFor="career-goals">관심 직무 (최대 3개, 여러 개 선택)</label>
        <select id="career-goals" multiple size={6} value={goals} disabled={busy}
          onChange={event=>setGoals(Array.from(event.currentTarget.selectedOptions,option=>option.value as TopicCode))}>
          {TOPIC_CODES.map(code=><option value={code} key={code}>{TOPIC_TEXT[code]}</option>)}
        </select>
        <p><button type="submit" disabled={busy||!name.trim()||interests.length>5||goals.length>3}>비공개 프로필 저장</button></p>
      </form>
    </section>
    <section aria-label="경험에서 승인한 분야">
      <h2>내가 확인한 경험 분야</h2>
      {data.approvedEvidence.length===0?<p>현재 유효한 본인 승인 주제가 없습니다. AI 후보만으로 자동 승인하지 않습니다.</p>:
        <ul>{data.approvedEvidence.map(row=><li key={row.topicCode}>
          <strong>{TOPIC_TEXT[row.topicCode]}</strong> · 본인 승인 경험 {row.experienceIds.length}건
        </li>)}</ul>}
    </section>
    <section aria-label="진로 탐색 주제">
      <h2>앞으로 탐색해 볼 분야</h2>
      <p>현재 선택한 직무·관심사에서, 아직 이 페이지에 본인 승인 경험이 연결되지 않은 분야입니다. 능력 부족·지원 부적격을 뜻하지 않습니다.</p>
      {data.exploreTopics.length===0?<p>표시할 탐색 주제가 없습니다. 이것이 취업 준비가 완료됐다는 의미는 아닙니다.</p>:
        <ul>{data.exploreTopics.map(code=><li key={code}>{TOPIC_TEXT[code]}</li>)}</ul>}
      <p><InAppLink to="/opportunities" navigate={navigate}>출처와 조건을 확인하며 기회 살펴보기</InAppLink></p>
    </section>
    <section aria-label="경험 타임라인">
      <h2>경험 타임라인 · 자기신고</h2>
      <p><InAppLink to="/experience" navigate={navigate}>경험 추가·AI 후보 검토·승인/철회</InAppLink></p>
      {data.experiences.length===0?<p>기록된 본인 경험이 없습니다. 합성 데이터는 내 이력에 섞지 않습니다.</p>:
        <ol>{data.experiences.map(item=><li key={item.id}>
          <strong>{item.title}</strong>
          <p>{item.state==='SELF_REPORTED'?'내가 기록한 경험 (공식 증명 전)':'작성 중인 초안'}</p>
          {item.role&&<p>역할: {item.role}</p>}
          {(item.startedOn||item.endedOn)&&<p>활동 기간: {item.startedOn??'시작 미입력'} ~ {item.endedOn??'종료 미입력'}</p>}
          {item.summary&&<p>{item.summary}</p>}
          <p>내가 승인한 주제: {item.approvedTopics.length?
            item.approvedTopics.map(c=>TOPIC_TEXT[c]).join(' · '):'없음/이전 승인 철회·미검증'}</p>
          <button type="button" disabled={busy} onClick={()=>beginEdit(item)}>경험 수정·삭제</button>
        </li>)}</ol>}
      {editing&&<form aria-label="경험 수정과 삭제" onSubmit={event=>{
        event.preventDefault();
        if(startedOn&&endedOn&&startedOn>endedOn)return;
        const value:ExperienceValue={
          kind:'EXPERIENCE',dataMode:'OWNER_CONSENTED',state:editing.state,title:title.trim(),
          summary:summary.trim(),...(role.trim()?{role:role.trim()}:{}),
          ...(startedOn?{startedOn}:{}),...(endedOn?{endedOn}:{}),
          ...(editing.sourceOpportunityId?{sourceOpportunityId:editing.sourceOpportunityId}:{}),
        };
        void modify(signal=>port.updateExperience(editing.id,
          {expectedVersion:editing.version,value},signal),
          '경험을 수정했습니다. 이전 AI 후보·승인 결과는 현재 판본 기준으로 다시 확인해야 합니다.');
      }}>
        <h3>선택한 경험 수정</h3>
        <label htmlFor="career-exp-title">제목</label>
        <input id="career-exp-title" value={title} onChange={e=>setTitle(e.target.value)} maxLength={120} required disabled={busy}/>
        <label htmlFor="career-exp-role">맡은 역할</label>
        <input id="career-exp-role" value={role} onChange={e=>setRole(e.target.value)} maxLength={80} disabled={busy}/>
        <label htmlFor="career-exp-summary">수행한 일</label>
        <textarea id="career-exp-summary" rows={3} value={summary} onChange={e=>setSummary(e.target.value)} maxLength={500} disabled={busy}/>
        <label htmlFor="career-exp-start">시작일</label><input id="career-exp-start" type="date" value={startedOn} disabled={busy} onChange={e=>setStartedOn(e.target.value)}/>
        <label htmlFor="career-exp-end">종료일</label><input id="career-exp-end" type="date" value={endedOn} disabled={busy} onChange={e=>setEndedOn(e.target.value)}/>
        {startedOn&&endedOn&&startedOn>endedOn&&<p role="alert">종료일은 시작일보다 빨라서는 안 됩니다.</p>}
        <p><button type="submit" disabled={busy||!title.trim()||!!(startedOn&&endedOn&&startedOn>endedOn)}>수정 저장</button>
          <button type="button" disabled={busy} onClick={()=>{setEditing(null);setConfirmDelete(false);}}>취소</button></p>
        <label><input type="checkbox" disabled={busy} checked={confirmDelete} onChange={e=>setConfirmDelete(e.target.checked)}/>
          경험과 연동된 현재 승인·추천 신호의 무효화를 이해하고 삭제합니다.</label>
        <p><button type="button" disabled={busy||!confirmDelete}
          onClick={()=>{void modify(signal=>port.removeExperience(editing.id,editing.version,signal),
            '경험을 삭제했습니다. 현재 승인/추천은 새 요청에서만 확인하세요.');}}>
          경험 삭제</button></p>
      </form>}
    </section>
    <section aria-label="내가 기록한 관심 공고와 지원 단계">
      <h2>보관함·지원 단계</h2>
      <p>실제 외부 접수/합격을 확인한 데이터가 아니라 본인이 기록한 상태입니다. <InAppLink to="/saved" navigate={navigate}>보관함 열기</InAppLink></p>
      {data.bookmarks.length===0?<p>이 범위에 본인 보관함 항목이 없습니다.</p>:
        <ul>{data.bookmarks.map(item=><li key={item.id}>
          공고 ID: {item.opportunityId} · {STAGE[item.stage]??'확인 필요'}
        </li>)}</ul>}
    </section>
    <section aria-label="AI 실행 상태 안내">
      <h2>AI 실행 이력과 사용 근거</h2>
      <p>이 커리어 화면에서 신규 유료 모델 호출이나 캐시 재생을 자동 실행하지 않습니다.
        승인된 BETA 공급자 작업은 별도 화면에서 새 실행과 기존 작업 재조회를 구별해 확인하세요.
        실행 기록이 없다면 모델 정확도를 측정했다고 주장하지 않습니다.</p>
      <p><InAppLink to="/owner-ai" navigate={navigate}>본인 승인 AI 작업 및 실행·재조회 화면</InAppLink></p>
    </section>
    {notice&&<p role="status">{notice}</p>}
  </div>;
}

/** Only a verified BETA owner has a port. Public S01–S05 and REVIEWER never use it. */
export function OwnerCareerPanel({port,navigate}:{port:OwnerCareerPort;navigate:(path:string)=>void}){
  const state=useSyncExternalStore(port.session.subscribe,port.session.getState,port.session.getState);
  useEffect(()=>{void port.session.initialize();},[port]);
  useEffect(()=>attachDemoResumeRevalidation(port.session,{page:document,view:window}),[port]);
  useEffect(()=>{
    if(typeof BroadcastChannel==='undefined')return;
    const channel=new BroadcastChannel(SESSION_CLOSE_CHANNEL);
    const detach=attachCrossTabSessionClosure(port.session,channel);
    return ()=>{detach();channel.close();};
  },[port]);
  if(state.status==='IDLE'||state.status==='CHECKING')
    return <p aria-busy="true">본인 커리어 데이터와 현재 권한을 확인하고 있습니다.</p>;
  if(state.status!=='READY')
    return <p role="alert">본인 커리어 조회 권한·서버 연결을 확인할 수 없습니다. 이전 학생·AI 기록을 표시하지 않습니다.</p>;
  return <CurrentCareer key={state.epoch} port={port} navigate={navigate}/>;
}
