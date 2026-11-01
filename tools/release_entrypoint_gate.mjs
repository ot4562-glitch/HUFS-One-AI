/**
 * Issue #89 — synthetic, in-process Fastify anonymous internet-surface probe.
 * This is NOT an ingress, browser, TLS, CDN, storage, preview or live-DNS test.
 * No students, cookies, real network, credentials or private fixtures are used.
 */
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createApi} from '../dist/apps/api/src/server.js';
import {closedRepository} from '../dist/apps/api/src/repository.js';

const CANARY = 'synthetic-do-not-reflect-canary';
const DENIAL_CODES = new Set([401, 403, 404, 405]);
const APP_ORIGIN = 'https://offline.example.test';

// A representative inventory of route families that have an actual HTTP
// surface or a specifically forbidden ingress candidate. The method and
// response matrix checks actual Fastify inject replies, not HTTP mocks.
export const ENTRYPOINTS = Object.freeze([
  ['app-html', '/'], ['login-shell', '/login'], ['app-html', '/index.html'],
  ['app-html', '/reviewer'], ['static-js', '/assets/app.js'],
  ['static-css', '/assets/app.css'], ['service-worker', '/sw.js'],
  ['service-worker', '/service-worker.js'],
  ['file', '/download/report.pdf'], ['media', '/media/sample.png'],
  ['storage', '/storage/private-object'], ['debug', '/debug'],
  ['admin', '/admin'], ['api-admin', '/api/admin/usage'],
  ['api-admin', '/api/admin/demo/preflight'],
  ['api-health', '/api/health'], ['api-auth', '/api/auth/session'],
  ['api-auth', '/api/auth/csrf'], ['auth-start', '/api/auth/google/start'],
  ['auth-callback', '/api/auth/google/callback?code=invalid&state=invalid'],
  ['api-auth', '/api/auth/logout'], ['api-reviewer', '/api/reviewer/capabilities'],
  ['api-reviewer', '/api/reviewer/demo/profiles'],
  ['api-reviewer', '/api/reviewer/demo/subjects/S01/snapshot'],
  ['api-demo', '/api/demo/profiles'], ['api-demo', '/api/demo/contexts/opaque/snapshot'],
  ['api-demo', '/api/demo/contexts/opaque/calendar'],
  ['api-owner', '/api/profile'], ['api-owner', '/api/consents'],
  ['api-academic', '/api/academics/transcript'],
  ['api-evidence', '/api/evidence/search?q=synthetic'],
  ['api-ai', '/api/ai/jobs/opaque'], ['api-ai', '/api/ai/experience-skills'],
  ['sse', '/api/events'], ['websocket', '/api/events/ws'],
  ['api-file', '/api/files/opaque/download'],
  ['api-media', '/api/media/opaque'],
]);

// Require a selected set of proven route registrations to avoid an apparent
// green result from probing only unimplemented 404 responses.
export const EXPECTED_ROUTES = Object.freeze([
  '/api/health', '/api/auth/session', '/api/auth/csrf',
  '/api/demo/profiles', '/api/reviewer/capabilities',
  '/api/reviewer/demo/profiles', '/api/evidence/search',
]);
export const EXTERNAL_GATES = Object.freeze([
  'dns_tls_hsts_real_domain', 'direct_ip_and_reverse_proxy',
  'cdn_preview_and_object_storage', 'google_oidc_hufs_mail_smtp',
  'real_browser_service_worker_logout_tabs',
  'production_postgres_ncp_and_private_ports',
  'data_rights_consent_and_independent_approval',
]);

/** Only reason codes, synthetic route classes and numeric status are reported. */
export function auditAnonymousResponse(reply, method = 'GET') {
  const problems = [];
  const headers = Object.fromEntries(
    Object.entries(reply.headers ?? {}).map(([key, value]) => [key.toLowerCase(), String(value)]),
  );
  const cache = (headers['cache-control'] ?? '').toLowerCase();
  if (!DENIAL_CODES.has(reply.statusCode)) problems.push('ANONYMOUS_NON_DENIAL');
  if (!/(^|[, ]+)no-store($|[, ]+)/.test(cache)) problems.push('CACHE_NOT_NO_STORE');
  if (/\bpublic\b|\bmax-age\s*=\s*[1-9]/.test(cache))
    problems.push('CACHE_PUBLIC_OR_LIFETIME');
  if (headers.location || headers['content-location']) problems.push('REDIRECT_OR_LOCATION');
  if (headers.etag || headers['last-modified'] || headers['content-range'])
    problems.push('CACHE_OR_PARTIAL_ENTITY');
  if (headers['access-control-allow-origin'])
    problems.push('CROSS_ORIGIN_EXPOSURE');
  if (headers['upgrade']) problems.push('UPGRADE_EXPOSURE');
  if (/text\/html|javascript|text\/event-stream/i.test(headers['content-type'] ?? ''))
    problems.push('APP_OR_STREAM_BODY');
  if (typeof reply.payload === 'string' && reply.payload.includes(CANARY))
    problems.push('REQUEST_DATA_REFLECTED');
  if (method === 'HEAD' && reply.payload) problems.push('HEAD_HAS_BODY');
  return problems;
}

