import {createApi} from './server.js';
import {registerSourceRevisionHistoryRoute} from './modules/opportunities/source-history-http.js';
import {registerSelfAccountRoutes} from './modules/profiles/self-account-http.js';
import {registerOwnerCatalogRoutes} from './modules/opportunities/owner-catalog-http.js';
import {registerOwnerWorkspaceRoutes} from './modules/profiles/self-workspace-http.js';
import {registerOwnerStudyPlanCheckRoutes} from './modules/profiles/owner-study-plan-check-http.js';
import {registerOwnerMajorWhatIfRoutes} from './modules/profiles/owner-major-what-if-http.js';
import {registerOpportunityExplanationRoutes} from './modules/opportunities/opportunity-explanation-http.js';
import {registerOpportunityRevisionComparisonRoutes} from './modules/opportunities/opportunity-revision-comparison-http.js';
import type {OwnerWorkspacePort} from './modules/profiles/self-workspace-postgres.js';
import {registerExperienceApprovalRoutes} from './modules/profiles/experience-approval-http.js';
import type {ExperienceApprovalPort} from './modules/profiles/experience-approval-postgres.js';
import type {TrustedCatalogPort} from './modules/opportunities/owner-catalog-http.js';
import type {SelfAccountPort} from './modules/profiles/self-account-postgres.js';
import type {FastifyRequest, FastifyReply} from 'fastify';
import type {
  AiCandidateProvider, ApiRepository, ApiOptions, VerifySession, VerifiedActor,
} from './types.js';
import type {ReviewerAccessStore, ReviewerDemoRepository} from './modules/auth/reviewer.js';
import type {ReviewerSandboxStore} from './modules/auth/reviewer-sandbox.js';

type RevokeSession=(actor:VerifiedActor)=>Promise<void>;
interface TrustedSessionAdapter {
  verifySession:VerifySession;
  revokeSession:RevokeSession;
}

/**
 * Structural consumer port for Agent 1's createGoogleAuthFlow (#32).
 * Does not implement OIDC, issue OTP, copy keys or accept a browser identity.
 * When #32 is absent the integrated API explicitly refuses this mode.
 */
export interface TrustedGoogleAuthPort extends TrustedSessionAdapter {
  start(request:FastifyRequest,reply:FastifyReply):Promise<void>;
  callback(request:FastifyRequest,reply:FastifyReply):Promise<void>;
  clearSession(reply:FastifyReply):void;
}
export interface TrustedSchoolMailPort {
  issue(input:{googleSubject:string;schoolEmail:string;clientIp?:string}):
    Promise<{challengeId:string;expiresAt:string}>;
  verify(input:{challengeId:string;googleSubject:string;schoolEmail:string;code:string;clientIp?:string}):
    Promise<boolean>;
}

interface SharedDependencies {
  /** Explicit approved provider ports only. Absence keeps these reads at 503. */
  studyPlanCheck?:Omit<Parameters<typeof registerOwnerStudyPlanCheckRoutes>[0],'app'|'session'>;
  majorWhatIf?:Omit<Parameters<typeof registerOwnerMajorWhatIfRoutes>[0],'app'|'session'>;
  opportunityExplanation?:Omit<Parameters<typeof registerOpportunityExplanationRoutes>[0],'app'|'session'>;
  revisionComparison?:Omit<Parameters<typeof registerOpportunityRevisionComparisonRoutes>[0],'app'|'session'>;
  experienceApproval?:ExperienceApprovalPort;
  demoOverlay?:ApiOptions['demoOverlay'];
  adminAuthority?:ApiOptions['adminAuthority'];
  demoPreflight?:ApiOptions['demoPreflight'];
  allowedOrigin:string;
  repository:ApiRepository;
  reviewer?:{
    access:ReviewerAccessStore;
    demo:ReviewerDemoRepository;
    sandbox:ReviewerSandboxStore;
  };
  /** Local synthetic model ONLY. A real paid NCP provider cannot use this port. */
  syntheticAiProvider?:AiCandidateProvider;
  now?:()=>string;
  maxSyntheticAiCallsPerActor?:number;
  /** Server-owned, current source rights. Never supplied by a browser. */
  temporalEvidence?:ApiOptions['temporalEvidence'];
  sourceHistory?:ApiOptions['sourceHistory'];
  calendarSource?:ApiOptions['calendarSource'];
  personalState?:ApiOptions['personalState'];
  /** Independent owner-private storage, NEVER the shared demo/REVIEWER DB. */
  selfAccount?:SelfAccountPort;
  /** Approved server-owned source+grant head adapter; no demo/raw data fallback. */
  ownerCatalog?:TrustedCatalogPort;
  /** Owner-private self workspace; does not reuse a demo SharingGrant. */
  ownerWorkspace?:OwnerWorkspacePort;
}

