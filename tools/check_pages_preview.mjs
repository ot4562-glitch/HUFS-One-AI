/**
 * Browser smoke for the *built*, isolated GitHub Pages UI. No server/API/database
 * is started other than Vite's local static-file preview server. Synthetic only.
 */
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join, dirname} from 'node:path';
import {chromium} from 'playwright-core';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const basePath = (process.env.PAGES_BASE_PATH ?? '').replace(/\/+$/, '');
const origin = 'http://127.0.0.1:4173';
const url = origin + basePath + '/';
const cli = join(root, 'node_modules/vite/bin/vite.js');
const server = spawn(process.execPath, [
  cli, 'preview', '--config', 'apps/web/vite.config.ts',
  '--mode', 'pages-preview', '--host', '127.0.0.1', '--port', '4173',
], {cwd: root, env: {...process.env, VITE_STATIC_PAGES_PREVIEW: 'true'}, stdio: ['ignore', 'pipe', 'pipe']});
let logs = '';
for (const stream of [server.stdout, server.stderr]) {
  stream.setEncoding('utf8');
  stream.on('data', chunk => { logs += chunk; });
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function ready() {
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error('Static preview server exited: ' + logs);
    try {
      const res = await fetch(url);
      if (res.ok && (await res.text()).includes('HUFS One AI')) return;
    } catch { /* Vite not listening yet */ }
    await delay(250);
  }
  throw new Error('Static preview did not start: ' + logs);
}

let browser;
try {
  await ready();
  browser = await chromium.launch({channel: 'chrome', headless: true, args: ['--no-sandbox']});
  for (const viewport of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
    const page = await browser.newPage({viewport});
    const requests = [];
    const errors = [];
    page.on('request', request => {
      if (request.resourceType() === 'fetch' || request.resourceType() === 'xhr' ||
          request.url().includes('/api/')) requests.push(request.url());
    });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url, {waitUntil: 'load'});
    await page.locator('.app__transport').waitFor({timeout: 15000});
    const label = await page.locator('.app__transport').innerText();
    if (!label.includes('합성 모의 연결') || !label.includes('실제 서버')) {
      throw new Error('Synthetic-only banner missing: ' + label);
    }
    const nav = page.getByRole('navigation', {name: '주요 메뉴'});
    await nav.getByRole('link', {name: '기회'}).click();
    await page.waitForURL(/\?page=%2Fopportunities(?:&|$)/);
    await page.reload({waitUntil: 'load'});
    const heading = await page.locator('.page__title').innerText();
    if (/페이지를 찾을 수 없습니다/.test(heading)) throw new Error('Lost static deep link');
    await nav.getByRole('link', {name: '오늘'}).click();
    if (requests.length) throw new Error('Static UI attempted API/fetch: ' + requests.join(', '));
    if (errors.length) throw new Error('UI runtime exception: ' + errors.join('; '));
    console.log(`PASS static Pages ${viewport.width}px: synthetic, navigation, reload, no API`);
    await page.close();
  }
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
