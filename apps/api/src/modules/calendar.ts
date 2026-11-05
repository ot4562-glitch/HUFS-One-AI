import {canReadSharedSection,DatasetModeSchema,DemoContextSchema,FeedResultSchema,ISODateTimeSchema,
  OpportunitySchema,SharingGrantSchema,validateCalendarWire} from '@hufs-one/contracts';
import type {CalendarResult,DemoContext,DemoSnapshot,FeedResult,NoticeResult,Opportunity,SharingGrant} from '@hufs-one/contracts';
import {buildCalendar} from '../../../../packages/core/src/opportunities/calendar.js';
import {composeFeed} from '../../../../packages/core/src/opportunities/feed.js';
import {scopeInputsToGrant} from '../../../../packages/core/src/opportunities/scope.js';
import type {InputProvenance} from '../../../../packages/core/src/opportunities/scope.js';
import type {RecommendationProfile} from '../../../../packages/core/src/opportunities/evaluate.js';
import {composeNotices} from '../../../../packages/core/src/notices/notice.js';
import type {Notice,NoticeStudent} from '../../../../packages/core/src/notices/notice.js';
import {gateBySourceRevision,selectCurrentRevisions} from '../../../../packages/core/src/normalization/revisions.js';
import type {RevisionRecord} from '../../../../packages/core/src/normalization/revisions.js';
import {ApiFailure} from './auth/gates.js';

export interface CalendarReadRequest {
  actorId:string;
  context:DemoContext;
  now:string;
  /** Set only after the independent REVIEWER store authorized this request. */
  reviewerInviteId?:string;
}

/** Server-only raw projection. Never accepted in an HTTP body or query string. */
export interface CalendarInputBundle {
  actorId:string;
  context:DemoContext;
  asOf:string;
  datasetMode:DemoSnapshot['datasetMode'];
  /** Approved summary row bound to the same transaction and authorization receipt. */
  approvedSnapshot?:DemoSnapshot;
  /** Current SharingGrant, from the same transaction as the projection; absent for REVIEWER. */
  grant?:SharingGrant;
  profile:RecommendationProfile;
  noticeStudent:NoticeStudent;
  /** Authoritative origin of every student input; missing origin defaults to ACADEMICS. */
  provenance:InputProvenance;
  scopeKey:string;
  opportunities:Opportunity[];
  /** Dates/evidence must already be independently verified against this immutable revision. */
  notices:Notice[];
  /** Include known corrections/cancellations even when their rights are blocked (no old-head fallback). */
  revisions:RevisionRecord[];
  /** Current actor/purpose/source-rights approval, bound to authorizationToken and sourceVersion. */
  authorizedRevisionIds:string[];
  /** Actor-owned bookmark overlay, loaded with the same context/authorization receipt. */
  savedOpportunityIds?:string[];
  /** Actor/run/session-local temporary preferences, never a source-row edit. */
  hiddenOpportunityIds?:string[];
  /** Verified deadline claim ids bound to the currently approved source. */
  deadlineClaimRefsByOpportunity?:Readonly<Record<string,readonly string[]>>;
  sourceVersion:string;
  authorizationToken:string;
}

export interface CalendarAuthorizationReceipt {
  authorizationToken:string;
  sourceVersion:string;
  scopeKey:string;
  asOf:string;
}

/**
 * A production adapter MUST atomically bind current actor, context versions, grant, projection,
 * input provenance, verified date claims and source rights. A readSnapshot-only adapter is unsafe.
 * revalidateAuthorization must reject if grant/consent/projection/source rights or revisions changed
 * after the read, or the authorization expired. Absence of this adapter returns 503, never fake dates.
 * REVIEWER reads must use an isolated synthetic repository, never student/production projections.
 */
export interface CalendarInputSource {
  readAuthorizedInputs(input:CalendarReadRequest):Promise<CalendarInputBundle|null>;
  revalidateAuthorization(input:CalendarReadRequest,receipt:CalendarAuthorizationReceipt,now:string):Promise<boolean>;
}

const syntheticSections=['FEED','NOTICES','ACADEMICS','FORECAST','EXPERIENCE'] as const;

/** Recompute from scoped inputs; a precomputed calendar or full-share feed is never reused. */
export function computeAuthorizedCalendar(bundle:CalendarInputBundle,input:CalendarReadRequest):CalendarResult {
  return computeAuthorizedSections(bundle,input).calendar;
}

