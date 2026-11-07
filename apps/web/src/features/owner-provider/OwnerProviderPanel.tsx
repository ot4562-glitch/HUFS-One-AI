import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {AI_TASK_PATHS,type AiTaskPath,type ApprovedProviderInput,
  type ProviderAccepted,type ProviderStoredJob,type OwnerProviderReceipt} from '@hufs-one/contracts';
import type {OwnerSessionController} from '../../app/owner-session-controller.js';
import '../local-accounts/localAccounts.css';
import {AiTaskResultView} from './AiTaskResultView.js';
import {verifiedCareerReceipt} from '../career/aiEvidence.js';

export interface OwnerProviderPort {
  readonly session:OwnerSessionController;
  list(signal?:AbortSignal):Promise<{items:ApprovedProviderInput[]}>;
  submit(input:ApprovedProviderInput,taskPath:AiTaskPath,key:string,signal?:AbortSignal):Promise<ProviderAccepted>;
  read(jobId:string,taskPath:AiTaskPath,signal?:AbortSignal):Promise<ProviderStoredJob>;
  /** Optional future #325 API. Absent means NO_MEASURED_RECEIPT; never fabricate it. */
  getReceipt?(jobId:string,signal?:AbortSignal):Promise<unknown>;
}
type Choice={entry:ApprovedProviderInput;taskPath:AiTaskPath};
type RecentJob={jobId:string;taskPath:AiTaskPath;operation:string;asOf:string;
  state:ProviderAccepted['state'];provenance:'LIVE'|'CANDIDATE_CACHE'|null};
const keyFor=(item:ApprovedProviderInput)=>item.operation+':'+item.inputRef;
function operationPath(item:ApprovedProviderInput):AiTaskPath|null{
  for(const key of Object.keys(AI_TASK_PATHS) as AiTaskPath[])
    if(AI_TASK_PATHS[key]===item.task)return key;
  return null;
}
/** Never manufacture an idempotency key from time/user content. On retries the
 * exact key is reused; a new key requires a separate explicit confirmation. */
function newKey():string|null{
  try{return globalThis.crypto.randomUUID().replaceAll('-','');}
  catch{return null;}
}
/** Fully owner-private input discovery → explicit submit → manual read.
 * No automatic provider runs/retries or polling; all raw candidate bytes remain
 * in memory only after current-session rights revalidation. */
