import {useEffect,useState,useSyncExternalStore,type FormEvent} from 'react';
import {TOPIC_CODES,type TopicCode} from '@hufs-one/contracts';
import type {ExperiencePortfolio,OpportunityCatalogDetail,OpportunityExplanationResponse,OwnerFeedResponse,OwnerWorkspaceRecord,OwnerWorkspaceValue,SelfProfile,SelfConsent,BookmarkStage,BookmarkOutcome} from '@hufs-one/contracts';
import {buildCareerRoadmap,buildCareerTimeline} from '../../../../../packages/core/src/career/roadmap.js';
import {careerOpportunityLinks} from '../../../../../packages/core/src/career/opportunity-links.js';
import {careerSavedItem} from '../../../../../packages/core/src/career/bookmarks.js';
import type {OwnerSessionController} from '../../app/owner-session-controller.js';
import {attachDemoResumeRevalidation} from '../../app/resume-listener.js';
import {attachCrossTabSessionClosure,SESSION_CLOSE_CHANNEL} from '../../app/session-broadcast.js';
import {InAppLink} from '../../shell/AppShell.js';
import {TOPIC_TEXT} from '../demo/topicText.js';
import {assertCareerConsentCurrent,requireCareerConsent} from './careerConsent.js';
import {bookmarkProgressInput,nextBookmarkStage,STAGE_NAMES} from './bookmarkProgress.js';
import {scanCareerInventory,type CareerInventory} from './portfolioInventory.js';
import {CareerActionPlans} from './CareerActionPlans.js';

export interface OwnerCareerPort {
  readonly session:OwnerSessionController;
  getProfile(signal?:AbortSignal):Promise<{profile:SelfProfile|null}>;
  getConsents(signal?:AbortSignal):Promise<{consents:SelfConsent|null}>;
  updateConsents(change:{expectedVersion:number;choices:SelfConsent['choices']},signal?:AbortSignal):Promise<unknown>;
  saveProfile(change:{expectedVersion:number;value:SelfProfile['value']},signal?:AbortSignal):Promise<{profile:SelfProfile}>;
  getPortfolio(query:{afterId?:string;limit?:number},signal?:AbortSignal):Promise<ExperiencePortfolio>;
  create(input:{itemId:string;value:OwnerWorkspaceValue},signal?:AbortSignal):Promise<unknown>;
  update(itemId:string,input:{expectedVersion:number;value:OwnerWorkspaceValue},signal?:AbortSignal):Promise<unknown>;
  remove(id:string,version:number,signal?:AbortSignal):Promise<unknown>;
  getOpportunity(id:string,signal?:AbortSignal):Promise<OpportunityCatalogDetail>;
  getBookmarks(query?:{afterId?:string;limit?:number},signal?:AbortSignal):Promise<{items:OwnerWorkspaceRecord[];nextCursor:string|null}>;
  getActions(query?:{afterId?:string;limit?:number},signal?:AbortSignal):Promise<{items:OwnerWorkspaceRecord[];nextCursor:string|null}>;
  advanceBookmarkStage(record:OwnerWorkspaceRecord,change:{stage:BookmarkStage;outcome?:BookmarkOutcome},signal?:AbortSignal):Promise<unknown>;
  getOwnerFeed(signal?:AbortSignal):Promise<OwnerFeedResponse>;
  explainOpportunity(id:string,request:{asOf:string;sourceRevisionId:string;rankConfigVersion:string;expectedFeedVersion?:string},signal?:AbortSignal):Promise<OpportunityExplanationResponse>;
}

type Screen={profile:SelfProfile|null;portfolio:ExperiencePortfolio;consents:SelfConsent;
  feed:OwnerFeedResponse|null;
  bookmarks:{items:OwnerWorkspaceRecord[];nextCursor:string|null};
  actions:{items:OwnerWorkspaceRecord[];nextCursor:string|null}};
const CATEGORY={
  PROJECT:'프로젝트',CLUB:'동아리',VOLUNTEERING:'봉사',WORK:'근로',INTERNSHIP:'인턴',
  CONTEST:'공모전',CERTIFICATE:'자격',EDUCATION:'교육',OTHER:'그 외 활동',
} as const;
const ACTIVITY_STATUS={
  EXPLORING:'진로 탐색 중',PREPARING:'경험·지원 준비 중',
  APPLYING_SELF_REPORTED:'지원 진행 중 (본인 기록)',PAUSED:'잠시 쉬는 중',
} as const;

