import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {DemoController, newTabDemoRunId, type DemoClientPort} from './app/index.js';
import {HufsApiClient} from './integrations/index.js';
import {cssVariables} from './design/tokens.js';
import {App, type AppServices} from './App.js';
import {appPages} from './pages/index.js';
import './styles.css';

async function start() {
  const tokens = document.createElement('style');
  tokens.textContent = `:root{${cssVariables()}}`;
  document.head.append(tokens);

  let client: DemoClientPort = new HufsApiClient();
  let transportLabel: string | null = null;
  // Real calendar port waits for HufsApiClient.getCalendar (#71); until then the widget says it is not connected.
  let services: AppServices = {};
  // Synthetic transport only for `vite --mode synthetic` on a loopback host. The literal
  // import.meta.env.DEV check lets the production build drop this branch and its chunk.
  if (import.meta.env.DEV && import.meta.env.MODE === 'synthetic'
    && (location.hostname === '127.0.0.1' || location.hostname === 'localhost')) {
    const dev = await import('./dev/syntheticDemoClient.js');
    const synthetic = new dev.SyntheticDemoClient({snapshotErrors: {S04: 'SHARING_REVOKED'}});
    client = synthetic;
    transportLabel = dev.SYNTHETIC_TRANSPORT_LABEL;
    services = {loadCalendar: (ctx, signal) => synthetic.getCalendar(ctx.contextId, signal)};
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
