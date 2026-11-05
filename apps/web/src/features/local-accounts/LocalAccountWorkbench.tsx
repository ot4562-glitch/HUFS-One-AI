import {useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode} from 'react';
import {TOPIC_CODES, LocalAccountWorkspaceSchema, type LocalAccountId, type LocalAccountProfile, type LocalAccountSnapshot, type LocalAccountWorkspace, type TopicCode} from '@hufs-one/contracts';
import {TOPIC_TEXT} from '../demo/topicText.js';
import {LocalAccountController} from './controller.js';
import {LocalAccountHttpClient} from './client.js';
import {parseProfileDraft, profileDraft, type ProfileDraft} from './profileDraft.js';
import {HufsAbilityMenu} from './HufsAbilityMenu.js';
import {observePeerFreshness} from './peerLifecycle.js';
import './localAccounts.css';

function TopicChoices({legend,selected,limit,onChange}:{legend:string;selected:TopicCode[];limit:number;onChange:(topics:TopicCode[])=>void}) {
  return <fieldset className="local-account__topics"><legend>{legend}</legend>{TOPIC_CODES.map(topic=><label key={topic}>
    <input type="checkbox" checked={selected.includes(topic)} disabled={!selected.includes(topic)&&selected.length>=limit}
      onChange={event=>onChange(event.target.checked?[...selected,topic]:selected.filter(t=>t!==topic))}/>{TOPIC_TEXT[topic]}</label>)}</fieldset>;
}

function ProfileSettings({profile,onSave,onCancel}:{profile:LocalAccountProfile;onSave:(profile:LocalAccountProfile)=>void;onCancel:()=>void}) {
  const [draft,setDraft]=useState(()=>profileDraft(profile));const [error,setError]=useState<string|null>(null);
  const edit=<K extends keyof ProfileDraft>(key:K,value:ProfileDraft[K])=>setDraft(previous=>({...previous,[key]:value}));
  function submit(event:FormEvent) {
    event.preventDefault();try {onSave(parseProfileDraft(draft));} catch {setError('입력을 확인해 주세요. 표시 이름, 선택한 복수·이중전공, 0~500 취득학점과 입학연도를 확인해 주세요.');}
  }
  return <form className="local-account__panel local-account__form" onSubmit={submit} aria-label="로컬 계정 프로필 설정">
    <h2>계정 설정</h2><p>입력하지 않은 전공·학점은 미입력으로 저장됩니다. 0학점은 명시적으로 입력한 값입니다.</p>
    {error&&<p role="alert">{error}</p>}
    <label>표시 이름<input value={draft.displayName} maxLength={60} required onChange={event=>edit('displayName',event.target.value)}/></label>
    <label>주전공<input value={draft.primaryMajor} maxLength={100} onChange={event=>edit('primaryMajor',event.target.value)}/></label>
    <label>복수·이중전공 상태<select aria-label="복수·이중전공 상태" value={draft.doubleMajorStatus} onChange={event=>setDraft(previous=>({...previous,doubleMajorStatus:event.target.value as ProfileDraft['doubleMajorStatus'],doubleMajor:''}))}>
      <option value="UNSET">미정 · UNSET</option><option value="NONE">없음 · NONE</option><option value="SELECTED">선택함 · SELECTED</option></select></label>
    {draft.doubleMajorStatus==='SELECTED'&&<label>복수·이중전공명<input required value={draft.doubleMajor} maxLength={100} onChange={event=>edit('doubleMajor',event.target.value)}/></label>}
    <label>취득학점<input type="number" min="0" max="500" step="any" inputMode="decimal" value={draft.earnedCredits} onChange={event=>edit('earnedCredits',event.target.value)} aria-describedby="local-credit-help"/></label>
    <p id="local-credit-help" className="muted">빈칸 = 미입력 · 0 = 취득학점 0. 수강 원장이나 공식 졸업 판정으로 인정되지 않습니다.</p>
    <label>캠퍼스<select aria-label="캠퍼스" value={draft.campus} onChange={event=>edit('campus',event.target.value as ProfileDraft['campus'])}>
      <option value="">미입력</option><option value="SEOUL">서울</option><option value="GLOBAL">글로벌</option></select></label>
    <label>입학연도<input type="number" min="1900" max="2100" step="1" value={draft.cohort} onChange={event=>edit('cohort',event.target.value)}/></label>
    <TopicChoices legend="관심 분야 (최대 5개)" selected={draft.interestTopics} limit={5} onChange={topics=>edit('interestTopics',topics)}/>
    <TopicChoices legend="희망 진로 (최대 3개)" selected={draft.desiredJobTopics} limit={3} onChange={topics=>edit('desiredJobTopics',topics)}/>
    <div className="local-account__actions"><button type="submit">프로필 저장</button><button type="button" onClick={onCancel}>설정 취소</button></div>
  </form>;
}

