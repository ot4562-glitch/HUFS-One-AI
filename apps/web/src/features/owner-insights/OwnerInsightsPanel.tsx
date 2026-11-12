import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import type {FeatureAdditions as V} from '@hufs-one/contracts';
import type {HufsOwnerApiClient} from '../../integrations/owner-api-client.js';
import type {OwnerSessionController} from '../../app/owner-session-controller.js';
import {OwnerSessionFailure} from '../../app/OwnerSessionFailure.js';
import {OwnerInternationalGuides} from './OwnerInternationalGuides.js';

export interface OwnerInsightsPort {
  session:OwnerSessionController;
  read:HufsOwnerApiClient['getOwnerInsights'];
  readGuide?:HufsOwnerApiClient['getOwnerGuideChecklist'];
  saveGuide?:HufsOwnerApiClient['saveOwnerGuideChecklist'];
}
type Result=Awaited<ReturnType<OwnerInsightsPort['read']>>;
type Ready=Extract<Result,{state:'READY'}>['result'];
export const OWNER_INSIGHT_TITLES:Readonly<Record<V.OwnerInsightsKind,string>>={
  MENTORS:'멘토 후보 비교',
  RECOGNITION:'교외활동 증빙 준비',
  SKILLS:'NCS 요구조건·경험 근거 비교',
  LEARNING:'학습공동체·튜터링 후보',
  EMPLOYMENT:'검증된 취업통계',
  INTERNATIONAL:'국제학생 안내',
};
const kst=(value:string)=>new Intl.DateTimeFormat('ko-KR',{
  timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',
}).format(new Date(value));
type EmploymentReady=Extract<Ready,{kind:'EMPLOYMENT'}>;
function EmploymentDashboard({data}:{data:EmploymentReady}){
  const [year,setYear]=useState('ALL'),[metric,setMetric]=useState('ALL');
  const years=[...new Set(data.rows.map(row=>String(row.year)))].sort().reverse();
  const metrics=[...new Set(data.rows.map(row=>row.metricId))].sort();
  const selected=data.rows.filter(row=>(year==='ALL'||String(row.year)===year)
    &&(metric==='ALL'||row.metricId===metric));
  const safeNumber=(row:EmploymentReady['rows'][number])=>
    (row.status==='PERCENT'||row.status==='OBSERVED_ZERO')
    &&Number.isFinite(row.percent)&&Number.isSafeInteger(row.numerator)
    &&Number.isSafeInteger(row.denominator)&&row.denominator!>0
      ?row.percent!.toFixed(2)+'% ('+row.numerator+'/'+row.denominator+')'
      :null;
  const label=(row:EmploymentReady['rows'][number])=>{
    const number=safeNumber(row);
    if(number!==null)return number;
    if(row.status==='SUPPRESSED')return '소표본 보호·게시 제한';
    if(row.status==='NO_DATA')return '미수집·미공유';
    if(row.status==='OBSERVED_ZERO'||row.status==='PERCENT')return '검증되지 않은 수치';
    if(row.status==='INVALID')return '집계 분자·분모 오류';
    return '출처 권리 또는 공개 여부 미확인';
  };
  return <section aria-label="취업통계 비교 표">
    <p>서로 비교 가능: {data.comparable?'예':'아니오'} · 근거 {data.reason}</p>
    <p role="note">아래 값은 본인에게 허가된 현재 결과 최대 50개 셀만 표시하며,
      서로 다른 원천·모집단·연도·비공개 기준은 직접 비교할 수 없습니다.
      통계는 개인 취업 확률이나 연봉 보장이 아닙니다.</p>
    <label htmlFor="owner-stat-year">통계 연도 선택</label>
    <select id="owner-stat-year" value={year} onChange={event=>setYear(event.target.value)}>
      <option value="ALL">전체 연도</option>
      {years.map(value=><option key={value} value={value}>{value}년</option>)}
    </select>
    <label htmlFor="owner-stat-metric">통계 지표 선택</label>
    <select id="owner-stat-metric" value={metric} onChange={event=>setMetric(event.target.value)}>
      <option value="ALL">전체 지표</option>
      {metrics.map(value=><option key={value} value={value}>{value}</option>)}
    </select>
    <div style={{overflowX:'auto',maxWidth:'100%'}}>
      <table>
        <caption>검증된 집계만 공개하는 통계표 · 현재 조건 {selected.length}건</caption>
        <thead><tr><th scope="col">연도</th><th scope="col">구분</th>
          <th scope="col">지표</th><th scope="col">결과</th><th scope="col">출처 판본</th></tr></thead>
        <tbody>{selected.map(row=><tr key={row.id}>
          <th scope="row">{row.year}</th><td>{row.groupId}</td><td>{row.metricId}</td>
          <td>{label(row)}</td><td>{row.sourceRevisionId}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {!selected.length&&<p role="status">현재 허가된 응답에서 선택한 통계값을 찾지 못했습니다. 미관측 값을 0%로 표시하지 않습니다.</p>}
  </section>;
}
function details(data:Ready,port:OwnerInsightsPort,onBusyChange:(busy:boolean)=>void){
  switch(data.kind){
    case 'MENTORS':
      return <section>
        <p>규칙 기반 후보 {data.ranking.candidateCount}명 · 외부 AI 재정렬 {data.ranking.modelOutcome}</p>
        <ul>{data.ranking.items.slice(0,40).map(m=><li key={m.mentorId}>
          <strong>멘토 {m.mentorId}</strong> · 관련도 {(m.finalScore*100).toFixed(1)}점
          <p>검증 근거 {m.reasons.map(r=>r.kind+': '+r.codes.join(', ')).join(' · ')||'추가 확인 필요'}</p>
          <p className="muted">공개 출처 {m.sourceRevisionId} · 자동 배정/연락 아님</p>
        </li>)}</ul>
      </section>;
    case 'RECOGNITION':
      return <section><p>증빙은 학생이 확인할 제출 준비 항목이며, 공식 활동 인정이 아닙니다.</p>
        <ul>{data.reports.map(r=><li key={r.activityId}>
          <strong>활동 {r.activityId}</strong> · {r.status}
          <p>추가 증빙 {r.missingKinds.join(', ')||'현재 기록상 없음'}</p>
          <p className="muted">규정 판본 {r.ruleRevisionId} · 공식 인정 여부: 미확정</p>
        </li>)}</ul>
      </section>;
    case 'SKILLS':
      return <section><p>기록이 없다고 역량이 없다는 뜻은 아닙니다. 학교·채용기관 적합성 판정이 아닙니다.</p>
        <ul>{data.rows.map(r=><li key={r.requirementId}>
          <strong>요건 {r.requirementId}</strong> · {r.status}
          <p>검토할 근거 {r.ownerEvidenceIds.join(', ')||'미연결'} · 누락된 분류 {r.unmappedRequirementTopics?.join(', ')||'없음'}</p>
          <p className="muted">원문 근거 {r.sourceSpanId} · {r.interpretation}</p>
        </li>)}</ul>
      </section>;
    case 'LEARNING':
      return <section><p>추천은 학습 참여·수강 승인 또는 확정된 자격이 아닙니다.</p>
        <p>제외된 규정/프로그램 {data.ranking.excludedCount}건 · AI 후보 {data.ranking.modelOutcome}</p>
        <ul>{data.ranking.items.slice(0,40).map(p=><li key={p.programId}>
          <strong>프로그램 {p.programId}</strong> · 자격 {p.eligibility}
          <p>관련도 {(p.finalScore*100).toFixed(1)}점 · 확인 사항 {p.hardReasons.join(', ')||'없음'}</p>
          <p className="muted">출처 판본 {p.sourceRevisionId}</p>
        </li>)}</ul>
      </section>;
    case 'EMPLOYMENT':
      return <EmploymentDashboard data={data}/>;
    case 'INTERNATIONAL':
      return <OwnerInternationalGuides guides={data.guides} port={port} onBusyChange={onBusyChange}/>;
  }
}
export function OwnerInsightsPanel({port,kind}:{port:OwnerInsightsPort;kind:V.OwnerInsightsKind}){
  const scope=useSyncExternalStore(port.session.subscribe,port.session.getState,port.session.getState);
  const [result,setResult]=useState<Result|null>(null);
  const [busy,setBusy]=useState(false);
  const [guideBusy,setGuideBusy]=useState(false);
  const requestVersion=useRef(0);
  useEffect(()=>{void port.session.initialize();},[port.session]);
  useEffect(()=>{
    requestVersion.current++;setResult(null);setBusy(false);setGuideBusy(false);
    return ()=>{requestVersion.current++;};
  },[port.read,port.session,scope.epoch,scope.status,kind]);
  const load=async()=>{
    if(scope.status!=='READY'||busy)return;
    const ticket=++requestVersion.current;
    setResult(null);setBusy(true);
    try{
      const next=await port.session.runLatest('v2-insights-'+kind,
        signal=>port.read(kind,signal));
      if(ticket===requestVersion.current&&next&&port.session.getState().status==='READY')
        setResult(next);
    }finally{if(ticket===requestVersion.current)setBusy(false);}
  };
  if(scope.status==='IDLE'||scope.status==='CHECKING')
    return <p role="status" aria-busy="true">BETA 본인 인증 확인 중입니다.</p>;
  if(scope.status!=='READY')return <OwnerSessionFailure controller={port.session}>
    {scope.status==='CONFLICT'?'다른 탭의 저장 또는 안내 판본이 바뀌었습니다. 현재 계정·권한을 다시 확인한 뒤 새 안내를 읽고 체크해 주세요.'
      :scope.error==='RATE_LIMITED'?'요청 한도에 도달했습니다. 잠시 뒤 현재 계정·권한을 다시 확인해 주세요.'
      :'현재 본인·목적별 자료 권한 또는 연결 상태를 확인하지 못해 기존 기록을 숨겼습니다.'}
  </OwnerSessionFailure>;
  return <section className="section owner-insights" aria-label={OWNER_INSIGHT_TITLES[kind]}>
    <p role="note">이 기능은 조회 시점에 본인에게 허가된 원장과 근거를 사용합니다. 모델 추천·준비 상태는 학교/기관 공식 승인·합격/발급/지원 결과가 아닙니다.</p>
    <button type="button" disabled={busy||guideBusy} onClick={()=>void load()}>{busy?'권한 확인 중':'현재 권한으로 확인하기'}</button>
    {result?.state==='NOT_CONNECTED'?<p role="status">
      NOT_CONNECTED — 해당 기능의 허가된 공식 자료/현재 본인 동의·검증 공급자와 요청 한도가 운영 서버에 연결되지 않았습니다. 합성 결과로 대체하지 않습니다.
    </p>:result?.state==='READY'?<section aria-live="polite">
      <p className="muted">{kind==='INTERNATIONAL'?'안내 목록 조회 기준':'기준'} {kst(result.asOf)} · 허가된 출처 판본 {result.sourceVersion}</p>
      {details(result.result,port,setGuideBusy)}
    </section>:null}
  </section>;
}
