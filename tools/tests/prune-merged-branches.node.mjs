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