function WorkspaceEditor({workspace,onSave}:{workspace:LocalAccountWorkspace;onSave:(workspace:LocalAccountWorkspace)=>void}) {
  const [draft,setDraft]=useState(workspace);const [title,setTitle]=useState('');const [summary,setSummary]=useState('');
  const [topics,setTopics]=useState<TopicCode[]>([]);const [course,setCourse]=useState('');const [error,setError]=useState('');
  const update=(next:LocalAccountWorkspace)=>{setDraft(next);setError('');};
  const save=(event:FormEvent)=>{event.preventDefault();const parsed=LocalAccountWorkspaceSchema.safeParse(draft);
    if(!parsed.success){setError('보관함 입력을 확인해 주세요.');return;}onSave(parsed.data);};
  return <form className="local-account__panel local-account__form" onSubmit={save} aria-label="로컬 개인 보관함">
    <h2>개인 보관함</h2><p>합성 계정의 로컬 상태만 저장합니다. 경험과 태그는 미승인 초안이며 추천에 사용하지 않습니다. AI 승인·공식 제출은 미지원입니다.</p>
    {error&&<p role="alert">{error}</p>}
    <label>저장할 검색어<input maxLength={200} value={draft.search} onChange={event=>update({...draft,search:event.target.value})}/></label>
    <label className="local-account__check"><input type="checkbox" checked={draft.notifications} onChange={event=>update({...draft,notifications:event.target.checked})}/>알림 선호 저장 (실제 알림 발송 미지원)</label>
    <h3>기록한 경험</h3>
    {draft.experiences.length===0&&<p>기록한 경험이 없습니다.</p>}
    <ul>{draft.experiences.map(experience=><li key={experience.id}>{experience.title} · {experience.summary}
      <p>{experience.topicCodes.map(topic=>TOPIC_TEXT[topic]).join(', ')||'관심 신호 없음'}</p>
      <button type="button" aria-label={`${experience.title} 경험 삭제`} onClick={()=>update({...draft,experiences:draft.experiences.filter(item=>item.id!==experience.id)})}>삭제</button></li>)}</ul>
    <label>경험 제목<input maxLength={120} value={title} onChange={event=>setTitle(event.target.value)}/></label>
    <label>경험 한줄 설명<textarea maxLength={1000} value={summary} onChange={event=>setSummary(event.target.value)}/></label>
    <TopicChoices legend="이 경험의 관심 분야 (직접 지정, 최대 5개)" selected={topics} limit={5} onChange={setTopics}/>
    <button type="button" disabled={!title.trim()||draft.experiences.length>=100} onClick={()=>{update({...draft,experiences:[...draft.experiences,{id:`EXP-${crypto.randomUUID()}`,title:title.trim(),summary,topicCodes:topics}]});setTitle('');setSummary('');setTopics([]);}}>경험 초안 추가</button>
    <h3>수강계획 초안</h3><p>과목 ID를 메모합니다. 개설·수강자격·졸업요건 검사와 실제 신청은 미지원입니다.</p>
    <ul>{draft.planCourseIds.map(id=><li key={id}>{id} <button type="button" aria-label={`${id} 계획 삭제`} onClick={()=>update({...draft,planCourseIds:draft.planCourseIds.filter(item=>item!==id)})}>삭제</button></li>)}</ul>
    <label>계획 과목 ID<input value={course} maxLength={100} pattern="[A-Za-z0-9_:-]*" onChange={event=>setCourse(event.target.value)}/></label>
    <button type="button" disabled={!/^[A-Za-z0-9_:-]{1,100}$/.test(course)||draft.planCourseIds.includes(course)||draft.planCourseIds.length>=100}
      onClick={()=>{update({...draft,planCourseIds:[...draft.planCourseIds,course]});setCourse('');}}>계획 초안 추가</button>
    <p>북마크 {draft.bookmarks.length}개 · 경험 {draft.experiences.length}개 · 계획 {draft.planCourseIds.length}개</p>
    <div className="local-account__actions"><button type="submit">보관함 저장</button><button type="button" onClick={()=>{setDraft(workspace);setTitle('');setSummary('');setTopics([]);setCourse('');setError('');}}>보관함 변경 취소</button></div>
  </form>;
}

