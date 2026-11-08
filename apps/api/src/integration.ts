import {createApi} from './server.js';
import {assertRuntimeConfiguration,type RuntimeMode} from './runtime-policy.js';
import {registerSourceJobControlRoutes} from './modules/opportunities/source-job-control-http.js';
import {registerCampusAssistRoutes,type CampusAssistServices} from './modules/campus-assist-http.js';
import type {SourceJobControl} from './modules/opportunities/source-job-control-http.js';
import {registerSourceRevisionHistoryRoute} from './modules/opportunities/source-history-http.js';
import {registerSelfAccountRoutes} from './modules/profiles/self-account-http.js';
import {registerRestrictedOwnerIntakeRoute,type RestrictedOwnerDirectoryPort} from './modules/profiles/restricted-owner-http.js';
import {registerOwnerCatalogRoutes} from './modules/opportunities/owner-catalog-http.js';
import {registerHufsAbilityCapabilitiesRoute} from './modules/hufsability/manifest-http.js';
import {registerSyntheticClubRoutes} from './modules/opportunities/synthetic-clubs-http.js';
import {registerOwnerWorkspaceRoutes} from './modules/profiles/self-workspace-http.js';
import {registerOwnerStudyPlanCheckRoutes} from './modules/profiles/owner-study-plan-check-http.js';
import {registerOwnerDoubleMajorRoutes} from './modules/academics/owner-double-major-http.js';
import {registerDemoProfileRoutes} from './modules/profiles/demo-profile-http.js';
import type {DemoProfileQuotaPort} from './modules/profiles/demo-profile-http.js';
import type {DemoProfilePort} from './modules/profiles/demo-profile.js';
import {registerOwnerMajorWhatIfRoutes} from './modules/profiles/owner-major-what-if-http.js';
import {registerOpportunityExplanationRoutes} from './modules/opportunities/opportunity-explanation-http.js';
import {registerOwnerFeedRoutes} from './modules/opportunities/owner-feed-http.js';
import {registerOpportunityRevisionComparisonRoutes} from './modules/opportunities/opportunity-revision-comparison-http.js';
import type {OwnerWorkspacePort} from './modules/profiles/self-workspace-postgres.js';
import {registerExperienceApprovalRoutes} from './modules/profiles/experience-approval-http.js';
import {registerExperienceSkillCandidateRoute} from './modules/profiles/experience-skill-candidate-http.js';
import type {ExperienceSkillCandidatePort} from './modules/ai/experience-skill-candidates-postgres.js';
import type {ExperienceApprovalPort} from './modules/profiles/experience-approval-postgres.js';
import type {TrustedCatalogPort} from './modules/opportunities/owner-catalog-http.js';
import type {SelfAccountPort} from './modules/profiles/self-account-postgres.js';
import type {FastifyRequest, FastifyReply} from 'fastify';
import type {AiCandidateProvider,ApiRepository,ApiOptions,VerifySession,VerifiedActor} from './types.js';
import type {ReviewerAccessStore,ReviewerDemoRepository} from './modules/auth/reviewer.js';
import type {ReviewerSandboxStore} from './modules/auth/reviewer-sandbox.js';

