import test from 'node:test';
import assert from 'node:assert/strict';
import {parseArguments, selectMergedBranchCandidates} from '../prune_merged_branches.mjs';

const repo = 'example/private-repo';
const branch = (name, sha = 'abc', protectedBranch = false) =>
  ({name, commit: {sha}, protected: protectedBranch});
const pr = (name, {sha = 'abc', merged = true, state = 'closed', headRepo = repo} = {}) =>
  ({number: 42, state, merged_at: merged ? '2026-11-01T00:00:00Z' : null,
    head: {ref: name, sha, repo: {full_name: headRepo}}});

test('only current same-repo merged head is a deletion candidate', () => {
  const result = selectMergedBranchCandidates([branch('main'), branch('feat/done')],
    [pr('feat/done')], repo, 'main');
  assert.deepEqual(result.candidates, [{name: 'feat/done', sha: 'abc', mergedPr: 42}]);
  assert.equal(result.excluded.find(x => x.name === 'main')?.reason, 'default branch');
});

test('fail closed on active, unmerged, changed, protected, absent and fork heads', () => {
  const cases = [
    [branch('feat/a'), [pr('feat/a', {state:'open',merged:false})]],
    [branch('feat/b'), [pr('feat/b', {merged:false})]],
    [branch('feat/c', 'new'), [pr('feat/c')]],
    [branch('feat/d','abc',true), [pr('feat/d')]],
    [branch('feat/e'), []],
    [branch('feat/f'), [pr('feat/f', {headRepo:'other/fork'})]],
    [branch('backup/precious'), [pr('backup/precious')]],
    [branch('prep/stack'), [pr('prep/stack')]],
  ];
  for (const [b, prs] of cases) {
    const result = selectMergedBranchCandidates([b], prs, repo, 'main');
    assert.equal(result.candidates.length, 0, `unexpected deletion: ${b.name}`);
    assert.equal(result.excluded.length, 1);
  }
});

test('reused branch with an unmerged PR is preserved even if another PR merged', () => {
  const result = selectMergedBranchCandidates([branch('feat/reused')],
    [pr('feat/reused'), pr('feat/reused', {merged:false})], repo, 'main');
  assert.equal(result.candidates.length, 0);
});

test('apply requires exact repository confirmation and a batch of at most 20', () => {
  assert.deepEqual(parseArguments(['--repo',repo]),
    {repo,apply:false,confirm:'',limit:null});
  assert.deepEqual(parseArguments(['--repo',repo,'--apply','--confirm',repo,'--limit','10']),
    {repo,apply:true,confirm:repo,limit:10});
  for (const args of [
    ['--repo',repo,'--apply'],
    ['--repo',repo,'--apply','--confirm',repo,'--limit','21'],
    ['--repo',repo,'--apply','--confirm','other/repo','--limit','3'],
    ['--repo',repo,'--limit','5'],
    ['--repo','bad repo'],
  ]) assert.throws(() => parseArguments(args));
});

test('preserves a merged branch used as an open stacked PR base', () => {
  for (const headRepo of [repo, 'other/fork']) {
    const stacked = {...pr('feat/child', {state: 'open', merged: false, headRepo}),
      number: 43, base: {ref: 'feat/parent', repo: {full_name: repo}}};
    const result = selectMergedBranchCandidates([branch('feat/parent')],
      [pr('feat/parent'), stacked], repo, 'main');
    assert.equal(result.candidates.length, 0);
    assert.equal(result.excluded.length, 1);
  }
});

test('unrelated repository base names and closed descendants do not prevent cleanup', () => {
  for (const [state, baseRepo] of [['open', 'other/repo'], ['closed', repo]]) {
    const unrelated = {...pr('feat/child', {state, merged: false}), number: 43,
      base: {ref: 'feat/parent', repo: {full_name: baseRepo}}};
    assert.equal(selectMergedBranchCandidates([branch('feat/parent')],
      [pr('feat/parent'), unrelated], repo, 'main').candidates.length, 1);
  }
});

test('lease deletion removes only the independently observed unchanged ref', async () => {
  const fixture = await localGitFixture();
  try {
    await cleanup.deleteBranchWithLease({repository: repo, name: 'feat/done',
      sha: fixture.original, token: 'SYNTHETIC-ONLY'}, fixture.execute);
    assert.equal(await fixture.exists(), false);
  } finally {await fixture.close();}
});

test('lease deletion preserves a concurrent new commit and hides driver diagnostics', async () => {
  const fixture = await localGitFixture();
  try {
    const race = async (command, args, options) => {
      if (args.includes('push')) await fixture.advance();
      return fixture.execute(command, args, options);
    };
    await assert.rejects(() => cleanup.deleteBranchWithLease({repository: repo,
      name: 'feat/done', sha: fixture.original, token: 'SYNTHETIC-ONLY'}, race),
    error => !error.message.includes('SYNTHETIC-ONLY'));
    assert.equal(await fixture.head(), fixture.changed);
  } finally {await fixture.close();}
});

test('lease deletion rejects unsafe identity arguments without launching git', async () => {
  for (const overrides of [{repository: '../..'}, {name: '-unsafe'}, {sha: 'unknown'}, {token: ''}]) {
    let launches = 0;
    await assert.rejects(() => cleanup.deleteBranchWithLease({repository: repo,
      name: 'feat/done', sha: 'a'.repeat(40), token: 'SYNTHETIC-ONLY', ...overrides},
    async () => {launches++; throw Error('Unexpected process');}));
    assert.equal(launches, 0);
  }
});

