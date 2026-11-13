import {createHash} from 'node:crypto';
import {z} from 'zod';
import {FeatureAdditions as V,OwnerWorkspaceRecordSchema} from '@hufs-one/contracts';
import {prepareRecognitionV2} from '../../../../packages/core/src/feature-additions/recognition-v2.js';
import {createProofReview,confirmProofReview,redactProofReview,recognitionProofFromReview,ProofReviewStale,ProofReviewExtractionSchema} from '../../../../packages/core/src/feature-additions/proof-review.js';
import type {OwnerWorkspacePort} from './profiles/self-workspace-postgres.js';
import {drainProofCleanup,type ProofCleanupOutbox,type RecognitionErasurePort,type ProofCleanupJob} from './profiles/recognition-cleanup-postgres.js';
import type {OwnerInsightsServices,OwnerInsightsSnapshot} from './owner-v2-insights-http.js';
import {ApiFailure} from './auth/gates.js';
const Id=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/),Iso=z.iso.datetime({offset:true});
export const RecognitionDocumentCatalogueSchema=z.strictObject({actorId:Id,activityId:Id,consentVersion:Id,rightsVersion:Id,expiresAt:Iso,
  storageConsentVersion:z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  ocrAllowed:z.boolean(),assets:z.array(z.strictObject({assetId:Id,assetVersion:Id,assetSha256:z.string().regex(/^[a-f0-9]{64}$/)})).max(10)
    .refine(v=>new Set(v.map(a=>a.assetId)).size===v.length)});
