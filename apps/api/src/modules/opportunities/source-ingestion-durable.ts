import {createHash,randomUUID} from 'node:crypto';
import type {SourceRevisionVNext} from '@hufs-one/contracts';
import type {ReviewerSqlPool} from '../auth/reviewer-postgres.js';
import type {
  ApprovedFetchPolicy,ApprovedSourceRightsResolver,SourceContentExtractor,SourceUsePurpose,
} from './approved-fetch.js';
import {createApprovedPinnedTransport} from './approved-egress.js';
import type {ApprovedPinnedEgress} from './approved-egress.js';
import type {TrustedDurableSourceExecutor} from './source-ingestion-queue-postgres.js';
import {PostgresSourceRevisionWriter} from './temporal-writer-postgres.js';
import {hashRevisionParagraphs,type RevisionParagraph} from './revision-ledger.js';
import type {SourceImageExtractor} from './approved-image-extractor.js';
import {parseSourceImageEvidence} from './source-image-evidence.js';
import type {SourcePdfExtractor} from './approved-pdf-extractor.js';
import {parseSourcePdfEvidence,type SourcePdfRaster} from './source-pdf-evidence.js';
import {discardUnreadSourceBody,readApprovedSourceBody} from './source-response-body.js';
import {KOREAN_DOCUMENT_MIMES,parseSourceDocumentDraft,type SourceDocumentExtractor} from './source-document-extractor.js';
import {acquireApprovedSourceResponse,type ApprovedSourceAcquisition} from './source-acquisition.js';
import {requireCurrentSourceRefreshPreflight,type TrustedSourceRefreshPreflight}
  from './source-refresh-operator-preflight.js';
import {requireSourceRuntimeVersion,pinSourceRuntimeVersion,type TrustedSourceRuntimeVersion} from './source-runtime-version.js';
import type {TrustedSourceRefreshBudget} from './source-refresh-budget.js';
import type {SourceBrowserExtractor} from './source-browser-extractor.js';
import {parseSourceBrowserEvidence,SourceBrowserRendererSchema} from './source-browser-evidence.js';

const ALLOWED=new Set(['text/plain','text/html','application/rss+xml',
  'application/atom+xml','application/xml','text/xml',
  'application/pdf','image/png','image/jpeg']);
const SHA=(v:Uint8Array)=>createHash('sha256').update(v).digest('hex');
const SAFE_HTTP_VALIDATOR=/^[\x20-\x7e]{1,200}$/;
function safeValidator(value:string|null):string|null{
  return value!==null&&SAFE_HTTP_VALIDATOR.test(value)?value:null;
}
type StoredHead={
  revisionId:string;originalSha256:string;contentSha256:string;
  fetchedAt:string;permissionRef:string;etag:string|null;lastModified:string|null;
  mediaKind:string;hasImageEvidence:boolean;hasPdfEvidence:boolean;browserRenderingSha256:string|null;
};
function stringDate(value:unknown):string{
  if(value instanceof Date)return value.toISOString();
  if(typeof value==='string'&&Number.isFinite(Date.parse(value)))
    return new Date(value).toISOString();
  throw new Error('Invalid source head time');
}
function reviewPolicy(policy:ApprovedFetchPolicy,sourceId:string,permissionRef:string):URL{
  if(policy.sourceId!==sourceId||policy.permissionRef!==permissionRef
    ||!policy.rightsReviewed
    ||!['SYNTHETIC','LICENSED_EXTERNAL'].includes(policy.sourceClass)
    ||!['SYNTHETIC','REAL_APPROVED'].includes(policy.provenance)
    ||(policy.sourceClass==='SYNTHETIC')!==(policy.provenance==='SYNTHETIC'))
    throw new Error('Unreviewed source policy');
  const u=new URL(policy.canonicalUrl),origin=new URL(policy.approvedOrigin);
  if(u.origin!==origin.origin||origin.pathname!=='/'||origin.search
    ||origin.hash||u.protocol!=='https:'||u.hash||u.username||u.password||u.port)
    throw new Error('Noncanonical source authority');
  return u;
}
async function approvedFingerprint(input:{
  policy:ApprovedFetchPolicy;resolver:ApprovedSourceRightsResolver;now:string;
  purposes?:readonly SourceUsePurpose[];
}):Promise<string>{
  const {policy,resolver,now}=input;
  if(input.purposes===undefined&&policy.provenance==='SYNTHETIC'&&policy.sourceClass==='SYNTHETIC')
    return 'SYNTHETIC_TEST_ONLY';
  const r=await resolver.resolve({sourceId:policy.sourceId,
    permissionRef:policy.permissionRef,now});
  if(!r||r.status!=='APPROVED'||r.sourceId!==policy.sourceId
    ||r.canonicalUrl!==policy.canonicalUrl||r.permissionRef!==policy.permissionRef
    ||!r.policyVersion||!r.reviewedBy
    ||!Number.isFinite(Date.parse(r.reviewedAt))||Date.parse(r.reviewedAt)>Date.parse(now)
    ||(r.expiresAt!==undefined&&(Date.parse(r.expiresAt)<=Date.parse(now)
      ||!Number.isFinite(Date.parse(r.expiresAt))))
    ||(input.purposes??['COLLECT','STORE']).some(purpose=>!r.allowedPurposes.has(purpose)))
    throw new Error('Source rights unavailable');
  return JSON.stringify({version:r.policyVersion,reviewer:r.reviewedBy,
    reviewedAt:r.reviewedAt,expiry:r.expiresAt??null,
    purposes:[...r.allowedPurposes].sort()});
}
/**
 * Deliberately no dynamic source discovery, generic web crawl or scheduled job.
 * A source must be registered by an independent operator in the exact URL
 * allowlist; no transport is used until purpose-scoped rights are verified.
 */
