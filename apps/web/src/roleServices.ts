import type {HufsApiClient} from './integrations/index.js';
import type {AppServices} from './App.js';
import type {SandboxPort} from './features/sandbox/useSandbox.js';

type RoleApi = Pick<HufsApiClient,
  'getSession' | 'loadReviewerCapabilities' | 'readReviewerActions' | 'saveReviewerAction'
  | 'getDemoOverlay' | 'setDemoOverlay' | 'resetDemoOverlay'>;

/** What the session check could actually establish. UNKNOWN (signed out, 401/503, bad payload) is never BETA. */
export type SessionRole =
  | {readonly role: 'REVIEWER'; readonly sandbox: SandboxPort | null}
  | {readonly role: 'BETA'}
  | {readonly role: 'UNKNOWN'};

export async function resolveSessionRole(api: RoleApi): Promise<SessionRole> {
  let role: string;
  try {
    role = (await api.getSession()).role;
  } catch {
    return {role: 'UNKNOWN'};
  }
  if (role === 'BETA') return {role: 'BETA'};
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
  if (session.role !== 'BETA') return {};
  return {overlay: {
    get: (ctx, signal) => api.getDemoOverlay(ctx, signal),
    set: (ctx, change, signal) => api.setDemoOverlay(ctx, change, signal),
    reset: (ctx, version, signal) => api.resetDemoOverlay(ctx, version, signal),
  }};
}
