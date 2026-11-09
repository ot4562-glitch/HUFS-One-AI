import {useEffect,useState,useSyncExternalStore} from 'react';
import type {FeatureAdditions as V} from '@hufs-one/contracts';
import type {HufsOwnerApiClient} from '../../integrations/owner-api-client.js';
import type {OwnerSessionController} from '../../app/owner-session-controller.js';
import {OwnerSessionFailure} from '../../app/OwnerSessionFailure.js';

export interface OwnerInsightsPort {
  session:OwnerSessionController;
  read:HufsOwnerApiClient['getOwnerInsights'];
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
function details(data:Ready){
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
      return <section>
        <p>서로 비교 가능: {data.comparable?'예':'아니오'} · 근거 {data.reason}</p>
        <p>소표본·미공개·미검증 셀은 비율과 분자/분모를 표시하지 않습니다.</p>
        <ul>{data.rows.map(r=><li key={r.id}>
          <strong>{r.year}년 · {r.groupId} · {r.metricId}</strong>
          <p>{r.status==='PERCENT'||r.status==='OBSERVED_ZERO'
            ?'검토된 비율 '+r.percent?.toFixed(2)+'% ('+r.numerator+'/'+r.denominator+')'
            :'공개 불가 또는 미확정: '+r.status}</p>
          <p className="muted">공식 공개판본 {r.sourceRevisionId}</p>
        </li>)}</ul>
      </section>;
    case 'INTERNATIONAL':
      return <section><p>체크리스트는 학생의 준비 참고이며 학교 학사 처리 완료를 뜻하지 않습니다.</p>
        <ul>{data.guides.map(g=><li key={g.guideId}>
          <strong>안내 {g.guideId}</strong> · {g.status} · 언어 {g.locale}
          {g.body&&<p style={{whiteSpace:'pre-wrap'}}>{g.body}</p>}
          <p>확인 항목 {g.steps.map(s=>s.documentCodes.join(', ')).join(' · ')||'출처 확인 필요'}</p>
          <p className="muted">기준 판본 {g.sourceRevisionId} · 학교 처리 완료 아님</p>
        </li>)}</ul>
      </section>;
  }
}
export function OwnerInsightsPanel({port,kind}:{port:OwnerInsightsPort;kind:V.OwnerInsightsKind}){
  const scope=useSyncExternalStore(port.session.subscribe,port.session.getState,port.session.getState);
  const [result,setResult]=useState<Result|null>(null);
  const [busy,setBusy]=useState(false);
  useEffect(()=>{void port.session.initialize();},[port.session]);
  useEffect(()=>{setResult(null);setBusy(false);},[scope.epoch,scope.status,kind]);
  const load=async()=>{
    if(scope.status!=='READY'||busy)return;
    setResult(null);setBusy(true);
    try{
      const next=await port.session.runLatest('v2-insights-'+kind,
        signal=>port.read(kind,signal));
      if(next&&port.session.getState().status==='READY')setResult(next);
    }finally{setBusy(false);}
  };
  if(scope.status==='IDLE'||scope.status==='CHECKING')
    return <p role="status" aria-busy="true">BETA 본인 인증 확인 중입니다.</p>;
  if(scope.status!=='READY')return <OwnerSessionFailure controller={port.session}>
    현재 본인·목적별 자료 권한 또는 연결 상태를 확인하지 못해 기존 기록을 숨겼습니다.
  </OwnerSessionFailure>;
  return <section className="section" aria-label={OWNER_INSIGHT_TITLES[kind]}>
    <p role="note">이 기능은 본인에게 허가된 최신 원장과 근거만 사용합니다. 모델 추천·준비 상태는 학교/기관 공식 승인·합격/발급/지원 결과가 아닙니다.</p>
    <button type="button" disabled={busy} onClick={()=>void load()}>{busy?'권한 확인 중':'현재 권한으로 확인하기'}</button>
    {result?.state==='NOT_CONNECTED'?<p role="status">
      NOT_CONNECTED — 해당 기능의 허가된 공식 자료/현재 본인 동의·검증 공급자와 요청 한도가 운영 서버에 연결되지 않았습니다. 합성 결과로 대체하지 않습니다.
    </p>:result?.state==='READY'?<section aria-live="polite">
      <p className="muted">기준 {kst(result.asOf)} · 허가된 출처 판본 {result.sourceVersion}</p>
      {details(result.result)}
    </section>:null}
  </section>;
}
