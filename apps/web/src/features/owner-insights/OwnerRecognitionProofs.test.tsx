// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {FeatureAdditions as V} from '@hufs-one/contracts';
import {OwnerInsightsPanel,type OwnerInsightsPort} from './OwnerInsightsPanel.js';
import {OwnerSessionController} from '../../app/owner-session-controller.js';
import {HufsApiError} from '../../integrations/api-error.js';
import {createProofReview,confirmProofReview,redactProofReview} from '../../../../../packages/core/src/feature-additions/proof-review.js';
import {recognitionRule,FIXED_NOW} from '../../../../../packages/core/src/feature-additions/v2.fixtures.js';
import {PROOF_OCR_CASES} from '../../../../../packages/core/src/feature-additions/proof-ocr.fixtures.js';
import {prepareRecognitionV2} from '../../../../../packages/core/src/feature-additions/recognition-v2.js';
import type {OwnerProofPort} from './OwnerRecognitionProofs.js';
const rule=recognitionRule(),activityId='SYN-ACTIVITY',proofId='SYN-PROOF',assetId='SYN-ASSET',scope='a'.repeat(64);
function candidate(){const f=PROOF_OCR_CASES[0]!;return createProofReview({proofId,activityId,assetId,assetVersion:'SYN-V1',assetSha256:'b'.repeat(64),
  storageConsentVersion:1,scopeVersion:scope,rule,asOf:new Date().toISOString(),expiresAt:new Date(Date.now()+60_000).toISOString(),evidencePage:0,lines:f.lines,claimed:f.claimed!});}
function fixture(){let actorId='SYN-PROOF-UI',review:V.RecognitionProofReview=candidate(),version=1;
  const auth={getSession:async()=>({actorId,role:'BETA' as const,schoolMailProofValid:true,betaAllowed:true})};
  const session=new OwnerSessionController(auth),cleanupSession=new OwnerSessionController(auth);
  const item=():V.RecognitionProofItem=>({proofId,activityId,assetId,assetVersion:'SYN-V1',version,state:'candidate' in review?'CURRENT':'REDACTED',
    contextVersion:'candidate' in review?scope:null,recordScopeVersion:scope,expiresAt:'expiresAt' in review?review.expiresAt:null,review});
  const page=()=>({state:'READY' as const,activityId,asOf:new Date().toISOString(),ruleState:'CURRENT' as const,ocrAllowed:true,
    ruleRevisionId:rule.source.revisionId,expiresAt:new Date(Date.now()+60_000).toISOString(),
    preparation:V.RecognitionReportV2Schema.parse(prepareRecognitionV2({rule,activity:{id:activityId,kind:'VOLUNTEER'},proofs:[],asOf:FIXED_NOW})),items:[item()]});
  const proofs={cleanupSession,read:vi.fn<OwnerProofPort['read']>(async()=>page()),extract:vi.fn(async()=>({state:'READY' as const,item:item()})),
    confirm:vi.fn(async(_a:string,_id:string,change:ReturnType<typeof V.RecognitionProofConfirmSchema.parse>,_signal?:AbortSignal)=>{
      review=confirmProofReview(review,{rule,scopeVersion:scope,asOf:new Date().toISOString(),maskingConfirmed:true,acceptedFieldNames:change.acceptedFieldNames});version++;return {state:'READY' as const,item:item()};}),
    redact:vi.fn(async(_a:string,_id:string,change:ReturnType<typeof V.RecognitionProofRedactSchema.parse>,_signal?:AbortSignal)=>{
      review=redactProofReview(review,{action:change.action,asOf:new Date().toISOString()});version++;return {state:'READY' as const,item:item()};}),
    cleanup:vi.fn(async()=>({state:'READY' as const,item:item()})),batch:vi.fn(async()=>({state:'READY' as const,attempted:1,acknowledged:1,failed:0,batchLimitReached:true}))};
  const read=vi.fn<OwnerInsightsPort['read']>(async()=>({state:'READY' as const,asOf:FIXED_NOW,sourceVersion:'SYN-HEAD',result:{kind:'RECOGNITION' as const,
    reports:[{activityId,ruleRevisionId:rule.source.revisionId,status:'DOCUMENTS_PENDING' as const,groups:[],missingKinds:['CERTIFICATE'],checkedProofIds:[],officiallyRecognized:false as const}]}}));
  return {port:{session,read,proofs},proofs,session,page,item,switchActor:()=>{actorId='SYN-OTHER';}};
}
async function open(f:ReturnType<typeof fixture>){const view=render(<OwnerInsightsPanel port={f.port} kind="RECOGNITION"/>);
  fireEvent.click(await screen.findByRole('button',{name:'현재 권한으로 확인하기'}));await screen.findByRole('checkbox',{name:'발급기관 후보를 보관'});return view;}