function Form({data,onSave,busy}:{
  data:SelfProfile|null;onSave:(value:SelfProfile['value'])=>void;busy:boolean;
}){
  const [displayName,setDisplayName]=useState(data?.value.displayName??'나의 진로');
  const [interests,setInterests]=useState<TopicCode[]>([...(data?.value.interestTopics??[])]);
  const [goals,setGoals]=useState<TopicCode[]>([...(data?.value.desiredJobTopics??[])]);
  const [headline,setHeadline]=useState(data?.value.headline??'');
  const [bio,setBio]=useState(data?.value.bio??'');
  const [activityStatus,setActivityStatus]=useState<keyof typeof ACTIVITY_STATUS>(
    data?.value.activityStatus??'EXPLORING');
  const valid=!!displayName.trim()&&interests.length<=5&&goals.length<=3;
  return <form className="sandbox__form" onSubmit={(e:FormEvent)=>{
    e.preventDefault();
    if(!valid)return;
    onSave({displayName:displayName.trim(),interestTopics:interests,desiredJobTopics:goals,
      headline:headline.trim(),bio:bio.trim(),visibility:'PRIVATE',activityStatus});
  }}>
    <h3>나의 비공개 프로필</h3>
    <p>본인만 열람합니다. 직접 선택한 관심 분야·희망 직무는 탐색 기준이며 학교 공식 인증·취업 적격 판정이 아닙니다.</p>
    <label htmlFor="career-display-name">표시 이름</label>
    <input id="career-display-name" value={displayName} maxLength={40} required
      onChange={e=>setDisplayName(e.target.value)} disabled={busy}/>
    <label htmlFor="career-interests">관심 분야 (최대 5개, 여러 개 선택)</label>
    <select id="career-interests" multiple size={6} value={interests} disabled={busy}
      onChange={e=>setInterests(Array.from(e.currentTarget.selectedOptions,o=>o.value as TopicCode))}>
      {TOPIC_CODES.map(code=><option value={code} key={code}>{TOPIC_TEXT[code]}</option>)}
    </select>
    <label htmlFor="career-goals">희망 직무 (최대 3개, 여러 개 선택)</label>
    <select id="career-goals" multiple size={6} value={goals} disabled={busy}
      onChange={e=>setGoals(Array.from(e.currentTarget.selectedOptions,o=>o.value as TopicCode))}>
      {TOPIC_CODES.map(code=><option value={code} key={code}>{TOPIC_TEXT[code]}</option>)}
    </select>
    <label htmlFor="career-activity-status">현재 활동 상태 (본인 기록)</label>
    <select id="career-activity-status" disabled={busy} value={activityStatus}
      onChange={e=>setActivityStatus(e.target.value as keyof typeof ACTIVITY_STATUS)}>
      {Object.entries(ACTIVITY_STATUS).map(([code,label])=><option key={code} value={code}>{label}</option>)}
    </select>
    <label htmlFor="career-headline">한 줄 소개</label>
    <input id="career-headline" value={headline} maxLength={120} onChange={e=>setHeadline(e.target.value)} disabled={busy}/>
    <label htmlFor="career-bio">자기소개</label>
    <textarea id="career-bio" value={bio} maxLength={700} rows={4} onChange={e=>setBio(e.target.value)} disabled={busy}/>
    <section aria-label="나에게만 보이는 비공개 프로필 미리보기">
      <h4>나에게만 보이는 프로필 미리보기</h4>
      <p><strong>{displayName.trim()||'이름 미입력'}</strong> · {ACTIVITY_STATUS[activityStatus]}</p>
      <p>{headline.trim()||'한 줄 소개 미입력'}</p><p>{bio.trim()||'자기소개 미입력'}</p>
      <p>관심: {interests.map(code=>TOPIC_TEXT[code]).join(' · ')||'선택 전'} · 희망 직무: {goals.map(code=>TOPIC_TEXT[code]).join(' · ')||'선택 전'}</p>
      <p role="note">공개 범위: 본인만 · 기관 검증 없음. 이 미리보기는 서버 공개 링크나 제3자 공유 기능이 아닙니다.</p>
    </section>
    <button type="submit" disabled={busy||!valid}>비공개 프로필 저장</button>
  </form>;
}


