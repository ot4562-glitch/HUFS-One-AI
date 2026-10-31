import {randomUUID} from 'node:crypto';
import type {SourceRevisionVNext,RevisionInvalidationVNext} from '@hufs-one/contracts';
import {MemorySourceRevisionLedger,hashRevisionParagraphs} from './revision-ledger.js';
import type {RevisionParagraph} from './revision-ledger.js';

const MAX_DOCUMENT_BYTES=256*1024;
const SAFE_HEADER=/^[\x20-\x7e]{1,200}$/;
export class SourceIngestionError extends Error {
  constructor(){super('Approved source ingestion failed');}
}
export interface ApprovedFetchPolicy {
  sourceId:string;
  canonicalUrl:string;
  /** Explicitly reviewed origin and source use rights; not a browser allowlist. */
  approvedOrigin:string;
  permissionRef:string;
  sourceClass:'SYNTHETIC'|'LICENSED_EXTERNAL';
  provenance:'SYNTHETIC'|'REAL_APPROVED';
  rightsReviewed:boolean;
}
export type SourceUsePurpose='COLLECT'|'STORE'|'SEARCH'|'EXTERNAL_TRANSFER';
export interface ApprovedSourceRights {
  sourceId:string;
  canonicalUrl:string;
  permissionRef:string;
  policyVersion:string;
  reviewedBy:string;
  reviewedAt:string;
  expiresAt?:string;
  status:'APPROVED'|'REVOKED';
  allowedPurposes:ReadonlySet<SourceUsePurpose>;
}
/** Server-trusted purpose/expiry registry; never accept browser rights claims. */
export interface ApprovedSourceRightsResolver {
  resolve(input:{sourceId:string;permissionRef:string;now:string}):
    Promise<ApprovedSourceRights|null>;
}
export interface SourceContentExtractor {
  /** No HTML execution. Output immutable, reviewed plain-text paragraph candidates. */
  extract(input:{content:Uint8Array;contentType:string;canonicalUrl:string}):
    Promise<RevisionParagraph[]>;
}
export interface SourceFetchConfig {
  policy:ApprovedFetchPolicy;
  ledger:MemorySourceRevisionLedger;
  extractor:SourceContentExtractor;
  /** Mandatory for REAL_APPROVED sources; no self-declared rights authorization. */
  rightsResolver?:ApprovedSourceRightsResolver;
  /** Mandatory trusted transport: operator must enforce DNS/IP egress policy. */
  transport?:typeof fetch;
  now?:()=>Date;
}
export type SourceFetchOutcome={
  kind:'NEW_DRAFT'|'CHANGED_DRAFT'|'NOT_MODIFIED';
  sourceId:string;
  revisionId:string;
  checkedAt:string;
  invalidation:RevisionInvalidationVNext|null;
};
function canonicalize(raw:string):URL{
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.username||url.password||url.hash
    ||url.searchParams.has('redirect')
    ||!url.hostname||url.hostname==='localhost'
    ||url.hostname.endsWith('.localhost')||url.hostname.endsWith('.local')
    ||/^[0-9.]+$/.test(url.hostname)||url.hostname.includes(':'))
    throw new SourceIngestionError();
  // Avoid using an authority with an alternate port without an explicit review.
  if(url.port)throw new SourceIngestionError();
  return url;
}
function validateConfig(p:ApprovedFetchPolicy){
  const url=canonicalize(p.canonicalUrl),origin=canonicalize(p.approvedOrigin);
  if(url.origin!==origin.origin||origin.pathname!=='/'||origin.search
    ||url.pathname.startsWith('//')||!p.rightsReviewed
    ||!p.sourceId||!p.permissionRef)
    throw new SourceIngestionError();
  return url;
}
async function boundedBody(response:Response):Promise<Uint8Array>{
  const declared=response.headers.get('content-length');
  if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>MAX_DOCUMENT_BYTES))
    throw new SourceIngestionError();
  if(!response.body)throw new SourceIngestionError();
  const reader=response.body.getReader(),blocks:Uint8Array[]=[];
  let total=0;
  try{
    while(true){
      const chunk=await reader.read();
      if(chunk.done)break;
      total+=chunk.value.byteLength;
      if(total>MAX_DOCUMENT_BYTES)throw new SourceIngestionError();
      blocks.push(chunk.value);
    }
  }finally{reader.releaseLock();}
  return Buffer.concat(blocks);
}
function safeHeader(value:string|null):string|undefined {
  return value&&SAFE_HEADER.test(value)?value:undefined;
}
/** Real sources need a purpose-scoped, server-reviewed grant before and after IO. */
async function requireCurrentRights(options:SourceFetchConfig,now:string):Promise<string>{
  const p=options.policy;
  if(p.provenance==='SYNTHETIC'&&p.sourceClass==='SYNTHETIC')
    return 'SYNTHETIC_ONLY';
  if(!options.rightsResolver)throw new SourceIngestionError();
  const grant=await options.rightsResolver.resolve({
    sourceId:p.sourceId,permissionRef:p.permissionRef,now,
  });
  const reviewed=grant?.reviewedAt?Date.parse(grant.reviewedAt):NaN;
  const expires=grant?.expiresAt?Date.parse(grant.expiresAt):Infinity;
  if(!grant||grant.status!=='APPROVED'
    ||grant.sourceId!==p.sourceId||grant.canonicalUrl!==p.canonicalUrl
    ||grant.permissionRef!==p.permissionRef
    ||!grant.policyVersion||!grant.reviewedBy
    ||!Number.isFinite(reviewed)||reviewed>Date.parse(now)
    ||!Number.isFinite(expires)&&expires!==Infinity
    ||expires<=Date.parse(now)
    ||!grant.allowedPurposes.has('COLLECT')
    ||!grant.allowedPurposes.has('STORE'))
    throw new SourceIngestionError();
  return JSON.stringify({
    policyVersion:grant.policyVersion,reviewedBy:grant.reviewedBy,
    reviewedAt:grant.reviewedAt,expiresAt:grant.expiresAt??null,
    purposes:[...grant.allowedPurposes].sort(),
  });
}