/** All three outputs use exactly the same grant, rights and input provenance. */
export function computeAuthorizedSections(bundle:CalendarInputBundle,input:CalendarReadRequest):{
  calendar:CalendarResult;feed:FeedResult;notices:NoticeResult;
  /** Exact rank policy used for recomputation, never a stale source version. */
  rankConfigVersion:string;
} {
  const context=DemoContextSchema.parse(bundle.context);
  if(bundle.actorId!==input.actorId)throw new ApiFailure('FORBIDDEN');
  for(const key of Object.keys(input.context) as (keyof DemoContext)[])
    if(context[key]!==input.context[key])throw new ApiFailure('VERSION_CONFLICT',input.context.contextId);
  const asOf=ISODateTimeSchema.parse(bundle.asOf);
  if(Date.parse(asOf)>Date.parse(input.now))throw new ApiFailure('VERSION_CONFLICT',context.contextId);
  if(!bundle.authorizationToken||!bundle.sourceVersion)throw new ApiFailure('PROVIDER_UNAVAILABLE');
  const datasetMode=DatasetModeSchema.parse(bundle.datasetMode);
  let sections:readonly string[];
  if(input.reviewerInviteId!==undefined){
    if(context.sharingGrantVersion!==`REVIEWER:${input.reviewerInviteId}`||datasetMode!=='SYNTHETIC'
      ||bundle.grant!==undefined||bundle.revisions.some(r=>r.provenance!=='SYNTHETIC')
      ||bundle.opportunities.some(o=>o.dataMode!=='SYNTHETIC'))throw new ApiFailure('FORBIDDEN');
    sections=syntheticSections;
  } else {
    if(!bundle.grant)throw new ApiFailure('FORBIDDEN');
    const grant=SharingGrantSchema.parse(bundle.grant);
    if(grant.version!==context.sharingGrantVersion)throw new ApiFailure('VERSION_CONFLICT',context.contextId);
    for(const section of ['FEED','NOTICES'] as const)
      if(!canReadSharedSection(grant,{actorId:input.actorId,demoSubjectId:context.demoSubjectId,section,asOf:input.now}))
        throw new ApiFailure(grant.revokedAt?'SHARING_REVOKED':'FORBIDDEN');
    sections=grant.allowedSections;
  }
  const scoped=scopeInputsToGrant(bundle.profile,bundle.noticeStudent,sections,bundle.provenance);
  if(scoped.scopeKey!==bundle.scopeKey)throw new ApiFailure('VERSION_CONFLICT',context.contextId);
  if(!scoped.profile||!scoped.noticeStudent)throw new ApiFailure('FORBIDDEN');
  if(new Set(bundle.revisions.map(r=>r.revisionId)).size!==bundle.revisions.length)
    throw new ApiFailure('PROVIDER_UNAVAILABLE');
  const selection=selectCurrentRevisions(bundle.revisions,asOf);
  const permitted=new Set(bundle.authorizedRevisionIds);
  // Select the actual current head FIRST, then rights-filter. A blocked new head must not resurrect
  // an older approved revision, even when the old title/deadline is still stored in the projection.
  const current=new Map([...selection.current].filter(([,r])=>permitted.has(r.revisionId)
    &&r.permissionRef.trim().length>0&&(r.provenance==='REAL_APPROVED'||r.provenance==='SYNTHETIC')));
  const usable={...selection,current};
  const opportunities=gateBySourceRevision(bundle.opportunities.map(o=>OpportunitySchema.parse(o)),usable).usable;
  const notices=gateBySourceRevision(bundle.notices,usable).usable;
  const publishedAtBySnapshotId=Object.fromEntries([...current.values()].map(r=>[r.revisionId,r.publishedAt]));
  const feed=composeFeed(scoped.profile,opportunities,{asOf,publishedAtBySnapshotId,
    ...(bundle.hiddenOpportunityIds===undefined?{}:{hiddenOpportunityIds:bundle.hiddenOpportunityIds})});
  const validatedRefs=bundle.deadlineClaimRefsByOpportunity??{};
  const withRefs=(id:string,refs:readonly string[])=>[...new Set([...refs,...(validatedRefs[id]??[])])];
  const enriched={...feed,
    all:feed.all.map(r=>({...r,evaluation:{...r.evaluation,
      evidenceRefs:withRefs(r.opportunity.id,r.evaluation.evidenceRefs)}})),
    feed:FeedResultSchema.parse({...feed.feed,
      featured:feed.feed.featured.map(c=>({...c,evidenceRefs:withRefs(c.opportunityId,c.evidenceRefs)})),
      compact:feed.feed.compact.map(c=>({...c,evidenceRefs:withRefs(c.opportunityId,c.evidenceRefs)})),
      ...(feed.feed.ineligible?{ineligible:feed.feed.ineligible.map(c=>({...c,evidenceRefs:withRefs(c.opportunityId,c.evidenceRefs)}))}:{}),
    }),
  };
  const evaluated=composeNotices(scoped.noticeStudent,notices,{asOf});
  const calendar=validateCalendarWire(buildCalendar(enriched,evaluated,notices,{asOf,
    ...(bundle.savedOpportunityIds===undefined?{}:{savedOpportunityIds:bundle.savedOpportunityIds}),
  }),asOf);
  return {calendar,feed:enriched.feed,notices:evaluated.result,rankConfigVersion:feed.rankConfigVersion};
}
