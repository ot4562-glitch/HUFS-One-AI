import {createHash,randomUUID} from 'node:crypto';
import type {SourceRevisionVNext} from '@hufs-one/contracts';
import type {ReviewerSqlPool} from '../auth/reviewer-postgres.js';
import type {
  ApprovedFetchPolicy,ApprovedSourceRightsResolver,SourceContentExtractor,
} from './approved-fetch.js';
import {createApprovedPinnedTransport} from './approved-egress.js';
import type {ApprovedPinnedEgress} from './approved-egress.js';
import type {TrustedDurableSourceExecutor} from './source-ingestion-queue-postgres.js';
import {PostgresSourceRevisionWriter} from './temporal-writer-postgres.js';
import {hashRevisionParagraphs} from './revision-ledger.js';
import {discardUnreadSourceBody,readApprovedSourceBody} from './source-response-body.js';

const ALLOWED=new Set(['text/plain','text/html','application/rss+xml',
  'application/atom+xml','application/pdf','image/png','image/jpeg']);
const SHA=(v:Uint8Array)=>createHash('sha256').update(v).digest('hex');
const SAFE_HTTP_VALIDATOR=/^[\x20-\x7e]{1,200}$/;
function safeValidator(value:string|null):string|null{
  return value!==null&&SAFE_HTTP_VALIDATOR.test(value)?value:null;
}
type StoredHead={
  revisionId:string;originalSha256:string;contentSha256:string;
  fetchedAt:string;permissionRef:string;etag:string|null;lastModified:string|null;
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
}):Promise<string>{
  const {policy,resolver,now}=input;
  if(policy.provenance==='SYNTHETIC'&&policy.sourceClass==='SYNTHETIC')
    return 'SYNTHETIC_TEST_ONLY';
  const r=await resolver.resolve({sourceId:policy.sourceId,
    permissionRef:policy.permissionRef,now});
  if(!r||r.status!=='APPROVED'||r.sourceId!==policy.sourceId
    ||r.canonicalUrl!==policy.canonicalUrl||r.permissionRef!==policy.permissionRef
    ||!r.policyVersion||!r.reviewedBy
    ||!Number.isFinite(Date.parse(r.reviewedAt))||Date.parse(r.reviewedAt)>Date.parse(now)
    ||(r.expiresAt!==undefined&&(Date.parse(r.expiresAt)<=Date.parse(now)
      ||!Number.isFinite(Date.parse(r.expiresAt))))
    ||!r.allowedPurposes.has('COLLECT')||!r.allowedPurposes.has('STORE'))
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
  readerPool:ReviewerSqlPool;
  writer:Pick<PostgresSourceRevisionWriter,'append'|'observeUnchanged'|'storeHttpValidators'>;
  now?:()=>string;
}):TrustedDurableSourceExecutor{
  const now=options.now??(()=>new Date().toISOString());
  const readHead=async(sourceId:string,canonicalUrl:string):Promise<StoredHead|null>=>{
    const c=await options.readerPool.connect();
    try{
      const r=await c.query(`SELECT h.revision_id,r.original_sha256,r.content_sha256,
        r.fetched_at,r.permission_ref,v.etag,v.last_modified
        FROM source_ingest_heads h LEFT JOIN source_revisions_vnext r
          ON r.revision_id=h.revision_id
        LEFT JOIN source_http_validators v ON v.source_id=h.source_id
          AND v.revision_id=h.revision_id AND v.canonical_url=$2
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
        lastModified:typeof v.last_modified==='string'?v.last_modified:null};
    }finally{c.release();}
  };
  return {
    async execute(input){
      const policy=options.policies.get(input.sourceId);
      if(!policy)throw new Error('Source was not allowlisted');
      const u=reviewPolicy(policy,input.sourceId,input.permissionRef);
      const at=now(),initial=await approvedFingerprint({policy,resolver:options.rights,now:at});
      const head=await readHead(input.sourceId,u.href);
      if(head&&head.permissionRef!==input.permissionRef)
        throw new Error('Existing source permission changed');
      // The transport independently checks A/AAAA twice, rejects internal IPs
      // and connects to the pinned address using hostname/SNI TLS validation.
      const transport=createApprovedPinnedTransport({canonicalUrl:u.href,beforeSend:async()=>{
        // Head lookup and both DNS checks may outlive the original grant.
        // Revalidate the same COLLECT/STORE authority immediately before HTTP.
        if(await approvedFingerprint({policy,resolver:options.rights,now:now()})!==initial)
          throw new Error('Source rights changed before HTTP');
      }},options.egress);
      const headers:Record<string,string>={
        Accept:'text/plain,text/html,application/rss+xml,application/atom+xml,application/pdf,image/png,image/jpeg',
      };
      if(head?.etag)headers['If-None-Match']=head.etag;
      if(head?.lastModified)headers['If-Modified-Since']=head.lastModified;
      const response=await transport(u,{method:'GET',redirect:'error',credentials:'omit',
        headers,signal:AbortSignal.timeout(5000)});
      try{
      // Conditional requests are valid only with a persisted validator for
      // exactly this canonical URL and current immutable source revision.
      if(response.status===304){
        if(!head||(!head.etag&&!head.lastModified))
          throw new Error('Unconditional 304 refused');
        if(await approvedFingerprint({policy,resolver:options.rights,now:now()})!==initial)
          throw new Error('Source rights changed during conditional fetch');
        await options.writer.observeUnchanged({sourceId:input.sourceId,
          revisionId:head.revisionId,checkedAt:now(),responseStatus:304});
        return {kind:'NOT_MODIFIED',revisionId:head.revisionId};
      }
      if(response.status!==200)throw new Error('Unapproved source response');
      const etag=safeValidator(response.headers.get('etag'));
      const lastModified=safeValidator(response.headers.get('last-modified'));
      const media=(response.headers.get('content-type')??'').split(';')[0]!.trim().toLowerCase();
      if(!ALLOWED.has(media))throw new Error('Unsupported approved content type');
      const bytes=await readApprovedSourceBody(response);
      const paragraphs=await options.extractor.extract({content:bytes,contentType:media,
        canonicalUrl:u.href});
      if(!Array.isArray(paragraphs)||!paragraphs.length||paragraphs.length>200
        ||paragraphs.some(p=>!p.id||!p.text||p.text.length>20_000
          ||/<script\b/i.test(p.text)))
        throw new Error('Unreviewed extraction result');
      const originalSha256=SHA(bytes),contentSha256=hashRevisionParagraphs(paragraphs);
      if(await approvedFingerprint({policy,resolver:options.rights,now:now()})!==initial)
        throw new Error('Source rights changed during IO');
      // Duplicate content never upgrades human verification timestamps.
      if(head&&head.originalSha256===originalSha256
        &&head.contentSha256===contentSha256){
        const checkedAt=now();
        await options.writer.observeUnchanged({sourceId:input.sourceId,
          revisionId:head.revisionId,checkedAt,responseStatus:200});
        await options.writer.storeHttpValidators({sourceId:input.sourceId,
          revisionId:head.revisionId,canonicalUrl:u.href,checkedAt,etag,lastModified});
        return {kind:'NOT_MODIFIED',revisionId:head.revisionId};
      }
      const checkedAt=now();
      if(head&&Date.parse(checkedAt)<=Date.parse(head.fetchedAt))
        throw new Error('Nonmonotonic revision time');
      const mediaKind=media==='application/pdf'?'PDF':
        media.startsWith('image/')?'IMAGE':media==='text/html'?'HTML':'TEXT';
      const revision:SourceRevisionVNext={
        sourceId:input.sourceId,revisionId:'revision-'+randomUUID(),
        ...(head?{supersedes:head.revisionId}:{}),
        originalSha256,contentSha256,mediaKind,
        sourceClass:policy.sourceClass,permissionRef:policy.permissionRef,
        provenance:policy.provenance,status:'NEEDS_REVIEW',
        changeKind:head?'CORRECTED':'NEW',
        fetchedAt:checkedAt,lastCheckedAt:checkedAt,topicCodes:[],
      };
      await options.writer.append({revision,paragraphs,originalBytes:bytes,
        permissionReviewed:true});
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