type RevokeSession=(actor:VerifiedActor)=>Promise<void>;
interface TrustedSessionAdapter {verifySession:VerifySession;revokeSession:RevokeSession}
/** Trusted server-side OIDC consumer. It never accepts a browser identity. */
export interface TrustedGoogleAuthPort extends TrustedSessionAdapter {
  start(request:FastifyRequest,reply:FastifyReply):Promise<void>;
  callback(request:FastifyRequest,reply:FastifyReply):Promise<void>;
  clearSession(reply:FastifyReply):void;
}
export interface TrustedSchoolMailPort {
  issue(input:{googleSubject:string;schoolEmail:string;clientIp?:string}):Promise<{challengeId:string;expiresAt:string}>;
  verify(input:{challengeId:string;googleSubject:string;schoolEmail:string;code:string;clientIp?:string}):Promise<boolean>;
}
interface SharedDependencies {
  runtime?:RuntimeMode;
  campusAssist?:CampusAssistServices;
  ownerFeed?:Omit<Parameters<typeof registerOwnerFeedRoutes>[0],'app'|'session'>;
  sourceIngestionControl?:SourceJobControl;
  studyPlanCheck?:Omit<Parameters<typeof registerOwnerStudyPlanCheckRoutes>[0],'app'|'session'>;
  doubleMajor?:Omit<Parameters<typeof registerOwnerDoubleMajorRoutes>[0],'app'|'session'>;
  demoProfile?:DemoProfilePort;
  demoProfileQuota?:DemoProfileQuotaPort;
  majorWhatIf?:Omit<Parameters<typeof registerOwnerMajorWhatIfRoutes>[0],'app'|'session'>;
  opportunityExplanation?:Omit<Parameters<typeof registerOpportunityExplanationRoutes>[0],'app'|'session'>;
  revisionComparison?:Omit<Parameters<typeof registerOpportunityRevisionComparisonRoutes>[0],'app'|'session'>;
  syntheticClubs?:Omit<Parameters<typeof registerSyntheticClubRoutes>[0],'app'|'session'|'adminAuthority'>;
  experienceApproval?:ExperienceApprovalPort;
  experienceCandidates?:ExperienceSkillCandidatePort;
  demoOverlay?:ApiOptions['demoOverlay'];adminAuthority?:ApiOptions['adminAuthority'];
  adminUsage?:ApiOptions['adminUsage'];demoPreflight?:ApiOptions['demoPreflight'];
  allowedOrigin:string;trustedProxyAddresses?:ApiOptions['trustedProxyAddresses'];repository:ApiRepository;
  reviewer?:{access:ReviewerAccessStore;demo:ReviewerDemoRepository;sandbox:ReviewerSandboxStore};
  syntheticAiProvider?:AiCandidateProvider;realAi?:ApiOptions['realAi'];approvedAiInputs?:ApiOptions['approvedAiInputs'];
  now?:()=>string;maxSyntheticAiCallsPerActor?:number;
  temporalEvidence?:ApiOptions['temporalEvidence'];sourceHistory?:ApiOptions['sourceHistory'];
  calendarSource?:ApiOptions['calendarSource'];personalState?:ApiOptions['personalState'];
  selfAccount?:SelfAccountPort;restrictedOwnerDirectory?:RestrictedOwnerDirectoryPort;
  ownerCatalog?:TrustedCatalogPort;ownerWorkspace?:OwnerWorkspacePort;
}
export type IntegrationDependencies=SharedDependencies&(
  | {auth:TrustedSessionAdapter;googleAuth?:never;schoolMailProof?:never}
  | {auth?:never;googleAuth:TrustedGoogleAuthPort;schoolMailProof?:TrustedSchoolMailPort}
);
type ApiOptionsWithAgent1=ApiOptions&{googleAuth?:TrustedGoogleAuthPort;schoolMailProof?:TrustedSchoolMailPort};

