import {z} from 'zod';
import {
  OpportunityRevisionComparisonRequestSchema,OpportunityRevisionComparisonResponseSchema,
  OpportunityComparisonRevisionSchema,OpportunityRevisionComparisonClaimSchema,
  compareReviewedOpportunityRevisionClaims,
} from '@hufs-one/contracts';
import type {
  OpportunityRevisionComparisonRequest,OpportunityRevisionComparisonResponse,
  OpportunityComparisonRevision,
} from '@hufs-one/contracts';
import {ApiFailure} from '../auth/gates.js';

type Scope={actorId:string;opportunityId:string;beforeRevisionId:string;afterRevisionId:string;asOf:string};
/** A reader of server-reviewed immutable claims, not an extractor or model.
 * It must resolve the authoritative head AT asOf before selecting claims and
 * revalidate current withdrawal, source/head/review and owner binding. A new
 * pending/unknown head must never cause fallback to an old active revision.
 * Missing independently reviewed persistence adapters remain unavailable. */
export interface TrustedOpportunityRevisionComparisonSource {
  inspect(input:Scope & {now:string}):Promise<unknown>;
  revalidate(input:Scope & {receipt:string;now:string}):Promise<boolean>;
}
/** Independent current source rights/owner authority. The source reader or
 * browser cannot self-assert authority to inspect or disclose either version. */
export interface TrustedOpportunityRevisionComparisonRights {
  mayInspect(input:Scope & {now:string}):Promise<boolean>;
  authorize(input:Scope & {sourceId:string;sourceReceipt:string;now:string;
    /** Independently match the exact immutable claim values to reviewed evidence;
     * a source's REVIEWED flag does not grant disclosure or prove approval. */
    revisions:ReadonlyArray<TrustedOpportunityRevisionMetadata & {evidenceRefs:readonly string[]}>;
  }):Promise<{allowed:boolean;rightsReceipt:string}>;
  revalidate(input:Scope & {sourceReceipt:string;rightsReceipt:string;now:string}):Promise<boolean>;
}
const Ref=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const Utc=z.iso.datetime({offset:true});
const StoredRevision=z.strictObject({
  revisionId:Ref,sourceId:Ref,opportunityId:Ref,
  capturedAt:Utc,checkedAt:Utc,verifiedAt:Utc.optional(),
  contentSha256:z.string().regex(/^[a-f0-9]{64}$/),
  reviewState:z.enum(['REVIEWED','PENDING','CONFLICT','UNKNOWN']),
  status:z.enum(['ACTIVE','SUPERSEDED','CANCELLED','WITHDRAWN','BLOCKED_RIGHTS']),
  changeKind:z.enum(['NEW','CORRECTED','EXTENDED','CANCELLED','UNKNOWN']),
  dataMode:z.enum(['REAL','SYNTHETIC']),deliveryMode:z.enum(['LIVE','VERIFIED_CACHE','REPLAY']),
  claims:z.array(OpportunityRevisionComparisonClaimSchema).max(3),
});
/** Complete bounded metadata projection given to the independent authority;
 * approval must cover its exact timestamps, hash, review/status and claim values. */
