import {Fragment,useEffect,useState,useSyncExternalStore} from 'react';
import type {z} from 'zod';
import type {SyntheticClubBoardResponse,SyntheticClubDetailResponseSchema} from '@hufs-one/contracts';
import type {OwnerSessionController} from '../../app/owner-session-controller.js';
import {InAppLink} from '../../shell/AppShell.js';
import {ClubPoster} from './ClubPoster.js';
import {DDayText} from '../demo/DDayText.js';
import {APPROVAL_TEXT,CATEGORY_TEXT,CLUB_DEMO_NOTE,NO_FILTER,filterClubs,
  buildOwnerClubBoard,buildOwnerClubDetail,type ClubCardView,type ClubFilter} from './clubView.js';

export interface OwnerClubPort{
  readonly session:OwnerSessionController;
  list(signal?:AbortSignal):Promise<SyntheticClubBoardResponse>;
  detail(id:string,signal?:AbortSignal):Promise<z.infer<typeof SyntheticClubDetailResponseSchema>>;
}
type Loaded={key:string;value:unknown};
function Card({club,navigate}:{club:ClubCardView;navigate:(path:string)=>void}){
  return <li className="club"><ClubPoster club={club}/><div className="club__body">
    <h3><InAppLink to={'/clubs/'+club.id} navigate={navigate}>{club.name}</InAppLink></h3>
    <p>{club.summary}</p><p>{club.categoryText} · {club.campusText} · <strong>{club.scopeText}</strong> · {APPROVAL_TEXT}</p>
    <p>{club.lifecycleText}{club.dday&&<> · <DDayText dday={club.dday}/></>}</p>
    {club.reasons.length>0&&<ul>{club.reasons.slice(0,3).map(r=><li key={r}>{r}</li>)}</ul>}
    {club.poster&&<p className="board__small">상세에서 AI 생성 합성 포스터 보기</p>}
  </div></li>;
}
function GeneratedPoster({club}:{club:ClubCardView}){
  const [failed,setFailed]=useState(false),poster=club.poster;
  if(!poster)return <ClubPoster club={club} size="detail"/>;
  return <figure style={{margin:0,minWidth:0}}>
    {failed?<p role="status">현재 승인된 포스터를 불러올 수 없어요. 승인 상태를 새로 확인해 주세요.</p>:
      <img src={poster.href} alt={poster.alt} width={poster.width} height={poster.height}
        loading="lazy" decoding="async" referrerPolicy="no-referrer"
        style={{display:'block',width:'100%',maxWidth:'100%',height:'auto'}}
        onError={()=>setFailed(true)}/>}
    <figcaption>AI 생성 합성 그림 · {poster.provenance.generator}. 실제 동아리·학생 또는 학교 승인 이미지가 아닙니다.
      {poster.byteLength>1024*1024&&' 약 1.5 MB 이미지로 상세 화면에서만 불러옵니다.'}</figcaption>
  </figure>;
}
/** Every direct detail performs a fresh owner read; no browser-selected subject. */
export function OwnerClubBoard({port,id,navigate}:{port:OwnerClubPort;id?:string;navigate:(path:string)=>void}){
  const session=useSyncExternalStore(port.session.subscribe,port.session.getState,port.session.getState);
  const [tick,setTick]=useState(0),[loaded,setLoaded]=useState<Loaded|null>(null);
  const [filter,setFilter]=useState<ClubFilter>(NO_FILTER);
  const key=session.epoch+':'+(id??'LIST')+':'+tick;
  useEffect(()=>{void port.session.initialize();},[port]);
  useEffect(()=>{
    const refresh=()=>setTick(n=>n+1);
    const visibility=()=>{if(document.visibilityState==='visible')refresh();else setLoaded(null);};
    window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',visibility);
    return()=>{window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',visibility);};
  },[port]);
  useEffect(()=>{
    setLoaded(null);setFilter(NO_FILTER);
    if(session.status!=='READY')return;
    let active=true;
    void port.session.runLatest<unknown>('SYNTHETIC_CLUBS',signal=>id?port.detail(id,signal):port.list(signal)).then(value=>{
      if(active&&value)setLoaded({key,value});
    });
    return()=>{active=false;};
  },[port,id,key,session.status]);
  const refresh=<button type="button" onClick={()=>setTick(n=>n+1)}>모집 상태 새로고침</button>;
  if(session.status==='IDLE'||session.status==='CHECKING')return <p aria-busy="true">현재 사용자 권한을 확인하고 있어요.</p>;
  if(session.status!=='READY')return <><p role="alert">본인 권한 또는 현재 게시 승인을 확인할 수 없어 동아리 자료를 표시하지 않았어요. 다시 로그인하거나 권한을 확인해 주세요.</p>{refresh}</>;
  if(!loaded||loaded.key!==key)return <p aria-busy="true">현재 승인된 합성 동아리를 불러오는 중이에요.</p>;
  if(id){
    const detail=buildOwnerClubDetail(loaded.value);
    if(!detail.ok||detail.club.id!==id)return <p role="alert">현재 승인된 모집 글을 확인할 수 없어요.</p>;
    const club=detail.club;
    return <><p role="note">{CLUB_DEMO_NOTE}</p><p>기준 시점 {detail.asOf} · 출처: 합성 데이터</p>{refresh}
      <article className="club-detail"><GeneratedPoster key={club.poster?.sha256??club.posterSeed} club={club}/><div>
        <h2>{club.name}</h2><p>{club.summary}</p><p>{club.categoryText} · {club.campusText} · <strong>{club.scopeText}</strong> · {APPROVAL_TEXT}</p>
        <p role="note">현재 모집 글은 가상 운영자의 현재 승인 판본만 보여줍니다. 수정·승인 철회된 글/포스터는 목록과 직접 URL에서 숨기며, 실제 연합/외부 동아리 소속·가입 승인 또는 신고 처리를 의미하지 않습니다.</p>
        <dl className="facts"><dt>모집 상태</dt><dd>{club.lifecycleText}</dd><dt>모집 조건</dt><dd>{club.eligibilityText}</dd>
          <dt>분야</dt><dd>{club.topicTexts.join(' · ')||'미정'}</dd><dt>활동</dt><dd>{club.activityTexts.join(' · ')||'미정'}</dd>
          {club.times.map(t=><Fragment key={t.label}><dt>{t.label}</dt><dd>{t.text}</dd></Fragment>)}</dl>
        <ul>{club.reasons.map(r=><li key={r}>{r}</li>)}</ul><p>시연 전용으로 가입 신청·연락·결제는 할 수 없어요.</p>
      </div></article><InAppLink to="/clubs" navigate={navigate}>동아리 모집 목록으로</InAppLink></>;
  }
  const board=buildOwnerClubBoard(loaded.value);if(!board.ok)return <p role="alert">현재 승인된 동아리 목록을 확인할 수 없어요.</p>;
  const shown=filterClubs(board.view.all,filter);
  return <><p role="note">{CLUB_DEMO_NOTE}</p><p>기준 시점 {board.view.asOf} · 출처: 합성 데이터</p>{refresh}
    <section className="section" aria-labelledby="owner-club-rec"><h2 id="owner-club-rec">나에게 맞는 동아리</h2>
      {board.view.recommended.length?<ul className="club__grid club__grid--rec">{board.view.recommended.map(c=><Card key={c.id} club={c} navigate={navigate}/>)}</ul>:
        <p>관심 분야·희망 활동과 겹치는 승인된 모집 글이 아직 없어요.</p>}</section>
    <section className="section" aria-labelledby="owner-club-all"><h2 id="owner-club-all">전체 모집 글</h2>
      <form className="club__filters" role="search" aria-label="동아리 찾기" onSubmit={e=>e.preventDefault()}>
        <label>검색<input type="search" value={filter.query} onChange={e=>setFilter({...filter,query:e.target.value})}/></label>
        <label>캠퍼스<select aria-label="캠퍼스" value={filter.campus} onChange={e=>setFilter({...filter,campus:e.target.value as ClubFilter['campus']})}>
          <option value="ALL">전체</option><option value="SEOUL">서울캠퍼스</option><option value="GLOBAL">글로벌캠퍼스</option></select></label>
        <label>동아리 범위<select aria-label="동아리 범위" value={filter.scope??'ALL'}
          onChange={e=>setFilter({...filter,scope:e.target.value as ClubFilter['scope']})}>
          <option value="ALL">모든 가상 범위</option><option value="CAMPUS">교내 가상 동아리</option>
          <option value="INTERUNIVERSITY">연합 가상 동아리</option>
          <option value="EXTERNAL">교외 가상 소모임</option>
        </select></label>
        <label>분야<select aria-label="분야" value={filter.category} onChange={e=>setFilter({...filter,category:e.target.value as ClubFilter['category']})}>
          <option value="ALL">전체</option>{Object.entries(CATEGORY_TEXT).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label><input type="checkbox" checked={filter.includeClosed} onChange={e=>setFilter({...filter,includeClosed:e.target.checked})}/> 마감된 모집도 보기</label>
      </form><p role="status">{board.view.all.length}개 중 {shown.length}개</p>
      <p role="note">범위 분류는 기존 합성 공고의 메타데이터입니다. 실제 동아리 게시 허가·신고 접수·관리자 승인은 별도 운영 기능이며 여기에서는 실행되지 않습니다.</p>
      {shown.length?<ul className="club__grid">{shown.map(c=><Card key={c.id} club={c} navigate={navigate}/>)}</ul>:<p>조건에 맞는 모집 글이 없어요.</p>}
    </section></>;
}