function Section({title,children}:{title:string;children:ReactNode}) {return <section className="local-account__panel"><h2>{title}</h2>{children}</section>;}
const eligibility=(value:string)=>value==='ELIGIBLE'?'자격 충족 (합성 조건)':value==='INELIGIBLE'?'자격 불충족 (합성 조건)':'자격 확인 필요';
function DerivedViews({snapshot,onWorkspace}:{snapshot:LocalAccountSnapshot;onWorkspace:(workspace:LocalAccountWorkspace)=>void}) {
  const {feed,notices,clubs,workspace}=snapshot;
  const bookmark=(id:string)=><button type="button" aria-pressed={workspace.bookmarks.includes(id)} onClick={()=>onWorkspace({...workspace,bookmarks:workspace.bookmarks.includes(id)?workspace.bookmarks.filter(item=>item!==id):[...workspace.bookmarks,id]})}>
    {workspace.bookmarks.includes(id)?'북마크 해제':'북마크 저장'}</button>;
  const cards=(items:typeof feed.featured)=>items.length ? items.map(card=><article key={card.opportunityId} className="local-account__card"><h3>{card.title}</h3>
    <p>{eligibility(card.eligibility)} · {card.lifecycle} · SYNTHETIC</p><p>{card.topics.map(topic=>TOPIC_TEXT[topic]).join(', ')}</p>
    {card.explanation?.reasons.map((reason,index)=><p key={index}>{reason.text}</p>)}
    <p>관련성 점수: {card.score??'UNKNOWN'} · 근거: {card.evidenceRefs.join(', ')||'없음'}</p>{bookmark(card.opportunityId)}</article>):<p>이 영역에 표시할 공고가 없습니다.</p>;
  const dates=notices.items.filter(notice=>notice.appliesTo==='YES'&&notice.studentDeadline);
  return <div className="local-account__grid">
    <Section title="맞춤 공고"><p>서버가 현재 저장한 관심 분야·희망 진로로 다시 계산한 합성 결과 · 후보 {feed.totalCandidates}개</p>{cards(feed.featured)}</Section>
    <Section title="일반 공고">{cards(feed.compact)}{feed.hasMore&&<p>추가 후보가 있습니다. 이 로컬 화면의 전체 후보 조회는 미지원입니다.</p>}</Section>
    {!!feed.ineligible?.length&&<Section title="조건 미충족">{cards(feed.ineligible)}<p>현재 확인된 지원 조건에 맞지 않는 공고입니다. 최대 20개만 표시합니다.</p></Section>}
    <Section title="공지">{notices.items.length===0?<p>표시할 공지가 없습니다.</p>:notices.items.map(notice=><article key={notice.noticeId}><h3>{notice.title}</h3>
      <p>{notice.appliesTo==='YES'?'적용 대상':notice.appliesTo==='NO'?'적용 대상 아님':'적용 확인 필요'} · {notice.verificationState}</p>
      {notice.studentDeadline&&<p>학생 마감: <time dateTime={notice.studentDeadline}>{notice.studentDeadline}</time>{notice.overdue?' · 마감 지남':''}</p>}
      <p>근거: {notice.evidenceRefs.join(', ')||'없음'}</p></article>)}</Section>
    <Section title="동아리 추천"><p>가상 동아리 · 가상 승인 게시글 · 실제 모집/신청 미지원</p>{clubs.recommended.length===0?<p>추천할 가상 동아리가 없습니다.</p>:clubs.recommended.map(club=><article key={club.id}><h3>{club.title}</h3><p>{club.summary}</p><p>{eligibility(club.eligibility)} · {club.lifecycle} · 점수 {club.score}</p><ul>{club.reasons.map((reason,index)=><li key={index}>{reason}</li>)}</ul>{bookmark(club.id)}</article>)}
      <details><summary>전체 가상 동아리 {clubs.all.length}개</summary>{clubs.all.map(club=><article key={club.id}><h3>{club.title}</h3><p>{club.summary}</p><p>{eligibility(club.eligibility)} · {club.lifecycle}</p></article>)}</details></Section>
    <Section title="졸업지원"><p>UNKNOWN · {snapshot.academics.reason}</p><p>직접 입력한 학점은 검수된 수강 원장이 아닙니다. 부족학점·필수과목·졸업 가능 여부를 확정하지 않습니다.</p></Section>
    <Section title="개설 전망"><p>UNKNOWN · {snapshot.forecast.reason}</p></Section>
    <Section title="내 주요 일정"><p>현재 공지 중 적용 대상 YES인 학생 마감만 나열합니다. 달력 통합·일정 생성·발송은 미지원입니다.</p>{dates.length===0?<p>확정 적용 학생 마감이 없습니다.</p>:<ul>{dates.map(notice=><li key={notice.noticeId}>{notice.title} · <time dateTime={notice.studentDeadline}>{notice.studentDeadline}</time></li>)}</ul>}</Section>
    <Section title="AI 상태"><p>MOCK · 외부 AI 호출 없음. 관심 분야·희망 진로는 직접 입력한 합성 신호이며, 추천·공지·동아리 계산은 서버의 결정론 코어가 수행합니다. 미승인 경험은 추천에서 제외합니다.</p><p>실 CLOVA 해석·학업 설명·개인 행동 브리프는 미지원입니다.</p></Section>
    <Section title="저장한 북마크">{workspace.bookmarks.length===0?<p>저장한 북마크가 없습니다.</p>:<ul>{workspace.bookmarks.map(id=><li key={id}>{id} {bookmark(id)}</li>)}</ul>}</Section>
  </div>;
}

