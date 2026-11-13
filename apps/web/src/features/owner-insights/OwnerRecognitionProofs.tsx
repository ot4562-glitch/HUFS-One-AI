import {useCallback,useEffect,useId,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import type {FeatureAdditions as V} from '@hufs-one/contracts';
import type {HufsOwnerApiClient} from '../../integrations/owner-api-client.js';
import type {OwnerInsightsPort} from './OwnerInsightsPanel.js';
import type {OwnerSessionController} from '../../app/owner-session-controller.js';
import {OwnerSessionFailure} from '../../app/OwnerSessionFailure.js';
export interface OwnerProofPort{
  cleanupSession:OwnerSessionController;
  read:HufsOwnerApiClient['getOwnerRecognitionProofs'];extract:HufsOwnerApiClient['extractOwnerRecognitionProof'];
  confirm:HufsOwnerApiClient['confirmOwnerRecognitionProof'];redact:HufsOwnerApiClient['redactOwnerRecognitionProof'];
  cleanup:HufsOwnerApiClient['cleanupOwnerRecognitionProof'];batch:HufsOwnerApiClient['requestOwnerRecognitionCleanup'];
}
type Page=Awaited<ReturnType<OwnerProofPort['read']>>;
type Ready=Extract<Page,{state:'READY'}>;
type Mutation=Awaited<ReturnType<OwnerProofPort['extract']>>;
type FieldName=Parameters<OwnerProofPort['confirm']>[2]['acceptedFieldNames'][number];
async function localRequest<T>(request:AbortController,signal:AbortSignal,perform:(signal:AbortSignal)=>Promise<T>){
  const aborted=()=>{if(request.signal.aborted){const error=new Error('Request aborted');error.name='AbortError';throw error;}};
  try{aborted();const result=await perform(AbortSignal.any([signal,request.signal]));aborted();return result;}
  catch(error){aborted();throw error;}
}
const time=(v:string)=>new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false});
const fieldNames:Record<string,string>={ISSUER:'발급기관 후보',PERIOD_START:'활동 시작일 후보',PERIOD_END:'활동 종료일 후보',
  ISSUED_ON:'발급일 후보',HOURS:'활동 시간 후보',AWARD_TITLE:'수상명 후보'};
const kindNames:Record<string,string>={CERTIFICATE:'수료 증빙 후보',PARTICIPATION_PROOF:'참여 증빙 후보',REPORT:'활동 보고서 후보',
  AWARD_PROOF:'수상 증빙 후보',OTHER:'기타 서류 후보',UNKNOWN:'문서 종류 확인 필요'};
const reasons:Record<string,string>={NOT_A_PROOF_DOCUMENT:'활동 증빙으로 분류하기 어려운 문서입니다.',KIND_UNCLEAR:'문서 종류가 불명확합니다.',
  LOW_OCR_CONFIDENCE:'문자 인식 신뢰가 낮습니다.',ISSUER_NOT_FOUND:'발급기관 후보를 찾지 못했습니다.',ISSUER_MISMATCH:'입력 기관과 발급기관이 다릅니다.',
  ISSUER_UNCERTAIN:'유사한 기관명이어서 추가 검토가 필요합니다.',PERIOD_NOT_FOUND:'활동 기간을 찾지 못했습니다.',PERIOD_MISMATCH:'입력 기간과 다릅니다.',
  MULTIPLE_PERIODS:'여러 활동 기간이 있어 추가 검토가 필요합니다.',ISSUED_BEFORE_END:'발급일이 활동 종료보다 빠릅니다.',
  CONTAINS_PERSONAL_DATA:'개인정보로 추정한 줄을 후보 필드에서 제외했습니다.',ISSUED_IN_FUTURE:'발급일이 미래여서 추가 검토가 필요합니다.'};
function lease(page:Ready){return Math.min(page.expiresAt?Date.parse(page.expiresAt):page.items.every(i=>i.state==='REDACTED')?Infinity:0,
  ...page.items.filter(i=>i.state==='CURRENT').map(i=>i.expiresAt?Date.parse(i.expiresAt):0));}
function useProofProvider(port:OwnerInsightsPort){const p=port.proofs;
  return useMemo(()=>p?{...p}:undefined,[p,p?.cleanupSession,p?.read,p?.extract,p?.confirm,p?.redact,p?.cleanup,p?.batch]);}
