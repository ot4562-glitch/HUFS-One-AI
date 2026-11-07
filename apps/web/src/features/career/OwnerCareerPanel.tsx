import {useEffect,useState,useSyncExternalStore,type FormEvent} from 'react';
import type {ExperiencePortfolio,OwnerWorkspaceRecord,OwnerWorkspaceValue,SelfProfile} from '@hufs-one/contracts';
import {buildCareerRoadmap,buildCareerTimeline} from '../../../../../packages/core/src/career/roadmap.js';
import type {OwnerSessionController} from '../../app/owner-session-controller.js';
import {TOPIC_TEXT} from '../demo/topicText.js';

export interface OwnerCareerPort {
  readonly session:OwnerSessionController;
  getProfile(signal?:AbortSignal):Promise<{profile:SelfProfile|null}>;
  saveProfile(change:{expectedVersion:number;value:SelfProfile['value']},signal?:AbortSignal):Promise<{profile:SelfProfile}>;
  getPortfolio(query:{afterId?:string;limit?:number},signal?:AbortSignal):Promise<ExperiencePortfolio>;
  create(input:{itemId:string;value:OwnerWorkspaceValue},signal?:AbortSignal):Promise<unknown>;
  update(itemId:string,input:{expectedVersion:number;value:OwnerWorkspaceValue},signal?:AbortSignal):Promise<unknown>;
  remove(id:string,version:number,signal?:AbortSignal):Promise<unknown>;
}

type Screen={profile:SelfProfile|null;portfolio:ExperiencePortfolio};
const CATEGORY={
  PROJECT:'프로젝트',CLUB:'동아리',VOLUNTEERING:'봉사',WORK:'근로',INTERNSHIP:'인턴',
  CONTEST:'공모전',CERTIFICATE:'자격',EDUCATION:'교육',OTHER:'그 외 활동',
} as const;

function Form({data,onSave,busy}:{data:SelfProfile|null;onSave:(headline:string,bio:string)=>void;busy:boolean}){
  const [headline,setHeadline]=useState(data?.value.headline??'');
  const [bio,setBio]=useState(data?.value.bio??'');
  return <form className="sandbox__form" onSubmit={(e:FormEvent)=>{e.preventDefault();onSave(headline,bio);}}>
    <h3>비공개 포트폴리오 소개</h3>
    <p>본인만 열람합니다. 공개 프로필·학교 공식 인증은 제공하지 않습니다.</p>
    <label htmlFor="career-headline">한 줄 소개</label>
    <input id="career-headline" value={headline} maxLength={120} onChange={e=>setHeadline(e.target.value)} disabled={busy}/>
    <label htmlFor="career-bio">자기소개</label>
    <textarea id="career-bio" value={bio} maxLength={700} rows={4} onChange={e=>setBio(e.target.value)} disabled={busy}/>
    <button type="submit" disabled={busy}>비공개 소개 저장</button>
  </form>;
}