export function createApprovedDurableSourceExecutor(options:{
  policies:ReadonlyMap<string,ApprovedFetchPolicy>;
  rights:ApprovedSourceRightsResolver;
  egress:ApprovedPinnedEgress;
  extractor:SourceContentExtractor;
  /** Optional native crawler; gets one guarded request, never arbitrary egress. */
  acquisition?:ApprovedSourceAcquisition;
  /** Mandatory private live policy/robots/terms/budget snapshot for native acquisition. */
  preflight?:TrustedSourceRefreshPreflight;
  runtimeVersion?:TrustedSourceRuntimeVersion;
  budget?:TrustedSourceRefreshBudget;
  /** Optional local HWP/HWPX parser. Its output never constitutes human review. */
  documentExtractor?:SourceDocumentExtractor;
  /** Explicit private image adapter; absent means binary extraction is refused. */
  imageExtractor?:SourceImageExtractor;
  /** Explicit pinned local renderer and independently approved OCR adapter. */
  pdfExtractor?:SourcePdfExtractor;
  browserExtractor?:SourceBrowserExtractor;
  readerPool:ReviewerSqlPool;
  writer:Pick<PostgresSourceRevisionWriter,'append'|'observeUnchanged'|'storeHttpValidators'>;
  now?:()=>string;
}):TrustedDurableSourceExecutor{
  const native=Boolean(options.acquisition||options.browserExtractor);
  const browserRenderer=options.browserExtractor?SourceBrowserRendererSchema.parse(options.browserExtractor.renderer):undefined;
  if(native&&typeof options.preflight?.loadCurrent!=='function')
    throw new Error('Approved source preflight configuration required');
  if(native&&typeof options.runtimeVersion?.loadCurrent!=='function')
    throw new Error('Source runtime version configuration required');
  if(native&&typeof options.budget?.reserve!=='function')
    throw new Error('Source refresh budget configuration required');
  const runtimeVersion=options.runtimeVersion?pinSourceRuntimeVersion(options.runtimeVersion):undefined;
  const runtimeAudit=runtimeVersion?{runtimeManifest:runtimeVersion.expected}:{};
  const now=options.now??(()=>new Date().toISOString());
  const requireVersion=async(sourceId:string,permissionRef:string)=>{
    if(runtimeVersion)await requireSourceRuntimeVersion(runtimeVersion,{sourceId,permissionRef,now:now()});
  };
  const readHead=async(sourceId:string,canonicalUrl:string):Promise<StoredHead|null>=>{
    const c=await options.readerPool.connect();
    try{
      const r=await c.query(`SELECT h.revision_id,r.original_sha256,r.content_sha256,
        r.fetched_at,r.permission_ref,r.media_kind,v.etag,v.last_modified,
        EXISTS(SELECT 1 FROM source_paragraphs_vnext p
          WHERE p.revision_id=r.revision_id AND p.image_span IS NOT NULL) AS has_image_evidence,
        EXISTS(SELECT 1 FROM source_paragraphs_vnext p
          WHERE p.revision_id=r.revision_id
            AND p.image_span->>'transformVersion'='pdf-full-page-v1') AS has_pdf_evidence,
        b.rendering_sha256 AS browser_rendering_sha256
        FROM source_ingest_heads h LEFT JOIN source_revisions_vnext r
          ON r.revision_id=h.revision_id
        LEFT JOIN source_http_validators v ON v.source_id=h.source_id
          AND v.revision_id=h.revision_id AND v.canonical_url=$2
        LEFT JOIN source_browser_revision_metadata_vnext b ON b.revision_id=h.revision_id
        WHERE h.source_id=$1`,[sourceId,canonicalUrl]);
      if(r.rows.length>1)throw new Error('Multiple source heads');
      if(r.rows.length===0||r.rows[0]?.revision_id===null)return null;
      const v=r.rows[0]!;
      if(typeof v.revision_id!=='string'||typeof v.original_sha256!=='string'
        ||typeof v.content_sha256!=='string'||typeof v.permission_ref!=='string')
        throw new Error('Malformed source head');
      return {revisionId:v.revision_id,originalSha256:v.original_sha256,
        contentSha256:v.content_sha256,fetchedAt:stringDate(v.fetched_at),
        permissionRef:v.permission_ref,
        etag:typeof v.etag==='string'?v.etag:null,
        lastModified:typeof v.last_modified==='string'?v.last_modified:null,
        mediaKind:typeof v.media_kind==='string'?v.media_kind:'TEXT',hasImageEvidence:v.has_image_evidence===true,
        hasPdfEvidence:v.has_pdf_evidence===true,
        browserRenderingSha256:typeof v.browser_rendering_sha256==='string'?v.browser_rendering_sha256:null};
    }finally{c.release();}
  };
  return {
    async execute(raw){
      const input={...raw},registered=options.policies.get(input.sourceId);
      if(!registered)throw new Error('Source was not allowlisted');
      const policy={...registered};
      const u=reviewPolicy(policy,input.sourceId,input.permissionRef);
      const at=now(),initial=await approvedFingerprint({policy,resolver:options.rights,now:at});
      if(runtimeVersion)await requireSourceRuntimeVersion(runtimeVersion,{...input,now:at});
      if(native)await requireCurrentSourceRefreshPreflight(
        options.preflight!,{sourceId:input.sourceId,permissionRef:input.permissionRef,
          canonicalUrl:u.href,now:at});
      const head=await readHead(input.sourceId,u.href);
      if(head&&head.permissionRef!==input.permissionRef)
        throw new Error('Existing source permission changed');
      // The transport independently checks A/AAAA twice, rejects internal IPs
      // and connects to the pinned address using hostname/SNI TLS validation.
      const transport=createApprovedPinnedTransport({canonicalUrl:u.href,beforeSend:async()=>{
        // Head lookup and both DNS checks may outlive the original grant.
        // Revalidate the same COLLECT/STORE authority immediately before HTTP.
        const currentTime=now();
        if(runtimeVersion)await requireSourceRuntimeVersion(runtimeVersion,{...input,now:currentTime});
        if(await approvedFingerprint({policy,resolver:options.rights,now:currentTime})!==initial)
          throw new Error('Source rights changed before HTTP');
        // A queue admission preflight is not a network grant. Re-read the
        // private operator's current robots/terms/TTL/budget immediately
        // before the one-use pinned network operation.
        if(native)await requireCurrentSourceRefreshPreflight(
          options.preflight!,{sourceId:input.sourceId,permissionRef:input.permissionRef,
            canonicalUrl:u.href,now:currentTime});
        // Reserve the complete response cap durably before any request bytes
        // leave the host. Never refund failures, 304s or unknown outcomes.
        if(options.budget&&await options.budget.reserve({sourceId:input.sourceId,
          permissionRef:input.permissionRef,canonicalUrl:u.href,now:currentTime})!==true)
          throw new Error('Source refresh budget exhausted');
        if(options.budget){
          if(await approvedFingerprint({policy,resolver:options.rights,now:now()})!==initial)
            throw new Error('Source rights changed during budget admission');
          await requireVersion(input.sourceId,input.permissionRef);
        }
      }},options.egress);
      const headers:Record<string,string>={
        Accept:[...ALLOWED,...(options.documentExtractor?KOREAN_DOCUMENT_MIMES.keys():[])].join(','),
      };
      // An unchanged main document says nothing about its rendered resources.
      // Also force a fresh response when transitioning away from browser mode.
      const conditional=!options.browserExtractor&&!head?.browserRenderingSha256;
      if(conditional&&head?.etag)headers['If-None-Match']=head.etag;
      if(conditional&&head?.lastModified)headers['If-Modified-Since']=head.lastModified;
      const response=await acquireApprovedSourceResponse({canonicalUrl:u.href,
        ...(options.acquisition?{acquisition:options.acquisition}:{}),
        request:signal=>transport(u,{method:'GET',redirect:'error',credentials:'omit',
          headers,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(5000)]):AbortSignal.timeout(5000)})});
      try{
      // Conditional requests are valid only with a persisted validator for
      // exactly this canonical URL and current immutable source revision.
      if(response.status===304){
        if(!conditional||!head||(!head.etag&&!head.lastModified))
          throw new Error('Unconditional 304 refused');
        if(await approvedFingerprint({policy,resolver:options.rights,now:now()})!==initial)
          throw new Error('Source rights changed during conditional fetch');
        await requireVersion(input.sourceId,input.permissionRef);
        await options.writer.observeUnchanged({sourceId:input.sourceId,
          revisionId:head.revisionId,checkedAt:now(),responseStatus:304,...runtimeAudit});
        return {kind:'NOT_MODIFIED',revisionId:head.revisionId};
      }
      if(response.status!==200)throw new Error('Unapproved source response');
      const etag=safeValidator(response.headers.get('etag'));
      const lastModified=safeValidator(response.headers.get('last-modified'));
      const media=(response.headers.get('content-type')??'').split(';')[0]!.trim().toLowerCase();
      const documentKind=KOREAN_DOCUMENT_MIMES.get(media);
      if(!ALLOWED.has(media)&&!documentKind)throw new Error('Unsupported approved content type');
      const bytes=await readApprovedSourceBody(response),originalSha256=SHA(bytes);
      const revisionId='revision-'+randomUUID();
      let image:ReturnType<typeof parseSourceImageEvidence>|undefined;
      let browser:ReturnType<typeof parseSourceBrowserEvidence>|undefined;
      let pdf:ReturnType<typeof parseSourcePdfEvidence>|undefined,pdfRasters:SourcePdfRaster[]|undefined;
      let revalidateMedia:(()=>Promise<void>)|undefined;
      let paragraphs:RevisionParagraph[];
      if(documentKind){
        if(!options.documentExtractor)throw new Error('Approved document extractor unavailable');
        // Give the optional adapter a copy: it cannot mutate retained original bytes.
        const extracted=await options.documentExtractor.extract({content:Buffer.from(bytes),contentType:media,
          canonicalUrl:u.href,sourceId:input.sourceId,revisionId});
        paragraphs=parseSourceDocumentDraft(extracted,{sourceId:input.sourceId,revisionId,
          mediaKind:documentKind,originalSha256});
      }else if(media==='application/pdf'){
        if(head?.mediaKind==='PDF'&&head.hasPdfEvidence&&head.originalSha256===originalSha256){
          if(await approvedFingerprint({policy,resolver:options.rights,now:now()})!==initial)
            throw new Error('Source rights changed during PDF check');
          const checkedAt=now();
          await requireVersion(input.sourceId,input.permissionRef);
          await options.writer.observeUnchanged({sourceId:input.sourceId,revisionId:head.revisionId,checkedAt,responseStatus:200,...runtimeAudit});
          await requireVersion(input.sourceId,input.permissionRef);
          await options.writer.storeHttpValidators({sourceId:input.sourceId,revisionId:head.revisionId,
            canonicalUrl:u.href,checkedAt,etag,lastModified});
          return {kind:'NOT_MODIFIED',revisionId:head.revisionId};
        }
        if(!options.pdfExtractor)throw new Error('Approved PDF extractor unavailable');
        const purposes=['COLLECT','STORE','EXTERNAL_TRANSFER'] as const;
        const processingRights=await approvedFingerprint({policy,resolver:options.rights,now:now(),purposes});
        if(initial!=='SYNTHETIC_TEST_ONLY'&&processingRights!==initial)
          throw new Error('Source rights changed before PDF processing');
        const assertSourceRights=async()=>{
          if(await approvedFingerprint({policy,resolver:options.rights,now:now(),purposes})!==processingRights)
            throw new Error('Source rights changed during PDF processing');
        };
        const prepared=await options.pdfExtractor.extract({
          content:Buffer.from(bytes),contentType:media,canonicalUrl:u.href,sourceId:input.sourceId,
          sourceRevisionId:revisionId,permissionRef:input.permissionRef,actorRef:input.actorRef,
          assetId:'asset-'+randomUUID(),originalSha256,assertSourceRights,
        });
        if(typeof prepared.revalidate!=='function')throw new Error('PDF authority recheck unavailable');
        const recheck=prepared.revalidate;
        pdf=parseSourcePdfEvidence(prepared.evidence,{sourceId:input.sourceId,revisionId,
          permissionRef:input.permissionRef,originalSha256});
        if(pdf.evidence.originalByteLength!==bytes.byteLength||!Array.isArray(prepared.rasters)
          ||prepared.rasters.length!==pdf.evidence.pageCount)throw new Error('PDF raster proof unavailable');
        pdfRasters=prepared.rasters.map((raster,index)=>{
          const page=pdf!.evidence.pages[index]!;
          if(!raster||raster.pageIndex!==index||raster.assetId!==page.assetId
            ||raster.rasterSha256!==page.rasterSha256||raster.width!==page.width||raster.height!==page.height
            ||!(raster.bytes instanceof Uint8Array)||raster.bytes.byteLength!==page.rasterByteLength)
            throw new Error('PDF raster proof mismatch');
          const retained=Buffer.from(raster.bytes);
          if(SHA(retained)!==page.rasterSha256)throw new Error('PDF raster proof mismatch');
          return {pageIndex:index,assetId:page.assetId,rasterSha256:page.rasterSha256,
            width:page.width,height:page.height,bytes:retained};
        });
        revalidateMedia=async()=>{await recheck();await assertSourceRights();};
        await revalidateMedia();paragraphs=pdf.paragraphs;
      }else if(media==='image/png'||media==='image/jpeg'){
        if(head?.mediaKind==='IMAGE'&&head.hasImageEvidence&&head.originalSha256===originalSha256){
          if(await approvedFingerprint({policy,resolver:options.rights,now:now()})!==initial)
            throw new Error('Source rights changed during image check');
          const checkedAt=now();
          await requireVersion(input.sourceId,input.permissionRef);
          await options.writer.observeUnchanged({sourceId:input.sourceId,revisionId:head.revisionId,checkedAt,responseStatus:200,...runtimeAudit});
          await requireVersion(input.sourceId,input.permissionRef);
          await options.writer.storeHttpValidators({sourceId:input.sourceId,revisionId:head.revisionId,
            canonicalUrl:u.href,checkedAt,etag,lastModified});
          return {kind:'NOT_MODIFIED',revisionId:head.revisionId};
        }
        if(!options.imageExtractor)throw new Error('Approved image extractor unavailable');
        const purposes=['COLLECT','STORE','EXTERNAL_TRANSFER'] as const;
        const processingRights=await approvedFingerprint({policy,resolver:options.rights,now:now(),purposes});
        if(initial!=='SYNTHETIC_TEST_ONLY'&&processingRights!==initial)
          throw new Error('Source rights changed before image processing');
        const assertSourceRights=async()=>{
          if(await approvedFingerprint({policy,resolver:options.rights,now:now(),purposes})!==processingRights)
            throw new Error('Source rights changed during image processing');
        };
        const prepared=await options.imageExtractor.extract({
          content:bytes,contentType:media,canonicalUrl:u.href,sourceId:input.sourceId,
          sourceRevisionId:revisionId,permissionRef:input.permissionRef,actorRef:input.actorRef,
          assetId:'asset-'+randomUUID(),originalSha256,assertSourceRights,
        });
        if(typeof prepared.revalidate!=='function')throw new Error('Image authority recheck unavailable');
        revalidateMedia=async()=>{await prepared.revalidate();await assertSourceRights();};
        await revalidateMedia();
        image=parseSourceImageEvidence(prepared.evidence,{sourceId:input.sourceId,revisionId,
          permissionRef:input.permissionRef,originalSha256});
        paragraphs=image.paragraphs;
      }else if(media==='text/html'&&options.browserExtractor){
        const assertSourceRights=async()=>{
          if(await approvedFingerprint({policy,resolver:options.rights,now:now()})!==initial)
            throw new Error('Source rights changed during browser processing');
          await requireVersion(input.sourceId,input.permissionRef);
        };
        await assertSourceRights();
        const prepared=await options.browserExtractor.extract({content:Buffer.from(bytes),
          contentType:response.headers.get('content-type')!,canonicalUrl:u.href,
          sourceId:input.sourceId,sourceRevisionId:revisionId,permissionRef:input.permissionRef,
          actorRef:input.actorRef,originalSha256,assertSourceRights});
        if(typeof prepared.revalidate!=='function')throw new Error('Browser authority recheck unavailable');
        revalidateMedia=async()=>{await prepared.revalidate();await assertSourceRights();};
        await revalidateMedia();
        browser=parseSourceBrowserEvidence(prepared.evidence,prepared.domBytes,prepared.paragraphs,{
          sourceId:input.sourceId,revisionId,permissionRef:input.permissionRef,
          originalSha256,originalByteLength:bytes.length,asOf:now(),expectedRenderer:browserRenderer!});
        if(browser.evidence.canonicalUrl!==u.href)throw new Error('Browser canonical URL mismatch');
        paragraphs=browser.paragraphs;
      }else paragraphs=await options.extractor.extract({content:bytes,contentType:media,canonicalUrl:u.href});
      if(!Array.isArray(paragraphs)||!paragraphs.length||paragraphs.length>200
        ||paragraphs.some(p=>!p.id||!p.text||p.text.length>20_000
          ||/<script\b/i.test(p.text)))
        throw new Error('Unreviewed extraction result');
      const contentSha256=hashRevisionParagraphs(paragraphs);
      if(await approvedFingerprint({policy,resolver:options.rights,now:now()})!==initial)
        throw new Error('Source rights changed during IO');
      // Duplicate content never upgrades human verification timestamps.
      if(head&&head.originalSha256===originalSha256
        &&head.contentSha256===contentSha256&&(media!=='application/pdf'||head.hasPdfEvidence)
        &&head.browserRenderingSha256===(browser?.evidence.renderingSha256??null)){
        const checkedAt=now();
        if(revalidateMedia)await revalidateMedia();
        await requireVersion(input.sourceId,input.permissionRef);
        await options.writer.observeUnchanged({sourceId:input.sourceId,
          revisionId:head.revisionId,checkedAt,responseStatus:200,...runtimeAudit});
        await requireVersion(input.sourceId,input.permissionRef);
        await options.writer.storeHttpValidators({sourceId:input.sourceId,
          revisionId:head.revisionId,canonicalUrl:u.href,checkedAt,etag,lastModified});
        return {kind:'NOT_MODIFIED',revisionId:head.revisionId};
      }
      const checkedAt=now();
      if(head&&Date.parse(checkedAt)<=Date.parse(head.fetchedAt))
        throw new Error('Nonmonotonic revision time');
      const mediaKind=documentKind??(pdf?'PDF':image?'IMAGE':media==='text/html'?'HTML':'TEXT');
      const revision:SourceRevisionVNext={
        sourceId:input.sourceId,revisionId,
        ...(head?{supersedes:head.revisionId}:{}),
        originalSha256,contentSha256,mediaKind,
        sourceClass:policy.sourceClass,permissionRef:policy.permissionRef,
        provenance:policy.provenance,status:'NEEDS_REVIEW',
        changeKind:head?'CORRECTED':'NEW',
        fetchedAt:checkedAt,lastCheckedAt:checkedAt,topicCodes:[],
      };
      let pdfInput:{pdfEvidence:unknown;pdfRasters:SourcePdfRaster[]}|undefined;
      if(pdf){
        if(!pdfRasters)throw new Error('PDF raster proof unavailable');
        pdfInput={pdfEvidence:pdf.evidence,pdfRasters};
      }
      if(revalidateMedia)await revalidateMedia();
      await requireVersion(input.sourceId,input.permissionRef);
      await options.writer.append({revision,paragraphs,originalBytes:bytes,
        permissionReviewed:true,...runtimeAudit,...(image?{imageEvidence:image.evidence}:{}),...(pdfInput??{}),
        ...(browser?{browserEvidence:browser.evidence,browserDomBytes:browser.domBytes}:{})});
      if(revalidateMedia)await revalidateMedia();
      await requireVersion(input.sourceId,input.permissionRef);
      await options.writer.storeHttpValidators({sourceId:input.sourceId,
        revisionId:revision.revisionId,canonicalUrl:u.href,checkedAt,etag,lastModified});
      // A revocation after append leaves an unapproved DRAFT, never ACTIVE.
      // The operator must manually reconcile changes before approving a claim.
      if(await approvedFingerprint({policy,resolver:options.rights,now:now()})!==initial)
        throw new Error('Source rights changed after draft commit');
      return {kind:head?'CHANGED_DRAFT':'NEW_DRAFT',revisionId:revision.revisionId};
      }finally{discardUnreadSourceBody(response);}
    },
  };
}