/** Existing owner-only purpose grants. Edits never authorize a paid provider run automatically. */
function ConsentControls({data,onSave,busy}:{
  data:SelfConsent;onSave:(choices:SelfConsent['choices'])=>void;busy:boolean;
}){
  const [choices,setChoices]=useState<SelfConsent['choices']>({...data.choices});
  const fields=[
    {key:'personalStorage',text:'본인 경험·포트폴리오 개인 저장'},
    {key:'externalAi',text:'승인된 외부 AI 입력 전송 (별도 명시 실행 필요)'},
    {key:'ncpStorage',text:'승인된 NCP 서버 저장'},
    {key:'teamReview',text:'검토를 위한 제한된 팀 공유'},
    {key:'presentation',text:'허용된 발표 자료 활용'},
  ] as const;
  return <section aria-label="본인 목적별 동의 관리">
    <h2>정보 이용 목적과 철회</h2>
    <p>현재 본인의 동의 판본 {data.version}. 목적별 권한을 변경해도 과거 기록이 학교 공식 인증으로 바뀌거나 AI가 자동 실행되지는 않습니다.</p>
    <form onSubmit={e=>{e.preventDefault();if(!busy)onSave(choices);}}>
      {fields.map(field=><label key={field.key} className="mrow">
        <input type="checkbox" checked={choices[field.key]} disabled={busy}
          onChange={e=>setChoices(prev=>({...prev,[field.key]:e.target.checked}))}/>
        {field.text}
      </label>)}
      {!choices.personalStorage&&<p role="alert">개인 저장 동의를 철회하면 이 페이지에서 즉시 본인 자료를 숨깁니다. 삭제·보존기간 정책은 서버 권한 및 별도 절차를 따릅니다.</p>}
      <button type="submit" disabled={busy||fields.every(f=>choices[f.key]===data.choices[f.key])}>
        목적별 동의 변경 저장</button>
    </form>
  </section>;
}