export async function probeAnonymousFastify() {
  const app = createApi({
    allowedOrigin: APP_ORIGIN,
    repository: closedRepository,
    // Deliberately no Google/OTP/session/reviewer/AI adapter.
  });
  const findings = [];
  let requestsChecked = 0;
  let routesChecked = 0;
  try {
    await app.ready();
    for (const url of EXPECTED_ROUTES) {
      routesChecked++;
      if (!app.hasRoute({method: 'GET', url})) {
        findings.push({category: 'route-registration', method: 'GET',
          path: url, status: null, reasons: ['EXPECTED_ROUTE_MISSING']});
      }
    }
    const probes = [];
    for (const [category, path] of ENTRYPOINTS) {
      for (const method of ['GET', 'HEAD', 'OPTIONS']) {
        probes.push({category, path, method, headers: {}});
      }
    }
    // Synthetic cache, Origin, reverse-proxy, IP and preview attempts. These
    // are *in-process request headers*, not tests against the real internet.
    const extra = [
      {category: 'conditional-get', path: '/api/auth/session', method: 'GET',
        headers: {'if-none-match': '*', 'if-modified-since': 'Wed, 01 Jan 2020 00:00:00 GMT'}},
      {category: 'partial-content', path: '/api/demo/profiles', method: 'GET',
        headers: {range: 'bytes=0-99'}},
      {category: 'cross-origin', path: '/api/auth/session', method: 'GET',
        headers: {origin: 'https://other.example.test', 'sec-fetch-site': 'cross-site'}},
      {category: 'preflight', path: '/api/demo/profiles', method: 'OPTIONS',
        headers: {origin: 'https://other.example.test',
          'access-control-request-method': 'GET'}},
      {category: 'direct-ip-headers', path: '/api/auth/session', method: 'GET',
        headers: {host: '203.0.113.41', 'x-forwarded-user': 'admin',
          'x-forwarded-proto': 'https'}},
      {category: 'preview-headers', path: '/api/demo/profiles', method: 'GET',
        headers: {host: 'preview.example.test', 'x-forwarded-host': 'offline.example.test'}},
      {category: 'sse-upgrade', path: '/api/events', method: 'GET',
        headers: {accept: 'text/event-stream'}},
      {category: 'websocket-upgrade', path: '/api/events/ws', method: 'GET',
        headers: {connection: 'upgrade', upgrade: 'websocket',
          'sec-websocket-version': '13', 'sec-websocket-key': 'c3ludGhldGljMTIzNA=='}},
      {category: 'anonymous-write', path: '/api/auth/logout', method: 'POST',
        headers: {origin: APP_ORIGIN, 'x-csrf-token': CANARY}},
      {category: 'anonymous-write', path: '/api/reviewer/invitations/redeem', method: 'POST',
        headers: {origin: APP_ORIGIN, 'x-csrf-token': CANARY}},
      {category: 'anonymous-write', path: '/api/profile', method: 'PATCH',
        headers: {origin: APP_ORIGIN, 'x-csrf-token': CANARY}},
    ];
    for (const probe of [...probes, ...extra]) {
      const response = await app.inject({
        method: probe.method, url: probe.path,
        headers: {'x-a04-canary': CANARY, ...probe.headers},
      });
      requestsChecked++;
      const reasons = auditAnonymousResponse(response, probe.method);
      if (reasons.length) findings.push({
        category: probe.category, method: probe.method, path: probe.path,
        status: response.statusCode, reasons,
      });
    }
  } finally {
    await app.close();
  }
  const status = findings.length ? 'FAIL' : 'PASS';
  return {
    release: 'BLOCKED', releaseDecision: 'RELEASE_BLOCKED',
    gates: [
      {name: 'offline_anonymous_fastify', status, requestsChecked, routesChecked},
      ...EXTERNAL_GATES.map(name => ({name, status: 'NOT_RUN'})),
    ],
    findings,
    // Never infer an internet ingress grant from an in-process HTTP test.
    reason: 'No approved internet ingress or external end-to-end release evidence',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await probeAnonymousFastify();
  process.stdout.write(JSON.stringify(report) + '\n');
  if (report.gates[0].status === 'FAIL') process.exitCode = 1;
}
