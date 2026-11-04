#!/usr/bin/env node
/**
 * GitHub branch cleanup with a read-only default.
 *
 * Only considers same-repository PR branches whose current head equals an
 * already-merged PR head; excludes every branch with any open or unmerged PR.
 * Apply mode requires an explicit repository confirmation and a small batch cap.
 * This does not rewrite Git history or touch repository files.
 *
 * GITHUB_TOKEN=... node tools/prune_merged_branches.mjs --repo owner/repo
 * GITHUB_TOKEN=... node tools/prune_merged_branches.mjs --repo owner/repo --apply --confirm owner/repo --limit 10
 */

import {execFile} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir,devNull} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {promisify} from 'node:util';

const executeFile = promisify(execFile);
const API = 'https://api.github.com';
const RESERVED = ['backup/', 'prep/'];

export function selectMergedBranchCandidates(branches, pulls, repository, defaultBranch = 'main') {
  const candidates = [];
  const excluded = [];
  const own = repository.toLowerCase();
  const byHead = new Map();
  const openReferences = new Set();
  // Index once instead of rescanning every PR for every branch. Open stacked
  // PRs protect their BASE as well as their HEAD, including fork contributors.
  for (const pull of pulls) {
    if (pull.head?.repo?.full_name?.toLowerCase() === own) {
      const linked = byHead.get(pull.head.ref) ?? [];
      linked.push(pull);byHead.set(pull.head.ref, linked);
    }
    if (pull.state === 'open') for (const ref of [pull.head, pull.base]) {
      if (ref?.ref && (!ref.repo?.full_name || ref.repo.full_name.toLowerCase() === own))
        openReferences.add(ref.ref);
    }
  }

  for (const branch of branches) {
    const name = branch.name;
    const sha = branch.commit?.sha;
    let reason = null;
    let approved = null;
    if (typeof name !== 'string' || !sha) reason = 'missing branch name/SHA';
    else if (name === defaultBranch) reason = 'default branch';
    else if (RESERVED.some(prefix => name.startsWith(prefix))) reason = 'reserved backup/prep';
    else if (branch.protected !== false) reason = 'protected/unknown protection';
    else if (openReferences.has(name)) reason = 'open PR references branch';
    else {
      const linked = byHead.get(name) ?? [];
      if (linked.length === 0) reason = 'no same-repo PR';
      else if (linked.some(p => p.state === 'open')) reason = 'open PR exists';
      else if (linked.some(p => !p.merged_at)) reason = 'unmerged PR shares branch';
      else approved = linked.find(p => p.merged_at && p.head?.sha === sha && p.state === 'closed');
      if (!reason && !approved) reason = 'branch changed after merged PR';
    }
    if (reason) excluded.push({name, reason});
    else candidates.push({name, sha, mergedPr: approved.number});
  }
  candidates.sort((a, b) => a.name.localeCompare(b.name));
  excluded.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return {candidates, excluded};
}

export function parseArguments(args) {
  const opts = {repo: '', apply: false, confirm: '', limit: null};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--repo') opts.repo = args[++i] ?? '';
    else if (args[i] === '--apply') opts.apply = true;
    else if (args[i] === '--confirm') opts.confirm = args[++i] ?? '';
    else if (args[i] === '--limit') opts.limit = Number(args[++i]);
    else throw new Error(`Unknown argument: ${args[i]}`);
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(opts.repo)) {
    throw new Error('Pass --repo owner/repo');
  }
  if (opts.apply && (opts.confirm !== opts.repo ||
      !Number.isInteger(opts.limit) || opts.limit < 1 || opts.limit > 20)) {
    throw new Error('--apply requires --confirm owner/repo and --limit 1..20');
  }
  if (!opts.apply && (opts.confirm || opts.limit !== null)) {
    throw new Error('--confirm and --limit are only valid with --apply');
  }
  return opts;
}

/** Delete only if the Git server still observes the reviewed SHA. REST ref
 * DELETE has no expected-SHA condition and can erase a concurrent new commit.
 * A fresh bare repository avoids touching the operator's worktree or hooks.
 * execute is the process boundary; tests substitute a local receive-pack only.
 */