/** Explicit allowlist, no redirect/login, capped bytes, no model/OCR calls. */
export function createApprovedSourceFetcher(options:SourceFetchConfig){
  const sourceUrl=validateConfig(options.policy);
  const clock=options.now??(()=>new Date());
  let etag:string|undefined;
  let modified:string|undefined;
  // There is deliberately NO implicit global fetch. A production caller must
  // supply an independently approved egress transport with DNS/IP pinning,
  // private-range rejection, and request-level allowlist enforcement.
  const request=options.transport;
  return {
    async check():Promise<SourceFetchOutcome>{
      const now=clock();
      if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
        throw new SourceIngestionError();
      const checkedAt=now.toISOString();
      const latest=options.ledger.latest(options.policy.sourceId);
      if(!request)throw new SourceIngestionError();
      const headers:Record<string,string>={Accept:'text/plain, text/html;q=0.9, application/rss+xml;q=0.8'};
      if(latest&&etag)headers['If-None-Match']=etag;
      if(latest&&modified)headers['If-Modified-Since']=modified;
      try{
        // Never send a real HTTP request using only a caller-supplied boolean.
        const rightsBefore=await requireCurrentRights(options,checkedAt);
        const response=await request(sourceUrl,{
          method:'GET',redirect:'error',
          credentials:'omit',
          headers,
          signal:AbortSignal.timeout(5000),
        });
        if(response.url&&response.url!==sourceUrl.href)
          throw new SourceIngestionError();
        // A permission revoked during the fetch invalidates the whole result.
        // Check the same policy snapshot even for HTTP 304 observations.
        if(await requireCurrentRights(options,checkedAt)!==rightsBefore)
          throw new SourceIngestionError();
        if(response.status===304){
          if(!latest)throw new SourceIngestionError();
          options.ledger.observeNotModified(options.policy.sourceId,checkedAt);
          return {kind:'NOT_MODIFIED',sourceId:options.policy.sourceId,
            revisionId:latest.revision.revisionId,checkedAt,invalidation:null};
        }
        if(response.status!==200)throw new SourceIngestionError();
        const contentType=response.headers.get('content-type')??'';
        const supported=/^(text\/plain|text\/html|application\/rss\+xml)(;|$)/i.test(contentType);
        if(!supported)throw new SourceIngestionError();
        const bytes=await boundedBody(response);
        if(!bytes.length)throw new SourceIngestionError();
        const paragraphs=await options.extractor.extract({
          content:bytes,contentType,canonicalUrl:sourceUrl.href,
        });
        // All content (even HTML) must be converted into validated plain text
        // by an approved server extractor. No unreviewed HTML is rendered.
        if(!Array.isArray(paragraphs)||!paragraphs.length
          ||paragraphs.some(p=>!p.id||!p.text||/<script\b/i.test(p.text)))
          throw new SourceIngestionError();
        if(await requireCurrentRights(options,checkedAt)!==rightsBefore)
          throw new SourceIngestionError();
        const contentSha256=hashRevisionParagraphs(paragraphs);
        const originalSha256=(await import('node:crypto')).createHash('sha256').update(bytes).digest('hex');
        // HTTP check does not equal independent human verification.
        if(latest&&latest.revision.contentSha256===contentSha256
          &&latest.revision.originalSha256===originalSha256){
          options.ledger.observeNotModified(options.policy.sourceId,checkedAt);
          etag=safeHeader(response.headers.get('etag'));
          modified=safeHeader(response.headers.get('last-modified'));
          return {kind:'NOT_MODIFIED',sourceId:options.policy.sourceId,
            revisionId:latest.revision.revisionId,checkedAt,invalidation:null};
        }
        const revision:SourceRevisionVNext={
          revisionId:'revision-'+randomUUID(),
          sourceId:options.policy.sourceId,
          ...(latest?{supersedes:latest.revision.revisionId}:{}),
          originalSha256,contentSha256,
          mediaKind:contentType.toLowerCase().startsWith('text/html')?'HTML':'TEXT',
          sourceClass:options.policy.sourceClass,
          permissionRef:options.policy.permissionRef,
          provenance:options.policy.provenance,
          status:'NEEDS_REVIEW',
          changeKind:latest?'CORRECTED':'NEW',
          fetchedAt:checkedAt,
          lastCheckedAt:checkedAt,
          topicCodes:[],
        };
        const event=options.ledger.add({
          revision,paragraphs,originalBytes:bytes,permissionReviewed:true,
        });
        etag=safeHeader(response.headers.get('etag'));
        modified=safeHeader(response.headers.get('last-modified'));
        return {kind:latest?'CHANGED_DRAFT':'NEW_DRAFT',sourceId:options.policy.sourceId,
          revisionId:revision.revisionId,checkedAt,invalidation:event};
      }catch{throw new SourceIngestionError();}
    },
  };
}
