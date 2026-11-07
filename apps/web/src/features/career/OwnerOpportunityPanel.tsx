import {useEffect,useState,useSyncExternalStore} from 'react';
import type {OpportunityCatalogDetail,OpportunityExplanationResponse,OwnerOpportunityAiProof} from '@hufs-one/contracts';
import type {OwnerCareerPort} from './OwnerCareerPanel.js';
import {InAppLink} from '../../shell/AppShell.js';
import {attachDemoResumeRevalidation} from '../../app/resume-listener.js';
import {attachCrossTabSessionClosure,SESSION_CLOSE_CHANNEL} from '../../app/session-broadcast.js';
import {assertCareerConsentCurrent,requireCareerConsent} from './careerConsent.js';
import {verifiedCareerAiComparison} from './aiEvidence.js';

/** Optional #325 server-verified, currently authorized comparison projection.
 * No endpoint is guessed and missing capability is an explicit NOT_RUN state. */
type AiComparisonPort=OwnerCareerPort & {getOpportunityAiProof?: (
  id:string,query:{asOf:string;sourceRevisionId:string;feedVersion:string;consentVersion:number},
  signal?:AbortSignal)=>Promise<unknown>};

/**
 * Owner-only, authorized catalog detail. A bare URL never grants access; the
 * BETA session and server source/rights checks precede every read.
 */
