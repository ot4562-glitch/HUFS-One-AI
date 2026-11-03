import {StrictMode, type ComponentType} from 'react';
import {createRoot} from 'react-dom/client';
import {DemoController, newTabDemoRunId, type DemoClientPort} from './app/index.js';
import {HufsApiClient, consumeReviewerInviteFragment} from './integrations/index.js';
import {PUBLIC_ORIGIN, holdInviteCode} from './features/reviewer/invite.js';
import type {SandboxActionKind, SandboxPort} from './features/sandbox/useSandbox.js';
import {ReviewerSandboxClientActionSchema} from './integrations/reviewer-sandbox-contract.js';
import {cssVariables} from './design/tokens.js';
import {App, type AppServices} from './App.js';
import {liveServices} from './liveServices.js';
import {boardPort} from './features/applications/boardPort.js';
import {appPages} from './pages/index.js';
import './styles.css';

// First synchronous step on load, before any network call or render: take the REVIEWER code out of
// the URL fragment (only on the canonical HTTPS origin at /reviewer/invite) and keep it in memory.
const inviteHolder = holdInviteCode(consumeReviewerInviteFragment({location: window.location, history: window.history}, PUBLIC_ORIGIN));

const ALL_SANDBOX_ACTIONS: ReadonlySet<SandboxActionKind> =
  new Set(ReviewerSandboxClientActionSchema.options.map(o => o.shape.kind.value));

/**
 * Sandbox only for a verified REVIEWER session, limited to the server's capability list; other
 * sessions never call /api/reviewer/* (a 403 there would clear their screen).
 */
async function reviewerSandbox(api: HufsApiClient): Promise<SandboxPort | null> {
  try {
    if ((await api.getSession()).role !== 'REVIEWER') return null;
    const caps = await api.loadReviewerCapabilities();
    return {
      allowedActions: new Set(caps.actions),
      read: (ctx, signal) => api.readReviewerActions(ctx, signal),
      save: (ctx, action, signal) => api.saveReviewerAction(ctx, action, signal),
    };
  } catch {
    return null; // signed out or not a reviewer: the normal screens explain it
  }
}

async function start() {
  const tokens = document.createElement('style');
  tokens.textContent = `:root{${cssVariables()}}`;
  document.head.append(tokens);

  const api = new HufsApiClient();
  let client: DemoClientPort = api;
  let transportLabel: string | null = null;
  let services: AppServices = {...liveServices(api), reviewerInvite: {port: api, holder: inviteHolder}};
  let localAccountWorkbench:ComponentType|undefined;
  // Synthetic transport only for `vite --mode synthetic` on a loopback host. The literal
  // import.meta.env.DEV check lets the production build drop this branch and its chunk.
  if (import.meta.env.DEV && import.meta.env.MODE === 'synthetic'
    && (location.hostname === '127.0.0.1' || location.hostname === 'localhost')) {
    const dev = await import('./dev/syntheticDemoClient.js');
    const synthetic = new dev.SyntheticDemoClient({snapshotErrors: {S04: 'SHARING_REVOKED'}});
    const owner = await import('./dev/syntheticOwnerServer.js');
    const clubs = await import('./dev/syntheticClubs.js');
    client = synthetic;
    transportLabel = dev.SYNTHETIC_TRANSPORT_LABEL;
    services = {
      ...services,
      loadCalendar: (ctx, signal) => synthetic.getCalendar(ctx.contextId, signal),
      // #80: the real HufsApiClient over an in-memory fictitious owner (dev only).
      applications: boardPort(new HufsApiClient(new owner.SyntheticOwnerServer().fetch)),
      clubs: clubs.syntheticClubPort(),
      overlay: {
        get: (ctx, signal) => synthetic.getDemoOverlay(ctx, signal),
        set: (ctx, change, signal) => synthetic.setDemoOverlay(ctx, change, signal),
        reset: (ctx, version, signal) => synthetic.resetDemoOverlay(ctx, version, signal),
      },
      sandbox: {
        allowedActions: ALL_SANDBOX_ACTIONS,
        read: (ctx, signal) => synthetic.readActions(ctx.contextId, signal),
        save: (ctx, action, signal) => synthetic.saveAction(ctx.contextId, action, signal),
      },
    };
    localAccountWorkbench = (await import('./features/local-accounts/LocalAccountWorkbench.js')).LocalAccountWorkbench;
  } else {
    const reviewer = await reviewerSandbox(api);
    // REVIEWER: synthetic sandbox only. Otherwise (BETA) the #85 overlay; the server checks the role anyway.
    services = reviewer ? {...services, sandbox: reviewer} : {...services, overlay: {
      get: (ctx, signal) => api.getDemoOverlay(ctx, signal),
      set: (ctx, change, signal) => api.setDemoOverlay(ctx, change, signal),
      reset: (ctx, version, signal) => api.resetDemoOverlay(ctx, version, signal),
    }};
  }
  // One controller per tab, in memory only.
  const controller = new DemoController(client, newTabDemoRunId());
  const root = document.getElementById('root');
  if (root) {
    createRoot(root).render(
      <StrictMode><App controller={controller} transportLabel={transportLabel} pages={appPages} services={services} {...(localAccountWorkbench?{localAccountWorkbench}:{})} /></StrictMode>,
    );
  }
}

void start();