function InitialPreparation({report}:{report:V.RecognitionReportV2}){
  return <section><p className="muted">초기 활동 조회 시점의 준비 결과 · 현재 문서 검토 상태와 별도로 표시합니다.</p>
    <p>{report.status==='READY_FOR_OFFICIAL_REVIEW'?'본인 기록상 서류 준비 확인됨':report.status==='DOCUMENTS_PENDING'?`추가 확인할 서류 분류 ${report.missingKinds.length}개`:'현재 규정에 따른 준비 상태 확인 필요'} · 학교 공식 접수·인정 완료 아님</p>
    <p className="muted">활동 {report.activityId} · 규정 판본 {report.ruleRevisionId}</p></section>;
}
function CandidateFields({item,allowed,onConfirm}:{item:V.RecognitionProofItem;allowed:boolean;
  onConfirm:(names:FieldName[])=>void}){
  const [selected,setSelected]=useState<FieldName[]>([]),[mask,setMask]=useState(false);
  const review=item.review;if(!review||!('candidate' in review))return null;
  const pending=review.state==='NEEDS_REVIEW';
  return <section aria-label="추출 후보 검토">
    <p>{kindNames[review.candidate.proposedKind]} · 문서 {review.evidencePage+1}쪽</p>
    <p className="muted">후보 추출 시점 {time(review.asOf)} KST</p>
    <p>기본 가림 {review.candidate.maskedLineCount}줄 · 개인정보 추정 제외 {review.candidate.personalDataLineCount}줄</p>
    <p className="muted">원본 미리보기는 연결되지 않았습니다. 표시된 인용과 필드 가림 선택을 검토할 수 있습니다. 원본 파일의 익명화·진위 확인을 뜻하지 않습니다.</p>
    {review.candidate.flags.length>0&&<ul>{review.candidate.flags.map(flag=><li key={flag}>{reasons[flag]}</li>)}</ul>}
    {review.state==='OWNER_CONFIRMED_CANDIDATE'&&<p role="status">본인 확인 후보 · {review.heldForReview?'추가 검토 보류':'학교 공식 검토 전 준비 기록'} · 공식 인정 아님</p>}
    <fieldset className="owner-proof__fields"><legend>{pending?'수락 후 남길 필드':'본인이 선택해 남긴 필드'}</legend>
      {review.candidate.fields.map(field=><div key={field.name}>
        {pending?<label><input type="checkbox" checked={selected.includes(field.name)} onChange={event=>{
          const checked=event.currentTarget.checked;setMask(false);setSelected(previous=>checked?[...previous,field.name]:previous.filter(n=>n!==field.name));
        }}/>{fieldNames[field.name]}를 보관</label>:<strong>{fieldNames[field.name]}</strong>}
        {(!pending||selected.includes(field.name))&&<div className="owner-proof__quote"><p>{field.value}</p><p className="muted">인용: {field.quote} · {review.evidencePage+1}쪽</p></div>}
      </div>)}
      {!review.candidate.fields.length&&<p>표시할 후보 필드가 없습니다.</p>}
    </fieldset>
    {pending&&<><p>선택하지 않은 후보 필드는 수락 결과에서 제거합니다. 보류 사유는 필드를 가려도 유지합니다.</p>
      <label className="owner-proof__ack"><input type="checkbox" checked={mask} onChange={event=>setMask(event.currentTarget.checked)}/>
        표시된 후보와 필드 가림 선택을 검토했습니다</label>
      <button type="button" disabled={!mask||!allowed} onClick={()=>onConfirm(selected)}>선택한 후보 수락</button>
      {!allowed&&<p role="note">현재 규정에서 사용할 문서 종류를 확인할 수 없어 수락을 보류합니다.</p>}</>}
  </section>;
}
function ProofEditor({activityId,port,onBusyChange,initialReport,onWriteStart}:{activityId:string;port:OwnerInsightsPort;onBusyChange:(busy:boolean)=>void;
  initialReport:V.RecognitionReportV2|undefined;onWriteStart:()=>void}){
  const state=useSyncExternalStore(port.session.subscribe,port.session.getState,port.session.getState),provider=useProofProvider(port),lane=useId();
  const [loaded,setLoaded]=useState<{page:Page;provider:OwnerProofPort;session:OwnerInsightsPort['session'];epoch:number}|null>(null);
  const [busy,setBusy]=useState<'READ'|'WRITE'|null>(null),[message,setMessage]=useState(''),[selected,setSelected]=useState('');
  const [deadline,setDeadline]=useState(Infinity);
  const sequence=useRef(0),pending=useRef<AbortController|null>(null);
  const page=state.status==='READY'&&loaded?.epoch===state.epoch&&loaded.session===port.session&&loaded.provider===provider?loaded.page:null;
  const data=page?.state==='READY'&&page.activityId===activityId&&lease(page)>Date.now()?page:null;
  const read=useCallback(async(ticket:number,request:AbortController)=>{
    if(!provider)return false;
    const result=await port.session.runLatest('proof-page-'+lane,signal=>localRequest(request,signal,combined=>provider.read(activityId,combined)));
    if(ticket!==sequence.current||request.signal.aborted||port.session.getState().status!=='READY')return false;
    if(result){setLoaded({page:result,provider,session:port.session,epoch:state.epoch});setDeadline(result.state==='READY'?lease(result):Infinity);
      if(result.state==='READY')setSelected(previous=>result.items.some(i=>i.proofId===previous)?previous:result.items[0]?.proofId??'');return true;}
    setMessage('요청 결과를 확인하지 못했습니다. 저장 상태를 다시 읽어 주세요.');return false;
  },[provider,port.session,state.epoch,activityId,lane]);
  const load=useCallback(async()=>{
    if(!provider||state.status!=='READY')return;
    const ticket=++sequence.current;pending.current?.abort();const request=new AbortController();pending.current=request;
    setLoaded(null);setDeadline(Infinity);setMessage('');setBusy('READ');onBusyChange(true);
    try{await read(ticket,request);}finally{if(ticket===sequence.current){setBusy(null);onBusyChange(false);}}
  },[provider,state.status,read,onBusyChange]);
  useEffect(()=>{void load();return ()=>{sequence.current++;pending.current?.abort();onBusyChange(false);};},[load,onBusyChange]);
  useEffect(()=>{
    if(deadline===Infinity)return;let timer:ReturnType<typeof setTimeout>;
    const check=()=>{const remaining=deadline-Date.now();
      if(remaining>0){timer=setTimeout(check,Math.min(remaining,2_147_483_647));return;}
      sequence.current++;pending.current?.abort();setLoaded(null);setDeadline(Infinity);setBusy(null);onBusyChange(false);
      setMessage('확인 유효기한이 지났습니다. 문서·후보를 다시 읽어 저장 상태를 확인해 주세요.');
    };check();return ()=>clearTimeout(timer);
  },[deadline,onBusyChange]);
  const execute=async(action:(signal:AbortSignal)=>Promise<Mutation>)=>{
    if(!provider||busy||!data||state.status!=='READY'||lease(data)<=Date.now())return;
    const ticket=++sequence.current;pending.current?.abort();const request=new AbortController();pending.current=request;
    onWriteStart();setLoaded(null);setMessage('');setBusy('WRITE');onBusyChange(true);
    try{
      const result=await port.session.runMutation(signal=>localRequest(request,signal,action));
      if(ticket!==sequence.current||request.signal.aborted||port.session.getState().status!=='READY')return;
      if(result?.state==='NOT_CONNECTED'){setDeadline(Infinity);setLoaded({page:result,provider,session:port.session,epoch:state.epoch});return;}
      if(result?.state==='READY'){await read(ticket,request);}else setMessage('저장 결과를 확인하지 못했습니다. 문서·후보를 다시 읽어 주세요.');
    }finally{if(ticket===sequence.current){setBusy(null);onBusyChange(false);}}
  };
  const item=data?.items.find(i=>i.proofId===selected);
  const proposedKind=item?.review&&'candidate' in item.review?item.review.candidate.proposedKind:null;
  const allowed=!!data?.ocrAllowed&&!!data.preparation?.groups.some(g=>g.documents.some(d=>d.id===proposedKind));
  const cancel=()=>{sequence.current++;pending.current?.abort();setLoaded(null);setDeadline(Infinity);setBusy(null);onBusyChange(false);
    setMessage('요청 대기를 중단했습니다. 저장·삭제 여부는 문서·후보를 다시 읽어 확인해 주세요.');};
  const write=(action:'REJECT'|'WITHDRAW'|'REQUEST_DELETE')=>{
    if(!item||!provider)return;const scope=item.recordScopeVersion??item.contextVersion;if(!scope)return;
    void execute(signal=>provider.redact(activityId,item.proofId,{expectedVersion:item.version,scopeVersion:scope,action},signal));
  };
  return <section className="owner-proof" aria-label="본인 증빙 후보 관리">
    {busy&&<p role="status" aria-busy="true">{busy==='READ'?'현재 본인 문서·규정·정리 상태를 읽고 있습니다.':'요청을 처리하고 저장 상태를 다시 확인하고 있습니다.'}</p>}
    {busy&&<button type="button" onClick={cancel}>요청 대기 중단</button>}
    {page?.state==='NOT_CONNECTED'&&<p role="status">NOT_CONNECTED — 본인 문서·OCR 후보 공급자가 연결되지 않았습니다.</p>}
    {page?.state==='NOT_CONNECTED'&&initialReport&&<InitialPreparation report={initialReport}/>}
    {data&&<><p className="muted">문서 조회 {time(data.asOf)} KST · 규정 판본 {data.ruleRevisionId??'확인 불가'}</p>
      {Number.isFinite(lease(data))&&<p className="muted">이 화면 확인 기한 {time(new Date(lease(data)).toISOString())} KST</p>}
      {data.ruleState!=='CURRENT'&&<p role="status">현행 규정이 확인되지 않아 추출·수락을 보류합니다. 본인 문서 정리는 요청할 수 있습니다.</p>}
      {!data.ocrAllowed&&<p role="status">현재 OCR 이용권이 확인되지 않았습니다. 허가된 기존 수동 증빙은 별도로 준비 상태에 반영합니다.</p>}
      {data.preparation&&<p>{data.preparation.status==='READY_FOR_OFFICIAL_REVIEW'?'본인 기록상 서류 준비 확인됨':data.preparation.status==='DOCUMENTS_PENDING'
        ?`추가 확인할 서류 분류 ${data.preparation.missingKinds.length}개`:'현재 규정에 따른 준비 상태 확인 필요'} · 학교 공식 접수·인정 완료 아님</p>}
      {!data.items.length?<p role="status">현재 확인할 수 있는 본인 문서가 없습니다. 비공개 파일 공급자 연결 상태를 확인해 주세요.</p>:<>
        <label className="owner-guide__language">확인할 문서<select value={selected} onChange={event=>setSelected(event.target.value)}>
          {data.items.map((i,index)=><option key={i.proofId} value={i.proofId}>문서 {index+1} · {i.assetVersion}</option>)}
        </select></label>
        {item&&<section key={item.proofId+':'+item.version}><p className="muted">파일 판본 {item.assetVersion} · 본인 기록 버전 {item.version}</p>
          {(item.state==='AVAILABLE'||item.state==='STALE')&&<><p role="status">{item.state==='STALE'?'판본·권한·기간이 바뀌어 이전 후보를 숨겼습니다.':'아직 추출한 후보가 없습니다.'}</p>
            <button type="button" disabled={!data.ocrAllowed||!item.contextVersion} onClick={()=>{
              if(provider&&item.contextVersion)void execute(signal=>provider.extract(activityId,item.assetId,{expectedVersion:item.version,contextVersion:item.contextVersion!},signal));
            }}>현재 권한으로 후보 추출</button></>}
          {item.state==='CURRENT'&&<CandidateFields item={item} allowed={allowed}
            onConfirm={names=>{if(provider&&item.contextVersion)void execute(signal=>provider.confirm(activityId,item.proofId,{expectedVersion:item.version,contextVersion:item.contextVersion!,
              maskingConfirmed:true,acceptedFieldNames:names},signal));}}/>}
          {item.state==='REDACTED'&&item.review&&'cleanupState' in item.review&&<>
            <p role="status">{item.review.state==='DELETED'?'외부 삭제 확인됨':item.review.state==='WITHDRAWN'?'본인 문서 철회 요청됨':item.review.state==='DELETION_PENDING'?'본인 문서 삭제 요청됨':'후보 거부됨'}</p>
            <p role="status">{item.review.cleanupState==='PENDING'?'외부 원본·파생물 정리 확인 대기':'외부 정리 확인됨'}</p>
            {item.review.cleanupState==='PENDING'&&<button type="button" onClick={()=>{if(provider&&item.recordScopeVersion)void execute(signal=>provider.cleanup(activityId,item.proofId,
              {expectedVersion:item.version,scopeVersion:item.recordScopeVersion!},signal));}}>외부 정리 상태 확인</button>}
          </>}
          <div className="owner-guide__actions">
            {item.state==='CURRENT'&&item.review?.state==='NEEDS_REVIEW'&&<button type="button" onClick={()=>write('REJECT')}>후보 거부</button>}
            {item.review?.state!=='DELETED'&&item.review?.state!=='DELETION_PENDING'&&<>
              {item.review?.state!=='WITHDRAWN'&&<button type="button" onClick={()=>write('WITHDRAW')}>본인 문서 철회</button>}
              <button type="button" onClick={()=>write('REQUEST_DELETE')}>본인 문서 삭제 요청</button>
            </>}
          </div>
        </section>}
      </>}
    </>}
    <button type="button" disabled={busy!==null} onClick={()=>void load()}>문서·후보 다시 읽기</button>
    {message&&<p role="status">{message}</p>}
  </section>;
}
export function OwnerRecognitionProofs({reports,port,onBusyChange}:{reports:readonly V.RecognitionReportV2[];port:OwnerInsightsPort;onBusyChange:(busy:boolean)=>void}){
  const [activity,setActivity]=useState(reports[0]?.activityId??''),[busy,setBusy]=useState(false),[written,setWritten]=useState(false);
  const changed=useCallback((value:boolean)=>{setBusy(value);onBusyChange(value);},[onBusyChange]);
  const wrote=useCallback(()=>setWritten(true),[]);
  if(!port.proofs)return <section><p role="status">NOT_CONNECTED — 본인 문서 검토·정리 연결이 없습니다.</p>
    {!written&&reports.map(r=><InitialPreparation key={r.activityId} report={r}/>)}</section>;
  if(!reports.length)return <p role="status">현재 권한으로 확인할 활동이 없습니다.</p>;
  return <section><p>선택한 후보는 본인의 준비 기록입니다. 학교 공식 접수·인정이나 모델 입력 허가가 아닙니다.</p>
    <label className="owner-guide__language">확인할 활동<select value={activity} disabled={busy} onChange={event=>setActivity(event.target.value)}>
      {reports.map((r,index)=><option key={r.activityId} value={r.activityId}>활동 {index+1} · {r.activityId}</option>)}</select></label>
    <ProofEditor key={activity} activityId={activity} port={port} onBusyChange={changed} initialReport={written?undefined:reports.find(r=>r.activityId===activity)} onWriteStart={wrote}/>
  </section>;
}
export function OwnerProofCleanupBatch({port,disabled,onBusyChange,onStart}:{port:OwnerInsightsPort;disabled:boolean;
  onBusyChange:(busy:boolean)=>void;onStart:()=>void}){
  const provider=useProofProvider(port),session=provider?.cleanupSession??port.session;
  const state=useSyncExternalStore(session.subscribe,session.getState,session.getState);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');const sequence=useRef(0),pending=useRef<AbortController|null>(null);
  useEffect(()=>{void session.initialize();},[session]);
  useEffect(()=>{sequence.current++;pending.current?.abort();setBusy(false);setMessage('');onBusyChange(false);
    return ()=>{sequence.current++;pending.current?.abort();onBusyChange(false);};},[provider,session,state.epoch,state.status,onBusyChange]);
  if(!provider)return null;
  if(state.status==='IDLE'||state.status==='CHECKING')return <p role="status">정리 전용 본인 인증 확인 중입니다.</p>;
  if(state.status!=='READY')return <OwnerSessionFailure controller={session}>정리 전용 본인 권한을 확인하지 못했습니다. 개인 자료는 표시하지 않습니다.</OwnerSessionFailure>;
  const run=async()=>{
    if(busy||disabled||state.status!=='READY')return;const ticket=++sequence.current,request=new AbortController();pending.current=request;
    onStart();setBusy(true);onBusyChange(true);setMessage('');
    try{const result=await session.runMutation(signal=>localRequest(request,signal,combined=>provider.batch(combined)));
      if(ticket!==sequence.current||request.signal.aborted||session.getState().status!=='READY')return;
      setMessage(result?.state==='READY'?`정리 확인 ${result.acknowledged}건 · 확인하지 못한 작업 ${result.failed}건. ${result.attempted===0?'이번 조회에서 대기 작업을 찾지 못했습니다.':'이번 요청은 한 건까지 확인합니다.'}`
        :result?.state==='NOT_CONNECTED'?'NOT_CONNECTED — 외부 정리 공급자가 연결되지 않았습니다.':'정리 결과를 확인하지 못했습니다. 다시 확인해 주세요.');
    }finally{if(ticket===sequence.current){setBusy(false);onBusyChange(false);}}
  };
  return <section className="owner-proof" aria-label="저장 동의 철회 후 정리"><p>개인 저장 동의를 철회한 뒤 남은 원본·파생물 정리를 한 건씩 확인할 수 있습니다.</p>
    <button type="button" disabled={busy||disabled} onClick={()=>void run()}>남은 정리 작업 한 건 확인</button>
    {busy&&<button type="button" onClick={()=>{sequence.current++;pending.current?.abort();setBusy(false);onBusyChange(false);
      setMessage('정리 대기를 중단했습니다. 다음 확인으로 처리 상태를 다시 조회해 주세요.');}}>정리 대기 중단</button>}{message&&<p role="status">{message}</p>}
  </section>;
}