export function OwnerCareerPanel({port}:{port:OwnerCareerPort}){
  const session=useSyncExternalStore(port.session.subscribe,port.session.getState,port.session.getState);
  const [screen,setScreen]=useState<Screen|null>(null);
  const [cursor,setCursor]=useState<string|undefined>();
  const [rev,setRev]=useState(0);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [title,setTitle]=useState(''),[summary,setSummary]=useState('');
  const [role,setRole]=useState(''),[startedOn,setStartedOn]=useState(''),[endedOn,setEndedOn]=useState('');
  const [category,setCategory]=useState<keyof typeof CATEGORY>('PROJECT');
  const [editing,setEditing]=useState<string|null>(null);
  const [deleteId,setDeleteId]=useState<string|null>(null);

  useEffect(()=>{void port.session.initialize();},[port]);
  useEffect(()=>{
    setScreen(null);setError('');setDeleteId(null);setEditing(null);
    if(session.status!=='READY')return;
    let active=true;
    void port.session.runLatest('owner-career-page',async signal=>{
      const [profile,portfolio]=await Promise.all([port.getProfile(signal),
        port.getPortfolio(cursor?{limit:20,afterId:cursor}:{limit:20},signal)]);
      return {profile:profile.profile,portfolio};
    }).then(value=>{if(active&&value&&port.session.getState().status==='READY')setScreen(value);})
      .catch(()=>{if(active)setError('포트폴리오를 조회할 수 없습니다. 현재 본인 권한·동의를 확인해 주세요.');});
    return ()=>{active=false;};
  },[port,session.status,session.epoch,cursor,rev]);
  const execute=async(run:(signal:AbortSignal)=>Promise<unknown>)=>{
    if(busy||session.status!=='READY')return;
    setBusy(true);setError('');
    try{
      const result=await port.session.runMutation(run);
      if(result&&port.session.getState().status==='READY'){setCursor(undefined);setRev(x=>x+1);}
    }catch{setError('저장/변경에 실패했습니다. 본인 권한·동의 또는 최신 판본을 확인해 주세요.');}
    finally{setBusy(false);}
  };
  const saveProfile=(headline:string,bio:string)=>{
    const old=screen?.profile;
    void execute(signal=>port.saveProfile({expectedVersion:old?.version??0,value:{
      displayName:old?.value.displayName??'나의 진로',
      interestTopics:old?.value.interestTopics??[],desiredJobTopics:old?.value.desiredJobTopics??[],
      headline:headline.trim(),bio:bio.trim(),visibility:'PRIVATE',
    }},signal));
  };
  const submitExperience=(event:FormEvent)=>{
    event.preventDefault();
    const name=title.trim();
    if(!name)return;
    if(startedOn&&endedOn&&startedOn>endedOn){setError('활동 종료일이 시작일보다 빠릅니다.');return;}
    const value:OwnerWorkspaceValue={
      kind:'EXPERIENCE',dataMode:'OWNER_CONSENTED',state:'SELF_REPORTED',
      title:name,summary:summary.trim(),category,
      ...(role.trim()?{role:role.trim()}:{}),
      ...(startedOn?{startedOn}:{}),...(endedOn?{endedOn}:{}),
    };
    const record=screen?.portfolio.items.find(x=>x.itemId===editing);
    void execute(async signal=>{
      if(record)await port.update(record.itemId,{expectedVersion:record.version,value},signal);
      else await port.create({itemId:'career-'+crypto.randomUUID().replaceAll('-',''),value},signal);
    });
  };
  if(session.status==='IDLE'||session.status==='CHECKING')return <p aria-busy="true">본인 계정과 동의를 확인하고 있습니다.</p>;
  if(session.status!=='READY')return <p role="alert">현재 사용자 세션을 확인할 수 없습니다. 이전 프로필과 타임라인은 표시하지 않습니다.</p>;
  if(!screen)return <p aria-busy={!error}>{error||'본인 비공개 진로 자료를 불러오는 중입니다.'}</p>;

  const roadmap=screen.profile?buildCareerRoadmap({profile:screen.profile,portfolio:screen.portfolio}):null;
  const timeline=buildCareerTimeline(screen.portfolio);
  return <section aria-label="본인 전용 커리어 포트폴리오">
    <p role="note">본인만 볼 수 있는 자기보고 활동입니다. AI 제안·본인 승인과 학교의 공식 경력/자격 인증은 다릅니다. 목록은 최대 20건씩 조회됩니다.</p>
    {error&&<p role="alert">{error}</p>}
    <Form key={screen.profile?.version??0} data={screen.profile} onSave={saveProfile} busy={busy}/>
    <section aria-labelledby="career-roadmap-heading">
      <h2 id="career-roadmap-heading">나의 관심·진로 탐색 로드맵</h2>
      {!roadmap?<p>관심·희망 분야를 계정 설정에서 먼저 입력해 주세요.</p>:<>
        <p>{roadmap.disclaimer}</p>
        {!roadmap.complete&&<p role="status">현재 화면의 경험 20건만 분석했습니다. 다음 페이지의 승인 주제는 포함되지 않습니다.</p>}
        <h3>현재 페이지에서 본인이 승인한 분야</h3>
        {roadmap.strengthTopics.length?<ul>{roadmap.strengthTopics.map(t=><li key={t.topicCode}>
          {TOPIC_TEXT[t.topicCode]} · 근거 있는 경험 {t.experienceIds.length}건 (본인 승인, 공식 인증 아님)
        </li>)}</ul>:<p>승인된 경험 주제가 아직 없습니다.</p>}
        <h3>더 살펴볼 분야</h3>
        {roadmap.nextSteps.length?<ul>{roadmap.nextSteps.map(t=><li key={t.topicCode}>
          <strong>{TOPIC_TEXT[t.topicCode]}</strong> — {t.explanation}
        </li>)}</ul>:<p>이 페이지에서는 추가 탐색 분야를 찾지 못했습니다. 전체 계정 분석을 의미하지 않습니다.</p>}
      </>}
    </section>
    <section aria-labelledby="career-timeline-heading">
      <h2 id="career-timeline-heading">경험·활동 타임라인 (비공개)</h2>
      <form className="sandbox__form" onSubmit={submitExperience}>
        <h3>{editing?'경험 수정':'새 경험 기록'}</h3>
        <label htmlFor="career-title">제목</label><input id="career-title" required maxLength={120} value={title} onChange={e=>setTitle(e.target.value)} disabled={busy}/>
        <label htmlFor="career-category">활동 종류</label>
        <select id="career-category" value={category} onChange={e=>setCategory(e.target.value as keyof typeof CATEGORY)} disabled={busy}>
          {Object.entries(CATEGORY).map(([key,label])=><option key={key} value={key}>{label}</option>)}
        </select>
        <label htmlFor="career-role">담당 역할</label><input id="career-role" maxLength={80} value={role} onChange={e=>setRole(e.target.value)} disabled={busy}/>
        <label htmlFor="career-summary">활동 내용 (본인 작성)</label>
        <textarea id="career-summary" maxLength={500} value={summary} onChange={e=>setSummary(e.target.value)} disabled={busy}/>
        <label htmlFor="career-start">시작일</label><input id="career-start" type="date" value={startedOn} onChange={e=>setStartedOn(e.target.value)} disabled={busy}/>
        <label htmlFor="career-end">종료일</label><input id="career-end" type="date" value={endedOn} onChange={e=>setEndedOn(e.target.value)} disabled={busy}/>
        <button disabled={busy} type="submit">{editing?'수정 저장':'경험 등록'}</button>
        {editing&&<button type="button" disabled={busy} onClick={()=>{setEditing(null);setTitle('');setSummary('');setRole('');setStartedOn('');setEndedOn('');}}>수정 취소</button>}
      </form>
      {timeline.length===0?<p>기록한 경험이 없습니다.</p>:<ol>{timeline.map(item=><li key={item.itemId}>
        <article>
          <h3>{item.title}</h3>
          <p>{CATEGORY[item.category]} · {item.startedOn??'시작일 미기록'} ~ {item.endedOn??'종료일 미기록'}</p>
          {item.role&&<p>역할: {item.role}</p>}
          <p>{item.summary}</p>
          <p>{item.evidence.state==='OWNER_APPROVED_TOPIC'
            ? '현재 페이지에서 본인이 주제를 승인했습니다. 공식 역량 인증은 아닙니다.'
            : '본인 기록이며 확인된 역량 인증이 없습니다.'}</p>
          <button type="button" disabled={busy} onClick={()=>{
            setEditing(item.itemId);setDeleteId(null);setTitle(item.title);setSummary(item.summary);
            setRole(item.role??'');setCategory(item.category);setStartedOn(item.startedOn??'');setEndedOn(item.endedOn??'');
          }}>수정</button>
          {deleteId===item.itemId?<><p>삭제하면 이 경험에 대한 승인된 주제를 추천에 재사용하지 않습니다. 삭제하시겠습니까?</p>
            <button type="button" disabled={busy} onClick={()=>{const record=screen.portfolio.items.find((x:OwnerWorkspaceRecord)=>x.itemId===item.itemId);if(record)void execute(signal=>port.remove(item.itemId,record.version,signal));}}>삭제 확인</button>
            <button type="button" onClick={()=>setDeleteId(null)}>취소</button>
          </>:<button type="button" disabled={busy} onClick={()=>setDeleteId(item.itemId)}>삭제</button>}
        </article>
      </li>)}</ol>}
      {screen.portfolio.nextCursor&&<button type="button" disabled={busy} onClick={()=>setCursor(screen.portfolio.nextCursor??undefined)}>다음 경험 20건</button>}
      {cursor&&<button type="button" disabled={busy} onClick={()=>setCursor(undefined)}>첫 페이지</button>}
    </section>
  </section>;
}