export function OwnerOpportunityPanel({port,id,navigate}:{
  port:OwnerCareerPort;id:string;navigate:(path:string)=>void;
}){
  const session=useSyncExternalStore(port.session.subscribe,port.session.getState,port.session.getState);
  const [detail,setDetail]=useState<OpportunityCatalogDetail|null>(null);
  const [error,setError]=useState('');
  const [ruleExplanation,setRuleExplanation]=useState<OpportunityExplanationResponse|null>(null);
  const [ruleStatus,setRuleStatus]=useState<'LOADING'|'NOT_SHOWN'|'UNAVAILABLE'|'READY'>('LOADING');
  const [aiComparison,setAiComparison]=useState<OwnerOpportunityAiProof|null>(null);
  const [aiCompareStatus,setAiCompareStatus]=useState<'IDLE'|'CHECKING'|'UNAVAILABLE'|'READY'>('IDLE');
  const proofPort=port as AiComparisonPort;
  useEffect(()=>{setAiComparison(null);setAiCompareStatus('IDLE');},[id,detail,session.epoch,session.status]);
  useEffect(()=>{void port.session.initialize();},[port]);
  useEffect(()=>attachDemoResumeRevalidation(port.session,{page:document,view:window}),[port.session]);
  useEffect(()=>{
    if(typeof BroadcastChannel==='undefined')return;
    const channel=new BroadcastChannel(SESSION_CLOSE_CHANNEL);
    const dispose=attachCrossTabSessionClosure(port.session,channel);
    return ()=>{dispose();channel.close();};
  },[port.session]);
  useEffect(()=>{
    setDetail(null);setError('');
    if(session.status!=='READY')return;
    let active=true;
    void port.session.runLatest('owner-career-opportunity',s=>port.getOpportunity(id,s))
      .then(value=>{if(active&&value&&port.session.getState().status==='READY')setDetail(value);})
      .catch(()=>{if(active)setError('현재 계정에서 확인할 수 없거나 공개가 허용되지 않은 기회입니다.');});
    return ()=>{active=false;};
  },[port,id,session.epoch,session.status]);
  useEffect(()=>{
    setRuleExplanation(null);setRuleStatus('LOADING');
    if(session.status!=='READY'||!detail)return;
    let active=true;
    void port.session.runLatest('owner-career-rules',async signal=>{
      const feed=await port.getOwnerFeed(signal);
      const cards=[...feed.feed.featured,...feed.feed.compact,...(feed.feed.ineligible??[])];
      if(!cards.some(c=>c.opportunityId===id))return {kind:'NOT_SHOWN' as const};
      const explanation=await port.explainOpportunity(id,{
        asOf:feed.feed.asOf,sourceRevisionId:detail.source.revisionId,
        rankConfigVersion:feed.rankConfigVersion,expectedFeedVersion:feed.version,
      },signal);
      return {kind:'READY' as const,explanation};
    }).then(value=>{
      if(!active||!value||port.session.getState().status!=='READY')return;
      if(value.kind==='READY'){setRuleExplanation(value.explanation);setRuleStatus('READY');}
      else setRuleStatus('NOT_SHOWN');
    }).catch(()=>{if(active){setRuleExplanation(null);setRuleStatus('UNAVAILABLE');}});
    return ()=>{active=false;};
  },[port,id,detail,session.status,session.epoch]);
  const compareAuthorizedAi=async()=>{
    if(session.status!=='READY'||aiCompareStatus==='CHECKING'||!detail||!proofPort.getOpportunityAiProof)return;
    setAiComparison(null);setAiCompareStatus('CHECKING');
    const epoch=session.epoch;
    const proof=await port.session.runLatest('owner-career-ai-explain-proof',async signal=>{
      const before=requireCareerConsent((await port.getConsents(signal)).consents);
      const latest=await port.getOpportunity(id,signal);
      if(latest.opportunity.dataMode!=='REAL'||latest.source.status!=='ACTIVE'||!latest.source.verifiedAt
        ||latest.source.permissionRef!==detail.source.permissionRef
        ||latest.source.revisionId!==detail.source.revisionId
        ||latest.opportunity.version!==detail.opportunity.version)
        throw new Error('Source rights changed; AI comparison denied');
      const feed=await port.getOwnerFeed(signal);
      const visible=[...feed.feed.featured,...feed.feed.compact,...(feed.feed.ineligible??[])];
      if(!visible.some(card=>card.opportunityId===id&&card.dataMode==='REAL'))
        throw new Error('Opportunity not in current visible owner feed');
      const rule=await port.explainOpportunity(id,{
        asOf:feed.feed.asOf,sourceRevisionId:latest.source.revisionId,
        rankConfigVersion:feed.rankConfigVersion,expectedFeedVersion:feed.version,
      },signal);
      const candidate=await proofPort.getOpportunityAiProof!(id,{
        asOf:feed.feed.asOf,sourceRevisionId:latest.source.revisionId,
        feedVersion:feed.version,consentVersion:before.version,
      },signal);
      const after=requireCareerConsent((await port.getConsents(signal)).consents);
      assertCareerConsentCurrent(before,after,before.version);
      return verifiedCareerAiComparison(candidate,rule,{
        opportunityId:id,sourceRevisionId:latest.source.revisionId,
        permissionRef:latest.source.permissionRef,rankConfigVersion:feed.rankConfigVersion,
        feedVersion:feed.version,consentVersion:after.version,asOf:feed.feed.asOf,
        sourceVerified:true,
      });
    });
    if(port.session.getState().status!=='READY'||port.session.getState().epoch!==epoch)return;
    if(proof){setAiComparison(proof);setAiCompareStatus('READY');}
    else setAiCompareStatus('UNAVAILABLE');
  };
  if(session.status==='IDLE'||session.status==='CHECKING')return <p aria-busy="true">기회 자료의 권한을 확인 중입니다.</p>;
  if(session.status!=='READY')return <p role="alert">본인 계정의 권한을 확인할 수 없어 상세 자료를 표시하지 않습니다.</p>;
  if(!detail)return <p role={error?'alert':undefined} aria-busy={!error}>{error||'출처·권리를 확인한 기회를 불러오는 중입니다.'}</p>;
  const {opportunity:op,source}=detail;
  const verified=op.dataMode==='REAL'&&source.status==='ACTIVE'&&!!source.verifiedAt;
  return <section aria-label="확인된 본인 기회 정보">
    <p role="note">{verified?'실제 출처의 판본·권한이 확인된 자료입니다.':'가상 시연 자료입니다. 실제 기관 모집·지원 인증이 아닙니다.'}
      학교 공식 확정·적격·채용 합격 여부를 뜻하지 않습니다.</p>
    <h2>{op.title}</h2>
    <dl className="facts">
      <dt>모집 주체</dt><dd>{op.organization}</dd>
      <dt>활동 범위</dt><dd>{op.programScope==='ON_CAMPUS'?'교내':op.programScope==='OFF_CAMPUS'?'교외':'확인 필요'}</dd>
      <dt>원문 판본</dt><dd>{source.revisionId}</dd>
      <dt>출처 상태</dt><dd>{source.status==='ACTIVE'?'출처 검증':'합성'}</dd>
      <dt>마감</dt><dd>{op.applyClosesAt??'마감일 확인 필요'}</dd>
      <dt>지원 경로</dt><dd>{op.actualApplicationRoute==='DEMO_DISABLED'?'실제 지원 불가':op.actualApplicationRoute==='UNKNOWN'?'확인 필요':'공식 원문에서 별도 확인 필요'}</dd>
    </dl>
    <section aria-labelledby="org-website-heading">
      <h3 id="org-website-heading">기관 홈페이지 / 공고 원문 / 신청 경로</h3>
      {op.organizationHomepage && verified
        ? <p>기관 홈페이지: <a href={op.organizationHomepage} rel="noopener noreferrer nofollow" target="_blank">{op.organizationHomepage}</a> (별도 출처 확인)</p>
        : <p>확인된 기관 홈페이지 링크가 없습니다. 임의의 실제 사이트를 생성하지 않았습니다.</p>}
      <p>모집 공고 원문: 출처 {source.sourceId} · 판본 {source.revisionId}. 현 응답에는 승인된 원문 링크가 없으므로 임의의 URL로 연결하지 않습니다.</p>
      <p>신청 경로: {op.applicationUrlRef?'신청 링크 참조가 있으나 현재 응답에서 안전한 실제 URL이 확인되지 않았습니다.':'현재 제공된 신청 링크가 없습니다.'} 외부 사이트로 자동 지원하지 않습니다.</p>
    </section>
    <section aria-labelledby="rule-ai-heading">
      <h3 id="rule-ai-heading">규칙 기준 설명 vs AI 해석</h3>
      <p>규칙 근거: 등록된 지원 조건 {op.conditions.length}건 · 원문/현재 학업 확인 필요. 이 화면은 지원 자격을 임의로 확정하지 않습니다.</p>
      {ruleStatus==='LOADING'?<p aria-busy="true">현재 추천 설정·본인 권한을 다시 검사하고 있습니다.</p>
        :ruleStatus==='NOT_SHOWN'?<p>현재 본인 추천 목록에서 이 항목을 평가했다고 확인할 수 없습니다. 숨겨진 점수·조건을 추정하지 않습니다.</p>
        :ruleStatus==='UNAVAILABLE'?<p>현재 판본·권한으로 재검증한 규칙 설명을 받을 수 없습니다. 오래된 설명은 표시하지 않았습니다.</p>
        :ruleExplanation?<div role="status">
          <p>현재 서버 규칙 평가: {ruleExplanation.state==='FEATURED'?'주요 추천에 표시됨':`주요 추천 제외 · ${ruleExplanation.reason}`}</p>
          <p>판본: {ruleExplanation.sourceRevisionId} · 규칙 설정 {ruleExplanation.rankConfigVersion} · 기준시각 {ruleExplanation.asOf}</p>
          <p>확인된 근거 참조 {ruleExplanation.evidenceRefs.length}개. 보이지 않는 학생 자료·미공개 항목의 근거는 제공하지 않습니다.</p>
          {ruleExplanation.state==='NOT_FEATURED'&&ruleExplanation.notes.includes('ELIGIBILITY_UNKNOWN')&&<p>지원 자격 확인 필요는 지원 불가 확정이 아닙니다.</p>}
        </div>:null}
      {!proofPort.getOpportunityAiProof?<p role="note">AI 해석 미연결 · 현재 서버에 동일 권한·판본에 묶인 AI 후보 조회 API가 없어 전후 차이를 구성하지 않습니다.</p>
        :!verified?<p role="note">AI 해석 비교 불가 · 실제 승인된 기관 출처와 현재 사용권이 있는 경우에만 조회합니다.</p>
        :ruleStatus!=='READY'?<p role="note">AI 근거 비교 보류 · 현재 규칙 설명이 검증될 때만 조회합니다.</p>
        :<button type="button" disabled={aiCompareStatus==='CHECKING'}
          onClick={()=>{void compareAuthorizedAi();}}>현재 권한·판본으로 AI 후보 비교 조회 (새 실행 없음)</button>}
      {aiCompareStatus==='CHECKING'&&<p role="status">현재 계정·자료 이용권·동의·추천 판본과 AI 인용을 재검증하는 중입니다.</p>}
      {aiCompareStatus==='UNAVAILABLE'&&<p role="alert">일치하는 AI 후보/규칙 근거가 없거나 권한·동의가 변경됐습니다. 미검증 AI 설명은 표시하지 않습니다.</p>}
      {aiComparison&&aiCompareStatus==='READY'&&<section aria-label="동일 출처 판본의 AI 해석 후보" role="region">
        <h4>AI 해석 후보 · NEEDS_REVIEW (학교·고용 적격 확정 아님)</h4>
        <p>공급자 {aiComparison.provider} · 모델 판본 {aiComparison.modelRevision} · 후보 작업 {aiComparison.jobId}</p>
        <p>출처 판본 {aiComparison.sourceRevisionId} · AI 기준시각 {aiComparison.asOf} · {aiComparison.mode==='CACHED_PREVIOUS_RUN'?'기존 작업 재조회, 신규 과금 아님':'서버가 확인한 실제 공급자 실행'}</p>
        <p>규칙 근거(현재 권한 재확인)와 겹치는 인용 {aiComparison.evidenceRefs.length}건으로 설명된 AI 해석: {aiComparison.interpretation}</p>
        {aiComparison.caveats.length>0&&<ul>{aiComparison.caveats.map((c,i)=><li key={i}>{c}</li>)}</ul>}
        <p role="note">규칙 계산과 AI 해석이 다를 수 있으나 AI 출력은 권고·검토 후보이며, 정확도·자격 판정·공식 승인으로 바꾸지 않습니다.</p>
      </section>}
      <p>규칙과 AI는 동일 권한·출처/판본·추천 설정·시점·인용이 모두 일치할 때만 나란히 볼 수 있습니다. 검증 실패 시 UI는 결과를 숨깁니다.</p>
    </section>
    <p><InAppLink to="/career" navigate={navigate}>내 비공개 포트폴리오로 돌아가기</InAppLink></p>
  </section>;
}
