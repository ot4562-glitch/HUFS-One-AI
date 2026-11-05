import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import {
  canonicalHost, renderIngress, inspectOperatorInputs, validateDeployment,
  OPERATOR_FILES,
} from '../../infra/deploy/private-deployment.mjs';

const origin = 'https://private.example.test';

test('canonical origin forbids ports, IP, preview aliases and configuration injection', () => {
  assert.equal(canonicalHost(origin), 'private.example.test');
  for (const value of ['http://private.example.test', 'https://127.0.0.1',
    'https://[::1]', origin + ':443', origin + '/', origin + '/path',
    'https://user:pass@private.example.test', 'https://x.test;return 200;',
    'https://private.example.test\nserver {}', 'https://UPPER.example.test']) {
    assert.throws(() => canonicalHost(value), /INVALID_ORIGIN/);
  }
});

test('every product route inherits validated session auth, including static SPA fallback', () => {
  const config = renderIngress(origin);
  assert.match(config, /auth_request \/_validated_session;/);
  assert.match(config, /location = \/_validated_session \{\s*internal;/);
  assert.match(config, /proxy_pass http:\/\/api:3000\/api\/auth\/session;/);
  assert.match(config, /proxy_pass_request_body off;/);
  assert.match(config, /proxy_method GET;/);
  assert.match(config, /location \/ \{[\s\S]*try_files \$uri \/index.html;/);
  assert.match(config, /location \^~ \/api\/ \{/);
  const exceptions = [...config.matchAll(/location = ([^ ]+) \{\s*auth_request off;/g)]
    .map(match => match[1]);
  assert.deepEqual(exceptions, ['/api/auth/google/start', '/api/auth/google/callback']);
  assert.equal((config.match(/auth_request off;/g) ?? []).length, 3);
  assert.match(config, /ssl_reject_handshake on;/);
  assert.match(config, /if \(\$http_host !~ \^private\\\.example\\\.test\(:443\)\?\$\)/);
  assert.match(config, /if \(\$ssl_server_name != private.example.test\)/);
  assert.match(config, /Cache-Control "private, no-store, max-age=0" always/);
  assert.match(config, /proxy_cache off;/);
  assert.match(config, /etag off;/);
  assert.doesNotMatch(config, /\$(?:request_uri|request|args|http_cookie|http_authorization).*log_format/);
  assert.match(config, /log_format minimal '\$status \$body_bytes_sent';/);
  assert.match(config, /proxy_set_header Origin \$http_origin;/);
  assert.match(config, /proxy_set_header X-CSRF-Token \$http_x_csrf_token;/);
  assert.match(config, /proxy_set_header Host private.example.test;/);
  assert.doesNotMatch(config, /add_header Access-Control-Allow-Origin|proxy_cache_path|expires [1-9]/);
  assert.match(config, /error_page 401 403 = @private_denial;/);
  assert.match(config, /location @private_denial \{\s*default_type application\/json;/);
});

test('dry validation inspects fixed paths only, never treating present secret/receipt bytes as approval', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hufs-deploy-test-'));
  try {
    const missing = await inspectOperatorInputs(root);
    assert.equal(missing.every(item => item.status === 'MISSING'), true);
    for (const path of OPERATOR_FILES) {
      const target = join(root, path);
      await mkdir(join(target, '..'), {recursive: true});
      await writeFile(target, 'DO_NOT_READ_OR_ECHO_PRIVATE_CONTENT');
    }
    const present = await inspectOperatorInputs(root);
    assert.equal(present.every(item => item.status === 'PRESENT_UNVERIFIED'), true);
    const result = await validateDeployment({manifest: {
      version: 1, origin, operatorRoot: root,
      apiImage: 'local-api:reviewed', edgeImage: 'local-edge:reviewed',
      READY: true, releaseReady: true,
    }, runOfflineProbe: false});
    assert.equal(result.releaseDecision, 'RELEASE_BLOCKED');
    assert.ok(result.reasonCodes.includes('UNKNOWN_MANIFEST_FIELD'));
    assert.equal(JSON.stringify(result).includes('DO_NOT_READ'), false);
    const validShape = await validateDeployment({manifest: {
      version: 1, origin, operatorRoot: root,
      apiImage: 'local-api:reviewed', edgeImage: 'local-edge:reviewed',
    }, runOfflineProbe: false});
    assert.equal(validShape.releaseDecision, 'RELEASE_BLOCKED');
    assert.ok(validShape.reasonCodes.includes('PRODUCTION_RUNTIME_NOT_APPLIED'));
    assert.ok(validShape.reasonCodes.includes('OPERATOR_EVIDENCE_NOT_VALIDATED'));
    assert.ok(validShape.reasonCodes.includes('OFFLINE_ENTRYPOINT_PROBE_NOT_RUN'));
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('containers use actual compiled outputs and default to an explicitly disabled profile', () => {
  const dockerfile = readFileSync(new URL('../../infra/deploy/Dockerfile', import.meta.url), 'utf8');
  const compose = readFileSync(new URL('../../infra/deploy/compose.private.yaml', import.meta.url), 'utf8');
  assert.match(dockerfile, /npm run build:api && npm run build:web/);
  assert.match(dockerfile, /CMD \["node", "dist\/apps\/api\/src\/production-main.js", "--apply"\]/);
  assert.match(dockerfile, /install -d -o root -g node -m 0750 \/etc\/hufs-one\/private/);
  assert.match(compose, /HUFS_PRODUCTION_CONFIG: \/etc\/hufs-one\/private\/production.mjs/);
  assert.match(compose, /HUFS_API_INTERNAL_PORT: "3000"/);
  assert.match(compose, /source: \$\{HUFS_OPERATOR_ROOT\}\/production.mjs[\s\S]*target: \/etc\/hufs-one\/private\/production.mjs[\s\S]*read_only: true/);
  assert.match(compose, /approved-egress:[\s\S]*external: true[\s\S]*HUFS_APPROVED_EGRESS_NETWORK/);
  assert.ok(OPERATOR_FILES.includes('production.mjs'));
  assert.doesNotMatch(dockerfile, /COPY .*production\.mjs|CMD \["node", "dist\/apps\/api\/src\/main.js"\]/);
  assert.match(dockerfile, /COPY --from=build \/app\/dist\/web/);
  assert.doesNotMatch(dockerfile, /COPY \. /);
  assert.equal((compose.match(/profiles: \[private-deployment\]/g) ?? []).length, 2);
  assert.match(compose, /127\.0\.0\.1/);
  assert.equal((compose.match(/ports:/g) ?? []).length, 1);
  assert.match(compose, /APP_ENV: production/);
  assert.match(compose, /LAYA_ENABLED: "false"/);
  assert.match(compose, /AI_PROVIDER_ENABLED: "false"/);
  assert.match(compose, /read_only: true/);
  assert.match(compose, /no-new-privileges:true/);
  assert.doesNotMatch(compose, /postgres:|POSTGRES_PASSWORD|restart: always|docker\.sock|privileged: true/);
});
