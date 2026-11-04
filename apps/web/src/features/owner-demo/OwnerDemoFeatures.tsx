import {useEffect,useRef,useState,type FormEvent} from 'react';
import {TOPIC_CODES,DemoProfileWorkspaceSchema,type DemoProfileResponse,type DemoProfileWorkspace,type TopicCode} from '@hufs-one/contracts';
import {TOPIC_TEXT} from '../demo/topicText.js';
import {buildCalendarView} from '../today/calendarView.js';
import './ownerDemo.css';
import {demoTopicCover,EMPTY_DEMO_ASSET} from './demoAssets.js';

type Props={response:DemoProfileResponse;busy:boolean;onSave:(workspace:DemoProfileWorkspace)=>Promise<void>|void};
const eligibility={ELIGIBLE:'공개 조건 범위 충족 · 합성',INELIGIBLE:'조건 미충족 · 합성',UNKNOWN:'조건 확인 필요'};
const lifecycle={OPEN:'접수 중',UPCOMING:'접수 예정',CLOSED:'마감',UNKNOWN:'마감 확인 필요'};
function DemoCalendar({response,onDetail}:{response:DemoProfileResponse;onDetail:(id:string)=>void}){
  const {snapshot:s}=response,view=buildCalendarView(s.calendar,s.asOf),[picked,setPicked]=useState<string|null>(null);
  if(!view.ok)return <p role="alert">동일 시점의 일정 근거를 확인할 수 없습니다.</p>;
  const days=view.view.days,date=picked??days.find(d=>d.isAsOfDay)?.seoulDate??days[0]!.seoulDate;
  const entries=s.calendar.entries.filter(e=>e.seoulDate===date);
  return <section aria-label="빈 계정 일정" className="local-account__card">
    <h3>일정 · 고정 시연 시점</h3><p>{view.view.asOfText}</p>
    <div className="owner-demo__calendar" aria-label="2주 일정 날짜 선택">
      {days.map(day=><button key={day.seoulDate} type="button" aria-label={day.ariaLabel}
        aria-pressed={day.seoulDate===date} onClick={()=>setPicked(day.seoulDate)}>{day.seoulDate.slice(5)}<br/>
        {s.calendar.entries.filter(e=>e.seoulDate===day.seoulDate).length||'—'}</button>)}
    </div>
    <div aria-live="polite"><h4>{date}</h4>{entries.length?<ul>{entries.map(e=><li key={e.id}>
      {e.kind==='EVENT'?'행사 일정':e.kind==='STUDENT_DEADLINE'?'학생 제출 마감':'신청 마감'} ·
      {e.source==='OPPORTUNITY'?<button type="button" onClick={()=>onDetail(e.refId)}>{e.title}</button>:<span>{e.title}</span>}
      <time dateTime={e.at}> {new Date(e.at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</time>
      {e.overdue?' · 지난 마감':''}
    </li>)}</ul>:<p>이날은 확인된 일정이 없습니다.</p>}</div>
    {!!s.calendar.undated.length&&<details><summary>날짜 미정 {s.calendar.undated.length}건</summary>
      <ul>{s.calendar.undated.map(x=><li key={x.refId}>{x.title} · {x.reason==='ROLLING'?'상시':'마감 확인 필요'}</li>)}</ul></details>}
    {!!s.calendar.needsConfirmation.length&&<details><summary>적용 여부 확인 필요 {s.calendar.needsConfirmation.length}건</summary>
      <ul>{s.calendar.needsConfirmation.map(x=><li key={x.refId}>{x.title} · UNKNOWN</li>)}</ul></details>}
    <p className="muted">행사 일정과 신청 마감을 구분하며, 학과의 행정 보고 마감은 내 일정으로 표시하지 않습니다.</p>
  </section>;
}
/** Every visible section consumes the same owner response/version. No demo identity,
 * real owner workspace, browser storage or provider call is used here. */
export function OwnerDemoFeatures({response,busy,onSave}:Props){
  const {snapshot:s,profile}=response,w=profile.workspace;
  const [selected,setSelected]=useState<string|null>(null),[search,setSearch]=useState(w.search);
  const [title,setTitle]=useState(''),[summary,setSummary]=useState(''),[topic,setTopic]=useState<TopicCode>('AI_ML');
  const [course,setCourse]=useState(''),[error,setError]=useState('');
  const [filter,setFilter]=useState<'CURRENT'|'INELIGIBLE'|'CLOSED'>('CURRENT');
  const detail=useRef<HTMLElement>(null),opener=useRef<HTMLElement|null>(null);
  useEffect(()=>{setSelected(null);setSearch(w.search);setTitle('');setSummary('');setCourse('');setError('');},[profile.version]);
  useEffect(()=>{if(selected)detail.current?.focus();},[selected]);
  const show=(id:string)=>{opener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setSelected(id);};
  const save=(next:DemoProfileWorkspace)=>{
    if(busy)return;
    const parsed=DemoProfileWorkspaceSchema.safeParse(next);
    if(!parsed.success){setError('합성 보관함 입력을 확인해 주세요. 중복 항목과 크기 제한을 확인합니다.');return;}
    setError('');void onSave(parsed.data);
  };
  const bookmark=(id:string)=>save({...w,bookmarks:w.bookmarks.includes(id)?w.bookmarks.filter(x=>x!==id):[...w.bookmarks,id]});
  const addExperience=(event:FormEvent)=>{
    event.preventDefault();if(!title.trim())return;
    let n=1;while(w.experiences.some(e=>e.id==='SYN-EXP-'+n))n++;
    save({...w,experiences:[...w.experiences,{id:'SYN-EXP-'+n,title:title.trim(),summary,topicCodes:[topic]}]});
  };
  const item=selected?s.catalog.find(o=>o.id===selected):undefined;
  const reason=selected?s.allCards.find(o=>o.opportunityId===selected)?.explanation:undefined;
  const cards=s.allCards.filter(c=>filter==='CLOSED'?c.lifecycle==='CLOSED':c.lifecycle!=='CLOSED'
    &&(filter==='INELIGIBLE'?c.eligibility==='INELIGIBLE':c.eligibility!=='INELIGIBLE'))
    .filter(c=>!w.search||c.title.normalize('NFKC').toLocaleLowerCase().includes(w.search.normalize('NFKC').toLocaleLowerCase()));
  const top=new Set(s.feed.featured.map(c=>c.opportunityId));
  return <div className="owner-demo" aria-busy={busy}>
    <p className="owner-demo__provenance">합성 원천 {s.corpus.version} · 기회 {s.corpus.opportunities} · 공지 {s.corpus.notices} · 가상 프로필 {s.corpus.profiles}<br/>
      원천 SHA-256 <code>{s.corpus.sha256}</code></p>
    {error&&<p role="alert">{error}</p>}
    <section aria-label="빈 계정 추천" className="local-account__card">
      <h3>추천과 전체 기회</h3>
      <label>기회 상태<select aria-label="기회 상태" value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}>
        <option value="CURRENT">현재 기회 · 조건 확인 필요 포함</option>
        <option value="INELIGIBLE">조건 미충족</option><option value="CLOSED">마감 이력</option>
      </select></label>
      <p>관심·경험의 관련도를 계산합니다. 취업·합격 확률이 아니며, 필수 조건은 별도로 확인합니다.</p>
      <form aria-label="합성 검색 설정" onSubmit={e=>{e.preventDefault();save({...w,search});}}>
        <label>기회 검색<input value={search} maxLength={200} onChange={e=>setSearch(e.target.value)}/></label>
        <button type="submit" disabled={busy}>검색 저장·적용</button>
      </form>
      {!cards.length&&<p>현재 검색과 일치하는 합성 기회가 없습니다.</p>}
      <ul className="owner-demo__cards">{cards.map(c=><li key={c.opportunityId}>
        <img className="owner-demo__cover" src={demoTopicCover(c.topics)} alt="" width={640} height={360} loading="lazy"/>
        <h4>{c.title}</h4><p>{top.has(c.opportunityId)?'추천 · ':''}합성 · {eligibility[c.eligibility]} · {lifecycle[c.lifecycle]}</p>
        <p>{c.explanation?.deadline.text??'마감 확인 필요'}</p>
        <button type="button" onClick={()=>show(c.opportunityId)}>상세 보기 · {c.title}</button>
        <button type="button" disabled={busy} onClick={()=>bookmark(c.opportunityId)}>
          {w.bookmarks.includes(c.opportunityId)?'보관함 해제':'보관함 저장'} · {c.title}</button>
      </li>)}</ul>
    </section>
    {item&&<section ref={detail} tabIndex={-1} aria-label="합성 기회 상세" className="local-account__card">
      <h3>{item.title}</h3><p>{item.organization} · 합성 원문 {item.sourceSnapshotId} / {item.version}</p>
      <p>{reason?.deadline.text??'마감 확인 필요'}</p>
      <h4>추천 근거 · 코드 계산</h4><ul>{reason?.reasons.map((r,i)=><li key={i}>{r.text}</li>)}</ul>
      <p>{reason?.relevance.disclaimer??'관련도 계산은 지원 자격 확정이 아닙니다.'}</p>
      <p>{reason?.eligibility.text??'조건 확인 필요'}</p>
      <details><summary>근거와 필수 조건</summary><ul>{item.conditions.map(c=><li key={c.evidenceId}>
        {c.field} {c.operator} {JSON.stringify(c.value)} · 근거 {c.evidenceId}</li>)}</ul>
        {!item.conditions.length&&<p>이 합성 원문에 명시된 필수 조건 없음</p>}</details>
      {!!item.prioritySelection.length&&<p>우대 조건: {item.prioritySelection.join(', ')}</p>}
      {!!item.completionRules.length&&<p>수료 조건: {item.completionRules.join(', ')}</p>}
      <button type="button" disabled>실제 지원 불가 · 합성 시연</button>
      <button type="button" onClick={()=>{setSelected(null);opener.current?.focus();}}>상세 닫기</button>
    </section>}
    <div className="local-account__grid">
      <section aria-label="빈 계정 보관함" className="local-account__card"><h3>저장한 기회</h3>
        {w.bookmarks.length?<ul>{w.bookmarks.map(id=>{const o=s.catalog.find(o=>o.id===id);return <li key={id}>
          {o?<button type="button" onClick={()=>show(id)}>{o.title}</button>:<span>현재 시점에서 볼 수 없는 저장 항목</span>}
          <button type="button" disabled={busy} onClick={()=>bookmark(id)}>저장 해제 · {o?.title??id}</button>
        </li>;})}</ul>:<><img className="owner-demo__empty" src={EMPTY_DEMO_ASSET} alt="" width={640} height={360}/><p>저장한 기회가 없습니다.</p></>}
      </section>
      <section aria-label="빈 계정 경험" className="local-account__card"><h3>가상 경험과 신호</h3>
        <p>저장한 경험은 초안입니다. 명시적으로 가상 신호를 켠 경우만 합성 추천 관련도에 반영합니다.</p>
        <form aria-label="가상 경험 초안" onSubmit={addExperience}>
          <label>가상 경험 제목<input value={title} maxLength={120} onChange={e=>setTitle(e.target.value)}/></label>
          <label>가상 경험 설명<textarea value={summary} maxLength={1000} onChange={e=>setSummary(e.target.value)}/></label>
          <label>가상 경험 분야<select aria-label="가상 경험 분야" value={topic} onChange={e=>setTopic(e.target.value as TopicCode)}>
            {TOPIC_CODES.map(t=><option value={t} key={t}>{TOPIC_TEXT[t]}</option>)}</select></label>
          <button type="submit" disabled={busy||!title.trim()||w.experiences.length>=100}>경험 초안 저장</button>
        </form>
        <ul>{w.experiences.map(e=><li key={e.id}>{e.title} · 미검증 초안
          <button type="button" disabled={busy} onClick={()=>save({...w,experiences:w.experiences.filter(x=>x.id!==e.id)})}>경험 삭제 · {e.title}</button></li>)}</ul>
        <button type="button" disabled={busy||(!w.experiences.length&&w.experienceOverlay==='OFF')}
          aria-pressed={w.experienceOverlay==='ON'} onClick={()=>save({...w,experienceOverlay:w.experienceOverlay==='ON'?'OFF':'ON'})}>
          {w.experienceOverlay==='ON'?'가상 경험 신호 끄기':'가상 경험 신호 켜기'}</button>
        <p>경험 신호: {s.experienceSignals.mode} · 외부 AI 호출 없음 · 공식 자격에 반영하지 않음</p>
      </section>
    </div>
    <DemoCalendar key={profile.version} response={response} onDetail={show}/>
    <section aria-label="빈 계정 공지" className="local-account__card"><h3>개인화 공지</h3>
      <ul>{s.notices.items.map(n=><li key={n.noticeId}><h4>{n.title}</h4>
        <p>합성 · {n.appliesTo==='UNKNOWN'?'대상 여부 확인 필요 · UNKNOWN':n.appliesTo==='NO'?'현재 설정 대상 아님':'현재 합성 설정에 해당'} · {n.verificationState}</p>
        {n.studentDeadline&&<p>학생 제출 마감: <time dateTime={n.studentDeadline}>{new Date(n.studentDeadline).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</time>{n.overdue?' · 지난 마감':''}</p>}
        {n.adminReportDeadline&&<p>학과 행정 보고 마감 (학생 제출 일정 아님): {n.adminReportDeadline}</p>}
        <details><summary>공지 근거</summary>{n.evidenceRefs.join(', ')}</details></li>)}</ul>
    </section>
    <section aria-label="빈 계정 학업" className="local-account__card"><h3>학업·수강 계획·개설 전망</h3>
      <p>학업·개설 전망: 근거 부족 · 확인 필요 · UNKNOWN</p><p>{s.academics.reason}</p>
      <p>성적표·공식 학업 근거: NOT_SHARED. 자기 입력한 취득 학점은 졸업 충족 판정으로 사용하지 않습니다.</p>
      <form aria-label="합성 수강 계획" onSubmit={e=>{e.preventDefault();if(course.trim())save({...w,planCourseIds:[...w.planCourseIds,course.trim()]});}}>
        <label>계획 과목 ID<input value={course} maxLength={100} pattern="[A-Za-z0-9_:-]+" onChange={e=>setCourse(e.target.value)}/></label>
        <button type="submit" disabled={busy||!course.trim()||w.planCourseIds.length>=100}>계획 초안 저장</button>
      </form><ul>{w.planCourseIds.map(id=><li key={id}>{id} · 미검증 계획
        <button type="button" disabled={busy} onClick={()=>save({...w,planCourseIds:w.planCourseIds.filter(x=>x!==id)})}>계획 삭제 · {id}</button></li>)}</ul>
    </section>
    <section aria-label="빈 계정 동아리" className="local-account__card"><h3>가상 동아리 추천</h3>
      <ul>{s.clubs.recommended.map(c=><li key={c.id}>{c.title} · {eligibility[c.eligibility]}<p>{c.summary}</p></li>)}</ul>
      {!s.clubs.recommended.length&&<p>현재 관심 설정에 맞는 가상 동아리가 없습니다.</p>}
      <p>모집 관리·AI 포스터의 승인/철회는 별도 권한이 확인된 동아리 화면에서 시연합니다.</p>
    </section>
    <section aria-label="빈 계정 알림" className="local-account__card"><h3>알림 설정</h3>
      <label className="local-account__check"><input type="checkbox" checked={w.notifications} disabled={busy}
        onChange={e=>save({...w,notifications:e.target.checked})}/>시연 알림 선호 저장</label>
      <p>실제 알림 발송 없음 · 학교 신청·진단·상담 접수 미지원</p>
    </section>
  </div>;
}