afterEach(()=>{cleanup();vi.useRealTimers();});
it('masks fields by default and confirms only explicitly selected fields with masking acknowledgment',async()=>{
  const f=fixture();await open(f);expect(screen.queryByText('가상미래교육재단')).toBeNull();
  const save=screen.getByRole('button',{name:'선택한 후보 수락'});expect((save as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox',{name:'발급기관 후보를 보관'}));expect(screen.getByText('가상미래교육재단')).toBeTruthy();
  fireEvent.click(screen.getByRole('checkbox',{name:'표시된 후보와 필드 가림 선택을 검토했습니다'}));fireEvent.click(save);
  await waitFor(()=>expect(f.proofs.confirm).toHaveBeenCalledOnce());
  expect(f.proofs.confirm.mock.calls[0]!.slice(0,3)).toEqual([activityId,proofId,{expectedVersion:1,contextVersion:scope,maskingConfirmed:true,acceptedFieldNames:['ISSUER']}]);
  await screen.findByText(/본인 확인 후보/);expect(f.proofs.read).toHaveBeenCalledTimes(2);
});
it('immediately removes fields while rejection is pending and reports external cleanup as pending',async()=>{
  const f=fixture();await open(f);fireEvent.click(screen.getByRole('checkbox',{name:'발급기관 후보를 보관'}));
  const original=f.proofs.redact.getMockImplementation()!;let finish!:()=>void;
  f.proofs.redact.mockImplementationOnce((...args)=>new Promise(resolve=>{finish=()=>{void original(...args).then(resolve);};}));
  fireEvent.click(screen.getByRole('button',{name:'후보 거부'}));await waitFor(()=>expect(f.proofs.redact).toHaveBeenCalledOnce());
  expect(screen.queryByText('가상미래교육재단')).toBeNull();expect(screen.queryByRole('checkbox')).toBeNull();
  await act(async()=>{finish();});await screen.findByText(/외부 원본·파생물 정리 확인 대기/);
  expect(screen.queryByText(/삭제 완료/)).toBeNull();
});
it('requires explicit 409 recovery and does not replay an owner mutation',async()=>{
  const f=fixture();await open(f);f.proofs.redact.mockRejectedValueOnce(new HufsApiError('VERSION_CONFLICT',409));
  fireEvent.click(screen.getByRole('button',{name:'후보 거부'}));await screen.findByText(/다른 탭/);
  expect(screen.queryByRole('checkbox')).toBeNull();expect(f.proofs.redact).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button',{name:'현재 계정·권한 다시 확인'}));
  fireEvent.click(await screen.findByRole('button',{name:'현재 권한으로 확인하기'}));await screen.findByRole('checkbox',{name:'발급기관 후보를 보관'});
  expect(f.proofs.redact).toHaveBeenCalledOnce();
});
it('clears a pending owner view on actor change and ignores its late response',async()=>{
  const f=fixture();let finish!:(p:ReturnType<typeof f.page>)=>void;
  f.proofs.read.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  render(<OwnerInsightsPanel port={f.port} kind="RECOGNITION"/>);fireEvent.click(await screen.findByRole('button',{name:'현재 권한으로 확인하기'}));
  await waitFor(()=>expect(f.proofs.read).toHaveBeenCalledOnce());f.switchActor();await act(async()=>{await f.session.revalidate();});
  await act(async()=>{finish(f.page());});expect(screen.queryByRole('checkbox')).toBeNull();expect(screen.queryByText('가상미래교육재단')).toBeNull();
});
it('makes post-withdrawal cleanup available before private document loading and reports only the batch count',async()=>{
  const f=fixture();render(<OwnerInsightsPanel port={f.port} kind="RECOGNITION"/>);
  fireEvent.click(await screen.findByRole('button',{name:'남은 정리 작업 한 건 확인'}));
  await screen.findByText(/정리 확인 1건/);expect(f.proofs.read).not.toHaveBeenCalled();expect(f.port.read).not.toHaveBeenCalled();
  expect(screen.queryByText(/모든.*삭제 완료/)).toBeNull();
});
it('cancels a pending rejection without letting a late provider error invalidate the current session',async()=>{
  const f=fixture();await open(f);let reject!:(e:unknown)=>void;
  f.proofs.redact.mockImplementationOnce(()=>new Promise((_resolve,failed)=>{reject=failed;}));
  fireEvent.click(screen.getByRole('button',{name:'후보 거부'}));await waitFor(()=>expect(f.proofs.redact).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button',{name:'요청 대기 중단'}));
  expect(f.proofs.redact.mock.calls[0]![3]!.aborted).toBe(true);
  await act(async()=>{reject(new HufsApiError('FORBIDDEN',403));});
  expect(f.session.getState().status).toBe('READY');expect(screen.queryByRole('checkbox')).toBeNull();
});
it('expires a pending write and ignores its late acknowledgment without an automatic reread',async()=>{
  const f=fixture();await open(f);vi.useFakeTimers({shouldAdvanceTime:true});
  f.proofs.read.mockResolvedValueOnce({...f.page(),expiresAt:new Date(Date.now()+1000).toISOString()});
  fireEvent.click(screen.getByRole('button',{name:'문서·후보 다시 읽기'}));await screen.findByRole('checkbox',{name:'발급기관 후보를 보관'});
  let finish!:(v:{state:'READY';item:V.RecognitionProofItem})=>void;
  f.proofs.redact.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  fireEvent.click(screen.getByRole('button',{name:'후보 거부'}));await waitFor(()=>expect(f.proofs.redact).toHaveBeenCalledOnce());
  await act(async()=>{vi.advanceTimersByTime(1001);});
  await screen.findByText(/확인 유효기한이 지났습니다/);expect(f.proofs.redact.mock.calls[0]![3]!.aborted).toBe(true);
  await act(async()=>{finish({state:'READY',item:f.item()});});
  expect(screen.queryByRole('checkbox')).toBeNull();expect(f.proofs.read).toHaveBeenCalledTimes(2);
});
it('discards an old provider read and resets field choices when only the cleanup provider changes',async()=>{
  const f=fixture(),view=await open(f);fireEvent.click(screen.getByRole('checkbox',{name:'발급기관 후보를 보관'}));
  let finish!:(v:ReturnType<typeof f.page>)=>void;
  f.proofs.read.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  fireEvent.click(screen.getByRole('button',{name:'문서·후보 다시 읽기'}));
  const next={...f.port,proofs:{...f.proofs,cleanup:vi.fn(async()=>({state:'READY' as const,item:f.item()}))}};
  await waitFor(()=>expect(f.proofs.read).toHaveBeenCalledTimes(2));view.rerender(<OwnerInsightsPanel port={next} kind="RECOGNITION"/>);
  await waitFor(()=>expect(f.proofs.read).toHaveBeenCalledTimes(3));await screen.findByRole('checkbox',{name:'발급기관 후보를 보관'});
  await act(async()=>{finish(f.page());});
  expect(screen.queryByText('가상미래교육재단')).toBeNull();
});
it('clears selected fields when the selected document changes',async()=>{
  const f=fixture(),first=f.page(),second={...f.item(),proofId:'SYN-PROOF-2',assetId:'SYN-ASSET-2',
    review:{...candidate(),proofId:'SYN-PROOF-2',assetId:'SYN-ASSET-2'}};
  f.proofs.read.mockResolvedValue({...first,items:[...first.items,second]});await open(f);
  fireEvent.click(screen.getByRole('checkbox',{name:'발급기관 후보를 보관'}));expect(screen.getByText('가상미래교육재단')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('확인할 문서'),{target:{value:'SYN-PROOF-2'}});
  expect(screen.queryByText('가상미래교육재단')).toBeNull();expect((screen.getByRole('checkbox',{name:'발급기관 후보를 보관'}) as HTMLInputElement).checked).toBe(false);
});
it('keeps missing providers and an empty document list explicit',async()=>{
  for(const page of [{state:'NOT_CONNECTED' as const},{...fixture().page(),items:[]}]){
    const f=fixture();f.proofs.read.mockResolvedValue(page);render(<OwnerInsightsPanel port={f.port} kind="RECOGNITION"/>);
    fireEvent.click(await screen.findByRole('button',{name:'현재 권한으로 확인하기'}));
    await screen.findByText(page.state==='NOT_CONNECTED'?/NOT_CONNECTED.*본인 문서·OCR/:/현재 확인할 수 있는 본인 문서가 없습니다/);
    expect(screen.queryByRole('checkbox')).toBeNull();expect(f.proofs.extract).not.toHaveBeenCalled();cleanup();
  }
});
it('hides the entire candidate on 403, 429 and 503 without replaying writes',async()=>{
  for(const [code,status] of [['FORBIDDEN',403],['RATE_LIMITED',429],['PROVIDER_UNAVAILABLE',503]] as const){
    const f=fixture();await open(f);fireEvent.click(screen.getByRole('checkbox',{name:'발급기관 후보를 보관'}));
    f.proofs.read.mockRejectedValueOnce(new HufsApiError(code,status));fireEvent.click(screen.getByRole('button',{name:'문서·후보 다시 읽기'}));
    await screen.findByRole('alert');expect(screen.queryByText('가상미래교육재단')).toBeNull();expect(screen.queryByRole('checkbox')).toBeNull();
    expect(f.proofs.confirm).not.toHaveBeenCalled();cleanup();
  }
});
it('preserves an authorized initial manual preparation snapshot when the proof service is unconnected',async()=>{
  const f=fixture(),initial=await f.port.read('RECOGNITION');if(initial.state!=='READY'||initial.result.kind!=='RECOGNITION')throw Error();
  f.port.read.mockResolvedValue({...initial,result:{...initial.result,reports:initial.result.reports.map(r=>({...r,status:'READY_FOR_OFFICIAL_REVIEW',missingKinds:[]}))}});
  f.proofs.read.mockResolvedValue({state:'NOT_CONNECTED'});render(<OwnerInsightsPanel port={f.port} kind="RECOGNITION"/>);
  fireEvent.click(await screen.findByRole('button',{name:'현재 권한으로 확인하기'}));await screen.findByText(/NOT_CONNECTED.*본인 문서·OCR/);
  expect(screen.getByText(/초기 활동 조회 시점의 준비 결과/)).toBeTruthy();expect(screen.getByText(/본인 기록상 서류 준비 확인됨/)).toBeTruthy();
  expect(screen.queryByRole('checkbox')).toBeNull();
});
it('keeps cleanup-only authorization usable after a private-read 403 without recovering private access',async()=>{
  const f=fixture();f.port.read.mockRejectedValueOnce(new HufsApiError('FORBIDDEN',403));render(<OwnerInsightsPanel port={f.port} kind="RECOGNITION"/>);
  fireEvent.click(await screen.findByRole('button',{name:'현재 권한으로 확인하기'}));await screen.findByRole('alert');
  expect(f.session.getState().status).toBe('FORBIDDEN');fireEvent.click(screen.getByRole('button',{name:'남은 정리 작업 한 건 확인'}));
  await screen.findByText(/정리 확인 1건/);expect(f.session.getState().status).toBe('FORBIDDEN');
  expect(f.proofs.read).not.toHaveBeenCalled();expect(f.proofs.batch).toHaveBeenCalledOnce();
});
it('never uses the previous owner for cleanup after account identity changes',async()=>{
  const f=fixture();render(<OwnerInsightsPanel port={f.port} kind="RECOGNITION"/>);
  await screen.findByRole('button',{name:'남은 정리 작업 한 건 확인'});f.switchActor();
  fireEvent.click(screen.getByRole('button',{name:'남은 정리 작업 한 건 확인'}));
  await screen.findByText(/정리 전용 본인 권한을 확인하지 못했습니다/);expect(f.proofs.batch).not.toHaveBeenCalled();
});
it('hides the previous owner cleanup count immediately when the private session identity changes',async()=>{
  const f=fixture();render(<OwnerInsightsPanel port={f.port} kind="RECOGNITION"/>);
  fireEvent.click(await screen.findByRole('button',{name:'남은 정리 작업 한 건 확인'}));await screen.findByText(/정리 확인 1건/);
  f.switchActor();await act(async()=>{await f.session.revalidate();});expect(screen.queryByText(/정리 확인 1건/)).toBeNull();
});
it('does not restore the initial ready snapshot after an owner mutation when the provider disappears',async()=>{
  const f=fixture();f.proofs.read.mockResolvedValueOnce(f.page()).mockResolvedValueOnce({state:'NOT_CONNECTED'});
  await open(f);fireEvent.click(screen.getByRole('button',{name:'후보 거부'}));await screen.findByText(/NOT_CONNECTED.*본인 문서·OCR/);
  expect(screen.queryByText(/초기 활동 조회 시점의 준비 결과/)).toBeNull();expect(screen.queryByRole('checkbox')).toBeNull();
});