export function OwnerProviderPanel({port}:{port:OwnerProviderPort}){
  const session=useSyncExternalStore(port.session.subscribe,port.session.getState,port.session.getState);
  const [items,setItems]=useState<ApprovedProviderInput[]|null>(null);
  const [selection,setSelection]=useState('');
  const [confirmation,setConfirmation]=useState(false);
  const [accepted,setAccepted]=useState<ProviderAccepted|null>(null);
  const [stored,setStored]=useState<ProviderStoredJob|null>(null);
  const [receipt,setReceipt]=useState<OwnerProviderReceipt|null>(null);
  const [receiptBusy,setReceiptBusy]=useState(false);
  // Only job identifiers issued during this verified owner session. Never persist input text,
  // student identity, provider candidate bytes or keys in browser storage.
  const [recentJobs,setRecentJobs]=useState<RecentJob[]>([]);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [manualJobId,setManualJobId]=useState('');
  const [manualTask,setManualTask]=useState<AiTaskPath>('experience-skills');
  const idempotency=useRef<string|null>(null);
  const submitLock=useRef(false);
  const selectionVersion=useRef(0);

  useEffect(()=>{void port.session.initialize();},[port]);
  useEffect(()=>{
    selectionVersion.current++;
    setItems(null);setSelection('');setConfirmation(false);
    setAccepted(null);setStored(null);setReceipt(null);setReceiptBusy(false);
    setRecentJobs([]);setNotice('');submitLock.current=false;
    setManualJobId('');setManualTask('experience-skills');idempotency.current=null;
    if(session.status!=='READY')return;
    let active=true;
    void port.session.runLatest('approved-ai-inputs',signal=>port.list(signal)).then(result=>{
      if(active&&result)setItems(result.items);
    });
    return ()=>{active=false;};
  },[port,session.epoch,session.status]);

  const selected=items?.find(i=>keyFor(i)===selection);
  const taskPath=selected?operationPath(selected):null;
  const canSubmit=!!selected&&!!taskPath&&Date.parse(selected.expiresAt)>Date.now();
  const validManualJob=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(manualJobId.trim());

  const read=async(jobId:string,path:AiTaskPath)=>{
    const version=selectionVersion.current;
    const job=await port.session.runLatest('provider-approved-result',signal=>port.read(jobId,path,signal));
    if(job&&version===selectionVersion.current&&port.session.getState().status==='READY'){
      setStored(job);setReceipt(null);
    }
  };
  const readActualReceipt=async()=>{
    if(!stored||!port.getReceipt||receiptBusy||busy||session.status!=='READY')return;
    const storedSnapshot=stored,version=selectionVersion.current;
    setReceipt(null);setReceiptBusy(true);
    try{
      const result=await port.session.runLatest('provider-private-receipt',async signal=>{
        const raw=await port.getReceipt!(storedSnapshot.jobId,signal);
        return verifiedCareerReceipt(raw,storedSnapshot,{
          jobId:storedSnapshot.jobId,task:storedSnapshot.candidate.task,
        });
      });
      if(result&&version===selectionVersion.current&&port.session.getState().status==='READY')
        setReceipt(result);
    }finally{setReceiptBusy(false);}
  };
  const submit=async()=>{
    if(submitLock.current||!selected||!taskPath||!canSubmit||busy||!confirmation||session.status!=='READY')return;
    const key=idempotency.current??newKey();
    if(!key){setNotice('안전한 요청 ID를 생성할 수 없습니다. 실행하지 않았습니다.');return;}
    submitLock.current=true;
    idempotency.current=key;setBusy(true);setNotice('');setStored(null);setReceipt(null);
    try{
      const response=await port.session.runMutation(signal=>port.submit(selected,taskPath,key,signal));
      if(!response||port.session.getState().status!=='READY')return;
      setAccepted(response);
      setRecentJobs(prev=>[{jobId:response.jobId,taskPath,operation:selected.operation,
        asOf:selected.asOf,state:response.state,
        provenance:response.state==='NEEDS_REVIEW'?response.provenance:null},
        ...prev.filter(j=>j.jobId!==response.jobId)].slice(0,5));
      if(response.state==='PENDING'){
        setNotice('아직 결과가 정산되지 않았습니다. 동일 요청 ID로만 수동 재확인할 수 있습니다.');
      }else{
        setNotice('독립 검토가 필요한 후보입니다. 승인·확정 결과가 아닙니다.');
        await read(response.jobId,taskPath);
      }
    }finally{submitLock.current=false;setBusy(false);}
  };
  if(session.status==='IDLE'||session.status==='CHECKING')return <p aria-busy="true">본인 권한 확인 중입니다.</p>;
  if(session.status!=='READY')return <p role="alert">
    현재 사용자 권한·동의·서버 연결을 확인하지 못했습니다. 기존 후보와 작업 내역을 표시하지 않습니다.
  </p>;

  return <section aria-label="승인된 Provider 후보 실행" className="local-account__panel">
    <p role="note">BETA 전용입니다. 서버에서 독립 검토·권리·동의가 확인된 입력만 표시합니다.
      AI 후보는 학업·지원·마감·졸업의 공식 판단이 아닙니다. 실제 Provider가 별도 활성화되어 있다면 비용이 발생할 수 있습니다.
      자동 호출·자동 재시도는 없습니다.</p>
    {items===null?<p aria-busy="true">현재 승인된 입력 목록을 확인 중입니다.</p>
      :items.length===0?<p role="status">실행 가능한 승인된 입력이 없습니다. 이 화면은 임의 입력을 받아 실행하지 않습니다.</p>
        :<fieldset>
          <legend>서버 검증된 입력 선택</legend>
          {items.map((item,index)=>{
            const value=keyFor(item);
            return <label key={value}><input type="radio" name="approved-ai-input"
              checked={selection===value} disabled={busy}
              onChange={()=>{
                selectionVersion.current++;
                setSelection(value);setConfirmation(false);setAccepted(null);
                setStored(null);setReceipt(null);setNotice('');idempotency.current=null;
              }}/>
            후보 {index+1} · {item.task} · 검토 시각 {item.asOf}
            </label>;
          })}
        </fieldset>}
    {selected&&<div>
      <p>선택된 작업: {selected.task} · 만료 시각 {selected.expiresAt}</p>
      <label>
        <input type="checkbox" checked={confirmation} disabled={busy||!canSubmit}
          onChange={e=>setConfirmation(e.target.checked)}/>
        이 실행은 별도 승인된 입력만 사용하며, 후보는 사람 검토 전 확정되지 않음을 확인했습니다.
      </label>
      <p><button type="button" disabled={!canSubmit||!confirmation||busy}
        onClick={()=>{void submit();}}>
        {accepted?.state==='PENDING'?'동일 요청으로 상태 재확인':'선택된 승인 입력 실행'}
      </button></p>
      {accepted?.state==='NEEDS_REVIEW'&&taskPath&&<button type="button" disabled={busy}
        onClick={()=>{void read(accepted.jobId,taskPath);}}>보존된 후보 다시 조회</button>}
      {accepted?.state==='NEEDS_REVIEW'&&<button type="button" disabled={busy}
        onClick={()=>{selectionVersion.current++;idempotency.current=null;setAccepted(null);setStored(null);setConfirmation(false);
          setNotice('새 실행은 다시 확인해야 합니다.');}}>새 실행 준비</button>}
    </div>}
    <section aria-label="이전 서버 발급 작업 다시 확인" className="local-account__panel">
      <h2>이전 발급 작업 직접 조회</h2>
      <p role="note">내가 받은 작업 UUID를 직접 입력하여 현재 권한으로 서버에서 다시 확인합니다. 같은 인증 세션·유효한 입력·미철회 동의·보존 기간을 모두 통과한 작업만 읽습니다. 신규 AI 호출·재과금은 하지 않습니다. ID는 브라우저 저장소에 보관하지 않습니다.</p>
      <label htmlFor="owner-provider-existing-job">내가 발급받은 작업 ID</label>
      <input id="owner-provider-existing-job" type="text" autoComplete="off" spellCheck={false} maxLength={36}
        value={manualJobId} onChange={e=>setManualJobId(e.target.value)} />
      <label htmlFor="owner-provider-existing-task">그때 실행한 작업 종류</label>
      <select id="owner-provider-existing-task" value={manualTask} onChange={e=>setManualTask(e.target.value as AiTaskPath)}>
        {(Object.keys(AI_TASK_PATHS) as AiTaskPath[]).map(path=><option key={path} value={path}>{AI_TASK_PATHS[path]}</option>)}
      </select>
      <button type="button" disabled={busy||!validManualJob}
        onClick={()=>{setStored(null);setReceipt(null);void read(manualJobId.trim(),manualTask);}}>이전 후보 ID 수동 재조회</button>
    </section>
    {recentJobs.length>0&&<section aria-label="이번 인증 세션에서 발급받은 AI 실행 ID">
      <h2>이번 세션의 직접 실행 기록 (최대 5건)</h2>
      <p role="note">현재 세션에서 직접 요청한 서버 발행 작업 ID만 표시합니다. 영구 실행 내역 전체 목록, 과금 영수증 원장, 실측 비용은 아닙니다. 로그아웃·계정 전환 시 목록이 삭제됩니다.</p>
      <ul>{recentJobs.map(job=><li key={job.jobId}>
        <p>작업 ID {job.jobId} · 모델 {job.operation} · 요청 기준 {job.asOf} · 상태 {job.state}
          {job.provenance==='LIVE'?' · 실제 실행 확인':job.provenance==='CANDIDATE_CACHE'?' · 이전 결과 재사용':' · 실행 결과 미확정'}</p>
        {job.state==='NEEDS_REVIEW'&&<button type="button" disabled={busy}
          onClick={()=>{setStored(null);setReceipt(null);void read(job.jobId,job.taskPath);}}>현재 권한으로 이 결과 수동 재조회</button>}
      </li>)}</ul>
    </section>}
    {accepted&&<section aria-label="Provider 작업 상태">
      <h2>AI 실행 모드·근거 확인</h2>
      <p role="note">{accepted.state==='PENDING'
        ? '실행 결과 대기 중 · 신규 실행이 완료됐다는 영수증이 아직 없습니다.'
        : accepted.provenance==='LIVE'
          ? 'LIVE_PROVIDER_RUN · 서버가 실제 공급자 처리를 확인한 작업입니다. 독립 사람 검토 전 후보입니다.'
          : 'CACHED_PREVIOUS_RUN · 과거에 처리한 후보의 캐시입니다. 새로운 호출·과금이 아닙니다.'}</p>
      <p>작업 ID: {accepted.jobId}</p>
      <p>상태: {accepted.state} {accepted.state==='NEEDS_REVIEW'?(' · '+accepted.provenance):' · 아직 결과 없음'}</p>
    </section>}
    {stored&&<section aria-label="현재 권한으로 재검증된 AI 후보">
      <h2>독립 사람 검토 필요 · NEEDS_REVIEW</h2>
      <p>원장 상태: {stored.billing} · 출처: {stored.provenance}</p>
      <p role="note">CACHED_PREVIOUS_RUN · 현재 권한으로 서버에서 재조회한 후보이며 이 조회를 신규 공급자 실행으로 세지 않습니다. SYNTHETIC 예시는 이 BETA 화면에서 실호출처럼 표시하지 않습니다.</p>
      <p>측정된 토큰 사용량: 입력 {stored.candidate.usage.promptTokens} / 출력 {stored.candidate.usage.completionTokens} / 합계 {stored.candidate.usage.totalTokens}. 실제 원화 비용·지연은 별도 서버 발행 영수증이 검증되기 전에는 표시하지 않습니다.</p>
      {!port.getReceipt?<p role="note">현재 서버는 별도 비공개 실측 영수증 조회를 제공하지 않습니다. 새로운 청구액·지연 시간·실행 증거를 임의 계산하지 않습니다.</p>
        :<button type="button" disabled={receiptBusy||busy}
          onClick={()=>{void readActualReceipt();}}>{receiptBusy?'영수증 확인 중':'현재 권한으로 실측 영수증 조회 (과금 없음)'}</button>}
      {receipt&&<section aria-label="권한 및 토큰 사용량이 검증된 비공개 영수증" role="region">
        <h3>서버가 확인한 실행 근거 · {receipt.mode}</h3>
        <p>작업 {receipt.jobId} · 서버 실행 {receipt.runId} · 공급자 {receipt.provider} · 모델 판본 {receipt.modelRevision}</p>
        <p>출처 판본 {receipt.sourceRevisionId} · 권리 판본 {receipt.rightsVersion} · 동의 {receipt.consentVersion}판 · 기준 {receipt.asOf}</p>
        <p>비민감 입력 해시 앞 12자리 {receipt.inputSha256.slice(0,12)}… · 영수증 유효기한 {receipt.expiresAt}</p>
        <p>실제 응답 지연: {receipt.metrics.measuredLatencyMs!==undefined?receipt.metrics.measuredLatencyMs+'ms':'NOT_MEASURED'}</p>
        <p>측정된 신규 비용: {receipt.mode==='CACHED_PREVIOUS_RUN'?'신규 과금 없음 (캐시 재생)'
          :receipt.billingState==='SETTLED'&&receipt.metrics.measuredCostKrw!==undefined
            ?receipt.metrics.measuredCostKrw+'원 (서버 원장 실측)':'NOT_MEASURED'}</p>
        <p role="note">이 내역은 학생 본인 전용 서버 영수증이며, 개인이 승인한 AI 후보·학교 공식 확인 또는 모델 정확도 검증을 뜻하지 않습니다.</p>
      </section>}
      {stored.candidate.result&&<AiTaskResultView result={stored.candidate.result}/>}
      <ul>{stored.candidate.citations.map((c,i)=><li key={c.sourceToken+':'+c.paragraphId+':'+i}>
        <strong>근거 {i+1} · {c.sourceToken} / {c.paragraphId}</strong> · {c.quote}
      </li>)}</ul>
      <p>인용은 현재 입력과 일치 여부만 재검사한 후보이며, 학교의 공식 사실·지원 가능 판정이 아닙니다.</p>
    </section>}
    {notice&&<p role="status">{notice}</p>}
  </section>;
}
