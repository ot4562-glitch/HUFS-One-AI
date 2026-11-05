import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const CLI = fileURLToPath(new URL('../../tools/audit_dependency_licenses.mjs', import.meta.url));
const INTEGRITY = 'sha512-' + createHash('sha512').update('synthetic tarball').digest('base64');
const LICENSE = 'Synthetic license fixture, not a real license grant.\n';

function write(root, path, value) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, value);
}

function fixture(t, entries, rootEntry = {}) {
  const root = mkdtempSync(join(tmpdir(), 'synthetic-license-audit-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const lock = {
    name: 'synthetic-audit', version: '1.0.0', lockfileVersion: 3,
    packages: { '': { name: 'synthetic-audit', version: '1.0.0', ...rootEntry }, ...entries },
  };
  const text = JSON.stringify(lock) + '\n';
  write(root, 'package-lock.json', text);
  return { root, lock, text };
}

function registry(version = '1.0.0', license = 'MIT') {
  return { version, resolved: 'https://registry.example.invalid/synthetic.tgz', integrity: INTEGRITY,
    ...(license === undefined || license === null ? {} : { license }) };
}

function install(root, path, name, version = '1.0.0', license = 'MIT') {
  write(root, path + '/package.json', JSON.stringify({ name, version,
    ...(license === null ? {} : { license }) }));
  write(root, path + '/LICENSE', LICENSE);
}

function audit(root, exitCode = 0) {
  const result = spawnSync(process.execPath, [CLI, '--root', root],
    { encoding: 'utf8', timeout: 10_000 });
  assert.equal(result.status, exitCode, 'audit CLI exit status: ' + result.stderr);
  assert.equal(result.stderr, '', 'diagnostics must not expose paths or input');
  return JSON.parse(result.stdout);
}

function reasons(report) {
  return report.findings.map((entry) => entry.reason);
}

test('lockfile-bound inventory is deterministic and records dependency scope without authorizing release', (t) => {
  const { root, text } = fixture(t, {
    'node_modules/demo-direct': registry(),
    'node_modules/demo-parent/node_modules/demo-transitive': { ...registry('2.0.0', 'Apache-2.0'), dev: true },
  }, { dependencies: { 'demo-direct': '1.0.0' } });
  install(root, 'node_modules/demo-direct', 'demo-direct');
  install(root, 'node_modules/demo-parent/node_modules/demo-transitive', 'demo-transitive', '2.0.0', 'Apache-2.0');
  write(root, 'node_modules/demo-direct/NOTICE', 'Synthetic notice.\n');

  const report = audit(root);

  assert.deepEqual(audit(root), report);
  assert.equal(report.lockfileSha256, createHash('sha256').update(text).digest('hex'));
  assert.equal(report.inventoryStatus, 'COMPLETE_WITHIN_SCOPE');
  assert.equal(report.packageCount, 2);
  const direct = report.packages.find((item) => item.name === 'demo-direct');
  const transitive = report.packages.find((item) => item.name === 'demo-transitive');
  assert.equal(direct.direct, true);
  assert.equal(direct.usage, 'RUNTIME_OR_SHARED');
  assert.equal(transitive.direct, false);
  assert.equal(transitive.usage, 'DEVELOPMENT_ONLY');
  assert.equal(transitive.version, '2.0.0');
  assert.equal(direct.integrity, INTEGRITY);
  assert.equal(direct.installedMetadataStatus, 'MATCHED');
  assert.equal(direct.license.declaration, 'MIT');
  assert.equal(direct.license.evidence, 'PRESENT');
  assert.equal(direct.evidenceFiles.find((file) => file.kind === 'LICENSE').sha256,
    createHash('sha256').update(LICENSE).digest('hex'));
  assert.deepEqual(direct.evidenceFiles.map((file) => file.kind), ['LICENSE', 'NOTICE']);
  assert.equal(report.releaseDecision, 'RELEASE_BLOCKED');
  assert.equal(report.gates.licenseObligationsAndAssetFontModelRights, 'NOT_VERIFIED');
  assert.equal(report.gates.installedBytesMatchRegistryIntegrity, 'NOT_VERIFIED');
  assert.equal(report.gates.vulnerabilityAndProvenanceReview, 'NOT_RUN');
  assert.equal(report.gates.independentCurrentHeadReleaseApproval, 'NOT_VERIFIED');
});

test('installed metadata can provide a declaration absent from the lockfile', (t) => {
  const { root } = fixture(t, { 'node_modules/demo': registry('1.0.0', null) });
  install(root, 'node_modules/demo', 'demo', '1.0.0', 'ISC');
  const report = audit(root);
  assert.equal(report.packages[0].license.declaredInLockfile, 'UNKNOWN');
  assert.equal(report.packages[0].license.declaredInInstalledPackage, 'ISC');
  assert.equal(report.packages[0].license.declaration, 'ISC');
  assert.equal(report.packages[0].license.evidence, 'PRESENT');
});

test('missing installed packages and missing declarations remain UNKNOWN', (t) => {
  const { root } = fixture(t, {
    'node_modules/missing': registry('1.0.0', null),
    'node_modules/no-declaration': registry('1.0.0', null),
  });
  install(root, 'node_modules/no-declaration', 'no-declaration', '1.0.0', null);
  const report = audit(root, 1);
  assert.equal(report.inventoryStatus, 'PARTIAL');
  assert.ok(reasons(report).includes('INSTALLED_METADATA_UNAVAILABLE'));
  for (const item of report.packages) {
    assert.equal(item.license.declaration, 'UNKNOWN');
    assert.equal(item.license.evidence, 'UNKNOWN');
  }
});

test('conflicting license declarations cannot be presented as resolved evidence', (t) => {
  const { root } = fixture(t, { 'node_modules/demo': registry() });
  install(root, 'node_modules/demo', 'demo', '1.0.0', 'Apache-2.0');
  const report = audit(root, 1);
  assert.ok(reasons(report).includes('LICENSE_DECLARATION_CONFLICT'));
  assert.equal(report.packages[0].license.declaration, 'UNKNOWN');
  assert.equal(report.packages[0].license.evidence, 'CONFLICT');
});

test('a different installed version cannot supply matching license evidence', (t) => {
  const { root } = fixture(t, { 'node_modules/demo': registry() });
  install(root, 'node_modules/demo', 'demo', '9.9.9');
  const report = audit(root, 1);
  assert.equal(report.packages[0].version, '1.0.0');
  assert.equal(report.packages[0].installedMetadataStatus, 'IDENTITY_MISMATCH');
  assert.equal(report.packages[0].license.evidence, 'UNKNOWN');
  assert.ok(reasons(report).includes('INSTALLED_IDENTITY_MISMATCH'));
});

test('lockfile locator credentials and query values never appear in output', (t) => {
  const resolved = 'https://[REDACTED_SECRET]:[REDACTED_SECRET]@registry.example.invalid/synthetic.tgz?token=[REDACTED_SECRET]#[REDACTED_SECRET]';
  const { root } = fixture(t, { 'node_modules/demo': { ...registry(), resolved } });
  install(root, 'node_modules/demo', 'demo');
  const report = audit(root, 1);
  assert.equal(report.packages[0].source.origin, 'https://registry.example.invalid');
  assert.equal(report.packages[0].source.locatorSha256, createHash('sha256').update(resolved).digest('hex'));
  assert.ok(reasons(report).includes('SOURCE_LOCATOR_REDACTED'));
  assert.ok(!JSON.stringify(report).includes('REDACTED_SECRET'));
});

test('workspace packages are recorded without following workspace links or reading source', (t) => {
  const { root } = fixture(t, {
    'packages/contracts': { name: '@synthetic/contracts', version: '1.0.0' },
    'node_modules/@synthetic/contracts': { resolved: 'packages/contracts', link: true },
  }, { workspaces: ['packages/contracts'] });
  write(root, 'packages/contracts/package.json', 'NEVER_PUBLISH_NOT_JSON');
  const report = audit(root, 1);
  assert.equal(report.packageCount, 1);
  assert.equal(report.skippedWorkspaceLinks, 1);
  assert.equal(report.packages[0].source.kind, 'WORKSPACE');
  assert.equal(report.packages[0].installedMetadataStatus, 'NOT_INSPECTED');
  assert.equal(report.packages[0].license.evidence, 'UNKNOWN');
  assert.ok(!JSON.stringify(report).includes('NEVER_PUBLISH'));
});

test('unsafe lock paths and link targets are refused without opening protected files', (t) => {
  const { root } = fixture(t, {
    '../private/NEVER_PUBLISH': registry(),
    'node_modules/demo': { resolved: '../private/NEVER_PUBLISH', link: true },
  });
  write(root, 'private/NEVER_PUBLISH/package.json', 'NEVER_PUBLISH_CONTENT');
  const report = audit(root, 1);
  assert.ok(reasons(report).includes('UNSUPPORTED_LOCK_PATH'));
  assert.ok(reasons(report).includes('UNREVIEWED_LINK_TARGET'));
  assert.equal(report.packageCount, 0);
  assert.ok(!JSON.stringify(report).includes('NEVER_PUBLISH'));
});

test('package-directory symlinks cannot redirect reads outside node_modules', (t) => {
  const { root } = fixture(t, { 'node_modules/demo': registry() });
  write(root, 'private/NEVER_PUBLISH/package.json', 'NEVER_PUBLISH_CONTENT');
  mkdirSync(join(root, 'node_modules'));
  symlinkSync(join(root, 'private/NEVER_PUBLISH'), join(root, 'node_modules/demo'), 'dir');
  const report = audit(root, 1);
  assert.equal(report.packages[0].installedMetadataStatus, 'UNSAFE');
  assert.ok(reasons(report).includes('UNSAFE_PACKAGE_PATH'));
  assert.ok(!JSON.stringify(report).includes('NEVER_PUBLISH'));
});

test('license symlinks are not opened or hashed', (t) => {
  const { root } = fixture(t, { 'node_modules/demo': registry() });
  install(root, 'node_modules/demo', 'demo');
  rmSync(join(root, 'node_modules/demo/LICENSE'));
  write(root, 'private/NEVER_PUBLISH.txt', 'NEVER_PUBLISH_CONTENT');
  symlinkSync(join(root, 'private/NEVER_PUBLISH.txt'), join(root, 'node_modules/demo/LICENSE'));
  const report = audit(root, 1);
  assert.equal(report.packages[0].evidenceFiles.length, 0);
  assert.equal(report.packages[0].license.evidence, 'UNKNOWN');
  assert.ok(reasons(report).includes('LICENSE_FILE_UNAVAILABLE'));
  assert.ok(!JSON.stringify(report).includes('NEVER_PUBLISH'));
});

test('non-registry locators are not followed or silently treated as registry dependencies', (t) => {
  const { root } = fixture(t, {
    'node_modules/demo': { ...registry(), resolved: 'file:private/NEVER_PUBLISH' },
  });
  write(root, 'node_modules/demo/package.json', 'NEVER_PUBLISH_CONTENT');
  const report = audit(root, 1);
  assert.equal(report.packages[0].source.kind, 'NON_REGISTRY');
  assert.equal(report.packages[0].installedMetadataStatus, 'NOT_INSPECTED');
  assert.ok(reasons(report).includes('NON_REGISTRY_SOURCE'));
  assert.ok(!JSON.stringify(report).includes('NEVER_PUBLISH'));
});

test('oversized evidence files make coverage partial without copying their contents', (t) => {
  const { root } = fixture(t, { 'node_modules/demo': registry() });
  install(root, 'node_modules/demo', 'demo');
  write(root, 'node_modules/demo/LICENSE', 'NEVER_PUBLISH'.repeat(100_000));
  const report = audit(root, 1);
  assert.equal(report.packages[0].evidenceFiles.length, 0);
  assert.equal(report.packages[0].license.evidence, 'UNKNOWN');
  assert.ok(reasons(report).includes('LICENSE_FILE_UNAVAILABLE'));
  assert.ok(!JSON.stringify(report).includes('NEVER_PUBLISH'));
});

test('missing integrity and UNLICENSED declarations remain unresolved', (t) => {
  const entry = registry('1.0.0', 'UNLICENSED');
  delete entry.integrity;
  const { root } = fixture(t, { 'node_modules/demo': entry });
  install(root, 'node_modules/demo', 'demo', '1.0.0', 'UNLICENSED');
  const report = audit(root, 1);
  assert.equal(report.packages[0].integrity, 'UNKNOWN');
  assert.equal(report.packages[0].license.evidence, 'UNKNOWN');
  assert.ok(reasons(report).includes('LOCK_INTEGRITY_UNKNOWN'));
  assert.ok(reasons(report).includes('LICENSE_DECLARATION_UNRESOLVED'));
});

test('malformed, unsupported, and oversized lockfiles produce generic blocked diagnostics', (t) => {
  for (const content of [
    'NEVER_PUBLISH_INVALID_JSON',
    JSON.stringify({ lockfileVersion: 1, packages: { '': {} } }),
    JSON.stringify({ lockfileVersion: 3, packages: { '': {} }, padding: 'x'.repeat(2 * 1024 * 1024) }),
  ]) {
    const { root } = fixture(t, {});
    write(root, 'package-lock.json', content);
    const report = audit(root, 2);
    assert.equal(report.inventoryStatus, 'UNAVAILABLE');
    assert.equal(report.reason, 'DEPENDENCY_EVIDENCE_UNAVAILABLE');
    assert.equal(report.releaseDecision, 'RELEASE_BLOCKED');
    assert.ok(!JSON.stringify(report).includes('NEVER_PUBLISH'));
  }
});

test('auditing never executes package entrypoints or lifecycle scripts', (t) => {
  const { root } = fixture(t, { 'node_modules/demo': registry() });
  install(root, 'node_modules/demo', 'demo');
  const marker = join(root, 'SHOULD_NOT_EXIST');
  const malicious = 'require("node:fs").writeFileSync(' + JSON.stringify(marker) + ', "executed");';
  write(root, 'node_modules/demo/index.js', malicious);
  write(root, 'node_modules/demo/package.json', JSON.stringify({
    name: 'demo', version: '1.0.0', license: 'MIT', main: './index.js',
    scripts: { preinstall: 'node index.js', postinstall: 'node index.js' },
  }));
  const report = audit(root);
  assert.equal(report.packages[0].license.evidence, 'PRESENT');
  assert.equal(existsSync(marker), false);
});

test('malformed declared integrity cannot be reported as usable lock evidence', (t) => {
  const { root } = fixture(t, { 'node_modules/demo': { ...registry(), integrity: 'sha512-YQ==' } });
  install(root, 'node_modules/demo', 'demo');
  const report = audit(root, 1);
  assert.equal(report.packages[0].integrity, 'UNKNOWN');
  assert.ok(reasons(report).includes('LOCK_INTEGRITY_UNKNOWN'));
});

test('imported audit errors also keep input content and paths out of diagnostics', async (t) => {
  const { root } = fixture(t, {});
  write(root, 'package-lock.json', 'NEVER_PUBLISH_INVALID_JSON');
  const { auditDependencyLicenses } = await import(new URL('../../tools/audit_dependency_licenses.mjs', import.meta.url));
  assert.throws(() => auditDependencyLicenses(root), {
    name: 'Error', message: 'Dependency evidence unavailable',
  });
});
