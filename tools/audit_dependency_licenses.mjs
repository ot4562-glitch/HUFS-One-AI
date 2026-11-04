/**
 * #89 offline dependency/license evidence for a selected checkout.
 * Reads only package-lock.json and bounded, non-symlink package metadata/license
 * files under node_modules. Never installs, imports, executes or fetches packages.
 * Declarations and hashes are review evidence, not license or release approval.
 */
import { createHash } from 'node:crypto';
import {
  closeSync, constants, fstatSync, lstatSync, openSync, opendirSync, readSync, realpathSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_LOCK_BYTES = 2 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_LICENSE_BYTES = 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_PACKAGES = 2000;
const MAX_LICENSE_FILES = 32;
const PROTECTED = new Set([
  'csv', 'private', 'local_only', 'real5', 'student_records', 'forms_raw',
  'private_identity_map', 'secrets', 'credentials', 'backups', 'exports',
]);
const NAME_PART = '[a-z0-9][a-z0-9._-]*';
const PACKAGE_NAME = new RegExp('^(?:@' + NAME_PART + '/)?' + NAME_PART + '$');
const INSTALL_PATH = new RegExp('^node_modules/(?:@' + NAME_PART + '/)?' + NAME_PART
  + '(?:/node_modules/(?:@' + NAME_PART + '/)?' + NAME_PART + ')*$');
const LICENSE_FILE = /^(license|licence|copying|notice)(?:$|[._-][a-z0-9._-]{1,80}$)/i;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SCOPE = 'OFFLINE_LOCKFILE_AND_INSTALLED_PACKAGE_METADATA';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const unknown = 'UNKNOWN';

function unavailable(code = 'UNAVAILABLE') {
  return Object.assign(new Error('Dependency evidence unavailable'), { code });
}

function safeRelative(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 1024
    && !/[\\\0:]/.test(value) && value.split('/').every((part) =>
      part.length > 0 && part !== '.' && part !== '..' && !PROTECTED.has(part.toLowerCase()));
}

function safePath(root, relative, directory = false) {
  if (!safeRelative(relative)) throw unavailable('UNSAFE');
  const parts = relative.split('/');
  let target = root;
  for (let index = 0; index < parts.length; index += 1) {
    target = join(target, parts[index]);
    const stat = lstatSync(target);
    if (stat.isSymbolicLink()) throw unavailable('UNSAFE');
    const needsDirectory = index < parts.length - 1 || directory;
    if (needsDirectory ? !stat.isDirectory() : !stat.isFile()) throw unavailable('UNSAFE');
  }
  return target;
}

function readBounded(root, relative, limit, budget) {
  const path = safePath(root, relative);
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size > limit || budget.bytes + stat.size > MAX_TOTAL_BYTES) {
      throw unavailable();
    }
    // One extra byte detects a file that grew after fstat without unbounded reads.
    const buffer = Buffer.alloc(stat.size + 1);
    let read = 0;
    while (read < buffer.length) {
      const count = readSync(descriptor, buffer, read, buffer.length - read, null);
      if (!count) break;
      read += count;
    }
    if (read !== stat.size) throw unavailable();
    budget.bytes += read;
    return buffer.subarray(0, read);
  } finally {
    closeSync(descriptor);
  }
}

