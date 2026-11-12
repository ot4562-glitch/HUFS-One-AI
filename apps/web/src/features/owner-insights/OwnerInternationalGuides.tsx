import {useCallback,useEffect,useId,useRef,useState,useSyncExternalStore} from 'react';
import type {FeatureAdditions as V} from '@hufs-one/contracts';
import type {HufsOwnerApiClient} from '../../integrations/owner-api-client.js';
import type {OwnerInsightsPort} from './OwnerInsightsPanel.js';
type Locale='ko'|'en'|'zh';
type GuideView=Awaited<ReturnType<HufsOwnerApiClient['getOwnerGuideChecklist']>>;
type Activity='READ'|'WRITE'|null;
const guideStatus:Record<V.GuideResolutionV2['status'],string>={READY:'검수된 안내',KOREAN_FALLBACK:'한국어 원문으로 안내',
  UNKNOWN_SOURCE:'출처 검수 확인 필요',NOT_APPLICABLE:'현재 대상에 해당하지 않는 안내',
  APPLICABILITY_UNKNOWN:'적용 캠퍼스·학기 확인 필요',TRANSLATION_UNAVAILABLE:'검수된 번역 미연결'};
const time=(value:string)=>new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false});
function ReadonlyGuide({guide}:{guide:V.GuideResolutionV2}){
  return <section><p>{guideStatus[guide.status]} · 표시 언어: {guide.locale.toUpperCase()}</p>
    {guide.body&&<p lang={guide.locale} className="owner-guide__body">{guide.body}</p>}
    <p className="muted">원문 판본 {guide.sourceRevisionId}</p></section>;
}
function GuideEditor({guide,port,onActivity}:{guide:V.GuideResolutionV2;port:OwnerInsightsPort;onActivity:(activity:Activity)=>void}){
  const scope=useSyncExternalStore(port.session.subscribe,port.session.getState,port.session.getState);
  const [locale,setLocale]=useState<Locale>('ko'),[busy,setBusy]=useState<Activity>(null);
  const [loaded,setLoaded]=useState<{result:GuideView;locale:Locale;epoch:number;session:OwnerInsightsPort['session'];
    read:OwnerInsightsPort['readGuide'];save:OwnerInsightsPort['saveGuide']}|null>(null);
  const [draft,setDraft]=useState<string[]>([]),[message,setMessage]=useState('');
  const sequence=useRef(0),pending=useRef<AbortController|null>(null),lane=useId();
  const read=port.readGuide,save=port.saveGuide;
  const result=loaded?.locale===locale&&loaded.epoch===scope.epoch&&loaded.session===port.session
    &&loaded.read===read&&loaded.save===save
    &&scope.status==='READY'?loaded.result:null;
  const data=result?.state==='READY'&&result.guide.guideId===guide.guideId&&Date.parse(result.expiresAt)>Date.now()?result:null;
  const usable=!!data&&(data.guide.status==='READY'||data.guide.status==='KOREAN_FALLBACK');
  const dirty=!!data&&(data.checklist.state==='STALE_GUIDE'
    ||JSON.stringify([...draft].sort())!==JSON.stringify([...data.checklist.checkedStepIds].sort()));
  const load=useCallback(async()=>{
    if(!read||scope.status!=='READY')return;
    const ticket=++sequence.current;pending.current?.abort();
    const request=new AbortController();pending.current=request;
    setLoaded(null);setDraft([]);setMessage('');setBusy('READ');onActivity('READ');
    try{
      const next=await port.session.runLatest('international-'+lane,
        signal=>read(guide.guideId,locale,AbortSignal.any([signal,request.signal])));
      if(ticket===sequence.current&&!request.signal.aborted&&next&&port.session.getState().status==='READY'){
        setLoaded({result:next,locale,epoch:scope.epoch,session:port.session,read,save});
        setDraft(next.state==='READY'?[...next.checklist.checkedStepIds]:[]);
      }else if(ticket===sequence.current&&!request.signal.aborted&&port.session.getState().status==='READY'){
        setMessage('다른 저장 작업이 끝난 뒤 안내·체크를 다시 읽어 주세요.');
      }
    }finally{if(ticket===sequence.current){setBusy(null);onActivity(null);}}
  },[read,save,guide.guideId,locale,scope.epoch,scope.status,port.session,lane,onActivity]);
  useEffect(()=>{void load();return ()=>{sequence.current++;pending.current?.abort();onActivity(null);};},[load,onActivity]);
  useEffect(()=>{
    if(result?.state!=='READY')return;
    let timer:ReturnType<typeof setTimeout>;
    const check=()=>{
      const remaining=Date.parse(result.expiresAt)-Date.now();
      if(remaining>0){timer=setTimeout(check,Math.min(remaining,2_147_483_647));return;}
      sequence.current++;pending.current?.abort();setLoaded(null);setDraft([]);setBusy(null);onActivity(null);
      setMessage('확인 유효기한이 지났습니다. 안내·체크를 다시 읽어 저장 상태를 확인해 주세요.');
    };
    check();return ()=>clearTimeout(timer);
  },[result,onActivity]);
  const persist=async()=>{
    if(!save||!data||Date.parse(data.expiresAt)<=Date.now()||!usable||!data.translationVersion||busy||scope.status!=='READY')return;
    const ticket=++sequence.current,request=new AbortController();pending.current?.abort();pending.current=request;
    const change={expectedVersion:data.version,locale,displayedLocale:data.guide.locale,
      guideRevisionId:data.guide.sourceRevisionId,translationVersion:data.translationVersion,
      contextVersion:data.contextVersion,checkedStepIds:[...draft].sort()};
    setBusy('WRITE');onActivity('WRITE');setMessage('');
    try{
      const next=await port.session.runMutation(signal=>save(guide.guideId,change,AbortSignal.any([signal,request.signal])));
      if(ticket===sequence.current&&!request.signal.aborted&&next&&port.session.getState().status==='READY'){
        setLoaded({result:next,locale,epoch:scope.epoch,session:port.session,read,save});
        setDraft(next.state==='READY'?[...next.checklist.checkedStepIds]:[]);
        if(next.state==='READY'&&next.checklist.state==='READY')setMessage('체크를 저장했습니다.');
      }else if(ticket===sequence.current&&!request.signal.aborted&&port.session.getState().status==='READY'){
        setMessage('저장 결과를 확인하지 못했습니다. 안내·체크를 다시 읽고 확인해 주세요.');
      }
    }finally{if(ticket===sequence.current){setBusy(null);onActivity(null);}}
  };
  return <section className="owner-guide" aria-label="안내와 본인 준비 체크">
    <label className="owner-guide__language">안내 언어
      <select value={locale} disabled={busy==='WRITE'} onChange={event=>{setMessage('');setLocale(event.target.value as Locale);}}>
        <option value="ko">한국어 (KO)</option><option value="en">English (EN)</option><option value="zh">中文 (ZH)</option>
      </select>
    </label>
    {busy==='READ'&&<p role="status" aria-busy="true">현재 안내·번역·본인 체크를 확인하고 있습니다.</p>}
    {result?.state==='NOT_CONNECTED'&&<><p role="status">NOT_CONNECTED — 체크 저장 공급자가 연결되지 않았습니다. 조회된 안내만 표시합니다.</p>
      <ReadonlyGuide guide={guide}/></>}
    {data&&<>
      <p className="muted">조회 시점 {time(data.asOf)} KST · 안내 출처 판본 {data.sourceVersion}</p>
      <p className="muted">확인 유효기한 {time(data.expiresAt)} KST · 저장할 때 권한과 판본을 다시 확인합니다.</p>
      <ReadonlyGuide guide={data.guide}/>
      {data.guide.status==='KOREAN_FALLBACK'&&<p role="note">선택한 언어의 검수된 번역이 없어 한국어 원문을 표시합니다.</p>}
      {data.translationVersion&&<p className="muted">표시 번역 판본 {data.translationVersion} · 본인 기록 버전 {data.version}</p>}
      {data.checklist.state==='STALE_GUIDE'&&<p role="status">안내 또는 번역이 바뀌어 이전 체크를 비웠습니다. 현재 안내를 다시 확인해 주세요.</p>}
      {usable?<fieldset disabled={busy!==null} className="owner-guide__checks">
        <legend>본인 준비 체크</legend><p>학교 학사 처리 완료가 아닌 본인의 준비 기록입니다.</p>
        {data.guide.steps.map((step,index)=><label key={step.id}>
          <input type="checkbox" checked={draft.includes(step.id)} onChange={event=>{
            const checked=event.currentTarget.checked;
            setMessage('');setDraft(previous=>checked?[...new Set([...previous,step.id])]:previous.filter(id=>id!==step.id));
          }}/>
          <span {...(step.label?{lang:data.guide.locale}:{})}>{index+1}. {step.label??'안내의 준비 항목 확인'}</span>
        </label>)}
        {!data.guide.steps.length&&<p>현재 안내에 별도 체크 항목이 없습니다.</p>}
      </fieldset>:<p role="status">적용 대상·출처·검수된 번역을 확인할 수 없어 체크를 저장할 수 없습니다.</p>}
    </>}
    <div className="owner-guide__actions">
      <button type="button" disabled={busy!==null||!data||!usable||!dirty} onClick={()=>void persist()}>
        {busy==='WRITE'?'체크 저장 중':data?.checklist.state==='STALE_GUIDE'?'현재 안내로 체크 저장':'체크 저장'}
      </button>
      <button type="button" disabled={busy==='WRITE'} onClick={()=>void load()}>안내·체크 다시 읽기</button>
    </div>
    {message&&<p role="status">{message}</p>}
    <p><a href="/counseling">상담 기관 안내 열기</a> · 국제학생·교류 목적을 선택해 담당 기관을 확인하세요.</p>
  </section>;
}
export function OwnerInternationalGuides({guides,port,onBusyChange}:{guides:readonly V.GuideResolutionV2[];
  port:OwnerInsightsPort;onBusyChange:(busy:boolean)=>void}){
  const [selected,setSelected]=useState(guides[0]?.guideId??''),[saving,setSaving]=useState(false);
  const onActivity=useCallback((activity:Activity)=>{setSaving(activity==='WRITE');onBusyChange(activity!==null);},[onBusyChange]);
  const guide=guides.find(g=>g.guideId===selected);
  if(!port.readGuide||!port.saveGuide)return <section><p role="status">NOT_CONNECTED — 체크 저장 연결이 없습니다.</p>
    {guides.map(g=><ReadonlyGuide key={g.guideId} guide={g}/>)}</section>;
  if(!guides.length)return <p role="status">현재 권한으로 확인할 수 있는 국제학생 안내가 없습니다.</p>;
  return <section><label className="owner-guide__language">확인할 안내
    <select value={selected} disabled={saving} onChange={event=>setSelected(event.target.value)}>
      {guides.map((g,index)=><option key={g.guideId} value={g.guideId}>안내 {index+1} · {g.guideId}</option>)}
    </select></label>
    {guide&&<GuideEditor key={guide.guideId} guide={guide} port={port} onActivity={onActivity}/>}
  </section>;
}