export function createIntegratedApi(deps:IntegrationDependencies) {
  if(!deps||!deps.repository||typeof deps.repository.readGrant!=='function'
    ||typeof deps.repository.readSnapshot!=='function'||typeof deps.repository.listProfiles!=='function'
    ||typeof deps.repository.readSafePacket!=='function')
    throw new Error('Missing verified auth, revocation or repository: fail closed');
  const auth=deps.googleAuth??deps.auth;
  if(!auth||typeof auth.verifySession!=='function'||typeof auth.revokeSession!=='function'
    ||Boolean(deps.googleAuth&&deps.auth)||Boolean(deps.schoolMailProof&&!deps.googleAuth))
    throw new Error('Exactly one trusted session and revocation authority required');
  if(deps.googleAuth&&(typeof deps.googleAuth.start!=='function'||typeof deps.googleAuth.callback!=='function'
    ||typeof deps.googleAuth.clearSession!=='function'))throw new Error('Incomplete Google OIDC adapter: fail closed');
  if(deps.schoolMailProof&&(typeof deps.schoolMailProof.issue!=='function'||typeof deps.schoolMailProof.verify!=='function'))
    throw new Error('Incomplete school-mail proof service: fail closed');
  if(deps.reviewer&&(typeof deps.reviewer.access?.readActive!=='function'||typeof deps.reviewer.access?.redeem!=='function'
    ||typeof deps.reviewer.demo?.listProfiles!=='function'||typeof deps.reviewer.demo?.readSnapshot!=='function'
    ||typeof deps.reviewer.sandbox?.read!=='function'||typeof deps.reviewer.sandbox?.save!=='function'))
    throw new Error('Incomplete REVIEWER sandbox: fail closed');
  assertRuntimeConfiguration(deps);
  if(deps.maxSyntheticAiCallsPerActor!==undefined&&(!Number.isSafeInteger(deps.maxSyntheticAiCallsPerActor)
    ||deps.maxSyntheticAiCallsPerActor<1||deps.maxSyntheticAiCallsPerActor>10))throw new Error('Synthetic AI quota outside safe bounds');
  const options:ApiOptionsWithAgent1={
    allowedOrigin:deps.allowedOrigin,repository:deps.repository,
    ...(deps.trustedProxyAddresses!==undefined?{trustedProxyAddresses:deps.trustedProxyAddresses}:{}),
    ...(deps.demoOverlay?{demoOverlay:deps.demoOverlay}:{}),...(deps.adminAuthority?{adminAuthority:deps.adminAuthority}:{}),
    ...(deps.adminUsage?{adminUsage:deps.adminUsage}:{}),...(deps.demoPreflight?{demoPreflight:deps.demoPreflight}:{}),
    ...(deps.googleAuth?{googleAuth:deps.googleAuth,...(deps.schoolMailProof?{schoolMailProof:deps.schoolMailProof}:{})}
      :{verifySession:auth.verifySession,revokeSession:auth.revokeSession}),
    ...(deps.reviewer?{reviewerAccess:deps.reviewer.access,reviewerDemo:deps.reviewer.demo,reviewerSandbox:deps.reviewer.sandbox}:{}),
    ...(deps.syntheticAiProvider?{syntheticAiProvider:deps.syntheticAiProvider}:{}),
    ...(deps.realAi?{realAi:deps.realAi}:{}),...(deps.approvedAiInputs?{approvedAiInputs:deps.approvedAiInputs}:{}),
    ...(deps.maxSyntheticAiCallsPerActor!==undefined?{maxSyntheticAiCallsPerActor:deps.maxSyntheticAiCallsPerActor}:{}),
    ...(deps.now?{now:deps.now}:{}),...(deps.temporalEvidence?{temporalEvidence:deps.temporalEvidence}:{}),
    ...(deps.sourceHistory?{sourceHistory:deps.sourceHistory}:{}),...(deps.calendarSource?{calendarSource:deps.calendarSource}:{}),
    ...(deps.personalState?{personalState:deps.personalState}:{}),
  };
  const app=createApi(options),ownerSession={verify:auth.verifySession,now:deps.now??(()=>new Date().toISOString())};
  if(deps.campusAssist)registerCampusAssistRoutes(app,deps.campusAssist,{...ownerSession,allowedOrigin:deps.allowedOrigin});
  registerSourceJobControlRoutes({app,session:ownerSession,...(deps.sourceIngestionControl?{control:deps.sourceIngestionControl}:{})});
  registerRestrictedOwnerIntakeRoute({app,session:ownerSession,...(deps.restrictedOwnerDirectory?{directory:deps.restrictedOwnerDirectory}:{})});
  registerHufsAbilityCapabilitiesRoute(app,ownerSession);
  registerSyntheticClubRoutes({...deps.syntheticClubs,app,session:ownerSession,...(deps.adminAuthority?{adminAuthority:deps.adminAuthority}:{})});
  registerOwnerStudyPlanCheckRoutes({...deps.studyPlanCheck,app,session:ownerSession});
  registerOwnerDoubleMajorRoutes({...deps.doubleMajor,app,session:ownerSession});
  registerDemoProfileRoutes(app,deps.demoProfile,ownerSession,deps.demoProfileQuota);
  registerOwnerMajorWhatIfRoutes({...deps.majorWhatIf,app,session:ownerSession});
  registerOpportunityExplanationRoutes({...deps.opportunityExplanation,app,session:ownerSession});
  registerOwnerFeedRoutes({...deps.ownerFeed,app,session:ownerSession});
  registerOpportunityRevisionComparisonRoutes({...deps.revisionComparison,app,session:ownerSession});
  if(deps.experienceApproval)registerExperienceApprovalRoutes(app,deps.experienceApproval,ownerSession);
  if(deps.experienceCandidates)registerExperienceSkillCandidateRoute(app,deps.experienceCandidates,ownerSession);
  if(deps.sourceHistory)registerSourceRevisionHistoryRoute(app,deps.sourceHistory,auth.verifySession,ownerSession.now);
  if(deps.selfAccount)registerSelfAccountRoutes(app,deps.selfAccount,ownerSession);
  if(deps.ownerCatalog)registerOwnerCatalogRoutes(app,deps.ownerCatalog,ownerSession);
  if(deps.ownerWorkspace)registerOwnerWorkspaceRoutes({
    app,store:deps.ownerWorkspace,...(deps.ownerCatalog?{catalog:deps.ownerCatalog}:{}),session:ownerSession,
    ...(deps.selfAccount&&deps.experienceApproval?{portfolio:{accounts:deps.selfAccount,approvals:deps.experienceApproval}}:{}),
  });
  if(deps.googleAuth){
    const googleRoutes=[{method:'GET' as const,url:'/api/auth/google/start'},
      {method:'GET' as const,url:'/api/auth/google/callback'},{method:'GET' as const,url:'/api/auth/csrf'}];
    const proofRoutes=[{method:'POST' as const,url:'/api/auth/school-mail/request'},
      {method:'POST' as const,url:'/api/auth/school-mail/confirm'}];
    if(!googleRoutes.every(route=>app.hasRoute(route))||(deps.schoolMailProof&&!proofRoutes.every(route=>app.hasRoute(route)))){
      void app.close();throw new Error('Agent-1 OIDC/mail routes not installed: fail closed');
    }
  }
  return app;
}
