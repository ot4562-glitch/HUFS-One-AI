import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {AI_TASK_PATHS,type AiTaskPath,type ApprovedProviderInput,
  type ProviderAccepted,type ProviderStoredJob} from '@hufs-one/contracts';
import type {OwnerSessionController} from '../../app/owner-session-controller.js';
import '../local-accounts/localAccounts.css';
import {AiTaskResultView} from './AiTaskResultView.js';

export interface OwnerProviderPort {
  readonly session:OwnerSessionController;
  list(signal?:AbortSignal):Promise<{items:ApprovedProviderInput[]}>;
  submit(input:ApprovedProviderInput,taskPath:AiTaskPath,key:string,signal?:AbortSignal):Promise<ProviderAccepted>;
  read(jobId:string,taskPath:AiTaskPath,signal?:AbortSignal):Promise<ProviderStoredJob>;
}
type Choice={entry:ApprovedProviderInput;taskPath:AiTaskPath};
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
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const idempotency=useRef<string|null>(null);
  const selectionVersion=useRef(0);

  useEffect(()=>{void port.session.initialize();},[port]);
  useEffect(()=>{
    selectionVersion.current++;
    setItems(null);setSelection('');setConfirmation(false);
    setAccepted(null);setStored(null);setNotice('');idempotency.current=null;
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

  const read=async(jobId:string,path:AiTaskPath)=>{
    const version=selectionVersion.current;
    const job=await port.session.runLatest('provider-approved-result',signal=>port.read(jobId,path,signal));
    if(job&&version===selectionVersion.current&&port.session.getState().status==='READY')setStored(job);
  };
  const submit=async()=>{
    if(!selected||!taskPath||!canSubmit||busy||!confirmation||session.status!=='READY')return;
    const key=idempotency.current??newKey();
    if(!key){setNotice('안전한 요청 ID를 생성할 수 없습니다. 실행하지 않았습니다.');return;}
    idempotency.current=key;setBusy(true);setNotice('');setStored(null);
    try{
      const response=await port.session.runMutation(signal=>port.submit(selected,taskPath,key,signal));
      if(!response||port.session.getState().status!=='READY')return;
      setAccepted(response);
      if(response.state==='PENDING'){
        setNotice('아직 결과가 정산되지 않았습니다. 동일 요청 ID로만 수동 재확인할 수 있습니다.');
      }else{
        setNotice('독립 검토가 필요한 후보입니다. 승인·확정 결과가 아닙니다.');
        await read(response.jobId,taskPath);
      }
    }finally{setBusy(false);}
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
                setStored(null);setNotice('');idempotency.current=null;
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
    {accepted&&<section aria-label="Provider 작업 상태">
      <p>작업 ID: {accepted.jobId}</p>
      <p>상태: {accepted.state} {accepted.state==='NEEDS_REVIEW'?(' · '+accepted.provenance):' · 아직 결과 없음'}</p>
    </section>}
    {stored&&<section aria-label="현재 권한으로 재검증된 AI 후보">
      <h2>독립 사람 검토 필요 · NEEDS_REVIEW</h2>
      <p>원장 상태: {stored.billing} · 출처: {stored.provenance}</p>
      {stored.candidate.result&&<AiTaskResultView result={stored.candidate.result}/>}
      <ul>{stored.candidate.citations.map((c,i)=><li key={c.sourceToken+':'+c.paragraphId+':'+i}>
        <strong>근거 {i+1} · {c.sourceToken} / {c.paragraphId}</strong> · {c.quote}
      </li>)}</ul>
      <p>인용은 현재 입력과 일치 여부만 재검사한 후보이며, 학교의 공식 사실·지원 가능 판정이 아닙니다.</p>
    </section>}
    {notice&&<p role="status">{notice}</p>}
  </section>;
}