export type TrustedOpportunityRevisionMetadata=Readonly<z.infer<typeof StoredRevision>>;
const StoredPair=z.strictObject({
  actorId:Ref,opportunityId:Ref,sourceId:Ref,asOf:Utc,currentRevisionId:Ref,
  receipt:z.string().min(8).max(256),before:StoredRevision,after:StoredRevision,
});
function unavailable():never{throw new ApiFailure('PROVIDER_UNAVAILABLE');}
function denied():never{throw new ApiFailure('FORBIDDEN');}
async function call<T>(fn:()=>Promise<T>):Promise<T>{
  try{return await fn();}catch{unavailable();}
}
function publicRevision(r:z.infer<typeof StoredRevision>):OpportunityComparisonRevision {
  const {reviewState:_reviewState,status:_status,changeKind:_changeKind,...projection}=r;
  const parsed=OpportunityComparisonRevisionSchema.safeParse(projection);
  if(!parsed.success)unavailable();
  return parsed.data;
}
/** Reusable service; HTTP adds final fresh BETA session revalidation. */
export async function compareOpportunityRevisions(options:{
  actorId:string;opportunityId:string;request:OpportunityRevisionComparisonRequest;
  source:TrustedOpportunityRevisionComparisonSource;rights:TrustedOpportunityRevisionComparisonRights;
  now:()=>string;
  /** HTTP rechecks the live session after awaited preauthorization, before any
   * private source read. Its auth failure must retain the HTTP 401/403 status. */
  beforeInspect?:()=>Promise<void>;
}):Promise<OpportunityRevisionComparisonResponse>{
  const {source,rights,now}=options;
  const request=OpportunityRevisionComparisonRequestSchema.parse(options.request);
  const scope={actorId:options.actorId,opportunityId:options.opportunityId,...request};
  if(Date.parse(request.asOf)>Date.parse(now()))
    throw new z.ZodError([{code:'custom',path:['asOf'],message:'Future asOf is forbidden'}]);
  if(await call(()=>rights.mayInspect({...scope,now:now()}))!==true)denied();
  await options.beforeInspect?.();
  const parsed=StoredPair.safeParse(await call(()=>source.inspect({...scope,now:now()})));
  if(!parsed.success)unavailable();
  const pair=parsed.data;
  if(pair.actorId!==scope.actorId||pair.opportunityId!==scope.opportunityId||pair.asOf!==scope.asOf)
    unavailable();
  for(const [revision,id] of [[pair.before,request.beforeRevisionId],[pair.after,request.afterRevisionId]] as const){
    if(revision.revisionId!==id||revision.sourceId!==pair.sourceId
      ||revision.opportunityId!==scope.opportunityId)unavailable();
    if(['WITHDRAWN','BLOCKED_RIGHTS'].includes(revision.status))denied();
    for(const timestamp of [revision.capturedAt,revision.checkedAt,revision.verifiedAt])
      if(timestamp&&Date.parse(timestamp)>Date.parse(scope.asOf))unavailable();
  }
  if(pair.currentRevisionId!==request.afterRevisionId
    ||Date.parse(pair.before.capturedAt)>=Date.parse(pair.after.capturedAt))
    throw new ApiFailure('VERSION_CONFLICT');
  const revisions=[pair.before,pair.after];
  if(pair.before.dataMode!==pair.after.dataMode)unavailable();
  const authorized=await call(()=>rights.authorize({...scope,sourceId:pair.sourceId,
    sourceReceipt:pair.receipt,now:now(),revisions:revisions.map(r=>({...r,
      evidenceRefs:[...new Set(r.claims.flatMap(c=>c.evidenceRefs))].sort(),
    })),
  }));
  if(authorized?.allowed!==true)denied();
  if(typeof authorized.rightsReceipt!=='string'||authorized.rightsReceipt.length<8
    ||authorized.rightsReceipt.length>256)unavailable();
  const binding={opportunityId:scope.opportunityId,...request};
  let response:OpportunityRevisionComparisonResponse;
  const cancellationConflict=revisions.some(r=>{
    const claim=r.claims.find(c=>c.field==='STATUS');
    const marked=r.status==='CANCELLED'||r.changeKind==='CANCELLED';
    return marked&&!(claim?.field==='STATUS'&&claim.value==='CANCELLED');
  });
  if(revisions.some(r=>r.reviewState==='CONFLICT')||cancellationConflict){
    response={...binding,state:'NEEDS_REVIEW',reason:'REVISION_CONFLICT'};
  }else if(revisions.some(r=>r.reviewState==='UNKNOWN'||r.changeKind==='UNKNOWN')){
    response={...binding,state:'NEEDS_REVIEW',reason:'REVISION_UNKNOWN'};
  }else if(revisions.some(r=>r.reviewState!=='REVIEWED'||!r.verifiedAt)){
    response={...binding,state:'NEEDS_REVIEW',reason:'REVISION_NOT_REVIEWED'};
  }else{
    const before=publicRevision(pair.before),after=publicRevision(pair.after);
    const comparison=compareReviewedOpportunityRevisionClaims(before,after);
    response=before.contentSha256===after.contentSha256
      &&comparison.comparisons.some(c=>c.state==='CHANGED')
      ?{...binding,state:'NEEDS_REVIEW',reason:'REVISION_CONFLICT'}
      :{...binding,state:'READY',before,after,...comparison};
  }
  const safe=OpportunityRevisionComparisonResponseSchema.safeParse(response);
  if(!safe.success)unavailable();
  // Reads and disclosure authority are separate, and both remain current after
  // all awaited provider work. No cache-only grant or source self-approval.
  let sourceValid=false,rightsValid=false;
  try{sourceValid=await source.revalidate({...scope,receipt:pair.receipt,now:now()})===true;}
  catch{/* deny stale/revoked source */}
  if(!sourceValid)denied();
  try{rightsValid=await rights.revalidate({...scope,sourceReceipt:pair.receipt,
    rightsReceipt:authorized.rightsReceipt,now:now()})===true;}
  catch{/* deny stale/revoked rights */}
  if(!rightsValid)denied();
  return safe.data;
}
