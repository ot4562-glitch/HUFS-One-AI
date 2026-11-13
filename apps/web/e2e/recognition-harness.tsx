/** DEV-only App with synthetic authority/providers. No original file or network OCR. */
import {createRoot} from 'react-dom/client';
import {FeatureAdditions as V} from '@hufs-one/contracts';
import {App} from '../src/App.js';
import {DemoController} from '../src/app/demo-controller.js';
import {OwnerSessionController} from '../src/app/owner-session-controller.js';
import {SyntheticDemoClient} from '../src/dev/syntheticDemoClient.js';
import {HufsApiError} from '../src/integrations/api-error.js';
import {appPages} from '../src/pages/index.js';
import {cssVariables} from '../src/design/tokens.js';
import {createProofReview,confirmProofReview,redactProofReview,recognitionProofFromReview} from '../../../packages/core/src/feature-additions/proof-review.js';
import {prepareRecognitionV2} from '../../../packages/core/src/feature-additions/recognition-v2.js';
import {recognitionRule,FIXED_NOW} from '../../../packages/core/src/feature-additions/v2.fixtures.js';
import {PROOF_OCR_CASES} from '../../../packages/core/src/feature-additions/proof-ocr.fixtures.js';
import '../src/styles.css';
if(!import.meta.env.DEV||import.meta.env.MODE!=='synthetic')throw Error('Synthetic entry only');
const rule=recognitionRule({documentGroups:[{id:'SYN-GROUP',join:'ALL',kinds:['CERTIFICATE']}]});
const activityId='SYN-ACTIVITY',assetId='SYN-ASSET',proofId='SYN-PROOF',contextVersion='a'.repeat(64);
let actorId='SYN-PROOF-UI',version=0,review:V.RecognitionProofReview|null=null,connected=true,conflict=false,acknowledge=false,assetVersion='SYN-V1',manualReady=false,privateDenied=false;
const now=()=>new Date().toISOString(),expiry=()=>new Date(Date.now()+60_000).toISOString();
const session=new OwnerSessionController({getSession:async()=>({actorId,role:'BETA',schoolMailProofValid:true,betaAllowed:true})});
const cleanupSession=new OwnerSessionController({getSession:async()=>({actorId,role:'BETA',schoolMailProofValid:true,betaAllowed:true})});
const preparation=()=>{const proof=review?recognitionProofFromReview(review,{rule,scopeVersion:contextVersion,asOf:now()}):undefined;
  const manual=manualReady?[{id:'SYN-MANUAL',activityId,kind:'CERTIFICATE',ownerReviewed:true,sourceState:'PRESENT' as const}]:[];
  return V.RecognitionReportV2Schema.parse(prepareRecognitionV2({rule,activity:{id:activityId,kind:'VOLUNTEER'},proofs:[...manual,...(proof?[proof]:[])],asOf:now()}));};
const item=():V.RecognitionProofItem=>({proofId,activityId,assetId,assetVersion,version,
  state:review?'candidate' in review?'CURRENT':'REDACTED':'AVAILABLE',contextVersion:review&&!('candidate' in review)?null:contextVersion,
  recordScopeVersion:review?contextVersion:null,expiresAt:review&&!('candidate' in review)?null:review&&'expiresAt' in review?review.expiresAt:expiry(),review});
const page=async()=>connected?({state:'READY' as const,activityId,asOf:now(),ruleState:'CURRENT' as const,ocrAllowed:true,
  ruleRevisionId:rule.source.revisionId,expiresAt:expiry(),preparation:preparation(),items:[item()]}):{state:'NOT_CONNECTED' as const};
const beforeWrite=()=>{if(conflict){conflict=false;throw new HufsApiError('VERSION_CONFLICT',409);}};
const proofs={cleanupSession,read:page,extract:async()=>{beforeWrite();const fixture=PROOF_OCR_CASES[0]!;
  review=createProofReview({proofId,activityId,assetId,assetVersion,assetSha256:'b'.repeat(64),scopeVersion:contextVersion,
    storageConsentVersion:1,evidencePage:0,expiresAt:expiry(),asOf:now(),rule,lines:fixture.lines,claimed:fixture.claimed!});
  version++;return {state:'READY' as const,item:item()};},
  confirm:async(_activity:string,_id:string,change:ReturnType<typeof V.RecognitionProofConfirmSchema.parse>)=>{
    beforeWrite();review=confirmProofReview(review!,{rule,scopeVersion:contextVersion,asOf:now(),maskingConfirmed:true,acceptedFieldNames:change.acceptedFieldNames});
    version++;return {state:'READY' as const,item:item()};},
  redact:async(_activity:string,_id:string,change:ReturnType<typeof V.RecognitionProofRedactSchema.parse>)=>{
    beforeWrite();review=review?redactProofReview(review,{action:change.action,asOf:now()}):V.RecognitionProofReviewSchema.parse({
      kind:'RECOGNITION_PROOF',dataMode:'OWNER_CONSENTED',proofId,activityId,assetId,assetVersion,scopeVersion:contextVersion,storageConsentVersion:1,
      state:change.action==='WITHDRAW'?'WITHDRAWN':'DELETION_PENDING',redactedAt:now(),cleanupState:'PENDING',officiallyRecognized:false,modelInputAllowed:false});
    version++;return {state:'READY' as const,item:item()};},
  cleanup:async()=>{beforeWrite();if(acknowledge&&review&&!('candidate' in review)&&review.cleanupState==='PENDING'){
    review=redactProofReview(review,{action:review.state==='DELETION_PENDING'?'ACK_DELETE':'ACK_CLEANUP',asOf:now(),removalReceiptId:'SYN-ERASED'});version++;}
    return {state:'READY' as const,item:item()};},
  batch:async()=>({state:'NOT_CONNECTED' as const})};
const ownerInsights={session,read:async()=>{if(privateDenied)throw new HufsApiError('FORBIDDEN',403);return {state:'READY' as const,asOf:FIXED_NOW,sourceVersion:'SYN-REGULATION',
  result:{kind:'RECOGNITION' as const,reports:[preparation()]}};},proofs};
declare global{interface Window{__proofHarness:{conflictNext:()=>void;disconnect:()=>void;acknowledgeNext:()=>void;longReferences:()=>void;
  manualReady:()=>void;denyPrivateRead:()=>void;switchOwner:()=>Promise<void>;state:()=>{version:number;state:string}}}}
window.__proofHarness={conflictNext:()=>{conflict=true;},disconnect:()=>{connected=false;},
  acknowledgeNext:()=>{acknowledge=true;},longReferences:()=>{assetVersion='SYN-'+ 'x'.repeat(120);},
  manualReady:()=>{manualReady=true;},denyPrivateRead:()=>{privateDenied=true;},
  switchOwner:async()=>{actorId='SYN-OTHER';await session.revalidate();},state:()=>({version,state:review?.state??'AVAILABLE'})};
const location={pathname:'/owner-insights/RECOGNITION'};
const historyPort={location,history:{pushState:(_data:unknown,_unused:string,next?:string|URL|null)=>{location.pathname=String(next);}},addEventListener:()=>{},removeEventListener:()=>{}};
const style=document.createElement('style');style.textContent=`:root{${cssVariables()}}`;document.head.append(style);
createRoot(document.getElementById('root')!).render(<App controller={new DemoController(new SyntheticDemoClient(),crypto.randomUUID())}
  services={{ownerInsights}} pages={appPages} historyPort={historyPort} transportLabel="합성 UI 시험 · 실제 학생·학교 자료 아님"/>);
