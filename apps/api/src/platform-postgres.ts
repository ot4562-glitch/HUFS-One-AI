import type {ReviewerSqlPool} from './modules/auth/reviewer-postgres.js';
import {PostgresApiProjectionRepository} from './repository-postgres.js';
import type {PurposeConsentVerifier} from './repository-postgres.js';
import {ScopedApiRepository} from './scoped-repository.js';
import {PostgresCalendarInputSource} from './modules/calendar-postgres.js';
import type {CalendarInputSource} from './modules/calendar.js';
import {PostgresPersonalStateStore} from './db/personal-state-postgres.js';
import type {PersonalDataConsentVerifier,SyntheticPersonalFixtureAuthority} from './db/personal-state-postgres.js';
import {PostgresTemporalEvidenceReader} from './modules/opportunities/temporal-postgres.js';
import {createPostgresTemporalGateway} from './modules/opportunities/temporal-gateway.js';
import {PostgresSourceRevisionHistory} from './modules/opportunities/source-history-postgres.js';
import {PostgresSourceIngestionQueue} from './modules/opportunities/source-ingestion-queue-postgres.js';
import type {SourceJobOperatorAuthority} from './modules/opportunities/source-job-control-http.js';
import {PostgresReviewerSandboxStore} from './modules/auth/reviewer-sandbox-postgres.js';
import {PostgresRestrictedIntakeImport} from './modules/academics/intake-postgres.js';
import {PostgresSelfAccountStore} from './modules/profiles/self-account-postgres.js';
import {PostgresOwnerWorkspaceStore} from './modules/profiles/self-workspace-postgres.js';
import type {SelfWorkspaceAuthority} from './modules/profiles/self-workspace-postgres.js';
import type {SelfAccountAuthority} from './modules/profiles/self-account-postgres.js';
import type {IntakeOperatorAuthority} from './modules/academics/intake-postgres.js';
import type {TrustedDurableSourceExecutor,TrustedSourceIngestionAuthority} from './modules/opportunities/source-ingestion-queue-postgres.js';
import type {EvidenceRightsResolver} from './modules/opportunities/temporal-gateway.js';
import {PostgresSourceReviewService} from './modules/opportunities/source-review-postgres.js';
import type {SourceReviewAuthority} from './modules/opportunities/source-review-postgres.js';
import {PostgresExperienceApprovalStore} from './modules/profiles/experience-approval-postgres.js';
import type {ExperienceApprovalAuthority} from './modules/profiles/experience-approval-postgres.js';
import {PostgresDemoOverlayStore} from './modules/demo-overlay-postgres.js';
import {DemoOverlayService} from './modules/demo-overlay.js';
import {PostgresTrustedOwnerCatalog} from './modules/opportunities/owner-catalog-postgres.js';
import type {OwnerCatalogAuthority} from './modules/opportunities/owner-catalog-postgres.js';
import {PostgresOwnerStudyPlanSnapshotLoader} from './modules/academics/owner-study-plan-postgres.js';
import {createTrustedOwnerStudyPlanSource} from './modules/academics/owner-study-plan-source.js';
import type {TrustedOwnerStudyPlanRights,ApprovedStudyPlanGate} from './modules/profiles/owner-study-plan-check-http.js';
import {createPostgresOwnerDoubleMajorServices} from './modules/academics/owner-double-major-postgres.js';
import {PostgresApprovedRevisionClaims} from './modules/opportunities/approved-revision-claims-postgres.js';
import {DemoProfileService} from './modules/profiles/demo-profile.js';
import {PostgresDemoProfileStore} from './modules/profiles/demo-profile-postgres.js';
import {createPostgresOwnerStudyPlanServices} from './modules/academics/owner-study-plan-services-postgres.js';
import type {OwnerStudyPlanAuthority} from './modules/academics/owner-study-plan-services-postgres.js';
import {createPostgresOwnerRecommendations} from './modules/opportunities/owner-recommendations-postgres.js';
import type {ApprovedOwnerRecommendationGate,OwnerRecommendationAuthority} from './modules/opportunities/owner-feed-http.js';

/** Supply independently restricted, verified pools after applying reviewed migrations.
 * This creates adapters only: no credentials, pool creation, migrations or live calls. */
