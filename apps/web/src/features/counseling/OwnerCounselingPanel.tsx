import {useEffect,useState,useSyncExternalStore,type FormEvent} from 'react';
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
] as const;

/** #366 owner-only verified institutional suggestions; never school counseling bookings. */
export function OwnerCounselingPanel({port}:{port:OwnerCounselingPort}){
  const scope=useSyncExternalStore(port.session.subscribe,port.session.getState,port.session.getState);
  const [purpose,setPurpose]=useState<string>('CAREER');
  const [result,setResult]=useState<Result|null>(null);
  const [busy,setBusy]=useState(false);
  useEffect(()=>{void port.session.initialize();},[port.session]);
  useEffect(()=>{setResult(null);setBusy(false);},[scope.epoch,scope.status]);
  const submit=async(event:FormEvent)=>{
    event.preventDefault();
    if(scope.status!=='READY'||busy)return;
    setResult(null);setBusy(true);
    try{
      const value=await port.session.runLatest('owner-counseling',
        signal=>port.search({purposes:[purpose]},signal));
      if(value&&port.session.getState().status==='READY')setResult(value);
    }finally{setBusy(false);}
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
        onChange={event=>{setPurpose(event.target.value);setResult(null);}}>
        {purposes.map(item=><option key={item.code} value={item.code}>{item.label}</option>)}
      </select>
      <button type="submit" disabled={busy}>{busy?'확인 중':'공식 기관 후보 찾기'}</button>
    </form>
    {result?.state==='NOT_CONNECTED'?<p role="status">NOT_CONNECTED — 현재 승인된 상담기관 원장/권리 포트가 서버에 연결되지 않았습니다. 가상 연락처나 예약 링크로 대체하지 않습니다.</p>
      :result?.state==='READY'?<section aria-live="polite">
        <p className="muted">출처 판본 {result.sourceVersion} · 확인 기준 {result.asOf.slice(0,10)} · {result.guide.excluded}개 자료 검증 제외</p>
        {result.guide.matches.length===0?<p role="status">현재 목적과 맞는 확인된 상담기관 정보가 없습니다. 학교 공식 홈페이지에서 직접 상담처를 확인하세요.</p>
          :<ul>{result.guide.matches.map(item=><li key={item.serviceId}>
            <strong>{item.serviceId}</strong>
            <p>관련 이유: {item.exactPurposes.join(', ')||item.relatedPurposes.join(', ')||'확인 필요'}</p>
            <p className="muted">대상 {item.audienceState} · 캠퍼스 {item.campusState} · 언어 {item.languageState} · 판본 {item.sourceRevisionId}</p>
            {item.officialApplicationUrl?<a href={item.officialApplicationUrl} target="_blank" rel="noopener noreferrer">공식 신청·안내 링크</a>
              :<p>검증된 신청 링크 없음 — 공식 기관에서 확인</p>}
          </li>)}</ul>}
      </section>:null}
  </section>;
}
