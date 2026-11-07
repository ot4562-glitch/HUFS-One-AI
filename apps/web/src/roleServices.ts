import type {HufsApiClient} from './integrations/index.js';
import type {AppServices} from './App.js';
import type {SandboxPort} from './features/sandbox/useSandbox.js';
import {OwnerSessionController} from './app/owner-session-controller.js';
import {createOwnerClubPort,createClubModerationPort} from './features/clubs/ownerClubPort.js';
import {ownerExperienceSkillPort} from './features/experience/ownerExperiencePort.js';

type RoleApi = Pick<HufsApiClient,
  'getSession' | 'loadReviewerCapabilities' | 'readReviewerActions' | 'saveReviewerAction'
  | 'getDemoOverlay' | 'setDemoOverlay' | 'resetDemoOverlay' | 'owner'>;

/** What the session check could actually establish. UNKNOWN (signed out, 401/503, bad payload) is never BETA. */
export type SessionRole =
  | {readonly role: 'REVIEWER'; readonly sandbox: SandboxPort | null}
  | {readonly role: 'BETA'}
  | {readonly role: 'ADMIN'}
  | {readonly role: 'UNKNOWN'};

export async function resolveSessionRole(api: RoleApi): Promise<SessionRole> {
  let role: string;
  try {
    role = (await api.getSession()).role;
  } catch {
    return {role: 'UNKNOWN'};
  }
  if (role === 'BETA') return {role: 'BETA'};
  if (role === 'ADMIN') return {role: 'ADMIN'};
  if (role !== 'REVIEWER') return {role: 'UNKNOWN'};
  try {
    const caps = await api.loadReviewerCapabilities();
    return {role: 'REVIEWER', sandbox: {
      allowedActions: new Set(caps.actions),
      read: (ctx, signal) => api.readReviewerActions(ctx, signal),
      save: (ctx, action, signal) => api.saveReviewerAction(ctx, action, signal),
    }};
  } catch {
    // A verified REVIEWER whose capabilities are unavailable stays a REVIEWER: no sandbox, and never the overlay.
    return {role: 'REVIEWER', sandbox: null};
  }
}

/**
 * Role-gated ports. REVIEWER gets only the synthetic sandbox (limited to the server's capability list); the
 * #85 overlay is wired only for a confirmed BETA session, so an outage never routes a REVIEWER to
 * /api/demo/overlay (a later 403 there would clear the REVIEWER screen). The server checks the role anyway.
 */
export function roleServices(api: RoleApi, session: SessionRole): Partial<AppServices> {
  if (session.role === 'REVIEWER') return session.sandbox ? {sandbox: session.sandbox} : {};
  if (session.role === 'ADMIN') return {clubModeration:createClubModerationPort(api)};
  if (session.role !== 'BETA') return {};
  // Create only for a verified BETA. This owner scope is independent from
  // the public DemoController; it rechecks actor/session before and after reads/writes.
  const ownerSession = new OwnerSessionController(api);
  return {
    ownerExperience: {session: ownerSession, skills: ownerExperienceSkillPort(api.owner)},
    ownerCareer: {
      session:ownerSession,
      getProfile:signal=>api.owner.getProfile(signal),
      getConsents:signal=>api.owner.getConsents(signal),
      saveProfile:(change,signal)=>api.owner.updateProfile(change,signal),
      getPortfolio:(query,signal)=>api.owner.getExperiencePortfolio(query,signal),
      create:(input,signal)=>api.owner.createWorkspace(input,signal),
      update:(id,input,signal)=>api.owner.updateWorkspace(id,input,signal),
      remove:(id,version,signal)=>api.owner.deleteWorkspace('EXPERIENCE',id,version,signal),
      getOpportunity:(id,signal)=>api.owner.getOpportunity(id,signal),
      getBookmarks:signal=>api.owner.listWorkspace('BOOKMARK',{limit:20},signal),
      getOwnerFeed:signal=>api.owner.getOwnerFeed(signal),
      explainOpportunity:(id,request,signal)=>api.owner.explainOpportunity(id,request,signal),
    },
    ownerClubs:createOwnerClubPort(api.owner,ownerSession),
    overlay: {
      get: (ctx, signal) => api.getDemoOverlay(ctx, signal),
      set: (ctx, change, signal) => api.setDemoOverlay(ctx, change, signal),
      reset: (ctx, version, signal) => api.resetDemoOverlay(ctx, version, signal),
    },
    ownerAcademics: {
      session: ownerSession,
      current: signal => api.owner.getDoubleMajor(signal),
      plan: (change,signal) => api.owner.checkStudyPlan(change,signal),
      hypothetical: (change,signal) => api.owner.checkMajorWhatIf(change,signal),
    },
    ownerProvider: {
      session: ownerSession,
      list: signal => api.owner.getApprovedProviderInputs(signal),
      submit: (entry,taskPath,idempotencyKey,signal) =>
        api.owner.submitApprovedProvider(entry,taskPath,idempotencyKey,signal),
      read: (jobId,taskPath,signal) => api.owner.readApprovedProviderJob(jobId,taskPath,signal),
    },
    ownerIntake: {
      session: ownerSession,
      read: signal => api.owner.getPrivateIntake(signal),
    },
    ownerDemoProfile: {
      session: ownerSession,
      read: signal => api.owner.readDemoProfile(signal),
      save: (change, signal) => api.owner.saveDemoProfile(change, signal),
      saveWorkspace: (change, signal) => api.owner.saveDemoWorkspace(change, signal),
      reset: (change, signal) => api.owner.resetDemoProfile(change, signal),
    },
  };
}
