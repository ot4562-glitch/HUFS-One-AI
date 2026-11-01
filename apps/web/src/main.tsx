import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {DemoController, newTabDemoRunId, type DemoClientPort} from './app/index.js';
import {HufsApiClient, consumeReviewerInviteFragment} from './integrations/index.js';
import {PUBLIC_ORIGIN, holdInviteCode} from './features/reviewer/invite.js';
import {cssVariables} from './design/tokens.js';
import {App, type AppServices} from './App.js';
import {liveServices} from './liveServices.js';
import {appPages} from './pages/index.js';
import './styles.css';

// First synchronous step on load, before any network call or render: take the REVIEWER code out of
// the URL fragment (only on the canonical HTTPS origin at /reviewer/invite) and keep it in memory.
const inviteHolder = holdInviteCode(consumeReviewerInviteFragment({location: window.location, history: window.history}, PUBLIC_ORIGIN));

async function start() {
  const tokens = document.createElement('style');
  tokens.textContent = `:root{${cssVariables()}}`;
  document.head.append(tokens);

  const api = new HufsApiClient();
  let client: DemoClientPort = api;
  let transportLabel: string | null = null;
  let services: AppServices = {...liveServices(api), reviewerInvite: {port: api, holder: inviteHolder}};
  // Synthetic transport only for `vite --mode synthetic` on a loopback host. The literal
  // import.meta.env.DEV check lets the production build drop this branch and its chunk.
  if (import.meta.env.DEV && import.meta.env.MODE === 'synthetic'
    && (location.hostname === '127.0.0.1' || location.hostname === 'localhost')) {
    const dev = await import('./dev/syntheticDemoClient.js');
    const synthetic = new dev.SyntheticDemoClient({snapshotErrors: {S04: 'SHARING_REVOKED'}});
    client = synthetic;
    transportLabel = dev.SYNTHETIC_TRANSPORT_LABEL;
    services = {...services, loadCalendar: (ctx, signal) => synthetic.getCalendar(ctx.contextId, signal)};
  }
  // One controller per tab, in memory only.
  const controller = new DemoController(client, newTabDemoRunId());
  const root = document.getElementById('root');
  if (root) {
    createRoot(root).render(
      <StrictMode><App controller={controller} transportLabel={transportLabel} pages={appPages} services={services} /></StrictMode>,
    );
  }
}

void start();
