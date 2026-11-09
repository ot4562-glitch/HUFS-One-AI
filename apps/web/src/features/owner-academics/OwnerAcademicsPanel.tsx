import {useEffect,useState,useSyncExternalStore,type FormEvent} from 'react';
import {OwnerSessionFailure} from '../../app/OwnerSessionFailure.js';
import {OwnerStudyPlanCheckRequestSchema,type OwnerDoubleMajorAudit,
  type OwnerStudyPlanCheckRequest,type OwnerStudyPlanCheckResponse,
  type OwnerMajorWhatIfRequest,type OwnerMajorWhatIfResponse} from '@hufs-one/contracts';
import type {OwnerSessionController} from '../../app/owner-session-controller.js';

/** Server-authorized BETA reads, never a browser-provided actor or RulePack. */
export interface OwnerAcademicsPort {
  readonly session:OwnerSessionController;
  current(signal?:AbortSignal):Promise<OwnerDoubleMajorAudit>;
  plan(change:OwnerStudyPlanCheckRequest,signal?:AbortSignal):Promise<OwnerStudyPlanCheckResponse>;
  hypothetical(change:OwnerMajorWhatIfRequest,signal?:AbortSignal):Promise<OwnerMajorWhatIfResponse>;
}
const notice='이 결과는 수강신청·졸업의 공식 판정이 아닙니다. 미검증 원문·학업 요건·전공 지원 자격은 확정하지 않습니다.';
const credits=(units:number)=>String(units/2)+'학점';

/** Clears all owner results after identity/epoch/permission changes. */
export function OwnerAcademicsPanel({port}:{port:OwnerAcademicsPort}){
  const scope=useSyncExternalStore(port.session.subscribe,port.session.getState,port.session.getState);
  const [current,setCurrent]=useState<OwnerDoubleMajorAudit|null>(null);
  const [plan,setPlan]=useState<OwnerStudyPlanCheckResponse|null>(null);
  const [whatIf,setWhatIf]=useState<OwnerMajorWhatIfResponse|null>(null);
  const [term,setTerm]=useState('2027-1');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  useEffect(()=>{void port.session.initialize();},[port.session]);
  useEffect(()=>{
    setCurrent(null);setPlan(null);setWhatIf(null);setMessage('');
    if(scope.status!=='READY')return;
    let active=true;
    void port.session.runLatest('owner-double-major',signal=>port.current(signal))
      .then(value=>{if(active&&value)setCurrent(value);});
    return ()=>{active=false;};
  },[port,scope.epoch,scope.status]);

  const checkPlan=async(event:FormEvent)=>{
    event.preventDefault();
    if(busy||scope.status!=='READY'||!current)return;
    const input=OwnerStudyPlanCheckRequestSchema.safeParse({term});
    if(!input.success){setMessage('정규 학기는 YYYY-1 또는 YYYY-2 형식입니다.');return;}
    setPlan(null);setMessage('');setBusy(true);
    try{
      const reply=await port.session.runLatest('owner-plan-check',signal=>port.plan(input.data,signal));
      if(reply&&port.session.getState().status==='READY')setPlan(reply);
    }finally{setBusy(false);}
  };
  const checkRemoval=async()=>{
    if(busy||scope.status!=='READY'||current?.selection!=='SELECTED')return;
    setWhatIf(null);setMessage('');setBusy(true);
    try{
      const reply=await port.session.runLatest('owner-what-if',signal=>
        port.hypothetical({scenario:{action:'REMOVE_DOUBLE_MAJOR'}},signal));
      if(reply&&port.session.getState().status==='READY')setWhatIf(reply);
    }finally{setBusy(false);}
  };
  if(scope.status==='IDLE'||scope.status==='CHECKING')
    return <p aria-busy="true">현재 BETA 사용자 권한을 확인하고 있습니다.</p>;
  if(scope.status!=='READY')return <OwnerSessionFailure controller={port.session}>
    본인 학업 자료의 인증·권한·서버 연결 또는 판본이 달라졌습니다. 이전 결과를 비웠습니다.
  </OwnerSessionFailure>;
  if(!current)return <p aria-busy="true">승인된 본인 학업 자료를 확인하고 있습니다.</p>;
  return <section aria-label="본인 학업 검토" className="local-account__panel">
    <p role="note">{notice}</p>
    <section aria-label="이중전공 현재 상태">
      <h2>주전공·이중전공</h2>
      <p>상태: {current.state} · 선택: {current.selection} · 기준 {current.asOf}</p>
      {current.uniqueCredits
        ?<p>중복 합산하지 않은 이수 학점: {credits(current.uniqueCredits.earnedCreditUnits)}</p>
        :<p>원장·학적 근거가 부족해 학점을 확정하지 않습니다.</p>}
      <p>주전공: {current.primary.majorId??'확인 필요'} · RulePack {current.primary.rulePack.state}</p>
      <p>이중전공: {current.doubleMajor.majorId??'확인 필요'} · RulePack {current.doubleMajor.rulePack.state}</p>
      {current.overlap&&<p>중복 인정: {current.overlap.status} ·
        {current.overlap.status==='COVERED_BY_APPROVED_RULE'
          ?credits(current.overlap.sharedCreditUnits):' 독립 승인 근거 확인 필요'}</p>}
      {!!current.missingInputs.length&&<p>미확인 자료: {current.missingInputs.join(', ')}</p>}
      <p className="muted">요건 주의: {current.caveats.join(' · ')}</p>
    </section>
    <section aria-label="수강계획 사전검사">
      <h2>수강계획 사전검사</h2>
      <form onSubmit={event=>{void checkPlan(event);}}>
        <label>정규 학기
          <input inputMode="numeric"
            maxLength={6} value={term} onChange={event=>{setTerm(event.target.value);setPlan(null);}}/>
        </label>
        <button disabled={busy} type="submit">권한·원문 확인 후 검사</button>
      </form>
      {plan&&<div role="status">
        <p>학기 {plan.term} · {plan.state} · 기준 {plan.asOf}</p>
        {plan.state==='READY'&&plan.approval&&plan.creditCapUnits!==undefined
          ?<p>검수된 학기 학점 상한: {credits(plan.creditCapUnits)}</p>
          :<p>학점 상한과 시간 충돌은 공식 근거가 확인되기 전 확정하지 않습니다.</p>}
        <p>미확인 항목 {plan.unchecked.length}개 · 점검 경고 {plan.planIssues.map(i=>i.code).join(', ')||'없음'}</p>
      </div>}
    </section>
    <section aria-label="가정 학업 분석">
      <h2>전공 What-if</h2>
      <p>승인된 후보 목록이 없으므로 임의 전공 추가·변경은 비활성입니다.</p>
      <button type="button" disabled={busy||current.selection!=='SELECTED'}
        onClick={()=>{void checkRemoval();}}>현재 이중전공을 제외한다면? (가상)</button>
      {whatIf&&<div role="status">
        <p>{whatIf.state} · {whatIf.asOf} · 공식 판정 아님</p>
        {whatIf.state==='BLOCKED_DEPENDENCY'
          ?<p>계산을 보류한 근거: {whatIf.blockers.join(', ')}</p>
          :<p>검증된 요건 변화 {whatIf.delta.length}건 · 실제 전공 변경 승인 아님</p>}
      </div>}
    </section>
    {message&&<p role="alert">{message}</p>}
  </section>;
}
