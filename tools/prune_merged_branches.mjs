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

const API = 'https://api.github.com';
const RESERVED = ['backup/', 'prep/'];

export function selectMergedBranchCandidates(branches, pulls, repository, defaultBranch = 'main') {
  const candidates = [];
  const excluded = [];
  const isOwnHead = (p, name) => p.head?.ref === name &&
    p.head?.repo?.full_name?.toLowerCase() === repository.toLowerCase();

  for (const branch of branches) {
    const name = branch.name;
    const sha = branch.commit?.sha;
    let reason = null;
    let approved = null;
    if (typeof name !== 'string' || !sha) reason = 'missing branch name/SHA';
    else if (name === defaultBranch) reason = 'default branch';
    else if (RESERVED.some(prefix => name.startsWith(prefix))) reason = 'reserved backup/prep';
    else if (branch.protected !== false) reason = 'protected/unknown protection';
    else {
      const linked = pulls.filter(p => isOwnHead(p, name));
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

function encodeRef(branch) {
  return branch.split('/').map(encodeURIComponent).join('/');
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
  async function request(path, method = 'GET') {
    const response = await fetch(`${API}${path}`, {method, headers, redirect: 'error'});
    if (!response.ok) throw new Error(`${method} ${path} failed: HTTP ${response.status}`);
    if (method === 'DELETE') return null;
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
    // Recheck both current branch head and every open PR immediately before deletion.
    const [live, openPRs, mergedPR] = await Promise.all([
      request(`${root}/branches/${encodeURIComponent(c.name)}`),
      pages(`${root}/pulls?state=open&head=${encodeURIComponent(repo.owner.login + ':' + c.name)}`),
      request(`${root}/pulls/${c.mergedPr}`),
    ]);
    if (live.name !== c.name || live.commit?.sha !== c.sha || live.protected !== false ||
        openPRs.length > 0 || mergedPR.state !== 'closed' || !mergedPR.merged_at ||
        mergedPR.head?.sha !== c.sha || mergedPR.head?.ref !== c.name ||
        mergedPR.head?.repo?.full_name?.toLowerCase() !== repo.full_name.toLowerCase()) {
      throw new Error(`Safety preflight changed for ${c.name}; no further deletions attempted`);
    }
    await request(`${root}/git/refs/heads/${encodeRef(c.name)}`, 'DELETE');
    console.log(`DELETED ${c.name} ${c.sha} PR#${c.mergedPr}`);
  }
}

const invoked = process.argv[1]?.replace(/\\/g, '/');
if (invoked && import.meta.url.endsWith(`/${invoked.split('/').pop()}`)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