type Catalogue=z.infer<typeof RecognitionDocumentCatalogueSchema>;
export interface TrustedRecognitionDocuments{
  /** Owner/storage-authorized metadata only; this MUST NOT run OCR or return filenames/URLs. */
  list(input:{actorId:string;activityId:string;asOf:string;signal:AbortSignal}):Promise<unknown>;
  /** Explicit extraction only, with current OCR rights and durable provider budget.
   * The trusted adapter binds normalized lines to exactly evidencePage of this asset version. */
  extract(input:{actorId:string;assetId:string;assetVersion:string;receipt:Catalogue;now:string;signal:AbortSignal}):Promise<unknown>;
  /** Independent current owner, storage/consent, asset heads and requested purpose. */
  revalidate(input:{actorId:string;receipt:Catalogue;purpose:'METADATA'|'OCR_REVIEW';now:string;signal:AbortSignal}):Promise<boolean>;
}
export interface RecognitionProofServices{
  store:Pick<OwnerWorkspacePort,'list'|'read'|'create'|'update'>;documents:TrustedRecognitionDocuments;
  cleanup:ProofCleanupOutbox;eraser?:RecognitionErasurePort;
}
export function validateRecognitionProofServices(v:RecognitionProofServices){
  if(!v||['list','read','create','update'].some(k=>typeof v.store?.[k as keyof typeof v.store]!=='function')
    ||['list','extract','revalidate'].some(k=>typeof v.documents?.[k as keyof typeof v.documents]!=='function')
    ||['list','find','blockedProofIds','acknowledge','isAssetBlocked'].some(k=>typeof v.cleanup?.[k as keyof typeof v.cleanup]!=='function')
    ||v.eraser&&['erase','verifyErasure'].some(k=>typeof v.eraser?.[k as keyof typeof v.eraser]!=='function'))
    throw new Error('Recognition proofs require owner storage, current document authority and cleanup outbox');
}
function canonical(v:unknown):string{
  if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
  if(v&&typeof v==='object')return '{'+Object.entries(v).sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,value])=>JSON.stringify(k)+':'+canonical(value)).join(',')+'}';
  return JSON.stringify(v)??'null';
}
export const recognitionProofId=(actorId:string,activityId:string,assetId:string)=>'proof-'+createHash('sha256').update(canonical([actorId,activityId,assetId])).digest('hex');
const hash=(v:unknown)=>createHash('sha256').update(canonical(v)).digest('hex');
const checked=<T>(schema:z.ZodType<T>,raw:unknown):T=>{const v=schema.safeParse(raw);if(!v.success)throw new ApiFailure('PROVIDER_UNAVAILABLE');return v.data;};
const active=(v:V.RecognitionProofReview)=>'candidate' in v;
export const recognitionActivityInfo=(a:{id:string;kind:string;endedAt?:string|undefined})=>({id:a.id,kind:a.kind,...(a.endedAt?{endedAt:a.endedAt}:{})});
export function checkedProofRecord(raw:unknown,actorId:string,activityId?:string){
  const record=checked(OwnerWorkspaceRecordSchema,raw);
  if(record.value.kind!=='RECOGNITION_PROOF'||record.itemId!==record.value.proofId
    ||record.itemId!==recognitionProofId(actorId,record.value.activityId,record.value.assetId)
    ||activityId!==undefined&&record.value.activityId!==activityId)throw new ApiFailure('PROVIDER_UNAVAILABLE');
  return {...record,value:record.value};
}
type Stored=ReturnType<typeof checkedProofRecord>;
async function recordsFor(actorId:string,p:RecognitionProofServices,guard:()=>Promise<void>){
  const records:Stored[]=[];let cursor:string|undefined;
  for(let page=0;page<4;page++){
    await guard();const raw=await p.store.list({actorId,kind:'RECOGNITION_PROOF',limit:50,...(cursor?{afterId:cursor}:{})});await guard();
    if(!raw||!Array.isArray(raw.items)||raw.items.length>50)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    const items=raw.items.map(v=>checkedProofRecord(v,actorId));
    for(const record of items){if(record.itemId<=(records.at(-1)?.itemId??''))throw new ApiFailure('PROVIDER_UNAVAILABLE');records.push(record);}
    if(raw.nextCursor===null)return records;
    if(items.length!==50||raw.nextCursor!==items.at(-1)?.itemId)throw new ApiFailure('PROVIDER_UNAVAILABLE');cursor=raw.nextCursor;
  }
  throw new ApiFailure('PROVIDER_UNAVAILABLE');
}
export interface ProofRequestContext{
  actorId:string;activityId:string;asOf:string;now:()=>string;services:OwnerInsightsServices;signal:AbortSignal;
  guard:()=>Promise<void>;parse:(raw:unknown)=>OwnerInsightsSnapshot;snapshot?:Extract<OwnerInsightsSnapshot,{kind:'RECOGNITION'}>;
}
export async function loadRecognitionProofContext(input:ProofRequestContext){
  const p=input.services.proofReviews!;
  const guard=async()=>{if(input.signal.aborted)throw new ApiFailure('PROVIDER_UNAVAILABLE');await input.guard();if(input.signal.aborted)throw new ApiFailure('PROVIDER_UNAVAILABLE');};
  const records=await recordsFor(input.actorId,p,guard);
  const catalogue=checked(RecognitionDocumentCatalogueSchema,await p.documents.list({actorId:input.actorId,activityId:input.activityId,asOf:input.asOf,signal:input.signal}));
  if(catalogue.actorId!==input.actorId||catalogue.activityId!==input.activityId)throw new ApiFailure('PROVIDER_UNAVAILABLE');
  await guard();
  let snapshot=input.snapshot;
  if(!snapshot){const raw=await input.services.source.read({actorId:input.actorId,kind:'RECOGNITION',asOf:input.asOf});await guard();
    if(raw!==null){const parsed=input.parse(raw);if(parsed.kind!=='RECOGNITION'||parsed.receipt.actorId!==input.actorId)throw new ApiFailure('PROVIDER_UNAVAILABLE');snapshot=parsed;}}
  if(snapshot&&new Set(snapshot.cases.map(c=>c.activity.id)).size!==snapshot.cases.length)throw new ApiFailure('PROVIDER_UNAVAILABLE');
  const entry=snapshot?.cases.find(c=>c.activity.id===input.activityId);
  const sourceCurrent=!!snapshot&&Date.parse(snapshot.receipt.expiresAt)>Date.parse(input.now());
  const preparation=entry&&sourceCurrent?prepareRecognitionV2({rule:entry.rule,activity:recognitionActivityInfo(entry.activity),proofs:[],asOf:input.asOf,mode:'LIVE'}):null;
  const ruleUsable=!!entry&&sourceCurrent&&!!preparation
    &&['DOCUMENTS_PENDING','READY_FOR_OFFICIAL_REVIEW'].includes(preparation.status);
  const usable=ruleUsable&&catalogue.ocrAllowed;
  const expiresAt=new Date(Math.min(Date.parse(catalogue.expiresAt),ruleUsable&&snapshot?Date.parse(snapshot.receipt.expiresAt):Infinity,
    ruleUsable&&entry?.rule.source.effectiveUntil?Date.parse(entry.rule.source.effectiveUntil):Infinity,
    ruleUsable&&entry?.rule.applicationEndsAt?Date.parse(entry.rule.applicationEndsAt):Infinity)).toISOString();
  const contextVersion=(asset:Catalogue['assets'][number])=>hash({actorId:input.actorId,activityId:input.activityId,
    sourceVersion:snapshot?.receipt.sourceVersion??null,sourceConsent:snapshot?.receipt.consentVersion??null,
    sourceRights:snapshot?.receipt.rightsVersion??null,ruleId:entry?.rule.id??null,ruleRevisionId:entry?.rule.source.revisionId??null,
    activity:entry?.activity??null,consent:catalogue.consentVersion,storageConsentVersion:catalogue.storageConsentVersion,rights:catalogue.rightsVersion,asset});
  const assertLease=(purpose:'METADATA'|'PREPARATION'|'OCR_REVIEW')=>{
    if(Date.parse(catalogue.expiresAt)<=Date.parse(input.now())
      ||purpose!=='METADATA'&&(!(purpose==='PREPARATION'?ruleUsable:usable)||Date.parse(expiresAt)<=Date.parse(input.now())))
      throw new ApiFailure('FORBIDDEN');
  };
  const recheck=async(purpose:'METADATA'|'PREPARATION'|'OCR_REVIEW')=>{
    await guard();assertLease(purpose);
    if(await p.documents.revalidate({actorId:input.actorId,receipt:catalogue,purpose:purpose==='PREPARATION'?'METADATA':purpose,now:input.now(),signal:input.signal})!==true)
      throw new ApiFailure('FORBIDDEN');
    if(purpose!=='METADATA'&&(!snapshot||await input.services.source.revalidate({actorId:input.actorId,kind:'RECOGNITION',receipt:snapshot.receipt,now:input.now()})!==true))
      throw new ApiFailure('FORBIDDEN');
    await guard();assertLease(purpose);
  };
  await recheck('METADATA');
  const item=(asset:Catalogue['assets'][number]|undefined,record:Stored|undefined):V.RecognitionProofItem=>{
    const value=record?.value;
    if(value&&!active(value))return checked(V.RecognitionProofItemSchema,{proofId:record.itemId,activityId:input.activityId,assetId:value.assetId,
      assetVersion:value.assetVersion,version:record.version,state:'REDACTED',contextVersion:null,recordScopeVersion:value.scopeVersion,expiresAt:null,review:value});
    const scope=asset?contextVersion(asset):null;
    const current=!!asset&&!!value&&usable&&value.scopeVersion===scope&&value.assetVersion===asset.assetVersion&&'expiresAt' in value
      &&Date.parse(value.expiresAt)>Date.parse(input.now())&&value.ruleRevisionId===entry?.rule.source.revisionId
      &&value.ruleId===entry?.rule.id&&value.assetSha256===asset.assetSha256&&value.storageConsentVersion===catalogue.storageConsentVersion;
    const viewExpiry=current&&value&&'expiresAt' in value?new Date(Math.min(Date.parse(expiresAt),Date.parse(value.expiresAt))).toISOString():expiresAt;
    return checked(V.RecognitionProofItemSchema,{proofId:record?.itemId??recognitionProofId(input.actorId,input.activityId,asset!.assetId),activityId:input.activityId,
      assetId:asset?.assetId??value!.assetId,assetVersion:value?.assetVersion??asset!.assetVersion,version:record?.version??0,
      state:current?'CURRENT':record?'STALE':'AVAILABLE',contextVersion:scope,recordScopeVersion:value?.scopeVersion??null,
      expiresAt:asset?viewExpiry:null,review:current?value:null});
  };
  return {p,records:records.filter(r=>r.value.activityId===input.activityId),catalogue,entry,usable,ruleUsable,expiresAt,contextVersion,recheck,assertLease,item,guard};
}
export async function readRecognitionProofPage(input:ProofRequestContext){
  const c=await loadRecognitionProofContext(input),byAsset=new Map(c.records.map(r=>[r.value.assetId,r]));
  let items=c.catalogue.assets.map(asset=>c.item(asset,byAsset.get(asset.assetId)));
  for(const record of c.records)if(!c.catalogue.assets.some(a=>a.assetId===record.value.assetId))items.push(c.item(undefined,record));
  const hidden=new Set<string>();
  for(const item of items){
    if(item.state==='CURRENT'||item.state==='AVAILABLE'){
      if(await c.p.cleanup.isAssetBlocked({actorId:input.actorId,assetId:item.assetId})){
        if(item.version===0){hidden.add(item.proofId);continue;}item.state='STALE';item.review=null;
      }
    }
  }
  items=items.filter(item=>!hidden.has(item.proofId));
  let report:V.RecognitionReportV2|null=null;let originalBlocked=new Set<string>();
  if(c.ruleUsable&&c.entry){
    const blocked=new Set(await c.p.cleanup.blockedProofIds({actorId:input.actorId,itemIds:c.entry.proofs.map(p=>p.id)}));
    originalBlocked=blocked;
    const own=new Set(c.records.map(r=>r.itemId));
    const ownerProofs=items.flatMap(item=>{
      if(item.state!=='CURRENT'||!item.review||!item.contextVersion)return [];
      const proof=recognitionProofFromReview(item.review,{rule:c.entry!.rule,scopeVersion:item.contextVersion,asOf:input.now(),mode:'LIVE'});return proof?[proof]:[];
    });
    report=checked(V.RecognitionReportV2Schema,prepareRecognitionV2({rule:c.entry.rule,activity:recognitionActivityInfo(c.entry.activity),
      proofs:[...c.entry.proofs.filter(p=>!own.has(p.id)&&!blocked.has(p.id)),...ownerProofs],asOf:input.asOf,mode:'LIVE'}));
  }
  await c.recheck(c.usable?'OCR_REVIEW':c.ruleUsable?'PREPARATION':'METADATA');
  for(const item of items)if((item.state==='CURRENT'||item.state==='AVAILABLE')
    &&await c.p.cleanup.isAssetBlocked({actorId:input.actorId,assetId:item.assetId}))throw new ApiFailure('FORBIDDEN');
  if(c.ruleUsable&&c.entry){const latest=await c.p.cleanup.blockedProofIds({actorId:input.actorId,itemIds:c.entry.proofs.map(p=>p.id)});
    if(latest.some(id=>!originalBlocked.has(id)))throw new ApiFailure('FORBIDDEN');}
  const finalRecords=(await recordsFor(input.actorId,c.p,c.guard)).filter(r=>r.value.activityId===input.activityId);
  if(canonical(finalRecords)!==canonical(c.records))throw new ProofReviewStale();
  await c.guard();
  c.assertLease(c.usable?'OCR_REVIEW':c.ruleUsable?'PREPARATION':'METADATA');
  if(items.some(item=>item.state==='CURRENT'&&(!item.expiresAt||Date.parse(item.expiresAt)<=Date.parse(input.now()))))throw new ApiFailure('FORBIDDEN');
  return checked(V.RecognitionProofPageSchema,{state:'READY',activityId:input.activityId,asOf:input.asOf,ruleState:c.ruleUsable?'CURRENT':'UNAVAILABLE',ocrAllowed:c.usable,
    ruleRevisionId:c.ruleUsable?c.entry!.rule.source.revisionId:null,expiresAt:c.expiresAt,preparation:report,items});
}
async function currentProofResponse(input:ProofRequestContext,c:Awaited<ReturnType<typeof loadRecognitionProofContext>>,asset:Catalogue['assets'][number],record:Stored){
  await c.recheck('OCR_REVIEW');
  if(await c.p.cleanup.isAssetBlocked({actorId:input.actorId,assetId:asset.assetId}))throw new ApiFailure('FORBIDDEN');
  const latest=await c.p.store.read({actorId:input.actorId,kind:'RECOGNITION_PROOF',itemId:record.itemId});
  if(!latest)throw new ProofReviewStale();const checked=checkedProofRecord(latest,input.actorId,input.activityId);
  if(checked.version!==record.version||canonical(checked.value)!==canonical(record.value))throw new ProofReviewStale();
  await c.guard();c.assertLease('OCR_REVIEW');const item=c.item(asset,record);if(item.state!=='CURRENT')throw new ProofReviewStale();return {state:'READY' as const,item};
}
export async function extractRecognitionProof(input:ProofRequestContext,assetId:string,change:z.infer<typeof V.RecognitionProofExtractSchema>){
  const c=await loadRecognitionProofContext(input),asset=c.catalogue.assets.find(a=>a.assetId===assetId);
  if(!asset||!c.usable||!c.entry)throw new ApiFailure('FORBIDDEN');
  const old=c.records.find(r=>r.value.assetId===assetId);
  if((old?.version??0)!==change.expectedVersion||change.contextVersion!==c.contextVersion(asset)
    ||old&&(!active(old.value)||old.value.assetVersion!==asset.assetVersion))throw new ProofReviewStale();
  if(await c.p.cleanup.isAssetBlocked({actorId:input.actorId,assetId}))throw new ApiFailure('FORBIDDEN');
  await c.recheck('OCR_REVIEW');
  const raw=await c.p.documents.extract({actorId:input.actorId,assetId,assetVersion:asset.assetVersion,receipt:c.catalogue,now:input.now(),signal:input.signal});
  const extraction=checked(ProofReviewExtractionSchema,raw);
  await c.recheck('OCR_REVIEW');if(await c.p.cleanup.isAssetBlocked({actorId:input.actorId,assetId}))throw new ApiFailure('FORBIDDEN');await c.guard();
  const proofId=recognitionProofId(input.actorId,input.activityId,assetId);
  const value=createProofReview({proofId,activityId:input.activityId,assetId,assetVersion:asset.assetVersion,assetSha256:asset.assetSha256,
    scopeVersion:change.contextVersion,storageConsentVersion:c.catalogue.storageConsentVersion,expiresAt:c.expiresAt,evidencePage:extraction.evidencePage,lines:extraction.lines,
    ...(extraction.claimed?{claimed:{...(extraction.claimed.organization!==undefined?{organization:extraction.claimed.organization}:{}),
      ...(extraction.claimed.startDate!==undefined?{startDate:extraction.claimed.startDate}:{}),
      ...(extraction.claimed.endDate!==undefined?{endDate:extraction.claimed.endDate}:{})}}:{}),rule:c.entry.rule,asOf:input.now(),mode:'LIVE'});
  await c.guard();const record=checkedProofRecord(old?await c.p.store.update({actorId:input.actorId,kind:'RECOGNITION_PROOF',itemId:proofId,expectedVersion:old.version,value})
    :await c.p.store.create({actorId:input.actorId,itemId:proofId,value}),input.actorId,input.activityId);
  if(record.version!==change.expectedVersion+1||canonical(record.value)!==canonical(value))throw new ApiFailure('PROVIDER_UNAVAILABLE');
  return currentProofResponse(input,c,asset,record);
}
export async function confirmRecognitionProof(input:ProofRequestContext,proofId:string,change:z.infer<typeof V.RecognitionProofConfirmSchema>){
  const c=await loadRecognitionProofContext(input),old=c.records.find(r=>r.itemId===proofId),asset=c.catalogue.assets.find(a=>a.assetId===old?.value.assetId);
  if(!old||!asset||!c.entry||old.version!==change.expectedVersion||c.item(asset,old).state!=='CURRENT'||change.contextVersion!==c.contextVersion(asset))throw new ProofReviewStale();
  await c.recheck('OCR_REVIEW');if(await c.p.cleanup.isAssetBlocked({actorId:input.actorId,assetId:asset.assetId}))throw new ApiFailure('FORBIDDEN');
  const value=confirmProofReview(old.value,{rule:c.entry.rule,scopeVersion:change.contextVersion,asOf:input.now(),mode:'LIVE',
    maskingConfirmed:change.maskingConfirmed,acceptedFieldNames:change.acceptedFieldNames});
  await c.guard();const record=checkedProofRecord(await c.p.store.update({actorId:input.actorId,kind:'RECOGNITION_PROOF',itemId:proofId,expectedVersion:old.version,value}),input.actorId,input.activityId);
  if(record.version!==old.version+1||canonical(record.value)!==canonical(value))throw new ApiFailure('PROVIDER_UNAVAILABLE');
  return currentProofResponse(input,c,asset,record);
}
export function redactedProofItem(record:Stored):V.RecognitionProofItem{
  if(active(record.value))throw new ApiFailure('PROVIDER_UNAVAILABLE');
  return checked(V.RecognitionProofItemSchema,{proofId:record.itemId,activityId:record.value.activityId,assetId:record.value.assetId,assetVersion:record.value.assetVersion,
    version:record.version,state:'REDACTED',contextVersion:null,recordScopeVersion:record.value.scopeVersion,expiresAt:null,review:record.value});
}
function cleanupJob(actorId:string,record:Stored):ProofCleanupJob{
  return {actorId,itemId:record.itemId,assetId:record.value.assetId,assetVersion:record.value.assetVersion,recordVersion:record.version,
    operation:record.value.state==='REJECTED'?'PURGE_EXTRACTION':'PURGE_DOCUMENT'};
}
export async function redactRecognitionProof(input:ProofRequestContext,proofId:string,change:z.infer<typeof V.RecognitionProofRedactSchema>){
  const p=input.services.proofReviews!;await input.guard();if(input.signal.aborted)throw new ApiFailure('PROVIDER_UNAVAILABLE');
  const raw=await p.store.read({actorId:input.actorId,kind:'RECOGNITION_PROOF',itemId:proofId});
  const old=raw?checkedProofRecord(raw,input.actorId,input.activityId):undefined;
  if((old?.version??0)!==change.expectedVersion)throw new ProofReviewStale();
  let value:V.RecognitionProofReview;
  if(old){if(old.value.scopeVersion!==change.scopeVersion)throw new ProofReviewStale();value=redactProofReview(old.value,{action:change.action,asOf:input.now()});}
  else{
    if(change.action==='REJECT')throw new ProofReviewStale();
    const c=await loadRecognitionProofContext(input),asset=c.catalogue.assets.find(a=>recognitionProofId(input.actorId,input.activityId,a.assetId)===proofId);
    if(!asset||c.contextVersion(asset)!==change.scopeVersion)throw new ProofReviewStale();await c.recheck('METADATA');
    value=checked(V.RecognitionProofReviewSchema,{kind:'RECOGNITION_PROOF',dataMode:'OWNER_CONSENTED',proofId,activityId:input.activityId,
      assetId:asset.assetId,assetVersion:asset.assetVersion,scopeVersion:change.scopeVersion,state:change.action==='WITHDRAW'?'WITHDRAWN':'DELETION_PENDING',
      storageConsentVersion:c.catalogue.storageConsentVersion,
      cleanupState:'PENDING',redactedAt:input.now(),officiallyRecognized:false,modelInputAllowed:false});
  }
  await input.guard();if(input.signal.aborted)throw new ApiFailure('PROVIDER_UNAVAILABLE');
  const record=checkedProofRecord(old?await p.store.update({actorId:input.actorId,kind:'RECOGNITION_PROOF',itemId:proofId,expectedVersion:old.version,value})
    :await p.store.create({actorId:input.actorId,itemId:proofId,value}),input.actorId,input.activityId);
  if(record.version!==change.expectedVersion+1||canonical(record.value)!==canonical(value))throw new ApiFailure('PROVIDER_UNAVAILABLE');
  if(!await p.cleanup.find({job:cleanupJob(input.actorId,record)}))throw new ApiFailure('PROVIDER_UNAVAILABLE');
  await input.guard();return {state:'READY' as const,item:redactedProofItem(record)};
}
export async function cleanupRecognitionProof(input:ProofRequestContext,proofId:string,change:z.infer<typeof V.RecognitionProofCleanupSchema>){
  const p=input.services.proofReviews!;await input.guard();const raw=await p.store.read({actorId:input.actorId,kind:'RECOGNITION_PROOF',itemId:proofId});
  if(!raw)throw new ProofReviewStale();const old=checkedProofRecord(raw,input.actorId,input.activityId),value=old.value;
  if(old.version!==change.expectedVersion||value.scopeVersion!==change.scopeVersion||active(value))throw new ProofReviewStale();
  if('cleanupState' in value&&value.cleanupState==='ACKNOWLEDGED')return {state:'READY' as const,item:redactedProofItem(old)};
  const job=cleanupJob(input.actorId,old);
  await input.guard();if(input.signal.aborted)throw new ApiFailure('PROVIDER_UNAVAILABLE');
  await drainProofCleanup({actorId:input.actorId,outbox:p.cleanup,...(p.eraser?{eraser:p.eraser}:{}),now:input.now,limit:1,target:job,signal:input.signal});
  const status=await p.cleanup.find({job});await input.guard();if(input.signal.aborted)throw new ApiFailure('PROVIDER_UNAVAILABLE');
  if(!status)throw new ApiFailure('PROVIDER_UNAVAILABLE');
  if(status.state!=='ERASED'||!status.receiptId)return {state:'READY' as const,item:redactedProofItem(old)};
  const updated=redactProofReview(value,{action:value.state==='DELETION_PENDING'?'ACK_DELETE':'ACK_CLEANUP',asOf:input.now(),removalReceiptId:status.receiptId});
  const record=checkedProofRecord(await p.store.update({actorId:input.actorId,kind:'RECOGNITION_PROOF',itemId:proofId,expectedVersion:old.version,value:updated}),input.actorId,input.activityId);
  if(record.version!==old.version+1||canonical(record.value)!==canonical(updated))throw new ApiFailure('PROVIDER_UNAVAILABLE');await input.guard();
  return {state:'READY' as const,item:redactedProofItem(record)};
}