function ResetDialog({onCancel,onConfirm}:{onCancel:()=>void;onConfirm:()=>void}) {
  const cancel=useRef<HTMLButtonElement>(null);const confirm=useRef<HTMLButtonElement>(null);
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;cancel.current?.focus();return ()=>previous?.focus();},[]);
  return <div className="local-account__backdrop"><div className="local-account__dialog" role="dialog" aria-modal="true" aria-labelledby="local-reset-title" aria-describedby="local-reset-description"
    onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();onCancel();}if(event.key==='Tab'){event.preventDefault();(document.activeElement===cancel.current?confirm:cancel).current?.focus();}}}>
    <h2 id="local-reset-title">빈 데모 초기화 확인</h2><p id="local-reset-description">이 빈 데모 계정의 프로필, 관심사, 경험, 북마크, 수강계획, 검색어, 알림 선호와 파생 결과를 지웁니다. 다른 합성 소유자 계정은 초기화하지 않습니다.</p>
    <div className="local-account__actions"><button ref={cancel} type="button" onClick={onCancel}>취소</button><button ref={confirm} type="button" onClick={onConfirm}>모두 지우고 초기화</button></div>
  </div></div>;
}

export function LocalAccountWorkbench({controller:provided}:{controller?:LocalAccountController}) {
  const channel=useRef<BroadcastChannel|null>(null);
  const [controller]=useState(()=>provided??new LocalAccountController(new LocalAccountHttpClient(),()=>channel.current?.postMessage({kind:'LOCAL_ACCOUNT_INVALIDATED'})));
  const state=useSyncExternalStore(controller.subscribe,controller.getState,controller.getState);
  const [settings,setSettings]=useState(false);const [reset,setReset]=useState(false);
  useEffect(()=>{void controller.load();
    const stopObserving=observePeerFreshness(()=>void controller.revalidate(),window,document);
    if(typeof BroadcastChannel!=='undefined') {channel.current=new BroadcastChannel('hufs-local-synthetic-accounts-v1');channel.current.onmessage=event=>{if(event.data?.kind==='LOCAL_ACCOUNT_INVALIDATED') void controller.invalidate();};}
    return ()=>{stopObserving();channel.current?.close();channel.current=null;controller.clear();};
  },[controller]);
  useEffect(()=>{setSettings(false);setReset(false);},[state.epoch]);
  const snapshot=state.snapshot;
  return <div className="local-account">
    <div inert={reset}>
      <p className="local-account__notice" role="note">SYNTHETIC · 로컬 HTTP 계정 실험실. 실제 로그인·학교 인증이 아닙니다. 실학생 자료를 입력하지 마세요. 서버 메모리는 재시작하면 사라집니다.</p>
      <div className="local-account__toolbar"><label>로컬 합성 계정<select aria-label="로컬 합성 계정" value={state.session?.accountId??''} disabled={!state.session} onChange={event=>void controller.select(event.target.value as LocalAccountId)}>
        {!state.session&&<option value="">불러오기 필요</option>}{state.session?.accounts.map(account=><option key={account.accountId} value={account.accountId}>{account.label} · SYNTHETIC</option>)}</select></label>
        <button type="button" disabled={!snapshot} aria-expanded={settings} onClick={()=>setSettings(!settings)}>계정 설정</button>
        {snapshot?.accountId==='BLANK_DEMO'&&<button type="button" onClick={()=>setReset(true)}>빈 데모 초기화</button>}
      </div>
      {state.busy&&<p role="status">서버에서 계정과 파생 결과를 다시 불러오는 중입니다. 이전 화면과 초안을 지웠습니다.</p>}
      {state.error&&<div role="alert"><p>{state.error}</p><button type="button" onClick={()=>void controller.load()}>계정 다시 불러오기</button></div>}
      {snapshot&&<>
        <p role="status">표시 이름: {snapshot.profile.displayName}</p><p>취득학점: {snapshot.profile.earnedCredits??'미입력'}</p>
        <p>주전공: {snapshot.profile.primaryMajor??'미입력'} · 복수·이중전공: {snapshot.profile.doubleMajorStatus==='NONE'?'없음':snapshot.profile.doubleMajor??'미정'}</p>
        <p className="muted">계정 {snapshot.accountId} · 개정 {snapshot.revision} · 계산 기준 {snapshot.asOf}</p>
        {settings&&<ProfileSettings key={`profile:${snapshot.accountId}:${snapshot.revision}`} profile={snapshot.profile} onSave={profile=>void controller.saveProfile(profile)} onCancel={()=>setSettings(false)}/>}
        <DerivedViews snapshot={snapshot} onWorkspace={workspace=>void controller.saveWorkspace(workspace)}/>
        <WorkspaceEditor key={`workspace:${snapshot.accountId}:${snapshot.revision}`} workspace={snapshot.workspace} onSave={workspace=>void controller.saveWorkspace(workspace)}/>
      </>}
      <HufsAbilityMenu/>
    </div>
    {reset&&<ResetDialog onCancel={()=>setReset(false)} onConfirm={()=>{setReset(false);void controller.reset();}}/>}
  </div>;
}
