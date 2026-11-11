/**
 * #449 PRE-IMPLEMENTATION DRAFT only. No NCP connection, migration, network IO
 * or authority is established by parsing these shapes.
 * Operational source inventory and bytes MUST stay in NCP, never in this repo.
 */
import {z} from 'zod';
import {OfficialHttpsUrlSchema} from '../feature-additions/official-url.js';

const Id=z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/);
const Sha256=z.string().regex(/^[a-f0-9]{64}$/);
const Iso=z.iso.datetime({offset:true});

export const IngestionStageSchema=z.enum([
  'DISCOVERED','FETCHED','PARSED','NEEDS_REVIEW','APPROVED','ACTIVE','REVOKED','FAILED',
]);
export type IngestionStage=z.infer<typeof IngestionStageSchema>;

export const SourceRegistrationDraftSchema=z.strictObject({
  sourceId:Id,
  canonicalUrl:OfficialHttpsUrlSchema,
  /** Operator-reviewed rights reference, not a permission granted by this schema. */
  permissionRef:Id,
  publisher:z.string().trim().min(1).max(200),
  sourceClass:z.literal('PUBLIC_WEB'),
  observedAt:Iso,
  rights:z.strictObject({
    collect:z.boolean(),store:z.boolean(),search:z.boolean(),
    externalTransfer:z.boolean(),
  }),
});
export type SourceRegistrationDraft=z.infer<typeof SourceRegistrationDraftSchema>;

/** Operator-entered candidate discovery scope. Shape only, not a grant to
 * crawl or bypass the site's current robots/terms or reviewed source rights.
 */
const PathPrefix=z.string().min(1).max(200)
  .refine(value=>value.startsWith('/')
    &&new RegExp('^/[A-Za-z0-9/_~.%-]*$').test(value)
    &&!value.includes('..')&&!/%(?:2e|2f|5c)/i.test(value)
    &&!value.includes('//'));
export const CrawlScopeDraftSchema=z.strictObject({
  sourceId:Id,
  approvedOrigin:OfficialHttpsUrlSchema,
  pathPrefixes:z.array(PathPrefix).min(1).max(12),
  robotsStatus:z.enum(['UNKNOWN','REVIEWED_PERMITTED','RESTRICTED']),
  termsStatus:z.enum(['UNKNOWN','REVIEWED_PERMITTED','RESTRICTED']),
  policyRef:Id,observedAt:Iso,
}).superRefine((value,ctx)=>{
  const url=new URL(value.approvedOrigin);
  if(url.pathname!=='/'||url.search||url.hash||url.port)
    ctx.addIssue({code:'custom',path:['approvedOrigin'],message:'scope origin must be a public HTTPS root'});
  if(new Set(value.pathPrefixes).size!==value.pathPrefixes.length)
    ctx.addIssue({code:'custom',path:['pathPrefixes'],message:'duplicated approved paths'});
});
export type CrawlScopeDraft=z.infer<typeof CrawlScopeDraftSchema>;

/** A link from already-approved fetched bytes enters independent human review.
 * A link is NOT a newly registered approved source just because it was found.
 */
export const DiscoveryCandidateDraftSchema=z.strictObject({
  sourceId:Id,discoveredFromRevisionId:Id,
  sourceCanonicalUrl:OfficialHttpsUrlSchema,
  proposedUrl:OfficialHttpsUrlSchema,
  kind:z.enum(['DOCUMENT','ATTACHMENT']),
  seenAt:Iso,reviewState:z.literal('REVIEW_REQUIRED'),
}).superRefine((item,ctx)=>{
  const base=new URL(item.sourceCanonicalUrl),proposed=new URL(item.proposedUrl);
  if(base.origin!==proposed.origin)
    ctx.addIssue({code:'custom',path:['proposedUrl'],message:'cross-origin candidate needs new independent source policy'});
});
export type DiscoveryCandidateDraft=z.infer<typeof DiscoveryCandidateDraftSchema>;



/** Candidate-only boundary between Crawlee's already-parsed link proposals and
 * the draft contract. Scope membership does NOT grant COLLECT/STORE/SEARCH.
 * Current robots, terms, source permissions and actor rights still require
 * independent operator checks inside NCP before any network request.
 */
