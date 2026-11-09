import {useEffect,useState,useSyncExternalStore} from 'react';
import type {HufsOwnerApiClient} from '../../integrations/owner-api-client.js';
import type {OwnerSessionController} from '../../app/owner-session-controller.js';
import {OwnerSessionFailure} from '../../app/OwnerSessionFailure.js';

export interface OwnerPreparationPort {
  session:OwnerSessionController;
  read:HufsOwnerApiClient['getOwnerPreparation'];
}
type Result=Awaited<ReturnType<OwnerPreparationPort['read']>>;
type Kind='SCHOLARSHIP'|'BADGE';
const kst=(value:string)=>new Intl.DateTimeFormat('ko-KR',{
  timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',
}).format(new Date(value));
const evidence={
  MET:'검증된 요건 충족',NOT_MET:'충족하지 않음',UNKNOWN:'확인 필요',
};
export function OwnerPreparationPanel({port,kind}:{port:OwnerPreparationPort;kind:Kind}){
  const scope=useSyncExternalStore(port.session.subscribe,port.session.getState,port.session.getState);
  const [result,setResult]=useState<Result|null>(null);
  const [busy,setBusy]=useState(false);
  useEffect(()=>{void port.session.initialize();},[port.session]);
  useEffect(()=>{setResult(null);setBusy(false);},[scope.epoch,scope.status,kind]);
  const load=async()=>{
    if(scope.status!=='READY'||busy)return;
    setResult(null);setBusy(true);
    try{
      const value=await port.session.runLatest('owner-preparation-'+kind,signal=>port.read(signal));
      if(value&&port.session.getState().status==='READY')setResult(value);
    }finally{setBusy(false);}
  };
  if(scope.status==='IDLE'||scope.status==='CHECKING')
    return <p role="status" aria-busy="true">BETA 본인 세션 확인 중입니다.</p>;
  if(scope.status!=='READY')return <OwnerSessionFailure controller={port.session}>
    현재 본인·자료 공개 권한을 검증하지 못해 준비 결과를 삭제했습니다.
  </OwnerSessionFailure>;
  return <section className="section" aria-label={kind==='SCHOLARSHIP'?'장학금 요건 준비':'오픈배지 취득 준비'}>
    <p role="note">실제 장학금 지급·수혜 결정이나 학교 발급 배지가 아닙니다. 현재 학적·활동 증거가 없으면 확인 필요로 표시합니다. 서버가 최신 출처 권리·본인 동의를 재검증한 기록만 이용합니다.</p>
    <button type="button" disabled={busy} onClick={()=>void load()}>{busy?'검증 중':'현재 내 준비 상태 확인'}</button>
    {result?.state==='NOT_CONNECTED'?<p role="status">NOT_CONNECTED — 공식 규정·현재 본인 증거·출처 사용권과 요청 제한 공급자가 연결되지 않았습니다. 합성 결과를 제공하지 않습니다.</p>
      :result?.state==='READY'?<section aria-live="polite">
        <p className="muted">확인 기준 {kst(result.asOf)} · 출처 판본 {result.sourceVersion}</p>
        {kind==='SCHOLARSHIP'
          ?result.scholarships.length===0?<p>현재 확인 가능한 장학 공고 규정이 없습니다.</p>
            :<ul>{result.scholarships.map(s=><li key={s.scholarshipId}>
              <h3>장학금 {s.scholarshipId}</h3>
              <p>지원 요건 {evidence[s.overall]} · 신청기간 {s.applicationWindow} · 기관 판정 없음</p>
              {s.missingFactKeys.length>0&&<p>추가 확인할 자료: {s.missingFactKeys.join(', ')}</p>}
              <p className="muted">원문 규정 판본 {s.ruleRevisionId} · 자료 상태 {s.sourceReason}</p>
            </li>)}</ul>
          :result.badges.length===0?<p>현재 검토 가능한 배지 발급 기준이 없습니다.</p>
            :<ul>{result.badges.map(b=><li key={b.badgeId}>
              <h3>배지 {b.badgeId}</h3>
              <p>준비 상태 {b.status} · 발급된 자격증 아님</p>
              {b.requiredNextTopics.length>0&&<p>준비할 활동 주제: {b.requiredNextTopics.join(', ')}</p>}
              <p className="muted">발급 기준 판본 {b.sourceRevisionId} · 기관 발급 확인 필요</p>
            </li>)}</ul>}
      </section>:null}
  </section>;
}
