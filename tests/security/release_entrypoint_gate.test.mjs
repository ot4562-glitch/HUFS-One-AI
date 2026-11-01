import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditAnonymousResponse, ENTRYPOINTS, EXTERNAL_GATES, probeAnonymousFastify,
} from '../../tools/release_entrypoint_gate.mjs';

// No raw HTTP payload or request header is logged on assertion failure.
const denied = () => ({
  statusCode: 401,
  headers: {'cache-control': 'private, no-store', 'content-type': 'application/json'},
  payload: '{"code":"UNAUTHENTICATED"}',
});

test('offline Fastify matrix really exercises denied HTTP with release still blocked', async () => {
  const report = await probeAnonymousFastify();
  assert.equal(report.gates[0].status, 'PASS',
    'offline failure metadata only: ' + JSON.stringify(report.findings));
  assert.equal(report.findings.length, 0, 'anonymous-route failure metadata must be empty');
  assert.ok(report.gates[0].requestsChecked >= ENTRYPOINTS.length * 3,
    'GET, HEAD and OPTIONS must be exercised for each path category');
  assert.ok(report.gates[0].routesChecked >= 7);
  assert.equal(report.release, 'BLOCKED');
  assert.equal(report.releaseDecision, 'RELEASE_BLOCKED');
  assert.deepEqual(report.gates.slice(1).map(gate => gate.status),
    EXTERNAL_GATES.map(() => 'NOT_RUN'));
});

test('baseline denied response permits only a private non-cached denial', () => {
  assert.deepEqual(auditAnonymousResponse(denied()), []);
});

test('non-denial statuses including redirects, 304, partial and upgrade are rejected', () => {
  for (const statusCode of [101, 200, 201, 204, 206, 302, 303, 304, 307, 308, 503]) {
    const result = auditAnonymousResponse({...denied(), statusCode});
    assert.ok(result.includes('ANONYMOUS_NON_DENIAL'), 'status ' + statusCode);
  }
});

test('missing and public caches, validators and partial-range bodies are rejected', () => {
  for (const headers of [
    {},
    {'cache-control': 'public, max-age=600'},
    {'cache-control': 'private, max-age=60'},
    {'cache-control': 'no-store', etag: '"cached"'},
    {'cache-control': 'no-store', 'last-modified': 'Wed, 01 Jan 2020 00:00:00 GMT'},
    {'cache-control': 'no-store', 'content-range': 'bytes 0-1/50'},
  ]) {
    assert.ok(auditAnonymousResponse({...denied(), headers}).length > 0);
  }
});

test('redirect target, CORS, streaming, upgrade and HTML/JS cannot be waved through', () => {
  for (const headers of [
    {'cache-control': 'no-store', location: 'https://other.example.test'},
    {'cache-control': 'no-store', 'access-control-allow-origin': '*'},
    {'cache-control': 'no-store', 'content-type': 'text/html'},
    {'cache-control': 'no-store', 'content-type': 'application/javascript'},
    {'cache-control': 'no-store', 'content-type': 'text/event-stream'},
    {'cache-control': 'no-store', upgrade: 'websocket'},
  ]) {
    assert.ok(auditAnonymousResponse({...denied(), headers}).length > 0);
  }
});

test('synthetic canary reflection and HEAD body are rejected without printing payload', () => {
  const payload = 'prefix synthetic-do-not-reflect-canary suffix';
  assert.ok(auditAnonymousResponse({...denied(), payload})
    .includes('REQUEST_DATA_REFLECTED'));
  assert.ok(auditAnonymousResponse({...denied(), payload: 'forbidden'}, 'HEAD')
    .includes('HEAD_HAS_BODY'));
});

test('offline surface inventory retains important categories', () => {
  const categories = new Set(ENTRYPOINTS.map(([category]) => category));
  for (const expected of [
    'login-shell', 'app-html', 'static-js', 'media', 'file', 'storage',
    'admin', 'debug', 'service-worker', 'api-health', 'auth-callback',
    'api-reviewer', 'api-demo', 'api-owner', 'api-ai', 'sse', 'websocket',
  ]) {
    assert.ok(categories.has(expected), 'missing classification ' + expected);
  }
});