export function isDiscoveryCandidateInScopeForReview(
  candidate:unknown,scope:unknown,
):boolean{
  const c=DiscoveryCandidateDraftSchema.safeParse(candidate);
  const s=CrawlScopeDraftSchema.safeParse(scope);
  if(!c.success||!s.success||c.data.sourceId!==s.data.sourceId)return false;
  const origin=new URL(s.data.approvedOrigin).origin;
  const base=new URL(c.data.sourceCanonicalUrl);
  const proposed=new URL(c.data.proposedUrl);
  if(base.origin!==origin||proposed.origin!==origin)return false;
  // Reject encoded separators/dots and double-encoding before prefix matching.
  const pathname=proposed.pathname;
  if(/%(?:00|25|2e|2f|5c)/i.test(pathname))return false;
  return s.data.pathPrefixes.some(prefix=>prefix==='/'||pathname===prefix
    ||pathname.startsWith(prefix.endsWith('/')?prefix:prefix+'/'));
}

/** Convert a bounded set of parsed *offline* link candidates into NCP-private
 * review drafts; never fetch, enqueue, approve or activate a discovered URL.
 * Invalid or out-of-scope links are deliberately omitted, not auto-approved.
 */
export const DiscoveredLinkBatchDraftSchema=z.strictObject({
  state:z.literal('REVIEW_REQUIRED'),
  sourceUrl:OfficialHttpsUrlSchema,
  kind:z.enum(['HTML','RSS','ATOM','SITEMAP']),
  scanned:z.number().int().min(0).max(500),
  candidates:z.array(z.strictObject({
    url:OfficialHttpsUrlSchema,
    type:z.enum(['DOCUMENT','ATTACHMENT']),
    label:z.string().min(1).max(200).optional(),
  })).max(100),
});
export type DiscoveredLinkBatchDraft=z.infer<typeof DiscoveredLinkBatchDraftSchema>;
export function prepareDiscoveryReviewDrafts(input:{
  sourceId:string;revisionId:string;seenAt:string;
  scope:unknown;discovered:unknown;
  /** Both records come from the operator's existing private source ledger. */
  registration:unknown;revision:unknown;
}):DiscoveryCandidateDraft[]{
  const sourceId=Id.parse(input.sourceId);
  const revisionId=Id.parse(input.revisionId);
  const seenAt=Iso.parse(input.seenAt);
  const scope=CrawlScopeDraftSchema.parse(input.scope);
  const batch=DiscoveredLinkBatchDraftSchema.parse(input.discovered);
  const registration=SourceRegistrationDraftSchema.parse(input.registration);
  const revision=SourceRevisionDraftSchema.parse(input.revision);
  // Do not accept caller-supplied source/revision IDs without independently
  // loading and comparing the captured original from the private ledger.
  if(sourceId!==scope.sourceId||registration.sourceId!==sourceId
    ||revision.sourceId!==sourceId||revision.revisionId!==revisionId
    ||registration.permissionRef!==revision.permissionRef
    ||registration.canonicalUrl!==batch.sourceUrl
    ||new URL(batch.sourceUrl).origin!==new URL(scope.approvedOrigin).origin
    ||!registration.rights.collect||!registration.rights.store
    ||!revision.rights.collect||!revision.rights.store
    ||!['PARSED','NEEDS_REVIEW','APPROVED','ACTIVE'].includes(revision.stage)
    ||Date.parse(registration.observedAt)>Date.parse(seenAt)
    ||Date.parse(revision.fetchedAt)>Date.parse(seenAt))
    throw new Error('Discovery capture and source revision mismatch');
  const seen=new Set<string>();
  const records:DiscoveryCandidateDraft[]=[];
  for(const link of batch.candidates){
    const draft={
      sourceId,discoveredFromRevisionId:revisionId,
      sourceCanonicalUrl:batch.sourceUrl,proposedUrl:link.url,
      kind:link.type,seenAt,reviewState:'REVIEW_REQUIRED' as const,
    };
    if(seen.has(link.url)||!isDiscoveryCandidateInScopeForReview(draft,scope))
      continue;
    seen.add(link.url);
    records.push(DiscoveryCandidateDraftSchema.parse(draft));
  }
  return records;
}

