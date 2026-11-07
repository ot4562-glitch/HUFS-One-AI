import {useState,useSyncExternalStore} from 'react';
import {
  OwnerOpportunityReportInputSchema,OwnerOpportunityRevisionComparisonRequestSchema,
  type OwnerOpportunityModerationStatus,type OwnerOpportunityReportReason,
  type OpportunityRevisionComparisonResponse,
} from '@hufs-one/contracts';
import type {OwnerCareerPort} from './OwnerCareerPanel.js';
import {verifiedOwnerReportStatus,verifiedOwnerRevisionComparison,type CurrentOpportunityRights}
  from './opportunityEvidence.js';

/** All adapters below are optional until #325 supplies an authenticated API.
 * Absent adapters must never create browser-only reports or fabricate revisions. */
export interface OwnerOpportunityGovernancePort extends OwnerCareerPort{
  getModerationStatus?(opportunityId:string,signal?:AbortSignal):Promise<unknown>;
  submitReport?(input:{opportunityId:string;sourceRevisionId:string;permissionRef:string;
    reason:OwnerOpportunityReportReason},signal?:AbortSignal):Promise<unknown>;
  getRevisionContext?(opportunityId:string,signal?:AbortSignal):Promise<unknown>;
  compareRevisions?(opportunityId:string,
    request:{beforeRevisionId:string;afterRevisionId:string;asOf:string},
    signal?:AbortSignal):Promise<unknown>;
}
const FIELDS={DEADLINE:'모집 마감',STATUS:'모집 상태',ELIGIBILITY:'지원 조건'} as const;
const STATES={CHANGED:'변경',UNCHANGED:'동일',UNKNOWN:'정보 부족'} as const;
const CHANGES={EXTENDED:'기한 연장',SHORTENED:'기한 단축',CANCELLED:'모집 취소',CHANGED:'변경됨'} as const;
const REPORTS={
  INCORRECT_DEADLINE:'마감일이 잘못됨',INCORRECT_SOURCE:'원문 출처가 잘못됨',
  MISLEADING_APPLICATION_ROUTE:'실제 신청 경로가 잘못됨',RIGHTS_CONCERN:'자료 이용권 의심',
} as const;
const STATUS={
  NOT_FILED:'내 신고 접수 기록 없음',UNDER_REVIEW:'내 신고 검토 중',
  CLOSED_NO_CHANGE:'내 신고 검토 종료 (출처 변경 확인 없음)',
  SOURCE_WITHDRAWN:'출처 게시 철회',RIGHTS_REVOKED:'자료 이용권 철회',
} as const;
const noResult='현재 본인 권한·출처 판본과 일치하는 검토 결과를 확인할 수 없습니다. 이전 내용을 표시하지 않습니다.';

