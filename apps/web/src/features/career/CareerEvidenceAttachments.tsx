import {useEffect,useState,useSyncExternalStore,type FormEvent} from 'react';
import {
  CareerAssetPageSchema,CareerAssetPolicySchema,CareerAssetReceiptSchema,
  type CareerAssetPage,type CareerAssetPolicy,type OwnerWorkspaceRecord,
} from '@hufs-one/contracts';
import type {OwnerSessionController} from '../../app/owner-session-controller.js';

/** Only #325's authenticated owner-storage adapter can supply these calls.
 * Absent adapter means NO UPLOAD, never browser-local/external URL fallback. */
export interface CareerEvidenceAssetPort {
  list(record:OwnerWorkspaceRecord,signal?:AbortSignal):Promise<unknown>;
  upload(record:OwnerWorkspaceRecord,policy:CareerAssetPolicy,file:File,signal?:AbortSignal):Promise<unknown>;
  remove(record:OwnerWorkspaceRecord,policy:CareerAssetPolicy,assetId:string,signal?:AbortSignal):Promise<unknown>;
}
function checkedPage(raw:unknown,record:OwnerWorkspaceRecord):CareerAssetPage{
  const page=CareerAssetPageSchema.parse(raw);
  if(page.experienceId!==record.itemId||page.contentVersion!==record.version)
    throw new Error('Asset list identity/version mismatch');
  return page;
}
function allowed(page:CareerAssetPage,file:File):boolean{
  const p=page.policy;
  return p.state==='ALLOWED'&&Date.parse(p.expiresAt)>Date.now()
    &&p.allowedMimeTypes.includes(file.type as 'image/png'|'image/jpeg'|'application/pdf')
    &&file.size>0&&file.size<=p.maxFileBytes&&page.items.length<10;
}
export function CareerEvidenceAttachments({record,session,port}:{
  record:OwnerWorkspaceRecord;session:OwnerSessionController;port?:CareerEvidenceAssetPort;
}){
  const state=useSyncExternalStore(session.subscribe,session.getState,session.getState);
  const [page,setPage]=useState<CareerAssetPage|null>(null);
  const [tick,setTick]=useState(0);
  const [busy,setBusy]=useState(false);
  const [selected,setSelected]=useState<File|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    setPage(null);setSelected(null);setError('');
    if(!port||state.status!=='READY'||record.value.kind!=='EXPERIENCE'
      ||record.value.dataMode!=='OWNER_CONSENTED')return;
    let active=true;
    void session.runLatest('career-private-attachment',async signal=>
      checkedPage(await port.list(record,signal),record))
      .then(data=>{if(active&&session.getState().status==='READY')setPage(data);})
      .catch(()=>{if(active)setError('현재 본인 권리·파일 판본을 확인하지 못했습니다.');});
    return ()=>{active=false;};
  },[session,port,record.itemId,record.version,record.value.kind,record.value.dataMode,state.status,state.epoch,tick]);
  const execute=async(fn:(signal:AbortSignal)=>Promise<unknown>)=>{
    if(busy||state.status!=='READY'||!page||page.policy.state!=='ALLOWED')return;
    setBusy(true);setError('');
    try{
      const receipt=await session.runMutation(fn);
      if(receipt&&session.getState().status==='READY'){
        setSelected(null);setPage(null);setTick(v=>v+1);
      }else if(session.getState().status==='READY'){
        setError('현재 권한/판본에서 변경 결과를 확인하지 못했습니다.');
      }
    }catch{setError('저장 또는 삭제에 실패했습니다. 현재 자료 이용권·판본을 확인해 주세요.');}
    finally{setBusy(false);}
  };
  const onUpload=(event:FormEvent)=>{
    event.preventDefault();
    if(!selected||!port||!page||!allowed(page,selected)){
      setError('파일 형식/크기/허가 기간/최대 10건을 확인해 주세요. 업로드하지 않았습니다.');
      return;
    }
    const policy=CareerAssetPolicySchema.parse(page.policy),file=selected;
    void execute(async signal=>{
      const result=CareerAssetReceiptSchema.parse(await port.upload(record,policy,file,signal));
      if(result.experienceId!==record.itemId||result.contentVersion!==record.version
        ||policy.state!=='ALLOWED'||result.sourceRightsVersion!==policy.sourceRightsVersion
        ||result.mimeType!==file.type||result.size!==file.size)
        throw new Error('Upload receipt did not match user-selected file or rights');
      return result;
    });
  };
  if(record.value.kind!=='EXPERIENCE'||record.value.dataMode!=='OWNER_CONSENTED')
    return <p role="note">합성·비경험 기록에는 개인 첨부 기능을 제공하지 않습니다.</p>;
  if(state.status!=='READY')return <p role="alert">현재 본인 세션이 아니므로 첨부 자료를 표시할 수 없습니다.</p>;
  if(!port)return <p role="note">현재는 허가된 개인 증빙 파일 저장 API가 연결되지 않아 이미지·포스터 업로드/삭제가 비활성화되어 있습니다. 본인이 작성한 참고 링크만 별도로 보존합니다.</p>;
  if(!page)return <p role={error?'alert':undefined} aria-busy={!error}>
    {error||'현재 경험/자료 이용권에 허용된 첨부 상태를 확인 중입니다.'}</p>;
  const policy=page.policy;
  return <section aria-label="본인 경험 증빙 첨부 관리">
    <h4>본인 증빙 첨부 (기관 인증 아님)</h4>
    <p role="note">비공개 본인 기록에만 연결하고, 권한·출처 판본은 업로드/삭제 때마다 서버에서 다시 검사합니다. 파일명/미리보기·실명은 외부/공개 페이지에 노출하지 않습니다.</p>
    {policy.state==='BLOCKED'?<p role="note">현재 첨부를 사용할 수 없습니다: {policy.reason}. 권리·개인 저장·서버 구성이 확인되어야 합니다.</p>
      :<form onSubmit={onUpload}>
        <p>권리 판본 {policy.sourceRightsVersion} · 허용 기간 {policy.expiresAt} · 최대 {policy.maxFileBytes}바이트, 파일 {page.items.length}/10건.</p>
        <label htmlFor={'career-evidence-file-'+record.itemId}>허가된 PNG/JPEG/PDF 개인 증빙 선택</label>
        <input id={'career-evidence-file-'+record.itemId} type="file"
          accept={policy.allowedMimeTypes.join(',')} disabled={busy||Date.parse(policy.expiresAt)<=Date.now()}
          onChange={e=>setSelected(e.currentTarget.files?.[0]??null)}/>
        <button type="submit" disabled={busy||!selected||!allowed(page,selected)}>
          현재 권한으로 증빙 업로드</button>
      </form>}
    {error&&<p role="alert">{error}</p>}
    {page.items.length===0?<p>이 경험에 대해 현재 읽을 수 있는 증빙 첨부가 없습니다.</p>
      :<ul>{page.items.map(asset=><li key={asset.assetId}>
        <span>본인 업로드 · {asset.mimeType} · {asset.size}바이트 · {asset.recordedAt} · 기관 미검증</span>
        {policy.state==='ALLOWED'&&<button type="button" disabled={busy||Date.parse(policy.expiresAt)<=Date.now()}
          onClick={()=>{void execute(async signal=>{
            const receipt=await port.remove(record,policy,asset.assetId,signal);
            if(receipt===null||receipt===undefined)throw new Error('Delete not acknowledged');
            return receipt;
          });}}>첨부 삭제 요청</button>}
      </li>)}</ul>}
  </section>;
}