function parseJson(bytes) {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

function declaration(value) {
  // Record bounded declarations, without guessing a license from file contents.
  // This is not a complete SPDX-expression validator or a legal determination.
  if (typeof value !== 'string' || value.length > 200
      || !/^[A-Za-z0-9.+() -]+$/.test(value) || /^SEE LICEN[CS]E IN /i.test(value)) return unknown;
  return value.trim().replace(/ +/g, ' ') || unknown;
}

function integrityEvidence(value) {
  if (typeof value !== 'string' || value.length > 512) return unknown;
  const lengths = { sha1: 20, sha256: 32, sha384: 48, sha512: 64 };
  const valid = value.split(' ').every((token) => {
    const match = /^(sha1|sha256|sha384|sha512)-([A-Za-z0-9+/]+={0,2})$/.exec(token);
    if (!match) return false;
    const digest = Buffer.from(match[2], 'base64');
    return digest.length === lengths[match[1]] && digest.toString('base64') === match[2];
  });
  return valid ? value : unknown;
}

function sourceEvidence(entry, report) {
  if (typeof entry.resolved !== 'string' || entry.resolved.length > 4096) {
    report('NON_REGISTRY_SOURCE');
    return { kind: 'NON_REGISTRY' };
  }
  const locatorSha256 = hash(entry.resolved);
  try {
    const url = new URL(entry.resolved);
    if (url.protocol !== 'https:') throw unavailable();
    if (url.username || url.password || url.search || url.hash) report('SOURCE_LOCATOR_REDACTED');
    // Origins exclude userinfo, paths, query strings and fragments.
    return { kind: 'REGISTRY', origin: url.origin, locatorSha256 };
  } catch {
    report('NON_REGISTRY_SOURCE');
    return { kind: 'NON_REGISTRY', locatorSha256 };
  }
}

function licenseFiles(root, key, budget, report) {
  const directory = opendirSync(safePath(root, key, true));
  const names = [];
  let count = 0;
  try {
    for (let entry = directory.readSync(); entry; entry = directory.readSync()) {
      if (++count > 5000) throw unavailable();
      if (LICENSE_FILE.test(entry.name)) {
        names.push(entry.name);
        if (names.length > MAX_LICENSE_FILES) throw unavailable();
      }
    }
  } finally {
    directory.closeSync();
  }
  const evidence = [];
  let complete = true;
  for (const name of names.sort()) {
    try {
      const relative = key + '/' + name;
      const data = readBounded(root, relative, MAX_LICENSE_BYTES, budget);
      if (!data.length) throw unavailable();
      evidence.push({
        kind: /^notice/i.test(name) ? 'NOTICE' : /^copying/i.test(name) ? 'COPYING' : 'LICENSE',
        fileRef: hash(relative), sha256: hash(data), bytes: data.length,
      });
    } catch {
      complete = false;
      report('LICENSE_FILE_UNAVAILABLE');
    }
  }
  if (!evidence.length) {
    complete = false;
    report('LICENSE_FILES_UNAVAILABLE');
  }
  return { evidence, complete };
}

function inspectInstalled(root, key, record, budget, report) {
  let installed;
  try {
    const bytes = readBounded(root, key + '/package.json', MAX_MANIFEST_BYTES, budget);
    installed = parseJson(bytes);
    if (!object(installed)) throw unavailable();
    record.installedMetadataSha256 = hash(bytes);
    if (installed.name !== record.name || installed.version !== record.version) {
      record.installedMetadataStatus = 'IDENTITY_MISMATCH';
      report('INSTALLED_IDENTITY_MISMATCH');
      return false;
    }
    record.installedMetadataStatus = 'MATCHED';
    record.license.declaredInInstalledPackage = declaration(installed.license);
  } catch (error) {
    record.installedMetadataStatus = error.code === 'UNSAFE' ? 'UNSAFE' : 'UNAVAILABLE';
    report(error.code === 'UNSAFE' ? 'UNSAFE_PACKAGE_PATH' : 'INSTALLED_METADATA_UNAVAILABLE');
    return false;
  }
  try {
    const files = licenseFiles(root, key, budget, report);
    record.evidenceFiles = files.evidence;
    return files.complete;
  } catch {
    report('LICENSE_FILES_UNAVAILABLE');
    return false;
  }
}

function buildDependencyEvidence(selectedRoot) {
  const requested = resolve(selectedRoot);
  if (lstatSync(requested).isSymbolicLink() || !lstatSync(requested).isDirectory()) throw unavailable();
  const root = realpathSync(requested);
  const budget = { bytes: 0 };
  const bytes = readBounded(root, 'package-lock.json', MAX_LOCK_BYTES, budget);
  const lock = parseJson(bytes);
  if (!object(lock) || ![2, 3].includes(lock.lockfileVersion) || !object(lock.packages)
      || !object(lock.packages[''])) throw unavailable();
  const keys = Object.keys(lock.packages).filter((key) => key !== '').sort();
  if (keys.length > MAX_PACKAGES) throw unavailable();
  const rootEntry = lock.packages[''];
  const findings = [];
  const packages = [];
  const addFinding = (reason, key = '') => findings.push({ reason, packageRef: key ? hash(key) : null });
  const workspaces = new Set();
  if (rootEntry.workspaces !== undefined) {
    if (!Array.isArray(rootEntry.workspaces)) addFinding('UNSUPPORTED_WORKSPACE_DECLARATION');
    else for (const path of rootEntry.workspaces) {
      if (safeRelative(path) && !/[*?[\]]/.test(path) && !path.startsWith('node_modules/')) workspaces.add(path);
      else addFinding('UNSUPPORTED_WORKSPACE_DECLARATION');
    }
  }
  const direct = new Set();
  for (const category of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const entries = rootEntry[category];
    if (entries === undefined) continue;
    if (!object(entries)) addFinding('ROOT_DEPENDENCIES_UNAVAILABLE');
    else for (const name of Object.keys(entries)) direct.add('node_modules/' + name);
  }
  let skippedWorkspaceLinks = 0;
  for (const key of keys) {
    const report = (reason) => addFinding(reason, key);
    const entry = lock.packages[key];
    const isWorkspace = workspaces.has(key);
    if (!safeRelative(key) || (!isWorkspace && !INSTALL_PATH.test(key))) {
      report('UNSUPPORTED_LOCK_PATH');
      continue;
    }
    if (!object(entry)) {
      report('UNSUPPORTED_PACKAGE_ENTRY');
      continue;
    }
    if (entry.link === true) {
      if (!isWorkspace && workspaces.has(entry.resolved) && object(lock.packages[entry.resolved])) {
        skippedWorkspaceLinks += 1;
      } else report('UNREVIEWED_LINK_TARGET');
      continue;
    }
    const installedName = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
    const name = entry.name ?? (isWorkspace ? unknown : installedName);
    const validName = typeof name === 'string' && name.length <= 214 && PACKAGE_NAME.test(name);
    const validVersion = typeof entry.version === 'string' && entry.version.length <= 128 && VERSION.test(entry.version);
    const integrity = integrityEvidence(entry.integrity);
    const record = {
      packageRef: hash(key), name: validName ? name : unknown,
      version: validVersion ? entry.version : unknown,
      direct: direct.has(key), usage: entry.dev === true ? 'DEVELOPMENT_ONLY' : 'RUNTIME_OR_SHARED',
      optional: entry.optional === true, integrity,
      source: isWorkspace ? { kind: 'WORKSPACE' } : sourceEvidence(entry, report),
      installedMetadataStatus: 'NOT_INSPECTED',
      license: { declaredInLockfile: declaration(entry.license), declaredInInstalledPackage: unknown,
        declaration: unknown, evidence: unknown },
      evidenceFiles: [],
    };
    if (!validName || !validVersion) report('LOCK_IDENTITY_UNKNOWN');
    let filesComplete = false;
    if (isWorkspace) report('WORKSPACE_RIGHTS_NOT_VERIFIED');
    else {
      if (integrity === unknown) report('LOCK_INTEGRITY_UNKNOWN');
      if (record.source.kind === 'REGISTRY' && validName && validVersion) {
        filesComplete = inspectInstalled(root, key, record, budget, report);
      }
    }
    const fromLock = record.license.declaredInLockfile;
    const fromInstalled = record.license.declaredInInstalledPackage;
    if (fromLock !== unknown && fromInstalled !== unknown && fromLock !== fromInstalled) {
      record.license.evidence = 'CONFLICT';
      report('LICENSE_DECLARATION_CONFLICT');
    } else {
      record.license.declaration = fromLock !== unknown ? fromLock : fromInstalled;
      if ([unknown, 'UNLICENSED', 'NONE', 'NOASSERTION'].includes(record.license.declaration.toUpperCase())) {
        report('LICENSE_DECLARATION_UNRESOLVED');
      } else if (record.installedMetadataStatus === 'MATCHED' && filesComplete) {
        record.license.evidence = 'PRESENT';
      }
    }
    packages.push(record);
  }
  return {
    schemaVersion: 1, scope: SCOPE, lockfileVersion: lock.lockfileVersion, lockfileSha256: hash(bytes),
    inventoryStatus: findings.length ? 'PARTIAL' : 'COMPLETE_WITHIN_SCOPE',
    lockEntryCount: keys.length, packageCount: packages.length, skippedWorkspaceLinks,
    packages, findings,
    gates: {
      installedBytesMatchRegistryIntegrity: 'NOT_VERIFIED',
      completeReleaseImageAndRuntimeSbom: 'NOT_VERIFIED',
      licenseObligationsAndAssetFontModelRights: 'NOT_VERIFIED',
      vulnerabilityAndProvenanceReview: 'NOT_RUN',
      independentCurrentHeadReleaseApproval: 'NOT_VERIFIED',
    },
    releaseDecision: 'RELEASE_BLOCKED',
  };
}

export function auditDependencyLicenses(selectedRoot) {
  try {
    return buildDependencyEvidence(selectedRoot);
  } catch {
    // The importable API has the same redaction boundary as the CLI.
    throw unavailable();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 0 && (args.length !== 2 || args[0] !== '--root' || !args[1])) throw unavailable();
    const root = args.length ? args[1] : dirname(dirname(fileURLToPath(import.meta.url)));
    const report = auditDependencyLicenses(root);
    process.stdout.write(JSON.stringify(report) + '\n');
    process.exitCode = report.inventoryStatus === 'COMPLETE_WITHIN_SCOPE' ? 0 : 1;
  } catch {
    process.stdout.write(JSON.stringify({
      schemaVersion: 1, scope: SCOPE, inventoryStatus: 'UNAVAILABLE',
      reason: 'DEPENDENCY_EVIDENCE_UNAVAILABLE', releaseDecision: 'RELEASE_BLOCKED',
    }) + '\n');
    process.exitCode = 2;
  }
}
