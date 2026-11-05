/** LOCAL CODE ONLY: renders configuration and audits metadata; never deploys. */
import {readFile, lstat} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {resolve, isAbsolute, join, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {isIP} from 'node:net';

const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, '../..');
export const OPERATOR_FILES = Object.freeze([
  'auth/oidc.client-secret', 'db/connection-string', 'api.env', 'production.mjs',
  'tls/fullchain.pem', 'tls/privkey.pem',
  'nginx/private.conf', 'nginx/private-proxy.conf',
  'receipts/operator-approval.json', 'receipts/oidc-mail-validation.json',
  'receipts/tls-network-validation.json', 'receipts/durable-db-validation.json',
  'receipts/data-rights-approval.json',
]);

export function canonicalHost(origin) {
  if (typeof origin !== 'string' || origin.length > 260
    || !/^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(origin))
    throw new Error('INVALID_ORIGIN');
  const host = origin.slice(8);
  if (isIP(host) || !host.includes('.') || host.split('.').some(label =>
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))
    throw new Error('INVALID_ORIGIN');
  return host;
}

function renderTemplate(name, origin) {
  const host = canonicalHost(origin);
  return readFileSync(join(here, name), 'utf8')
    .replaceAll('@@HOST@@', host).replaceAll('@@ESCAPED_HOST@@', host.replaceAll('.', '\\.'));
}

export function renderProxy(origin) {
  return renderTemplate('private-proxy.conf.template', origin);
}

export function renderIngress(origin) {
  // Embed the small header allowlist for a single, inspectable rendered config.
  return renderTemplate('nginx.private.conf.template', origin)
    .replaceAll('include /etc/nginx/private-proxy.conf;', renderProxy(origin));
}

/** Check only fixed relative filenames and filesystem metadata, NEVER bytes.
 * Links/junctions within the operator tree fail closed. No directory crawling.
 */
export async function inspectOperatorInputs(operatorRoot) {
  const result = [];
  for (const relative of OPERATOR_FILES) {
    let status = 'MISSING';
    if (typeof operatorRoot === 'string' && isAbsolute(operatorRoot)) {
      const parts = relative.split('/');
      let current = resolve(operatorRoot);
      try {
        for (let index = -1; index < parts.length; index++) {
          if (index >= 0) current = join(current, parts[index]);
          const metadata = await lstat(current);
          if (metadata.isSymbolicLink()) { status = 'LINK_REJECTED'; break; }
          if (index < parts.length - 1 && !metadata.isDirectory()) {
            status = 'TYPE_REJECTED'; break;
          }
          if (index === parts.length - 1)
            status = metadata.isFile() && metadata.size > 0 ? 'PRESENT_UNVERIFIED' : 'TYPE_REJECTED';
        }
      } catch { /* Missing/inaccessible inputs are not grants. Never echo paths. */ }
    }
    result.push({name: relative, status});
  }
  return result;
}

/** Offline evidence stays separate from operational approval. No env override. */
export async function validateDeployment({manifest, runOfflineProbe = true} = {}) {
  const reasonCodes = [
    'PRODUCTION_RUNTIME_NOT_APPLIED',
    'OPERATOR_EVIDENCE_NOT_VALIDATED',
    'LIVE_INGRESS_OIDC_DB_AND_RIGHTS_GATES_NOT_RUN',
  ];
  const allowed = new Set(['version', 'origin', 'operatorRoot', 'apiImage', 'edgeImage']);
  let valid = manifest && typeof manifest === 'object' && !Array.isArray(manifest);
  if (!valid) reasonCodes.push('MANIFEST_REQUIRED');
  else {
    if (Object.keys(manifest).some(key => !allowed.has(key))) {
      reasonCodes.push('UNKNOWN_MANIFEST_FIELD'); valid = false;
    }
    if (manifest.version !== 1) { reasonCodes.push('MANIFEST_VERSION_INVALID'); valid = false; }
    try { canonicalHost(manifest.origin); }
    catch { reasonCodes.push('INVALID_ORIGIN'); valid = false; }
    if (typeof manifest.operatorRoot !== 'string' || !isAbsolute(manifest.operatorRoot)) {
      reasonCodes.push('OPERATOR_ROOT_INVALID'); valid = false;
    }
    for (const field of ['apiImage', 'edgeImage']) {
      if (typeof manifest[field] !== 'string'
        || !/^[a-z0-9][a-z0-9._/-]*:[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$/.test(manifest[field])) {
        reasonCodes.push('REVIEWED_IMAGE_REFERENCE_REQUIRED'); valid = false;
      }
    }
  }
  const inputs = await inspectOperatorInputs(valid ? manifest.operatorRoot : undefined);
  if (inputs.some(input => input.status !== 'PRESENT_UNVERIFIED')) reasonCodes.push('OPERATOR_INPUTS_MISSING_OR_UNSAFE');
  const artifacts = [];
  for (const relative of ['dist/apps/api/src/main.js', 'dist/web/index.html']) {
    try {
      const metadata = await lstat(join(repository, relative));
      artifacts.push({name: relative, status: metadata.isFile() && !metadata.isSymbolicLink() ? 'PRESENT' : 'UNSAFE'});
    } catch { artifacts.push({name: relative, status: 'MISSING'}); }
  }
  if (artifacts.some(item => item.status !== 'PRESENT')) reasonCodes.push('COMPILED_ARTIFACTS_MISSING_OR_UNSAFE');
  let offline = {status: 'NOT_RUN'};
  if (runOfflineProbe && artifacts.every(item => item.status === 'PRESENT')) {
    try {
      const {probeAnonymousFastify} = await import('../../tools/release_entrypoint_gate.mjs');
      const report = await probeAnonymousFastify();
      const gate = report.gates.find(item => item.name === 'offline_anonymous_fastify');
      offline = {status: gate?.status === 'PASS' ? 'PASS' : 'FAIL',
        requestsChecked: gate?.requestsChecked ?? 0, routesChecked: gate?.routesChecked ?? 0};
    } catch { offline = {status: 'FAIL'}; }
  }
  if (offline.status !== 'PASS') reasonCodes.push('OFFLINE_ENTRYPOINT_PROBE_' + offline.status);
  return {releaseDecision: 'RELEASE_BLOCKED', action: 'LOCAL_VALIDATION_ONLY',
    reasonCodes: [...new Set(reasonCodes)], inputs, artifacts, offline};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, manifestPath, ...extra] = process.argv.slice(2);
  try {
    if (!['validate', 'render-nginx', 'render-proxy'].includes(command) || extra.length)
      throw new Error('INVALID_COMMAND');
    // The named manifest is public configuration, never an env/secret file.
    if (!manifestPath || !manifestPath.endsWith('.manifest.json')) throw new Error('MANIFEST_REQUIRED');
    const metadata = await lstat(manifestPath);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 16384)
      throw new Error('MANIFEST_UNSAFE');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (command === 'validate') {
      process.stdout.write(JSON.stringify(await validateDeployment({manifest})) + '\n');
      process.exitCode = 2; // Validation cannot authorize deployment.
    } else {
      process.stdout.write(command === 'render-nginx' ? renderIngress(manifest.origin) : renderProxy(manifest.origin));
    }
  } catch {
    process.stdout.write(JSON.stringify({releaseDecision: 'RELEASE_BLOCKED', reasonCodes: ['INVALID_COMMAND_OR_MANIFEST']}) + '\n');
    process.exitCode = 2;
  }
}
