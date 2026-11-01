/**
 * Issue #89: actual GoogleAuthFlow/Fastify logic with synthetic offline ports.
 * No Google token verification, network request, real cookie or student login.
 * This tests server-side session/CSRF/cookie behavior, not browser cache purge.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createApi} from '../../dist/apps/api/src/server.js';
import {closedRepository} from '../../dist/apps/api/src/repository.js';
import {createGoogleAuthFlow} from
  '../../dist/apps/api/src/modules/auth/google-auth-flow.js';
import {MemoryGoogleAuthStore} from
  '../../dist/apps/api/src/modules/auth/google-auth-store.js';
import {MemoryAuthAttemptLimiter} from
  '../../dist/apps/api/src/modules/auth/auth-attempt-limiter.js';
import {MemoryReviewerAccessStore} from
  '../../dist/apps/api/src/modules/auth/reviewer.js';

const ORIGIN = 'https://offline.example.test';
const NOW = new Date('2026-11-01T04:00:00.000Z');
const CLIENT = '123456-synthetic.apps.googleusercontent.com';
const COOKIE_NAME = '__Host-hufs_session';
const STATE_COOKIE_NAME = '__Host-hufs_login';

function cookie(res, name) {
  const value = res.headers['set-cookie'];
  const raw = Array.isArray(value) ? value : [value];
  const entry = raw.find(item => typeof item === 'string' && item.startsWith(name + '='));
  return typeof entry === 'string' ? entry : '';
}

function assertStrictHostCookie(value, name) {
  assert.ok(value.startsWith(name + '='));
  for (const attribute of ['Path=/', 'Secure', 'HttpOnly', 'SameSite=Lax']) {
    assert.ok(value.includes(attribute), 'required cookie attribute: ' + attribute);
  }
  assert.ok(!/(^|;)\s*Domain\s*=/i.test(value), 'host-only cookies must omit Domain');
}

function harness() {
  const store = new MemoryGoogleAuthStore();
  const flow = createGoogleAuthFlow({
    clientId: CLIENT,
    redirectUri: ORIGIN + '/api/auth/google/callback',
    allowedOrigin: ORIGIN,
    store,
    attemptLimiter: new MemoryAuthAttemptLimiter(),
    now: () => NOW,
    // Synthetic transport/verifier: verify cookie+session wiring without
    // contacting Google. JOSE/JWKS cryptographic tests live separately.
    exchangeCode: async () => 'synthetic-id-token',
    verifyIdToken: async (_token, nonce) => {
      assert.match(nonce, /^[A-Za-z0-9_-]{43}$/);
      return {
        googleSubject: 'synthetic-reviewer-01',
        verifiedEmail: 'tester@example.test',
        identityProofExpiresAt: '2026-11-01T04:30:00.000Z',
        issuer: 'https://accounts.google.com',
        hostedDomain: null,
        schoolWorkspaceVerified: false,
      };
    },
  });
  const app = createApi({
    repository: closedRepository,
    allowedOrigin: ORIGIN,
    googleAuth: flow,
    reviewerAccess: new MemoryReviewerAccessStore(),
    now: () => NOW.toISOString(),
  });
  return {app, store};
}

async function begin(app) {
  const start = await app.inject({
    method: 'GET', url: '/api/auth/google/start',
    headers: {'sec-fetch-site': 'same-origin'},
  });
  assert.equal(start.statusCode, 303);
  const url = new URL(String(start.headers.location));
  assert.equal(url.origin, 'https://accounts.google.com');
  const state = url.searchParams.get('state');
  assert.match(state, /^[A-Za-z0-9_-]{43}$/);
  return {start, state, binding: cookie(start, STATE_COOKIE_NAME)};
}

async function complete(app, started) {
  const response = await app.inject({
    method: 'GET',
    url: '/api/auth/google/callback?state=' + started.state + '&code=synthetic-code',
    headers: {cookie: started.binding.split(';')[0], 'sec-fetch-site': 'cross-site'},
  });
  assert.equal(response.statusCode, 303);
  assert.equal(response.headers.location, '/reviewer');
  return {response, session: cookie(response, COOKIE_NAME).split(';')[0]};
}

test('OAuth entry is opt-in and requires same-site launch, with no cache', async () => {
  const {app} = harness();
  try {
    assert.equal((await app.inject({method: 'GET', url: '/api/auth/google/start',
      headers: {'sec-fetch-site': 'cross-site'}})).statusCode, 403);
    for (const method of ['HEAD', 'OPTIONS']) {
      assert.equal((await app.inject({
        method, url: '/api/auth/google/start',
      })).statusCode, 401);
    }
    const started = await begin(app);
    assertStrictHostCookie(started.binding, STATE_COOKIE_NAME);
    assert.equal(started.start.headers['cache-control'], 'no-store');
    assert.equal(started.start.headers['access-control-allow-origin'], undefined);
  } finally { await app.close(); }
});

test('signed-in session and logout cookies enforce secure host-only attributes', async () => {
  const {app} = harness();
  try {
    const started = await begin(app);
    const {response, session} = await complete(app, started);
    assertStrictHostCookie(cookie(response, COOKIE_NAME), COOKIE_NAME);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers.location, '/reviewer');
    assert.ok(!cookie(response, COOKIE_NAME).includes('synthetic-code'));
    assert.ok(!cookie(response, COOKIE_NAME).includes('tester@example.test'));

    const csrf = await app.inject({url: '/api/auth/csrf', headers: {cookie: session}});
    assert.equal(csrf.statusCode, 200);
    assert.equal(csrf.headers['cache-control'], 'no-store');
    assert.match(csrf.json().csrfToken, /^[A-Za-z0-9_-]{43}$/);
  } finally { await app.close(); }
});

test('Origin, CSRF and fetch-site violations fail without revoking the good session', async () => {
  const {app} = harness();
  try {
    const {session} = await complete(app, await begin(app));
    const proof = (await app.inject({url: '/api/auth/csrf',
      headers: {cookie: session}})).json().csrfToken;
    const attempts = [
      {cookie: session},
      {cookie: session, origin: ORIGIN},
      {cookie: session, origin: 'https://evil.example.test', 'x-csrf-token': proof},
      {cookie: session, origin: ORIGIN, 'x-csrf-token': 'invalid'},
      {cookie: session, origin: ORIGIN, 'x-csrf-token': proof, 'sec-fetch-site': 'cross-site'},
    ];
    for (const headers of attempts) {
      const denied = await app.inject({method: 'POST',url: '/api/auth/logout',
        headers, payload: {}});
      assert.equal(denied.statusCode, 403, 'unauthorized state change must fail');
      assert.equal(denied.headers['cache-control'], 'no-store');
    }
    assert.equal((await app.inject({url: '/api/auth/csrf',
      headers: {cookie: session}})).statusCode, 200);
  } finally { await app.close(); }
});

test('logout revokes same server session for other tabs and conditional requests', async () => {
  const {app} = harness();
  try {
    const {session} = await complete(app, await begin(app));
    const first = await app.inject({url: '/api/auth/csrf',
      headers: {cookie: session, 'x-synthetic-tab': 'one'}});
    const second = await app.inject({url: '/api/auth/csrf',
      headers: {cookie: session, 'x-synthetic-tab': 'two'}});
    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200);
    const logout = await app.inject({method: 'POST',url: '/api/auth/logout',
      headers: {cookie: session, origin: ORIGIN,
        'x-csrf-token': first.json().csrfToken}, payload: {}});
    assert.equal(logout.statusCode, 204);
    assert.equal(logout.headers['cache-control'], 'no-store');
    const cleared = cookie(logout, COOKIE_NAME);
    assertStrictHostCookie(cleared, COOKIE_NAME);
    assert.ok(cleared.includes('Max-Age=0'));
    for (const tab of ['one', 'two']) {
      const denied = await app.inject({url: '/api/auth/csrf',
        headers: {cookie: session, 'x-synthetic-tab': tab,
          'if-none-match': '*'}});
      assert.equal(denied.statusCode, 401);
      assert.equal(denied.headers['cache-control'], 'no-store');
    }
  } finally { await app.close(); }
});

test('OAuth callback rejects absent browser binding and one-time state replay', async () => {
  const {app} = harness();
  try {
    const started = await begin(app);
    const query = '/api/auth/google/callback?state=' + started.state + '&code=synthetic-code';
    const noCookie = await app.inject({method: 'GET', url: query});
    assert.equal(noCookie.statusCode, 403);
    assert.equal(noCookie.headers['cache-control'], 'no-store');
    assert.ok(!String(noCookie.payload).includes('synthetic-code'));
    const another = await begin(app);
    await complete(app, another);
    const replay = await app.inject({method: 'GET',
      url: '/api/auth/google/callback?state=' + another.state + '&code=synthetic-code',
      headers: {cookie: another.binding.split(';')[0]}});
    assert.equal(replay.statusCode, 403);
    assert.equal(replay.headers['cache-control'], 'no-store');
    assert.ok(!cookie(replay, COOKIE_NAME));
  } finally { await app.close(); }
});