/** Conservative *offline* source budget/rights/robots gate. A READY result
 * is NOT authorization to fetch: the private operator MUST independently
 * recheck fresh rights, robots, terms, DNS/IP, HTTP status and tenant budget
 * immediately before each request. No implicit network or timers here. */
export const SourceRefreshPreflightDraftSchema=z.strictObject({
  registration:SourceRegistrationDraftSchema,
  scope:CrawlScopeDraftSchema,
  pageUrl:OfficialHttpsUrlSchema,
  now:Iso,
  remainingRequests:z.number().int().min(0).max(100_000),
  remainingBytes:z.number().int().min(0).max(1_000_000_000),
  retryAfter:Iso.optional(),
  // The private durable queue supplies actual counts and the last HTTP
  // response status. No auto-retry decision is made from a page's text.
  attemptsForUrl:z.number().int().min(0).max(10),
  maxAttempts:z.number().int().min(1).max(3),
  lastHttpStatus:z.number().int().min(100).max(599).optional(),
  retryAfterHeader:z.string().min(1).max(128).optional(),
});
/** Strict RFC 9110 Retry-After delay-seconds or IMF-fixdate candidate.
 * A missing/malformed/oversized header is NOT permission to retry.
 * This is not a network client, clock authority or durable scheduler.
 */
export function parseReviewedRetryAfter(value:unknown,now:unknown):string|null{
  if(typeof value!=='string'||value.length>128||value!==value.trim()
    ||typeof now!=='string'||!Iso.safeParse(now).success)return null;
  const at=Date.parse(now),max=86_400_000;
  let until:number;
  if(/^\d{1,5}$/.test(value)){
    const seconds=Number(value);
    if(!Number.isSafeInteger(seconds)||seconds>86400)return null;
    until=at+seconds*1000;
  }else{
    // Accept the HTTP-date grammar produced by Date#toUTCString, not
    // locale-dependent Date.parse variants or embedded input.
    until=Date.parse(value);
    if(!Number.isFinite(until)||new Date(until).toUTCString()!==value)return null;
  }
  return until<at||until-at>max?null:new Date(until).toISOString();
}
export type SourceRefreshPreflightDraft=z.infer<typeof SourceRefreshPreflightDraftSchema>;
export type SourceRefreshPreflightResult={
  state:'BLOCKED'|'READY_FOR_OPERATOR_RECHECK';
  reasons:readonly string[];
};
export function evaluateSourceRefreshPreflight(input:unknown):SourceRefreshPreflightResult{
  const parsed=SourceRefreshPreflightDraftSchema.safeParse(input);
  if(!parsed.success)return {state:'BLOCKED',reasons:['INVALID_CONFIGURATION']};
  const {registration,scope,pageUrl,now,remainingRequests,remainingBytes,retryAfter,
    attemptsForUrl,maxAttempts,lastHttpStatus,retryAfterHeader}=parsed.data;
  const reasons:string[]=[];
  if(registration.sourceId!==scope.sourceId
    ||new URL(registration.canonicalUrl).origin!==new URL(scope.approvedOrigin).origin
    ||pageUrl!==registration.canonicalUrl)
    reasons.push('UNREGISTERED_SOURCE');
  if(!registration.rights.collect||!registration.rights.store)
    reasons.push('PURPOSE_RIGHTS_NOT_REVIEWED');
  if(scope.robotsStatus!=='REVIEWED_PERMITTED')
    reasons.push('ROBOTS_NOT_PERMITTED');
  if(scope.termsStatus!=='REVIEWED_PERMITTED')
    reasons.push('TERMS_NOT_PERMITTED');
  if(Date.parse(registration.observedAt)>Date.parse(now)
    ||Date.parse(scope.observedAt)>Date.parse(now))reasons.push('FUTURE_REVIEW');
  const pathname=new URL(pageUrl).pathname;
  if(/%(?:00|25|2e|2f|5c)/i.test(pathname)
    ||!scope.pathPrefixes.some(prefix=>prefix==='/'||pathname===prefix
      ||pathname.startsWith(prefix.endsWith('/')?prefix:prefix+'/')))
    reasons.push('PATH_NOT_APPROVED');
  if(remainingRequests<1||remainingBytes<1)reasons.push('BUDGET_EXHAUSTED');
  if(attemptsForUrl>=maxAttempts)reasons.push('ATTEMPT_LIMIT');
  if(lastHttpStatus===401||lastHttpStatus===403)
    reasons.push('ACCESS_CONTROLLED_NO_RETRY');
  else if(lastHttpStatus!==undefined&&lastHttpStatus>=400
    &&lastHttpStatus!==429&&lastHttpStatus!==503)
    reasons.push('HTTP_ERROR_REVIEW_REQUIRED');
  if(lastHttpStatus===429||lastHttpStatus===503){
    const due=parseReviewedRetryAfter(retryAfterHeader,now);
    if(!due)reasons.push('THROTTLED_OPERATOR_REVIEW');
    else if(Date.parse(due)>Date.parse(now))reasons.push('RETRY_AFTER');
  }
  if(retryAfter&&Date.parse(retryAfter)>Date.parse(now))reasons.push('RETRY_AFTER');
  return reasons.length?{state:'BLOCKED',reasons}:
    {state:'READY_FOR_OPERATOR_RECHECK',reasons:[]};
}