export interface PostgresPlatformConfig {
  pools:{projections:ReviewerSqlPool;calendar:ReviewerSqlPool;personal:ReviewerSqlPool;evidence:ReviewerSqlPool};
  evidenceRights:EvidenceRightsResolver;
  displayConsent?:PurposeConsentVerifier;
  personalConsent?:PersonalDataConsentVerifier;
  syntheticAuthority?:SyntheticPersonalFixtureAuthority;
  /** Separate approved synthetic source. No fallback to team/student projections. */
  reviewerCalendar?:CalendarInputSource;
  /** Optional private operator port. No automatic crawler/worker or network. */
  sourceIngestion?:{pool:ReviewerSqlPool;
    authority:TrustedSourceIngestionAuthority;executor:TrustedDurableSourceExecutor};
  /** Explicit operator API opt-in. The same policy also guards worker dispatch. */
  sourceIngestionOperator?:SourceJobOperatorAuthority;
  /** Independently restricted REVIEWER-only SQL pool, never a team projection. */
  reviewerSandbox?:ReviewerSqlPool;
  /** Strictly operator-only local import; NOT a public browser route. */
  restrictedIntake?:{pool:ReviewerSqlPool;authority:IntakeOperatorAuthority};
  /** Dedicated owner-private profile/consent pool, never demo or public roles. */
  selfAccount?:{pool:ReviewerSqlPool;authority:SelfAccountAuthority};
  ownerWorkspace?:{pool:ReviewerSqlPool;authority:SelfWorkspaceAuthority};
  experienceApproval?:{pool:ReviewerSqlPool;authority:ExperienceApprovalAuthority};
  demoOverlay?:{pool:ReviewerSqlPool};
  /** Private operator-only service; never automatically approved or exposed as HTTP. */
  sourceReview?:{pool:ReviewerSqlPool;authority:SourceReviewAuthority};
  /** SELECT-only approved owner projections; no intake promotion or default authority. */
  ownerCatalog?:{pool:ReviewerSqlPool;authority:OwnerCatalogAuthority};
  /** Own profile/current topic approvals + the same approved opportunity catalog.
   * Separate SELECT-only role and independently reviewed core activation. */
  ownerRecommendations?:{pool:ReviewerSqlPool;authority:OwnerCatalogAuthority;ownerAuthority:OwnerRecommendationAuthority;
    approval:ApprovedOwnerRecommendationGate};
  /** Separate source/permission and academic activation authorities remain mandatory. */
  studyPlanCheck?:{pool:ReviewerSqlPool;authority:OwnerCatalogAuthority;
    rights:TrustedOwnerStudyPlanRights;approvalGate:ApprovedStudyPlanGate};
  /** Integrated fresh receipt/rights bridge. Mutually exclusive with the
   * externally assembled studyPlanCheck ports; no authority defaults. */
  ownerStudyPlan?:{pool:ReviewerSqlPool;authority:OwnerCatalogAuthority;
    ownerAuthority:OwnerStudyPlanAuthority;approval:ApprovedStudyPlanGate};
  /** Owner-private, current approved double-major projection; never a browser rulepack. */
  doubleMajor?:{pool:ReviewerSqlPool;authority:OwnerCatalogAuthority};
  /** Exact independently approved SourceRevision claims; read-only. */
  revisionComparison?:{pool:ReviewerSqlPool;authority:OwnerCatalogAuthority};
  /** Isolated EMPTY_DEMO synthetic profile only, never a personal-account fallback. */
  demoProfile?:{pool:ReviewerSqlPool};
  now?:()=>string;
}