// Replace only the network endpoint with a disposable local Git server; the
// actual git receive-pack enforces the lease and its final ref is asserted.
import * as cleanup from '../prune_merged_branches.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const executeFile = promisify(execFile);
async function localGitFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'hufs-branch-lease-test-'));
  const remote = join(directory, 'remote.git');
  const env = {...process.env, GIT_AUTHOR_NAME: 'Synthetic audit',
    GIT_AUTHOR_EMAIL: 'audit@example.test', GIT_COMMITTER_NAME: 'Synthetic audit',
    GIT_COMMITTER_EMAIL: 'audit@example.test'};
  const git = async (...args) => (await executeFile('git', args,
    {cwd: directory, env, timeout: 10000})).stdout.trim();
  try {
    await git('init', '--bare', '--quiet', remote);
    const empty = join(directory, 'empty-tree');await writeFile(empty, '');
    const tree = await git('--git-dir', remote, 'hash-object', '-t', 'tree', '-w', empty);
    const original = await git('--git-dir', remote, 'commit-tree', tree, '-m', 'synthetic original');
    const changed = await git('--git-dir', remote, 'commit-tree', tree, '-p', original, '-m', 'synthetic concurrent work');
    await git('--git-dir', remote, 'update-ref', 'refs/heads/feat/done', original);
    return {original, changed,
      execute: async (command, args, options) => {
        assert.equal(command, 'git');
        assert.equal(options.env.GIT_TERMINAL_PROMPT, '0');
        assert.equal(options.env.GIT_CONFIG_NOSYSTEM, '1');
        assert.equal(options.env.GITHUB_TOKEN, undefined);
        assert.ok(args.every(arg => !arg.includes('SYNTHETIC-ONLY')));
        const localArgs = args.map(arg => arg === `https://github.com/${repo}.git` ? remote
          : arg === 'protocol.https.allow=always' ? 'protocol.file.allow=always' : arg);
        return executeFile(command, localArgs, options);
      },
      advance: () => git('--git-dir', remote, 'update-ref', 'refs/heads/feat/done', changed, original),
      head: () => git('--git-dir', remote, 'rev-parse', 'refs/heads/feat/done'),
      exists: async () => {try {await git('--git-dir', remote, 'show-ref', '--verify', 'refs/heads/feat/done');return true;}catch {return false;}},
      close: () => rm(directory, {recursive: true, force: true}),
    };
  } catch (error) {await rm(directory, {recursive: true, force: true});throw error;}
}

test('live preflight refuses a descendant PR opened after the initial inventory', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hufs-preflight-test-'));
  const harness = join(directory, 'api-replay.mjs');
  const marker = join(directory, 'unsafe-delete');
  try {
    await writeFile(harness, `import {writeFile} from 'node:fs/promises';
const repo=${JSON.stringify(repo)}, marker=${JSON.stringify(marker)};
let inventories=0;
const branch={name:'feat/done',commit:{sha:'a'.repeat(40)},protected:false};
const merged={number:42,state:'closed',merged_at:'2026-11-01T00:00:00Z',head:{ref:'feat/done',sha:'a'.repeat(40),repo:{full_name:repo}}};
const stacked={number:43,state:'open',merged_at:null,head:{ref:'feat/child',repo:{full_name:'other/fork'}},base:{ref:'feat/done',repo:{full_name:repo}}};
globalThis.fetch=async(input,init)=>{
 const u=new URL(input),p=u.pathname;
 let data;
 if(init.method==='DELETE'){await writeFile(marker,'UNSAFE');return new Response(null,{status:204});}
 if(p==='/repos/'+repo)data={full_name:repo,default_branch:'main',owner:{login:'example'}};
 else if(p.endsWith('/branches'))data=[branch];
 else if(p.includes('/branches/'))data=branch;
 else if(p.endsWith('/pulls/42'))data=merged;
 else if(p.endsWith('/pulls'))data=u.searchParams.get('state')==='all'?(++inventories===1?[merged]:[merged,stacked]):[];
 else throw Error('Unexpected synthetic API route');
 return new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
};`);
    await assert.rejects(() => executeFile(process.execPath, ['--import', harness,
      fileURLToPath(new URL('../prune_merged_branches.mjs', import.meta.url)),
      '--repo', repo, '--apply', '--confirm', repo, '--limit', '1'],
    {env: {...process.env, GITHUB_TOKEN: 'SYNTHETIC-ONLY'}, timeout: 10000}),
    error => /Safety preflight changed/.test(error.stderr));
    await assert.rejects(() => readFile(marker), {code: 'ENOENT'});
  } finally {await rm(directory, {recursive: true, force: true});}
});

test('import from another file with the same basename does not execute the CLI', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hufs-import-test-'));
  try {
    const importer = join(directory, 'prune_merged_branches.mjs');
    await writeFile(importer, `import ${JSON.stringify(new URL('../prune_merged_branches.mjs', import.meta.url).href)};\nconsole.log('IMPORTED');\n`);
    const result = await executeFile(process.execPath, [importer],
      {env: {...process.env, GITHUB_TOKEN: ''}, timeout: 10000});
    assert.equal(result.stdout.trim(), 'IMPORTED');
    assert.equal(result.stderr, '');
  } finally {await rm(directory, {recursive: true, force: true});}
});