export async function deleteBranchWithLease({repository,name,sha,token}, execute = executeFile) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '')
    || repository.split('/').some(part => part === '.' || part === '..')
    || typeof name !== 'string' || !name || name.startsWith('-')
    || !/^[0-9a-f]{40}$/.test(sha ?? '') || typeof token !== 'string' || !token)
    throw new Error('Invalid branch deletion identity; nothing deleted');
  const directory = await mkdtemp(join(tmpdir(), 'hufs-branch-lease-'));
  const ref = `refs/heads/${name}`;
  const env = {};
  for (const key of ['PATH','SystemRoot','WINDIR','COMSPEC','PATHEXT','TEMP','TMP'])
    if (process.env[key] !== undefined) env[key] = process.env[key];
  Object.assign(env, {HOME: directory, XDG_CONFIG_HOME: directory,
    GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'never', GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: 'AUTHORIZATION: basic ' + Buffer.from(`x-access-token:${token}`).toString('base64')});
  const run = args => execute('git', args, {cwd: directory, env,
    windowsHide: true, timeout: 15000, maxBuffer: 64 * 1024});
  try {
    await run(['init','--bare','--quiet','--template=']);
    await run(['check-ref-format',ref]);
    await run(['-c',`core.hooksPath=${devNull}`,'-c','credential.helper=',
      '-c','protocol.allow=never','-c','protocol.https.allow=always',
      '-c','http.followRedirects=false','push','--porcelain','--no-verify',
      `--force-with-lease=${ref}:${sha}`,`https://github.com/${repository}.git`, ':' + ref]);
  } catch {
    // Driver errors can carry credentials/remote diagnostics. Never echo them.
    throw new Error('Branch lease deletion unconfirmed; stop and re-audit the remote ref');
  } finally {await rm(directory, {recursive: true, force: true});}
}

async function main() {
  const opts = parseArguments(process.argv.slice(2));
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is required to read a private repository');
  const root = `/repos/${opts.repo}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'hufs-one-safe-branch-audit',
  };
  async function request(path) {
    const response = await fetch(`${API}${path}`, {method: 'GET', headers, redirect: 'error'});
    if (!response.ok) throw new Error(`GET ${path} failed: HTTP ${response.status}`);
    return response.json();
  }
  async function pages(path) {
    const result = [];
    for (let page = 1; page <= 100; page++) {
      const separator = path.includes('?') ? '&' : '?';
      const values = await request(`${path}${separator}per_page=100&page=${page}`);
      if (!Array.isArray(values)) throw new Error(`Expected an array from ${path}`);
      result.push(...values);
      if (values.length < 100) return result;
    }
    throw new Error(`Pagination limit reached for ${path}; refusing incomplete audit`);
  }

  const repo = await request(root);
  if (repo.full_name?.toLowerCase() !== opts.repo.toLowerCase()) {
    throw new Error('Repository identity did not match; refusing to continue');
  }
  const [branches, pulls] = await Promise.all([
    pages(`${root}/branches`),
    pages(`${root}/pulls?state=all`),
  ]);
  const {candidates, excluded} = selectMergedBranchCandidates(
    branches, pulls, repo.full_name, repo.default_branch,
  );
  console.log(JSON.stringify({mode: opts.apply ? 'APPLY' : 'DRY_RUN',
    repository: repo.full_name, branches: branches.length, pulls: pulls.length,
    candidates: candidates.length, protectedOrUnverified: excluded.length}, null, 2));
  for (const c of candidates) console.log(`CANDIDATE ${c.name} ${c.sha} PR#${c.mergedPr}`);

  if (!opts.apply) return;
  // Limit intentionally small: repeated explicit operator approval is required.
  const batch = candidates.slice(0, opts.limit);
  console.log(`DELETE_BATCH ${batch.length} / ${candidates.length}`);
  for (const c of batch) {
    // Re-run all safety rules on current PR metadata before the atomic SHA lease.
    // PR creation and Git ref updates are separate services; no cross-service
    // transaction is claimed, and protected branches remain the final guard.
    const [live, currentPRs, mergedPR] = await Promise.all([
      request(`${root}/branches/${encodeURIComponent(c.name)}`),
      pages(`${root}/pulls?state=all`),
      request(`${root}/pulls/${c.mergedPr}`),
    ]);
    if (live.name !== c.name || live.commit?.sha !== c.sha || live.protected !== false ||
        !selectMergedBranchCandidates([live], currentPRs, repo.full_name, repo.default_branch)
          .candidates.some(candidate => candidate.name === c.name && candidate.sha === c.sha)
        || mergedPR.state !== 'closed' || !mergedPR.merged_at ||
        mergedPR.head?.sha !== c.sha || mergedPR.head?.ref !== c.name ||
        mergedPR.head?.repo?.full_name?.toLowerCase() !== repo.full_name.toLowerCase()) {
      throw new Error(`Safety preflight changed for ${c.name}; no further deletions attempted`);
    }
    await deleteBranchWithLease({repository: repo.full_name, name: c.name, sha: c.sha, token});
    console.log(`DELETED ${c.name} ${c.sha} PR#${c.mergedPr}`);
  }
}

const invoked = process.argv[1];
if (invoked && import.meta.url === pathToFileURL(resolve(invoked)).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