export function OwnerOpportunityGovernance({port,rights,onSourceRevoked}:{
  port:OwnerOpportunityGovernancePort;rights:CurrentOpportunityRights;onSourceRevoked:()=>void;
}){
  const session=useSyncExternalStore(port.session.subscribe,port.session.getState,port.session.getState);
  const [status,setStatus]=useState<OwnerOpportunityModerationStatus|null>(null);
  const [comparison,setComparison]=useState<OpportunityRevisionComparisonResponse|null>(null);
  const [reportReason,setReportReason]=useState<OwnerOpportunityReportReason>('INCORRECT_DEADLINE');
  const [reportConfirm,setReportConfirm]=useState(false);
  const [busy,setBusy]=useState(false);
  const [reportError,setReportError]=useState('');
  const [comparisonError,setComparisonError]=useState('');

  const current=async(signal:AbortSignal)=>{
    const latest=await port.getOpportunity(rights.opportunityId,signal);
    if(latest.opportunity.dataMode!=='REAL'||latest.source.status!=='ACTIVE'||!latest.source.verifiedAt
      ||latest.opportunity.id!==rights.opportunityId
      ||latest.source.sourceId!==rights.sourceId
      ||latest.source.revisionId!==rights.sourceRevisionId
      ||latest.source.permissionRef!==rights.permissionRef)
      throw new Error('Source revision or rights changed during owner read');
  };
  const showStatus=(data:OwnerOpportunityModerationStatus|null)=>{
    if(data?.state==='SOURCE_WITHDRAWN'||data?.state==='RIGHTS_REVOKED'){
      setStatus(null);setComparison(null);onSourceRevoked();return;
    }
    setStatus(data);
  };
  const getStatus=async()=>{
    if(!port.getModerationStatus||busy||session.status!=='READY')return;
    setBusy(true);setReportError('');setStatus(null);
    try{
      const result=await port.session.runLatest('owner-current-report',async signal=>{
        await current(signal);
        const raw=await port.getModerationStatus!(rights.opportunityId,signal);
        return verifiedOwnerReportStatus(raw,rights);
      });
      if(result&&port.session.getState().status==='READY')showStatus(result);
      else if(port.session.getState().status==='READY')setReportError(noResult);
    }finally{setBusy(false);}
  };
  const submitReport=async()=>{
    if(!port.submitReport||!reportConfirm||!status||status.state!=='NOT_FILED'
      ||busy||session.status!=='READY')return;
    setBusy(true);setReportError('');
    try{
      const input=OwnerOpportunityReportInputSchema.parse({
        opportunityId:rights.opportunityId,sourceRevisionId:rights.sourceRevisionId,
        permissionRef:rights.permissionRef,reason:reportReason,
      });
      const result=await port.session.runMutation(async signal=>{
        await current(signal);
        return verifiedOwnerReportStatus(await port.submitReport!(input,signal),rights);
      });
      if(result&&port.session.getState().status==='READY')showStatus(result);
      else if(port.session.getState().status==='READY')setReportError(
        '서버 신고 접수 확인 실패. 중복 신고하지 말고 현재 상태를 다시 확인해 주세요.');
    }finally{setReportConfirm(false);setBusy(false);}
  };
  const getComparison=async()=>{
    if(!port.getRevisionContext||!port.compareRevisions||busy||session.status!=='READY')return;
    setBusy(true);setComparison(null);setComparisonError('');
    try{
      const result=await port.session.runLatest('owner-reviewed-revisions',async signal=>{
        await current(signal);
        const ctx=await port.getRevisionContext!(rights.opportunityId,signal);
        const parsed=OwnerOpportunityRevisionComparisonRequestSchema.safeParse(ctx);
        // Context is the server-returned read-only availability projection,
        // not an arbitrary request supplied by the browser.
        void parsed;
        const context=await import('@hufs-one/contracts').then(m=>
          m.OpportunityRevisionComparisonContextResponseSchema.parse(ctx));
        if(!context.available)return null;
        const request={beforeRevisionId:context.beforeRevisionId,
          afterRevisionId:context.afterRevisionId,asOf:context.asOf};
        const raw=await port.compareRevisions!(rights.opportunityId,request,signal);
        await current(signal);
        return verifiedOwnerRevisionComparison(context,raw,rights);
      });
      if(result&&port.session.getState().status==='READY')setComparison(result);
      else if(port.session.getState().status==='READY')
        setComparisonError('두 판본 모두 현재 승인된 비교 근거를 확인하지 못했습니다. 이전/이후 사실을 추정하지 않습니다.');
    }finally{setBusy(false);}
  };
  return <section aria-label="공고의 출처 신고 및 검증 판본 변경">
    <h3>출처 신고·게시 철회·판본 변경 확인</h3>
    <p role="note">본인 BETA 계정의 출처·권한을 다시 검사한 뒤에만 표시합니다. 실제 게시 철회와 신고 처리는 서버의 승인 상태이며 화면에서 임의로 확정하지 않습니다.</p>
    {!port.getModerationStatus
      ?<p>현재 실제 신고/철회 상태 API가 연결되지 않았습니다. 내 신고를 접수했다고 표시하지 않습니다.</p>
      :<button type="button" disabled={busy} onClick={()=>{void getStatus();}}>
        현재 게시·내 신고 상태 새로고침</button>}
    {reportError&&<p role="alert">{reportError}</p>}
    {status&&<div role="status">
      <p>현재 상태: {STATUS[status.state]} · 서버 확인 {status.checkedAt}</p>
      {status.state==='UNDER_REVIEW'&&<p>내 신고 접수 {status.reportedAt} · 독립 검토 완료 전입니다.</p>}
      {status.state==='CLOSED_NO_CHANGE'&&<p>내 신고 접수 {status.reportedAt} · 변경 없음이 출처 전체의 정확성 보증은 아닙니다.</p>}
    </div>}
    {status?.state==='NOT_FILED'&&port.submitReport&&<div>
      <label htmlFor="career-opportunity-report">내가 신고할 이유</label>
      <select id="career-opportunity-report" value={reportReason} disabled={busy}
        onChange={e=>setReportReason(e.target.value as OwnerOpportunityReportReason)}>
        {Object.entries(REPORTS).map(([value,label])=><option value={value} key={value}>{label}</option>)}
      </select>
      <label><input type="checkbox" checked={reportConfirm} disabled={busy}
        onChange={e=>setReportConfirm(e.target.checked)}/>현재 기회의 출처 문제를 실제 검토 대상으로 신고합니다. 접수/철회·수정이 자동 확정되지는 않습니다.</label>
      <button type="button" disabled={busy||!reportConfirm} onClick={()=>{void submitReport();}}>
        현재 판본 신고 접수 요청</button>
    </div>}
    {!port.getRevisionContext||!port.compareRevisions
      ?<p>기관 검증 이전/이후 판본 비교 API가 연결되지 않았습니다. 임의의 변경 이력을 만들지 않습니다.</p>
      :<button type="button" disabled={busy} onClick={()=>{void getComparison();}}>
        현재 허용된 두 기관 판본의 변경 검증 (읽기 전용)</button>}
    {comparisonError&&<p role="note">{comparisonError}</p>}
    {comparison?.state==='NEEDS_REVIEW'&&<p role="note">
      두 원문 판본의 사람 검토가 완료되지 않았습니다. 변경 사실은 확정하지 않습니다 ({comparison.reason}).</p>}
    {comparison?.state==='READY'&&<section aria-label="독립 승인된 두 기관 판본의 변경 비교">
      <h4>사람 검수 완료 원문: 이전 {comparison.beforeRevisionId} / 이후 {comparison.afterRevisionId}</h4>
      <p>기준 시각 {comparison.asOf}. 검수된 조건만 비교하며 AI 해석이나 실제 지원 적격을 증명하지 않습니다.</p>
      <dl>{comparison.comparisons.map(field=><div key={field.field}>
        <dt>{FIELDS[field.field]}</dt>
        <dd>{STATES[field.state]}{field.state==='CHANGED'&&comparison.changes.some(c=>c.field===field.field)
          ?' · '+CHANGES[comparison.changes.find(c=>c.field===field.field)!.kind]:''}
          {field.state==='UNKNOWN'?' · 전/후 어느 한쪽의 근거 부족':''}</dd>
      </div>)}</dl>
      <p role="note">확인되지 않은 값은 미확인으로 유지하고, 변경 전후 근거가 없는 학적·채용 판정을 만들지 않습니다.</p>
    </section>}
  </section>;
}