export const SourceRevisionDraftSchema=z.strictObject({
  schemaVersion:z.literal(1),
  sourceId:Id,revisionId:Id,permissionRef:Id,
  /** An NCP-private opaque object identifier; never real bytes or signed URLs. */
  rawObjectKey:z.string().min(1).max(512)
    // Opaque object keys must not be accepted as URLs, encoded filesystem
    // traversal, absolute paths or percent-decoded alternate names.
    .regex(/^[A-Za-z0-9][A-Za-z0-9/_.:-]*$/)
    .refine(v=>!v.includes('//')&&!v.includes('..')&&!v.includes('://')),
  originalSha256:Sha256,normalizedSha256:Sha256,
  extractedFromOriginalSha256:Sha256,
  ingestedBy:Id,fetchedAt:Iso,
  publishedAt:Iso.optional(),effectiveFrom:Iso.optional(),effectiveUntil:Iso.optional(),
  stage:IngestionStageSchema,
  provenance:z.enum(['SYNTHETIC','REAL_APPROVED']),
  rights:z.strictObject({collect:z.boolean(),store:z.boolean(),search:z.boolean()}),
  review:z.strictObject({
    decision:z.enum(['APPROVED','REJECTED']),
    reviewerId:Id,reviewedAt:Iso,
    originalSha256:Sha256,normalizedSha256:Sha256,
  }).optional(),
}).superRefine((item,ctx)=>{
  if(item.effectiveFrom&&item.effectiveUntil
    &&Date.parse(item.effectiveUntil)<=Date.parse(item.effectiveFrom))
    ctx.addIssue({code:'custom',path:['effectiveUntil'],message:'effective interval invalid'});
  if(item.extractedFromOriginalSha256!==item.originalSha256)
    ctx.addIssue({code:'custom',path:['extractedFromOriginalSha256'],
      message:'extraction must bind the original bytes'});
  if(['APPROVED','ACTIVE'].includes(item.stage)){
    if(!item.review||item.review.decision!=='APPROVED'
      ||item.review.reviewerId===item.ingestedBy
      ||item.review.originalSha256!==item.originalSha256
      ||item.review.normalizedSha256!==item.normalizedSha256
      ||Date.parse(item.review.reviewedAt)<Date.parse(item.fetchedAt))
      ctx.addIssue({code:'custom',path:['review'],message:'independent review required'});
  }
  if(item.stage==='ACTIVE'&&(item.provenance!=='REAL_APPROVED'||!item.rights.search
    ||!item.rights.collect||!item.rights.store))
    ctx.addIssue({code:'custom',path:['stage'],message:'active requires real approved rights'});
});
export type SourceRevisionDraft=z.infer<typeof SourceRevisionDraftSchema>;

/**
 * Exact evidence for a normalized field, never a model-generated attribution.
 * A value without a paragraph span cannot be considered source-verified.
 */
