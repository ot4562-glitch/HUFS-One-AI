/** Test-only synthetic App entry. Never imported by either production build. */
import {createRoot} from 'react-dom/client';
import {FeatureAdditions as V} from '@hufs-one/contracts';
import {App} from '../src/App.js';
import {DemoController} from '../src/app/demo-controller.js';
import {OwnerSessionController} from '../src/app/owner-session-controller.js';
import {SyntheticDemoClient} from '../src/dev/syntheticDemoClient.js';
import {appPages} from '../src/pages/index.js';
import {cssVariables} from '../src/design/tokens.js';
import {HufsApiError} from '../src/integrations/api-error.js';
import {guide,FIXED_NOW} from '../../../packages/core/src/feature-additions/v2.fixtures.js';
import {resolveInternationalGuide} from '../../../packages/core/src/feature-additions/international-v2.js';
import '../src/styles.css';
if(!import.meta.env.DEV||import.meta.env.MODE!=='synthetic')throw new Error('Synthetic UI entry only');
const source=guide();source.translations.en!.review='HUMAN_VERIFIED';
source.translations.en!.text='Synthetic registration preparation. Check the reviewed guide and contact the office.';
source.translations.ko.text='합성 수강 준비 안내입니다. 캠퍼스와 적용 학기를 확인한 뒤 신청서와 필요한 자료를 준비하고 담당 기관에 문의하세요. 이 화면은 실제 학교 자료나 학생의 처리 결과가 아닙니다.';
let actorId='SYN-GUIDE-UI';
const session=new OwnerSessionController({getSession:async()=>({actorId,role:'BETA',schoolMailProofValid:true,betaAllowed:true})});
const resolve=(locale:'ko'|'en'|'zh')=>V.GuideResolutionV2Schema.parse(resolveInternationalGuide({guide:source,locale,topicCode:source.topicCode,
  campus:'SEOUL',term:'2026-2',audienceCodes:['INTERNATIONAL_STUDENT'],asOf:FIXED_NOW}));
let version=0,checked:string[]=[],savedLocale:'ko'|'en'|'zh'='ko',connected=true,conflict=false,sourceVersion='SYN-GUIDE-SOURCE';
const readGuide=async(_id:string,locale:'ko'|'en'|'zh')=>connected?({state:'READY' as const,guide:resolve(locale),
  asOf:new Date().toISOString(),expiresAt:new Date(Date.now()+60_000).toISOString(),sourceVersion,
  translationVersion:source.translations[resolve(locale).locale]!.translationVersion,contextVersion:'a'.repeat(64),version,
  checklist:{state:savedLocale===locale?'READY' as const:'STALE_GUIDE' as const,
    checkedStepIds:savedLocale===locale?[...checked]:[],invalidatedStepIds:savedLocale===locale?[]:[...checked],officialAdministrationComplete:false as const}}):{state:'NOT_CONNECTED' as const};
const ownerInsights={session,read:async(kind:V.OwnerInsightsKind):Promise<V.OwnerInsightsResponse>=>kind==='INTERNATIONAL'
  ?{state:'READY',asOf:FIXED_NOW,sourceVersion,result:{kind,guides:[resolve('ko')]}}
  :{state:'NOT_CONNECTED',kind,asOf:FIXED_NOW},readGuide,
  saveGuide:async(id:string,input:ReturnType<typeof V.GuideChecklistWriteV2Schema.parse>)=>{
    if(conflict){conflict=false;throw new HufsApiError('VERSION_CONFLICT',409);}
    if(input.expectedVersion!==version)throw new HufsApiError('VERSION_CONFLICT',409);
    version++;checked=[...input.checkedStepIds];savedLocale=input.displayedLocale;return readGuide(id,input.locale);
  }};
declare global {interface Window {__guideHarness:{conflictNext:()=>void;disconnect:()=>void;switchOwner:()=>Promise<void>;longReferences:()=>void;state:()=>{version:number;checked:string[]}}}}
window.__guideHarness={conflictNext:()=>{conflict=true;},disconnect:()=>{connected=false;},
  longReferences:()=>{sourceVersion='SYN-'+ 'x'.repeat(120);source.source.revisionId='SYN-'+ 'r'.repeat(120);
    source.translations.ko.translationVersion='KO-'+ 't'.repeat(120);
    for(const t of Object.values(source.translations))if(t)t.basedOnRevisionId=source.source.revisionId;},
  switchOwner:async()=>{actorId='SYN-OTHER';await session.revalidate();},state:()=>({version,checked:[...checked]})};
const location={pathname:'/owner-insights/INTERNATIONAL'};
const historyPort={location,history:{pushState:(_data:unknown,_unused:string,next?:string|URL|null)=>{location.pathname=String(next);}},
  addEventListener:()=>{},removeEventListener:()=>{}};
const style=document.createElement('style');style.textContent=`:root{${cssVariables()}}`;document.head.append(style);
createRoot(document.getElementById('root')!).render(<App controller={new DemoController(new SyntheticDemoClient(),crypto.randomUUID())}
  services={{ownerInsights}} pages={appPages} historyPort={historyPort} transportLabel="합성 UI 시험 · 실제 학생·학교 자료 아님"/>);