/** Spread these services into createIntegratedApi alongside the trusted auth/reviewer ports. */
export function createPostgresPlatformServices(config:PostgresPlatformConfig){
  if(config.sourceIngestionOperator&&!config.sourceIngestion)throw new Error('Source control requires an explicit queue');
  if(config.studyPlanCheck&&config.ownerStudyPlan)throw new Error('Ambiguous owner study-plan services');
  const now=config.now??(()=>new Date().toISOString());
  const source=config.sourceIngestion,operator=config.sourceIngestionOperator;
  const sourceIngestion=source?new PostgresSourceIngestionQueue(source.pool,operator?{
    mayProcess:async input=>{
      const check=()=>operator.mayManage({actorId:input.actorRef,sourceId:input.sourceId,permissionRef:input.permissionRef,now:now()});
      return await check()===true&&await source.authority.mayProcess(input)===true&&await check()===true;
    },
  }:source.authority,source.executor,now):undefined;
  // Optional ports are never created from shared/default pools or environment flags.
  const claims=config.revisionComparison
    ?new PostgresApprovedRevisionClaims(config.revisionComparison.pool,config.revisionComparison.authority,now)
    :undefined;
  const teamCalendar=new PostgresCalendarInputSource(config.pools.calendar);
  const calendarSource:CalendarInputSource={
    readAuthorizedInputs:input=>input.reviewerInviteId===undefined
      ?teamCalendar.readAuthorizedInputs(input)
      :config.reviewerCalendar?.readAuthorizedInputs(input)??Promise.resolve(null),
    revalidateAuthorization:(input,receipt,at)=>input.reviewerInviteId===undefined
      ?teamCalendar.revalidateAuthorization(input,receipt,at)
      :config.reviewerCalendar?.revalidateAuthorization(input,receipt,at)??Promise.resolve(false),
  };
  return {
    ...(config.ownerStudyPlan?{studyPlanCheck:createPostgresOwnerStudyPlanServices({...config.ownerStudyPlan,now})}:{}),
    ...(config.ownerRecommendations?createPostgresOwnerRecommendations({...config.ownerRecommendations,now}):{}),
    ...(config.doubleMajor?{doubleMajor:createPostgresOwnerDoubleMajorServices({...config.doubleMajor,now})}:{}),
    ...(claims?{revisionComparison:{source:claims.source,rights:claims.rights,context:claims.context}}:{}),
    ...(config.demoProfile?{demoProfile:new DemoProfileService(
      new PostgresDemoProfileStore(config.demoProfile.pool))}:{}),
    ...(config.ownerCatalog?{
      ownerCatalog:new PostgresTrustedOwnerCatalog(config.ownerCatalog.pool,config.ownerCatalog.authority,now),
    }:{}),
    ...(config.studyPlanCheck?{studyPlanCheck:{
      source:createTrustedOwnerStudyPlanSource({snapshots:new PostgresOwnerStudyPlanSnapshotLoader(
        config.studyPlanCheck.pool,config.studyPlanCheck.authority,now)}),
      rights:config.studyPlanCheck.rights,approvalGate:config.studyPlanCheck.approvalGate,
    }}:{}),
    ...(config.experienceApproval?{
      experienceApproval:new PostgresExperienceApprovalStore(config.experienceApproval.pool,
        config.experienceApproval.authority,now),
    }:{}),
    ...(config.demoOverlay?{
      demoOverlay:new DemoOverlayService({source:teamCalendar,
        store:new PostgresDemoOverlayStore(config.demoOverlay.pool),now}),
    }:{}),
    ...(config.sourceReview?{
      sourceReview:new PostgresSourceReviewService(config.sourceReview.pool,config.sourceReview.authority,now),
    }:{}),
    repository:new ScopedApiRepository(new PostgresApiProjectionRepository(
      config.pools.projections,now,config.displayConsent),teamCalendar,now),
    calendarSource,
    personalState:new PostgresPersonalStateStore(config.pools.personal,
      config.personalConsent,config.syntheticAuthority),
    temporalEvidence:createPostgresTemporalGateway(
      new PostgresTemporalEvidenceReader(config.pools.evidence),config.evidenceRights),
    // Calendar reader role has SELECT on source heads and revision metadata.
    sourceHistory:new PostgresSourceRevisionHistory(config.pools.calendar,config.evidenceRights),
    ...(sourceIngestion?{
      sourceIngestion,
      ...(operator?{sourceIngestionControl:{queue:sourceIngestion,authority:operator}}:{}),
    }:{}),
    ...(config.reviewerSandbox?{
      reviewerSandbox:new PostgresReviewerSandboxStore(config.reviewerSandbox),
    }:{}),
    ...(config.selfAccount?{
      selfAccount:new PostgresSelfAccountStore(config.selfAccount.pool,
        config.selfAccount.authority,now),
    }:{}),
    ...(config.ownerWorkspace?{
      ownerWorkspace:new PostgresOwnerWorkspaceStore(config.ownerWorkspace.pool,
        config.ownerWorkspace.authority,now),
    }:{}),
    ...(config.restrictedIntake?{
      restrictedIntake:new PostgresRestrictedIntakeImport(config.restrictedIntake.pool,
        config.restrictedIntake.authority,now),
    }:{}),
  };
}