export function OwnerCareerPanel({port,navigate}:{port:OwnerCareerPort;navigate:(path:string)=>void}){
  const session=useSyncExternalStore(port.session.subscribe,port.session.getState,port.session.getState);
  const [screen,setScreen]=useState<Screen|null>(null);
  const [cursor,setCursor]=useState<string|undefined>();
  const [bookmarkCursor,setBookmarkCursor]=useState<string|undefined>();
  const [actionCursor,setActionCursor]=useState<string|undefined>();
  const [bookmarkFilter,setBookmarkFilter]=useState<BookmarkStage|'ALL'>('ALL');
  const [inventory,setInventory]=useState<CareerInventory|null>(null);
  const [scanStatus,setScanStatus]=useState<'IDLE'|'SCANNING'|'ERROR'>('IDLE');
  const [wholeTimeline,setWholeTimeline]=useState(false);
  const [outcomes,setOutcomes]=useState<Record<string,BookmarkOutcome['result']|''>>({});
  const [notice,setNotice]=useState('');
  const [rev,setRev]=useState(0);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [title,setTitle]=useState(''),[summary,setSummary]=useState('');
  const [role,setRole]=useState(''),[startedOn,setStartedOn]=useState(''),[endedOn,setEndedOn]=useState('');
  const [achievement,setAchievement]=useState(''),[referenceUrl,setReferenceUrl]=useState('');
  const [category,setCategory]=useState<keyof typeof CATEGORY>('PROJECT');
  const [editing,setEditing]=useState<string|null>(null);
  const [deleteId,setDeleteId]=useState<string|null>(null);

  useEffect(()=>{void port.session.initialize();},[port]);
  useEffect(()=>attachDemoResumeRevalidation(port.session,{page:document,view:window}),[port.session]);
  useEffect(()=>{
    if(typeof BroadcastChannel==='undefined')return;
    const channel=new BroadcastChannel(SESSION_CLOSE_CHANNEL);
    const dispose=attachCrossTabSessionClosure(port.session,channel);
    return ()=>{dispose();channel.close();};
  },[port.session]);
  useEffect(()=>{
    setScreen(null);setInventory(null);setScanStatus('IDLE');setWholeTimeline(false);
    setError('');setDeleteId(null);setEditing(null);
    if(session.status!=='READY')return;
    let active=true;
    void port.session.runLatest('owner-career-page',async signal=>{
      const before=requireCareerConsent((await port.getConsents(signal)).consents);
      const [profile,portfolio,bookmarks,actions,feed]=await Promise.all([port.getProfile(signal),
        port.getPortfolio(cursor?{limit:20,afterId:cursor}:{limit:20},signal),
        port.getBookmarks(bookmarkCursor?{limit:20,afterId:bookmarkCursor}:{limit:20},signal),
        port.getActions(actionCursor?{limit:20,afterId:actionCursor}:{limit:20},signal),
        // An unavailable feed must not block an otherwise authorized private portfolio.
        port.getOwnerFeed(signal).catch(()=>null)]);
      const consents=requireCareerConsent((await port.getConsents(signal)).consents);
      assertCareerConsentCurrent(before,consents,portfolio.portfolio.consentVersion);
      return {profile:profile.profile,portfolio,bookmarks,actions,consents,feed};
    }).then(value=>{
      if(!active)return;
      if(value&&port.session.getState().status==='READY')setScreen(value);
      else if(port.session.getState().status==='READY')setError('현재 본인 기록을 조회할 수 없습니다. 다시 시도하거나 권한·동의를 확인해 주세요.');
    }).catch(()=>{if(active)setError('포트폴리오를 조회할 수 없습니다. 현재 본인 권한·동의를 확인해 주세요.');});
    return ()=>{active=false;};
  },[port,session.status,session.epoch,cursor,bookmarkCursor,actionCursor,rev]);
  const execute=async(run:(signal:AbortSignal)=>Promise<unknown>)=>{
    if(busy||session.status!=='READY')return;
    setBusy(true);setError('');setNotice('');
    try{
      const result=await port.session.runMutation(run);
      if(result&&port.session.getState().status==='READY'){
        setEditing(null);setDeleteId(null);setTitle('');setSummary('');setRole('');setStartedOn('');setEndedOn('');
        setAchievement('');setReferenceUrl('');
        setCursor(undefined);setBookmarkCursor(undefined);setActionCursor(undefined);
        setInventory(null);setScanStatus('IDLE');setWholeTimeline(false);setRev(x=>x+1);
        setNotice('변경을 저장했습니다. 현재 본인 권한과 최신 판본으로 다시 조회했습니다.');
      }else if(port.session.getState().status==='READY'){
        setError('변경을 확인할 수 없었습니다. 중복 요청 없이 최신 상태를 조회해 주세요.');
      }
    }catch{setError('저장/변경에 실패했습니다. 본인 권한·동의 또는 최신 판본을 확인해 주세요.');}
    finally{setBusy(false);}
  };
  const saveConsents=(choices:SelfConsent['choices'])=>{
    if(!screen)return;
    // Clear private bytes immediately when the user asks to revoke personal storage.
    if(!choices.personalStorage)setScreen(null);
    void execute(signal=>port.updateConsents({expectedVersion:screen.consents.version,choices},signal));
  };
  const scanEntirePortfolio=async()=>{
    if(!screen?.profile||session.status!=='READY'||scanStatus==='SCANNING'||busy)return;
    const epoch=session.epoch;
    setInventory(null);setWholeTimeline(false);setScanStatus('SCANNING');
    try{
      const result=await port.session.runLatest('career-owner-double-scan',
        signal=>scanCareerInventory(port,screen.profile!,signal));
      if(result&&port.session.getState().status==='READY'
        &&port.session.getState().epoch===epoch){setInventory(result);setScanStatus('IDLE');}
      else if(port.session.getState().status==='READY')setScanStatus('ERROR');
    }catch{if(port.session.getState().status==='READY')setScanStatus('ERROR');}
  };
  const saveProfile=(value:SelfProfile['value'])=>{
    void execute(signal=>port.saveProfile({expectedVersion:screen?.profile?.version??0,value},signal));
  };
  const submitExperience=(event:FormEvent)=>{
    event.preventDefault();
    const name=title.trim();
    if(!name)return;
    if(startedOn&&endedOn&&startedOn>endedOn){setError('활동 종료일이 시작일보다 빠릅니다.');return;}
    const record=screen?.portfolio.items.find(x=>x.itemId===editing);
    const value:OwnerWorkspaceValue={
      kind:'EXPERIENCE',dataMode:'OWNER_CONSENTED',state:'SELF_REPORTED',
      title:name,summary:summary.trim(),category,
      ...(achievement.trim()?{achievement:achievement.trim()}:{}),
      ...(referenceUrl.trim()?{referenceUrl:referenceUrl.trim()}:{}),
      ...(record?.value.kind==='EXPERIENCE'&&record.value.sourceOpportunityId
        ?{sourceOpportunityId:record.value.sourceOpportunityId}:{}),
      ...(role.trim()?{role:role.trim()}:{}),
      ...(startedOn?{startedOn}:{}),...(endedOn?{endedOn}:{}),
    };
    void execute(async signal=>{
      if(record)await port.update(record.itemId,{expectedVersion:record.version,value},signal);
      else await port.create({itemId:'career-'+crypto.randomUUID().replaceAll('-',''),value},signal);
    });
  };
  if(session.status==='IDLE'||session.status==='CHECKING')return <p aria-busy="true">본인 계정과 동의를 확인하고 있습니다.</p>;
  if(session.status!=='READY')return <p role="alert">현재 사용자 세션을 확인할 수 없습니다. 이전 프로필과 타임라인은 표시하지 않습니다.</p>;
  if(!screen)return error
    ? <section role="alert"><p>{error}</p><button type="button" onClick={()=>setRev(n=>n+1)}>다시 조회</button></section>
    : <p aria-busy="true">본인 비공개 진로 자료를 불러오는 중입니다.</p>;

  const roadmap=screen.profile?buildCareerRoadmap({profile:screen.profile,portfolio:screen.portfolio}):null;
  const timeline=wholeTimeline&&inventory?inventory.timeline:buildCareerTimeline(screen.portfolio);
  const related=screen.feed&&screen.profile?careerOpportunityLinks(screen.feed,[
    ...screen.profile.value.interestTopics,...screen.profile.value.desiredJobTopics,
  ]):[];
  const privateBookmarks=screen.bookmarks.items.filter(record=>
    record.value.kind==='BOOKMARK'&&record.value.dataMode==='OWNER_CONSENTED'
    &&(bookmarkFilter==='ALL'||(record.value.stage??'INTERESTED')===bookmarkFilter));
  return <section aria-label="본인 전용 커리어 포트폴리오">
    <p role="note">본인만 볼 수 있는 자기보고 활동입니다. AI 제안·본인 승인과 학교의 공식 경력/자격 인증은 다릅니다. 목록은 최대 20건씩 조회됩니다. 전체 조회는 명시적 이중 검증 후에만 제공합니다.</p>
    {error&&<p role="alert">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    <Form key={screen.profile?.version??0} data={screen.profile} onSave={saveProfile} busy={busy}/>
    <ConsentControls key={'purposes-'+screen.consents.version} data={screen.consents} onSave={saveConsents} busy={busy}/>
    <section aria-labelledby="career-roadmap-heading">
      <h2 id="career-roadmap-heading">나의 관심·진로 탐색 로드맵</h2>
      {!roadmap?<p>관심·희망 분야를 계정 설정에서 먼저 입력해 주세요.</p>:<>
        <p>{roadmap.disclaimer}</p>
        {!inventory&&<p role="status">현재 화면의 최대 20건만 분석했습니다. 다른 페이지의 승인 주제는 포함되지 않습니다.</p>}
        <button type="button" disabled={busy||scanStatus==='SCANNING'} onClick={()=>{void scanEntirePortfolio();}}>
          {scanStatus==='SCANNING'?'전체 기록 두 번 검증 중':'전체 기록 일관성 검사 후 분석'}</button>
        {scanStatus==='ERROR'&&<p role="alert">동의·프로필·페이지·승인 판본이 바뀌었거나 조회가 중단됐습니다. 전체 분석은 표시하지 않습니다. 다시 검사해 주세요.</p>}
        {inventory&&<p role="status">현재 동의 {inventory.consentVersion}판·프로필 {inventory.profileVersion}판에서 경험 {inventory.scannedRecords}건을 {inventory.pages}페이지씩 두 번 조회·대조했습니다(합성 {inventory.excludedSynthetic}건 제외, 현재 본인 승인 경험 {inventory.evidenceCount}건). 원자적 DB 스냅샷이나 학교 인증은 아닙니다. 기준 시각 {inventory.asOf}.</p>}
        <h3>{inventory?'이중 조회에서 일치한 전체 본인 승인 분야':'현재 페이지에서 본인이 승인한 분야'}</h3>
        {(inventory?inventory.strengths:roadmap.strengthTopics).length?<ul>{(inventory?inventory.strengths:roadmap.strengthTopics).map(t=><li key={t.topicCode}>
          {TOPIC_TEXT[t.topicCode]} · 근거 있는 경험 {t.experienceIds.length}건 (본인 승인, 공식 인증 아님)
        </li>)}</ul>:<p>승인된 경험 주제가 아직 없습니다.</p>}
        <h3>더 살펴볼 분야</h3>
        {(inventory?inventory.explorationTopics.length:roadmap.nextSteps.length)>0?<ul>{(inventory
          ?inventory.explorationTopics.map(topicCode=>({topicCode,explanation:'현재 확인된 자기승인 경험에 연결되지 않은 관심 주제입니다. 허가된 활동을 직접 찾아보고 경험을 기록해 주세요.'}))
          :roadmap.nextSteps).map(t=><li key={t.topicCode}>
          <strong>{TOPIC_TEXT[t.topicCode]}</strong> — {t.explanation}
        </li>)}</ul>:<p>이 페이지에서는 추가 탐색 분야를 찾지 못했습니다. 전체 계정 분석을 의미하지 않습니다.</p>}
      </>}
    </section>
    <section aria-labelledby="career-related-heading">
      <h2 id="career-related-heading">지금 확인할 수 있는 관련 기회</h2>
      <p role="note">현재 본인 권한으로 받은 추천 목록의 주제 일치 항목만 연결합니다. 합격 가능성·전체 공고·공식 지원 적격이 아니며 상세를 열 때 다시 권한과 출처를 확인합니다.</p>
      {!screen.feed?<p>현재 승인된 본인 추천 목록을 확인하지 못했습니다. 기회 목록을 추정하지 않습니다.</p>
        :related.length===0?<p>이 페이지에서 관심 주제와 일치하는 검증된 실제 공고가 없습니다. 전체 검색 결과는 아닙니다.</p>
        :<ul>{related.map(item=><li key={item.id}>
          <InAppLink to={'/owner-opportunities/'+encodeURIComponent(item.id)} navigate={navigate}>{item.title}</InAppLink>
          <p>관심 주제: {item.matchedTopics.map(code=>TOPIC_TEXT[code]).join(' · ')} · 지원 조건: {item.eligibility==='UNKNOWN'?'확인 필요':'현재 규칙상 적합 (출처 재확인 필요)'}</p>
          <p role="note">현재 응답의 근거 참조 {item.evidenceRefs.length}건 · 자료 시점 {screen.feed?.feed.asOf??'확인 불가'}</p>
        </li>)}</ul>}
      {screen.feed?.feed.hasMore&&<p role="note">현재 목록의 표시 범위 밖에 다른 공고가 있을 수 있습니다. 전체 추천으로 판단하지 마세요.</p>}
    </section>
    <section aria-labelledby="career-timeline-heading">
      <h2 id="career-timeline-heading">경험·활동 타임라인 (비공개)</h2>
      {inventory&&<button type="button" onClick={()=>setWholeTimeline(v=>!v)}>
        {wholeTimeline?'현재 페이지 20건 보기':'일관성 확인한 전체 기록 보기'}</button>}
      {wholeTimeline&&inventory&&<p role="status">현재 동의/프로필 판본으로 두 번 조회해 대조한 {inventory.timeline.length}건의 자기신고 경험입니다. 쓰기 전에 개별 최신 판본을 재확인합니다.</p>}
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
        <label htmlFor="career-achievement">직접 기록한 활동 결과 (공식 검증 전)</label>
        <textarea id="career-achievement" maxLength={240} rows={2} value={achievement}
          onChange={e=>setAchievement(e.target.value)} disabled={busy}/>
        <label htmlFor="career-reference">내가 제공한 참고 링크 (공개 HTTPS 웹페이지, 공식 증명 아님)</label>
        <input id="career-reference" type="url" maxLength={500} placeholder="https://example.com/page"
          value={referenceUrl} onChange={e=>setReferenceUrl(e.target.value)} disabled={busy}/>
        <p role="note">외부 링크는 본인 기록이며 서비스가 자동 조회하거나 학교·기관 사실로 인증하지 않습니다.</p>
        <label htmlFor="career-start">시작일</label><input id="career-start" type="date" value={startedOn} onChange={e=>setStartedOn(e.target.value)} disabled={busy}/>
        <label htmlFor="career-end">종료일</label><input id="career-end" type="date" value={endedOn} onChange={e=>setEndedOn(e.target.value)} disabled={busy}/>
        <button disabled={busy} type="submit">{editing?'수정 저장':'경험 등록'}</button>
        {editing&&<button type="button" disabled={busy} onClick={()=>{
          setEditing(null);setTitle('');setSummary('');setRole('');setStartedOn('');setEndedOn('');
          setAchievement('');setReferenceUrl('');
        }}>수정 취소</button>}
      </form>
      {timeline.length===0?<p>기록한 경험이 없습니다.</p>:<ol>{timeline.map(item=><li key={item.itemId}>
        <article>
          <h3>{item.title}</h3>
          <p>{CATEGORY[item.category]} · {item.startedOn??'시작일 미기록'} ~ {item.endedOn??'종료일 미기록'}</p>
          {item.role&&<p>역할: {item.role}</p>}
          <p>{item.summary}</p>
          {item.achievement&&<p>본인 기록 결과 (공식 미검증): {item.achievement}</p>}
          {item.referenceUrl&&<p>본인이 첨부한 참고 링크 (기관 인증 아님): <a
            href={item.referenceUrl} target="_blank" rel="noopener noreferrer nofollow">외부 참고 페이지 열기</a></p>}
          {item.sourceOpportunityId&&<p><InAppLink to={'/owner-opportunities/'+encodeURIComponent(item.sourceOpportunityId)} navigate={navigate}>연결된 기회 확인 (현재 권한 확인 필요)</InAppLink></p>}
          {item.evidence.state==='OWNER_APPROVED_TOPIC'&&<p role="note">확인된 내용 판본 {item.evidence.contentVersion} · 경험 {item.evidence.experienceId}. 개인 선택에 의한 주제 승인일 뿐 실제 AI 후보 검증이나 외부 자격 인증이 아닙니다.</p>}
          {item.referenceUrl?<p>본인 제공 링크가 있으며 기관 증빙 검증은 이 화면에서 수행하지 않았습니다.</p>
            :<p>첨부된 증빙 링크 없음 · 이미지/포스터 업로드는 현재 인가된 저장 API 미제공으로 사용할 수 없습니다.</p>}
          <p><InAppLink to="/experience" navigate={navigate}>현재 판본의 AI 후보·인용·본인 주제 승인/철회 검토</InAppLink> (현재 경험 목록의 일부만 표시될 수 있음)</p>
          {item.evidence.state==='OWNER_APPROVED_TOPIC'&&<ul aria-label="본인이 승인한 주제">{item.evidence.topicCodes.map(code=><li key={code}>{TOPIC_TEXT[code]}</li>)}</ul>}
          <p>{item.evidence.state==='OWNER_APPROVED_TOPIC'
            ? '현재 페이지에서 본인이 주제를 승인했습니다. 공식 역량 인증은 아닙니다.'
            : '본인 기록이며 확인된 역량 인증이 없습니다.'}</p>
          <button type="button" disabled={busy||!screen.portfolio.items.some(raw=>raw.itemId===item.itemId)} onClick={()=>{
            setEditing(item.itemId);setDeleteId(null);setTitle(item.title);setSummary(item.summary);
            setRole(item.role??'');setCategory(item.category);setStartedOn(item.startedOn??'');setEndedOn(item.endedOn??'');
            setAchievement(item.achievement??'');setReferenceUrl(item.referenceUrl??'');
          }}>수정</button>
          {deleteId===item.itemId?<><p>삭제하면 이 경험에 대한 승인된 주제를 추천에 재사용하지 않습니다. 삭제하시겠습니까?</p>
            <button type="button" disabled={busy} onClick={()=>{const record=screen.portfolio.items.find((x:OwnerWorkspaceRecord)=>x.itemId===item.itemId);if(record)void execute(signal=>port.remove(item.itemId,record.version,signal));}}>삭제 확인</button>
            <button type="button" onClick={()=>setDeleteId(null)}>취소</button>
          </>:<button type="button" disabled={busy||!screen.portfolio.items.some(raw=>raw.itemId===item.itemId)} onClick={()=>setDeleteId(item.itemId)}>삭제</button>}
          {!screen.portfolio.items.some(raw=>raw.itemId===item.itemId)&&<p role="note">전체 보기의 다른 페이지입니다. 수정·삭제 전에 해당 페이지를 직접 다시 열어 최신 판본을 확인해야 합니다.</p>}
        </article>
      </li>)}</ol>}
      {screen.portfolio.nextCursor&&<button type="button" disabled={busy} onClick={()=>setCursor(screen.portfolio.nextCursor??undefined)}>다음 경험 20건</button>}
      {cursor&&<button type="button" disabled={busy} onClick={()=>setCursor(undefined)}>첫 페이지</button>}
    </section>
    <section aria-labelledby="career-saved-heading">
      <h2 id="career-saved-heading">연결된 저장·지원 기록 (본인 작성)</h2>
      <p>기존 보관함 기록을 자기신고 지원 단계로 관리합니다. 실제 모집처로 지원서를 발송하거나 합격을 확인한 기록이 아닙니다.</p>
      <label htmlFor="career-bookmark-filter">보관함 현재 페이지 단계 필터</label>
      <select id="career-bookmark-filter" value={bookmarkFilter}
        onChange={e=>setBookmarkFilter(e.target.value as BookmarkStage|'ALL')}>
        <option value="ALL">전체 단계</option>
        {Object.entries(STAGE_NAMES).map(([stage,label])=><option key={stage} value={stage}>{label}</option>)}
      </select>
      {privateBookmarks.length===0?<p>이 페이지에는 본인이 기록한 기회가 없습니다. 합성 기록은 제외합니다.</p>
        :<ul>{privateBookmarks.map(raw=>{const item=careerSavedItem(raw);const next=nextBookmarkStage(raw);return <li key={item.itemId}>
          <InAppLink to={'/owner-opportunities/'+encodeURIComponent(item.opportunityId)} navigate={navigate}>
            기회 {item.opportunityId} (현재 출처·권한 재확인)
          </InAppLink> — {item.label}{item.synthetic?' · 합성 시연 기록':''}
          {item.outcome&&<span> · {item.outcome}</span>}
          {next&&<div>
            <p>다음 본인 기록 단계: {STAGE_NAMES[next]}. 실제 접수·결과는 외부 확인 없이 확정하지 않습니다.</p>
            {next==='RESULT_RECORDED'&&<label>본인이 직접 기록할 결과 (공식 확인 전)
              <select aria-label={'본인 결과 '+raw.itemId} value={outcomes[raw.itemId]??''} disabled={busy}
                onChange={e=>setOutcomes(prev=>({...prev,[raw.itemId]:e.target.value as BookmarkOutcome['result']|''}))}>
                <option value="">결과를 선택하세요</option>
                <option value="ACCEPTED">합격이라고 직접 기록</option><option value="NOT_ACCEPTED">불합격이라고 직접 기록</option>
                <option value="WAITLISTED">대기라고 직접 기록</option><option value="WITHDRAWN">철회했다고 직접 기록</option>
                <option value="OTHER">기타 직접 기록</option>
              </select>
            </label>}
            <button type="button" disabled={busy||(next==='RESULT_RECORDED'&&!outcomes[raw.itemId])}
              onClick={()=>{
                try{const change=bookmarkProgressInput(raw,outcomes[raw.itemId]||undefined);
                  void execute(signal=>port.advanceBookmarkStage(raw,change,signal));
                }catch{setError('단계를 변경할 수 없습니다. 최신 기록을 다시 확인해 주세요.');}
              }}>다음 단계로 기록</button>
          </div>}
        </li>;})}</ul>}
      {screen.bookmarks.nextCursor&&<button type="button" disabled={busy}
        onClick={()=>setBookmarkCursor(screen.bookmarks.nextCursor??undefined)}>다음 보관함 20건</button>}
      {bookmarkCursor&&<button type="button" disabled={busy} onClick={()=>setBookmarkCursor(undefined)}>보관함 첫 페이지</button>}
      {screen.bookmarks.nextCursor&&<p role="note">현재 보관함 목록은 20건 단위이며 계정 전체 지원 이력이 아닙니다.</p>}
    </section>
    <CareerActionPlans key={'action-'+(actionCursor??'first')+'-'+screen.consents.version}
      bookmarks={screen.bookmarks} actions={screen.actions} busy={busy} navigate={navigate}
      onCreate={value=>{void execute(signal=>port.create({itemId:'career-plan-'+crypto.randomUUID().replaceAll('-',''),value},signal));}}
      onEdit={(record,value)=>{void execute(signal=>port.update(record.itemId,{expectedVersion:record.version,value},signal));}}
      onNext={afterId=>setActionCursor(afterId)}
      {...(actionCursor?{onFirst:()=>setActionCursor(undefined)}:{})}/>
  </section>;
}
