// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {OwnerInsightsPanel} from './OwnerInsightsPanel.js';
import {OwnerSessionController} from '../../app/owner-session-controller.js';
import {HufsApiError} from '../../integrations/api-error.js';
import type {HufsOwnerApiClient} from '../../integrations/owner-api-client.js';
import {guide,FIXED_NOW} from '../../../../../packages/core/src/feature-additions/v2.fixtures.js';
import {resolveInternationalGuide} from '../../../../../packages/core/src/feature-additions/international-v2.js';
import {FeatureAdditions as V} from '@hufs-one/contracts';
type GuideView=Awaited<ReturnType<HufsOwnerApiClient['getOwnerGuideChecklist']>>;
const current=guide();current.translations.en!.review='HUMAN_VERIFIED';current.translations.en!.text='SYNTHETIC reviewed English guide';
const resolved=(locale:'ko'|'en'|'zh')=>V.GuideResolutionV2Schema.parse(resolveInternationalGuide({guide:current,locale,topicCode:current.topicCode,
  campus:'SEOUL',term:'2026-2',audienceCodes:['INTERNATIONAL_STUDENT'],asOf:FIXED_NOW}));
function view(locale:'ko'|'en'|'zh'='ko',version=0,checkedStepIds:string[]=[],stale=false):Extract<GuideView,{state:'READY'}>{
  return {state:'READY',guide:resolved(locale),translationVersion:current.translations[locale]!.translationVersion,
    asOf:new Date().toISOString(),expiresAt:new Date(Date.now()+60_000).toISOString(),sourceVersion:'SYN-GUIDE-HEAD',
    contextVersion:'a'.repeat(64),version,checklist:{state:stale?'STALE_GUIDE':'READY',
      checkedStepIds,invalidatedStepIds:stale?['step-1']:[],officialAdministrationComplete:false}};
}
function fixture(){
  let actorId='SYN-GUIDE-UI';
  const session=new OwnerSessionController({getSession:async()=>({actorId,role:'BETA',schoolMailProofValid:true,betaAllowed:true})});
  const read=vi.fn(async():Promise<V.OwnerInsightsResponse>=>({state:'READY',asOf:FIXED_NOW,sourceVersion:'SYN-HEAD',
    result:{kind:'INTERNATIONAL',guides:[resolved('ko')]}}));
  const readGuide=vi.fn<HufsOwnerApiClient['getOwnerGuideChecklist']>(async(_id,locale)=>view(locale));
  const saveGuide=vi.fn<HufsOwnerApiClient['saveOwnerGuideChecklist']>(async(_id,input)=>view(input.locale,input.expectedVersion+1,input.checkedStepIds));
  return {port:{session,read,readGuide,saveGuide},read,readGuide,saveGuide,session,switchActor:()=>{actorId='SYN-OTHER';}};
}
const deferred=()=>{let resolve!:(v:GuideView)=>void;const promise=new Promise<GuideView>(r=>{resolve=r;});return {promise,resolve};};
async function open(f:ReturnType<typeof fixture>){render(<OwnerInsightsPanel port={f.port} kind="INTERNATIONAL"/>);
  fireEvent.click(await screen.findByRole('button',{name:'현재 권한으로 확인하기'}));
  await screen.findByRole('checkbox');}
