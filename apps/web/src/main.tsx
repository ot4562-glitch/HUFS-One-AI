import {StrictMode, type ComponentType} from 'react';
import {createRoot} from 'react-dom/client';
import {DemoController, newTabDemoRunId, type DemoClientPort} from './app/index.js';
import {HufsApiClient, consumeReviewerInviteFragment} from './integrations/index.js';
import {PUBLIC_ORIGIN, holdInviteCode} from './features/reviewer/invite.js';
import type {SandboxActionKind} from './features/sandbox/useSandbox.js';
import {ReviewerSandboxClientActionSchema} from './integrations/reviewer-sandbox-contract.js';
import {cssVariables} from './design/tokens.js';
import {App, type AppServices} from './App.js';
import {liveServices} from './liveServices.js';
import {resolveSessionRole, roleServices} from './roleServices.js';
import {boardPort} from './features/applications/boardPort.js';
import {appPages} from './pages/index.js';
import './styles.css';

// First synchronous step on load, before any network call or render: take the REVIEWER code out of
// the URL fragment (only on the canonical HTTPS origin at /reviewer/invite) and keep it in memory.
const inviteHolder = holdInviteCode(consumeReviewerInviteFragment({location: window.location, history: window.history}, PUBLIC_ORIGIN));

const ALL_SANDBOX_ACTIONS: ReadonlySet<SandboxActionKind> =
  new Set(ReviewerSandboxClientActionSchema.options.map(o => o.shape.kind.value));

async function start() {
  const tokens = document.createElement('style');
  tokens.textContent = `:root{${cssVariables()}}`;
  document.head.append(tokens);

  const api = new HufsApiClient();
  let client: DemoClientPort = api;
  let transportLabel: string | null = null;
  let services: AppServices = {...liveServices(api), reviewerInvite: {port: api, holder: inviteHolder}};
  let localAccountWorkbench:ComponentType|undefined;
  // Normal production remains API-only. The explicitly opted-in Pages build uses
  // synthetic in-memory fixtures and never creates a live API transport for its UI.
  const localSynthetic = import.meta.env.DEV && import.meta.env.MODE === 'synthetic'
    && (location.hostname === '127.0.0.1' || location.hostname === 'localhost');
  if (localSynthetic || (
    import.meta.env.PROD && import.meta.env.MODE === 'pages-preview'
    && import.meta.env.VITE_STATIC_PAGES_PREVIEW === 'true'
  )) {
    const dev = await import('./dev/syntheticDemoClient.js');
    const synthetic = new dev.SyntheticDemoClient({snapshotErrors: localSynthetic ? {S04: 'SHARING_REVOKED'} : {}});
    const owner = await import('./dev/syntheticOwnerServer.js');
    const clubs = await import('./dev/syntheticClubs.js');
    const whatIf = await import('./dev/syntheticWhatIf.js');
    const planCheck = await import('./dev/syntheticPlanCheck.js');
    const revisions = await import('./dev/syntheticRevisions.js');
    const doubleMajor = await import('./dev/syntheticDoubleMajor.js');
    client = synthetic;
    transportLabel = dev.SYNTHETIC_TRANSPORT_LABEL;
    services = {
      // Never expose live API, Google login or REVIEWER invite ports on static Pages.
      ...(localSynthetic ? services : {}),
      loadCalendar: (ctx, signal) => synthetic.getCalendar(ctx.contextId, signal),
      // #80: the real HufsApiClient over an in-memory fictitious owner (dev only).
      applications: boardPort(new HufsApiClient(new owner.SyntheticOwnerServer().fetch)),
      clubs: clubs.syntheticClubPort(),
      whatIf: whatIf.syntheticWhatIfPort(),
      planCheck: planCheck.syntheticPlanCheckPort(),
      revisions: revisions.syntheticRevisionPort(),
      doubleMajor: doubleMajor.syntheticDoubleMajorPort(),
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
    // The local-account lab needs a local HTTP API; it is deliberately absent on Pages.
    if (localSynthetic) localAccountWorkbench = (await import('./features/local-accounts/LocalAccountWorkbench.js')).LocalAccountWorkbench;
  } else {
    // REVIEWER: synthetic sandbox only. Confirmed BETA: the #85 overlay. Unknown/outage: neither.
    services = {...services, ...roleServices(api, await resolveSessionRole(api))};
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
