import {useEffect,useRef,useState,useSyncExternalStore,type FormEvent} from 'react';
import type {HufsOwnerApiClient} from '../../integrations/owner-api-client.js';
import type {OwnerSessionController} from '../../app/owner-session-controller.js';
import {OwnerSessionFailure} from '../../app/OwnerSessionFailure.js';

export interface OwnerCounselingPort {
  session:OwnerSessionController;
  search:HufsOwnerApiClient['findCounseling'];
}
type Result=Awaited<ReturnType<OwnerCounselingPort['search']>>;
const purposes=[
  {code:'CAREER',label:'진로·취업'},
  {code:'ACADEMIC',label:'학사·수강'},
  {code:'STUDY',label:'학습 방법'},
  {code:'INTERNATIONAL',label:'국제학생·교류'},
  {code:'WELLBEING',label:'학생 생활·상담'},
  {code:'MAJOR',label:'전공 선택·변경'},
  {code:'JOB_SEARCH',label:'구직·면접 준비'},
  {code:'WRITING',label:'글쓰기 지원'},
  {code:'OTHER',label:'기타 공식 상담'},
] as const;

/** #366 owner-only verified institutional suggestions; never school counseling bookings. */
export function OwnerCounselingPanel({port}:{port:OwnerCounselingPort}){
  const scope=useSyncExternalStore(port.session.subscribe,port.session.getState,port.session.getState);
  const [purpose,setPurpose]=useState<string>('CAREER');
  const [extraPurposes,setExtraPurposes]=useState<string[]>([]);
  const [campus,setCampus]=useState('');
  const [language,setLanguage]=useState('');
  const [result,setResult]=useState<Result|null>(null);
  const [busy,setBusy]=useState(false);
  // #427: a filter edit invalidates an in-flight result even without a new submit.
  // The session controller owns access control, while this generation guards UI intent.
  const requestVersion=useRef(0);
  const invalidateResults=()=>{
    requestVersion.current++;
    setResult(null);setBusy(false);
  };
  useEffect(()=>{void port.session.initialize();},[port.session]);
  useEffect(()=>{
    requestVersion.current++;
    setResult(null);setBusy(false);
    return ()=>{requestVersion.current++;};
  },[port.session,scope.epoch,scope.status]);
  const submit=async(event:FormEvent)=>{
    event.preventDefault();
    if(scope.status!=='READY'||busy)return;
    const version=++requestVersion.current;
    setResult(null);setBusy(true);
    try{
      const value=await port.session.runLatest('owner-counseling',
        signal=>port.search({purposes:[purpose,...extraPurposes.filter(code=>code!==purpose)].slice(0,5),
          ...(campus?{campus}:{}),...(language?{language}:{})},signal));
      if(version===requestVersion.current&&value&&port.session.getState().status==='READY')
        setResult(value);
    }finally{
      // A stale read must never clear the spinner for the new filters/request.
      if(version===requestVersion.current)setBusy(false);
    }
  };
  if(scope.status==='IDLE'||scope.status==='CHECKING')
    return <p role="status" aria-busy="true">인증된 본인 세션을 확인 중입니다.</p>;
  if(scope.status!=='READY')return <OwnerSessionFailure controller={port.session}>
    현재 상담기관 조회 권한·연결 상태를 확인할 수 없어 이전 결과를 지웠습니다.
  </OwnerSessionFailure>;
  return <section className="section" aria-label="공식 상담기관 찾기">
    <p role="note">상담 예약·심리/의료 진단이나 학교 공식 결정이 아닙니다. 검증된 공식 출처가 연결된 기관만 후보로 제시하며 민감한 사연은 이 입력에 작성하지 않습니다.</p>
    <form onSubmit={event=>void submit(event)} className="club__filters">
      <label htmlFor="counseling-purpose">상담 목적</label>
      <select id="counseling-purpose" value={purpose}
        onChange={event=>{setPurpose(event.target.value);invalidateResults();}}>
        {purposes.map(item=><option key={item.code} value={item.code}>{item.label}</option>)}
      </select>
      <fieldset>
        <legend>복합 상담 목적 (추가 선택, 최대 5개)</legend>
        {purposes.filter(item=>item.code!==purpose).map(item=>
          <label key={item.code}>
            <input type="checkbox" name="additional-counseling-purpose"
              value={item.code} checked={extraPurposes.includes(item.code)}
              disabled={!extraPurposes.includes(item.code)
                &&extraPurposes.filter(code=>code!==purpose).length>=4}
              onChange={event=>{
                const code=event.target.value;
                setExtraPurposes(current=>event.target.checked
                  ?[...current.filter(x=>x!==purpose),code].slice(0,4)
                  :current.filter(x=>x!==code));
                invalidateResults();
              }} />
            {item.label}
          </label>)}
        <p className="muted">직접 선택한 목적 코드만 조회합니다. 사연·진단명은 전송하지 않습니다.</p>
      </fieldset>
      <label htmlFor="counseling-campus">찾을 캠퍼스 (본인 학적 검증 아님)</label>
      <select id="counseling-campus" value={campus} onChange={e=>{setCampus(e.target.value);invalidateResults();}}>
        <option value="">캠퍼스 선택 안 함</option><option value="SEOUL">서울</option><option value="GLOBAL">글로벌</option>
      </select>
      <label htmlFor="counseling-language">상담 언어 (선호 필터)</label>
      <select id="counseling-language" value={language} onChange={e=>{setLanguage(e.target.value);invalidateResults();}}>
        <option value="">모두 보기</option><option value="ko">한국어</option><option value="en">영어</option><option value="zh">중국어</option>
      </select>
      <button type="submit" disabled={busy}>{busy?'확인 중':'공식 기관 후보 찾기'}</button>
    </form>
    {result?.state==='NOT_CONNECTED'?<p role="status">NOT_CONNECTED — 현재 승인된 상담기관 원장/권리 포트가 서버에 연결되지 않았습니다. 가상 연락처나 예약 링크로 대체하지 않습니다.</p>
      :result?.state==='READY'?<section aria-live="polite">
        <p className="muted">출처 판본 {result.sourceVersion} · 확인 기준 {new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(result.asOf))} · {result.guide.excluded}개 자료 검증 제외</p>
        {result.guide.matches.length===0?<p role="status">현재 목적과 맞는 확인된 상담기관 정보가 없습니다. 학교 공식 홈페이지에서 직접 상담처를 확인하세요.</p>
          :<ul>{result.guide.matches.map(item=><li key={item.serviceId}>
            <strong>{item.serviceName??'공식 기관 이름 미확인'}</strong>
            <p>관련 이유: {item.exactPurposes.join(', ')||item.relatedPurposes.join(', ')||'확인 필요'}</p>
            <p className="muted">학생 유형 {item.audienceState==='CONFIRMED'?'확인됨':'대상 확인 필요'} · 선택 캠퍼스 {item.campusState==='CONFIRMED'?'일치':'미확인'} · 상담 언어 {item.languageState==='CONFIRMED'?'일치':'미확인'} · 판본 {item.sourceRevisionId}</p>
            {item.officialApplicationUrl?<a href={item.officialApplicationUrl} target="_blank" rel="noopener noreferrer">공식 신청·안내 링크</a>
              :<p>검증된 신청 링크 없음 — 공식 기관에서 확인</p>}
          </li>)}</ul>}
      </section>:null}
  </section>;
}