/**
 * The integration must use exactly one session authority:
 * - Direct trusted verifier + revoker, for offline tests and legacy middleware.
 * - Agent-1 Google adapter, with optional verified HUFS-mail proof service.
 * Never combine both: doing so could silently bypass Google session revocation.
 */
export type IntegrationDependencies=SharedDependencies&(
  | {auth:TrustedSessionAdapter;googleAuth?:never;schoolMailProof?:never}
  | {auth?:never;googleAuth:TrustedGoogleAuthPort;schoolMailProof?:TrustedSchoolMailPort}
);

type ApiOptionsWithAgent1=ApiOptions&{
  googleAuth?:TrustedGoogleAuthPort;
  schoolMailProof?:TrustedSchoolMailPort;
};

export function createIntegratedApi(deps:IntegrationDependencies) {
  if(!deps || !deps.repository || typeof deps.repository.readGrant!=='function'
    || typeof deps.repository.readSnapshot!=='function'
    || typeof deps.repository.listProfiles!=='function'
    || typeof deps.repository.readSafePacket!=='function')
    throw new Error('Missing verified auth, revocation or repository: fail closed');
  const auth=deps.googleAuth??deps.auth;
  if(!auth || typeof auth.verifySession!=='function'
    ||typeof auth.revokeSession!=='function'
    || Boolean(deps.googleAuth&&deps.auth)
    ||Boolean(deps.schoolMailProof&&!deps.googleAuth))
    throw new Error('Exactly one trusted session and revocation authority required');
  if(deps.googleAuth && (typeof deps.googleAuth.start!=='function'
    ||typeof deps.googleAuth.callback!=='function'
    ||typeof deps.googleAuth.clearSession!=='function'))
    throw new Error('Incomplete Google OIDC adapter: fail closed');
  if(deps.schoolMailProof && (typeof deps.schoolMailProof.issue!=='function'
    ||typeof deps.schoolMailProof.verify!=='function'))
    throw new Error('Incomplete school-mail proof service: fail closed');
  if(deps.reviewer && (typeof deps.reviewer.access?.readActive!=='function'
    || typeof deps.reviewer.access?.redeem!=='function'
    || typeof deps.reviewer.demo?.listProfiles!=='function'
    || typeof deps.reviewer.demo?.readSnapshot!=='function'
    || typeof deps.reviewer.sandbox?.read!=='function'
    || typeof deps.reviewer.sandbox?.save!=='function'))
    throw new Error('Incomplete REVIEWER sandbox: fail closed');
  // The approved deployment assembly does not yet exist. This prevents an
  // alternate launcher from bypassing main.ts's existing production block.
  // NODE_ENV is the standard deployment marker. APP_ENV alone is not a
  // reliable production gate: an alternate launcher can omit it. Default
  // deny unknown staging/preview modes until a reviewed release assembly exists.
  const appEnv=process.env.APP_ENV;
  const nodeEnv=process.env.NODE_ENV;
  if((appEnv!==undefined && !['test','development','local','synthetic'].includes(appEnv))
    ||(nodeEnv!==undefined && !['test','development'].includes(nodeEnv)))
    throw new Error('Production integration disabled pending audited OAuth/PG/ingress gates');
  if(!deps.allowedOrigin || new URL(deps.allowedOrigin).origin!==deps.allowedOrigin
    || !deps.allowedOrigin.startsWith('https://'))
    throw new Error('Exactly one HTTPS origin is required');
  if(deps.maxSyntheticAiCallsPerActor!==undefined
    && (!Number.isSafeInteger(deps.maxSyntheticAiCallsPerActor)
      || deps.maxSyntheticAiCallsPerActor<1 || deps.maxSyntheticAiCallsPerActor>10))
    throw new Error('Synthetic AI quota outside safe bounds');

  const options:ApiOptionsWithAgent1={
    allowedOrigin:deps.allowedOrigin,repository:deps.repository,
    ...(deps.demoOverlay?{demoOverlay:deps.demoOverlay}:{}),
    ...(deps.adminAuthority?{adminAuthority:deps.adminAuthority}:{}),
    ...(deps.demoPreflight?{demoPreflight:deps.demoPreflight}:{}),
    ...(deps.googleAuth?{
      googleAuth:deps.googleAuth,
      ...(deps.schoolMailProof?{schoolMailProof:deps.schoolMailProof}:{}),
    }:{
      verifySession:auth.verifySession,
      revokeSession:auth.revokeSession,
    }),
    ...(deps.reviewer?{
      reviewerAccess:deps.reviewer.access,
      reviewerDemo:deps.reviewer.demo,
      reviewerSandbox:deps.reviewer.sandbox,
    }:{}),
    ...(deps.syntheticAiProvider?{syntheticAiProvider:deps.syntheticAiProvider}:{}),
    ...(deps.maxSyntheticAiCallsPerActor!==undefined
      ?{maxSyntheticAiCallsPerActor:deps.maxSyntheticAiCallsPerActor}:{}),
    ...(deps.now?{now:deps.now}:{}),
    ...(deps.temporalEvidence?{temporalEvidence:deps.temporalEvidence}:{}),
    ...(deps.sourceHistory?{sourceHistory:deps.sourceHistory}:{}),
    ...(deps.calendarSource?{calendarSource:deps.calendarSource}:{}),
    ...(deps.personalState?{personalState:deps.personalState}:{}),
  };
  const app=createApi(options);
  const ownerSession={verify:auth.verifySession,now:deps.now??(()=>new Date().toISOString())};
  registerOwnerStudyPlanCheckRoutes({...deps.studyPlanCheck,app,session:ownerSession});
  registerOwnerMajorWhatIfRoutes({...deps.majorWhatIf,app,session:ownerSession});
  registerOpportunityExplanationRoutes({...deps.opportunityExplanation,app,session:ownerSession});
  registerOpportunityRevisionComparisonRoutes({...deps.revisionComparison,app,session:ownerSession});
  if(deps.experienceApproval)registerExperienceApprovalRoutes(app,deps.experienceApproval,{
    verify:auth.verifySession,now:deps.now??(()=>new Date().toISOString()),
  });
  if(deps.sourceHistory)registerSourceRevisionHistoryRoute(
    app,deps.sourceHistory,auth.verifySession,deps.now??(()=>new Date().toISOString()));
  if(deps.selfAccount)registerSelfAccountRoutes(app,deps.selfAccount,{
    verify:auth.verifySession,now:deps.now??(()=>new Date().toISOString()),
  });
  if(deps.ownerCatalog)registerOwnerCatalogRoutes(app,deps.ownerCatalog,{
    verify:auth.verifySession,now:deps.now??(()=>new Date().toISOString()),
  });
  if(deps.ownerWorkspace)registerOwnerWorkspaceRoutes({
    app,store:deps.ownerWorkspace,
    ...(deps.ownerCatalog?{catalog:deps.ownerCatalog}:{}),
    session:{verify:auth.verifySession,now:deps.now??(()=>new Date().toISOString())},
  });
  if(deps.googleAuth) {
    // Until Agent 1 #32 is included, main's createApi has no such routes.
    // Do NOT pretend that passing a port automatically enables OIDC.
    const googleRoutes=[
      {method:'GET' as const,url:'/api/auth/google/start'},
      {method:'GET' as const,url:'/api/auth/google/callback'},
      {method:'GET' as const,url:'/api/auth/csrf'},
    ];
    const proofRoutes=[
      {method:'POST' as const,url:'/api/auth/school-mail/request'},
      {method:'POST' as const,url:'/api/auth/school-mail/confirm'},
    ];
    if(!googleRoutes.every(route=>app.hasRoute(route))
      || (deps.schoolMailProof&&!proofRoutes.every(route=>app.hasRoute(route)))) {
      void app.close();
      throw new Error('Agent-1 OIDC/mail routes not installed: fail closed');
    }
  }
  // Fail-closed local main.ts remains untouched. Real PG, OAuth keys, shared
  // session revocation, rate limits, browser E2E and deployment require approval.
  return app;
}
