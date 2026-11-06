import {defineConfig} from '@playwright/test';

/**
 * Local browser E2E against the SYNTHETIC dev mode (no real API, no student data).
 * Uses an installed browser channel (default Microsoft Edge) so nothing is downloaded:
 *   npm run test:e2e:web                       # Edge
 *   PW_CHANNEL=chrome npm run test:e2e:web     # Chrome
 * CI wiring (browser install in Actions) is a separate integration-owner decision.
 */
const PORT = 5174;

export default defineConfig({
  testDir: './e2e',
  outputDir: '../../dist/playwright-results', // dist/ is gitignored
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...(process.env.PW_EXECUTABLE_PATH
      ? {launchOptions: {executablePath: process.env.PW_EXECUTABLE_PATH}}
      : {channel: process.env.PW_CHANNEL ?? 'msedge'}),
    trace: 'off',
    screenshot: 'off',
  },
  webServer: {
    command: `npx vite --config apps/web/vite.config.ts --mode synthetic --port ${PORT} --strictPort`,
    cwd: '../..',
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