export const FieldEvidenceDraftSchema=z.strictObject({
  sourceId:Id,revisionId:Id,paragraphId:Id,
});
const Evidence=z.array(FieldEvidenceDraftSchema).min(1).max(20);
const FactValue=z.union([z.string().min(1).max(2000),z.number().finite(),z.boolean()]);
export const NormalizedFieldDraftSchema=z.discriminatedUnion('state',[
  z.strictObject({
    state:z.literal('KNOWN'),value:FactValue,
    provenance:z.literal('SOURCE_VERIFIED'),evidence:Evidence,
    observedAt:Iso,
  }),
  z.strictObject({
    state:z.literal('UNKNOWN'),reason:z.string().min(1).max(220),
  }),
  z.strictObject({
    state:z.literal('NOT_APPLICABLE'),reason:z.string().min(1).max(220),
  }),
]);
export type NormalizedFieldDraft=z.infer<typeof NormalizedFieldDraftSchema>;

/** Corrections and revocations are explicit links, not inferred from URLs.
 * A detected deletion does not automatically revoke the last approved version.
 */
export const SourceChangeDraftSchema=z.strictObject({
  sourceId:Id,
  revisionId:Id,
  previousRevisionId:Id,
  kind:z.enum(['CORRECTED','REPLACED','CANCELLED']),
  observedAt:Iso,
  reasonEvidence:Evidence,
}).superRefine((item,ctx)=>{
  if(item.revisionId===item.previousRevisionId)
    ctx.addIssue({code:'custom',path:['previousRevisionId'],
      message:'a change cannot point to itself'});
  if(item.reasonEvidence.some(x=>x.sourceId!==item.sourceId
    ||x.revisionId!==item.revisionId))
    ctx.addIssue({code:'custom',path:['reasonEvidence'],
      message:'change evidence must bind the new source revision'});
});
export type SourceChangeDraft=z.infer<typeof SourceChangeDraftSchema>;

/** A draft normalizer may only claim a verified value from its own revision.
 * This is not an actual persistence or official eligibility decision.
 */
export const NormalizedEvidenceRecordDraftSchema=z.strictObject({
  sourceId:Id,revisionId:Id,
  fields:z.record(Id,NormalizedFieldDraftSchema),
}).superRefine((item,ctx)=>{
  const entries=Object.entries(item.fields);
  if(entries.length<1||entries.length>80)
    ctx.addIssue({code:'custom',path:['fields'],message:'field count out of bounds'});
  for(const [key,value] of entries){
    if(value.state==='KNOWN'&&value.evidence.some(x=>x.sourceId!==item.sourceId
      ||x.revisionId!==item.revisionId))
      ctx.addIssue({code:'custom',path:['fields',key,'evidence'],
        message:'field evidence is not in the claimed source revision'});
  }
});
export type NormalizedEvidenceRecordDraft=z.infer<typeof NormalizedEvidenceRecordDraftSchema>;

/** Offline version comparison only; it cannot authorize a DB migration or activation. */
export const VersionHandshakeDraftSchema=z.strictObject({
  gitSha:z.string().regex(/^[a-f0-9]{40}$/),
  buildSha:z.string().regex(/^[a-f0-9]{64}$/),
  migrationVersion:Id,adapterVersion:Id,datasetRevision:Id,
  schemaVersion:z.number().int().positive(),
});
export type VersionHandshakeDraft=z.infer<typeof VersionHandshakeDraftSchema>;
export function isReaderCompatible(
  envelope:VersionHandshakeDraft,reader:{minSchemaVersion:number;maxSchemaVersion:number},
):boolean{
  if(!Number.isSafeInteger(reader.minSchemaVersion)||!Number.isSafeInteger(reader.maxSchemaVersion)
    ||reader.minSchemaVersion<1||reader.minSchemaVersion>reader.maxSchemaVersion)return false;
  const parsed=VersionHandshakeDraftSchema.safeParse(envelope);
  return parsed.success && parsed.data.schemaVersion>=reader.minSchemaVersion
    && parsed.data.schemaVersion<=reader.maxSchemaVersion;
}