afterEach(()=>{cleanup();vi.useRealTimers();});
it('clears expired content and a pending save, and requires an explicit reread without replay',async()=>{
  const f=fixture();await open(f);vi.useFakeTimers({shouldAdvanceTime:true});
  f.readGuide.mockResolvedValueOnce({...view(),asOf:new Date().toISOString(),expiresAt:new Date(Date.now()+1000).toISOString(),sourceVersion:'SYN-LEASE'});
  fireEvent.click(screen.getByRole('button',{name:'안내·체크 다시 읽기'}));
  await screen.findByText(/SYN-LEASE/);const write=deferred();f.saveGuide.mockImplementationOnce(()=>write.promise);
  fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'체크 저장'}));
  await act(async()=>{vi.advanceTimersByTime(1001);});
  expect(screen.queryByRole('checkbox')).toBeNull();expect(screen.queryByText(current.translations.ko.text)).toBeNull();
  expect(screen.getByText(/확인 유효기한이 지났습니다/)).toBeTruthy();
  expect(f.saveGuide.mock.calls[0]![2]!.aborted).toBe(true);
  await act(async()=>{write.resolve(view('ko',1,['step-1']));await write.promise;});
  expect(screen.queryByText('체크를 저장했습니다.')).toBeNull();expect(f.saveGuide).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button',{name:'안내·체크 다시 읽기'}));
  expect((await screen.findByRole('checkbox') as HTMLInputElement).checked).toBe(false);
});
it('saves the visible translation and exact CAS binding, then allows clearing owner checks',async()=>{
  const f=fixture();await open(f);const box=screen.getByRole('checkbox');expect((box as HTMLInputElement).checked).toBe(false);
  fireEvent.click(box);fireEvent.click(screen.getByRole('button',{name:'체크 저장'}));
  await screen.findByText('체크를 저장했습니다.');
  expect(f.saveGuide.mock.calls[0]!.slice(0,2)).toEqual([current.id,{locale:'ko',displayedLocale:'ko',
    expectedVersion:0,guideRevisionId:current.source.revisionId,translationVersion:'ko-r1',contextVersion:'a'.repeat(64),checkedStepIds:['step-1']}]);
  fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'체크 저장'}));
  await waitFor(()=>expect(f.saveGuide).toHaveBeenCalledTimes(2));
  expect(f.saveGuide.mock.calls[1]![1]).toMatchObject({expectedVersion:1,checkedStepIds:[]});
});
it('clears old language content immediately and discards a late English response after Chinese is selected',async()=>{
  const f=fixture(),old=deferred();await open(f);
  f.readGuide.mockImplementationOnce(()=>old.promise);
  fireEvent.change(screen.getByLabelText('안내 언어'),{target:{value:'en'}});
  await waitFor(()=>expect(f.readGuide).toHaveBeenCalledTimes(2));
  expect(screen.queryByText(current.translations.ko.text)).toBeNull();
  fireEvent.change(screen.getByLabelText('안내 언어'),{target:{value:'zh'}});
  await screen.findByText(current.translations.zh!.text);
  await act(async()=>{old.resolve(view('en'));await old.promise;});
  expect(screen.queryByText(current.translations.en!.text)).toBeNull();
  expect(screen.getByText(current.translations.zh!.text).getAttribute('lang')).toBe('zh');
});
it('hides owner state after an actor change while a guide request is pending',async()=>{
  const f=fixture(),old=deferred();await open(f);f.readGuide.mockImplementationOnce(()=>old.promise);
  fireEvent.change(screen.getByLabelText('안내 언어'),{target:{value:'zh'}});
  await waitFor(()=>expect(f.readGuide).toHaveBeenCalledTimes(2));
  f.switchActor();await act(async()=>{await f.session.revalidate();});
  await act(async()=>{old.resolve(view('zh'));await old.promise;});
  expect(screen.queryByRole('checkbox')).toBeNull();expect(screen.queryByText(current.translations.zh!.text)).toBeNull();
});
it('recovers from a multi-tab 409 by re-authorizing and reloading, without replaying the write',async()=>{
  const f=fixture();await open(f);f.saveGuide.mockRejectedValueOnce(new HufsApiError('VERSION_CONFLICT',409));
  fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'체크 저장'}));
  await screen.findByText(/다른 탭의 저장 또는 안내 판본/);expect(screen.queryByRole('checkbox')).toBeNull();
  f.readGuide.mockResolvedValue(view('ko',2));fireEvent.click(screen.getByRole('button',{name:'현재 계정·권한 다시 확인'}));
  fireEvent.click(await screen.findByRole('button',{name:'현재 권한으로 확인하기'}));
  expect((await screen.findByRole('checkbox') as HTMLInputElement).checked).toBe(false);
  expect(f.saveGuide).toHaveBeenCalledTimes(1);
});
it('marks stale checks for review and keeps unavailable storage explicit',async()=>{
  const f=fixture();f.readGuide.mockResolvedValue(view('ko',3,[],true));await open(f);
  expect(screen.getByText(/안내 또는 번역이 바뀌어/)).toBeTruthy();expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
  fireEvent.click(screen.getByRole('button',{name:'현재 안내로 체크 저장'}));await screen.findByText('체크를 저장했습니다.');
  f.readGuide.mockResolvedValue({state:'NOT_CONNECTED'});fireEvent.click(screen.getByRole('button',{name:'안내·체크 다시 읽기'}));
  await screen.findByText(/NOT_CONNECTED.*체크 저장/);expect(screen.queryByRole('checkbox')).toBeNull();
});
it('drops an unsaved draft when only the save provider is replaced',async()=>{
  const f=fixture(),rendered=render(<OwnerInsightsPanel port={f.port} kind="INTERNATIONAL"/>);
  fireEvent.click(await screen.findByRole('button',{name:'현재 권한으로 확인하기'}));
  fireEvent.click(await screen.findByRole('checkbox'));
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
  const nextSave=vi.fn<HufsOwnerApiClient['saveOwnerGuideChecklist']>(async()=>view('ko',1));
  rendered.rerender(<OwnerInsightsPanel port={{...f.port,saveGuide:nextSave}} kind="INTERNATIONAL"/>);
  await waitFor(()=>expect(f.readGuide).toHaveBeenCalledTimes(2));
  expect((await screen.findByRole('checkbox') as HTMLInputElement).checked).toBe(false);
  fireEvent.click(screen.getByRole('button',{name:'체크 저장'}));expect(nextSave).not.toHaveBeenCalled();
});
it('saves a Korean fallback with the actual Korean translation binding',async()=>{
  const f=fixture();await open(f);const base=view('ko');if(base.state!=='READY')throw new Error();
  const fallback={...base,guide:{...base.guide,status:'KOREAN_FALLBACK' as const}};
  f.readGuide.mockResolvedValue(fallback);f.saveGuide.mockResolvedValue({...fallback,version:1});
  fireEvent.change(screen.getByLabelText('안내 언어'),{target:{value:'en'}});
  await screen.findByText(/선택한 언어의 검수된 번역이 없어/);
  fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'체크 저장'}));
  await waitFor(()=>expect(f.saveGuide).toHaveBeenCalledOnce());
  expect(f.saveGuide.mock.calls[0]![1]).toMatchObject({locale:'en',displayedLocale:'ko',translationVersion:'ko-r1'});
});
it('uses the reviewed source step caption with its displayed language',async()=>{
  const f=fixture();await open(f);const labeled=view('zh');if(labeled.state!=='READY')throw new Error();
  labeled.guide.steps[0]!.label='已审阅的合成准备事项';f.readGuide.mockResolvedValue(labeled);
  fireEvent.change(screen.getByLabelText('안내 언어'),{target:{value:'zh'}});
  expect((await screen.findByText('1. 已审阅的合成准备事项')).getAttribute('lang')).toBe('zh');
});
it.each([['FORBIDDEN',403],['RATE_LIMITED',429],['PROVIDER_UNAVAILABLE',503]] as const)
  ('clears guide/check state on %s instead of claiming a successful reload',async(code,status)=>{
    const f=fixture();await open(f);f.readGuide.mockRejectedValue(new HufsApiError(code,status));
    fireEvent.click(screen.getByRole('button',{name:'안내·체크 다시 읽기'}));
    await screen.findByRole('alert');expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByText(current.translations.ko.text)).toBeNull();
    if(code==='RATE_LIMITED')expect(screen.getByText(/요청 한도에 도달/)).toBeTruthy();
  });
it('disables concurrent editing during a save and ignores its late acknowledgement after leaving the feature',async()=>{
  const f=fixture(),old=deferred(),rendered=render(<OwnerInsightsPanel port={f.port} kind="INTERNATIONAL"/>);
  fireEvent.click(await screen.findByRole('button',{name:'현재 권한으로 확인하기'}));
  fireEvent.click(await screen.findByRole('checkbox'));f.saveGuide.mockImplementation(()=>old.promise);
  fireEvent.click(screen.getByRole('button',{name:'체크 저장'}));
  await waitFor(()=>expect(f.saveGuide).toHaveBeenCalledOnce());
  expect((screen.getByLabelText('안내 언어') as HTMLSelectElement).disabled).toBe(true);
  const signal=f.saveGuide.mock.calls[0]![2]!;
  rendered.rerender(<OwnerInsightsPanel port={f.port} kind="EMPLOYMENT"/>);
  expect(signal.aborted).toBe(true);
  await act(async()=>{old.resolve(view('ko',1,['step-1']));await old.promise;});
  expect(screen.queryByText('체크를 저장했습니다.')).toBeNull();expect(screen.queryByRole('checkbox')).toBeNull();
});
